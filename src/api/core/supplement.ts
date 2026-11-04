import type { Drafts, Parameter, ProcessPlan } from '../../features/process-planning/processPlan'
import { draftKey, validateDraft } from '../../features/process-planning/processPlan'

// Golden-B7 原型现场采集清单；仅作人工信息记录，不是 CAM 参数或制造合格判定。
export const supplementSchema = 'golden-b7-onsite-record-v1'
const field = (id: string, name: string, unit?: string): Parameter => ({
  id,
  name,
  unit,
  value: null,
  source: 'unknown',
  status: 'missing',
  editable: true,
  required: true,
  inputKind: unit ? 'number' : 'text',
  description: '人工现场记录；提交后保存到任务反馈，不自动应用到 CAM。',
})
export function attachSupplementFields(plan: ProcessPlan, templateId: string) {
  if (plan.onsiteContract) {
    const contract = plan.onsiteContract
    if (contract.schema_version !== 'onsite-record-v2' || contract.task_id !== plan.id)
      throw new Error('现场配置与任务不匹配')
    plan.taskMeasurements = []
    for (const f of contract.fields) {
      const [owner, scope, id] = f.key
      const configName =
        id === 'work-offset-mode' ? 'coordinate' : id === 'fixture-mode' ? 'fixture' : undefined
      const config = configName ? contract.configurations[configName] : undefined
      const p: Parameter = {
        id,
        name: f.name,
        inputKind: f.input_kind,
        unit: f.unit ?? undefined,
        required: f.required,
        choices: f.choices,
        when: f.when,
        positive: f.positive,
        minimum:
          id === 'stock-od'
            ? contract.part.outer_diameter_mm
            : id === 'stock-length'
              ? contract.part.thickness_mm
              : id === 'stock-id'
                ? 0
                : undefined,
        maximum: id === 'stock-id' ? contract.part.inner_diameter_mm : undefined,
        value: f.value ?? f.reference ?? null,
        source: f.reference != null ? 'template' : 'unknown',
        status: 'pending',
        editable: true,
        serverError:
          [
            ...(plan.onsiteAssessment?.issues ?? []),
            ...(plan.onsiteAssessment?.execution_blockers ?? []),
          ]
            .filter((x) => JSON.stringify(x.key) === JSON.stringify(f.key))
            .map((x) => x.message)
            .join(' ') || undefined,
        description: config
          ? `当前配置：${configurationSummary(configName!, config)}。沿用仅对应当前配置版本。`
          : '现场约束进入规划记录；实际 CAM 应用状态由服务端单独核对。',
      }
      const pending = plan.onsiteAssessment?.engineering_issues
        ?.filter((x) => JSON.stringify(x.key) === JSON.stringify(f.key))
        .map((x) => x.message)
        .join(' ')
      if (pending) p.description += ` ${pending}`
      if (scope === 'task' && owner === plan.id) plan.taskMeasurements.push(p)
      else if (scope === 'onsite') {
        const op = plan.operations.find((x) => x.id === owner)
        if (!op) throw new Error('现场字段引用未知工序')
        op.onsiteMeasurements.push(p)
      } else throw new Error('现场字段范围不受支持')
    }
    return
  }
  if (templateId !== 'golden-b7') return
  plan.taskMeasurements = [
    field('stock-od', '现场毛坯外径', 'mm'),
    field('stock-id', '现场毛坯预孔直径', 'mm'),
    field('stock-length', '现场毛坯长度', 'mm'),
    field('work-offset', '工件零点 / 偏置核对'),
    field('fixture', '装夹方式与夹具核对'),
  ]
  const bore = plan.operations.find((op) => op.id === 'ring-op-5')
  if (bore) bore.onsiteMeasurements = [field('bore-surface-ra', '内孔表面粗糙度要求 Ra', 'μm')]
}
export function supplementFields(plan: ProcessPlan) {
  return [
    ...(plan.taskMeasurements ?? []).map((p) => ({ key: draftKey(plan.id, 'task', p.id), p })),
    ...plan.operations.flatMap((op) =>
      op.onsiteMeasurements.map((p) => ({ key: draftKey(op.id, 'onsite', p.id), p })),
    ),
  ]
}
export function supplementSchemaFor(plan: ProcessPlan) {
  return plan.onsiteContract?.schema_version ?? supplementSchema
}
export function supplementPayload(plan: ProcessPlan, values: Record<string, string>) {
  return plan.onsiteContract ? { values, contract_digest: plan.onsiteContract.digest } : { values }
}
function configurationSummary(name: string, config: unknown[]) {
  if (!config.length) return '未提供，不能声明沿用'
  if (name === 'coordinate') {
    const rows = config.flatMap(
      (x) =>
        (x as { operations?: { origin?: number[]; work_offset?: number }[] })?.operations ?? [],
    )
    if (rows.length)
      return [
        ...new Set(
          rows.map(
            (x) =>
              `零点 (${x.origin?.join(', ') ?? '未提供'}) mm，偏置编号 ${x.work_offset ?? '未提供'}`,
          ),
        ),
      ].join('；')
  } else {
    const lengths = config.flatMap(
      (x) => (x as { chuck_grip_length?: number[] })?.chuck_grip_length ?? [],
    )
    if (lengths.length)
      return `模板夹持长度 ${[...new Set(lengths)].join(' / ')} mm；夹具类型等条件仍需现场核对`
  }
  return JSON.stringify(config)
}
export function supplementValues(plan: ProcessPlan, drafts: Drafts) {
  const values = Object.fromEntries(
    supplementFields(plan)
      .filter(
        ({ p }) =>
          !p.when ||
          (drafts[draftKey(plan.id, 'task', p.when)] ??
            plan.taskMeasurements?.find((x) => x.id === p.when)?.value) === 'change',
      )
      .map(({ key, p }) => {
        const value = drafts[key] ?? String(p.value ?? '')
        const error = validateDraft(p, value)
        if (error || (!value.trim() && (p.required || p.when)))
          throw new Error(`${p.name}：${error ?? '请填写'}`)
        if (p.inputKind === 'number' && Number(value) < 0) throw new Error(`${p.name}：不能为负数`)
        return [key, value]
      }),
  )
  const read = (id: string) => Number(values[draftKey(plan.id, 'task', id)])
  const od = read('stock-od'),
    inner = read('stock-id'),
    length = read('stock-length')
  if (!(od > inner) || length <= 0) throw new Error('毛坯外径必须大于预孔直径，长度必须大于0。')
  const geometry = plan.verifiedGeometry
  if (
    geometry &&
    (od < geometry.outer_diameter_mm ||
      inner > geometry.inner_diameter_mm ||
      length < geometry.thickness_mm)
  )
    throw new Error(
      `毛坯尺寸无法加工当前零件（外径${geometry.outer_diameter_mm}、内径${geometry.inner_diameter_mm}、厚度${geometry.thickness_mm} mm）；请修正测试值。`,
    )
  return values
}
export type SupplementList = {
  feedback_version: number
  items: {
    feedback_id: string
    status: string
    supplement_schema_version?: string
    supplement?: { values?: Record<string, unknown> }
    expected_feedback_version: number
  }[]
}
export function applySupplement(plan: ProcessPlan, list: SupplementList) {
  const latest = list.items
    .filter(
      (x) =>
        x.status === 'active' &&
        [supplementSchema, 'onsite-record-v2'].includes(x.supplement_schema_version ?? ''),
    )
    .sort((a, b) => b.expected_feedback_version - a.expected_feedback_version)[0]
  if (!latest) return false
  for (const { key, p } of supplementFields(plan)) {
    const value = latest.supplement?.values?.[key]
    if (typeof value !== 'string' || validateDraft(p, value)) continue
    p.value = value
    p.source = 'human'
    p.status = 'provided'
  }
  return true
}
