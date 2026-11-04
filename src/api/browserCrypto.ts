import { sha256 } from '@noble/hashes/sha2.js'

// 浏览器只在 HTTPS 或 localhost 安全上下文提供 crypto.randomUUID 与 crypto.subtle。
// 测试电脑以普通 http://<Windows IP>:<port> 访问时两者均为 undefined，
// 但 crypto.getRandomValues 不受此限制。此处优先使用原生接口，缺失时回退到等价实现，
// 输出格式与原生结果完全一致。每次调用时读取 globalThis.crypto，便于测试替换环境。

type Bytes = BufferSource

// 用 ArrayBuffer.isView 判断，避免跨 realm 的 ArrayBuffer 在 instanceof 下误判为视图。
const view = (data: Bytes) =>
  ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** 计算 SHA-256，返回 64 位小写十六进制字符串。 */
export async function sha256Hex(data: Bytes): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) return hex(new Uint8Array(await subtle.digest('SHA-256', data)))
  return hex(sha256(view(data)))
}

/** 生成 RFC 4122 版本 4 UUID；只使用密码学安全随机数，不回退到 Math.random。 */
export function randomId(): string {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return source.randomUUID()
  if (typeof source?.getRandomValues !== 'function') {
    throw new Error('当前浏览器不支持安全随机数，无法生成命令编号')
  }
  const bytes = source.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const text = hex(bytes)
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`
}
