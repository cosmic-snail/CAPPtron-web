import fixture from './golden.json'
import { randomId } from '../browserCrypto'
import { cardPath, sameNcRef, samePlanRef } from '../core/client'
import type { Asset, ParseResult } from '../core/client'
import type { LivePlan } from '../core/contracts'
import { fileDigest } from '../core/journalTransport'
import type { WorkflowRuntime } from '../../features/core/useLiveWorkflow'
import { simulationZip } from './zip'

export const simulationKey = 'capptron.simulation.v1'
export const simulationScenarioKey = `${simulationKey}.scenario`
export type SimulationScenario = 'normal' | 'needs-replan' | 'parse-failure' | 'cam-failure'
export function simulationScenario(): SimulationScenario {
  const value = localStorage.getItem(simulationScenarioKey)
  return value === 'needs-replan' || value === 'parse-failure' || value === 'cam-failure'
    ? value
    : 'normal'
}
export const simulationSample = () =>
  new File(['STEP TEST ONLY'], 'Golden-simulation.step', { type: 'application/octet-stream' })
type Feedback = { feedback_id: string; status: string; [key: string]: unknown }
type SimTask = {
  scenario: SimulationScenario
  id: string
  assetId: string
  revision: number
  feedback: Feedback[]
  plans: Record<string, LivePlan>
  runs: Record<string, typeof fixture.run>
  approvedRevision: number
  approvedFeedback: number
  reviewer: string
  camId?: string
  camStarted?: number
  ncReviewer?: string
}
type Database = {
  version: 1
  assets: Record<string, Asset>
  parses: Record<string, ParseResult>
  tasks: Record<string, SimTask>
  receipts: Record<string, { fingerprint: string; value: unknown }>
}
function read(): Database {
  const raw = localStorage.getItem(simulationKey)
  if (!raw) return { version: 1, assets: {}, parses: {}, tasks: {}, receipts: {} }
  const value = JSON.parse(raw) as Database
  if (value.version !== 1 || !value.assets || !value.parses || !value.tasks || !value.receipts)
    throw new Error('本地模拟 JSON 格式损坏，请备份后清除模拟数据。')
  return value
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const error = (message: string, status = 409) =>
  json({ error: { code: status, message }, request_id: `sim-${randomId()}` }, status)
const clone = <T>(value: T): T => structuredClone(value)
const planRef = (task: SimTask) => ({
  ...fixture.approved.plans[0]!.plan_ref,
  task_id: task.id,
  revision: task.revision,
})
const ncRef = (task: SimTask) => ({ ...fixture.nc.ref, cam_run_id: task.camId! })
function cam(task: SimTask) {
  const running = Date.now() - (task.camStarted ?? 0) < 1200
  const failed = !running && task.scenario === 'cam-failure'
  return {
    ...fixture.cam,
    cam_run_id: task.camId,
    root_run_id: task.camId,
    plan_ref: planRef(task),
    status: running ? 'running' : failed ? 'failed' : 'succeeded',
    phase: running ? 'execute' : 'collect',
    current_candidate: running || failed ? null : ncRef(task),
    error: failed
      ? { code: 3000, message: '模拟 CAM 执行失败；请返回模型输入新建正常场景任务。' }
      : null,
    allowed_actions: running ? ['observe'] : [],
  }
}
const taskView = (task: SimTask) => ({
  ...fixture.task,
  task_id: task.id,
  current_revision: task.revision,
  feedback_version: task.feedback.length,
})

// 只处理本地合成协议数据；未知路由报错，绝不回退到真实网络。
const fetcher: typeof fetch = async (input, init = {}) => {
  init.signal?.throwIfAborted()
  const url = new URL(String(input), 'http://simulation.invalid')
  const path = url.pathname
  const post = init.method === 'POST'
  const db = read()
  const upload = init.body instanceof File
  const body = upload ? {} : init.body ? JSON.parse(String(init.body)) : {}
  const reviewer = new Headers(init.headers).get('X-Reviewer-Id')?.trim() ?? ''
  const command = upload
    ? url.searchParams.get('command_id')
    : (body.command_id ?? body.feedback_id)
  const fingerprint = JSON.stringify([
    path,
    upload ? await fileDigest(init.body as File) : body,
    reviewer,
  ])
  const receipt = command ? db.receipts[String(command)] : undefined
  if (post && receipt)
    return receipt.fingerprint === fingerprint
      ? json(receipt.value)
      : error('模拟命令 ID 已用于另一请求')
  const save = (value: unknown) => {
    if (command) db.receipts[String(command)] = { fingerprint, value }
    localStorage.setItem(simulationKey, JSON.stringify(db))
    return json(value)
  }
  if (path === '/cad/assets' && post && upload) {
    const file = init.body as File
    if ((await fileDigest(file)) !== (await fileDigest(simulationSample())))
      return error(
        '模拟流程仅支持内置 Golden 示例；请点击“使用示例”后上传。真实文件请切换真实联调。',
        422,
      )
    const asset = {
      ...fixture.asset,
      asset_id: `sim-asset-${randomId()}`,
      filename: file.name,
      sha256: await fileDigest(file),
      command_id: command,
      size_bytes: file.size,
    }
    db.assets[asset.asset_id] = asset
    return save(asset)
  }
  const assetMatch = path.match(/^\/cad\/assets\/([^/]+)(\/parse)?$/)
  if (assetMatch) {
    const asset = db.assets[decodeURIComponent(assetMatch[1]!)]
    if (!asset) return error('模拟资产不存在', 404)
    if (!assetMatch[2]) return json(asset)
    const id = post ? String(command) : (url.searchParams.get('command_id') ?? '')
    const key = `${asset.asset_id}/${id}`
    if (post) {
      db.parses[key] = {
        ...fixture.parse,
        status: simulationScenario() === 'parse-failure' ? 'failed' : 'parsed',
        diagnostic:
          simulationScenario() === 'parse-failure'
            ? '模拟 NX 解析失败；切回正常场景后可重新解析。'
            : null,
        execution_ready: false,
        asset_id: asset.asset_id,
        source_sha256: asset.sha256,
        command_id: id,
      }
      return save(db.parses[key])
    }
    return db.parses[key] ? json(db.parses[key]) : error('模拟解析命令不存在', 404)
  }
  if (path === '/planning/tasks' && post) {
    const source = body.payload?.source
    const asset = db.assets[source?.asset_id]
    if (
      !asset ||
      asset.sha256 !== source.sha256 ||
      db.parses[`${asset.asset_id}/${source.parse_command_id}`]?.status !== 'parsed'
    )
      return error('模拟输入尚未解析', 422)
    const id = `sim-task-${randomId()}`
    const task: SimTask = {
      scenario: simulationScenario(),
      id,
      assetId: asset.asset_id,
      revision: 0,
      feedback: [],
      plans: {},
      runs: {},
      approvedRevision: 0,
      approvedFeedback: -1,
      reviewer: '',
    }
    db.tasks[id] = task
    return save(taskView(task))
  }
  for (const task of Object.values(db.tasks)) {
    const root = `/planning/tasks/${encodeURIComponent(task.id)}`
    if (path === root && !post) return json(taskView(task))
    if (path === `${root}/feedback`) {
      if (!post) return json({ feedback_version: task.feedback.length, items: task.feedback })
      if (
        body.base_revision !== task.revision ||
        body.expected_feedback_version !== task.feedback.length
      )
        return error('现场信息版本已变化，请重新读取')
      task.feedback.push({ ...body, status: 'active' })
      task.approvedRevision = 0
      return save({
        feedback_id: body.feedback_id,
        feedback_version: task.feedback.length,
        status: 'added',
      })
    }
    if (path === `${root}/replan` && post) {
      if (
        body.base_revision !== task.revision ||
        body.expected_feedback_version !== task.feedback.length
      )
        return error('模拟规划版本已变化')
      const plan: LivePlan = clone(task.plans[String(task.revision)] ?? fixture.plan)
      for (const change of body.parameter_patch?.changes ?? []) {
        const operation = plan.payload.operations.find((op) => op.id === change.operation_id)
        const rule = plan.payload.extensions.parameter_rules?.find(
          (rule) =>
            rule.operation_id === change.operation_id && rule.parameter_id === change.parameter_id,
        )
        if (
          !operation ||
          !rule?.allowed_values?.includes(change.value) ||
          rule.unit !== change.unit
        )
          return error('模拟参数不在允许范围内', 422)
        operation.attributes.parameters ??= {}
        operation.attributes.parameters[change.parameter_id] = change.value
      }
      task.revision++
      task.approvedRevision = 0
      task.camId = undefined
      task.camStarted = undefined
      task.ncReviewer = undefined
      const id = `sim-planning-${randomId()}`
      Object.assign(plan, { task_id: task.id, revision: task.revision, run_id: id })
      plan.payload.extensions.matching_evidence!.step_sha256 = db.assets[task.assetId]!.sha256
      task.plans[String(task.revision)] = plan
      task.runs[id] = {
        ...fixture.run,
        task_id: task.id,
        run_id: id,
        command_id: String(command),
        output_revision: task.revision,
        basis_revision: task.revision - 1,
        basis_feedback_version: task.feedback.length,
        needs_replan: task.scenario === 'needs-replan' && task.feedback.length === 0,
      }
      return save(task.runs[id])
    }
    if (path.startsWith(`${root}/runs/`))
      return task.runs[decodeURIComponent(path.slice(`${root}/runs/`.length))]
        ? json(task.runs[decodeURIComponent(path.slice(`${root}/runs/`.length))])
        : error('模拟规划记录不存在', 404)
    if (path.startsWith(`${root}/results/`))
      return task.plans[path.slice(`${root}/results/`.length)]
        ? json(task.plans[path.slice(`${root}/results/`.length)])
        : error('模拟结果不存在', 404)
    const card = cardPath(task.id, task.revision)
    if (path === card) {
      const value = clone(fixture.card)
      Object.assign(value, {
        task_id: task.id,
        revision: task.revision,
        run_id: task.plans[String(task.revision)]?.run_id,
        expected_feedback_version: task.feedback.length,
      })
      Object.assign(value.card.identity, {
        task_id: task.id,
        revision: task.revision,
        run_id: value.run_id,
      })
      return json(value)
    }
    if (path === `${card}/review` && post) {
      if (task.runs[task.plans[String(task.revision)]?.run_id ?? '']?.needs_replan)
        return error('模拟准入条件未满足，请补充现场信息并重新规划')
      if (!reviewer) return error('请填写审核人 ID', 422)
      if (body.expected_feedback_version !== task.feedback.length) return error('审批反馈版本过期')
      task.approvedRevision = task.revision
      task.approvedFeedback = task.feedback.length
      task.reviewer = reviewer
      return save({
        ...fixture.cardReview,
        task_id: task.id,
        revision: task.revision,
        reviewer_id: reviewer,
      })
    }
    if (path === `/cam/tasks/${encodeURIComponent(task.id)}/approved-plans`)
      return json({
        ...fixture.approved,
        plans:
          task.approvedRevision === task.revision && task.approvedFeedback === task.feedback.length
            ? [{ ...fixture.approved.plans[0], plan_ref: planRef(task) }]
            : [],
      })
    if (path === `/cam/tasks/${encodeURIComponent(task.id)}/runs`)
      return json({ runs: task.camId ? [cam(task)] : [] })
    if (path === '/cam/runs' && post && body.plan_ref?.task_id === task.id) {
      if (
        task.approvedRevision !== task.revision ||
        task.approvedFeedback !== task.feedback.length ||
        body.expected_current_revision !== task.revision ||
        !samePlanRef(body.plan_ref, planRef(task))
      )
        return error('当前修订尚未审批')
      if (task.camId) return error('当前修订已有模拟 CAM 记录')
      task.camId = `sim-cam-${randomId()}`
      task.camStarted = Date.now()
      return save({
        ...fixture.camReceipt,
        command_id: command,
        context: { ...fixture.camReceipt.context, cam_run_id: task.camId },
      })
    }
    if (!task.camId) continue
    const camRoot = `/cam/runs/${task.camId}`
    if (path === camRoot || path === `${camRoot}/observe`) return json(cam(task))
    const ncRoot = `${camRoot}/nc/versions/1`
    if (path === ncRoot)
      return json({
        ...fixture.nc,
        ref: ncRef(task),
        plan_ref: planRef(task),
        origin: 'simulation',
        review_status: task.ncReviewer ? 'approved' : 'pending',
        allowed_actions: task.ncReviewer ? ['download'] : ['review'],
        reviews: task.ncReviewer ? [{ reviewer_id: task.ncReviewer, simulation: true }] : [],
      })
    if (path === `${ncRoot}/file`) {
      const file = fixture.files.find((file) => file.file_id === url.searchParams.get('file_id'))
      return file ? json(file) : error('模拟 NC 文件不存在', 404)
    }
    if (path === `${ncRoot}/review` && post) {
      if (!reviewer || !sameNcRef(body.nc_ref, ncRef(task)) || cam(task).status !== 'succeeded')
        return error('审核人或 NC 候选无效', 422)
      task.ncReviewer = reviewer
      return save({
        ...fixture.ncReview,
        command_id: command,
        review: { ...fixture.ncReview.review, nc_ref: ncRef(task), reviewer_id: reviewer },
      })
    }
    if (path === `${ncRoot}/download`) {
      if (!task.ncReviewer) return error('模拟 NC 尚未审批')
      return new Response(
        simulationZip([
          ...fixture.files.map((file) => ({ name: file.filename, text: file.text })),
          {
            name: 'SIMULATION-ONLY.json',
            text: JSON.stringify(
              {
                simulation: true,
                warning: '仅用于界面验收，未执行 NX / Mastercam，不可用于加工。',
                task_id: task.id,
                plan_ref: planRef(task),
                reviewer_id: task.ncReviewer,
              },
              null,
              2,
            ),
          },
        ]),
        {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="SIMULATION-ONLY.zip"',
          },
        },
      )
    }
  }
  return error('本地模拟记录不存在或接口不受支持', 404)
}

export const simulationRuntime: WorkflowRuntime = {
  scope: simulationKey,
  fetcher,
}
