import { attachSupplementFields } from './supplement'
import type { Drafts, Parameter, ProcessPlan } from '../../features/process-planning/processPlan'
import { draftKey, validateDraft } from '../../features/process-planning/processPlan'
import type { Attributes, LivePlan, Deployment } from './contracts'

// 部署快照由 Core 结果扩展提供：模板身份、执行配置摘要与匹配证据。
// 浏览器不再读取离线 descriptor；缺失或不一致的字段只读或报错。
export function deploymentFromPlan(plan: LivePlan): Deployment {
  const ext = plan.payload.extensions
  const template = ext?.template as Deployment['template'] | undefined
  if (
    !template ||
    typeof template.id !== 'string' ||
    !template.id ||
    typeof template.version !== 'string' ||
    !template.version ||
    typeof template.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(template.digest)
  )
    throw new Error('Core 结果缺少已选模板身份')
  return {
    schema_version: 'golden-deployment-v1',
    source: `Core 结果 · ${plan.task_id} · r${plan.revision}`,
    template,
    execution_profile_digest:
      typeof ext.execution_profile_digest === 'string' ? ext.execution_profile_digest : '',
    engineering_binding_configured: !!ext.matching_evidence,
  }
}

function toolParameter(tool: Attributes['tool']): Parameter[] {
  const [resource] = toolResource(tool)
  if (!resource) return []
  return [
    {
      id: 'tool',
      name: '刀具',
      value: `${resource.name} / ${resource.description}`,
      editable: false,
      inputKind: 'text',
      source: 'upstream',
      status: 'provided',
      description: '刀具身份来自工序属性，只读。',
    },
  ]
}

function toolResource(tool: Attributes['tool']) {
  if (
    !tool ||
    !Number.isInteger(tool.tool_number) ||
    !tool.tool_number ||
    tool.tool_number <= 0 ||
    !Number.isInteger(tool.station) ||
    tool.station == null ||
    tool.station < 0
  )
    return []
  return [
    {
      id: `tool-${tool.station}-${tool.tool_number}`,
      kind: 'tool' as const,
      name: `刀号 ${tool.tool_number}`,
      description: `刀位 ${tool.station}`,
      status: 'pending' as const,
    },
  ]
}

export function toProcessPlan(plan: LivePlan, deployment: Deployment): ProcessPlan {
  const ext = plan.payload.extensions
  if (
    plan.provider !== 'template' ||
    !['template-plan-v1', 'template-plan-v1-integration'].includes(plan.schema_version) ||
    ext.template.digest !== deployment.template.digest ||
    ext.template.id !== deployment.template.id ||
    ext.template.version !== deployment.template.version
  )
    throw new Error('工艺结果的模板身份或输出协议与部署配置不匹配')
  const ordered = <T extends { id: string; sequence: number }>(items: T[]) => {
    if (
      !Array.isArray(items) ||
      items.some((x) => !x.id || !Number.isInteger(x.sequence) || x.sequence < 1) ||
      new Set(items.map((x) => x.id)).size !== items.length ||
      new Set(items.map((x) => x.sequence)).size !== items.length
    )
      throw new Error('工序/工步身份或顺序不合法')
    return [...items].sort((a, b) => a.sequence - b.sequence)
  }
  const fieldNames: Record<string, string> = {
    feed: '进给幅值',
    rpm: '主轴设定',
    depth: '切深',
    stock_x: 'X 余量',
    stock_z: 'Z 余量',
    rough_step: '粗车步距',
    clearance: '安全距离',
    retract: '退刀',
  }
  const parameters = (
    attributes: Attributes,
    operationId: string,
    editable: boolean,
  ): Parameter[] =>
    Object.entries(attributes.parameters ?? {}).map(([id, raw]) => {
      const meta = attributes.parameter_metadata?.[id]
      const rule = ext.parameter_rules?.find(
        (r) => r.operation_id === operationId && r.parameter_id === id,
      )
      const allowed =
        editable &&
        meta?.edit_policy === 'replace' &&
        rule?.edit_policy === 'replace' &&
        rule.value_type === 'number' &&
        meta.unit === rule.unit &&
        !!meta.unit &&
        meta.source?.sha256 === ext.execution_profile_digest &&
        ext.execution_profile_digest === deployment.execution_profile_digest &&
        !!meta.allowed_values?.length &&
        meta.allowed_values.every((v) => rule.allowed_values?.includes(v))
          ? meta.allowed_values
          : undefined
      const numeric = typeof raw === 'number'
      let name = meta?.name ?? fieldNames[id] ?? id
      let value: Parameter['value'] =
        numeric || typeof raw === 'string' ? raw : raw == null ? null : JSON.stringify(raw)
      let unit = meta?.unit
      let description = `${meta?.unit ? '' : '单位未提供 · '}${meta?.source ? `${meta.source.kind} · ${meta.source.resource_id} · ${meta.source.sha256} · ${meta.source.pointer}` : '参数描述来源未提供，保持只读'}`
      // 负数进给是原生编码。没有单位元数据时只展示幅值，并保留原始编码。
      if (id === 'feed' && numeric && raw < 0 && !meta?.unit) {
        name = '进给幅值'
        value = Math.abs(raw)
        unit = undefined
        description = `原生进给编码为 ${raw}。符号是编码，不是负向物理进给。单位未随结果提供，未做换算。`
      }
      // 字段名 rpm 不能当作转速单位；结果未带恒线速标志时两种单位都不标。
      if (id === 'rpm' && !meta?.unit) {
        name = '主轴设定'
        unit = undefined
        description = `计划字段名为 rpm，值为 ${String(raw)}。结果没有恒线速标志，不能标成 rpm，也不能标成恒线速。`
      }
      return {
        id,
        name,
        value,
        unit,
        editable: !!allowed,
        allowedValues: allowed,
        inputKind: numeric ? 'number' : 'text',
        source: 'upstream',
        status: raw == null ? 'missing' : 'provided',
        description,
      }
    })
  const nativeParameter = (id: number): Parameter => ({
    id: 'mastercam_operation_id',
    name: '原生工序 ID',
    value: id,
    editable: false,
    inputKind: 'number',
    source: 'upstream',
    status: 'provided',
    description: 'Mastercam 工序 ID，来自工步属性。',
  })
  const model: ProcessPlan = {
    id: plan.task_id,
    verifiedGeometry: ext.verified_part,
    onsiteContract: ext.onsite_contract,
    onsiteAssessment: ext.onsite_record_attestation?.input_status
      ? ext.onsite_record_attestation
      : undefined,
    name: 'Core 工艺方案',
    partName: plan.payload.part?.name ?? '当前 STEP',
    origin: 'live',
    sourceDescription: `Core · ${plan.task_id} · revision ${plan.revision} · ${plan.schema_version}`,
    engineeringStatus:
      typeof ext.engineering_status === 'string' ? ext.engineering_status : undefined,
    parametersFrozen: Array.isArray(ext.parameter_rules) && ext.parameter_rules.length === 0,
    operations: ordered(plan.payload.operations).map((op) => ({
      id: op.id,
      sequence: op.sequence,
      name: op.name,
      source: `Core · ${plan.result_id} / r${plan.revision}`,
      setup: op.attributes.setup ?? '未提供',
      notes: op.attributes.notes ?? '未提供',
      parameters: parameters(op.attributes, op.id, true),
      onsiteMeasurements: [],
      resources: [
        ...(op.attributes.resources ?? [])
          .filter((r) => r.id && r.name && ['tool', 'machine', 'other'].includes(r.kind))
          .map((r) => ({ ...r, status: 'pending' as const })),
        ...toolResource(op.attributes.tool),
      ],
      steps: ordered(op.steps).map((step) => {
        const own = parameters(step.attributes ?? {}, op.id, false)
        const native = step.attributes?.mastercam_operation_id
        return {
          id: step.id,
          sequence: step.sequence,
          name: step.content,
          parameters: [
            ...(typeof native === 'number' && Number.isInteger(native)
              ? [nativeParameter(native)]
              : []),
            ...toolParameter(op.attributes.tool),
            ...(own.length ? own : parameters(op.attributes, op.id, false)),
          ],
        }
      }),
    })),
  }
  attachSupplementFields(model, ext.template.id)
  return model
}
export function parameterChanges(plan: ProcessPlan, drafts: Drafts) {
  return plan.operations.flatMap((op) =>
    op.parameters.flatMap((parameter) => {
      const value = drafts[draftKey(op.id, 'parameters', parameter.id)]
      if (value === undefined || value === String(parameter.value)) return []
      const error = validateDraft(parameter, value)
      if (error) throw new Error(error)
      return [
        {
          operation_id: op.id,
          parameter_id: parameter.id,
          value: Number(value),
          unit: parameter.unit,
        },
      ]
    }),
  )
}
