import type { Asset, ParseResult } from './client'

// template-request-v2：客户端只提交已验证输入引用，不声明模板、几何或候选。
export function templateRequestV2(asset: Asset, parsed: ParseResult, command: string) {
  if (
    parsed.status !== 'parsed' ||
    parsed.asset_id !== asset.asset_id ||
    parsed.source_sha256 !== asset.sha256
  )
    throw new Error('解析回执与上传 STEP 不匹配')
  return {
    command_id: command,
    schema_version: 'template-request-v2',
    payload: {
      source: {
        asset_id: asset.asset_id,
        sha256: asset.sha256,
        parse_command_id: parsed.command_id,
      },
    },
  }
}
