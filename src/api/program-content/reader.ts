import { sha256Hex } from '../browserCrypto'
import type { CaseDocument, ProgramAsset } from '../case-catalog/types'
import { decodeProgram } from './format'
import type { ProgramFormat } from './format'

export type ProgramContent = {
  text: string
  source: 'historical_reference' | 'demo_fixture' | 'cam_generated'
  sourceDigest: string
  sizeBytes: number
  format: ProgramFormat
}
export interface ProgramContentReader {
  read(document: CaseDocument, asset: ProgramAsset, signal: AbortSignal): Promise<ProgramContent>
}

export async function verifyProgramBytes(bytes: Uint8Array<ArrayBuffer>, asset: ProgramAsset) {
  const digest = await sha256Hex(bytes)
  if (
    !asset.sha256 ||
    asset.sizeBytes === undefined ||
    digest !== asset.sha256 ||
    bytes.length !== asset.sizeBytes
  )
    throw new Error('历史 NC 大小或 SHA-256 与案例元数据不匹配；正文未加载。')
  return digest
}

export const localProgramContentReader: ProgramContentReader = {
  async read(document, asset, signal) {
    if (!import.meta.env.DEV)
      throw new Error('参考程序正文暂不可用：仅本机开发模式支持私有参考资产。')
    if (
      asset.caseId !== document.case.id ||
      asset.caseVersion !== document.caseVersion.version ||
      asset.planId !== document.processPlan.id
    )
      throw new Error('程序资产与当前案例或工艺方案不一致。')
    const response = await fetch(`${import.meta.env.BASE_URL}__local_reference/golden-b7`, {
      signal,
      cache: 'no-store',
      headers: { 'X-CAPPtron-Local-Reference': '1' },
    })
    if (!response.ok || response.headers.get('Content-Type') !== 'application/octet-stream') {
      if (response.status === 409)
        throw new Error('历史 NC 大小或 SHA-256 与案例元数据不匹配；正文未加载。')
      throw new Error('参考程序正文暂不可用：未配置、文件不存在或当前运行模式不支持。')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const sourceDigest = await verifyProgramBytes(bytes, asset)
    return {
      ...decodeProgram(bytes),
      source:
        response.headers.get('X-CAPPtron-Content-Source') === 'demo_fixture'
          ? 'demo_fixture'
          : 'historical_reference',
      sourceDigest,
      sizeBytes: bytes.length,
    }
  },
}
