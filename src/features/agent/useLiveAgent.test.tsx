import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLiveAgent } from './useLiveAgent'
import type { AgentEvent, AgentTurn } from '../../api/core/agent'

type Call = { method: string; path: string; body?: Record<string, unknown> }

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const coreError = (status: number, code: number) =>
  json({ error: { code, message: 'x' }, request_id: 'req-9', trace_id: 't' }, status)

const answered = (turnId: string, text: string): AgentEvent[] => [
  { type: 'turn.started', turn_id: turnId, message_id: 'm' },
  {
    type: 'message.completed',
    text,
    citations: [],
    dropped_citations: 0,
  },
  {
    type: 'turn.completed',
    turn_id: turnId,
    status: 'completed',
    usage: { model_calls: 1, tool_calls: 0 },
  },
]

/** 最小 Core 替身：/agent 路由只读，按对话 ID 保存轮次。 */
function fakeCore(options: { disabled?: boolean; lose?: boolean } = {}) {
  const calls: Call[] = []
  const conversations = new Map<string, { task_id: string; turns: AgentTurn[] }>()
  let lose = !!options.lose
  const fetcher: typeof fetch = async (input, init = {}) => {
    const path = decodeURIComponent(new URL(String(input), 'http://core').pathname)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })
    if (options.disabled) return coreError(404, 3002)
    if (path === '/agent/conversations' && method === 'POST') {
      const existing = conversations.get(body.conversation_id)
      if (!existing) conversations.set(body.conversation_id, { task_id: body.task_id, turns: [] })
      return json(
        { conversation_id: body.conversation_id, task_id: body.task_id, created_at: '', turns: [] },
        201,
      )
    }
    const match = path.match(/^\/agent\/conversations\/([^/]+)(\/messages)?$/)
    const conversation = match ? conversations.get(match[1]!) : undefined
    if (!conversation) return coreError(404, 8401)
    if (match![2]) {
      if (lose) {
        lose = false
        conversations.clear()
        return coreError(404, 8401)
      }
      const turnId = `turn-${conversation.turns.length + 1}`
      const events = answered(turnId, `回答：${body.text}`)
      conversation.turns.push({
        turn_id: turnId,
        message_id: body.message_id,
        text: body.text,
        context: body.context,
        created_at: '',
        events,
      })
      return json({ conversation_id: match![1], turn_id: turnId, events })
    }
    return json({
      conversation_id: match![1],
      task_id: conversation.task_id,
      created_at: '',
      turns: conversation.turns,
    })
  }
  return { calls, fetcher, conversations }
}

const context = { page: 'planning' as const, task_id: 'task-1', revision: 2 }

function render(fetcher: typeof fetch, props: Partial<Parameters<typeof useLiveAgent>[0]> = {}) {
  return renderHook(
    (overrides: Partial<Parameters<typeof useLiveAgent>[0]>) =>
      useLiveAgent({
        enabled: true,
        simulation: false,
        base: '',
        taskId: 'task-1',
        open: true,
        fetcher,
        ...props,
        ...overrides,
      }),
    { initialProps: {} },
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useLiveAgent', () => {
  it('打开抽屉后连接、创建对话并只读发送', async () => {
    const core = fakeCore()
    const { result } = render(core.fetcher)
    await waitFor(() => expect(result.current.availability).toBe('available'))
    await waitFor(() => expect(core.calls.some((c) => c.method === 'POST')).toBe(true))
    let sent = false
    await act(async () => {
      sent = await result.current.send('  粗车步距多少？ ', context)
    })
    expect(sent).toBe(true)
    expect(result.current.turns.map((t) => t.text)).toEqual(['粗车步距多少？'])
    const message = core.calls.find((c) => c.path.endsWith('/messages'))!
    expect(message.body).toMatchObject({ text: '粗车步距多少？', context })
    expect(String(message.body!.message_id)).not.toBe('')
    // 只访问 /agent 路由，不触发任何规划、工艺卡或 CAM 请求。
    expect(core.calls.every((c) => c.path.startsWith('/agent/'))).toBe(true)
  })

  it('抽屉未打开或没有任务时不请求 Core', async () => {
    const core = fakeCore()
    const closed = render(core.fetcher, { open: false })
    const noTask = render(core.fetcher, { taskId: null })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(core.calls).toEqual([])
    expect(closed.result.current.availability).toBe('checking')
    expect(noTask.result.current.availability).toBe('waiting')
  })

  it('Core 未开启 Agent 或处于本地模拟时不可发送', async () => {
    const disabled = render(fakeCore({ disabled: true }).fetcher)
    await waitFor(() => expect(disabled.result.current.availability).toBe('disabled'))
    const core = fakeCore()
    const simulation = render(core.fetcher, { simulation: true })
    expect(simulation.result.current.availability).toBe('simulation')
    let sent = true
    await act(async () => {
      sent = await simulation.result.current.send('q', context)
    })
    expect(sent).toBe(false)
    expect(core.calls).toEqual([])
  })

  it('刷新后按保存的对话 ID 恢复历史', async () => {
    const core = fakeCore()
    const first = render(core.fetcher)
    await waitFor(() => expect(first.result.current.availability).toBe('available'))
    await waitFor(() => expect(core.conversations.size).toBe(1))
    await act(async () => {
      await first.result.current.send('第一问', context)
    })
    first.unmount()
    const creates = core.calls.filter(
      (c) => c.method === 'POST' && c.path === '/agent/conversations',
    )
    const second = render(core.fetcher)
    await waitFor(() => expect(second.result.current.turns.map((t) => t.text)).toEqual(['第一问']))
    expect(core.conversations.size).toBe(1)
    // 恢复只读取保存的对话，不再调用创建接口。
    expect(
      core.calls.filter((c) => c.method === 'POST' && c.path === '/agent/conversations'),
    ).toHaveLength(creates.length)
    expect(second.result.current.notice).toBe('')
  })

  it('Core 重启后刷新：提示原历史已丢失，并用新 ID 新建对话', async () => {
    const core = fakeCore()
    const first = render(core.fetcher)
    await waitFor(() => expect(core.conversations.size).toBe(1))
    await act(async () => {
      await first.result.current.send('重启前的问题', context)
    })
    const oldId = [...core.conversations.keys()][0]!
    first.unmount()
    core.conversations.clear() // 模拟 Core 重启，内存中的对话全部丢失
    const second = render(core.fetcher)
    await waitFor(() => expect(second.result.current.notice).toContain('之前的问答已丢失'))
    await waitFor(() => expect(core.conversations.size).toBe(1))
    expect(second.result.current.turns).toEqual([])
    expect(core.conversations.has(oldId)).toBe(false)
    // 旧 ID 只在最初创建过一次，没有被静默重建为空对话。
    const recreated = core.calls.filter(
      (c) =>
        c.method === 'POST' &&
        c.path === '/agent/conversations' &&
        c.body?.conversation_id === oldId,
    )
    expect(recreated).toHaveLength(1)
  })

  it('换任务丢弃旧对话', async () => {
    const core = fakeCore()
    const hook = render(core.fetcher)
    await waitFor(() => expect(hook.result.current.availability).toBe('available'))
    await act(async () => {
      await hook.result.current.send('任务一的问题', context)
    })
    hook.rerender({ taskId: 'task-2' })
    expect(hook.result.current.turns).toEqual([])
    await waitFor(() => expect(core.conversations.size).toBe(2))
  })

  it('Core 重启丢失对话时新建空对话且不自动重发', async () => {
    const core = fakeCore({ lose: true })
    const { result } = render(core.fetcher)
    await waitFor(() => expect(result.current.availability).toBe('available'))
    await waitFor(() => expect(core.conversations.size).toBe(1))
    let sent = true
    await act(async () => {
      sent = await result.current.send('会丢失的问题', context)
    })
    expect(sent).toBe(false)
    expect(result.current.notice).toContain('已新建对话')
    await waitFor(() => expect(core.conversations.size).toBe(1))
    expect(core.calls.filter((c) => c.path.endsWith('/messages'))).toHaveLength(1)
  })
})
