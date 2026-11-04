import { StrictMode } from 'react'
import { webcrypto } from 'node:crypto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftKey } from '../process-planning/processPlan'
import { useLiveWorkflow } from './useLiveWorkflow'
import fixture from '../../../e2e/fixtures/core-golden.json'

beforeEach(() => {
  // 会话键由部署配置决定；单测固定来源，避免本机 .env.local 污染恢复用例。
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_URL', '')
  vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_SHA256', '')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  vi.stubGlobal('crypto', webcrypto)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe('Live会话的异步边界', () => {
  it('NX 请求尚未返回时立即显示正在解析', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture.asset)))
      .mockImplementationOnce(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['STEP'], 'input.step')
    const { result, unmount } = renderHook(() => useLiveWorkflow(file))
    act(() => result.current.upload())
    await waitFor(() => expect(result.current.asset).toBeDefined())
    act(() => result.current.parse())
    await waitFor(() => expect(result.current.status).toBe('正在执行 NX 解析，请稍候'))
    expect(result.current.busy).toBe(true)
    unmount()
  })
  it('替换输入会中止请求，迟到资产不能覆盖新任务', async () => {
    let finish: (response: Response) => void = () => {}
    const fetcher = vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          void [url, init]
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const first = new File(['first'], 'first.step'),
      second = new File(['second'], 'second.step')
    const { result, rerender } = renderHook(({ file }) => useLiveWorkflow(file), {
      initialProps: { file: first },
    })
    act(() => result.current.upload())
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const signal = fetcher.mock.calls[0]?.[1]?.signal
    rerender({ file: second })
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      finish(new Response(JSON.stringify(fixture.asset)))
    })
    expect(result.current.asset).toBeUndefined()
    expect(result.current.nc).toBeUndefined()
    expect(result.current.status).toBe('存在未决原请求，请核对来源并恢复')
    expect(result.current.canRetry).toBe(true)
  })
  it('上传结果未知时重放同一command和原始File，不制造第二个意图', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture.asset)))
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['STEP'], 'original.step')
    const { result } = renderHook(() => useLiveWorkflow(file))
    act(() => result.current.upload())
    await waitFor(() => expect(result.current.canRetry).toBe(true))
    act(() => result.current.upload())
    expect(fetcher).toHaveBeenCalledTimes(1)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.asset?.asset_id).toBe(fixture.asset.asset_id))
    expect(fetcher.mock.calls[0]?.[0]).toBe(fetcher.mock.calls[1]?.[0])
    expect(fetcher.mock.calls[1]?.[1].body).toBe(file)
  })
})

describe('刷新后恢复原写意图', () => {
  it('丢失上传回执后刷新保留原命令，同摘要文件才可重试', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('lost'))
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['STEP'], 'original.step')
    const first = renderHook(() => useLiveWorkflow(file))
    act(() => first.result.current.upload())
    await waitFor(() => expect(first.result.current.canRetry).toBe(true))
    const originalUrl = fetcher.mock.calls[0]![0]
    first.unmount()
    const second = renderHook(({ selected }: { selected?: File }) => useLiveWorkflow(selected), {
      initialProps: { selected: undefined as File | undefined },
      wrapper: StrictMode,
    })
    await waitFor(() => expect(second.result.current.canRetry).toBe(true))
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(fixture.asset)))
    second.rerender({ selected: new File(['WRONG'], file.name) })
    act(() => second.result.current.retry())
    await waitFor(() => expect(second.result.current.error).toContain('SHA-256'))
    expect(fetcher).toHaveBeenCalledTimes(1)
    second.rerender({ selected: file })
    act(() => second.result.current.retry())
    await waitFor(() => expect(second.result.current.asset?.asset_id).toBe(fixture.asset.asset_id))
    expect(fetcher.mock.calls[1]![0]).toBe(originalUrl)
  })
  it('StrictMode 回放仍恢复已保存的上传解析身份，不清空日志', async () => {
    const key = 'capptron.core.workflow.v1.' + encodeURIComponent('|')
    const journalKey = 'capptron.core.workflow.v1'
    const saved = { asset_id: fixture.asset.asset_id, parse_command_id: fixture.parse.command_id }
    localStorage.setItem(key, JSON.stringify(saved))
    const fetcher = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(JSON.stringify(url.includes('/parse?') ? fixture.parse : fixture.asset)),
      )
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useLiveWorkflow(), { wrapper: StrictMode })
    await waitFor(() => expect(result.current.parsed?.command_id).toBe(fixture.parse.command_id))
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject(saved)
    expect(fetcher.mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true)
  })
  it('StrictMode 回放恢复已保存任务与当前工艺，不丢失身份或发送写请求', async () => {
    const config = {
      schema_version: 'frontend-integration.v1',
      templates: [
        {
          template: fixture.deployment.template,
          execution_profile_id: fixture.approved.execution_profile_id,
          matching_evidence: fixture.plan.payload.extensions.matching_evidence,
          operations: fixture.plan.payload.operations.map((op) => ({
            ...op,
            parameter_metadata:
              'parameter_metadata' in op.attributes ? op.attributes.parameter_metadata : {},
          })),
          parameter_rules: fixture.plan.payload.extensions.parameter_rules,
        },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(config))
    const digest = Array.from(
      new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)),
      (value) => value.toString(16).padStart(2, '0'),
    ).join('')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_URL', '/config')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_SHA256', digest)
    const key = 'capptron.core.workflow.v1.' + encodeURIComponent('|' + digest)
    const journalKey = 'capptron.core.workflow.v1'
    const saved = {
      asset_id: fixture.asset.asset_id,
      parse_command_id: fixture.parse.command_id,
      task_id: fixture.task.task_id,
      revision: 1,
      run_id: fixture.run.run_id,
      drafts: { [draftKey('ring-op-2', 'parameters', 'rough_step')]: '0.4' },
    }
    localStorage.setItem(key, JSON.stringify(saved))
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/feedback'))
        return new Response(JSON.stringify({ feedback_version: 0, items: [] }))
      const value = url.includes('/parse?')
        ? fixture.parse
        : url.includes('/cad/assets/')
          ? fixture.asset
          : url.includes('/cam/tasks/')
            ? url.endsWith('/runs')
              ? { runs: [] }
              : fixture.approved
            : url.includes('/process-cards/')
              ? fixture.card
              : url.includes('/results/')
                ? fixture.plan
                : url.includes('/runs/')
                  ? fixture.run
                  : fixture.task
      return new Response(JSON.stringify(value))
    })
    vi.stubGlobal('fetch', fetcher)
    const first = renderHook(() => useLiveWorkflow(), { wrapper: StrictMode })
    const { result } = first
    await waitFor(() => expect(result.current.plan?.revision).toBe(1))
    expect(result.current.session?.plan.operations).toHaveLength(7)
    await waitFor(() => expect(result.current.session?.drafts).toEqual(saved.drafts))
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject(saved)
    const approvedBefore = result.current.approved
    const callsBefore = fetcher.mock.calls.length
    act(() => result.current.refreshReadiness())
    await waitFor(() => expect(fetcher.mock.calls.length).toBe(callsBefore + 3))
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.session?.drafts).toEqual(saved.drafts)
    expect(result.current.approved).toEqual(approvedBefore)
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...fixture.task, current_revision: 2 })),
    )
    act(() => result.current.refreshReadiness())
    await waitFor(() => expect(result.current.error).toContain('任务版本已变化'))
    expect(result.current.canRetry).toBe(false)
    expect(result.current.session?.drafts).toEqual(saved.drafts)
    act(() => result.current.refreshReadiness())
    await waitFor(() => expect(result.current.error).toBe(''))
    await waitFor(() => expect(result.current.busy).toBe(false))

    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject(saved)
    first.unmount()
    const second = renderHook(() => useLiveWorkflow(), { wrapper: StrictMode })
    await waitFor(() => expect(second.result.current.session?.drafts).toEqual(saved.drafts))
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject(saved)
    expect(fetcher.mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true)
  })
  const baseFixture = fixture
  it.each([false, true])('已完成旧运行恢复当前修订，保留旧草稿门禁 %s', async (hasDraft) => {
    const fixture = structuredClone(baseFixture)
    fixture.task.current_revision = 2
    fixture.plan.revision = 2
    fixture.run.output_revision = 2
    fixture.card.revision = 2
    const config = {
      schema_version: 'frontend-integration.v1',
      templates: [
        {
          template: fixture.deployment.template,
          execution_profile_id: fixture.approved.execution_profile_id,
          matching_evidence: fixture.plan.payload.extensions.matching_evidence,
          operations: fixture.plan.payload.operations.map((op) => ({
            ...op,
            parameter_metadata:
              'parameter_metadata' in op.attributes ? op.attributes.parameter_metadata : {},
          })),
          parameter_rules: fixture.plan.payload.extensions.parameter_rules,
        },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(config))
    const digest = Array.from(
      new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)),
      (value) => value.toString(16).padStart(2, '0'),
    ).join('')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_URL', '/config')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_SHA256', digest)
    const key = 'capptron.core.workflow.v1.' + encodeURIComponent('|' + digest)
    const journalKey = 'capptron.core.workflow.v1'
    const saved = {
      asset_id: fixture.asset.asset_id,
      parse_command_id: fixture.parse.command_id,
      task_id: fixture.task.task_id,
      revision: 1,
      run_id: 'older-run',
      drafts: hasDraft ? { [draftKey('ring-op-2', 'parameters', 'rough_step')]: '0.4' } : {},
    }
    localStorage.setItem(key, JSON.stringify(saved))
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/runs/older-run'))
        return new Response(
          JSON.stringify({ ...fixture.run, run_id: 'older-run', output_revision: 1 }),
        )
      if (url.endsWith('/feedback'))
        return new Response(JSON.stringify({ feedback_version: 0, items: [] }))
      const value = url.includes('/parse?')
        ? fixture.parse
        : url.includes('/cad/assets/')
          ? fixture.asset
          : url.includes('/cam/tasks/')
            ? url.endsWith('/runs')
              ? { runs: [] }
              : fixture.approved
            : url.includes('/process-cards/')
              ? fixture.card
              : url.includes('/results/')
                ? fixture.plan
                : url.includes('/runs/')
                  ? fixture.run
                  : fixture.task
      return new Response(JSON.stringify(value))
    })
    vi.stubGlobal('fetch', fetcher)
    const first = renderHook(() => useLiveWorkflow(), { wrapper: StrictMode })
    const { result } = first
    if (hasDraft) {
      await waitFor(() => expect(result.current.error).toContain('本地仍有旧版参数草稿'))
      expect(result.current.plan).toBeUndefined()
      expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject(saved)
      expect(fetcher.mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true)
      return
    }
    await waitFor(() => expect(result.current.plan?.revision).toBe(2))
    expect(result.current.session?.plan.operations).toHaveLength(7)
    await waitFor(() => expect(result.current.session?.drafts).toEqual(saved.drafts))
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject({
      ...saved,
      revision: 2,
      run_id: fixture.run.run_id,
    })
    first.unmount()
    const second = renderHook(() => useLiveWorkflow(), { wrapper: StrictMode })
    await waitFor(() => expect(second.result.current.session?.drafts).toEqual(saved.drafts))
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject({
      ...saved,
      revision: 2,
      run_id: fixture.run.run_id,
    })
    expect(fetcher.mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true)
  })
  it('失效任务的404是终态，可明确换输入，不能被无限重试锁住', async () => {
    const key = 'capptron.core.workflow.v1.' + encodeURIComponent('|')
    const journalKey = 'capptron.core.workflow.v1'
    localStorage.setItem(key, JSON.stringify({ task_id: 'gone-task' }))
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useLiveWorkflow())
    await waitFor(() => expect(result.current.error).toContain('任务不可恢复'))
    expect(result.current.canRetry).toBe(false)
    expect(JSON.parse(localStorage.getItem(journalKey)!)).toMatchObject({ task_id: 'gone-task' })
  })
  it('损坏日志禁止新上传，不能静默覆盖', async () => {
    // 当前 scope 损坏仍 fail-closed；旧 descriptor scope 的坏数据只跳过不阻断。
    localStorage.setItem('capptron.core.workflow.v1', '{broken')
    localStorage.setItem('capptron.core.workflow.v1.' + encodeURIComponent('|'), '{broken')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['STEP'], 'x.step')
    const { result } = renderHook(() => useLiveWorkflow(file))
    await waitFor(() => expect(result.current.error).toContain('Corrupt'))
    act(() => result.current.upload())
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('CAM observe 与终态完成的竞态', () => {
  async function pollingCase(code: number, status: string, wrongIdentity = false) {
    const config = {
      schema_version: 'frontend-integration.v1',
      templates: [
        {
          template: fixture.deployment.template,
          execution_profile_id: fixture.approved.execution_profile_id,
          matching_evidence: fixture.plan.payload.extensions.matching_evidence,
          operations: fixture.plan.payload.operations.map((op) => ({
            ...op,
            parameter_metadata:
              'parameter_metadata' in op.attributes ? op.attributes.parameter_metadata : {},
          })),
          parameter_rules: fixture.plan.payload.extensions.parameter_rules,
        },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(config))
    const digest = Array.from(
      new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)),
      (value) => value.toString(16).padStart(2, '0'),
    ).join('')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_URL', '/config')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_SHA256', digest)
    localStorage.setItem(
      'capptron.core.workflow.v1.' + encodeURIComponent('|' + digest),
      JSON.stringify({ task_id: fixture.task.task_id, cam_run_id: fixture.cam.cam_run_id }),
    )
    let camGets = 0
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/observe'))
        return new Response(
          JSON.stringify({
            error: { code, message: 'workflow conflict' },
            request_id: 'race-request',
          }),
          { status: 409 },
        )
      let value: unknown
      if (url.endsWith('/cam/runs/cam-1')) {
        camGets++
        value =
          camGets <= 2
            ? { ...fixture.cam, status: 'running', allowed_actions: ['observe'] }
            : { ...fixture.cam, status, cam_run_id: wrongIdentity ? 'other-run' : 'cam-1' }
      } else if (url.endsWith('/nc/versions/1')) value = fixture.nc
      else if (url.includes('/file?'))
        value = fixture.files.find(
          (file) => file.file_id === new URL(url, 'http://core').searchParams.get('file_id'),
        )
      else if (url.endsWith('/feedback')) value = { feedback_version: 0, items: [] }
      else if (url.includes('/cam/tasks/')) value = fixture.approved
      else if (url.includes('/process-cards/')) value = fixture.card
      else if (url.includes('/results/')) value = fixture.plan
      else if (url.includes('/runs/')) value = fixture.run
      else value = fixture.task
      void init
      return new Response(JSON.stringify(value))
    })
    vi.stubGlobal('fetch', fetcher)
    const hook = renderHook(() => useLiveWorkflow())
    await waitFor(() => expect(hook.result.current.plan?.revision).toBe(1))
    await waitFor(() => expect(hook.result.current.busy).toBe(false))
    act(() => hook.result.current.refreshCam())
    await waitFor(() => expect(hook.result.current.busy).toBe(false))
    return { ...hook, fetcher, camGets: () => camGets }
  }
  it('未确认结果只恢复原运行，不新建 CAM', async () => {
    const config = {
      schema_version: 'frontend-integration.v1',
      templates: [
        {
          template: fixture.deployment.template,
          execution_profile_id: fixture.approved.execution_profile_id,
          matching_evidence: fixture.plan.payload.extensions.matching_evidence,
          operations: fixture.plan.payload.operations.map((op) => ({
            ...op,
            parameter_metadata:
              'parameter_metadata' in op.attributes ? op.attributes.parameter_metadata : {},
          })),
          parameter_rules: fixture.plan.payload.extensions.parameter_rules,
        },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(config))
    const digest = Array.from(
      new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)),
      (value) => value.toString(16).padStart(2, '0'),
    ).join('')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_URL', '/config')
    vi.stubEnv('VITE_CORE_INTEGRATION_CONFIG_SHA256', digest)
    localStorage.setItem(
      'capptron.core.workflow.v1.' + encodeURIComponent('|' + digest),
      JSON.stringify({ task_id: fixture.task.task_id, cam_run_id: fixture.cam.cam_run_id }),
    )
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      let value: unknown
      if (url.endsWith('/reconcile')) value = { ...fixture.cam, status: 'succeeded' }
      else if (url.endsWith('/cam/runs/cam-1'))
        value = {
          ...fixture.cam,
          status: 'awaiting_confirmation',
          current_candidate: null,
          allowed_actions: ['reconcile', 'observe', 'cancel', 'closeout'],
        }
      else if (url.endsWith('/nc/versions/1')) value = fixture.nc
      else if (url.includes('/file?'))
        value = fixture.files.find(
          (file) => file.file_id === new URL(url, 'http://core').searchParams.get('file_id'),
        )
      else if (url.endsWith('/feedback')) value = { feedback_version: 0, items: [] }
      else if (url.includes('/cam/tasks/')) value = fixture.approved
      else if (url.includes('/process-cards/')) value = fixture.card
      else if (url.includes('/results/')) value = fixture.plan
      else if (url.includes('/runs/')) value = fixture.run
      else value = fixture.task
      void init
      return new Response(JSON.stringify(value))
    })
    vi.stubGlobal('fetch', fetcher)
    const hook = renderHook(() => useLiveWorkflow())
    await waitFor(() => expect(hook.result.current.plan?.revision).toBe(1))
    await waitFor(() => expect(hook.result.current.busy).toBe(false))
    act(() => hook.result.current.refreshCam())
    await waitFor(() => expect(hook.result.current.nc?.ref).toEqual(fixture.nc.ref))
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(writes.map(([url]) => url)).toEqual(['/cam/runs/cam-1/reconcile'])
    expect(hook.result.current.error).toBe('')
  })
  it('409/8302后只回读同run终态并展示原NC，不重新启动CAM', async () => {
    const { result, fetcher, camGets } = await pollingCase(8302, 'succeeded')
    expect(result.current.error).toBe('')
    expect(result.current.nc?.ref).toEqual(fixture.nc.ref)
    expect(result.current.files?.[0]?.text).toEqual(fixture.files[0]?.text)
    expect(camGets()).toBe(3)
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(writes.map(([url]) => url)).toEqual(['/cam/runs/cam-1/observe'])
  })
  it.each([
    [8302, 'running', false],
    [8301, 'succeeded', false],
    [8302, 'succeeded', true],
  ])('冲突%s但状态%s或身份变化%s仍报错', async (code, status, wrongIdentity) => {
    const { result, camGets } = await pollingCase(code, status, wrongIdentity)
    expect(result.current.error).toContain(`409 · ${code}`)
    expect(result.current.nc).toBeUndefined()
    expect(camGets()).toBe(code === 8302 ? 3 : 2)
  })
})
