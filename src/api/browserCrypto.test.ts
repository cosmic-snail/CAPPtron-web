import { createHash, webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId, sha256Hex } from './browserCrypto'

// 模拟测试电脑以普通 http://<Windows IP> 访问：没有 randomUUID 与 subtle，只有 getRandomValues。
const insecureContext = () =>
  vi.stubGlobal('crypto', {
    getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array),
  })
const secureContext = () => vi.stubGlobal('crypto', webcrypto)

const utf8 = (text: string) => new TextEncoder().encode(text)
const samples: [string, Uint8Array<ArrayBuffer>][] = [
  ['空输入', new Uint8Array()],
  ['ASCII', utf8('abc')],
  ['中文 UTF-8', utf8('外圆粗车 φ50 · 审核人')],
  ['CRLF NC 文本', utf8('%\r\nO0001\r\nG01 X1\r\n%\r\n')],
  ['二进制全字节', Uint8Array.from({ length: 256 }, (_, i) => i)],
  ['跨多个分块', Uint8Array.from({ length: 1_000_003 }, (_, i) => (i * 31) % 251)],
]
const expected = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('sha256Hex', () => {
  it.each(samples)('普通 HTTP 回退实现与原生结果一致：%s', async (_name, bytes) => {
    insecureContext()
    expect(globalThis.crypto.subtle).toBeUndefined()
    await expect(sha256Hex(bytes)).resolves.toBe(expected(bytes))
  })

  it.each(samples)('安全上下文使用 WebCrypto：%s', async (_name, bytes) => {
    secureContext()
    await expect(sha256Hex(bytes)).resolves.toBe(expected(bytes))
  })

  it('接受 ArrayBuffer 与带偏移的视图，只计算视图范围', async () => {
    insecureContext()
    const whole = utf8('xxG01 X1yy')
    const part = new Uint8Array(whole.buffer, 2, 6)
    await expect(sha256Hex(part)).resolves.toBe(expected(utf8('G01 X1')))
    await expect(sha256Hex(whole.buffer)).resolves.toBe(expected(whole))
  })
})

describe('randomId', () => {
  it('普通 HTTP 下用安全随机数生成 UUID v4', () => {
    insecureContext()
    const ids = new Set(Array.from({ length: 1000 }, randomId))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(uuidV4)
  })

  it('安全上下文直接使用 crypto.randomUUID', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000000')
    vi.stubGlobal('crypto', { randomUUID })
    expect(randomId()).toBe('00000000-0000-4000-8000-000000000000')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('没有安全随机数时明确报错，不生成弱编号', () => {
    vi.stubGlobal('crypto', {})
    expect(() => randomId()).toThrow('当前浏览器不支持安全随机数')
  })
})
