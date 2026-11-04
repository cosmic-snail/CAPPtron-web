import { useEffect, useRef, useState } from 'react'
import type { WorkflowSession } from '../../features/process-planning/useWorkflowSession'
import { localProgramContentReader } from '../../api/program-content/reader'
import type { ProgramContentReader } from '../../api/program-content/reader'
import {
  applyProgramChange,
  canReviewProgram,
  confirmProgram,
  createProgramDocument,
  exportProgramDraft,
  saveProgramDraft,
} from '../../features/program-review/programDocument'
import type { ProgramDocument } from '../../features/program-review/programDocument'
import { ProgramEditor } from '../../features/program-review/ProgramEditor'
import { ProgramDiff } from '../../features/program-review/ProgramDiff'
import { useNcDraft } from '../../features/program-review/useNcDraft'
import type { LiveWorkflow } from '../../features/core/useLiveWorkflow'
import { LiveFeedback, LiveProgress } from '../../features/core/LiveProgress'

type Props = {
  workflow: WorkflowSession
  onBack: () => void
  onOpenAgent?: () => void
  reader?: ProgramContentReader
  active?: boolean
  live?: LiveWorkflow
}
export function ProgramReviewPage(props: Props) {
  return props.live ? (
    <LiveProgramReview
      key={JSON.stringify([
        props.live.simulation,
        props.live.task?.task_id,
        props.live.nc?.ref,
        props.live.selectedFile,
      ])}
      live={props.live}
      onBack={props.onBack}
      active={props.active}
      onOpenAgent={props.onOpenAgent}
    />
  ) : (
    <DemoProgramReview {...props} />
  )
}
function LiveProgramReview({
  live,
  onBack,
  active = true,
  onOpenAgent,
}: {
  live: LiveWorkflow
  onBack: () => void
  active?: boolean
  onOpenAgent?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const expandButton = useRef<HTMLButtonElement>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const file = live.files?.find((f) => f.file_id === live.selectedFile)
  const nc = live.nc
  const reviewStatus =
    nc?.review_status === 'approved'
      ? `程序可用 · ${live.simulation ? '模拟确认' : '人工确认'}`
      : nc?.review_status === 'pending'
        ? '待人工确认'
        : nc?.review_status
  const identity = nc ? JSON.stringify(nc.ref) : ''
  const draft = useNcDraft(
    JSON.stringify([live.simulation, live.task?.task_id, identity, file?.file_id, file?.sha256]),
    (file?.text ?? '').replace(/\r\n|\r/g, '\n'),
    JSON.stringify([live.simulation, live.task?.task_id, identity]),
  )
  useEffect(() => {
    if (confirmation && active) dialog.current?.showModal()
    else dialog.current?.close()
    if (!active) {
      setConfirmation(null)
      setExpanded(false)
    }
  }, [confirmation, active])
  return (
    <section
      className={`program-review-page${expanded ? ' code-expanded' : ''}`}
      aria-label="程序审核"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !confirmation) {
          setExpanded(false)
          expandButton.current?.focus()
        }
      }}
    >
      {!(nc && file) && (
        <header className="review-heading">
          <button className="button" onClick={onBack}>
            返回工艺决策
          </button>
        </header>
      )}
      {nc && file ? (
        <div className="program-panel">
          <div className="program-toolbar">
            <div>
              <div className="program-document-heading">
                <h3>
                  {file.filename} · NC v{nc.ref.version}
                </h3>
              </div>
              <p className="muted-text">
                {file.setup_id} · {file.encoding} / {file.newline} · {file.size_bytes} 字节 ·
                SHA-256 {file.sha256} · {nc.origin} ·{' '}
                {draft.changed ? '本地草稿 · 未提交服务端' : reviewStatus}
              </p>
            </div>
            <div className="program-tools">
              <button
                className="button"
                onClick={() => {
                  setExpanded(false)
                  onBack()
                }}
              >
                返回工艺决策
              </button>
              <button
                className="button"
                aria-pressed={diffOpen}
                onClick={() => setDiffOpen(!diffOpen)}
              >
                查看差异
              </button>
              <details
                className="nc-draft-menu"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button'))
                    event.currentTarget.open = false
                }}
              >
                <summary className="button">草稿操作</summary>
                <div>
                  <button
                    className="button"
                    disabled={!draft.changed}
                    onClick={() =>
                      draft.update(file.text.replace(/\r\n|\r/g, '\n'), draft.saved, '恢复原文')
                    }
                  >
                    恢复原文
                  </button>
                  <button
                    className="button"
                    disabled={draft.text === draft.saved}
                    onClick={() => draft.update(draft.saved, draft.saved, '恢复暂存')}
                  >
                    恢复暂存
                  </button>

                  <button
                    className="button"
                    disabled={draft.text === draft.saved}
                    onClick={draft.save}
                  >
                    保存本地草稿
                  </button>
                  <button
                    className="button"
                    onClick={() => draft.exportDraft(file.filename, file.newline)}
                  >
                    导出本地草稿
                  </button>
                  <details className="nc-draft-history">
                    <summary>本地修订记录 · r{draft.revision}</summary>
                    <p className="muted-text">最近 20 次操作 · 非服务端审批记录</p>
                    {draft.history.length ? (
                      draft.history.map((item) => (
                        <p key={item.revision}>
                          r{item.revision} · {item.reason} ·{' '}
                          {new Date(item.at).toLocaleTimeString()}
                        </p>
                      ))
                    ) : (
                      <p>暂无本地修改</p>
                    )}
                  </details>
                </div>
              </details>
              <select
                aria-label="NC 文件"
                value={file.file_id}
                onChange={(e) => live.selectFile(e.target.value)}
              >
                {live.files?.map((item) => (
                  <option key={item.file_id} value={item.file_id}>
                    {item.setup_id} · {item.filename}
                  </option>
                ))}
              </select>
              <button
                className="button"
                ref={expandButton}
                aria-expanded={expanded}
                aria-pressed={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? '退出专注编辑' : '展开代码'}
              </button>
              {expanded && onOpenAgent && (
                <button className="button" onClick={onOpenAgent}>
                  Agent 协同
                </button>
              )}
            </div>
          </div>
          <div className={`program-content${diffOpen ? ' with-diff' : ''}`}>
            <ProgramEditor
              document={{
                id: `${identity}/${file.file_id}`,
                revision: draft.revision,
                draftText: draft.text,
              }}
              onChange={(text) => draft.update(text)}
            />
            {diffOpen && (
              <ProgramDiff original={file.text.replace(/\r\n|\r/g, '\n')} draft={draft.text} />
            )}
          </div>
          <footer className="program-actions">
            <div>
              <p className="warning-text">
                精确版本人工审核 ·{' '}
                {draft.groupChanged
                  ? '有本地草稿修改；恢复各文件原文后可审核服务端版本'
                  : live.dirty
                    ? '工艺有未提交草稿，禁止审核和下载'
                    : '未替代制造安全验证'}
              </p>
              {draft.error && <p role="alert">{draft.error}</p>}
              <LiveFeedback live={live} />
            </div>
            <div className="program-tools">
              <label>
                审核人 ID（{live.simulation ? '模拟' : '声明'}）
                <input
                  aria-label="审核人 ID"
                  disabled={live.busy || live.canRetry}
                  value={live.reviewer}
                  onChange={(e) => live.setReviewer(e.target.value)}
                />
              </label>
              <button
                className="button primary-button"
                disabled={
                  live.busy ||
                  live.canRetry ||
                  live.dirty ||
                  draft.groupChanged ||
                  !live.reviewer.trim() ||
                  !nc.allowed_actions.includes('review')
                }
                onClick={() => setConfirmation(identity)}
              >
                程序可用
              </button>
              <button
                className="button"
                disabled={
                  live.busy ||
                  live.canRetry ||
                  live.dirty ||
                  draft.groupChanged ||
                  nc.review_status !== 'approved' ||
                  !nc.allowed_actions.includes('download')
                }
                onClick={live.download}
              >
                下载已确认版本
              </button>
            </div>
          </footer>
        </div>
      ) : (
        <LiveProgress live={live} cam />
      )}
      <dialog
        className="review-dialog nc-confirm-dialog"
        ref={dialog}
        onCancel={() => setConfirmation(null)}
        aria-labelledby="live-nc-confirm"
        aria-describedby="live-nc-confirm-description"
      >
        <div className="nc-confirm-heading">
          <h3 id="live-nc-confirm">确认程序可用</h3>
          {live.simulation && <span className="nc-confirm-badge">模拟</span>}
        </div>
        <p id="live-nc-confirm-description">确认以下版本已完成人工审核。</p>
        <dl className="nc-confirm-info">
          <div>
            <dt>确认范围</dt>
            <dd>
              NC v{nc?.ref.version} · 全部 {nc?.files.length ?? 0} 个文件
            </dd>
          </div>
          <div>
            <dt>审核人</dt>
            <dd>{live.reviewer}</dd>
          </div>
        </dl>
        <div className="program-tools">
          <button className="button" onClick={() => setConfirmation(null)}>
            取消
          </button>
          <button
            className="button primary-button"
            disabled={
              !nc || confirmation !== identity || live.dirty || live.busy || draft.groupChanged
            }
            onClick={() => {
              if (confirmation === identity && !draft.groupChanged) live.approveNc()
              setConfirmation(null)
            }}
          >
            确认可用
          </button>
        </div>
      </dialog>
    </section>
  )
}

function DemoProgramReview({
  workflow,
  onBack,
  onOpenAgent,
  reader = localProgramContentReader,
  active = true,
}: {
  workflow: WorkflowSession
  onBack: () => void
  onOpenAgent?: () => void
  reader?: ProgramContentReader
  active?: boolean
}) {
  const { session, updateSession, readiness } = workflow
  const document = session?.program
  const catalog = session?.caseDocument
  const asset = catalog?.programAssets.find(
    (item) => item.kind === 'nc' && item.planId === catalog.processPlan.id,
  )
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [diffOpen, setDiffOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    action: 'review' | 'export'
    id: string
    revision: number
    context: number
  } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const updateRef = useRef(updateSession)
  useEffect(() => {
    updateRef.current = updateSession
  })
  const taskKey = session?.taskKey
  useEffect(() => {
    if (!catalog || !asset || !taskKey || document) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    reader
      .read(catalog, asset, controller.signal)
      .then((content) => {
        if (controller.signal.aborted) return
        updateRef.current((current) =>
          current.taskKey !== taskKey || current.program
            ? current
            : {
                ...current,
                program: createProgramDocument(
                  {
                    taskKey,
                    sourceAssetId: asset.id,
                    caseId: catalog.case.id,
                    caseVersion: catalog.caseVersion.version,
                    caseContentDigest: catalog.contentDigest,
                    planId: catalog.processPlan.id,
                  },
                  content,
                ),
              },
        )
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '参考程序读取失败。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [catalog, asset, taskKey, document, attempt, reader])
  useEffect(() => {
    if (active && confirmation) dialog.current?.showModal()
    else dialog.current?.close()
    if (!active) {
      setConfirmation(null)
      setExpanded(false)
    }
  }, [confirmation, active])

  function change(text: string, revision: number, reason: string) {
    if (!document) return
    updateSession((current) => {
      if (!current.program) return current
      // reducer 内再次检查，避免两个异步建议都依据同一旧修订通过。
      const program = applyProgramChange(current.program, {
        documentId: document.id,
        taskKey: document.taskKey,
        expectedRevision: revision,
        text,
        actor: 'human',
        reason,
      })
      return { ...current, program }
    })
  }
  function mutate(update: (program: ProgramDocument) => ProgramDocument) {
    updateSession((current) =>
      current.program ? { ...current, program: update(current.program) } : current,
    )
  }
  function completeAction() {
    if (!document || !confirmation || !session) return
    if (
      document.id !== confirmation.id ||
      document.revision !== confirmation.revision ||
      session.contextRevision !== confirmation.context
    ) {
      setError('程序或任务上下文已变化，请基于当前修订重新操作。')
      setConfirmation(null)
      return
    }
    try {
      if (confirmation.action === 'review')
        mutate((program) => confirmProgram(program, confirmation.revision, session.contextRevision))
      else {
        const { bytes, filename } = exportProgramDraft(document, confirmation.revision)
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
        const link = window.document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败。')
    }
    setConfirmation(null)
  }
  const usable = document && canReviewProgram(document)
  const reviewed =
    document?.review?.revision === document?.revision &&
    document?.review?.contextRevision === session?.contextRevision &&
    !!document?.review
  const reviewStatus =
    document?.source === 'demo_fixture'
      ? '仅测试 · 不可审核'
      : reviewed
        ? '已人工演示确认'
        : document?.reviewInvalidated
          ? '需要重新审核'
          : '待人工演示确认'
  return (
    <section
      className={`program-review-page${expanded ? ' code-expanded' : ''}`}
      aria-label="程序审核"
      onKeyDown={(event) => {
        // 对话框优先处理 Escape，关闭对话框不会同时退出编辑视图。
        if (expanded && event.key === 'Escape' && !event.defaultPrevented && !confirmation) {
          event.preventDefault()
          setExpanded(false)
          expandButton.current?.focus()
        }
      }}
    >
      <header className="review-heading">
        <div className="review-title">
          <span className="warning-text" role="status">
            {document ? `修订 r${document.revision} · ${reviewStatus}` : '尚无可审核正文'}
          </span>
        </div>
        <button className="button" onClick={onBack}>
          返回工艺决策
        </button>
      </header>
      <div className="review-source">
        <p>
          {catalog
            ? `${catalog.case.name} / ${catalog.caseVersion.version} · ${catalog.processPlan.operations.length} 道工序 · ${asset?.id ?? '无程序引用'}`
            : '尚未关联参考程序；请在工艺决策选择案例。'}
        </p>
        <p className="warning-text">
          {document?.source === 'demo_fixture'
            ? '不可执行的合成测试文本 · 不是 Mastercam 输出 · 禁止 NC 审核与导出'
            : catalog
              ? `当前展示的是 ${catalog.case.id === 'golden-b7' ? 'Golden-B7' : catalog.case.name} 历史参考程序，未执行本次 CAM 程序生成。`
              : '本次未执行 CAM 程序生成。'}
        </p>
        <p className="muted-text">
          {readiness?.ready ? '演示字段格式完整' : '演示字段尚未完整'} ·
          现场条件变化不会重新生成历史 NC；该程序不一定与当前条件适配。
        </p>
      </div>
      {document ? (
        <div className="program-panel">
          <div className="program-toolbar">
            <div>
              <div className="program-document-heading">
                <h3>
                  {document.sourceAssetId}
                  {expanded && ` / ${document.caseVersion}`} · 草稿 r{document.revision}
                </h3>
                {expanded && (
                  <span className="warning-text focus-review-status" role="status">
                    {reviewStatus}
                  </span>
                )}
              </div>
              <p className="muted-text" role="status">
                {document.draftText !== document.savedDraftText
                  ? '未保存修改'
                  : document.savedRevision
                    ? `已暂存草稿 r${document.savedRevision}（刷新后丢失）`
                    : '原始参考 · 尚未暂存'}{' '}
                · {document.format.encoding.toUpperCase()} / {document.format.newline}
                {document.format.bom ? ' / BOM' : ''}
                {expanded && (
                  <span className="warning-text">
                    {' · '}
                    {document.source === 'demo_fixture'
                      ? '合成测试 · 不可执行'
                      : document.source === 'historical_reference'
                        ? '历史参考 · 本次未执行 CAM'
                        : 'CAM 来源'}
                  </span>
                )}
              </p>
            </div>
            <div className="program-tools">
              <button
                className="button"
                aria-pressed={diffOpen}
                onClick={() => setDiffOpen(!diffOpen)}
              >
                查看差异
              </button>
              <button
                className="button"
                disabled={document.draftText === document.originalText}
                onClick={() => change(document.originalText, document.revision, '恢复原文')}
              >
                恢复原文
              </button>
              <button
                className="button"
                disabled={!document.savedRevision || document.draftText === document.savedDraftText}
                onClick={() => change(document.savedDraftText, document.revision, '恢复暂存')}
              >
                恢复暂存
              </button>
              <button
                className="button"
                ref={expandButton}
                aria-pressed={expanded}
                aria-expanded={expanded}
                title={expanded ? '退出专注编辑（Esc）' : '展开代码，进入专注编辑'}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? '退出专注编辑' : '展开代码'}
              </button>
              {expanded && onOpenAgent && (
                <button className="button" onClick={onOpenAgent} aria-haspopup="dialog">
                  Agent 协同
                </button>
              )}
            </div>
          </div>
          <div className={`program-content${diffOpen ? ' with-diff' : ''}`}>
            <ProgramEditor
              document={document}
              onChange={(text, revision) => change(text, revision, '编辑程序')}
            />
            {diffOpen && (
              <ProgramDiff original={document.originalText} draft={document.draftText} />
            )}
          </div>
          <footer className="program-actions">
            <div>
              <p className="warning-text">仅会话演示确认 · 不代表制造安全验证</p>
              <p className="muted-text">
                修改记录 {document.history.length} 条 · 最近来源：
                {document.lastModifiedBy === 'agent'
                  ? 'Agent'
                  : document.lastModifiedBy === 'human'
                    ? '人工'
                    : '原始参考'}{' '}
                · 刷新将丢失草稿
              </p>
            </div>
            <div className="program-tools">
              <button
                className="button"
                title="暂存当前代码，供之后恢复；仅保留在当前页面内存中，刷新或关闭后丢失"
                onClick={() => mutate(saveProgramDraft)}
              >
                暂存草稿
              </button>
              <button
                className="button primary-button"
                disabled={!usable}
                onClick={() =>
                  setConfirmation({
                    action: 'review',
                    id: document.id,
                    revision: document.revision,
                    context: session!.contextRevision,
                  })
                }
              >
                确认可用
              </button>
              <button
                className="button"
                disabled={!usable}
                onClick={() =>
                  setConfirmation({
                    action: 'export',
                    id: document.id,
                    revision: document.revision,
                    context: session!.contextRevision,
                  })
                }
              >
                下载程序草稿
              </button>
            </div>
          </footer>
        </div>
      ) : (
        <div className="review-empty">
          <h3>{loading ? '正在核验本机参考程序…' : '参考程序正文暂不可用'}</h3>
          <p>
            {asset
              ? `历史引用：${asset.id} · ${asset.sizeBytes ?? '未知'} 字节`
              : '仅进入页面不会生成 NC。请先选择具有历史程序引用的案例。'}
          </p>
          {asset?.sha256 && <p className="asset-digest">SHA-256：{asset.sha256}</p>}
          <p>无正文时不能编辑、人工确认或下载，不自动替换为示例加工代码。</p>
          {asset && (
            <button className="button" disabled={loading} onClick={() => setAttempt(attempt + 1)}>
              重试读取参考程序
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}
      <details className="review-evidence">
        <summary>历史证据与当前修改记录</summary>
        <div>
          {catalog?.verificationEvidence.map((evidence) => (
            <p key={evidence.id}>
              {evidence.id}：{evidence.limitations.join(' ')}
            </p>
          ))}
          {document?.history.map((item) => (
            <p key={item.revision}>
              r{item.revision} · {item.actor === 'human' ? '人工' : 'Agent'} · {item.reason}
            </p>
          ))}
          <p>历史证据不会成为当前草稿的审核结论。</p>
        </div>
      </details>
      <dialog
        ref={dialog}
        className="review-dialog"
        onCancel={() => setConfirmation(null)}
        aria-labelledby="review-dialog-title"
      >
        <h3 id="review-dialog-title">
          {confirmation?.action === 'review' ? '人工演示确认' : '导出当前程序草稿'} · r
          {confirmation?.revision}
        </h3>
        <p>
          {confirmation?.action === 'review'
            ? '此操作仅记录当前程序修订在本次会话中的人工演示确认，不代表通过 CAM 仿真、碰撞检测、机床适配或实际加工验证。'
            : '将导出此刻的草稿修订，文件名包含 draft；它不是原始基线，也未经过制造安全验证。保留已识别的编码及换行不代表机床兼容。'}
        </p>
        <p className="muted-text">
          现场条件修改不会自动重新生成 NC。当前程序需另行进行适配与制造验证。
        </p>
        <div className="program-tools">
          <button className="button" onClick={() => setConfirmation(null)}>
            取消
          </button>
          <button className="button primary-button" onClick={completeAction}>
            {confirmation?.action === 'review' ? '记录本次演示确认' : '导出此修订'}
          </button>
        </div>
      </dialog>
    </section>
  )
}
