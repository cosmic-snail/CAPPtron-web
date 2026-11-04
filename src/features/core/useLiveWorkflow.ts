import {
  applySupplement,
  supplementFields,
  supplementSchemaFor,
  supplementPayload,
  supplementValues,
} from '../../api/core/supplement'
import { randomId } from '../../api/browserCrypto'
import type { SupplementList } from '../../api/core/supplement'
import { useEffect, useRef, useState } from 'react'
import {
  CoreClient,
  CoreHttpError,
  cardPath,
  ncPath,
  sameNcRef,
  samePlanRef,
  assertNcFiles,
  validateNcFile,
} from '../../api/core/client'
import type { ApprovedPlans, Asset, CamRun, ParseResult, Task } from '../../api/core/client'
import type {
  Card,
  Deployment,
  LiveNc,
  LivePlan,
  NcFile,
  PlanningRun,
} from '../../api/core/contracts'
import { templateRequestV2 } from '../../api/core/golden'
import { CommandJournal, migrateJournalScopes } from '../../api/core/commandJournal'
import { recoverLocation, UnrecoverableTaskError } from '../../api/core/liveRecovery'
import { journalFetcher, fileDigest } from '../../api/core/journalTransport'
import { deploymentFromPlan, parameterChanges, toProcessPlan } from '../../api/core/viewModel'
import { preparationBlocksExecution, preparationNote } from './admission'
import type { PlanningSession } from '../process-planning/useWorkflowSession'

type State = {
  asset?: Asset
  parsed?: ParseResult
  task?: Task
  plan?: LivePlan
  card?: Card
  approved?: ApprovedPlans
  planning?: PlanningRun
  cam?: CamRun
  nc?: LiveNc
  files?: NcFile[]
  selectedFile?: string
  session?: PlanningSession
  deployment?: Deployment
  supplementStatus?: string
  busy: boolean
  error: string
  draftError?: boolean
  status: string
  admission?: string
  pendingUpload?: boolean
  recovered?: boolean
  downloadReceipt?: Omit<Awaited<ReturnType<CoreClient['download']>>, 'blob'>
}
const initial: State = { busy: false, error: '', status: '请选择并上传 STEP' }
const path = (task: Task) => `/planning/tasks/${encodeURIComponent(task.task_id)}`
const uuid = () => randomId()
const pause = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 800)
    signal.addEventListener('abort', abort, { once: true })
  })
type Context = { api: CoreClient; signal: AbortSignal; update: (patch: Partial<State>) => void }

export type WorkflowRuntime = {
  fetcher: typeof fetch
  scope: string
}

export function useLiveWorkflow(file?: File, runtime?: WorkflowRuntime) {
  const [state, setState] = useState<State>(initial)
  const [reviewer, setReviewer] = useState('')
  const [agentOpen, setAgentOpen] = useState(false)
  const journal = useRef<CommandJournal | null>(null)
  const storageBlocked = useRef(false)
  const previousInput = useRef<{ file?: File; runtime?: WorkflowRuntime } | null>(null)
  const [restoreAssetId, setRestoreAssetId] = useState('')
  const [restoreParseId, setRestoreParseId] = useState('')
  const [restoreTaskId, setRestoreTaskId] = useState('')
  const controller = useRef<AbortController | null>(null)
  const retry = useRef<((context: Context) => Promise<void>) | null>(null)
  const locked = useRef(false)
  useEffect(() => {
    controller.current?.abort()
    retry.current = null
    locked.current = false
    storageBlocked.current = false
    setState(initial)
    try {
      journal.current = new CommandJournal(
        localStorage,
        runtime?.scope ?? `${import.meta.env.VITE_API_BASE_URL ?? ''}`,
      )
      if (!runtime) {
        // 兼容窗口：发现旧配置摘要 scope 的命令日志并迁移到当前 scope。
        const base = import.meta.env.VITE_API_BASE_URL ?? ''
        const sha = import.meta.env.VITE_CORE_INTEGRATION_CONFIG_SHA256 ?? ''
        migrateJournalScopes(localStorage, journal.current, [`${base}|${sha}`])
      }
      const saved = journal.current.read()
      const changed =
        previousInput.current !== null &&
        previousInput.current.runtime === runtime &&
        previousInput.current.file !== file
      previousInput.current = { file, runtime }
      if (saved.pending) {
        retry.current = async (context) => resumePending(context)
        setState({
          ...initial,
          status: '存在未决原请求，请核对来源并恢复',
          recovered: true,
          pendingUpload: saved.pending.domain === 'upload',
        })
      } else if (changed) {
        journal.current.update({
          asset_id: undefined,
          parse_command_id: undefined,
          task_id: undefined,
          run_id: undefined,
          revision: undefined,
          cam_run_id: undefined,
          nc_ref: undefined,
          drafts: undefined,
        })
      } else if (saved.task_id || saved.asset_id) {
        void act(restore)
      }
    } catch (error) {
      storageBlocked.current = true
      setState({ ...initial, error: String(error), status: '恢复日志损坏，已阻止写操作' })
    }
    return () => controller.current?.abort()
    // 仅输入身份改变时重建会话；恢复函数使用本次输入闭包，不能随渲染重发恢复。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, runtime])

  useEffect(() => {
    if (!runtime) {
      setReviewer('')
      return
    }
    try {
      const saved = JSON.parse(localStorage.getItem(`${runtime.scope}.reviewer`) ?? '{}')
      setReviewer(typeof saved.reviewerId === 'string' ? saved.reviewerId : '')
    } catch {
      setReviewer('')
    }
  }, [runtime])

  function changeReviewer(value: string) {
    setReviewer(value)
    if (runtime) {
      try {
        localStorage.setItem(
          `${runtime.scope}.reviewer`,
          JSON.stringify({ version: 1, reviewerId: value }),
        )
      } catch {
        setState((s) => ({ ...s, error: '审核人未能保存到本地，请检查浏览器存储权限。' }))
      }
    }
  }

  async function act(work: (context: Context) => Promise<void>) {
    if (locked.current || storageBlocked.current) return
    locked.current = true
    const abort = new AbortController()
    controller.current?.abort()
    controller.current = abort
    const signal = abort.signal
    const base = runtime ? '' : (import.meta.env.VITE_API_BASE_URL ?? '')
    const api = new CoreClient(
      base,
      journalFetcher(journal.current!, base, signal, runtime?.fetcher),
    )
    const update = (patch: Partial<State>) => {
      if (!signal.aborted) {
        const saved: Parameters<CommandJournal['update']>[0] = {}
        if (patch.asset) saved.asset_id = patch.asset.asset_id
        if (patch.parsed) saved.parse_command_id = patch.parsed.command_id
        if (patch.task) {
          saved.task_id = patch.task.task_id
          saved.revision = patch.task.current_revision
        }
        if (patch.planning) saved.run_id = patch.planning.run_id
        if ('cam' in patch) saved.cam_run_id = patch.cam?.cam_run_id
        if ('nc' in patch) saved.nc_ref = patch.nc?.ref
        if (patch.nc) saved.nc_ref = patch.nc.ref
        if (patch.session) saved.drafts = patch.session.drafts
        if (Object.keys(saved).length) journal.current!.update(saved)
        setState((s) => ({ ...s, ...patch }))
      }
    }
    retry.current = work
    update({ busy: true, error: '', draftError: false })
    try {
      await work({ api, signal, update })
      if (!signal.aborted) retry.current = null
    } catch (error) {
      if (
        !signal.aborted &&
        error instanceof UnrecoverableTaskError &&
        !journal.current!.read().pending
      )
        retry.current = null
      if (
        !signal.aborted &&
        error instanceof CoreHttpError &&
        error.confirmed &&
        error.method === 'POST' &&
        error.status >= 400 &&
        error.status < 500
      ) {
        retry.current = null
        setState((s) => ({
          ...s,
          status: 'Core 已拒绝命令，请修正输入或核对当前版本',
          approved: undefined,
          session: s.session ? { ...s.session, resultViewed: true } : undefined,
        }))
      }
      update({ error: error instanceof Error ? error.message : 'Core 请求失败' })
    } finally {
      if (!signal.aborted) {
        locked.current = false
        update({ busy: false })
      }
    }
  }
  function updateSession(update: (session: PlanningSession) => PlanningSession) {
    if (locked.current || retry.current) return
    setState((s) => {
      if (!s.session) return s
      const session = update(s.session)
      journal.current!.update({ drafts: session.drafts })
      return {
        ...s,
        session,
        ...(s.draftError && session.drafts !== s.session.drafts
          ? { error: '', draftError: false }
          : {}),
      }
    })
  }
  const dirty = Object.keys(state.session?.drafts ?? {}).length > 0
  const hasUnplannedSupplement =
    !!state.supplementStatus &&
    (state.planning?.basis_feedback_version === undefined ||
      state.planning.basis_feedback_version < (state.task?.feedback_version ?? 0))
  const activeCam =
    !!state.cam && ['accepted', 'running', 'awaiting_confirmation'].includes(state.cam.status)
  const executable =
    !state.admission &&
    !state.planning?.needs_replan &&
    !dirty &&
    !state.busy &&
    !state.error &&
    state.approved?.execution_configured &&
    state.plan?.payload.extensions.execution_ready &&
    !state.plan.payload.extensions.reference_only
      ? state.approved.plans.find(
          (p) =>
            p.profile_matches &&
            p.plan_ref.task_id === state.task?.task_id &&
            p.plan_ref.result_id === state.plan?.result_id &&
            p.plan_ref.revision === state.task?.current_revision,
        )
      : undefined

  async function restore(context: Context) {
    const location = journal.current!.read()
    const recovered = await recoverLocation(context.api, location)
    if (
      recovered.task &&
      location.revision !== recovered.task.current_revision &&
      Object.keys(location.drafts ?? {}).length
    )
      throw new Error('服务端已有新修订，本地仍有旧版参数草稿；请先核对草稿，不能自动套用到新修订')
    context.update({
      ...recovered,
      recovered: true,
      status: recovered.parsed ? '复用已验证解析 · 保留原命令与报告来源' : '已恢复服务端输入身份',
    })
    if (recovered.task) {
      if (location.run_id) {
        let run = await context.api.get<PlanningRun>(
          `${path(recovered.task)}/runs/${encodeURIComponent(location.run_id)}`,
        )
        if (
          run.status === 'completed' &&
          run.output_revision &&
          run.output_revision < recovered.task.current_revision
        ) {
          if (Object.keys(location.drafts ?? {}).length)
            throw new Error(
              '服务端已有新修订，本地仍有旧版参数草稿；请先核对草稿，不能自动套用到新修订',
            )
          const latest = await context.api.get<LivePlan>(
            `${path(recovered.task)}/results/${recovered.task.current_revision}`,
          )
          if (
            latest.task_id !== recovered.task.task_id ||
            latest.revision !== recovered.task.current_revision
          )
            throw new Error('当前规划结果身份不一致，请核对任务')
          run = await context.api.get<PlanningRun>(
            `${path(recovered.task)}/runs/${encodeURIComponent(latest.run_id)}`,
          )
        }
        await readPlan(context, recovered.task, run)
      } else if (recovered.task.current_revision > 0) {
        const plan = await context.api.get<LivePlan>(
          `${path(recovered.task)}/results/${recovered.task.current_revision}`,
        )
        const run = await context.api.get<PlanningRun>(
          `${path(recovered.task)}/runs/${encodeURIComponent(plan.run_id)}`,
        )
        await readPlan(context, recovered.task, run)
      }
      context.signal.throwIfAborted()
      const drafts = location.drafts
      if (drafts) journal.current!.update({ drafts })
      if (drafts)
        setState((s) =>
          s.session
            ? { ...s, session: { ...s.session, drafts: drafts as PlanningSession['drafts'] } }
            : s,
        )
      if (recovered.cam?.status === 'succeeded')
        await readNc(context, recovered.cam, recovered.task)
    }
  }
  async function resumePending(context: Context) {
    const pending = journal.current!.read().pending
    if (!pending?.url) throw new Error('原命令缺少请求来源，不能自动恢复')
    if (pending.domain === 'upload') {
      if (
        !file ||
        file.name !== pending.request.filename ||
        file.size !== pending.request.size_bytes ||
        (await fileDigest(file)) !== pending.request.sha256
      )
        throw new Error('请重新选择同名、大小和 SHA-256 一致的原 STEP 文件后恢复')
      const asset = await context.api.upload(file, pending.command_id)
      context.update({ asset, pendingUpload: false, status: '原上传命令已恢复' })
      return
    }
    await context.api.post(pending.url, pending.request, pending.reviewer)
    await restore(context)
  }
  function restoreParsedInput() {
    if (
      !restoreAssetId.trim() ||
      !restoreParseId.trim() ||
      state.busy ||
      retry.current ||
      activeCam ||
      dirty ||
      storageBlocked.current
    )
      return
    journal.current!.update({
      asset_id: restoreAssetId.trim(),
      parse_command_id: restoreParseId.trim(),
      task_id: undefined,
      run_id: undefined,
      cam_run_id: undefined,
      revision: undefined,
      nc_ref: undefined,
      drafts: undefined,
    })
    setState(initial)
    void act(restore)
  }
  function restoreKnownTask() {
    if (
      !restoreTaskId.trim() ||
      state.busy ||
      retry.current ||
      activeCam ||
      dirty ||
      storageBlocked.current
    )
      return
    setState(initial)
    journal.current!.update({
      task_id: restoreTaskId.trim(),
      run_id: undefined,
      cam_run_id: undefined,
      nc_ref: undefined,
      revision: undefined,
      drafts: undefined,
    })
    void act(restore)
  }
  function upload() {
    if (!file || state.busy || retry.current) return
    const command = uuid()
    void act(async ({ api, update }) => {
      update({ status: '正在上传 STEP' })
      const asset = await api.upload(file, command)
      if (asset.status !== 'not_parsed') throw new Error('上传回执状态不符合 Core 契约')
      update({ asset, status: '上传成功 · 尚未解析' })
    })
  }
  function parse() {
    const asset = state.asset
    if (!asset || state.busy || retry.current) return
    const command = uuid()
    let receipt: ParseResult | undefined
    void act(async ({ api, signal, update }) => {
      update({ status: '正在执行 NX 解析，请稍候' })
      const url = `/cad/assets/${encodeURIComponent(asset.asset_id)}/parse`
      receipt ??= await api.post<ParseResult>(url, { command_id: command })
      for (;;) {
        signal.throwIfAborted()
        update({ parsed: receipt, status: `NX 解析 · ${receipt.status}` })
        if (receipt.status !== 'running') {
          if (receipt.status === 'failed')
            update({
              error:
                typeof receipt.diagnostic === 'string'
                  ? receipt.diagnostic
                  : 'NX 解析失败；请核对 Core 诊断后再试。',
            })
          return
        }
        await pause(signal)
        receipt = await api.get<ParseResult>(
          `${url}?${new URLSearchParams({ command_id: command })}`,
        )
      }
    })
  }

  async function readPlan(context: Context, task: Task, run: PlanningRun) {
    const { api, signal, update } = context
    update({ planning: run })
    let current = await api.get<PlanningRun>(`${path(task)}/runs/${encodeURIComponent(run.run_id)}`)
    for (;;) {
      signal.throwIfAborted()
      update({
        planning: current,
        status:
          current.status === 'queued'
            ? '等待规划'
            : current.status === 'running'
              ? '规划中'
              : '结果校验或交付中',
      })
      if (current.status === 'failed' || current.status === 'cancelled') {
        update({
          status: current.status === 'failed' ? '规划失败' : '已取消',
          error: current.execution_error?.message ?? '',
        })
        return
      }
      if (current.delivery_state.frontend === 'failed') {
        update({
          status: '结果交付失败',
          error: current.delivery_error?.message ?? '结果交付失败，请核对 Core 交付状态。',
        })
        return
      }
      if (current.status === 'completed' && current.delivery_state.frontend === 'available') {
        if (!current.output_revision) throw new Error('规划已结束，但结果版本或校验状态尚未就绪')
        const nextTask = await api.get<Task>(path(task))
        const plan = await api.get<LivePlan>(`${path(task)}/results/${current.output_revision}`)
        if (
          plan.task_id !== task.task_id ||
          plan.run_id !== current.run_id ||
          plan.revision !== current.output_revision ||
          nextTask.current_revision !== plan.revision
        )
          throw new Error('规划结果身份已变化，请重新核对当前任务')
        const blocked =
          current.needs_replan ||
          plan.payload.extensions.reference_only ||
          plan.payload.extensions.source_unbound ||
          !plan.payload.extensions.matching_evidence
        const deployment = deploymentFromPlan(plan)
        const model = toProcessPlan(plan, deployment)
        if (runtime) {
          model.simulation = true
          model.sourceDescription = '本地 JSON 模拟数据 · 未执行 NX / Mastercam'
          for (const operation of model.operations)
            operation.source = `本地模拟 · ${plan.result_id} / r${plan.revision}`
        }
        if (blocked)
          for (const operation of model.operations)
            for (const parameter of operation.parameters) parameter.editable = false
        const feedback = await api.get<SupplementList>(`${path(task)}/feedback`)
        const recorded = applySupplement(model, feedback)
        const preparationIssues = plan.payload.extensions.preparation?.issues
        const preparationBlocks = preparationBlocksExecution(
          plan.payload.extensions.execution_ready,
          preparationIssues,
        )
        const note = preparationNote(plan.payload.extensions.execution_ready, preparationIssues)
        const card = await api.get<Card>(cardPath(task.task_id, plan.revision))
        if (
          card.task_id !== task.task_id ||
          card.revision !== plan.revision ||
          card.result_id !== plan.result_id ||
          (!blocked && !card.card)
        )
          throw new Error('工艺卡尚未就绪，不能解锁结果或审批')
        const approved = await api.get<ApprovedPlans>(
          `/cam/tasks/${encodeURIComponent(task.task_id)}/approved-plans`,
        )
        update({
          task: nextTask,
          plan,
          deployment,
          card,
          approved,
          status: '工艺方案已就绪',
          supplementStatus:
            [recorded ? '现场信息已从服务端回读；未应用到 CAM，仍需工程核对。' : '', note]
              .filter(Boolean)
              .join(' ') || undefined,
          admission:
            model.onsiteAssessment?.input_status === 'valid' &&
            model.onsiteAssessment.execution_status === 'blocked'
              ? `现场输入有效，已纳入本版约束记录；CAM 暂不可执行：${model.onsiteAssessment.execution_blockers.map((x) => x.message).join('；')}`
              : model.onsiteAssessment?.input_status === 'invalid'
                ? `现场输入需要修正：${model.onsiteAssessment.issues.map((x) => x.message).join('；')}`
                : plan.payload.extensions.onsite_diagnostics?.length
                  ? plan.payload.extensions.onsite_diagnostics.map((x) => x.message).join('；')
                  : preparationBlocks
                    ? preparationIssues?.map((item) => item.detail).join('；')
                    : current.needs_replan
                      ? '本版工艺已生成，可查看；补充信息尚未满足规划与校验要求，当前不能批准或执行 CAM。'
                      : blocked
                        ? '方案仅供参考：输入来源尚未绑定或缺少匹配证据，不能批准或执行 CAM。'
                        : undefined,
          session: {
            taskKey: `${task.task_id}/${plan.revision}`,
            plan: model,
            selectedId: model.operations[0]?.id ?? null,
            view: 'steps',
            drafts: {},
            messages: [],
            input: '',
            startedAt: 0,
            resultViewed: false,
            contextRevision: plan.revision,
          },
        })
        return
      }
      await pause(signal)
      current = await api.get<PlanningRun>(
        `${path(task)}/runs/${encodeURIComponent(current.run_id)}`,
      )
    }
  }
  function createPlan() {
    if (!state.asset || state.parsed?.status !== 'parsed' || state.busy || retry.current) return
    const asset = state.asset,
      parsed = state.parsed
    const createCommand = uuid(),
      planCommand = uuid()
    let task: Task | undefined = state.task,
      run: PlanningRun | undefined
    void act(async (context) => {
      const { api, update } = context
      update({
        status: '正在按最新补充信息重新规划',
        ...(state.session ? { session: { ...state.session, resultViewed: false } } : {}),
      })
      try {
        task ??= await api.post<Task>(
          '/planning/tasks',
          templateRequestV2(asset, parsed, createCommand),
        )
      } catch (error) {
        // 旧 Core 不支持 v2：明确阻断，不改写 v1 或重建任务。
        if (error instanceof CoreHttpError && error.code === 4002)
          throw new Error('当前 Core 不支持 template-request-v2 模板选择协议，请升级 Core 后重试。')
        throw error
      }
      update({ task, status: '规划任务已创建' })
      run ??= await api.post<PlanningRun>(`${path(task)}/replan`, {
        command_id: planCommand,
        base_revision: task.current_revision,
        expected_feedback_version: task.feedback_version,
      })
      await readPlan(context, task, run)
    })
  }
  function submitChanges() {
    if (
      !state.task ||
      !state.plan ||
      !state.session ||
      !state.deployment ||
      state.busy ||
      retry.current ||
      activeCam
    )
      return
    const task = { ...state.task },
      plan = state.plan,
      session = state.session
    const fields = supplementFields(session.plan)
    const changedSupplement = fields.some(
      ({ key, p }) =>
        session.drafts[key] !== undefined && session.drafts[key] !== String(p.value ?? ''),
    )
    let changes: ReturnType<typeof parameterChanges>, values: Record<string, string> | undefined
    try {
      changes = parameterChanges(session.plan, session.drafts)
      if (changedSupplement) values = supplementValues(session.plan, session.drafts)
    } catch (error) {
      setState((s) => ({ ...s, error: String(error), draftError: true }))
      return
    }
    if (!changedSupplement && !changes.length && !hasUnplannedSupplement) return
    const feedbackId = uuid(),
      command = uuid()
    let nextSession = session
    let feedbackDone = false,
      run: PlanningRun | undefined
    void act(async (context) => {
      const { api, update } = context
      if (values && !feedbackDone) {
        await api.post(`${path(task)}/feedback`, {
          feedback_id: feedbackId,
          expected_feedback_version: task.feedback_version,
          base_revision: task.current_revision,
          kind: 'onsite_record',
          supplement_schema_version: supplementSchemaFor(session.plan),
          supplement: supplementPayload(session.plan, values),
          text: '人工现场信息记录，未自动应用到 CAM；需独立工程核对。',
        })
        const list = await api.get<SupplementList>(`${path(task)}/feedback`)
        if (!list.items.some((item) => item.feedback_id === feedbackId && item.status === 'active'))
          throw new Error('现场信息回读未确认，请继续查询')
        task.feedback_version = list.feedback_version
        feedbackDone = true
        const recordedPlan = structuredClone(session.plan)
        applySupplement(recordedPlan, list)
        nextSession = { ...session, plan: recordedPlan }
        update({
          task,
          session: nextSession,
          approved: undefined,
          card: undefined,
          supplementStatus: '现场信息已提交并回读；未应用到 CAM，需重新核对工艺与审批。',
        })
      }
      // 草稿直到完整规划结果回读成功才清除；重试沿用原命令及反馈版本。
      update({
        approved: undefined,
        card: undefined,
        cam: undefined,
        nc: undefined,
        files: undefined,
        status: '等待规划',
        session: { ...nextSession, resultViewed: false },
      })
      run ??= await api.post<PlanningRun>(`${path(task)}/replan`, {
        command_id: command,
        base_revision: task.current_revision,
        expected_feedback_version: task.feedback_version,
        ...(changes.length
          ? {
              parameter_patch: {
                template_digest: plan.payload.extensions.template.digest,
                base_plan_digest: plan.payload.extensions.plan_digest,
                changes,
              },
            }
          : {}),
      })
      await readPlan(context, task, run)
    })
  }
  function submitSupplement() {
    if (!state.task || !state.session || state.busy || retry.current || activeCam) return
    const task = state.task,
      session = state.session
    let values: Record<string, string>
    try {
      values = supplementValues(session.plan, session.drafts)
    } catch (error) {
      setState((s) => ({ ...s, error: String(error) }))
      return
    }
    const feedbackId = uuid()
    const body = {
      feedback_id: feedbackId,
      expected_feedback_version: task.feedback_version,
      base_revision: task.current_revision,
      kind: 'onsite_record',
      supplement_schema_version: supplementSchemaFor(session.plan),
      supplement: supplementPayload(session.plan, values),
      text: '人工现场信息记录，未自动应用到 CAM；需独立工程核对。',
    }
    void act(async ({ api, update }) => {
      await api.post(`${path(task)}/feedback`, body)
      const list = await api.get<SupplementList>(`${path(task)}/feedback`)
      if (!list.items.some((x) => x.feedback_id === feedbackId && x.status === 'active'))
        throw new Error('现场信息回读未确认，请继续查询')
      const plan = structuredClone(session.plan)
      applySupplement(plan, list)
      const drafts = { ...session.drafts }
      for (const { key } of supplementFields(plan)) delete drafts[key]
      update({
        task: { ...task, feedback_version: list.feedback_version },
        approved: undefined,
        card: undefined,
        session: { ...session, plan, drafts },
        supplementStatus: '现场信息已提交并回读；未应用到 CAM，需重新核对工艺与审批。',
      })
    })
  }
  function submitParameters() {
    if (
      !state.task ||
      !state.plan ||
      !state.session ||
      !state.deployment ||
      state.busy ||
      retry.current ||
      activeCam
    )
      return
    const task = state.task,
      plan = state.plan,
      session = state.session
    let changes: ReturnType<typeof parameterChanges>
    try {
      changes = parameterChanges(session.plan, session.drafts)
    } catch (error) {
      setState((s) => ({ ...s, error: String(error) }))
      return
    }
    const command = uuid()
    let run: PlanningRun | undefined
    void act(async (context) => {
      if (supplementFields(session.plan).some(({ key }) => session.drafts[key] !== undefined)) {
        context.update({ error: '请先提交补充信息，再提交加工参数修订。' })
        return
      }
      if (!changes.length) {
        context.update({ session: { ...session, drafts: {} } })
        return
      }
      context.update({
        approved: undefined,
        card: undefined,
        cam: undefined,
        nc: undefined,
        files: undefined,
        status: '等待规划',
        session: { ...session, resultViewed: false },
      })
      run ??= await context.api.post<PlanningRun>(`${path(task)}/replan`, {
        command_id: command,
        base_revision: task.current_revision,
        expected_feedback_version: task.feedback_version,
        parameter_patch: {
          template_digest: plan.payload.extensions.template.digest,
          base_plan_digest: plan.payload.extensions.plan_digest,
          changes,
        },
      })
      await readPlan(context, task, run)
    })
  }
  function refreshReadiness() {
    if (!state.task || state.busy || retry.current) return
    const task = state.task
    void act(async ({ api, update }) => {
      const current = await api.get<Task>(path(task))
      if (
        current.current_revision !== task.current_revision ||
        current.feedback_version !== task.feedback_version
      )
        throw new UnrecoverableTaskError('任务版本已变化，请恢复当前任务后重新核对；草稿已保留。')
      const card = await api.get<Card>(cardPath(task.task_id, task.current_revision))
      if (
        card.task_id !== task.task_id ||
        card.revision !== task.current_revision ||
        card.result_id !== state.plan?.result_id
      )
        throw new UnrecoverableTaskError('工艺卡身份不匹配，请重新查询；草稿已保留。')
      const approved = await api.get<ApprovedPlans>(
        `/cam/tasks/${encodeURIComponent(task.task_id)}/approved-plans`,
      )
      update({ card, approved })
    })
  }
  function approvePlan() {
    if (/[^\x20-\x7e]/.test(reviewer)) {
      setState((s) => ({
        ...s,
        error: '审核人 ID 请使用英文字母、数字或英文符号，例如 reviewer-01。',
      }))
      return
    }
    if (
      !state.task ||
      !state.card ||
      state.admission ||
      state.card?.execution_preflight?.status === 'blocked' ||
      dirty ||
      !reviewer.trim() ||
      state.busy ||
      retry.current
    )
      return
    const task = state.task,
      card = state.card,
      command = uuid(),
      identity = reviewer.trim()
    let reviewed = false
    void act(async ({ api, update }) => {
      if (!reviewed) {
        await api.post(
          `${cardPath(task.task_id, task.current_revision)}/review`,
          {
            command_id: command,
            decision: 'approve',
            expected_feedback_version: card.expected_feedback_version,
          },
          identity,
        )
        reviewed = true
      }
      update({
        card: await api.get<Card>(cardPath(task.task_id, task.current_revision)),
        approved: await api.get<ApprovedPlans>(
          `/cam/tasks/${encodeURIComponent(task.task_id)}/approved-plans`,
        ),
        status: '已回读工艺审批与执行资格',
      })
    })
  }

  async function readNc({ api, update }: Context, cam: CamRun, currentTask = state.task) {
    update({ nc: undefined, files: undefined })
    if (!cam.current_candidate) return
    const nc = await api.get<LiveNc>(ncPath(cam.current_candidate))
    if (
      !sameNcRef(nc.ref, cam.current_candidate) ||
      !cam.plan_ref ||
      !samePlanRef(nc.plan_ref, cam.plan_ref) ||
      !nc.is_current_candidate ||
      nc.plan_ref.task_id !== currentTask?.task_id ||
      nc.plan_ref.revision !== currentTask?.current_revision ||
      nc.plan_ref.result_id !== cam.plan_ref?.result_id ||
      nc.plan_ref.archive_digest !== cam.plan_ref?.archive_digest ||
      !nc.files.length
    )
      throw new Error('NC 候选或工艺版本不匹配')
    assertNcFiles(nc.files)
    const files: NcFile[] = []
    for (const file of [...nc.files].sort((a, b) => a.sequence - b.sequence)) {
      const body = await api.get<NcFile>(
        `${ncPath(nc.ref)}/file?${new URLSearchParams({ file_id: file.file_id })}`,
      )
      if (
        body.file_id !== file.file_id ||
        body.sha256 !== file.sha256 ||
        body.size_bytes !== file.size_bytes ||
        body.filename !== file.filename ||
        body.encoding !== file.encoding ||
        body.setup_id !== file.setup_id ||
        body.sequence !== file.sequence ||
        typeof body.text !== 'string' ||
        !body.text.trim()
      )
        throw new Error('NC 正文与清单不匹配，禁止审核')
      await validateNcFile(body, file)
      files.push(body)
    }
    update({ nc, files, selectedFile: files[0]?.file_id })
  }
  async function watchCam(context: Context, id: string) {
    const { api, signal, update } = context
    for (;;) {
      signal.throwIfAborted()
      let cam = await api.get<CamRun>(`/cam/runs/${encodeURIComponent(id)}`)
      if (
        cam.cam_run_id !== id ||
        cam.plan_ref?.task_id !== state.task?.task_id ||
        cam.plan_ref?.revision !== state.task?.current_revision
      )
        throw new Error('CAM 运行与当前任务修订不匹配')
      if (
        cam.status === 'awaiting_confirmation' &&
        cam.allowed_actions.includes('reconcile') &&
        !cam.reset_required
      ) {
        cam = await api.reconcile<CamRun>(id)
        if (
          cam.cam_run_id !== id ||
          cam.plan_ref?.task_id !== state.task?.task_id ||
          cam.plan_ref?.revision !== state.task?.current_revision
        )
          throw new Error('CAM 恢复结果与当前任务修订不匹配')
      }
      if (cam.allowed_actions.includes('observe') && ['accepted', 'running'].includes(cam.status)) {
        try {
          cam = await api.observe<CamRun>(id)
        } catch (error) {
          if (!(error instanceof CoreHttpError) || error.status !== 409 || error.code !== 8302)
            throw error
          // observe 前运行可能已完成；只读原身份确认终态，不能重发 CAM。
          const latest = await api.get<CamRun>(`/cam/runs/${encodeURIComponent(id)}`)
          if (
            latest.cam_run_id !== id ||
            !samePlanRef(latest.plan_ref, cam.plan_ref) ||
            !['succeeded', 'failed', 'cancelled'].includes(latest.status)
          )
            throw error
          cam = latest
        }
      }
      update({ cam, status: `CAM · ${cam.status} / ${cam.phase}` })
      if (!['accepted', 'running'].includes(cam.status)) {
        if (cam.status === 'succeeded') await readNc(context, cam)
        return
      }
      await pause(signal)
    }
  }
  function startCam() {
    if (
      !executable ||
      !state.task ||
      !state.approved?.execution_profile_id ||
      retry.current ||
      (state.cam &&
        (state.cam.reset_required || !['failed', 'cancelled'].includes(state.cam.status)))
    )
      return
    const body = {
      command_id: uuid(),
      plan_ref: executable.plan_ref,
      execution_profile_id: state.approved.execution_profile_id,
      expected_current_revision: state.task.current_revision,
    }
    let runId: string | undefined
    void act(async (context) => {
      context.update({ nc: undefined, files: undefined, status: 'CAM 请求待确认' })
      runId ??= (await context.api.post<{ context: { cam_run_id: string } }>('/cam/runs', body))
        .context.cam_run_id
      await watchCam(context, runId)
    })
  }
  function refreshCam() {
    if (!state.cam || state.busy || retry.current) return
    const runId = state.cam.cam_run_id
    void act((context) => watchCam(context, runId))
  }
  function approveNc() {
    if (/[^\x20-\x7e]/.test(reviewer)) {
      setState((s) => ({
        ...s,
        error: '审核人 ID 请使用英文字母、数字或英文符号，例如 reviewer-01。',
      }))
      return
    }
    if (
      !state.nc ||
      !state.files ||
      !reviewer.trim() ||
      dirty ||
      state.busy ||
      retry.current ||
      !state.nc.allowed_actions.includes('review')
    )
      return
    const nc = state.nc,
      cam = state.cam!,
      command = uuid(),
      identity = reviewer.trim()
    let reviewed = false
    void act(async (context) => {
      if (!reviewed) {
        await context.api.post(
          `${ncPath(nc.ref)}/review`,
          { command_id: command, nc_ref: nc.ref, decision: 'approve' },
          identity,
        )
        reviewed = true
      }
      await readNc(context, cam)
    })
  }
  function download() {
    if (
      !state.nc ||
      state.nc.review_status !== 'approved' ||
      !state.nc.allowed_actions.includes('download') ||
      dirty ||
      state.busy ||
      retry.current
    )
      return
    const nc = state.nc
    void act(async ({ api, update }) => {
      const receipt = await api.download(nc.ref)
      const { blob, ...downloadReceipt } = receipt
      update({ downloadReceipt })
      const url = URL.createObjectURL(blob),
        link = document.createElement('a')
      link.href = url
      link.download = receipt.filename ?? `NC-${nc.ref.cam_run_id}-v${nc.ref.version}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  return {
    ...state,
    simulation: !!runtime,
    restoreAssetId,
    setRestoreAssetId,
    restoreParseId,
    setRestoreParseId,
    restoreParsedInput,
    restoreTaskId,
    setRestoreTaskId,
    restoreKnownTask,
    reviewer,
    setReviewer: changeReviewer,
    dirty,
    hasUnplannedSupplement,
    activeCam,
    executable,
    agentOpen,
    setAgentOpen,
    updateSession,
    upload,
    parse,
    createPlan,
    replanSupplement: () => {
      if (dirty || !state.session) return
      try {
        supplementValues(state.session.plan, {})
      } catch (error) {
        setState((s) => ({ ...s, error: String(error) }))
        return
      }
      createPlan()
    },
    submitParameters,
    submitChanges,
    submitSupplement,
    approvePlan,
    refreshReadiness,
    startCam,
    refreshCam,
    approveNc,
    download,
    canRetry: !!retry.current && !state.busy,
    retry: () => {
      if (retry.current) void act(retry.current)
    },
    selectFile: (selectedFile: string) => setState((s) => ({ ...s, selectedFile })),
    viewResult: () => updateSession((s) => ({ ...s, resultViewed: true })),
  }
}
export type LiveWorkflow = ReturnType<typeof useLiveWorkflow>
