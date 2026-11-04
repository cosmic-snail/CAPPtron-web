import { expect, test as base } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

const test = base.extend<{ browserChecks: void }>({
  browserChecks: [
    async ({ page }, use) => {
      await page.clock.install()
      const errors: string[] = [],
        mutations: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => {
        if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url())
      })
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === 'http://127.0.0.1:5183'
          ? route.continue()
          : route.abort(),
      )
      await use()
      expect(errors).toEqual([])
      expect(mutations, '演示操作不得提交制造数据或调用后端').toEqual([])
    },
    { auto: true },
  ],
})

async function enter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '02 工艺决策' }).click()
}
async function demo(page: Page, id = 'simple') {
  await page.getByLabel('演示方案').selectOption(id)
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  const view = page.getByRole('button', { name: '查看工艺规划结果' })
  if (await view.count()) {
    await page.clock.fastForward(4100)
    await expect(view).toBeEnabled()
    await view.click()
  }
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}
function list(page: Page) {
  return page.getByRole('navigation', { name: '工序列表' })
}

test('导航与模型来源隔离，加载 Demo 不改写本地文件信息', async ({ page }, info) => {
  await page.goto('/')
  const fileInput = page.getByLabel('选择 STEP 模型文件')
  await fileInput.setInputFiles({
    name: 'OwnPart.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('TEST ONLY'),
  })
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByText('暂无可用工艺方案')).toBeVisible()
  await expect(page.getByRole('button', { name: '02 工艺决策' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await shot(page, info, 'planning-empty')
  await demo(page)
  await expect(page.getByRole('region', { name: '当前模型文件' })).toContainText('OwnPart.step')
  await expect(page.getByText(/预设 Mock 数据 · 未关联本地 STEP 文件/)).toBeVisible()
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '当前模型文件' })).toContainText('OwnPart.step')
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(list(page).getByRole('button')).toHaveCount(3)
  await fileInput.setInputFiles({
    name: 'Replacement.stp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('TEST ONLY'),
  })
  await expect(page.getByText('暂无可用工艺方案')).toBeVisible()
})

test('示例输入连贯完成进度、查看结果和必填信息门槛', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: '使用示例 Ring_A.step' }).click()
  const view = page.getByRole('button', { name: '查看工艺规划结果' })
  await expect(view).toBeDisabled()
  await expect(page.getByText('暂无可用工艺方案')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '演示参考输入' })).toContainText('Ring_A.step')
  await shot(page, info, 'demo-planning-progress')
  // 此用例让真实浏览器计时器走完演示进度；其他 Fixture 切换用快进缩短回归耗时。
  await expect(view).toBeEnabled({ timeout: 6500 })
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '100')
  await shot(page, info, 'demo-planning-ready')
  await view.click()
  await expect(list(page).getByRole('button')).toHaveCount(7)
  await expect(list(page)).not.toContainText('球面')
  const generate = page.getByRole('button', { name: '查看参考程序并进入审核', exact: true })
  await expect(generate).toBeDisabled()
  await shot(page, info, 'demo-ring-result')
  await page.getByRole('button', { name: '补充工序信息', exact: true }).click()
  for (const [name, value] of [
    ['现场毛坯外径', '43'],
    ['现场毛坯预孔直径', '38'],
    ['现场毛坯长度', '100'],
    ['工件零点 / 偏置核对', '演示 G54 核对记录'],
    ['装夹方式与伸出量', '演示装夹记录'],
  ])
    await page.getByLabel(name, { exact: true }).fill(value)
  await expect(generate).toBeDisabled()
  await shot(page, info, 'demo-ring-shared-fields')
  await page.getByRole('button', { name: '补充工序信息', exact: true }).click()
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('05 内孔精车')
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveCount(0)
  await page.getByLabel('内孔表面粗糙度要求 Ra', { exact: true }).fill('1.6')
  await expect(generate).toBeEnabled()
  await expect(list(page).getByRole('button', { name: /05 内孔精车/ })).not.toContainText('待填')
  await page.getByRole('button', { name: /^任务共用信息/ }).click()
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveValue('43')
  await page.getByLabel('现场毛坯外径', { exact: true }).fill('abc')
  await expect(generate).toBeDisabled()
  await page.getByLabel('现场毛坯外径', { exact: true }).fill('43')
  await expect(generate).toBeEnabled()
  await list(page)
    .getByRole('button', { name: /05 内孔精车/ })
    .click()
  await page.getByRole('button', { name: '补充信息', exact: true }).click()
  await page.getByLabel('内孔表面粗糙度要求 Ra', { exact: true }).scrollIntoViewIfNeeded()
  await shot(page, info, 'demo-ring-fields-complete')
  await generate.click()
  await expect(page.getByRole('region', { name: '程序审核', exact: true })).toBeVisible()
  await expect(
    page.getByText('当前展示的是 Golden-B7 历史参考程序，未执行本次 CAM 程序生成。'),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '参考程序正文暂不可用', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(generate).toBeEnabled()
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'Ring_A.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('local only'),
  })
  await expect(page.getByText('暂无可用工艺方案')).toBeVisible()
  await expect(generate).toBeDisabled()
})

test('工作台默认与工序切换，程序生成入口保持准确反馈', async ({ page }, info) => {
  await enter(page)
  await demo(page)
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('基准面加工')
  const bubble = page.getByRole('button', { name: '打开 Agent 协同' })
  await expect(bubble).toBeInViewport({ ratio: 1 })
  await shot(page, info, 'planning-default-agent-bubble')
  await list(page)
    .getByRole('button', { name: /轮廓与孔加工/ })
    .click()
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('3 个工步')
  await shot(page, info, 'planning-selected-operation')
  const generate = page.getByRole('button', { name: '查看参考程序并进入审核', exact: true })
  await expect(generate).toBeDisabled()
  await page.getByRole('button', { name: '补充工序信息', exact: true }).click()
  for (const name of [/基准面加工/, /轮廓与孔加工/]) {
    await list(page).getByRole('button', { name }).click()
    await page.getByLabel('毛坯实测高度').fill('42')
    await page.getByLabel('现场约束说明').fill('演示装夹')
  }
  await expect(generate).toBeEnabled()
  await page.getByRole('button', { name: '查看参考程序并进入审核', exact: true }).click()
  await expect(page.getByRole('region', { name: '程序审核', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '参考程序正文暂不可用', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('本次未执行 CAM 程序生成。', { exact: true })).toBeVisible()
})

test('长工序、详情与参数分别滚动，标题和主操作仍可见', async ({ page }, info) => {
  await enter(page)
  await demo(page, 'complex')
  await expect(list(page).getByRole('button')).toHaveCount(20)
  const listBox = await list(page).boundingBox()
  await page.mouse.move(listBox!.x + 50, listBox!.y + 100)
  await page.mouse.wheel(0, 1600)
  await expect.poll(() => list(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  await list(page).getByRole('button').last().click()
  const body = page.getByRole('region', { name: '工序详情正文' })
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: /200.*壳体区域 20/ })).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  const parameters = page.getByRole('region', { name: '推荐参数列表' })
  await parameters.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(await parameters.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(
    page.getByRole('button', { name: '查看参考程序并进入审核', exact: true }),
  ).toBeInViewport({ ratio: 1 })
  await shot(page, info, 'planning-long-list-parameters')
})

test('不完整与零工序方案保留空状态', async ({ page }, info) => {
  await enter(page)
  await demo(page, 'incomplete')
  await expect(page.getByText('暂无工步信息，等待上游方案补充。')).toBeVisible()
  await shot(page, info, 'planning-incomplete')
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await expect(page.getByText('暂无生产资源信息')).toBeVisible()
  await expect(page.getByText('—', { exact: true })).toBeVisible()
  await demo(page, 'empty')
  await expect(page.getByText('当前方案没有工序')).toBeVisible()
  await expect(page.getByText('暂无工序详情')).toBeVisible()
})

test('现场草稿隔离与输入反馈，页面切换不丢失草稿', async ({ page }, info) => {
  await enter(page)
  await demo(page)
  await page.getByRole('button', { name: '补充工序信息', exact: true }).click()
  const height = page.getByLabel('毛坯实测高度')
  await height.fill('not-a-number')
  await expect(height).toHaveAttribute('aria-invalid', 'true')
  await height.fill('42.5')
  await expect(page.getByText('本地演示草稿，未提交服务器，未完成制造校核。')).toBeVisible()
  await list(page)
    .getByRole('button', { name: /轮廓与孔加工/ })
    .click()
  await expect(height).toHaveValue('')
  await list(page)
    .getByRole('button', { name: /基准面加工/ })
    .click()
  await expect(height).toHaveValue('42.5')
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(height).toHaveValue('42.5')
  await shot(page, info, 'planning-onsite-draft')
})

test('Agent 抽屉上下文、历史、焦点、Escape 和任务隔离', async ({ page }, info) => {
  await enter(page)
  await demo(page)
  const bubble = page.getByRole('button', { name: '打开 Agent 协同' })
  await bubble.click()
  const dialog = page.getByRole('dialog', { name: 'Agent 协同' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.getByLabel('消息', { exact: true }).fill('请调整进给；这是一条测试消息。')
  await page.getByRole('button', { name: '发送演示消息' }).click()
  await expect(page.getByRole('log')).toContainText('尚未连接真实 Agent')
  await page.getByLabel('当前工序', { exact: true }).selectOption('bracket-profile')
  await expect(page.getByRole('log')).toContainText('10 基准面加工')
  await expect(page.getByLabel('当前工序', { exact: true })).toHaveValue('bracket-profile')
  await expect(page.getByRole('button', { name: '发送演示消息' })).toBeInViewport({ ratio: 1 })
  await shot(page, info, 'planning-agent-drawer')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(bubble).toBeFocused()
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('轮廓与孔加工')
  await bubble.click()
  await expect(page.getByRole('log')).toContainText('这是一条测试消息')
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await demo(page, 'complex')
  await bubble.click()
  await expect(page.getByRole('log')).not.toContainText('这是一条测试消息')
  await page.keyboard.press('Escape')
  await demo(page, 'simple')
  await bubble.click()
  await expect(page.getByRole('log')).toContainText('这是一条测试消息')
})

test('气泡拖动不误打开、位置持久化、窗口变化和键盘移动', async ({ page }) => {
  await enter(page)
  const bubble = page.getByRole('button', { name: '打开 Agent 协同' })
  const initial = (await bubble.boundingBox())!
  await page.mouse.move(initial.x + 40, initial.y + 20)
  await page.mouse.down()
  await page.mouse.move(initial.x - 200, initial.y - 120, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const moved = (await bubble.boundingBox())!
  expect(moved.x).toBeLessThan(initial.x - 100)
  await page.reload()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  const restored = (await bubble.boundingBox())!
  expect(restored.x).toBeCloseTo(moved.x, 0)
  expect(restored.y).toBeCloseTo(moved.y, 0)
  await page.setViewportSize({ width: 1000, height: 700 })
  await expect(bubble).toBeInViewport({ ratio: 1 })
  await bubble.focus()
  await page.keyboard.press('Home')
  const reset = (await bubble.boundingBox())!
  await page.keyboard.press('ArrowLeft')
  expect((await bubble.boundingBox())!.x).toBe(reset.x - 16)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('长对话独立滚动，关闭重开保留阅读位置与未发送输入', async ({ page }) => {
  await enter(page)
  await demo(page)
  const bubble = page.getByRole('button', { name: '打开 Agent 协同' })
  await bubble.click()
  for (let index = 0; index < 6; index++) {
    await page
      .getByLabel('消息', { exact: true })
      .fill(`第 ${index + 1} 条演示消息：${'仅用于对话滚动测试。'.repeat(12)}`)
    await page.getByRole('button', { name: '发送演示消息' }).click()
  }
  const log = page.getByRole('log')
  expect(await log.evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  await log.evaluate((element) => {
    element.scrollTop = 180
  })
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(180)
  await page.getByLabel('消息', { exact: true }).fill('尚未发送的草稿')
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await bubble.click()
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('尚未发送的草稿')
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(180)
  await expect(page.getByRole('button', { name: '发送演示消息' })).toBeInViewport({ ratio: 1 })
})
