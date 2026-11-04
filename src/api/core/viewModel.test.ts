import { describe, expect, it } from 'vitest'
import fixture from '../../../e2e/fixtures/core-golden.json'
import type { LivePlan } from './contracts'
import { deploymentFromPlan, parameterChanges, toProcessPlan } from './viewModel'
import { templateRequestV2 } from './golden'
import { cardPath } from './client'
import { draftKey } from '../../features/process-planning/processPlan'

const plan = () => structuredClone(fixture.plan) as unknown as LivePlan
const config = () => deploymentFromPlan(plan())
describe('固定Golden结果映射与版本约束', () => {
  it('按实际sequence排序、保留插入钻孔的ID，不填补资源和参数', () => {
    const input = plan()
    input.payload.operations.reverse()
    const vm = toProcessPlan(input, config())
    expect(vm.operations).toHaveLength(7)
    expect(vm.operations[1]?.id).toBe('ring-op-7')
    expect(vm.operations[0]?.resources).toEqual([])
    expect(vm.operations[0]?.parameters).toEqual([])
    expect(vm.operations[0]?.steps[0]?.id).toBe(
      input.payload.operations.find((op) => op.id === vm.operations[0]?.id)?.steps[0]?.id,
    )
  })
  it('空参数规则仍只读展示已有刀具、进给幅值和主轴设定', () => {
    const input = plan()
    input.payload.extensions.parameter_rules = []
    input.payload.extensions.engineering_status = 'pending'
    const operation = input.payload.operations[0]!
    operation.attributes.parameters = { feed: -0.15, rpm: 800, depth: 0.5, stock_x: 0.2 }
    operation.attributes.tool = { station: 1, tool_number: 1 }
    operation.steps[0]!.attributes = { mastercam_operation_id: 2 }
    const vm = toProcessPlan(input, config())
    expect(vm.engineeringStatus).toBe('pending')
    expect(vm.parametersFrozen).toBe(true)
    const shown = vm.operations[0]!
    expect(shown.parameters.find((item) => item.id === 'feed')).toMatchObject({
      name: '进给幅值',
      value: 0.15,
      editable: false,
    })
    expect(shown.parameters.find((item) => item.id === 'feed')?.description).toContain('-0.15')
    expect(shown.parameters.find((item) => item.id === 'rpm')).toMatchObject({
      name: '主轴设定',
      value: 800,
      unit: undefined,
      editable: false,
    })
    expect(shown.parameters.find((item) => item.id === 'rpm')?.description).toContain('恒线速')
    expect(shown.parameters.find((item) => item.id === 'depth')?.name).toBe('切深')
    expect(shown.resources[0]).toMatchObject({ kind: 'tool', name: '刀号 1', status: 'pending' })
    expect(shown.steps[0]?.parameters.map((item) => item.id)).toEqual([
      'mastercam_operation_id',
      'tool',
      'feed',
      'rpm',
      'depth',
      'stock_x',
    ])
    expect(shown.steps[0]?.parameters.find((item) => item.id === 'tool')?.value).toBe(
      '刀号 1 / 刀位 1',
    )
    expect(shown.steps[0]?.parameters[0]?.value).toBe(2)
    expect(shown.steps[0]?.parameters[0]?.description).toContain('mastercam_operation_id')
  })
  it('用 setup_id 和 native_operation_id 展示装夹与原生工序，不一致时拒绝', () => {
    const input = plan()
    const operation = input.payload.operations[0]!
    operation.attributes.setup_id = 'inner-mouth'
    operation.steps[0]!.attributes = { native_operation_id: 1 }
    const shown = toProcessPlan(input, config()).operations[0]!
    expect(shown.setup).toBe('未提供')
    expect(shown.setupId).toBe('inner-mouth')
    expect(shown.steps[0]?.parameters[0]).toMatchObject({
      id: 'mastercam_operation_id',
      name: '原生工序 ID',
      value: 1,
    })
    expect(shown.steps[0]?.parameters[0]?.description).toContain('native_operation_id')
    operation.steps[0]!.attributes = { mastercam_operation_id: 2, native_operation_id: 1 }
    expect(() => toProcessPlan(input, config())).toThrow('不一致')
  })
  it('只接受离散值，禁止0.45及未知来源编辑', () => {
    const input = plan(),
      vm = toProcessPlan(input, config())
    const key = draftKey('ring-op-2', 'parameters', 'rough_step')
    expect(parameterChanges(vm, { [key]: '0.4' })).toEqual([
      { operation_id: 'ring-op-2', parameter_id: 'rough_step', value: 0.4, unit: 'mm' },
    ])
    expect(() => parameterChanges(vm, { [key]: '0.45' })).toThrow('仅允许')
    const rough = input.payload.operations.find((op) => op.id === 'ring-op-2')!
    delete rough.attributes.parameter_metadata
    rough.attributes.parameters!.unlabelled_speed = 123
    const result = toProcessPlan(input, config()).operations.find((op) => op.id === rough.id)!
    expect(result.parameters.every((p) => !p.editable)).toBe(true)
    expect(result.parameters.find((p) => p.id === 'unlabelled_speed')?.unit).toBeUndefined()
  })
  it('摘要/输出协议错误拒绝，重复身份不使用下标修复', () => {
    const input = plan()
    input.payload.operations[1]!.id = input.payload.operations[0]!.id
    expect(() => toProcessPlan(input, config())).toThrow('身份')
    expect(() => toProcessPlan({ ...plan(), provider: 'mock' }, config())).toThrow('协议')
    expect(() =>
      toProcessPlan(plan(), {
        ...config(),
        template: { ...config().template, digest: 'f'.repeat(64) },
      }),
    ).toThrow('身份')
  })
  it('创建不伪造几何，v2 请求只提交已验证输入引用', () => {
    const parsed = { ...fixture.parse, status: 'parsed' as const, execution_ready: false as const }
    const body = templateRequestV2(fixture.asset, parsed, 'create-command')
    expect(body.schema_version).toBe('template-request-v2')
    expect(body.payload).not.toHaveProperty('template')
    expect(body.payload).not.toHaveProperty('part')
    expect(body.payload).not.toHaveProperty('candidates')
    expect(body.payload.source).toEqual({
      asset_id: fixture.asset.asset_id,
      sha256: fixture.asset.sha256,
      parse_command_id: parsed.command_id,
    })
    expect(() =>
      templateRequestV2(fixture.asset, { ...parsed, source_sha256: '0'.repeat(64) }, 'c'),
    ).toThrow('不匹配')
    // Core 结果缺少已选模板身份时展示层明确报错，不静默补默认。
    const broken = plan()
    ;(broken.payload.extensions as Record<string, unknown>).template = undefined
    expect(() => deploymentFromPlan(broken)).toThrow('模板身份')
  })
  it('工艺卡task_key使用UTF8 base64url，与planning路径分离', () => {
    const key = cardPath('task/中文', 2)
    expect(key).toBe('/process-cards/tasks/id_dGFzay_kuK3mloc/results/2')
    expect(key).not.toContain('=')
  })
})
