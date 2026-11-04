import { useEffect, useLayoutEffect, useRef } from 'react'
import type { AgentMessage } from './agentSession'
import type { ProcessPlan } from '../process-planning/processPlan'
import type { LiveAgent } from './useLiveAgent'
import { LiveAgentLog } from './LiveAgentLog'

/** 已确认基线中真实模式 Agent 不可用时的说明。 */
export const LIVE_AGENT_UNAVAILABLE = 'Agent 服务尚未接入，暂不能发送消息。'

/**
 * 真实联调模式传 liveAgent 时必须同时给出不可用说明：只有 Core 确认 Agent 可用时
 * 才切换为对话界面，其余状态都显示基线的不可用抽屉，不能落回 Demo。
 */
type AgentMode =
  | { liveAgent?: undefined; unavailableReason?: string }
  | { liveAgent: LiveAgent; unavailableReason: string }

export function AgentDrawer({
  open,
  onClose,
  plan,
  operationId,
  onOperation,
  messages,
  input,
  onInput,
  onSend,
  programContext,
  unavailableReason: reasonProp,
  liveAgent,
}: AgentMode & {
  programContext?: string
  open: boolean
  onClose: () => void
  plan: ProcessPlan | null
  operationId: string | null
  onOperation: (id: string) => void
  messages: AgentMessage[]
  input: string
  onInput: (value: string) => void
  onSend: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const positions = useRef<Record<string, number>>({})
  const previousCount = useRef(0)
  const taskKey = plan?.id ?? 'unassigned'
  const active = liveAgent?.availability === 'available' ? liveAgent : undefined
  // 运行时同样兜底：有 liveAgent 但不可用时，按基线不可用抽屉处理并禁止发送。
  const unavailableReason = active
    ? undefined
    : (reasonProp ?? (liveAgent ? LIVE_AGENT_UNAVAILABLE : undefined))
  const liveReady = !!active && !active.pending
  const blocked = active ? !liveReady : !!unavailableReason
  const itemCount = active ? active.turns.length + (active.pending ? 1 : 0) : messages.length
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])
  useLayoutEffect(() => {
    if (!open || !log.current) return
    log.current.scrollTop = positions.current[taskKey] ?? 0
  }, [open, taskKey])
  useLayoutEffect(() => {
    if (open && log.current && itemCount > previousCount.current)
      log.current.scrollTop = log.current.scrollHeight
    previousCount.current = itemCount
  }, [itemCount, open])
  return (
    <dialog
      ref={dialog}
      className="agent-drawer"
      aria-labelledby="agent-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        )
        const first = controls[0],
          last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right) onClose()
      }}
    >
      <div className="agent-drawer-layout">
        <header className="agent-heading">
          <h2 id="agent-title">Agent 协同</h2>
          <button className="button" type="button" onClick={onClose} aria-label="关闭 Agent 抽屉">
            收起
          </button>
        </header>
        <section className="agent-context" aria-label="Agent 当前上下文">
          <p>
            {plan
              ? `${plan.partName} · ${plan.name}${active || unavailableReason ? '' : ' · Demo'}`
              : '未加载工艺方案'}
          </p>
          <div className="agent-operation-picker">
            <label htmlFor="agent-operation">当前工序</label>
            <select
              id="agent-operation"
              value={operationId ?? ''}
              onChange={(event) => onOperation(event.target.value)}
              disabled={!plan?.operations.length}
            >
              {plan?.taskMeasurements?.length ? (
                <option value="">任务级 · 共用信息</option>
              ) : (
                !plan?.operations.length && <option value="">暂无工序</option>
              )}
              {plan?.operations.map((operation) => (
                <option key={operation.id} value={operation.id}>
                  {operation.sequence} {operation.name}
                </option>
              ))}
            </select>
          </div>
          {programContext && <p className="warning-text">{programContext}</p>}
          <p className="muted-text">
            {active
              ? '当前任务与工序随消息发送；Agent 以服务端记录为准。'
              : '仅同步 UI 上下文，未交给真实 Agent 读取。'}
          </p>
        </section>
        <div
          className="agent-log"
          ref={log}
          role="log"
          aria-label="Agent 对话记录"
          aria-live="polite"
          tabIndex={0}
          onScroll={(event) => {
            positions.current[taskKey] = event.currentTarget.scrollTop
          }}
        >
          {active ? (
            <LiveAgentLog agent={active} plan={plan} />
          ) : (
            <>
              <p className="warning-text">{unavailableReason ?? '预设对话演示 · 非真实 Agent'}</p>
              {!unavailableReason && (
                <p>可记录工艺、刀具或参数方面的问题。尚未连接真实 Agent，发送后仅展示固定说明。</p>
              )}
              {liveAgent?.availability === 'error' && (
                <>
                  <p className="muted-text">Agent 连接失败：{liveAgent.error}</p>
                  <button className="button" type="button" onClick={liveAgent.retry}>
                    重新连接
                  </button>
                </>
              )}
            </>
          )}
          {!active &&
            messages.map((message) => (
              <article key={message.id} className={`agent-message message-${message.role}`}>
                <p className="muted-text">
                  {message.role === 'user' ? '你' : 'Agent · Demo 固定回复'} ·{' '}
                  {message.contextLabel}
                </p>
                <p>{message.text}</p>
              </article>
            ))}
        </div>
        <form
          className="agent-composer"
          onSubmit={(event) => {
            event.preventDefault()
            if (!blocked) onSend()
          }}
        >
          <p className="muted-text">
            {active
              ? 'Agent 只读：不修改工艺或 NC，不批准、审核或启动 CAM。'
              : unavailableReason
                ? '可查看当前任务与工序上下文。'
                : '演示记录不会修改工艺、调用 CAM 或保存至服务器。'}
          </p>
          <label htmlFor="agent-message">消息</label>
          <textarea
            id="agent-message"
            value={input}
            onChange={(event) => onInput(event.target.value)}
            disabled={!plan || blocked}
            maxLength={2000}
            placeholder={
              active
                ? '输入问题，例如：粗车步距现在是多少，从哪里来？'
                : (unavailableReason ??
                  (plan ? '输入消息，体验 Demo 对话' : '请先显式加载演示方案'))
            }
            rows={3}
          />
          <div className="agent-send">
            <span className="muted-text">
              {input.length} / 2000 ·{' '}
              {active ? '对话保存在 Core 内存，重启后丢失' : '仅本次页面会话'}
            </span>
            <button
              className="button primary-button"
              type="submit"
              disabled={!plan || !input.trim() || blocked}
            >
              {active || unavailableReason ? '发送消息' : '发送演示消息'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
