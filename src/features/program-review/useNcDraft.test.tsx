import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useNcDraft } from './useNcDraft'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

it('草稿与暂存点分别持久化，重新进入后仍可恢复暂存', () => {
  const first = renderHook(() => useNcDraft('file-1', 'original', 'nc-1'))
  act(() => first.result.current.update('saved'))
  act(() => first.result.current.save())
  act(() => first.result.current.update('new draft'))
  first.unmount()
  const restored = renderHook(() => useNcDraft('file-1', 'original', 'nc-1'))
  expect(restored.result.current.text).toBe('new draft')
  expect(restored.result.current.saved).toBe('saved')
  expect(restored.result.current.history.map((item) => item.reason)).toContain('保存暂存点')
  expect(restored.result.current.revision).toBe(4)
  act(() => restored.result.current.update(restored.result.current.saved))
  expect(restored.result.current.text).toBe('saved')
})

it('同一 NC 其他文件草稿阻止整版审批，不混用其他任务版本', () => {
  const first = renderHook(() => useNcDraft('file-1', 'original', 'nc-1'))
  act(() => first.result.current.update('changed'))
  const second = renderHook(() => useNcDraft('file-2', 'original-2', 'nc-1'))
  expect(second.result.current.changed).toBe(false)
  expect(second.result.current.groupChanged).toBe(true)
  const next = renderHook(() => useNcDraft('file-3', 'original', 'nc-2'))
  expect(next.result.current.groupChanged).toBe(false)
  act(() => first.result.current.update('original'))
  second.rerender()
  expect(second.result.current.groupChanged).toBe(false)
})

it('存储失败保留内存草稿并明确提示，不声称已保存', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  const { result } = renderHook(() => useNcDraft('file-1', 'original', 'nc-1'))
  act(() => result.current.update('changed'))
  expect(result.current.text).toBe('changed')
  expect(result.current.error).toContain('保存失败')
  expect(result.current.groupChanged).toBe(true)
})
