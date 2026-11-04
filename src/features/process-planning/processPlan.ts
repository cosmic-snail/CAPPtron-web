// 前端展示契约；不代表后端已提供这些字段或完成制造校核。
export type Parameter = {
  choices?: { value: string; label: string }[]
  when?: string
  minimum?: number
  maximum?: number
  positive?: boolean
  serverError?: string
  allowedValues?: number[]
  id: string
  name: string
  value: string | number | null
  unit?: string
  source: 'historical_record' | 'mock' | 'template' | 'upstream' | 'human' | 'unknown'
  status: 'provided' | 'missing' | 'pending'
  editable: boolean
  required?: boolean
  description?: string
  inputKind: 'number' | 'text' | 'choice'
}

export type ProductionResource = {
  id: string
  name: string
  kind: 'tool' | 'machine' | 'other'
  description?: string
  status: 'demo' | 'pending'
}

export type ProcessStep = {
  id: string
  sequence: number
  name: string
  description?: string
  parameters: Parameter[]
}

export type ProcessOperation = {
  id: string
  sequence: number
  name: string
  source: string
  setup?: string
  setupId?: string
  notes?: string
  steps: ProcessStep[]
  parameters: Parameter[]
  resources: ProductionResource[]
  onsiteMeasurements: Parameter[]
}

export type OnsiteContract = {
  schema_version: 'onsite-record-v2'
  digest: string
  task_id: string
  part: { outer_diameter_mm: number; inner_diameter_mm: number; thickness_mm: number }
  configurations: Record<string, unknown[]>
  fields: {
    key: [string, string, string]
    name: string
    input_kind: Parameter['inputKind']
    unit?: string | null
    required: boolean
    choices?: { value: string; label: string }[]
    when?: string
    positive?: boolean
    value?: string
    reference?: number | null
  }[]
}
export type OnsiteAssessment = {
  engineering_issues?: { key: string[]; code: string; message: string }[]
  input_status: 'valid' | 'invalid'
  planning_status: string
  execution_status: 'compatible' | 'blocked'
  issues: { key: string[]; code: string; message: string }[]
  execution_blockers: { key: string[]; code: string; message: string }[]
}
export type ProcessPlan = {
  onsiteContract?: OnsiteContract
  onsiteAssessment?: OnsiteAssessment
  simulation?: boolean
  verifiedGeometry?: { outer_diameter_mm: number; inner_diameter_mm: number; thickness_mm: number }
  caseReference?: { caseId: string; version: string; planId: string; contentDigest: string }
  id: string
  name: string
  partName: string
  origin: 'mock' | 'live'
  sourceDescription: string
  engineeringStatus?: string
  parametersFrozen?: boolean
  operations: ProcessOperation[]
  initialOperationId?: string
  taskMeasurements?: Parameter[]
}

export type Drafts = Record<string, string>

export function draftKey(operationId: string, section: string, parameterId: string) {
  return JSON.stringify([operationId, section, parameterId])
}

// 仅控制演示按钮的填写门槛；不表示工艺审批、现场确认或制造安全。
export function getPlanReadiness(plan: ProcessPlan, drafts: Drafts) {
  const scopes = [
    { id: plan.id, groups: [{ section: 'task', parameters: plan.taskMeasurements ?? [] }] },
    ...plan.operations.map((operation) => ({
      id: operation.id,
      groups: [
        { section: 'onsite', parameters: operation.onsiteMeasurements },
        { section: 'parameters', parameters: operation.parameters },
        ...operation.steps.map((step) => ({
          section: `step-${step.id}`,
          parameters: step.parameters,
        })),
      ],
    })),
  ]
  const missing = scopes.flatMap(({ id, groups }) => {
    return groups.flatMap(({ section, parameters }) =>
      parameters
        .filter((parameter) => {
          const conditional =
            parameter.when &&
            (drafts[draftKey(id, section, parameter.when)] ??
              parameters.find((x) => x.id === parameter.when)?.value) === 'change'
          if (!parameter.required && !conditional) return false
          const value = drafts[draftKey(id, section, parameter.id)] ?? String(parameter.value ?? '')
          return (
            !value.trim() || (parameter.inputKind === 'number' && !Number.isFinite(Number(value)))
          )
        })
        .map((parameter) => ({ operationId: id, section, parameter })),
    )
  })
  const incompleteOperations = plan.operations.filter((operation) => !operation.steps.length)
  return {
    missing,
    incompleteOperations,
    ready: plan.operations.length > 0 && !missing.length && !incompleteOperations.length,
  }
}

export function resolveOperation(plan: ProcessPlan, selectedId: string | null) {
  return (
    plan.operations.find((operation) => operation.id === selectedId) ?? plan.operations[0] ?? null
  )
}

export function validateDraft(parameter: Parameter, value: string): string | null {
  if (!parameter.editable) return '此字段不允许本地编辑。'
  if (!value.trim()) return parameter.required === false ? null : '尚未填写，仍待补充。'
  if (parameter.choices && !parameter.choices.some((x) => x.value === value))
    return '请选择有效选项。'
  if (parameter.positive && Number(value) <= 0) return '必须大于 0。'
  if (parameter.allowedValues && !parameter.allowedValues.includes(Number(value)))
    return `仅允许：${parameter.allowedValues.join(' / ')} ${parameter.unit ?? ''}`
  if (parameter.inputKind === 'number' && !Number.isFinite(Number(value))) {
    return '请输入有限数值；单位见字段说明。'
  }
  if (parameter.minimum !== undefined && Number(value) < parameter.minimum)
    return `不能小于 ${parameter.minimum} ${parameter.unit ?? ''}`
  if (parameter.maximum !== undefined && Number(value) > parameter.maximum)
    return `不能大于 ${parameter.maximum} ${parameter.unit ?? ''}`
  // 仅采用服务端特征导出的边界，不代表加工余量和装夹已验证。
  return null
}
