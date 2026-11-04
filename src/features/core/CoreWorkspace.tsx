import { useState } from 'react'
import { randomId } from '../../api/browserCrypto'
import { CoreClient, CoreHttpError, ncPath } from '../../api/core/client'
import type {
  ApprovedPlans,
  Asset,
  CamRun,
  NcVersion,
  ParseResult,
  Plan,
  Task,
} from '../../api/core/client'

const api = new CoreClient(import.meta.env.VITE_API_BASE_URL ?? '')
const id = () => randomId()
const path = (task: Task) => `/planning/tasks/${encodeURIComponent(task.task_id)}`
export function CoreWorkspace() {
  const [asset, setAsset] = useState<Asset>()
  const [parse, setParse] = useState<ParseResult>()
  const [parseCommand, setParseCommand] = useState('')
  const [taskId, setTaskId] = useState('')
  const [task, setTask] = useState<Task>()
  const [plan, setPlan] = useState<Plan>()
  const [card, setCard] = useState<{
    status: string
    expected_feedback_version: number
    card: unknown
  }>()
  const [approved, setApproved] = useState<ApprovedPlans>()
  const [run, setRun] = useState<CamRun>()
  const [runs, setRuns] = useState<CamRun[]>([])
  const [nc, setNc] = useState<NcVersion>()
  const [text, setText] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [rough, setRough] = useState('0.4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<unknown>()
  type PendingPlan = { task_id: string; run_id?: string; body: Record<string, unknown> }
  const [planningRuns, setPlanningRuns] = useState<Record<string, PendingPlan>>({})
  const planningRun = planningRuns[task?.task_id ?? taskId]
  function storePending(pending: PendingPlan) {
    setPlanningRuns((current) => ({ ...current, [pending.task_id]: pending }))
  }
  async function replan(current: Task, body: Record<string, unknown>) {
    const pending = { task_id: current.task_id, body }
    storePending(pending)
    setApproved(undefined)
    setCard(undefined)
    setRun(undefined)
    setNc(undefined)
    setText('')
    try {
      const result = await api.post<{ run_id: string }>(`${path(current)}/replan`, body)
      storePending({ ...pending, run_id: result.run_id })
      return result
    } catch (error) {
      if (error instanceof CoreHttpError && error.status >= 400 && error.status < 500) {
        setPlanningRuns((entries) => {
          const next = { ...entries }
          delete next[current.task_id]
          return next
        })
        setTask(undefined)
        setPlan(undefined)
      }
      throw error
    }
  }
  async function act(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function refreshTask(key: string) {
    setTask(undefined)
    setPlan(undefined)
    setCard(undefined)
    setApproved(undefined)
    setRuns([])
    setRun(undefined)
    setNc(undefined)
    setText('')
    let pending = planningRuns[key]
    if (pending) {
      if (!pending.run_id) {
        const recovered = await api
          .post<{ run_id: string }>(
            `/planning/tasks/${encodeURIComponent(key)}/replan`,
            pending.body,
          )
          .catch((error) => {
            if (error instanceof CoreHttpError && error.status >= 400 && error.status < 500) {
              setPlanningRuns((entries) => {
                const next = { ...entries }
                delete next[key]
                return next
              })
            }
            throw error
          })
        pending = { ...pending, run_id: recovered.run_id }
        storePending(pending)
      }
      const status = await api.get<{ status: string }>(
        `/planning/tasks/${encodeURIComponent(key)}/runs/${encodeURIComponent(pending.run_id!)}`,
      )
      if (['completed', 'failed', 'cancelled'].includes(status.status)) {
        setPlanningRuns((current) => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }
    }
    // 先确认规划终态，再读取当前修订，避免把完成前的修订当作最新版本。
    const next = await api.get<Task>(`/planning/tasks/${encodeURIComponent(key)}`)
    const nextRuns = await api.get<{ runs: CamRun[] }>(`/cam/tasks/${encodeURIComponent(key)}/runs`)
    const nextPlan =
      next.current_revision > 0
        ? await api.get<Plan>(`${path(next)}/results/${next.current_revision}`)
        : undefined
    const nextCard =
      next.current_revision > 0
        ? await api.get<NonNullable<typeof card>>(
            `/process-cards/tasks/${encodeURIComponent(key)}/results/${next.current_revision}`,
          )
        : undefined
    const nextApproved =
      next.current_revision > 0
        ? await api.get<ApprovedPlans>(`/cam/tasks/${encodeURIComponent(key)}/approved-plans`)
        : undefined
    setTask(next)
    setTaskId(next.task_id)
    setRuns(nextRuns.runs)
    setPlan(nextPlan)
    setCard(nextCard)
    setApproved(nextApproved)
  }
  async function refreshRun(key: string) {
    setRun(undefined)
    setNc(undefined)
    setText('')
    const next = await api.get<CamRun>(`/cam/runs/${encodeURIComponent(key)}`)
    setRun(next)
    if (next.current_candidate) {
      const version = await api.get<NcVersion>(ncPath(next.current_candidate))
      const files = await Promise.all(
        version.files.map(
          async (file) => `${file.filename}\n${(await api.file(version.ref, file.file_id)).text}`,
        ),
      )
      setText(files.join('\n\n'))
      setNc(version)
    }
  }
  const roughOperation = plan?.payload.operations.find(
    (op) => op.attributes.parameters?.rough_step !== undefined,
  )
  const executable =
    !planningRun && approved?.execution_configured && approved.execution_profile_id
      ? approved.plans.find(
          (p) =>
            p.profile_matches &&
            p.plan_ref.task_id === task?.task_id &&
            p.plan_ref.revision === task?.current_revision,
        )
      : undefined
  return (
    <section className="core-workspace" aria-label="Core 真实工作区">
      <h2>Core 真实工作区</h2>
      <p>圆环 OD41 / ID39 / 厚5 · 切断侧外缘 C0.2×45° · golden-b7 2.2.0</p>
      <p>此处仅显示 Core 返回。上传、解析、工艺批准与 NC 批准是独立步骤；工程准入由后端决定。</p>
      <fieldset disabled={busy}>
        <legend>1. STEP 与 NX 解析</legend>
        <input
          aria-label="上传真实 STEP"
          type="file"
          accept=".step,.stp"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setRuns([])
            setAsset(undefined)
            setParse(undefined)
            setParseCommand('')
            setTask(undefined)
            setPlan(undefined)
            setCard(undefined)
            setApproved(undefined)
            setRun(undefined)
            setNc(undefined)
            setText('')
            setReceipt(undefined)
            void act(async () => {
              setAsset(await api.upload(file, id()))
            })
          }}
        />
        {asset && (
          <>
            <p>
              已存储 {asset.filename} · {asset.asset_id}（尚未解析）
            </p>
            <button
              onClick={() =>
                void act(async () => {
                  const command = parseCommand || id()
                  setParseCommand(command)
                  setParse(
                    await api.post(`/cad/assets/${asset.asset_id}/parse`, { command_id: command }),
                  )
                })
              }
            >
              执行 NX 解析
            </button>
            <button
              disabled={!parseCommand}
              onClick={() =>
                void act(async () =>
                  setParse(
                    await api.get(
                      `/cad/assets/${asset.asset_id}/parse?command_id=${encodeURIComponent(parseCommand)}`,
                    ),
                  ),
                )
              }
            >
              刷新解析状态
            </button>
          </>
        )}
        {parse && (
          <>
            <p>解析状态：{parse.status}</p>
            <details>
              <summary>解析报告</summary>
              <pre>{JSON.stringify(parse, null, 2)}</pre>
            </details>
          </>
        )}
        <button
          disabled={parse?.status !== 'parsed'}
          onClick={() =>
            void act(async () => {
              const next = await api.post<Task>('/planning/tasks', {
                command_id: id(),
                schema_version: 'template-request-v1',
                payload: {
                  part: {
                    family: 'turning.ring',
                    outer_diameter_mm: 41,
                    inner_diameter_mm: 39,
                    thickness_mm: 5,
                    chamfer: {
                      edge: 'cutoff_side_outer',
                      width_mm: 0.2,
                      angle_deg: 45,
                      axial_side: 'negative_z',
                      top_radius_mm: 0,
                      bottom_radius_mm: 0,
                    },
                  },
                  template: {
                    id: 'golden-b7',
                    version: '2.2.0',
                    digest: 'e0afbf56c74474a135a152a614932e02ee7ea2d43f093f2e3a5f11ce11bb556a',
                  },
                  source: {
                    asset_id: asset!.asset_id,
                    sha256: asset!.sha256,
                    parse_command_id: parse!.command_id,
                  },
                },
              })
              await refreshTask(next.task_id)
            })
          }
        >
          创建模板规划任务
        </button>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>2. 工艺规划与审核</legend>
        <label>
          恢复任务 ID <input value={taskId} onChange={(e) => setTaskId(e.target.value)} />
        </label>
        <button
          disabled={!taskId.trim()}
          onClick={() =>
            void act(async () => {
              setRun(undefined)
              setNc(undefined)
              setText('')
              await refreshTask(taskId)
            })
          }
        >
          读取 / 刷新任务
        </button>
        {task && (
          <>
            <p>
              任务 {task.task_id} · 修订 {task.current_revision} · 反馈 {task.feedback_version}
            </p>
            <button
              disabled={!!planningRun}
              onClick={() =>
                void act(async () => {
                  setReceipt(
                    await replan(task, {
                      command_id: id(),
                      base_revision: task.current_revision,
                      expected_feedback_version: task.feedback_version,
                    }),
                  )
                  await refreshTask(task.task_id)
                })
              }
            >
              生成模板工艺
            </button>
            <label>
              rough_step (mm) <input value={rough} onChange={(e) => setRough(e.target.value)} />
            </label>
            <button
              disabled={
                !!planningRun ||
                !roughOperation ||
                !plan ||
                !Number.isFinite(Number(rough)) ||
                Number(rough) <= 0
              }
              onClick={() =>
                void act(async () => {
                  setReceipt(
                    await replan(task, {
                      command_id: id(),
                      base_revision: task.current_revision,
                      expected_feedback_version: task.feedback_version,
                      parameter_patch: {
                        template_digest: plan!.payload.extensions.template.digest,
                        base_plan_digest: plan!.payload.extensions.plan_digest,
                        changes: [
                          {
                            operation_id: roughOperation!.id,
                            parameter_id: 'rough_step',
                            value: Number(rough),
                            unit: 'mm',
                          },
                        ],
                      },
                    }),
                  )
                  setRun(undefined)
                  setNc(undefined)
                  setText('')
                  await refreshTask(task.task_id)
                })
              }
            >
              提交参数修订
            </button>
          </>
        )}
        {plan && (
          <details open>
            <summary>服务端工艺与准入证据</summary>
            <pre>{JSON.stringify(plan.payload, null, 2)}</pre>
          </details>
        )}
        {card && (
          <details>
            <summary>工艺卡 · {card.status}</summary>
            <pre>{JSON.stringify(card, null, 2)}</pre>
          </details>
        )}
        <label>
          审核人 ID <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        </label>
        <button
          disabled={!!planningRun || !task || card?.status !== 'ready' || !reviewer.trim()}
          onClick={() =>
            void act(async () => {
              setReceipt(
                await api.post(
                  `/process-cards/tasks/${encodeURIComponent(task!.task_id)}/results/${task!.current_revision}/review`,
                  {
                    command_id: id(),
                    decision: 'approve',
                    expected_feedback_version: card!.expected_feedback_version,
                  },
                  reviewer,
                ),
              )
              await refreshTask(task!.task_id)
            })
          }
        >
          批准当前工艺卡
        </button>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>3. Mastercam 与 NC 审核</legend>
        {runs.map((item) => (
          <button key={item.cam_run_id} onClick={() => void act(() => refreshRun(item.cam_run_id))}>
            读取运行 {item.cam_run_id} · {item.status}
          </button>
        ))}
        <p>
          {executable
            ? 'Core 已返回可执行批准计划'
            : '阻塞：尚无匹配当前修订的可执行配置与批准计划。'}
        </p>
        <button
          disabled={!executable}
          onClick={() =>
            void act(async () => {
              const result = await api.post<{ context: { cam_run_id: string } }>('/cam/runs', {
                command_id: id(),
                plan_ref: executable!.plan_ref,
                execution_profile_id: approved!.execution_profile_id,
                expected_current_revision: task!.current_revision,
              })
              setReceipt(result)
              await refreshRun(result.context.cam_run_id)
            })
          }
        >
          运行 Mastercam
        </button>
        {run && (
          <>
            <p>
              CAM {run.cam_run_id} · {run.status} / {run.phase}
            </p>
            <button onClick={() => void act(() => refreshRun(run.cam_run_id))}>
              刷新 CAM / NC
            </button>
            {run.allowed_actions.includes('reconcile') && (
              <button
                onClick={() =>
                  void act(async () => {
                    await api.post(`/cam/runs/${encodeURIComponent(run.cam_run_id)}/reconcile`, {})
                    await refreshRun(run.cam_run_id)
                  })
                }
              >
                核实执行结果
              </button>
            )}
            {run.error != null && <pre>{JSON.stringify(run.error, null, 2)}</pre>}
          </>
        )}
        {nc && (
          <>
            <p>
              NC 版本 {nc.ref.version} · {nc.review_status} · {nc.ref.content_digest}
            </p>
            <pre>{text}</pre>
            <button
              disabled={!nc.allowed_actions.includes('review') || !reviewer.trim()}
              onClick={() =>
                void act(async () => {
                  setReceipt(
                    await api.post(
                      `${ncPath(nc.ref)}/review`,
                      { command_id: id(), nc_ref: nc.ref, decision: 'approve' },
                      reviewer,
                    ),
                  )
                  await refreshRun(run!.cam_run_id)
                })
              }
            >
              批准当前 NC
            </button>
            <button
              disabled={!nc.allowed_actions.includes('download')}
              onClick={() =>
                void act(async () => {
                  const url = URL.createObjectURL((await api.download(nc.ref)).blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `NC-${nc.ref.cam_run_id}-v${nc.ref.version}.zip`
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                })
              }
            >
              下载批准版本
            </button>
          </>
        )}
      </fieldset>
      {planningRun && (
        <p role="status">
          规划运行 {planningRun.run_id ?? String(planningRun.body.command_id)}{' '}
          尚待确认，请刷新任务后再审核或启动 CAM。
        </p>
      )}
      {busy && <p role="status">正在请求 Core…</p>}
      {error && <p role="alert">{error}</p>}
      {receipt != null && (
        <details>
          <summary>最近服务端回执</summary>
          <pre>{JSON.stringify(receipt, null, 2)}</pre>
        </details>
      )}
    </section>
  )
}
