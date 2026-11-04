// Core 只读对话 Agent 的契约与调用。字段与 Core `contracts/frontend/agent.py` 一致；
// Agent 只读，这里的请求不进入命令日志，也不触发任何业务写操作。
import { CoreHttpError } from './client'
import type { CoreClient, NcRef } from './client'

export type AgentPage = 'planning' | 'review'
export type AgentContextHint = {
  page: AgentPage
  task_id: string
  revision?: number
  operation_id?: string
  nc_ref?: NcRef
}
export type Citation = { tool_call_id: string; resource: string; pointer: string; value: string }
export type ToolStatus = 'ok' | 'no_record' | 'rejected' | 'failed'
export type AgentEvent =
  | { type: 'turn.started'; turn_id: string; message_id: string }
  | { type: 'tool.started'; tool_call_id: string; name: string; summary: string }
  | {
      type: 'tool.completed'
      tool_call_id: string
      status: ToolStatus
      summary: string
      duration_ms: number
    }
  | { type: 'message.completed'; text: string; citations: Citation[]; dropped_citations: number }
  | { type: 'error'; code: number; message: string }
  | {
      type: 'turn.completed'
      turn_id: string
      status: 'completed' | 'failed' | 'interrupted'
      usage: { model_calls: number; tool_calls: number }
    }
export type AgentTurn = {
  turn_id: string
  message_id: string
  text: string
  context: AgentContextHint
  created_at: string
  events: AgentEvent[]
}
export type Conversation = {
  conversation_id: string
  task_id: string
  created_at: string
  turns: AgentTurn[]
}
export type TurnResponse = { conversation_id: string; turn_id: string; events: AgentEvent[] }

// Core 错误码：8401 对话不存在；3002 路由不存在（Agent 未开启）。
export const AGENT_CONVERSATION_NOT_FOUND = 8401
export const API_NOT_FOUND = 3002
const PROBE_ID = 'availability-probe'
const conversationPath = (id: string) => `/agent/conversations/${encodeURIComponent(id)}`

/** 用一次只读 GET 区分 Agent 已开启（对话不存在 8401）与未开启（路由不存在 3002）。 */
export async function agentAvailability(api: CoreClient): Promise<'available' | 'disabled'> {
  try {
    await api.get<Conversation>(conversationPath(PROBE_ID))
    return 'available'
  } catch (error) {
    if (error instanceof CoreHttpError && error.status === 404) {
      if (error.code === AGENT_CONVERSATION_NOT_FOUND) return 'available'
      if (error.code === API_NOT_FOUND) return 'disabled'
    }
    throw error
  }
}

export const createConversation = (api: CoreClient, conversationId: string, taskId: string) =>
  api.post<Conversation>('/agent/conversations', {
    conversation_id: conversationId,
    task_id: taskId,
  })

export const getConversation = (api: CoreClient, conversationId: string) =>
  api.get<Conversation>(conversationPath(conversationId))

export const sendAgentMessage = (
  api: CoreClient,
  conversationId: string,
  message: { message_id: string; text: string; context: AgentContextHint },
) => api.post<TurnResponse>(`${conversationPath(conversationId)}/messages`, message)

export const isConversationMissing = (error: unknown) =>
  error instanceof CoreHttpError &&
  error.status === 404 &&
  error.code === AGENT_CONVERSATION_NOT_FOUND

export type ToolCard = {
  id: string
  name: string
  summary: string
  status: ToolStatus | 'running'
  resultSummary?: string
  durationMs?: number
}
export type TurnSummary = {
  turnId: string
  question: string
  tools: ToolCard[]
  answer?: { text: string; citations: Citation[]; dropped: number }
  errors: { code: number; message: string }[]
  status: 'running' | 'completed' | 'failed' | 'interrupted'
}

/** 把一轮事件整理成页面展示用的结构；不补造服务端没有返回的内容。 */
export function summarizeTurn(turn: Pick<AgentTurn, 'turn_id' | 'text' | 'events'>): TurnSummary {
  const tools = new Map<string, ToolCard>()
  const summary: TurnSummary = {
    turnId: turn.turn_id,
    question: turn.text,
    tools: [],
    errors: [],
    status: 'running',
  }
  for (const event of turn.events) {
    if (event.type === 'tool.started')
      tools.set(event.tool_call_id, {
        id: event.tool_call_id,
        name: event.name,
        summary: event.summary,
        status: 'running',
      })
    else if (event.type === 'tool.completed') {
      const card = tools.get(event.tool_call_id)
      if (card)
        Object.assign(card, {
          status: event.status,
          resultSummary: event.summary,
          durationMs: event.duration_ms,
        })
    } else if (event.type === 'message.completed')
      summary.answer = {
        text: event.text,
        citations: event.citations,
        dropped: event.dropped_citations,
      }
    else if (event.type === 'error')
      summary.errors.push({ code: event.code, message: event.message })
    else if (event.type === 'turn.completed') summary.status = event.status
  }
  summary.tools = [...tools.values()]
  return summary
}
