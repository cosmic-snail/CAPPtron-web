import { describe, expect, it } from 'vitest'
import { preparationBlocksExecution, preparationNote } from './admission'

const pending = [{ detail: 'blank' }, { detail: 'publication_unverified' }]

describe('工艺备注与执行准入', () => {
  it('未准入时保留备注对批准的阻断', () => {
    expect(preparationBlocksExecution(false, pending)).toBe(true)
    expect(preparationBlocksExecution(undefined, pending)).toBe(true)
    expect(preparationNote(false, pending)).toBe('')
  })
  it('服务端已准入时展示备注，不再由浏览器否决', () => {
    expect(preparationBlocksExecution(true, pending)).toBe(false)
    expect(preparationNote(true, pending)).toContain('blank')
    expect(preparationNote(true, pending)).toContain('仍待确认')
  })
  it('没有备注时两种状态都不额外阻断', () => {
    expect(preparationBlocksExecution(true, [])).toBe(false)
    expect(preparationBlocksExecution(false, [])).toBe(false)
    expect(preparationNote(true, [])).toBe('')
  })
})
