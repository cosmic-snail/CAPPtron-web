import { planningActions } from '../../features/core/planningActions'
import { draftKey, validateDraft } from '../../features/process-planning/processPlan'
import { supplementFields } from '../../api/core/supplement'
import { PlanningSourceSelector } from '../../features/process-planning/PlanningSourceSelector'
import { OperationDetails } from '../../features/process-planning/OperationDetails'
import { TaskMeasurements } from '../../features/process-planning/TaskMeasurements'
import { DemoPlanningProgress } from '../../features/process-planning/DemoPlanningProgress'
import type { WorkflowSession } from '../../features/process-planning/useWorkflowSession'
import type { LiveWorkflow } from '../../features/core/useLiveWorkflow'
import { LiveProgress } from '../../features/core/LiveProgress'

export function ProcessPlanningPage({
  active,
  workflow,
  onReview,
  live,
}: {
  active: boolean
  workflow: WorkflowSession
  onReview: () => void
  live?: LiveWorkflow
}) {
  const {
    session,
    operation,
    readiness,
    taskMissing,
    operationMissing: requiredOperationMissing,
    fieldView,
    selectedButtonRef,
    updateSession,
    loadDemo,
    selectOperation,
    updateDraft,
    demoChoice,
    setDemoChoice,
    caseLoad,
    setCaseLoad,
    setCaseRequest,
  } = workflow
  const parameterAttention = (session?.plan.operations ?? []).flatMap((item) =>
    [
      { section: 'parameters', parameters: item.parameters },
      ...item.steps.map((step) => ({ section: `step-${step.id}`, parameters: step.parameters })),
    ].flatMap(({ section, parameters }) =>
      parameters
        .filter((parameter) => parameter.editable)
        .flatMap((parameter) => {
          const draft = session?.drafts[draftKey(item.id, section, parameter.id)]
          const value = draft ?? String(parameter.value ?? '')
          const status = !value.trim()
            ? '待填'
            : validateDraft(parameter, value)
              ? '待修正'
              : draft !== undefined
                ? '待提交'
                : parameter.source !== 'human'
                  ? '待核对'
                  : null
          return status ? [{ operationId: item.id, section, parameter, status }] : []
        }),
    ),
  )
  const operationMissing = [
    ...requiredOperationMissing,
    ...parameterAttention.filter(
      (item) =>
        (item.status === '待填' || item.status === '待修正') &&
        !requiredOperationMissing.some(
          (required) =>
            required.operationId === item.operationId &&
            required.section === item.section &&
            required.parameter.id === item.parameter.id,
        ),
    ),
  ]
  function operationBadge(id: string) {
    const missing = operationMissing.filter((item) => item.operationId === id)
    if (missing.length) return `待填 ${missing.length}`
    const attention = parameterAttention.filter((item) => item.operationId === id)
    const status = attention.some((item) => item.status === '待提交') ? '待提交' : '待核对'
    const count = attention.filter((item) => item.status === status).length
    return count ? `${status} ${count}` : null
  }
  const supplementalKeys = new Set(
    session ? supplementFields(session.plan).map(({ key }) => key) : [],
  )
  const draftKeys = Object.keys(session?.drafts ?? {})
  const supplementDirty = draftKeys.some((key) => supplementalKeys.has(key))
  const missing = readiness?.missing ?? []
  const submitHint = live?.busy
    ? '正在处理请求，请等待完成。'
    : live?.canRetry
      ? '上一条请求结果待确认，请先点击“重试 / 继续查询”。'
      : live?.activeCam
        ? 'CAM 正在运行，暂不能提交补充信息。'
        : supplementDirty && missing.length
          ? `提交修改暂不可用：还有 ${missing.length} 项未填或格式无效。`
          : !live?.dirty
            ? '修改加工参数或现场信息后，提交修改并重新规划。'
            : '提交修改并重新规划；现场信息将先保存并回读。'
  const totalMissing = taskMissing + operationMissing.length
  const taskInformation = session && (
    <>
      <button
        className="button task-information-button"
        aria-pressed={session.view === 'task'}
        onClick={() => updateSession((current) => ({ ...current, view: 'task' }))}
      >
        <span>任务共用信息</span>
        <span
          className={`input-badge ${taskMissing || (live && !session.plan.taskMeasurements?.length) ? '' : 'draft-complete'}`}
        >
          {live && !session.plan.taskMeasurements?.length
            ? '待接入'
            : taskMissing
              ? `待填 ${taskMissing}`
              : '已补齐'}
        </span>
      </button>
    </>
  )
  const actions = live ? planningActions(live) : undefined
  const statusText = live?.error
    ? live.error
    : session?.plan.onsiteAssessment?.input_status === 'valid' &&
        session.plan.onsiteAssessment.execution_status === 'blocked'
      ? '现场输入有效 · CAM 暂不可执行 · 查看原因'
      : session?.plan.onsiteAssessment?.input_status === 'invalid'
        ? '现场输入需修正 · 查看字段原因'
        : live?.admission
          ? '暂不可批准或执行 · 查看原因'
          : live?.canRetry
            ? '请求结果待确认'
            : live?.busy
              ? '正在处理请求…'
              : live?.dirty
                ? '有未提交修改'
                : live?.supplementStatus
                  ? '现场信息已回读 · 未应用到 CAM'
                  : missing.length
                    ? `待补充 ${missing.length} 项`
                    : '请核对参数与资源'
  return (
    <section
      className={`process-planning-page${live ? ' live-planning-page' : ''}`}
      hidden={!active}
      aria-label="工艺决策"
    >
      {!live && (
        <header className="planning-heading">
          <PlanningSourceSelector
            active={active}
            choice={demoChoice}
            onChoice={setDemoChoice}
            onLoad={loadDemo}
          />
        </header>
      )}
      <p className="plan-source">
        {session
          ? `${session.plan.partName} · ${session.plan.sourceDescription}`
          : live
            ? live.task
              ? live.simulation
                ? '本地模拟 · 当前任务状态见下方。'
                : 'Core 真实模式 · 当前任务状态见下方。'
              : live.busy
                ? '正在处理当前模型，解析完成后将继续生成工艺方案。'
                : live.simulation
                  ? '本地模拟 · 请从模型输入完成上传与解析。'
                  : 'Core 真实模式 · 请从模型输入完成上传与解析。'
            : '本地模型选择不代表已生成工艺计划；Demo 方案需显式加载。'}
      </p>
      {live && (!session || !session.resultViewed) ? (
        <LiveProgress live={live} />
      ) : caseLoad.state !== 'idle' ? (
        <div className="planning-empty">
          {caseLoad.state === 'loading' ? (
            <h3 role="status">正在加载并校验参考案例…</h3>
          ) : (
            <>
              <h3>参考案例加载失败</h3>
              <p role="alert">{caseLoad.message}</p>
              <button
                className="button"
                onClick={() => {
                  setCaseLoad({ state: 'loading' })
                  setCaseRequest((current) =>
                    current ? { ...current, attempt: current.attempt + 1 } : null,
                  )
                }}
              >
                重试案例加载
              </button>
            </>
          )}
        </div>
      ) : session && !session.resultViewed ? (
        <DemoPlanningProgress
          key={session.plan.id}
          startedAt={session.startedAt}
          partName={session.plan.partName}
          onView={() => updateSession((current) => ({ ...current, resultViewed: true }))}
        />
      ) : session ? (
        <div className="decision-columns">
          <aside className="planning-sidebar" aria-label="任务信息与工序">
            <div className="operation-sidebar-list">
              <div className="operation-list-heading">
                <p className="list-heading">工序 · {session.plan.operations.length}</p>
                {!!totalMissing && (
                  <button
                    className="button pending-operation-jump"
                    aria-label={`定位待填信息，${totalMissing} 项`}
                    onClick={() => {
                      if (taskMissing) {
                        updateSession((current) => ({ ...current, view: 'task' }))
                        return
                      }
                      const next = operationMissing[0]!
                      updateSession((current) => ({
                        ...current,
                        selectedId: next.operationId,
                        view: fieldView(next.section),
                      }))
                    }}
                  >
                    待填 {totalMissing} 项 ↓
                  </button>
                )}
              </div>
              {(() => {
                const setups = session.plan.operations.reduce<string[]>((order, item) => {
                  if (item.setupId && order.at(-1) !== item.setupId) order.push(item.setupId)
                  return order
                }, [])
                if (!setups.length) return null
                return (
                  <p className="muted-text" aria-label="装夹顺序">
                    装夹顺序 ·{' '}
                    {setups
                      .map(
                        (setup) =>
                          `${setup}（${session.plan.operations.filter((item) => item.setupId === setup).length}）`,
                      )
                      .join(' → ')}
                  </p>
                )
              })()}
              <nav className="operation-list" aria-label="工序列表">
                {(live || !!session.plan.taskMeasurements?.length) && taskInformation}
                {!session.plan.operations.length && <p className="muted-text">当前方案没有工序</p>}
                {session.plan.operations.map((item) => (
                  <button
                    key={item.id}
                    ref={operation?.id === item.id ? selectedButtonRef : undefined}
                    type="button"
                    className="button operation-button"
                    aria-pressed={session.view !== 'task' && operation?.id === item.id}
                    onClick={() => selectOperation(item.id)}
                    title={
                      operationBadge(item.id) ? `当前工序${operationBadge(item.id)}` : undefined
                    }
                  >
                    <span>{String(item.sequence).padStart(2, '0')}</span>
                    <span>
                      {item.name}
                      {item.setupId ? ` · ${item.setupId}` : ''}
                      {(() => {
                        const native = item.steps
                          .flatMap((step) => step.parameters)
                          .find((parameter) => parameter.id === 'mastercam_operation_id')
                        return native?.value == null ? '' : ` · 原生 ${native.value}`
                      })()}
                    </span>
                    {operationBadge(item.id) && (
                      <span className="input-badge">{operationBadge(item.id)}</span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </aside>
          {session.view === 'task' ? (
            <TaskMeasurements
              plan={session.plan}
              drafts={session.drafts}
              onDraft={updateDraft}
              missingCount={taskMissing}
            />
          ) : operation ? (
            <OperationDetails
              plan={session.plan}
              operation={operation}
              view={session.view}
              onView={(view) => updateSession((current) => ({ ...current, view }))}
              drafts={session.drafts}
              onDraft={updateDraft}
            />
          ) : (
            <div className="planning-empty">
              <h3>暂无工序详情</h3>
              <p>当前方案包含零道工序，未自动补入示例数据。</p>
            </div>
          )}
        </div>
      ) : (
        <div className="planning-empty">
          <h3>暂无可用工艺方案</h3>
          <p>尚未接入工艺模板或上游方案。可在右上角显式加载独立的 Demo 案例。</p>
          <p className="muted-text">所选本地 STEP 文件未上传、未解析，也不会与演示工艺自动关联。</p>
        </div>
      )}
      {live && session?.resultViewed ? (
        <footer className="planning-actions live-planning-actions">
          <div className="live-planning-status">
            <p className="muted-text">
              revision {live.task?.current_revision} · {actions?.status}
            </p>
            <div className="live-status-row">
              <details className="live-status-details">
                <summary aria-label="查看任务状态详情" title={statusText}>
                  <span role={live.error ? 'alert' : 'status'}>{statusText}</span>
                </summary>
                <div
                  className="live-status-popover"
                  role="region"
                  aria-label="任务状态详情"
                  id="supplement-submit-hint"
                >
                  <p>{submitHint}</p>
                  <p id="planning-next-action">{actions?.nextAction}</p>
                  {live.supplementStatus && <p>{live.supplementStatus}</p>}
                  {live.admission && live.admission !== actions?.nextAction && (
                    <p className="warning-text">{live.admission}</p>
                  )}
                  {live.error && <p className="warning-text">{live.error}</p>}
                  {!!missing.length && <p>通过“任务共用信息”和工序的“待填”标记定位字段。</p>}
                  <button
                    className="button"
                    disabled={live.busy || live.canRetry}
                    onClick={live.refreshReadiness}
                  >
                    重新检查执行条件
                  </button>
                </div>
              </details>
              {live.canRetry && (
                <button className="button" onClick={live.retry}>
                  重试 / 继续查询
                </button>
              )}
            </div>
          </div>
          <div className="live-planning-controls">
            <button
              className="button"
              disabled={
                live.busy ||
                live.canRetry ||
                live.activeCam ||
                (!live.dirty && !live.hasUnplannedSupplement) ||
                (supplementDirty && !!missing.length)
              }
              aria-describedby="supplement-submit-hint"
              title={submitHint}
              onClick={live.submitChanges}
            >
              提交修改并重新规划
            </button>
            <label className="live-reviewer-field">
              <span>审核人 ID（{live.simulation ? '模拟' : '声明'}）</span>
              <input
                aria-label="审核人 ID"
                value={live.reviewer}
                disabled={live.busy || live.canRetry}
                onChange={(e) => live.setReviewer(e.target.value)}
              />
            </label>
            <button
              className="button"
              disabled={!!actions?.approveReason}
              title={actions?.approveReason || '批准当前工艺卡'}
              aria-describedby="planning-next-action"
              onClick={live.approvePlan}
            >
              批准当前工艺卡
            </button>
            <button
              className="button primary-button"
              disabled={!!actions?.runReason}
              title={actions?.runReason || '运行 Mastercam'}
              aria-describedby="planning-next-action"
              onClick={() => {
                live.startCam()
                onReview()
              }}
            >
              运行 Mastercam
            </button>
            {live.cam && (
              <button className="button" onClick={onReview}>
                查看 CAM / NC
              </button>
            )}
          </div>
        </footer>
      ) : (
        !live &&
        (!session || session.resultViewed) && (
          <footer className="planning-actions">
            <p className="muted-text" id="planning-readiness">
              {!session
                ? '请先加载演示方案。'
                : readiness?.missing.length
                  ? `还有 ${readiness.missing.length} 项必填信息待补充；填写完整且格式有效后启用审核入口。`
                  : !readiness?.ready
                    ? '工序或工步信息不完整，暂不能进入下一步。'
                    : '必填信息已补齐 · 仅完成演示填写，未完成制造校核。'}
              <br />
              Mock 方案未经机加工专家确认。
            </p>
            <div>
              <button
                type="button"
                className="button"
                disabled={!operation && !session?.plan.taskMeasurements?.length}
                onClick={() => {
                  const next = readiness?.missing.find((item) => item.parameter.editable)
                  updateSession((current) => ({
                    ...current,
                    selectedId:
                      next?.section === 'task'
                        ? current.selectedId
                        : (next?.operationId ?? current.selectedId),
                    view: next
                      ? fieldView(next.section)
                      : session?.plan.taskMeasurements?.length
                        ? 'task'
                        : 'onsite',
                  }))
                }}
              >
                补充工序信息
              </button>
              <button
                type="button"
                className="button primary-button"
                disabled={!readiness?.ready}
                aria-describedby="planning-readiness"
                onClick={onReview}
              >
                查看参考程序并进入审核
              </button>
            </div>
          </footer>
        )
      )}
    </section>
  )
}
