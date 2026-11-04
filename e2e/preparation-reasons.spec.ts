import { expect, test } from '@playwright/test'
import { coreFixture, startPlanning, openPlan } from './coreFixture'
import fixture from './fixtures/core-golden.json' with { type: 'json' }

for (const [code, detail] of [
  [
    'parameter_value_unsupported',
    '工序 ring-op-2 的参数 rough_step 请求值 0.45 mm 当前模板不支持；当前允许值：[0.5, 0.4]。',
  ],
  ['parameter_unit_invalid', '工序 ring-op-2 的参数 rough_step 单位应为 mm。'],
  ['not_applicable', '当前模板不适用于本次零件几何。'],
]) {
  test(`展示服务端校验原因 ${code} 并保留执行门禁`, async ({ page }, info) => {
    await coreFixture(page)
    await page.route('**/planning/tasks/*/results/*', async (route) => {
      const plan = structuredClone(fixture.plan)
      Object.assign(plan.payload.extensions, {
        reference_only: true,
        execution_ready: false,
        preparation: { issues: [{ code, detail }] },
      })
      plan.revision = 1
      plan.run_id = 'planning-1'
      await route.fulfill({ json: plan })
    })
    await startPlanning(page)
    await expect(page.getByText(detail, { exact: true })).toBeVisible()
    await openPlan(page)
    await page.getByLabel('查看任务状态详情').click()
    await expect(page.getByText(detail, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
    await page.screenshot({ path: info.outputPath('reason.png') })
  })
}
