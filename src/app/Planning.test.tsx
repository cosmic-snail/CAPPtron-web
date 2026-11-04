import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { installCatalogFetchMock } from '../test/caseCatalog'
import { caseChoiceKey } from '../api/case-catalog'

// jsdom 没有原生 dialog 行为；焦点闭环、Escape 和背景隔离由真实 Chromium 验证。
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function planning() {
  fireEvent.click(screen.getByRole('button', { name: '02 工艺决策' }))
}
beforeEach(() => {
  vi.useFakeTimers()
  installCatalogFetchMock()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function finishPlanning() {
  await act(async () => {})
  act(() => vi.advanceTimersByTime(4000))
  const button = screen.queryByRole('button', { name: '查看工艺规划结果' })
  if (button) fireEvent.click(button)
}
async function demo(id = 'simple') {
  await act(async () => {})
  if (id === 'ring') id = caseChoiceKey('golden-b7', 'v2')
  fireEvent.change(screen.getByLabelText('演示方案'), { target: { value: id } })
  fireEvent.click(screen.getByRole('button', { name: '加载 Demo 方案' }))
  await finishPlanning()
}
function operations() {
  return within(screen.getByRole('navigation', { name: '工序列表' }))
}
function select(name: RegExp) {
  fireEvent.click(operations().getByRole('button', { name }))
}
function view(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}
function choose(name: string) {
  fireEvent.change(screen.getByLabelText('选择 STEP 模型文件'), {
    target: { files: [new File(['fixture'], name)] },
  })
}

describe('工艺决策与模型来源', () => {
  it('本地文件不会生成方案；显式使用输入示例会加载独立环件演示', async () => {
    render(<App />)
    choose('Local.step')
    planning()
    expect(screen.getByText('暂无可用工艺方案')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: '工序列表' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '当前模型文件' })).toHaveTextContent('Local.step')
    view('01 模型输入')
    expect(screen.queryByRole('button', { name: '打开 Agent 协同' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '当前模型文件' })).toHaveTextContent('Local.step')
    view('使用示例 Ring_A.step')
    await act(async () => {})
    expect(screen.queryByText('暂无可用工艺方案')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50')
    expect(screen.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
    await finishPlanning()
    expect(operations().getAllByRole('button')).toHaveLength(7)
    expect(screen.getByRole('region', { name: '当前工序详情' })).toHaveTextContent('01 端面车削')
  })

  it('同一页面动态展示多工序与缺失数据，并支持零工序', async () => {
    render(<App />)
    planning()
    await demo()
    expect(operations().getAllByRole('button')).toHaveLength(3)
    select(/轮廓与孔加工/)
    expect(screen.getByRole('region', { name: '当前工序详情' })).toHaveTextContent('3 个工步')
    await demo('complex')
    expect(operations().getAllByRole('button')).toHaveLength(20)
    await demo('incomplete')
    expect(operations().getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('暂无工步信息，等待上游方案补充。')).toBeVisible()
    view('参数与资源')
    expect(screen.getByText('暂无生产资源信息')).toBeVisible()
    expect(screen.getByText('—')).toBeVisible()
    await demo('empty')
    expect(operations().queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('暂无工序详情')).toBeVisible()
  })

  it('环件必填项补齐才启用生成，空白与无效数值重新阻止生成，切换任务不串用', async () => {
    render(<App />)
    view('使用示例 Ring_A.step')
    await act(async () => {})
    await finishPlanning()
    const generate = () => screen.getByRole('button', { name: '查看参考程序并进入审核' })
    const shared = () => screen.getByRole('button', { name: /^任务共用信息/ })
    const finishBore = () => operations().getByRole('button', { name: /05 内孔精车/ })
    expect(shared()).toHaveTextContent('待填 5')
    expect(finishBore()).toHaveTextContent('待填 1')
    expect(operations().getByRole('button', { name: /06 切断/ })).not.toHaveTextContent('待填')
    expect(screen.getByRole('button', { name: '定位待填信息，6 项' })).toBeVisible()
    expect(operations().getByRole('button', { name: /03 外圆精车/ })).not.toHaveTextContent('待填')
    expect(screen.queryByLabelText('现场毛坯外径')).not.toBeInTheDocument()
    expect(generate()).toBeDisabled()
    view('补充工序信息')
    const fields = [
      '现场毛坯外径',
      '现场毛坯预孔直径',
      '现场毛坯长度',
      '工件零点 / 偏置核对',
      '装夹方式与伸出量',
    ]
    for (const name of fields)
      fireEvent.change(screen.getByLabelText(name), { target: { value: '1' } })
    expect(generate()).toBeDisabled()
    select(/03 外圆精车/)
    expect(screen.queryByLabelText('现场毛坯外径')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('内孔表面粗糙度要求 Ra')).not.toBeInTheDocument()
    fireEvent.click(shared())
    expect(shared()).toHaveTextContent('已补齐')
    expect(screen.getByLabelText('现场毛坯外径')).toHaveValue('1')
    view('补充工序信息')
    expect(screen.getByRole('region', { name: '当前工序详情' })).toHaveTextContent('05 内孔精车')
    expect(screen.getByLabelText('内孔表面粗糙度要求 Ra')).toHaveValue('')
    expect(screen.getByText(/加工要求补充：/)).toBeVisible()
    for (const value of [' ', 'abc', 'Infinity']) {
      fireEvent.change(screen.getByLabelText('内孔表面粗糙度要求 Ra'), { target: { value } })
      expect(generate()).toBeDisabled()
      expect(finishBore()).toHaveTextContent('待填 1')
    }
    fireEvent.change(screen.getByLabelText('内孔表面粗糙度要求 Ra'), {
      target: { value: '1.6' },
    })
    expect(generate()).toBeEnabled()
    expect(finishBore()).not.toHaveTextContent('待填')
    expect(screen.queryByRole('button', { name: /定位待填信息/ })).not.toBeInTheDocument()
    fireEvent.click(shared())
    for (const value of [' ', 'abc', 'Infinity']) {
      fireEvent.change(screen.getByLabelText('现场毛坯外径'), { target: { value } })
      expect(generate()).toBeDisabled()
      expect(shared()).toHaveTextContent('待填 1')
    }
    fireEvent.change(screen.getByLabelText('现场毛坯外径'), { target: { value: '43' } })
    select(/01 端面车削$/)
    expect(generate()).toBeEnabled()
    await demo('simple')
    expect(generate()).toBeDisabled()
    await demo('ring')
    expect(generate()).toBeEnabled()
    choose('Ring_A.step')
    expect(screen.getByText('暂无可用工艺方案')).toBeVisible()
    expect(generate()).toBeDisabled()
  })

  it('进度中换有效文件取消旧演示；无效文件保留进度，重新使用示例重新计时', async () => {
    render(<App />)
    view('使用示例 Ring_A.step')
    await act(async () => {})
    act(() => vi.advanceTimersByTime(2000))
    choose('bad.pdf')
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50')
    choose('Local.step')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText('暂无可用工艺方案')).toBeVisible()
    view('01 模型输入')
    view('使用示例 Ring_A.step')
    await act(async () => {})
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
    expect(screen.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
  })

  it('非切削工序没有推荐参数，不补造资源和实测信息', async () => {
    render(<App />)
    planning()
    await demo()
    select(/成品检验/)
    view('参数与资源')
    expect(screen.getByText('暂无推荐参数；该工序可能不适用切削参数。')).toBeVisible()
    view('补充信息')
    expect(screen.getByText('暂无工序专用补充项，等待上游提供；不代表无需确认。')).toBeVisible()
  })

  it('草稿按工序及任务隔离，导航与任务切换后恢复，不变更原始 Mock 数值', async () => {
    render(<App />)
    planning()
    await demo()
    view('补充信息')
    fireEvent.change(screen.getByLabelText('毛坯实测高度'), { target: { value: 'abc' } })
    expect(screen.getByLabelText('毛坯实测高度')).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(screen.getByLabelText('毛坯实测高度'), { target: { value: '42.5' } })
    expect(screen.getByText('本地演示草稿，未提交服务器，未完成制造校核。')).toBeVisible()
    select(/轮廓与孔加工/)
    expect(screen.getByLabelText('毛坯实测高度')).toHaveValue('')
    select(/基准面加工/)
    expect(screen.getByLabelText('毛坯实测高度')).toHaveValue('42.5')
    await demo('complex')
    view('补充信息')
    expect(screen.getByLabelText('毛坯实测高度')).toHaveValue('')
    await demo('simple')
    expect(screen.getByLabelText('毛坯实测高度')).toHaveValue('42.5')
    view('01 模型输入')
    planning()
    expect(screen.getByLabelText('毛坯实测高度')).toHaveValue('42.5')
    view('参数与资源')
    expect(screen.getByText('1200')).toBeVisible()
  })

  it('无效文件和取消保留方案，更换有效来源清除方案与会话', async () => {
    render(<App />)
    choose('First.step')
    planning()
    await demo()
    choose('bad.pdf')
    expect(operations().getAllByRole('button')).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('选择 STEP 模型文件'), { target: { files: [] } })
    expect(operations().getAllByRole('button')).toHaveLength(3)
    choose('Second.step')
    expect(screen.getByText('暂无可用工艺方案')).toBeVisible()
    await demo()
    view('补充信息')
    expect(screen.getByLabelText('毛坯实测高度')).toHaveValue('')
  })

  it('程序入口明确未调用 CAM 或生成 NC', async () => {
    render(<App />)
    planning()
    expect(screen.getByRole('button', { name: '查看参考程序并进入审核' })).toBeDisabled()
    await demo()
    view('补充工序信息')
    for (const name of [/基准面加工/, /轮廓与孔加工/]) {
      select(name)
      fireEvent.change(screen.getByLabelText('毛坯实测高度'), { target: { value: '42' } })
      fireEvent.change(screen.getByLabelText('现场约束说明'), { target: { value: '演示装夹' } })
    }
    expect(screen.getByRole('button', { name: '查看参考程序并进入审核' })).toBeEnabled()
    await act(async () => {
      view('查看参考程序并进入审核')
      await import('../pages/program-review/ProgramReviewPage')
    })
    expect(screen.getByText('本次未执行 CAM 程序生成。')).toBeVisible()
    expect(screen.getByText('参考程序正文暂不可用')).toBeVisible()
    expect(screen.getByRole('button', { name: '03 程序审核' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })
})

describe('Agent 演示会话', () => {
  it('共用信息视图发送任务级消息，切换工序后保留原上下文与共享草稿', async () => {
    render(<App />)
    view('使用示例 Ring_A.step')
    await finishPlanning()
    fireEvent.click(screen.getByRole('button', { name: /^任务共用信息/ }))
    expect(screen.getAllByLabelText('现场毛坯外径')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('现场毛坯外径'), { target: { value: '43' } })
    view('打开 Agent 协同')
    expect(screen.getByLabelText('当前工序')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '核对任务共用信息' } })
    view('发送演示消息')
    expect(screen.getByRole('log')).toHaveTextContent('任务级 · 共用信息')
    fireEvent.change(screen.getByLabelText('当前工序'), { target: { value: 'ring-finish-id' } })
    expect(screen.getByRole('region', { name: '当前工序详情' })).toHaveTextContent('05 内孔精车')
    expect(screen.queryByLabelText('现场毛坯外径')).not.toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('任务级 · 共用信息')
    fireEvent.change(screen.getByLabelText('当前工序'), { target: { value: '' } })
    view('关闭 Agent 抽屉')
    expect(screen.getByLabelText('现场毛坯外径')).toHaveValue('43')
  })
  it('无方案时可打开抽屉，但不能发送任务消息', async () => {
    render(<App />)
    planning()
    view('打开 Agent 协同')
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('button', { name: '发送演示消息' })).toBeDisabled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('工序上下文同步，历史保留发送时上下文；任务与模型变更不混用消息', async () => {
    render(<App />)
    planning()
    await demo()
    view('打开 Agent 协同')
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '请调整参数' } })
    view('发送演示消息')
    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('请调整参数')
    expect(log).toHaveTextContent('尚未连接真实 Agent')
    expect(log).toHaveTextContent('10 基准面加工')
    fireEvent.change(screen.getByLabelText('当前工序'), { target: { value: 'bracket-profile' } })
    expect(screen.getByRole('region', { name: '当前工序详情' })).toHaveTextContent('轮廓与孔加工')
    expect(log).toHaveTextContent('10 基准面加工')
    view('关闭 Agent 抽屉')
    view('打开 Agent 协同')
    expect(screen.getByRole('log')).toHaveTextContent('请调整参数')
    view('关闭 Agent 抽屉')
    await demo('complex')
    view('打开 Agent 协同')
    expect(screen.getByRole('log')).not.toHaveTextContent('请调整参数')
    view('关闭 Agent 抽屉')
    await demo('simple')
    view('打开 Agent 协同')
    expect(screen.getByRole('log')).toHaveTextContent('请调整参数')
    view('关闭 Agent 抽屉')
    choose('Replacement.step')
    await demo()
    view('打开 Agent 协同')
    expect(screen.getByRole('log')).not.toHaveTextContent('请调整参数')
  })
})
