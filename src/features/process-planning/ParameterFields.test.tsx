import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ParameterFields } from './ParameterFields'
import type { Parameter } from './processPlan'

describe('参数来源显示', () => {
  it.each([
    ['historical_record', '历史记录'],
    ['template', '模板'],
    ['upstream', '上游方案'],
    ['human', '人工提供'],
    ['mock', 'Mock 演示值'],
    ['unknown', '来源待补充'],
  ] as const)('%s 显示为 %s', (source, label) => {
    const parameter: Parameter = {
      id: 'speed',
      name: '恒线速 G96',
      value: 295,
      unit: 'm/min',
      source,
      status: 'provided',
      editable: false,
      inputKind: 'number',
    }
    render(
      <ParameterFields
        parameters={[parameter]}
        operationId="operation"
        section="parameters"
        drafts={{}}
        onDraft={() => {}}
        emptyText="暂无参数"
      />,
    )
    expect(screen.getByText(`${label} · 已提供，未校核`)).toBeVisible()
    expect(screen.getByText('295')).toBeVisible()
    expect(screen.getByText('m/min')).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

it('配置通过选择确认，只有需要修改时展开必填参数', () => {
  const parameters: Parameter[] = [
    {
      id: 'fixture-mode',
      name: '装夹配置',
      inputKind: 'choice',
      value: 'unknown',
      source: 'template',
      status: 'pending',
      editable: true,
      choices: [
        { value: 'unknown', label: '尚未确认' },
        { value: 'inherit', label: '沿用当前配置' },
        { value: 'change', label: '需要修改' },
      ],
    },
    {
      id: 'grip-length',
      name: '夹持长度',
      inputKind: 'number',
      value: null,
      source: 'unknown',
      status: 'missing',
      editable: true,
      when: 'fixture-mode',
    },
  ]
  let selected = ''
  const props = {
    parameters,
    operationId: 't',
    section: 'task',
    emptyText: '',
    onDraft: (_key: string, value: string) => {
      selected = value
    },
  }
  const view = render(<ParameterFields {...props} drafts={{}} />)
  expect(screen.queryByLabelText('夹持长度')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('装夹配置'), { target: { value: 'change' } })
  expect(selected).toBe('change')
  view.rerender(<ParameterFields {...props} drafts={{ '["t","task","fixture-mode"]': 'change' }} />)
  expect(screen.getByLabelText('夹持长度')).toHaveAttribute('aria-required', 'true')
})
