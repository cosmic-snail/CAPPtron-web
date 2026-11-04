import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import type { CaseDocument, CaseIndex } from '../src/api/case-catalog/types'

const choice = (id = 'golden-b7', version = 'v2') => JSON.stringify(['case', id, version])
const readIndex = (): CaseIndex =>
  JSON.parse(readFileSync('public/case-catalog/index.json', 'utf8'))
const readDocument = (): CaseDocument =>
  JSON.parse(readFileSync('public/case-catalog/golden-b7/v2.json', 'utf8'))

async function enter(page: Page) {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('option', { name: 'Golden-B7 环件 · v2' })).toBeAttached()
}
async function load(page: Page, id = 'golden-b7', version = 'v2') {
  await page.getByLabel('演示方案').selectOption(choice(id, version))
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  // 等待网络及摘要校验完成后才推进演示计时器。
  await expect(page.getByRole('progressbar')).toBeVisible()
  await page.clock.fastForward(4100)
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('JSON 环件现场草稿与 Agent 保留，历史参考不能生成 NC', async ({ page }, info) => {
  const requested: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('case-catalog')) requested.push(request.url())
  })
  await enter(page)
  await load(page)
  expect(requested.some((url) => url.endsWith('/golden-b7/v2.json'))).toBe(true)
  const operations = page.getByRole('navigation', { name: '工序列表' })
  await expect(operations.getByRole('button')).toHaveCount(7)
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await expect(page.getByRole('region', { name: '推荐参数列表' })).toContainText('295')
  const historicalParameters = page.getByRole('region', { name: '推荐参数列表' })
  await expect(historicalParameters.getByText('历史记录 · 已提供，未校核')).toHaveCount(3)
  await expect(historicalParameters).not.toContainText('模板')
  await shot(page, info, 'catalog-golden-b7-parameters')
  await page.getByRole('button', { name: /^任务共用信息/ }).click()
  await page.getByLabel('现场毛坯外径', { exact: true }).fill('43')
  await shot(page, info, 'catalog-shared-information')
  await expect(page.getByRole('button', { name: '定位待填信息，5 项' })).toBeInViewport({
    ratio: 1,
  })
  await page.getByRole('button', { name: '定位待填信息，5 项' }).click()
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveValue('43')
  await operations.getByRole('button', { name: /05 内孔精车/ }).click()
  await page.getByRole('button', { name: '补充信息', exact: true }).click()
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('内孔表面粗糙度要求 Ra', { exact: true })).toBeVisible()
  await expect(page.getByLabel('内孔表面粗糙度要求 Ra', { exact: true })).toHaveValue('')
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('05 内孔精车')
  await expect(operations.getByRole('button', { name: /06 切断/ })).not.toContainText('待填')
  await expect(page.getByText(/加工要求补充：/)).toContainText(
    '加工要求补充：参考内径为 Ø39 mm，请依据图纸或技术要求填写目标 Ra。',
  )
  await shot(page, info, 'catalog-golden-b7-onsite')
  // 仅用于验证输入及版本隔离，不代表该零件的实际图纸要求。
  await page.getByLabel('内孔表面粗糙度要求 Ra', { exact: true }).fill('1.6')
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await page.getByLabel('消息', { exact: true }).fill('案例版本对应哪个历史程序？')
  await page.getByRole('button', { name: '发送演示消息' }).click()
  await expect(page.getByRole('log')).toContainText('尚未连接真实 Agent')
  await shot(page, info, 'catalog-agent')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '刷新案例列表' }).click()
  await expect(page.getByRole('button', { name: '刷新案例列表' })).toBeEnabled()
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  await page.getByRole('button', { name: /^任务共用信息/ }).click()
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveValue('43')
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await expect(page.getByRole('log')).toContainText('案例版本对应哪个历史程序')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: '查看参考程序并进入审核', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('option', { name: 'Golden-B7 环件 · v1' })).toHaveCount(0)
  await operations.getByRole('button', { name: /05 内孔精车/ }).click()
  await page.getByRole('button', { name: '补充信息', exact: true }).click()
  await expect(page.getByLabel('内孔表面粗糙度要求 Ra', { exact: true })).toHaveValue('1.6')
})

test('损坏 JSON 与索引失败可重试，不回退 Fixture', async ({ page }, info) => {
  await page.route('**/case-catalog/index.json', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await page.unroute('**/case-catalog/index.json')
  await page.getByRole('button', { name: '重试案例索引' }).click()
  await expect(page.getByRole('option', { name: 'Golden-B7 环件 · v2' })).toBeAttached()
  await page.route('**/case-catalog/golden-b7/v2.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{broken' }),
  )
  await page.getByLabel('演示方案').selectOption(choice())
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  await expect(page.getByRole('heading', { name: '参考案例加载失败' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工序列表' })).toHaveCount(0)
  await shot(page, info, 'catalog-error-retry')
  await page.unroute('**/case-catalog/golden-b7/v2.json')
  await page.getByRole('button', { name: '重试案例加载' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
})

test('加载中换有效模型，迟到结果不得串入新任务', async ({ page }) => {
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/case-catalog/golden-b7/v2.json', async (route) => {
    await gate
    await route.fulfill({ json: readDocument() })
  })
  await enter(page)
  await page.getByLabel('演示方案').selectOption(choice())
  const request = page.waitForRequest('**/case-catalog/golden-b7/v2.json')
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  await request
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'Own.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('TEST'),
  })
  const response = page.waitForResponse('**/case-catalog/golden-b7/v2.json')
  release!()
  await response
  await expect(page.getByText('暂无可用工艺方案')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '工序列表' })).toHaveCount(0)
})

test('更新索引发现新案例及新版本，选择版本不混用草稿', async ({ page }, info) => {
  await enter(page)
  await load(page)
  await page.getByRole('button', { name: /^任务共用信息/ }).click()
  await page.getByLabel('现场毛坯外径', { exact: true }).fill('43')
  const document = readDocument()
  document.case.id = 'catalog-test'
  document.case.name = '新增案例发现测试'
  document.case.description = '自动化测试副本，不作为已确认制造案例发布。'
  document.caseVersion = { caseId: 'catalog-test', version: 'v2' }
  document.processPlan.partName = '新增 JSON 参考数据测试'
  for (const item of [...document.programAssets, ...document.verificationEvidence]) {
    item.caseId = 'catalog-test'
    item.caseVersion = 'v2'
  }
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value !== null && typeof value === 'object')
      return `{${Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(',')}}`
    return JSON.stringify(value)
  }
  const payload = { ...document } as Partial<CaseDocument>
  delete payload.contentDigest
  document.contentDigest = createHash('sha256').update(canonical(payload)).digest('hex')
  const updatedIndex = readIndex()
  const { id, ...metadata } = document.case
  updatedIndex.cases.push({
    ...metadata,
    caseId: id,
    versions: [
      { version: 'v2', path: 'catalog-test/v2.json', contentDigest: document.contentDigest },
    ],
  })
  await page.route('**/case-catalog/index.json', (route) => route.fulfill({ json: updatedIndex }))
  await page.route('**/case-catalog/catalog-test/v2.json', (route) =>
    route.fulfill({ json: document }),
  )
  await page.getByRole('button', { name: '刷新案例列表' }).click()
  await expect(page.getByRole('option', { name: '新增案例发现测试 · v2' })).toBeAttached()
  await load(page, 'catalog-test', 'v2')
  await page.getByRole('button', { name: /^任务共用信息/ }).click()
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveValue('')
  await shot(page, info, 'catalog-dynamic-case')
  await page.getByLabel('演示方案').selectOption(choice())
  await page.getByRole('button', { name: '加载 Demo 方案' }).click()
  await expect(page.getByLabel('现场毛坯外径', { exact: true })).toHaveValue('43')
})
