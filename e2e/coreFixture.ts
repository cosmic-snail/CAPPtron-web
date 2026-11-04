import { expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import Ajv from 'ajv'
import fixture from './fixtures/core-golden.json' with { type: 'json' }
import schemas from './fixtures/core-schemas.json' with { type: 'json' }
import { cardPath } from '../src/api/core/client'

const ajv = new Ajv({ strict: false, validateFormats: false })
const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]),
)
export function validate(name: string, value: unknown) {
  const check = validators[name]!
  expect(check(value), `${name}: ${JSON.stringify(check.errors)}`).toBe(true)
}
export async function coreFixture(
  page: Page,
  options: {
    v1Only?: boolean
    needsReplan?: boolean
    lostSupplementReceipt?: boolean
    parseDelay?: number
    planDelay?: number
    deliveryPending?: boolean
    failed?: boolean
    ncFailure?: boolean
    camWait?: boolean
    camStages?: boolean
    lostCamReceipt?: boolean
    lostReplanReceipt?: boolean
    referenceOnly?: boolean
    /** 开启只读对话 Agent；缺省与 Core 默认一致，/agent 路由不存在。 */
    agent?: boolean
  } = {},
) {
  const feedbackItems: Record<string, unknown>[] = []
  let lostSupplement = !!options.lostSupplementReceipt
  let revision = 0,
    approvedRevision = 0,
    ncApproved = false,
    planningStarted = 0,
    camStarted = 0
  let runGets = 0,
    camGets = 0,
    observe = 0
  let camLost = !!options.lostCamReceipt,
    planLost = !!options.lostReplanReceipt
  const commands: { path: string; body: Record<string, unknown> }[] = []
  const agentMessages: Record<string, unknown>[] = []
  const conversations = new Map<string, { task_id: string; turns: Record<string, unknown>[] }>()
  const roughIndex = fixture.plan.payload.operations.findIndex((op) => op.id === 'ring-op-2')
  const roughStep = (
    fixture.plan.payload.operations.find((op) => op.id === 'ring-op-2')?.attributes as
      { parameters?: { rough_step?: number } } | undefined
  )?.parameters?.rough_step
  const plannedCommands = new Map<string, number>()
  const planRef = () => ({ ...fixture.approved.plans[0]!.plan_ref, revision: approvedRevision })
  const run = () => {
    const waiting = Date.now() - planningStarted < (options.planDelay ?? 0)
    return {
      ...fixture.run,
      needs_replan: !!options.needsReplan,
      run_id: `planning-${revision}`,
      output_revision: waiting || options.failed ? null : revision,
      basis_revision: revision - 1,
      status: waiting ? 'running' : options.failed ? 'failed' : 'completed',
      execution_error: options.failed && !waiting ? { code: 5006, message: '规划服务失败' } : null,
      delivery_state: {
        consumer: 'delivered',
        frontend: waiting || options.deliveryPending ? 'pending' : 'available',
      },
    }
  }
  const cam = () => {
    const elapsed = Date.now() - camStarted
    const running = options.camStages && elapsed < 2600
    return {
      ...fixture.cam,
      plan_ref: planRef(),
      current_candidate: running || options.camWait ? null : fixture.nc.ref,
      status: running ? 'running' : options.camWait ? 'awaiting_confirmation' : 'succeeded',
      phase: running ? (elapsed < 1300 ? 'build' : 'execute') : 'collect',
      allowed_actions: running ? ['observe'] : options.camWait ? ['reconcile'] : [],
      error: !running && options.camWait ? { code: 3000, message: '执行器状态待核实' } : null,
    }
  }
  await page.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = decodeURIComponent(url.pathname)
    const post = req.method() === 'POST'
    const send = (model: string, value: unknown, status = 200) => {
      validate(model, value)
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    }
    const command = (model: string) => {
      const body = req.postDataJSON() as Record<string, unknown>
      validate(model, body)
      commands.push({ path, body })
      return body
    }
    if (path.startsWith('/agent/')) {
      const notFound = (code: number) =>
        send(
          'ApiErrorResponse',
          {
            error: { code, message: code === 3002 ? 'Not found' : 'Agent conversation not found' },
            request_id: 'fixture-agent',
            trace_id: 'fixture-agent',
          },
          404,
        )
      if (!options.agent) return notFound(3002)
      const conversationView = (id: string) => ({
        conversation_id: id,
        task_id: conversations.get(id)!.task_id,
        created_at: '2026-10-29T00:00:00Z',
        turns: conversations.get(id)!.turns,
      })
      if (path === '/agent/conversations' && post) {
        const body = req.postDataJSON() as { conversation_id: string; task_id: string }
        validate('CreateConversationRequest', body)
        if (!conversations.has(body.conversation_id))
          conversations.set(body.conversation_id, { task_id: body.task_id, turns: [] })
        return send('ConversationView', conversationView(body.conversation_id), 201)
      }
      const match = path.match(/^\/agent\/conversations\/([^/]+)(\/messages)?$/)
      const id = match?.[1]
      if (!id || !conversations.has(id)) return notFound(8401)
      if (!match![2]) return send('ConversationView', conversationView(id))
      const body = req.postDataJSON() as Record<string, unknown>
      validate('SendMessageRequest', body)
      agentMessages.push(body)
      const conversation = conversations.get(id)!
      const turnId = `fixture-turn-${conversation.turns.length + 1}`
      // 合成的只读回答：引用 fixture 计划中 ring-op-2 的 rough_step，不代表真实模型输出。
      const events = [
        { type: 'turn.started', turn_id: turnId, message_id: body.message_id },
        {
          type: 'tool.started',
          tool_call_id: 'fixture-call-1',
          name: 'get_operation_detail',
          summary: '读取工序 ring-op-2',
        },
        {
          type: 'tool.completed',
          tool_call_id: 'fixture-call-1',
          status: 'ok',
          summary: 'ring-op-2 外圆粗车',
          duration_ms: 3.2,
        },
        {
          type: 'message.completed',
          text: `外圆粗车当前 rough_step 为 ${roughStep} mm，来自模板参数配置；工程状态仍待确认。`,
          citations: [
            {
              tool_call_id: 'fixture-call-1',
              resource: 'planning_result r1',
              pointer: `/payload/operations/${roughIndex}/attributes/parameters/rough_step`,
              value: String(roughStep),
            },
          ],
          dropped_citations: 1,
        },
        {
          type: 'turn.completed',
          turn_id: turnId,
          status: 'completed',
          usage: { model_calls: 2, tool_calls: 1 },
        },
      ]
      conversation.turns.push({
        turn_id: turnId,
        message_id: body.message_id,
        text: body.text,
        context: body.context,
        created_at: '2026-10-29T00:00:00Z',
        events,
      })
      return send('TurnResponse', { conversation_id: id, turn_id: turnId, events })
    }
    if (path === '/cad/assets' && post) {
      expect(req.headers()['content-type']).toBe('application/octet-stream')
      expect(req.postDataBuffer()?.toString()).toBe('STEP TEST ONLY')
      return send('CadAsset', { ...fixture.asset, command_id: url.searchParams.get('command_id') })
    }
    if (path === `/cad/assets/${fixture.asset.asset_id}`) return send('CadAsset', fixture.asset)
    if (path.startsWith('/cad/assets/') && path.endsWith('/parse')) {
      const body = post
        ? command('CadParseCommand')
        : { command_id: url.searchParams.get('command_id') }
      if (options.parseDelay)
        await new Promise((resolve) => setTimeout(resolve, options.parseDelay))
      return send('CadParseResult', { ...fixture.parse, command_id: body.command_id })
    }
    if (path.endsWith('/feedback')) {
      if (post) {
        const body = req.postDataJSON()
        if (!feedbackItems.some((x) => x.feedback_id === body.feedback_id))
          feedbackItems.push({ ...body, status: 'active' })
        if (lostSupplement) {
          lostSupplement = false
          return route.abort('failed')
        }
        return route.fulfill({
          json: {
            feedback_version: feedbackItems.length,
            feedback_id: body.feedback_id,
            status: 'added',
          },
        })
      }
      return route.fulfill({
        json: { feedback_version: feedbackItems.length, items: feedbackItems },
      })
    }
    if (path === '/planning/tasks' && post) {
      if (options.v1Only)
        return route.fulfill({
          status: 422,
          json: {
            error: { code: 4002, message: 'Unsupported input schema' },
            request_id: 'v1-only',
          },
        })
      const body = command('CreateTaskRequest')
      expect(body.payload).toEqual({
        template: fixture.deployment.template,
        source: {
          asset_id: fixture.asset.asset_id,
          sha256: fixture.asset.sha256,
          parse_command_id: commands.find((c) => c.path.endsWith('/parse'))?.body.command_id,
        },
      })
      return send('TaskView', { ...fixture.task, current_revision: 0 })
    }
    if (path.endsWith('/replan') && post) {
      const body = command('HumanReplanRequest')
      const previous = plannedCommands.get(String(body.command_id))
      if (!previous) {
        revision++
        plannedCommands.set(String(body.command_id), revision)
        planningStarted = Date.now()
        if (body.parameter_patch) {
          expect(body.parameter_patch).toMatchObject({
            template_digest: fixture.deployment.template.digest,
            changes: [
              { operation_id: 'ring-op-2', parameter_id: 'rough_step', value: 0.4, unit: 'mm' },
            ],
          })
        }
      }
      if (planLost) {
        planLost = false
        return route.abort('failed')
      }
      const receipt = {
        ...fixture.run,
        run_id: `planning-${revision}`,
        command_id: body.command_id,
        basis_revision: revision - 1,
      }
      const {
        output_revision,
        execution_error,
        delivery_error,
        reason,
        repair_chain_id,
        repair_attempt,
        ...accepted
      } = receipt
      void [
        output_revision,
        execution_error,
        delivery_error,
        reason,
        repair_chain_id,
        repair_attempt,
      ]
      return send('RunReceipt', accepted, 202)
    }
    if (path.startsWith('/planning/tasks/') && path.includes('/runs/')) {
      runGets++
      return send('RunView', run())
    }
    if (path.startsWith('/planning/tasks/') && path.includes('/results/')) {
      const plan = structuredClone(revision === 2 ? fixture.plan2 : fixture.plan)
      if (options.referenceOnly) {
        plan.payload.extensions.reference_only = true
        plan.payload.extensions.execution_ready = false
        delete (plan.payload.extensions as { matching_evidence?: unknown }).matching_evidence
      }
      plan.revision = revision
      plan.run_id = `planning-${revision}`
      return send('PlanProduced', plan)
    }
    if (path === `/planning/tasks/${fixture.task.task_id}`)
      return send('TaskView', { ...fixture.task, current_revision: revision })
    if (path.startsWith('/process-cards/')) {
      expect(path).toBe(cardPath(fixture.task.task_id, revision) + (post ? '/review' : ''))
      if (post) {
        command('ReviewRequest')
        expect(req.headers()['x-reviewer-id']).toBe('test-reviewer')
        approvedRevision = revision
        return send('ReviewReceipt', { ...fixture.cardReview, revision })
      }
      const card = structuredClone(fixture.card)
      card.revision = revision
      card.run_id = `planning-${revision}`
      card.card.identity.revision = revision
      card.card.identity.run_id = `planning-${revision}`
      return send('ProcessCardResponse', card)
    }
    if (path.endsWith('/approved-plans'))
      return send('ApprovedPlanList', {
        ...fixture.approved,
        plans: approvedRevision ? [{ ...fixture.approved.plans[0], plan_ref: planRef() }] : [],
      })
    if (path === '/cam/runs' && post) {
      const body = command('StartCamCommand')
      expect(body.expected_current_revision).toBe(revision)
      expect(body.plan_ref).toEqual(planRef())
      if (!camStarted) camStarted = Date.now()
      if (camLost) {
        camLost = false
        return route.abort('failed')
      }
      return send('CamRunReceipt', { ...fixture.camReceipt, command_id: body.command_id }, 202)
    }
    if (path === `/cam/tasks/${fixture.task.task_id}/runs`)
      return send('CamRunList', { runs: camStarted ? [cam()] : [] })
    if (path === '/cam/runs/cam-1') {
      camGets++
      return send('CamRunView', cam())
    }
    if (path.endsWith('/observe')) {
      expect(post).toBe(true)
      expect(req.postData()).toBe(null)
      observe++
      return send('CamRunView', cam())
    }
    if (path.endsWith('/nc/versions/1'))
      return send('NcVersionView', {
        ...fixture.nc,
        plan_ref: planRef(),
        review_status: ncApproved ? 'approved' : 'pending',
        allowed_actions: ncApproved ? ['download'] : ['review'],
      })
    if (path.endsWith('/file')) {
      if (options.ncFailure) return send('ApiErrorResponse', fixture.error, 503)
      return send(
        'NcFileView',
        fixture.files.find((f) => f.file_id === url.searchParams.get('file_id')),
      )
    }
    if (path.endsWith('/nc/versions/1/review')) {
      const body = command('ReviewNcCommand')
      expect(body.nc_ref).toEqual(fixture.nc.ref)
      ncApproved = true
      return send('NcReviewReceipt', { ...fixture.ncReview, command_id: body.command_id })
    }
    if (path.endsWith('/download')) {
      expect(ncApproved).toBe(true)
      return route.fulfill({
        contentType: 'application/zip',
        body: Buffer.from('504b0506000000000000000000000000000000000000', 'hex'),
        headers: { 'Content-Disposition': 'attachment; filename="approved-test.zip"' },
      })
    }
    if (/^\/(cam|planning|process-cards|cad)\//.test(path))
      throw new Error(`未定义 Core fixture: ${path}`)
    return route.continue()
  })
  return { commands, agentMessages, counts: () => ({ runGets, camGets, observe }), options }
}
export async function startPlanning(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'Golden.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('STEP TEST ONLY'),
  })
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await expect(page.getByRole('region', { name: '工艺规划真实进度' })).toBeVisible()
}
export async function openPlan(page: Page) {
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await expect(page.getByRole('navigation', { name: '工序列表' }).getByRole('button')).toHaveCount(
    8,
  )
}
export async function approvePlan(page: Page) {
  await page.getByLabel('审核人 ID', { exact: true }).fill('test-reviewer')
  await page.getByRole('button', { name: '批准当前工艺卡' }).click()
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeEnabled()
}
export async function response(route: Route, model: string, value: unknown) {
  validate(model, value)
  await route.fulfill({ json: value })
}
