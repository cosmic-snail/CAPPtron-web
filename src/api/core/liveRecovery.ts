import { CoreHttpError } from './client'
import type { Asset, ParseResult, Task, CamRun, CoreClient } from './client'
import type { WorkflowLocation } from './commandJournal'

export class UnrecoverableTaskError extends Error {}

// 恢复只能读取已有身份，写请求必须由原 command_id 的明确重试意图恢复。
export async function recoverLocation(api: CoreClient, location: WorkflowLocation) {
  const asset = location.asset_id
    ? await api.get<Asset>(`/cad/assets/${encodeURIComponent(location.asset_id)}`)
    : undefined
  const parsed =
    location.asset_id && location.parse_command_id
      ? await api.get<ParseResult>(
          `/cad/assets/${encodeURIComponent(location.asset_id)}/parse?${new URLSearchParams({ command_id: location.parse_command_id })}`,
        )
      : undefined
  let task: Task | undefined
  try {
    task = location.task_id
      ? await api.get<Task>(`/planning/tasks/${encodeURIComponent(location.task_id)}`)
      : undefined
  } catch (error) {
    if (error instanceof CoreHttpError && error.status === 404)
      throw new UnrecoverableTaskError('任务不可恢复：Core 中已不存在该任务，请明确创建新任务。')
    throw error
  }
  let cam = location.cam_run_id
    ? await api.get<CamRun>(`/cam/runs/${encodeURIComponent(location.cam_run_id)}`)
    : undefined
  if (task && !location.cam_run_id) {
    const history = await api.get<{ runs: CamRun[] }>(
      `/cam/tasks/${encodeURIComponent(task.task_id)}/runs`,
    )
    const candidates = history.runs.filter(
      (run) =>
        run.plan_ref?.task_id === task.task_id && run.plan_ref.revision === task.current_revision,
    )
    if (candidates.length === 1) cam = candidates[0]
    if (candidates.length > 1)
      throw new Error('此修订有多个 CAM 记录，请用保存的运行身份恢复，不能猜测当前候选')
  }
  if (asset && asset.asset_id !== location.asset_id) throw new Error('恢复资产身份不匹配')
  if (
    parsed &&
    (parsed.asset_id !== asset?.asset_id ||
      parsed.command_id !== location.parse_command_id ||
      parsed.source_sha256 !== asset.sha256)
  )
    throw new Error('恢复解析身份不匹配')
  if (task && task.task_id !== location.task_id) throw new Error('恢复任务身份不匹配')
  if (
    cam &&
    ((location.cam_run_id && cam.cam_run_id !== location.cam_run_id) ||
      cam.plan_ref?.task_id !== task?.task_id)
  )
    throw new Error('恢复 CAM 身份不匹配')
  if (cam && cam.plan_ref?.revision !== task?.current_revision) cam = undefined
  return { asset, parsed, task, cam }
}
