import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { installCatalogFetchMock } from '../test/caseCatalog'
beforeEach(installCatalogFetchMock)
afterEach(() => vi.unstubAllGlobals())

function chooseFile(name: string, contents = 'test-only STEP input') {
  const file = new File([contents], name, { type: 'application/octet-stream' })
  fireEvent.change(screen.getByLabelText('选择 STEP 模型文件'), { target: { files: [file] } })
  return file
}

function fileBar() {
  return within(screen.getByRole('region', { name: '当前模型文件' }))
}

function preparation() {
  return within(screen.getByRole('region', { name: '输入准备' }))
}

describe('r06 模型输入', () => {
  it('初始状态未选择文件，待接入能力不会被标记为完成', () => {
    render(<App />)
    expect(screen.getByRole('region', { name: '模型输入' })).toBeVisible()
    expect(fileBar().getByText('尚未选择模型文件 / 示例仅演示输入状态')).toBeVisible()
    expect(preparation().getByText('待选择')).toBeVisible()
    expect(preparation().getByText('待提供')).toBeVisible()
    expect(preparation().getByText('待接入')).toBeVisible()
    expect(screen.getByRole('button', { name: '01 模型输入' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByText(/人工确认不等于仿真或实机验证/)).toBeVisible()
    expect(screen.queryByText(/已上传|解析完成|规划已生成|CAM 已验证通过/)).not.toBeInTheDocument()
  })

  it.each(['Part.step', 'Part.stp', 'Part.STEP', 'Part.StP'])(
    '支持 %s 并只记录本地选择',
    (name) => {
      render(<App />)
      const file = chooseFile(name)
      expect(fileBar().getByText(name)).toBeVisible()
      expect(fileBar().getByText(new RegExp(`${file.size} B · 本地选择`))).toBeVisible()
      expect(preparation().getByText('本地已选择，尚未上传或解析')).toBeVisible()
      expect(screen.queryByText('Demo · 示例元数据')).not.toBeInTheDocument()
    },
  )

  it('选择区和更换按钮调用同一文件控件，更换后清除旧元数据', () => {
    render(<App />)
    const input = screen.getByLabelText('选择 STEP 模型文件')
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: '选择模型文件' }))
    expect(click).toHaveBeenCalledTimes(1)
    chooseFile('First.step')
    fireEvent.click(screen.getByRole('button', { name: '更换文件' }))
    expect(click).toHaveBeenCalledTimes(2)
    chooseFile('Second.stp', 'different size')
    expect(fileBar().getByText('Second.stp')).toBeVisible()
    expect(fileBar().queryByText('First.step')).not.toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('取消文件选择保留原文件，并允许再次选择同名文件', () => {
    render(<App />)
    chooseFile('Kept.step', 'old')
    fireEvent.change(screen.getByLabelText('选择 STEP 模型文件'), { target: { files: [] } })
    expect(fileBar().getByText('Kept.step')).toBeVisible()
    fireEvent(screen.getByLabelText('选择 STEP 模型文件'), new Event('cancel'))
    expect(fileBar().getByText('Kept.step')).toBeVisible()
    chooseFile('Kept.step', 'new content')
    expect(fileBar().getByText('STEP · 11 B · 本地选择')).toBeVisible()
  })

  it.each(['drawing.pdf', 'STEP', '.step', 'part.step.exe'])(
    '拒绝无效格式 %s，保留有效选择',
    (name) => {
      render(<App />)
      chooseFile('Valid.step')
      chooseFile(name)
      expect(screen.getByRole('alert')).toHaveTextContent('文件格式不支持')
      expect(fileBar().getByText('Valid.step')).toBeVisible()
      chooseFile('Recovered.stp')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('使用示例进入工艺决策，返回后可切换同名本地文件且来源不会混淆', async () => {
    render(<App />)
    chooseFile('Ring_A.step')
    fireEvent.click(screen.getByRole('button', { name: '使用示例 Ring_A.step' }))
    await act(async () => {})
    expect(fileBar().getByText('Demo · 示例元数据')).toBeVisible()
    expect(screen.getByRole('region', { name: '工艺决策' })).toBeVisible()
    expect(screen.getByRole('button', { name: '02 工艺决策' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('progressbar', { name: 'Demo 规划进度' })).toBeVisible()
    expect(screen.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '01 模型输入' }))
    expect(preparation().getByText('使用演示输入')).toBeVisible()
    expect(fileBar().queryByText(/本地选择/)).not.toBeInTheDocument()
    chooseFile('Ring_A.step')
    expect(fileBar().getByText(/本地选择/)).toBeVisible()
    expect(fileBar().queryByText(/Demo/)).not.toBeInTheDocument()
    expect(preparation().getByText('待提供')).toBeVisible()
    expect(preparation().getByText('待接入')).toBeVisible()
  })

  it('拖放复用选择校验，拒绝一次拖入多个文件', () => {
    render(<App />)
    const zone = screen.getByRole('group', { name: '模型文件选择区' })
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['test'], 'Dropped.STP')] } })
    expect(fileBar().getByText('Dropped.STP')).toBeVisible()
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['a'], 'a.step'), new File(['b'], 'b.stp')] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('请一次选择一个')
    expect(fileBar().getByText('Dropped.STP')).toBeVisible()
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['pdf'], 'bad.pdf')] } })
    expect(screen.getByRole('alert')).toHaveTextContent('文件格式不支持')
  })

  it.each([['查看解读结果', '设计文件解读尚未接入']])(
    '%s 入口提供说明并保持模型输入阶段',
    (name, message) => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name }))
      expect(screen.getByRole('status')).toHaveTextContent(message)
      expect(screen.getByRole('button', { name: '01 模型输入' })).toHaveAttribute(
        'aria-current',
        'step',
      )
      expect(screen.getByRole('button', { name: '02 工艺决策' })).not.toHaveAttribute(
        'aria-current',
      )
      expect(screen.getByRole('button', { name: '03 程序审核' })).not.toHaveAttribute(
        'aria-current',
      )
      fireEvent.click(screen.getByRole('button', { name: '关闭功能提示' }))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    },
  )
  it('数据底座成为独立入口，返回保留本地模型选择和原阶段', async () => {
    render(<App />)
    chooseFile('Kept.step')
    fireEvent.click(screen.getByRole('button', { name: '数据底座' }))
    expect(screen.getByRole('heading', { name: '数据底座' })).toBeVisible()
    expect(screen.getByRole('button', { name: '数据底座' })).toHaveAttribute('aria-current', 'page')
    await screen.findByText('演示日新增')
    expect(screen.queryByRole('button', { name: '01 模型输入' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开 Agent 协同' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回智能工艺工作台' }))
    expect(fileBar().getByText('Kept.step')).toBeVisible()
    expect(screen.getByRole('button', { name: '01 模型输入' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })
})
