import { expect, it } from 'vitest'
import fixture from '../../../e2e/fixtures/onsite-v2.json'
import {
  attachSupplementFields,
  supplementValues,
  supplementPayload,
  supplementSchemaFor,
} from './supplement'
import { draftKey } from '../../features/process-planning/processPlan'
import type { OnsiteContract, ProcessPlan } from '../../features/process-planning/processPlan'

function model() {
  const contract = structuredClone(fixture) as unknown as OnsiteContract
  const plan = {
    id: contract.task_id,
    onsiteContract: contract,
    verifiedGeometry: contract.part,
    operations: [
      ...new Set(contract.fields.filter((f) => f.key[1] === 'onsite').map((f) => f.key[0])),
    ].map((id) => ({ id, onsiteMeasurements: [] })),
  } as unknown as ProcessPlan
  attachSupplementFields(plan, 'any-template')
  return plan
}
it('服务端声明字段并绑定配置版本，支持合理新毛坯和选填备注', () => {
  const plan = model()
  const values = Object.fromEntries(
    plan.onsiteContract!.fields.map((f) => [
      JSON.stringify(f.key),
      f.key[2] === 'stock-od'
        ? '43'
        : f.key[2] === 'stock-id'
          ? '0'
          : f.key[2] === 'stock-length'
            ? '8'
            : f.input_kind === 'choice'
              ? f.key[2].endsWith('-mode')
                ? 'inherit'
                : 'drawing'
              : f.unit === 'μm'
                ? '1.6'
                : '',
    ]),
  )
  const result = supplementValues(plan, values)
  expect(supplementSchemaFor(plan)).toBe('onsite-record-v2')
  expect(supplementPayload(plan, result)).toEqual({
    values: result,
    contract_digest: fixture.digest,
  })
  expect(result[draftKey(plan.id, 'task', 'note')]).toBe('')
  expect(result[draftKey(plan.id, 'task', 'grip-length')]).toBeUndefined()
  expect(() =>
    supplementValues(plan, { ...values, [draftKey(plan.id, 'task', 'stock-od')]: '5' }),
  ).toThrow()
  expect(() =>
    supplementValues(plan, { ...values, [draftKey(plan.id, 'task', 'fixture-mode')]: 'change' }),
  ).toThrow()
})
it('按稳定身份显示服务端字段错误，不把记录当成已应用到CAM', () => {
  const plan = model()
  plan.onsiteAssessment = {
    input_status: 'valid',
    planning_status: 'constraints_recorded',
    execution_status: 'blocked',
    issues: [],
    execution_blockers: [
      {
        key: [plan.id, 'task', 'stock-od'],
        code: 'cam_stock_update_unsupported',
        message: '当前模板无法应用新毛坯',
      },
    ],
  }
  attachSupplementFields(plan, 'any-template')
  expect(plan.taskMeasurements!.find((x) => x.id === 'stock-od')!.serverError).toContain('无法应用')
  expect(plan.taskMeasurements!.find((x) => x.id === 'fixture-mode')!.inputKind).toBe('choice')
  expect(plan.taskMeasurements!.find((x) => x.id === 'note')!.required).toBe(false)
})
