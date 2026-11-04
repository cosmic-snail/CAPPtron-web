import { sha256Hex } from '../browserCrypto'
import { CommandJournal } from './commandJournal'
import type { CommandDomain, PendingCommand } from './commandJournal'

export async function fileDigest(file: File) {
  const bytes =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as ArrayBuffer)
          reader.onerror = () => reject(reader.error)
          reader.readAsArrayBuffer(file)
        })
  return sha256Hex(bytes)
}

// 先确认原请求持久化，再发送。未收到可确认回执时不丢弃写意图。
export function journalFetcher(
  journal: CommandJournal,
  base: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  return async (input, init = {}) => {
    const url = String(input).slice(base.replace(/\/$/, '').length)
    let pending: PendingCommand | undefined
    if (init.method === 'POST' && init.body) {
      const upload = init.body instanceof File
      const request = upload
        ? {
            filename: (init.body as File).name,
            size_bytes: (init.body as File).size,
            sha256: await fileDigest(init.body as File),
          }
        : (JSON.parse(String(init.body)) as Record<string, unknown>)
      const command = upload
        ? new URLSearchParams(url.split('?')[1]).get('command_id')
        : (request.command_id ?? request.feedback_id)
      if (typeof command === 'string') {
        const location = journal.read()
        const domain: CommandDomain = upload
          ? 'upload'
          : url.endsWith('/feedback')
            ? 'feedback'
            : url.includes('/nc/')
              ? 'nc'
              : url.endsWith('/parse')
                ? 'parse'
                : url === '/planning/tasks'
                  ? 'task'
                  : url.endsWith('/replan')
                    ? 'replan'
                    : url.includes('/process-cards/')
                      ? 'card'
                      : 'cam'
        pending = {
          domain,
          command_id: command,
          request,
          url,
          expected_version:
            domain === 'replan'
              ? Number(request.base_revision)
              : domain === 'card'
                ? Number(request.expected_feedback_version)
                : domain === 'cam'
                  ? Number(request.expected_current_revision)
                  : null,
          task_id: location.task_id,
          asset_id: location.asset_id,
          revision: location.revision,
          reviewer: new Headers(init.headers).get('X-Reviewer-Id') ?? undefined,
        }
        if (location.pending) {
          if (
            JSON.stringify([
              location.pending.url,
              location.pending.request,
              location.pending.reviewer,
            ]) !== JSON.stringify([url, request, pending.reviewer])
          )
            throw new Error('必须先恢复原未决请求，不能创建第二个写意图')
        } else journal.begin(pending)
      }
    }
    signal.throwIfAborted()
    const response = await fetcher(input, { ...init, signal })
    signal.throwIfAborted()
    if (pending && response.ok) {
      const receipt = (await response.clone().json()) as Record<string, unknown>
      const patch: Parameters<CommandJournal['update']>[0] = { pending: undefined }
      if (pending.domain === 'upload' && typeof receipt.asset_id === 'string')
        patch.asset_id = receipt.asset_id
      if (pending.domain === 'parse') patch.parse_command_id = pending.command_id
      if (pending.domain === 'task' && typeof receipt.task_id === 'string') {
        patch.task_id = receipt.task_id
        patch.revision = Number(receipt.current_revision)
      }
      if (pending.domain === 'replan' && typeof receipt.run_id === 'string')
        patch.run_id = receipt.run_id
      if (pending.domain === 'cam') {
        const context = receipt.context as { cam_run_id?: string } | undefined
        patch.cam_run_id = context?.cam_run_id
      }
      journal.update(patch)
    } else if (pending && response.status >= 400 && response.status < 500) {
      const receipt = await response
        .clone()
        .json()
        .catch(() => null)
      if (
        typeof receipt?.error?.code === 'number' &&
        typeof receipt?.error?.message === 'string' &&
        receipt?.request_id
      )
        journal.clearPending(pending.command_id)
    }
    return response
  }
}
