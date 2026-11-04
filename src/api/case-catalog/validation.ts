import Ajv from 'ajv'
import { sha256Hex } from '../browserCrypto'
import documentSchema from './schema/case-document.schema.json'
import indexSchema from './schema/case-index.schema.json'
import type { CaseDocument, CaseField, CaseIndex, CaseSummary } from './types'

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true })
const checkDocument = ajv.compile<CaseDocument>(documentSchema)
const checkIndex = ajv.compile<CaseIndex>(indexSchema)

function unique(ids: string[], scope: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`${scope} 存在重复 ID`)
}
function fields(items: CaseField[], scope: string) {
  unique(
    items.map((item) => item.id),
    scope,
  )
  for (const item of items) {
    if (typeof item.value === 'number' && !Number.isFinite(item.value))
      throw new Error(`${scope}/${item.id} 必须是有限数值`)
    if (item.status === 'provided' && (item.value === null || item.value === ''))
      throw new Error(`${scope}/${item.id} 已提供状态不能没有值`)
    if (item.editPolicy === 'demo_input' && (item.value !== null || item.source !== 'unknown'))
      throw new Error(`${scope}/${item.id} 现场字段只能定义空草稿，不得预置现场确认值`)
  }
}

export function validateCaseIndex(value: unknown): CaseIndex {
  if (!checkIndex(value)) throw new Error(`案例索引校验失败：${ajv.errorsText(checkIndex.errors)}`)
  unique(
    value.cases.map((item) => item.caseId),
    '案例索引',
  )
  unique(
    value.cases.flatMap((item) => item.versions.map((entry) => entry.path)),
    '版本路径',
  )
  for (const item of value.cases)
    unique(
      item.versions.map((entry) => entry.version),
      item.caseId,
    )
  return value
}

export function validateCaseDocument(value: unknown): CaseDocument {
  if (!checkDocument(value))
    throw new Error(`案例文档校验失败：${ajv.errorsText(checkDocument.errors)}`)
  const { case: metadata, caseVersion, processPlan: plan } = value
  if (metadata.id !== caseVersion.caseId) throw new Error('案例与版本身份不一致')
  unique(
    plan.operations.map((item) => item.id),
    '工序',
  )
  fields(plan.taskFields, '任务字段')
  if (
    plan.initialOperationId &&
    !plan.operations.some((item) => item.id === plan.initialOperationId)
  )
    throw new Error('默认工序引用不存在')
  for (const operation of plan.operations) {
    unique(
      operation.steps.map((item) => item.id),
      `${operation.id} 工步`,
    )
    unique(
      operation.resources.map((item) => item.id),
      `${operation.id} 资源`,
    )
    fields(operation.parameters, `${operation.id} 参数`)
    fields(operation.onsiteFields, `${operation.id} 现场字段`)
    for (const step of operation.steps) fields(step.parameters, `${operation.id}/${step.id} 参数`)
  }
  unique(
    value.programAssets.map((item) => item.id),
    '程序资产',
  )
  unique(
    value.verificationEvidence.map((item) => item.id),
    '验证证据',
  )
  for (const item of [...value.programAssets, ...value.verificationEvidence]) {
    if (
      item.caseId !== metadata.id ||
      item.caseVersion !== caseVersion.version ||
      item.planId !== plan.id
    )
      throw new Error(`${item.id} 引用了其他案例版本或工艺方案`)
  }
  for (const evidence of value.verificationEvidence)
    for (const id of evidence.programAssetIds)
      if (!value.programAssets.some((item) => item.id === id))
        throw new Error(`${evidence.id} 的程序资产引用不存在：${id}`)
  return value
}

// v1 规范化：递归排序对象键，保留数组顺序，以 JSON.stringify 表示原始值。
// 摘要只排除根级 contentDigest；不是文件原始字节摘要，也不是制造真实性签名。
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('摘要拒绝非有限数值')
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('摘要只支持 JSON 数据')
  return result
}

export async function calculateContentDigest(document: CaseDocument): Promise<string> {
  const payload = { ...document } as Partial<CaseDocument>
  delete payload.contentDigest
  return sha256Hex(new TextEncoder().encode(canonicalJson(payload)))
}

export async function verifyCaseVersion(value: unknown, summary: CaseSummary, version: string) {
  const document = validateCaseDocument(value)
  const reference = summary.versions.find((item) => item.version === version)
  if (!reference || document.case.id !== summary.caseId || document.caseVersion.version !== version)
    throw new Error('案例 ID 或版本与索引不一致')
  const digest = await calculateContentDigest(document)
  if (digest !== document.contentDigest || digest !== reference.contentDigest)
    throw new Error('案例内容摘要不匹配；拒绝加载')
  return document
}
