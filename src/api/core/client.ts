import { sha256Hex } from '../browserCrypto'
import type { ExecutionPreflight } from './contracts'
import type { NcFile } from './contracts'
export type Task = { task_id: string; current_revision: number; feedback_version: number }
export type NcRef = { cam_run_id: string; version: number; content_digest: string }
export type PlanRef = {
  task_id: string
  result_id: string
  revision: number
  archive_digest: string
}
export type CamRun = {
  plan_ref?: PlanRef
  observation?: { state: string | null; availability: string } | null
  cam_run_id: string
  status: string
  phase: string
  current_candidate: NcRef | null
  allowed_actions: string[]
  error?: { code: number; message: string } | null
  reset_required?: boolean
}
export type NcVersion = {
  ref: NcRef
  review_status: string
  allowed_actions: string[]
  files: { file_id: string; filename: string }[]
}
export type ApprovedPlans = {
  execution_configured: boolean
  execution_profile_id: string | null
  plans: { plan_ref: PlanRef; profile_matches: boolean; preflight?: ExecutionPreflight }[]
}
export type Plan = {
  payload: {
    operations: { id: string; attributes: { parameters?: Record<string, number> } }[]
    extensions: {
      template: { digest: string }
      plan_digest: string
      reference_only: boolean
      execution_ready: boolean
    }
  }
}
export type ParseResult = {
  command_id: string
  asset_id: string
  source_sha256: string
  status: 'running' | 'parsed' | 'failed'
  report_sha256?: string
  analysis?: unknown
  diagnostic?: unknown
  execution_ready: false
}
export type Asset = { asset_id: string; sha256: string; filename: string; status: string }
export const sameNcRef = (a: NcRef | null | undefined, b: NcRef | null | undefined) =>
  !!a &&
  !!b &&
  a.cam_run_id === b.cam_run_id &&
  a.version === b.version &&
  a.content_digest === b.content_digest
export const samePlanRef = (a: PlanRef | null | undefined, b: PlanRef | null | undefined) =>
  !!a &&
  !!b &&
  a.task_id === b.task_id &&
  a.result_id === b.result_id &&
  a.revision === b.revision &&
  a.archive_digest === b.archive_digest
export type NcDownload = {
  blob: Blob
  ref: NcRef
  filename: string | null
  sha256: string | null
  contentType: string | null
  contentDisposition: string | null
  sourceUrl: string
  digestVerified: boolean
}
const sha256 = (bytes: ArrayBuffer) => sha256Hex(bytes)
export function assertNcFiles(files: Omit<NcFile, 'text' | 'newline'>[]) {
  if (
    !files.length ||
    ['file_id', 'filename', 'sequence'].some(
      (key) => new Set(files.map((file) => file[key as 'file_id'])).size !== files.length,
    )
  )
    throw new Error('NC 文件清单为空或存在重复身份，禁止审核')
}
export async function validateNcFile(body: NcFile, expected: Omit<NcFile, 'text' | 'newline'>) {
  if (
    ['file_id', 'filename', 'setup_id', 'sequence', 'encoding', 'sha256', 'size_bytes'].some(
      (key) => body[key as keyof NcFile] !== expected[key as keyof typeof expected],
    ) ||
    typeof body.text !== 'string' ||
    !body.text.trim() ||
    !['lf', 'crlf', 'cr', 'mixed', 'none'].includes(body.newline)
  )
    throw new Error('NC 正文与清单不匹配，禁止审核')
  const endings = new Set(body.text.match(/\r\n|\r|\n/g) ?? [])
  const actualNewline =
    endings.size > 1
      ? 'mixed'
      : ({ '\r\n': 'crlf', '\r': 'cr', '\n': 'lf' }[Array.from(endings)[0] ?? ''] ?? 'none')
  if (
    body.newline !== actualNewline ||
    (body.encoding.toLowerCase() === 'ascii' &&
      Array.from(body.text).some((character) => character.charCodeAt(0) > 127))
  )
    throw new Error('NC 编码或换行与正文不匹配，禁止审核')
  // UTF-8 可以从正文精确恢复原字节；其他编码仍保留服务器提供的编码及摘要。
  if (['utf-8', 'utf8', 'ascii'].includes(body.encoding.toLowerCase())) {
    const bytes = new TextEncoder().encode(body.text)
    if (
      bytes.byteLength !== body.size_bytes ||
      (await sha256(bytes.buffer)) !== body.sha256.toLowerCase()
    )
      throw new Error('NC 正文字节摘要不匹配，禁止审核')
  }
  return body
}
const part = encodeURIComponent
export const ncPath = (ref: NcRef) => `/cam/runs/${part(ref.cam_run_id)}/nc/versions/${ref.version}`
export const cardPath = (task: string, revision: number) => {
  const token = btoa(
    Array.from(new TextEncoder().encode(task), (byte) => String.fromCharCode(byte)).join(''),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `/process-cards/tasks/id_${token}/results/${revision}`
}
export class CoreHttpError extends Error {
  readonly confirmed: boolean
  readonly code?: number
  constructor(
    readonly status: number,
    detail: string,
    readonly method = 'GET',
  ) {
    let message = `Core HTTP ${status}`
    let confirmed = false
    let code: number | undefined
    try {
      const data = JSON.parse(detail)
      confirmed =
        typeof data.error?.code === 'number' &&
        typeof data.error?.message === 'string' &&
        !!data.request_id
      if (confirmed) code = data.error.code
      message += ` · ${data.error?.code ?? 'request_failed'} · ${data.error?.message ?? '请求失败'} · request ${data.request_id ?? '未知'}`
    } catch {
      message += ' · 无有效 Core 错误回执，操作结果待查询'
    }
    super(message)
    this.confirmed = confirmed
    this.code = code
  }
}
export class CoreClient {
  private pending = new Map<string, string>()
  constructor(
    readonly base: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(this.base.replace(/\/$/, '') + path, init)
    if (!response.ok)
      throw new CoreHttpError(response.status, await response.text(), init.method ?? 'GET')
    return response.json() as Promise<T>
  }
  get<T>(path: string) {
    return this.request<T>(path, { cache: 'no-store' })
  }
  observe<T>(run: string) {
    return this.request<T>(`/cam/runs/${part(run)}/observe`, { method: 'POST' })
  }
  reconcile<T>(run: string) {
    return this.request<T>(`/cam/runs/${part(run)}/reconcile`, { method: 'POST' })
  }
  async post<T>(path: string, body: Record<string, unknown>, reviewer?: string) {
    const { command_id: command, ...content } = body
    const key = JSON.stringify([path, content, reviewer])
    const commandId = typeof command === 'string' ? (this.pending.get(key) ?? command) : undefined
    if (commandId) this.pending.set(key, commandId)
    try {
      const result = await this.request<T>(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(reviewer ? { 'X-Reviewer-Id': reviewer } : {}),
        },
        body: JSON.stringify(commandId ? { ...content, command_id: commandId } : body),
      })
      this.pending.delete(key)
      return result
    } catch (error) {
      if (error instanceof CoreHttpError && error.status >= 400 && error.status < 500)
        this.pending.delete(key)
      throw error
    }
  }
  upload(file: File, command: string) {
    return this.request<Asset>(
      `/cad/assets?${new URLSearchParams({ filename: file.name, command_id: command })}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
    )
  }
  file(ref: NcRef, id: string) {
    return this.get<{ text: string }>(`${ncPath(ref)}/file?${new URLSearchParams({ file_id: id })}`)
  }
  async download(ref: NcRef) {
    const response = await this.fetcher(this.base.replace(/\/$/, '') + ncPath(ref) + '/download', {
      cache: 'no-store',
    })
    if (!response.ok) throw new CoreHttpError(response.status, await response.text())
    const bytes = await response.arrayBuffer()
    const blob = new Blob([bytes], { type: response.headers.get('Content-Type') ?? '' })
    const digest = response.headers.get('X-Content-SHA256')
    if (
      digest !== null &&
      (!/^[a-f0-9]{64}$/i.test(digest) || (await sha256(bytes)) !== digest.toLowerCase())
    )
      throw new Error('NC 下载包摘要不匹配')
    const disposition = response.headers.get('Content-Disposition')
    const filename = disposition?.match(/filename="([^"\r\n]+)"/i)?.[1] ?? null
    return {
      blob,
      ref: { ...ref },
      filename,
      sha256: digest,
      contentType: response.headers.get('Content-Type'),
      contentDisposition: disposition,
      sourceUrl: response.url || this.base.replace(/\/$/, '') + ncPath(ref) + '/download',
      digestVerified: digest !== null,
    } satisfies NcDownload
  }
}
