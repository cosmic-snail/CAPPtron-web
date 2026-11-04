import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Page, TestInfo } from '@playwright/test'

async function screenshot(page: Page, info: TestInfo, name: string) {
  const directory = `docs/api/simulation-evidence/${info.project.name}`
  mkdirSync(directory, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true })
}
async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '模拟完整流程' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
}
test('本地 JSON 复用完整页面：审核人、参数修订、CAM、NC、下载与刷新恢复', async ({
  page,
}, info) => {
  const network: string[] = []
  page.on('request', (request) => {
    if (/\/(cad|planning|process-cards|cam)\//.test(new URL(request.url()).pathname))
      network.push(request.url())
  })
  await start(page)
  await expect(page.getByRole('navigation', { name: '工序列表' }).getByRole('button')).toHaveCount(
    8,
  )
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
  await expect(
    page.getByRole('navigation', { name: '工序列表' }).getByRole('button').first(),
  ).toHaveText('任务共用信息待填 5')
  await page.getByRole('button', { name: '定位待填信息，6 项' }).click()
  await expect(page.getByRole('region', { name: '任务共用信息详情' })).toBeVisible()
  await expect(page.getByRole('button', { name: '任务共用信息 待填 5' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await screenshot(page, info, 'task-information-sidebar')
  await page.getByLabel('审核人 ID', { exact: true }).fill('reviewer-01')
  await screenshot(page, info, 'planning-reviewer')
  const list = await page.locator('.operation-list').boundingBox()
  expect(list!.height).toBeGreaterThanOrEqual(info.project.name.includes('1440') ? 270 : 450)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  const parameterRow = page
    .locator('.parameter-field')
    .filter({ has: page.getByLabel('粗车参数 rough_step') })
  await expect(parameterRow.locator('.input-badge')).toHaveCount(0)
  const operationBadge = page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .locator('.input-badge')
  await expect(operationBadge).toHaveText('待核对 1')
  await screenshot(page, info, 'parameter-input-status')
  await page.getByLabel('粗车参数 rough_step').fill('')
  await expect(operationBadge).toHaveText('待填 1')
  await screenshot(page, info, 'parameter-input-empty')
  await expect(page.getByRole('button', { name: '定位待填信息，7 项' })).toBeVisible()
  await page.getByLabel('粗车参数 rough_step').fill('0.7')
  await expect(operationBadge).toHaveText('待填 1')
  await page.getByLabel('粗车参数 rough_step').fill('0.4')
  await expect(operationBadge).toHaveText('待提交 1')
  await page.getByRole('button', { name: '提交修改并重新规划' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByRole('button', { name: '批准当前工艺卡' }).click()
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  await page.getByLabel('NC 文件').selectOption('file-2')
  await expect(page.locator('.cm-content')).toContainText('EVIDENCE 2')
  await expect(page.locator('.program-review-page .review-source')).toHaveCount(0)
  await expect(page.locator('.program-review-page .review-heading')).toHaveCount(0)
  await expect(
    page.locator('.program-toolbar').getByRole('button', { name: '返回工艺决策' }),
  ).toBeVisible()
  await screenshot(page, info, 'nc-reviewer')
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await expect(page.getByText('当前草稿与原始程序一致。')).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑本地草稿' })).toHaveCount(0)
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('\n(LOCAL DRAFT ONLY)')
  await expect(page.getByRole('button', { name: '程序可用', exact: true })).toBeDisabled()
  await expect(page.locator('.diff-added')).toContainText('LOCAL DRAFT ONLY')
  await page.getByRole('button', { name: '撤销修改', exact: true }).click()
  await expect(page.locator('.cm-content')).not.toContainText('LOCAL DRAFT ONLY')
  await page.getByRole('button', { name: '恢复已撤销', exact: true }).click()
  await page.getByText('草稿操作', { exact: true }).click()
  await page.getByRole('button', { name: '保存本地草稿' }).click()
  await page.getByText('草稿操作', { exact: true }).click()
  await page.getByText(/本地修订记录 · r/).click()
  await expect(page.locator('.nc-draft-history')).toContainText('保存暂存点')
  await page.getByText('草稿操作', { exact: true }).click()
  await screenshot(page, info, 'nc-diff-restored')
  await page.getByLabel('NC 文件').selectOption('file-1')
  await expect(page.getByRole('button', { name: '程序可用', exact: true })).toBeDisabled()
  await page.getByLabel('NC 文件').selectOption('file-2')
  await expect(page.locator('.cm-content')).toContainText('LOCAL DRAFT ONLY')
  await page.getByText('草稿操作', { exact: true }).click()
  await page.getByRole('button', { name: '恢复原文', exact: true }).click()
  await page.getByText('草稿操作', { exact: true }).click()
  await page.getByRole('button', { name: '恢复暂存', exact: true }).click()
  await expect(page.locator('.cm-content')).toContainText('LOCAL DRAFT ONLY')
  const localDownload = page.waitForEvent('download')
  await page.getByText('草稿操作', { exact: true }).click()
  await page.getByRole('button', { name: '导出本地草稿' }).click()
  expect((await localDownload).suggestedFilename()).toContain('unapproved-draft.txt')
  await page.getByText('草稿操作', { exact: true }).click()
  await page.getByRole('button', { name: '恢复原文', exact: true }).click()
  await page.getByRole('button', { name: '展开代码', exact: true }).click()
  await page.getByRole('button', { name: 'Agent 协同', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Agent 协同' })).toBeVisible()
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '展开代码', exact: true })).toBeFocused()

  await page.getByRole('button', { name: '程序可用', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '确认程序可用', exact: true })
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText('全部 2 个文件')
  const bounds = await confirmation.boundingBox()
  const viewport = page.viewportSize()!
  expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThan(2)
  expect(bounds!.width).toBeLessThanOrEqual(440)
  expect(await confirmation.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgb(25, 33, 35)',
  )
  await screenshot(page, info, 'nc-available-confirm')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '程序可用', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '展开代码', exact: true }).click()
  await page.getByRole('button', { name: '程序可用', exact: true }).click()
  await screenshot(page, info, 'nc-available-confirm-expanded')
  await page.keyboard.press('Escape')
  await expect(confirmation).not.toBeVisible()
  await expect(page.getByRole('button', { name: '退出专注编辑', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '程序可用', exact: true }).click()
  await page.getByRole('button', { name: '确认可用' }).click()
  await expect(page.locator('.program-toolbar')).toContainText('程序可用 · 模拟确认')

  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载已确认版本' }).click()
  expect((await downloaded).suggestedFilename()).toBe('SIMULATION-ONLY.zip')
  const before = await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))
  expect(before).toContain('reviewer-01')
  await page.reload()
  await page.getByRole('button', { name: /程序审核/ }).click()
  await expect(page.getByLabel('审核人 ID', { exact: true })).toHaveValue('reviewer-01')
  await expect(page.getByRole('button', { name: '下载已确认版本' })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))).toBe(before)
  expect(network).toEqual([])
})

test('模拟 CAM 失败不开放 NC 审核，真实模式不读取模拟任务和审核人', async ({ page }, info) => {
  await page.goto('/?mode=simulation')
  await page.getByLabel('模拟场景').selectOption('cam-failure')
  await page.getByRole('button', { name: '使用示例 Golden-simulation.step' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByLabel('审核人 ID', { exact: true }).fill('reviewer-03')
  await page.getByRole('button', { name: '批准当前工艺卡' }).click()
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟 CAM 执行失败')
  await expect(page.getByRole('button', { name: '程序可用', exact: true })).toHaveCount(0)
  await screenshot(page, info, 'cam-error')
  const saved = await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await expect(page.getByText('真实 Core API', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByText('尚未创建', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))).toBe(saved)
})

test('共用信息、现场信息提交回读、准入门禁和重新规划', async ({ page }, info) => {
  await page.goto('/?mode=simulation')
  await page.getByLabel('模拟场景').selectOption('normal')
  await page.getByRole('button', { name: '使用示例 Golden-simulation.step' }).click()
  await screenshot(page, info, 'input')
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByLabel('审核人 ID', { exact: true }).fill('reviewer-02')
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeEnabled()
  await page.getByRole('button', { name: '任务共用信息 待填 5' }).click()
  for (const [name, value] of [
    ['现场毛坯外径', '43'],
    ['现场毛坯预孔直径', '38'],
    ['现场毛坯长度', '100'],
    ['工件零点 / 偏置核对', 'G54 待工程核对'],
    ['装夹方式与夹具核对', '三爪卡盘 待工程核对'],
  ])
    await page.getByRole('textbox', { name, exact: true }).fill(value)
  await screenshot(page, info, 'task-information')
  await page.getByRole('button', { name: '定位待填信息，1 项' }).click()
  await page.getByRole('textbox', { name: '内孔表面粗糙度要求 Ra', exact: true }).fill('1.6')

  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await page.getByLabel('粗车参数 rough_step').fill('0.35')
  await expect(page.getByLabel('粗车参数 rough_step')).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: '提交修改并重新规划' }).click()
  expect(
    await page.evaluate(() =>
      Object.values(JSON.parse(localStorage.getItem('capptron.simulation.v1')!).tasks).map(
        (t) => (t as { feedback: unknown[] }).feedback.length,
      ),
    ),
  ).toEqual([0])
  await page.getByLabel('粗车参数 rough_step').fill('0.4')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.parameter-source-details p')).not.toBeVisible()
  await screenshot(page, info, 'parameters-unified')
  await page.getByRole('button', { name: '提交修改并重新规划', exact: true }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeEnabled()
  await page.reload()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByRole('button', { name: '任务共用信息 已补齐' }).click()
  await expect(page.getByRole('textbox', { name: '现场毛坯外径', exact: true })).toHaveValue('43')
  const actions = await page.locator('.live-planning-actions').boundingBox()
  expect(actions!.height).toBeLessThanOrEqual(56)
  await screenshot(page, info, 'restored-information')
})

test('模拟错误可见、解析可重试、任务 ID 可查询且未知 ID 不伪造', async ({ page }, info) => {
  await page.goto('/?mode=simulation')
  await page.getByLabel('模拟场景').selectOption('parse-failure')
  await page.getByRole('button', { name: '使用示例 Golden-simulation.step' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟 NX 解析失败')
  await screenshot(page, info, 'parse-error')
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByLabel('模拟场景').selectOption('normal')
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  const id = await page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem('capptron.simulation.v1')!).tasks)[0]!,
  )
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByText('恢复已有输入 / 任务', { exact: true }).click()
  await page.getByLabel('恢复任务 ID').fill('sim-task-does-not-exist')
  await page.getByRole('button', { name: '查询已有任务与 CAM' }).click()
  await expect(page.getByRole('alert')).toContainText('任务不可恢复')
  await page.getByLabel('恢复任务 ID').fill(id)
  await page.getByRole('button', { name: '查询已有任务与 CAM' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await expect(page.getByRole('navigation', { name: '工序列表' }).getByRole('button')).toHaveCount(
    8,
  )
})
