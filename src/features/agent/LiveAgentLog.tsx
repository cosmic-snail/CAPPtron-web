// 真实 Agent 的对话记录：问题、查询卡片、回答与经 Core 核对的依据。
// 只在 Core 确认 Agent 可用时使用；这里只展示服务端返回的事件，不补造回答或依据。
import { summarizeTurn } from '../../api/core/agent'
import type { AgentContextHint, ToolCard } from '../../api/core/agent'
import type { ProcessPlan } from '../process-planning/processPlan'
import type { LiveAgent } from './useLiveAgent'

const toolStatus: Record<ToolCard['status'], string> = {
  running: '查询中',
  ok: '已读取',
  no_record: '无记录',
  rejected: '未执行',
  failed: '读取失败',
}

function contextLabel(context: AgentContextHint, plan: ProcessPlan | null) {
  const page = context.page === 'review' ? '程序审核' : '工艺决策'
  const operation = plan?.operations.find((op) => op.id === context.operation_id)
  if (operation) return `${page} · ${operation.sequence} ${operation.name}`
  return context.operation_id ? `${page} · ${context.operation_id}` : `${page} · 任务级`
}

export function LiveAgentLog({ agent, plan }: { agent: LiveAgent; plan: ProcessPlan | null }) {
  return (
    <>
      <p className="warning-text">只读 Agent · 回答依据 Core 记录</p>
      {!agent.turns.length && !agent.pending && (
        <p>可询问参数、工序、修订或 NC 的来源与含义。Agent 只查询服务端记录，不修改工艺。</p>
      )}
      {agent.turns.map((turn) => {
        const summary = summarizeTurn(turn)
        return (
          <section key={turn.turn_id} className="agent-turn" aria-label="Agent 对话轮次">
            <article className="agent-message message-user">
              <p className="muted-text">你 · {contextLabel(turn.context, plan)}</p>
              <p>{turn.text}</p>
            </article>
            <article className="agent-message message-agent">
              <p className="muted-text">
                Agent
                {summary.status === 'interrupted'
                  ? ' · 已中断'
                  : summary.status === 'failed'
                    ? ' · 未完成'
                    : ''}
              </p>
              {!!summary.tools.length && (
                <ul className="agent-tools" aria-label="已执行的查询">
                  {summary.tools.map((tool) => (
                    <li key={tool.id} title={tool.name}>
                      <span>{tool.summary}</span>
                      <span className={`agent-tool-status tool-${tool.status}`}>
                        {toolStatus[tool.status]}
                        {tool.resultSummary ? ` · ${tool.resultSummary}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.answer && <p>{summary.answer.text}</p>}
              {summary.answer && (
                <details className="agent-citations">
                  <summary>
                    依据 {summary.answer.citations.length} 条
                    {summary.answer.dropped
                      ? `（另有 ${summary.answer.dropped} 条未通过核对）`
                      : ''}
                  </summary>
                  {summary.answer.citations.length ? (
                    <ul>
                      {summary.answer.citations.map((citation) => (
                        <li key={`${citation.tool_call_id}${citation.pointer}`}>
                          <code>
                            {citation.resource} · {citation.pointer || '/'}
                          </code>
                          ：{citation.value}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-text">本条回答没有可核对的依据。</p>
                  )}
                </details>
              )}
              {summary.errors.map((error) => (
                <p key={error.code} className="warning-text">
                  未完成：{error.code} · {error.message}
                </p>
              ))}
            </article>
          </section>
        )
      })}
      {agent.pending && (
        <section className="agent-turn" aria-label="Agent 对话轮次">
          <article className="agent-message message-user">
            <p className="muted-text">你</p>
            <p>{agent.pending.text}</p>
          </article>
          <p role="status" className="muted-text">
            Agent 正在查询服务端记录…
          </p>
        </section>
      )}
      {agent.notice && <p className="warning-text">{agent.notice}</p>}
      {agent.error && (
        <p className="warning-text" role="alert">
          发送失败：{agent.error}
        </p>
      )}
    </>
  )
}
