import { expect, test } from '@playwright/test'
import fixture from './fixtures/core-golden.json' with { type: 'json' }
import { coreFixture, startPlanning, openPlan, approvePlan, validate } from './coreFixture'

// 旧独立Core表单已退出主界面；版本、丢回执和NC失败场景迁至core-live.spec.ts。
// 本文件保留输入失败、模式隔离、换任务与明确拒绝后的修正回归，全部使用Core schema。
test('真实模式保留三阶段和原文件入口，Demo数据不成为制造输入', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '使用示例 Ring_A.step' }).click()
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await expect(page.getByRole('button', { name: '01 模型输入' })).toBeVisible()
  await expect(page.getByRole('button', { name: '03 程序审核' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工序列表' })).toHaveCount(0)
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(page.getByRole('button', { name: '上传 STEP', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '创建任务并规划' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Core 真实工作区' })).toHaveCount(0)
})

test('STEP上传失败不可解析或创建任务，不退回Mock', async ({ page }) => {
  validate('ApiErrorResponse', fixture.error)
  await page.route('**/cad/assets?*', (route) =>
    route.fulfill({ status: 503, json: fixture.error }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'ring.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('STEP'),
  })
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '执行 NX 解析' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '创建任务并规划' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '切换原型演示' })).toBeVisible()
})

test('换输入清除旧工艺和NC；新任务失败不保留旧批准', async ({ page }) => {
  await coreFixture(page)
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'new.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('NEW'),
  })
  await expect(page.getByLabel('NC 文件')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '程序可用', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('navigation', { name: '工序列表' })).toHaveCount(0)
  await page.route('**/cad/assets?*', (route) =>
    route.fulfill({ status: 503, json: fixture.error }),
  )
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '创建任务并规划' })).toBeDisabled()
})

test('明确422拒绝保留草稿并允许修正后提交；不继承旧批准', async ({ page }) => {
  await coreFixture(page)
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await page.getByLabel('粗车参数 rough_step').fill('0.4')
  await page.route('**/replan', (route) => route.fulfill({ status: 422, json: fixture.error }), {
    times: 1,
  })
  await page.getByRole('button', { name: '提交修改并重新规划' }).click()
  await expect(page.getByRole('alert')).toContainText('422')
  await expect(page.getByLabel('粗车参数 rough_step')).toHaveValue('0.4')
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '提交修改并重新规划' })).toBeEnabled()
  await page.getByRole('button', { name: '提交修改并重新规划' }).click()
  await openPlan(page)
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
})

test('未提交草稿的换文件提示与Live/Demo往返保留', async ({ page }) => {
  await coreFixture(page)
  await startPlanning(page)
  await openPlan(page)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await page.getByLabel('粗车参数 rough_step').fill('0.4')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'new.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('NEW'),
  })
  await expect(page.getByLabel('粗车参数 rough_step')).toHaveValue('0.4')
  await page.getByRole('button', { name: '切换原型演示' }).click()
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await expect(page.getByLabel('粗车参数 rough_step')).toHaveValue('0.4')
})
