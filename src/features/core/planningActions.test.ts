import { describe, expect, it } from 'vitest'
import { planningActions } from './planningActions'

const base = {
  dirty: false,
  busy: false,
  canRetry: false,
  activeCam: false,
  reviewer: '1',
  card: { status: 'ready' },
  task: { task_id: 't', current_revision: 4 },
  plan: { result_id: 'r' },
  approved: { execution_configured: true, plans: [] },
}

describe('工艺操作原因', () => {
  it('已批准但执行不匹配应显示系统原因，不再要求批准', () => {
    const state = {
      ...base,
      approved: {
        execution_configured: true,
        plans: [
          {
            plan_ref: { task_id: 't', result_id: 'r', revision: 4 },
            profile_matches: false,
            preflight: {
              status: 'blocked',
              message: '当前方案与工程绑定不一致',
              next_action: '请维护人员核对绑定。',
            },
          },
        ],
      },
    }
    const result = planningActions(state)
    expect(result.status).toContain('已批准')
    expect(result.runReason).toContain('工程绑定不一致')
    expect(result.runReason).toContain('维护人员')
  })
  it('审批前显示预检阻断', () => {
    const result = planningActions({
      ...base,
      card: {
        status: 'ready',
        execution_preflight: {
          status: 'blocked',
          message: '配置不可用',
          next_action: '请维护人员检查。',
        },
      },
    })
    expect(result.approveReason).toContain('配置不可用')
  })
  it('成功的预检不能代替批准', () => {
    const result = planningActions(base)
    expect(result.approveReason).toBe('')
    expect(result.runReason).toContain('批准')
  })
  it('已确认失败且不需要复位时可以重新运行', () => {
    const approved = {
      ...base,
      approved: {
        execution_configured: true,
        plans: [{ plan_ref: { task_id: 't', result_id: 'r', revision: 4 }, profile_matches: true }],
      },
      executable: { plan_ref: { task_id: 't', result_id: 'r', revision: 4 } },
    }
    expect(planningActions({ ...approved, cam: { status: 'failed' } }).runReason).toBe('')
    expect(planningActions({ ...approved, cam: { status: 'cancelled' } }).runReason).toBe('')
    expect(
      planningActions({ ...approved, cam: { status: 'failed', reset_required: true } }).runReason,
    ).toContain('已有 CAM')
    expect(
      planningActions({ ...approved, cam: { status: 'awaiting_confirmation' } }).runReason,
    ).toContain('已有 CAM')
    expect(planningActions({ ...approved, cam: { status: 'succeeded' } }).runReason).toContain(
      '已有 CAM',
    )
  })
  it('未决请求和草稿有明确下一步', () => {
    expect(planningActions({ ...base, canRetry: true }).approveReason).toContain('继续查询')
    expect(planningActions({ ...base, dirty: true }).approveReason).toContain('提交修改')
    expect(planningActions({ ...base, reviewer: '' }).approveReason).toContain('审核人')
  })
})
