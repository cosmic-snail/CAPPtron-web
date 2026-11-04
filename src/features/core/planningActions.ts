// 只解释并收紧现有操作条件，不替代服务端批准或执行校验。
type Check = { status: string; message: string; next_action: string }
type ActionState = {
  dirty: boolean
  busy: boolean
  canRetry: boolean
  activeCam: boolean
  reviewer: string
  admission?: string
  error?: string
  executable?: unknown
  cam?: { status: string; reset_required?: boolean }
  card?: { status: string; execution_preflight?: Check }
  task?: { task_id: string; current_revision: number }
  plan?: { result_id: string }
  approved?: {
    execution_configured: boolean
    plans: {
      plan_ref: { task_id: string; result_id: string; revision: number }
      profile_matches: boolean
      preflight?: Check
    }[]
  }
}

function confirmedTerminalCam(cam?: { status: string; reset_required?: boolean }) {
  return !!cam && !cam.reset_required && (cam.status === 'failed' || cam.status === 'cancelled')
}

export function planningActions(state: ActionState) {
  const approved = state.approved?.plans.find(
    (item) =>
      item.plan_ref.task_id === state.task?.task_id &&
      item.plan_ref.result_id === state.plan?.result_id &&
      item.plan_ref.revision === state.task?.current_revision,
  )
  const check = approved?.preflight ?? state.card?.execution_preflight
  const checkReason = check?.status === 'blocked' ? `${check.message}。${check.next_action}` : ''
  const pending = state.busy
    ? '正在处理请求，请等待完成。'
    : state.canRetry
      ? '请求结果待确认，请点击“重试 / 继续查询”。'
      : state.dirty
        ? '有未提交修改，请先提交修改并重新规划。'
        : ''
  const approveReason =
    pending ||
    state.admission ||
    checkReason ||
    (state.card?.status !== 'ready' ? '工艺卡尚未就绪，请查询最新规划结果。' : '') ||
    (approved ? '当前工艺已批准，无需重复批准。' : '') ||
    (!state.reviewer.trim() ? '请填写审核人 ID，再批准当前工艺卡。' : '')
  const runReason =
    pending ||
    (state.cam && !confirmedTerminalCam(state.cam)
      ? '已有 CAM 运行，请点击“查看 CAM / NC”查询结果。'
      : '') ||
    state.admission ||
    checkReason ||
    (!state.approved?.execution_configured ? '执行服务尚未配置，请维护人员检查。' : '') ||
    (!approved ? '请先批准当前工艺卡。' : '') ||
    (!approved?.profile_matches
      ? '当前工艺已批准，但执行配置不匹配。请维护人员核对配置，无需重复批准。'
      : '') ||
    (state.error ? `${state.error}；请先查询并确认结果。` : '') ||
    (!state.executable ? '执行资格尚待确认，请重新查询当前任务。' : '')
  const status =
    state.cam && !confirmedTerminalCam(state.cam)
      ? 'CAM 已提交 · 查看运行结果'
      : approved
        ? runReason
          ? '已批准 · 执行待就绪'
          : '已批准 · 可生成 NC'
        : approveReason
          ? '待处理 · 查看下一步'
          : '待批准当前工艺卡'
  const nextAction = approved
    ? runReason || '点击“运行 Mastercam”生成 NC 候选。'
    : approveReason || '核对工艺后，点击“批准当前工艺卡”。'
  return { approveReason, runReason, status, nextAction }
}
