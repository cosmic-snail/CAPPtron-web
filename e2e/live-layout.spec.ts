import { test, expect } from '@playwright/test'
import { coreFixture, startPlanning, openPlan } from './coreFixture'

// 以 PR30 已验收的最小可视空间为下限，防止新增提示重新挤占正文。
test('Live 工序与参数保留基线空间，任务入口不挤占左侧列表', async ({ page }) => {
  await coreFixture(page)
  await startPlanning(page)
  await openPlan(page)
  const wide = page.viewportSize()!.width > 1600
  const list = page.getByRole('navigation', { name: '工序列表' })
  const listBox = await list.boundingBox()
  expect(listBox!.height).toBeGreaterThanOrEqual(wide ? 450 : 270)
  await list.getByRole('button').filter({ hasText: '外圆粗车' }).click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  const detail = page.getByRole('region', { name: '工序详情正文' })
  const detailBox = await detail.boundingBox()
  expect(detailBox!.height).toBeGreaterThanOrEqual(wide ? 400 : 220)
  const parameter = await page.getByLabel('粗车参数 rough_step').boundingBox()
  expect(parameter!.y + parameter!.height).toBeLessThanOrEqual(detailBox!.y + detailBox!.height)
  await page.getByRole('button', { name: '任务共用信息 待填 5' }).click()
  const shared = await page.getByRole('region', { name: '任务共用现场信息' }).boundingBox()
  const first = await page.getByRole('textbox', { name: '现场毛坯外径', exact: true }).boundingBox()
  expect(first!.y + first!.height).toBeLessThanOrEqual(shared!.y + shared!.height)
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  expect(dimensions.width).toBe(page.viewportSize()!.width)
  expect(dimensions.height).toBe(page.viewportSize()!.height)
})

test('恢复表单展开不移动模型输入页，输入边界清晰且 Escape 可收起', async ({ page }) => {
  await coreFixture(page)
  await page.goto('/')
  await page.getByRole('button', { name: '切换真实联调' }).click()
  const before = await page.locator('.model-input-columns').boundingBox()
  await page.getByText('恢复已有输入 / 任务', { exact: true }).click()
  const panel = page.getByRole('region', { name: '恢复已有输入或任务' })
  await expect(panel).toBeVisible()
  const after = await page.locator('.model-input-columns').boundingBox()
  expect(after).toEqual(before)
  const input = page.getByLabel('恢复任务 ID')
  const style = await input.evaluate((element) => ({
    border: getComputedStyle(element).borderTopWidth,
    height: element.getBoundingClientRect().height,
  }))
  expect(style.border).toBe('1px')
  expect(style.height).toBeGreaterThanOrEqual(36)
  await input.fill('synthetic-task-id')
  await page.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  await expect(page.getByText('恢复已有输入 / 任务', { exact: true })).toBeFocused()
})
