import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentDrawer, LIVE_AGENT_UNAVAILABLE } from './AgentDrawer'
import type { LiveAgent } from './useLiveAgent'
import type { ProcessPlan } from '../process-planning/processPlan'
import type { AgentTurn } from '../../api/core/agent'

// jsdom 未实现 <dialog> 的模态方法；这里只验证抽屉内容。
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false
}

const plan: ProcessPlan = {
  id: 'task-1',
  name: '规划修订 r2',
  partName: 'Golden-B7',
  origin: 'live',
  sourceDescription: 'Core',
  operations: [
    {
      id: 'ring-op-2',
      sequence: 2,
      name: '外圆粗车',
      source: 'template',
      steps: [],
      parameters: [],
      resources: [],
      onsiteMeasurements: [],
    },
  ],
}

const turn: AgentTurn = {
  turn_id: 't1',
  message_id: 'm1',
  text: '粗车步距从哪来？',
  context: { page: 'planning', task_id: 'task-1', revision: 2, operation_id: 'ring-op-2' },
  created_at: '2026-10-29T00:00:00Z',
  events: [
    { type: 'turn.started', turn_id: 't1', message_id: 'm1' },
    {
      type: 'tool.started',
      tool_call_id: 'c1',
      name: 'get_operation_detail',
      summary: '读取工序 ring-op-2',
    },
    {
      type: 'tool.completed',
      tool_call_id: 'c1',
      status: 'ok',
      summary: 'ring-op-2 外圆粗车，r2',
      duration_ms: 4,
    },
    {
      type: 'tool.started',
      tool_call_id: 'c2',
      name: 'get_parameter_rules',
      summary: '读取参数规则',
    },
    {
      type: 'tool.completed',
      tool_call_id: 'c2',
      status: 'no_record',
      summary: '任务还没有规划结果',
      duration_ms: 1,
    },
    {
      type: 'message.completed',
      text: '当前为 0.4 mm，来自模板参数配置。',
      citations: [
        {
          tool_call_id: 'c1',
          resource: 'planning_result r2',
          pointer: '/payload/operations/1/attributes/parameters/rough_step',
          value: '0.4',
        },
      ],
      dropped_citations: 1,
    },
    {
      type: 'turn.completed',
      turn_id: 't1',
      status: 'completed',
      usage: { model_calls: 2, tool_calls: 2 },
    },
  ],
}

const agent = (overrides: Partial<LiveAgent> = {}): LiveAgent => ({
  availability: 'available',
  turns: [],
  pending: null,
  error: '',
  notice: '',
  send: vi.fn(async () => true),
  retry: vi.fn(),
  ...overrides,
})

const BASELINE_REASON = LIVE_AGENT_UNAVAILABLE

/** 渲染后返回对话框 HTML，用于与 main 基线逐字比较。 */
type Mode =
  | { liveAgent?: undefined; unavailableReason?: string }
  | { liveAgent: LiveAgent; unavailableReason: string }

function renderDrawer(props: Mode) {
  const { container, unmount } = render(
    <AgentDrawer
      {...props}
      open
      onClose={() => {}}
      plan={plan}
      operationId="ring-op-2"
      onOperation={() => {}}
      messages={[]}
      input="问题"
      onInput={() => {}}
      onSend={() => {}}
    />,
  )
  const html = container.innerHTML
  unmount()
  return html
}

function drawer(liveAgent: LiveAgent, input = '', unavailableReason = BASELINE_REASON) {
  const onSend = vi.fn()
  render(
    <AgentDrawer
      unavailableReason={unavailableReason}
      liveAgent={liveAgent}
      open
      onClose={() => {}}
      plan={plan}
      operationId="ring-op-2"
      onOperation={() => {}}
      messages={[]}
      input={input}
      onInput={() => {}}
      onSend={onSend}
    />,
  )
  return onSend
}

describe('AgentDrawer 真实模式', () => {
  it('展示问题、查询卡片、回答与核对后的依据，不标为 Demo', () => {
    drawer(agent({ turns: [turn] }))
    const log = screen.getByRole('log', { name: 'Agent 对话记录' })
    expect(within(log).getByText('你 · 工艺决策 · 2 外圆粗车')).toBeInTheDocument()
    expect(within(log).getByText('读取工序 ring-op-2')).toBeInTheDocument()
    expect(within(log).getByText('已读取 · ring-op-2 外圆粗车，r2')).toBeInTheDocument()
    expect(within(log).getByText('无记录 · 任务还没有规划结果')).toBeInTheDocument()
    expect(within(log).getByText('当前为 0.4 mm，来自模板参数配置。')).toBeInTheDocument()
    expect(within(log).getByText('依据 1 条（另有 1 条未通过核对）')).toBeInTheDocument()
    expect(log).toHaveTextContent(
      'planning_result r2 · /payload/operations/1/attributes/parameters/rough_step：0.4',
    )
    expect(screen.queryByText(/Demo/)).not.toBeInTheDocument()
    expect(
      screen.getByText('当前任务与工序随消息发送；Agent 以服务端记录为准。'),
    ).toBeInTheDocument()
  })

  it('可用时允许发送，查询中禁用并显示进度', () => {
    const onSend = drawer(agent(), '粗车步距？')
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('查询中不能重复发送', () => {
    drawer(agent({ pending: { text: '处理中的问题' } }), '下一问')
    expect(screen.getByRole('status')).toHaveTextContent('Agent 正在查询服务端记录…')
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
    expect(screen.getByLabelText('消息')).toBeDisabled()
  })

  it.each(['checking', 'waiting', 'disabled', 'simulation'] as const)(
    '%s 时与已确认基线的不可用抽屉完全一致',
    (availability) => {
      const baseline = renderDrawer({ unavailableReason: BASELINE_REASON })
      const live = renderDrawer({
        unavailableReason: BASELINE_REASON,
        liveAgent: agent({ availability }),
      })
      expect(live).toBe(baseline)
      expect(baseline).toContain(BASELINE_REASON)
    },
  )

  it('连接失败保留基线说明，另给出原因和重新连接', () => {
    const retry = vi.fn()
    drawer(agent({ availability: 'error', error: 'Core HTTP 503', retry }), '', BASELINE_REASON)
    expect(screen.getByText(BASELINE_REASON)).toBeInTheDocument()
    expect(screen.getByText('Agent 连接失败：Core HTTP 503')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重新连接' }))
    expect(retry).toHaveBeenCalled()
  })

  it('失败的轮次显示公开错误码，不显示回答', () => {
    drawer(
      agent({
        turns: [
          {
            ...turn,
            events: [
              turn.events[0]!,
              { type: 'error', code: 8404, message: 'Agent turn budget exhausted' },
              {
                type: 'turn.completed',
                turn_id: 't1',
                status: 'failed',
                usage: { model_calls: 6, tool_calls: 8 },
              },
            ],
          },
        ],
      }),
    )
    expect(screen.getByText('未完成：8404 · Agent turn budget exhausted')).toBeInTheDocument()
    expect(screen.getByText('Agent · 未完成')).toBeInTheDocument()
    expect(screen.queryByText(/^依据 \d+ 条/)).not.toBeInTheDocument()
  })
})

describe('AgentDrawer 单独使用', () => {
  it('只传不可用的 liveAgent 时仍按基线不可用抽屉处理，禁止发送且不显示 Demo', () => {
    const onSend = vi.fn()
    // 绕过类型约束，模拟调用方漏传说明的情况。
    const props = { liveAgent: agent({ availability: 'disabled' }) } as unknown as {
      liveAgent: LiveAgent
      unavailableReason: string
    }
    render(
      <AgentDrawer
        {...props}
        open
        onClose={() => {}}
        plan={plan}
        operationId="ring-op-2"
        onOperation={() => {}}
        messages={[]}
        input="问题"
        onInput={() => {}}
        onSend={onSend}
      />,
    )
    expect(screen.getByText(BASELINE_REASON)).toBeInTheDocument()
    expect(screen.getByLabelText('消息')).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText('消息').closest('form')!)
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByText(/Demo/)).not.toBeInTheDocument()
  })
})
