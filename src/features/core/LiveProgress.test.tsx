import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { LiveProgress } from './LiveProgress'
import type { LiveWorkflow } from './useLiveWorkflow'

afterEach(cleanup)
const workflow = (values: Partial<LiveWorkflow>) => values as LiveWorkflow
it('工艺完成后保留原型进度条并显示100%', () => {
  render(
    <LiveProgress
      live={workflow({ status: '工艺方案已就绪', session: {} as LiveWorkflow['session'] })}
    />,
  )
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100')
  expect(screen.getByText('100%')).toBeInTheDocument()
})
it('运行中不伪造百分比，失败后停止动画', () => {
  const { rerender } = render(
    <LiveProgress live={workflow({ busy: true, status: '正在形成工艺方案' })} />,
  )
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
  rerender(<LiveProgress live={workflow({ busy: false, status: '规划失败', error: '请求失败' })} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
  expect(screen.queryByText('100%')).not.toBeInTheDocument()
})
