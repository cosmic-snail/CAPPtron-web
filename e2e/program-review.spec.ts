import { test, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

const fixture =
  'SYNTHETIC UI TEST ONLY — NOT EXECUTABLE NC\r\n' +
  Array.from(
    { length: 220 },
    (_, i) => `TEST TEXT ${i + 1}: ${'not machining data / '.repeat(i === 0 ? 30 : 2)}`,
  ).join('\r\n')
async function installFixture(page: Page, status = 200) {
  const catalog = JSON.parse(readFileSync('public/case-catalog/golden-b7/v2.json', 'utf8'))
  // 只替换浏览器响应；发布的 JSON 与字节摘要不改动。
  catalog.case.name = 'Golden-B7 合成 UI 测试'
  catalog.programAssets[0].sha256 = createHash('sha256').update(fixture).digest('hex')
  catalog.programAssets[0].sizeBytes = Buffer.byteLength(fixture)
  const payload = { ...catalog }
  delete payload.contentDigest
  catalog.contentDigest = createHash('sha256').update(canonical(payload)).digest('hex')
  const index = JSON.parse(readFileSync('public/case-catalog/index.json', 'utf8'))
  index.cases[0].versions[0].contentDigest = catalog.contentDigest
  await page.route('**/case-catalog/index.json', (route) => route.fulfill({ json: index }))
  await page.route('**/case-catalog/golden-b7/v2.json', (route) => route.fulfill({ json: catalog }))
  await page.route('**/__local_reference/golden-b7', (route) =>
    route.fulfill({
      status,
      body: status === 200 ? fixture : 'unavailable',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-CAPPtron-Content-Source': 'demo_fixture',
      },
    }),
  )
}
async function enter(page: Page) {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: '使用示例 Ring_A.step' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await page.clock.fastForward(4100)
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
}
async function shot(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('程序审核切换数据底座后保留编辑器、修订和撤销历史', async ({ page }, info) => {
  await installFixture(page)
  await enter(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  const editor = page.getByRole('textbox', { name: 'NC 程序草稿' })
  await expect(editor).toContainText('SYNTHETIC UI TEST ONLY')
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('KEEP FOUNDATION ROUNDTRIP\n')
  const originalEditor = await editor.elementHandle()
  await expect(page.locator('.review-heading [role="status"]')).toContainText('修订 r2')
  await page.getByRole('button', { name: '数据底座', exact: true }).click()
  await expect(page.getByRole('heading', { name: '数据底座', exact: true })).toBeVisible()
  await expect(editor).not.toBeVisible()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toHaveCount(0)
  await page.getByRole('button', { name: '返回智能工艺工作台' }).click()
  await expect(page.getByRole('button', { name: '03 程序审核' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(editor).toContainText('KEEP FOUNDATION ROUNDTRIP')
  expect(
    await originalEditor!.evaluate((element) => element === document.querySelector('.cm-content')),
  ).toBe(true)
  await expect(page.locator('.review-heading [role="status"]')).toContainText('修订 r2')
  await expect(page.getByText(/未保存修改/)).toBeVisible()
  await page.getByRole('button', { name: '撤销修改', exact: true }).click()
  await expect(editor).not.toContainText('KEEP FOUNDATION ROUNDTRIP')
  await shot(page, info, 'foundation-return-to-review')
})
test('审核入口准确空状态及摘要失配，禁止生成伪 NC', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '03 程序审核' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByText('参考程序正文暂不可用')).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toBeVisible()
  await shot(page, info, 'review-default-empty')
  await installFixture(page, 409)
  await enter(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('alert')).toContainText('SHA-256')
  await expect(page.getByRole('textbox', { name: 'NC 程序草稿' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下载程序草稿' })).toHaveCount(0)
  await shot(page, info, 'review-reference-mismatch')
})
test('真实 Chromium 编辑、撤销重做、差异、保存恢复及长行滚动', async ({ page }, info) => {
  await installFixture(page)
  await enter(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  const editor = page.getByRole('textbox', { name: 'NC 程序草稿' })
  await expect(editor).toContainText('SYNTHETIC UI TEST ONLY')
  const undoButton = page.getByRole('button', { name: '撤销修改', exact: true })
  const redoButton = page.getByRole('button', { name: '恢复已撤销', exact: true })
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeDisabled()
  await expect(page.getByText(/不可执行的合成测试文本/)).toBeVisible()
  await expect(page.getByRole('button', { name: '确认可用', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '下载程序草稿' })).toBeDisabled()
  await shot(page, info, 'review-synthetic-loaded')
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('HUMAN TEST EDIT\nsecond line\n')
  await expect(undoButton).toBeEnabled()
  await expect(redoButton).toBeDisabled()
  await expect(page.getByText(/未保存修改/)).toBeVisible()
  await expect(page.getByText(/仅测试 · 不可审核/)).toBeVisible()
  await shot(page, info, 'review-unsaved')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor).not.toContainText('HUMAN TEST EDIT')
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(editor).toContainText('HUMAN TEST EDIT')
  await expect(undoButton).toBeEnabled()
  await expect(redoButton).toBeDisabled()
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await expect(page.getByRole('region', { name: '原始程序与当前草稿差异' })).toContainText(
    '+ HUMAN TEST EDIT',
  )
  await shot(page, info, 'review-diff')
  await page.getByRole('button', { name: '暂存草稿' }).click()
  await expect(page.getByText(/已暂存草稿 r4（刷新后丢失）/)).toBeVisible()
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('UNSAVED\n')
  await page.getByRole('button', { name: '恢复暂存' }).click()
  await expect(editor).not.toContainText('UNSAVED')
  await expect(editor).toContainText('HUMAN TEST EDIT')
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await page.getByRole('button', { name: '展开代码' }).click()
  const scroll = page.locator('.cm-scroller')
  await scroll.evaluate((el) => {
    el.scrollLeft = 200
  })
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  await scroll.evaluate((el) => {
    el.scrollTop = 3000
  })
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  await expect(page.getByRole('button', { name: '暂存草稿' })).toBeInViewport({ ratio: 1 })
  await shot(page, info, 'review-expanded-scroll')
  await page.getByRole('button', { name: '恢复原文' }).click()
  await expect(editor).not.toContainText('HUMAN TEST EDIT')
  await expect(page.getByText(/未保存修改/)).toBeVisible()
})
test('工艺与审核共享 Agent、工序、消息输入与程序草稿，模型更换隔离任务', async ({ page }, info) => {
  await installFixture(page)
  await enter(page)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button', { name: /05 内孔精车/ })
    .click()
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await page.getByLabel('消息', { exact: true }).fill('跨页面演示消息')
  await page.getByRole('button', { name: '发送演示消息' }).click()
  await page.getByLabel('消息', { exact: true }).fill('尚未发送')
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  const editor = page.getByRole('textbox', { name: 'NC 程序草稿' })
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('KEEP DRAFT\n')
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('尚未发送')
  await expect(page.getByRole('log')).toContainText('跨页面演示消息')
  await expect(page.getByRole('region', { name: 'Agent 当前上下文' })).toContainText('修订 r2')
  await expect(page.getByRole('log')).toContainText('未生成或验证 NC')
  await shot(page, info, 'review-agent-drawer')
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await page.getByRole('button', { name: '返回工艺决策' }).click()
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('内孔精车')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(editor).toContainText('KEEP DRAFT')
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toHaveCount(0)
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'different.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('TEST ONLY'),
  })
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByText('参考程序正文暂不可用')).toBeVisible()
  await expect(editor).toHaveCount(0)
})

test('专注编辑显著扩大正文，退出保留编辑历史，Agent 不遮挡操作', async ({ page }, info) => {
  await installFixture(page)
  await enter(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  const editor = page.getByRole('textbox', { name: 'NC 程序草稿' })
  await expect(editor).toBeVisible()
  const originalEditor = await editor.elementHandle()
  const scroll = page.locator('.cm-scroller')
  const normal = (await scroll.boundingBox())!
  await shot(page, info, 'review-focus-before')
  await page.getByRole('button', { name: '展开代码' }).click()
  const viewport = page.viewportSize()!
  const expanded = (await scroll.boundingBox())!
  expect(expanded.height).toBeGreaterThan(normal.height + 300)
  expect(expanded.height).toBeGreaterThan(viewport.height * 0.75)
  expect(expanded.width).toBeGreaterThan(viewport.width * 0.95)
  expect(await editor.evaluate((element, original) => element === original, originalEditor)).toBe(
    true,
  )
  await expect(page.locator('.app-header')).toBeHidden()
  await expect(page.locator('.workflow-navigation')).toBeHidden()
  await expect(page.locator('.file-info-bar')).toBeHidden()
  await expect(page.locator('.app-footer')).toBeHidden()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toBeHidden()
  await expect(page.locator('.focus-review-status')).toContainText('仅测试 · 不可审核')
  await expect(page.locator('.program-toolbar')).toContainText('合成测试 · 不可执行')
  for (const name of ['退出专注编辑', '暂存草稿', '确认可用', '下载程序草稿', 'Agent 协同'])
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await shot(page, info, 'review-focus-expanded')
  const measurements = info.outputPath('editor-viewport-measurements.json')
  writeFileSync(measurements, JSON.stringify({ viewport, normal, expanded }, null, 2))
  await info.attach('editor-viewport-measurements', {
    path: measurements,
    contentType: 'application/json',
  })
  await page.getByRole('button', { name: 'Agent 协同', exact: true }).click()
  await page.getByLabel('消息', { exact: true }).fill('专注编辑中的未发送消息')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Agent 协同', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '退出专注编辑' })).toBeVisible()
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('FOCUS EDIT TEST\n')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '展开代码' })).toBeFocused()
  await expect(page.locator('.workflow-navigation')).toBeVisible()
  await expect(page.locator('.file-info-bar')).toBeVisible()
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.locator('.app-footer')).toBeVisible()
  await expect(editor).toContainText('FOCUS EDIT TEST')
  await page.getByRole('button', { name: '撤销修改', exact: true }).click()
  await expect(editor).not.toContainText('FOCUS EDIT TEST')
  await page.getByRole('button', { name: '展开代码' }).click()
  await page.getByRole('button', { name: '恢复已撤销', exact: true }).click()
  await expect(editor).toContainText('FOCUS EDIT TEST')
  await page.getByRole('button', { name: '撤销修改', exact: true }).click()
  await expect(page.getByRole('button', { name: '恢复已撤销', exact: true })).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.insertText('FOCUS EDIT TEST\nNEW EDIT AFTER UNDO\n')
  await expect(page.getByRole('button', { name: '恢复已撤销', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await expect(page.getByRole('region', { name: '原始程序与当前草稿差异' })).toContainText(
    '+ FOCUS EDIT TEST',
  )
  await shot(page, info, 'review-focus-diff')
  await page.getByRole('button', { name: '退出专注编辑' }).click()
  await expect(page.locator('.workflow-navigation')).toBeVisible()
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('专注编辑中的未发送消息')
})
