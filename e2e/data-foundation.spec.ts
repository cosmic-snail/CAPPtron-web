import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
  if (name.startsWith('foundation-chromium')) {
    const viewport = info.outputPath(`${name}-viewport.png`)
    await page.screenshot({ path: viewport })
    await info.attach(`${name}-viewport`, { path: viewport, contentType: 'image/png' })
  }
}
test('固定快照大屏、键盘图表、资源分页搜索详情与焦点恢复', async ({ page }, info) => {
  const errors: string[] = [],
    external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (
      new URL(request.url()).origin !== 'http://127.0.0.1:5183' ||
      !['GET', 'HEAD'].includes(request.method())
    )
      external.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: '数据底座', exact: true }).click()
  await expect(page.getByRole('heading', { name: '数据底座', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '数据底座' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const kpis = page.getByRole('region', { name: '数据概览' })
  await expect(kpis.locator('dd strong')).toHaveText(['171', '27', '72', '99', '6'])
  await expect(page.getByText(/模型调用/)).toHaveCount(0)
  await expect(page.getByText('模拟数据', { exact: true })).toBeVisible()
  await expect(page.getByText(/foundation-turning-mock-v2:20261020:2026-10-20/)).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '模型库' })).toContainText('未接入 6 个')
  await screenshot(page, info, `foundation-${info.project.name}`)
  const point = page.getByRole('img', { name: /2026-10-14 新增知识/ })
  await point.focus()
  await expect(point).toBeFocused()
  await expect(page.locator('.foundation-chart-caption [aria-live]')).toContainText(
    '2026-10-14 新增知识',
  )
  const parts = page.getByRole('button', { name: '查看零件库，24 条' })
  await parts.click()
  const dialog = page.getByRole('dialog', { name: '资源目录' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('region', { name: '资源列表' }).locator('li')).toHaveCount(10)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText('第 2 / 3 页')).toBeVisible()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByRole('region', { name: '资源列表' }).locator('li')).toHaveCount(4)
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled()
  await page.getByLabel('名称搜索').fill('传动轴')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByText('零件库 · 共 1 条')).toBeVisible()
  await page
    .getByRole('region', { name: '资源列表' })
    .getByRole('button', { name: /演示传动轴/ })
    .click()
  await expect(page.getByRole('region', { name: '资源详情' })).toContainText('回转体车削阶段')
  await screenshot(page, info, 'foundation-part-detail')
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(parts).toBeFocused()
  await page.getByRole('region', { name: '热点知识' }).getByRole('button').first().click()
  await expect(page.getByRole('region', { name: '资源详情' })).toContainText('完整正文')
  await expect(page.locator('.foundation-knowledge-content')).toContainText('未经工程确认')
  await page.locator('.foundation-knowledge-content').scrollIntoViewIfNeeded()
  await screenshot(page, info, 'foundation-knowledge-detail')
  await page.getByRole('button', { name: '关闭资源目录' }).click()
  await page.getByRole('button', { name: '返回智能工艺工作台' }).click()
  await expect(page.getByRole('region', { name: '模型输入', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('工作台参数、工序、模型来源与 Agent 对话跨大屏保持', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'Kept.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('test only'),
  })
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByLabel('演示方案').selectOption('simple')
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  await page.clock.fastForward(4100)
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByRole('button', { name: '补充工序信息', exact: true }).click()
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button', { name: /轮廓与孔加工/ })
    .click()
  await page.getByLabel('毛坯实测高度').fill('42.5')
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('轮廓与孔加工')
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await page.getByLabel('消息', { exact: true }).fill('切换大屏后保留这条消息')
  await page.getByRole('button', { name: '发送演示消息' }).click()
  await page.getByLabel('消息', { exact: true }).fill('未发送的草稿')
  await page.keyboard.press('Escape')
  const workspace = await page.locator('.workflow-view').elementHandle()
  await page.getByRole('button', { name: '数据底座', exact: true }).click()
  await expect(page.getByRole('heading', { name: '数据底座', exact: true })).toBeVisible()
  await expect(page.locator('.workflow-view')).toHaveAttribute('inert', '')
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toHaveCount(0)
  await page.getByRole('button', { name: '返回智能工艺工作台' }).click()
  expect(
    await workspace!.evaluate((element) => element === document.querySelector('.workflow-view')),
  ).toBe(true)
  await expect(page.getByRole('button', { name: '02 工艺决策' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('region', { name: '当前模型文件' })).toContainText('Kept.step')
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('轮廓与孔加工')
  await expect(page.getByLabel('毛坯实测高度')).toHaveValue('42.5')
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await expect(page.getByRole('log')).toContainText('切换大屏后保留这条消息')
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('未发送的草稿')
})
