// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { CoreClient, cardPath } from '../core/client'
import type { Asset, Task } from '../core/client'
import { simulationKey, simulationRuntime, simulationSample } from './runtime'
import { simulationZip } from './zip'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('模拟禁止网络访问')
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())
const api = () => new CoreClient('', simulationRuntime.fetcher)
async function task() {
  const client = api()
  const asset = await client.upload(simulationSample(), crypto.randomUUID())
  const parse = crypto.randomUUID()
  await client.post(`/cad/assets/${asset.asset_id}/parse`, { command_id: parse })
  const task = await client.post<Task>('/planning/tasks', {
    command_id: crypto.randomUUID(),
    payload: {
      source: { asset_id: asset.asset_id, sha256: asset.sha256, parse_command_id: parse },
    },
  })
  return { client, task }
}

it('JSON 保存稳定身份，重放命令幂等，同 ID 不得覆盖另一请求', async () => {
  const { client, task: created } = await task()
  const path = `/planning/tasks/${created.task_id}/replan`
  const body = { command_id: crypto.randomUUID(), base_revision: 0, expected_feedback_version: 0 }
  const first = await client.post(path, body)
  expect(await api().post(path, body)).toEqual(first)
  await expect(api().post(path, { ...body, base_revision: 1 })).rejects.toThrow('ID 已用于另一请求')
  expect((await api().get<Task>(`/planning/tasks/${created.task_id}`)).current_revision).toBe(1)
  await expect(
    client.post(
      `${cardPath(created.task_id, 1)}/review`,
      { command_id: crypto.randomUUID(), expected_feedback_version: 5 },
      'reviewer-01',
    ),
  ).rejects.toThrow('版本过期')
  expect(fetch).not.toHaveBeenCalled()
})

it('未知任务、非示例文件和损坏 JSON 不产生伪造结果', async () => {
  await expect(api().get('/planning/tasks/missing')).rejects.toThrow('404')
  await expect(api().upload(new File(['other'], 'real.step'), crypto.randomUUID())).rejects.toThrow(
    '仅支持内置 Golden 示例',
  )
  expect(localStorage.getItem(simulationKey)).toBeNull()
  localStorage.setItem(simulationKey, '{broken')
  await expect(api().get('/planning/tasks/missing')).rejects.toThrow()
  expect(localStorage.getItem(simulationKey)).toBe('{broken')
  expect(fetch).not.toHaveBeenCalled()
})

it('新建输入保留旧任务，不混用任务身份', async () => {
  const first = await task(),
    second = await task()
  expect(first.task.task_id).not.toBe(second.task.task_id)
  expect(await api().get<Task>(`/planning/tasks/${first.task.task_id}`)).toMatchObject(first.task)
  const data = JSON.parse(localStorage.getItem(simulationKey)!)
  expect(Object.keys(data.tasks)).toHaveLength(2)
  const assets = Object.values(data.assets) as Asset[]
  expect(new Set(assets.map((asset) => asset.asset_id)).size).toBe(2)
})

it('下载为包含模拟声明与 NC 正文的可读 ZIP', async () => {
  const bytes = new Uint8Array(
    await simulationZip([
      { name: 'SIMULATION-ONLY.json', text: '{"simulation":true}' },
      { name: 'setup.nc', text: '(SIMULATION ONLY)\r\nM30\r\n' },
    ]).arrayBuffer(),
  )
  const view = new DataView(bytes.buffer)
  expect(view.getUint32(0, true)).toBe(0x04034b50)
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50)
  expect(view.getUint16(bytes.length - 12, true)).toBe(2)
  const nameLength = view.getUint16(26, true),
    size = view.getUint32(18, true)
  expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('SIMULATION-ONLY.json')
  expect(
    JSON.parse(new TextDecoder().decode(bytes.slice(30 + nameLength, 30 + nameLength + size))),
  ).toEqual({ simulation: true })
})
