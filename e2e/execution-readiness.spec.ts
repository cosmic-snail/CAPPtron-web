import { test, expect } from '@playwright/test'
import { coreFixture, startPlanning, openPlan } from './coreFixture'
import fixture from './fixtures/core-golden.json' with { type: 'json' }

test('执行预检解释禁用原因，重新检查保留审核人和当前任务', async ({ page }, testInfo) => {
  const requests = await coreFixture(page)
  let blocked = true
  await page.route('**/process-cards/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      json: {
        ...fixture.card,
        execution_preflight: {
          status: blocked ? 'blocked' : 'ready',
          code: blocked ? 'source_binding_mismatch' : 'ready',
          message: blocked ? '解析来源与工程绑定不匹配' : '执行配置预检通过',
          next_action: blocked ? '请维护人员核对绑定配置，无需重填信息。' : '请批准当前工艺卡。',
        },
      },
    })
  })
  await startPlanning(page)
  await openPlan(page)
  await page.getByLabel('审核人 ID').fill('reviewer-01')
  const approve = page.getByRole('button', { name: '批准当前工艺卡', exact: true })
  await expect(approve).toBeDisabled()
  await page.getByLabel('查看任务状态详情').click()
  await expect(page.locator('#planning-next-action')).toContainText('解析来源与工程绑定不匹配')
  await page.screenshot({ path: testInfo.outputPath('execution-blocked.png'), fullPage: true })
  const commandsBefore = structuredClone(requests.commands)
  blocked = false
  await page.getByRole('button', { name: '重新检查执行条件', exact: true }).click()
  await expect(approve).toBeEnabled()
  await expect(page.getByLabel('审核人 ID')).toHaveValue('reviewer-01')
  await expect(page.getByRole('button', { name: '运行 Mastercam', exact: true })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('execution-ready.png'), fullPage: true })
  expect(requests.commands).toEqual(commandsBefore)
})
