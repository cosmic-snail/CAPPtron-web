import { describe, expect, it } from 'vitest'
import { CoreClient } from './client'
import { agentAvailability, summarizeTurn } from './agent'
import type { AgentEvent } from './agent'

const coreError = (status: number, code: number) =>
  new Response(
    JSON.stringify({ error: { code, message: 'x' }, request_id: 'req-1', trace_id: 't' }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )

const client = (response: () => Response) => new CoreClient('', async () => response())

describe('agentAvailability', () => {
  it('对话不存在（8401）表示 Agent 已开启', async () => {
    expect(await agentAvailability(client(() => coreError(404, 8401)))).toBe('available')
  })
  it('路由不存在（3002）表示 Core 未开启 Agent', async () => {
    expect(await agentAvailability(client(() => coreError(404, 3002)))).toBe('disabled')
  })
  it('其他失败不猜测为未开启', async () => {
    await expect(agentAvailability(client(() => coreError(503, 5009)))).rejects.toThrow('503')
    await expect(
      agentAvailability(client(() => new Response('<html>', { status: 404 }))),
    ).rejects.toThrow('404')
  })
})

describe('summarizeTurn', () => {
  const events: AgentEvent[] = [
    { type: 'turn.started', turn_id: 't1', message_id: 'm1' },
    { type: 'tool.started', tool_call_id: 'c1', name: 'get_operation_detail', summary: '读取工序' },
    { type: 'tool.started', tool_call_id: 'c2', name: 'approve_card', summary: '未知工具' },
    {
      type: 'tool.completed',
      tool_call_id: 'c1',
      status: 'ok',
      summary: 'ring-op-2 外圆粗车，r2',
      duration_ms: 3,
    },
    {
      type: 'tool.completed',
      tool_call_id: 'c2',
      status: 'rejected',
      summary: '当前页面没有这个工具',
      duration_ms: 0,
    },
    {
      type: 'message.completed',
      text: '0.4 mm',
      citations: [
        { tool_call_id: 'c1', resource: 'planning_result r2', pointer: '/payload/x', value: '0.4' },
      ],
      dropped_citations: 2,
    },
    {
      type: 'turn.completed',
      turn_id: 't1',
      status: 'completed',
      usage: { model_calls: 2, tool_calls: 2 },
    },
  ]
  it('按事件整理查询卡片、回答与依据', () => {
    const summary = summarizeTurn({ turn_id: 't1', text: '多少？', events })
    expect(summary.status).toBe('completed')
    expect(summary.tools.map((t) => [t.summary, t.status, t.resultSummary])).toEqual([
      ['读取工序', 'ok', 'ring-op-2 外圆粗车，r2'],
      ['未知工具', 'rejected', '当前页面没有这个工具'],
    ])
    expect(summary.answer).toEqual({
      text: '0.4 mm',
      citations: events[5]!.type === 'message.completed' ? events[5]!.citations : [],
      dropped: 2,
    })
  })
  it('进行中与失败的轮次不补造回答', () => {
    const running = summarizeTurn({ turn_id: 't1', text: 'q', events: events.slice(0, 2) })
    expect(running.status).toBe('running')
    expect(running.tools[0]!.status).toBe('running')
    expect(running.answer).toBeUndefined()
    const failed = summarizeTurn({
      turn_id: 't1',
      text: 'q',
      events: [
        events[0]!,
        { type: 'error', code: 8404, message: 'Agent turn budget exhausted' },
        {
          type: 'turn.completed',
          turn_id: 't1',
          status: 'failed',
          usage: { model_calls: 6, tool_calls: 8 },
        },
      ],
    })
    expect(failed.status).toBe('failed')
    expect(failed.errors).toEqual([{ code: 8404, message: 'Agent turn budget exhausted' }])
    expect(failed.answer).toBeUndefined()
  })
})
