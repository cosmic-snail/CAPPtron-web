import { describe, expect, it, vi } from 'vitest'
import { CoreClient } from './client'
import { recoverLocation } from './liveRecovery'

describe('Live 只读恢复', () => {
  it('旧修订 CAM 只能作为历史，不恢复为当前运行', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes('/planning/')
                ? { task_id: 't', current_revision: 2 }
                : { cam_run_id: 'old', plan_ref: { task_id: 't', revision: 1 } },
            ),
          ),
      )
    const restored = await recoverLocation(new CoreClient('', fetcher), {
      task_id: 't',
      cam_run_id: 'old',
    })
    expect(restored.cam).toBeUndefined()
  })
  it('只查询保存的资产、解析、task与CAM身份，绝不重发制造', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes('/planning/')
                ? { task_id: 't' }
                : url.includes('/cam/')
                  ? { cam_run_id: 'c', plan_ref: { task_id: 't' } }
                  : { asset_id: 'a', command_id: 'p', sha256: 'hash', source_sha256: 'hash' },
            ),
          ),
      )
    await recoverLocation(new CoreClient('/core', fetcher), {
      asset_id: 'a',
      parse_command_id: 'p',
      task_id: 't',
      cam_run_id: 'c',
    })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/core/cad/assets/a',
      '/core/cad/assets/a/parse?command_id=p',
      '/core/planning/tasks/t',
      '/core/cam/runs/c',
    ])
    expect(fetcher.mock.calls.every(([, init]) => !init.method)).toBe(true)
  })
  it('任务失效明确报不可恢复，不创建任务', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    await expect(recoverLocation(new CoreClient('', fetcher), { task_id: 'gone' })).rejects.toThrow(
      '任务不可恢复',
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
