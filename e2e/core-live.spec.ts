import { test, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { coreFixture, startPlanning, openPlan, approvePlan } from './coreFixture'

async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const directory = `docs/api/fe-contract-002-evidence/${info.project.name}`
  mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true })
}

test('短于四秒及时解锁；原面板、修订门禁、多文件审核及服务器下载', async ({ page }, info) => {
  const core = await coreFixture(page)
  await startPlanning(page)
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeEnabled({
    timeout: 3000,
  })
  await openPlan(page)
  await shot(page, info, 'live-steps')
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await approvePlan(page)
  await page.getByLabel('粗车参数 rough_step').fill('0.4')
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  await page.getByRole('button', { name: '数据底座', exact: true }).click()
  await page.getByRole('button', { name: '返回智能工艺工作台' }).click()
  await expect(page.getByLabel('粗车参数 rough_step')).toHaveValue('0.4')
  await shot(page, info, 'live-parameters')
  await page.getByRole('button', { name: '提交修改并重新规划' }).click()
  await openPlan(page)
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  await page.getByLabel('NC 文件').selectOption('file-2')
  await expect(page.locator('.cm-content')).toContainText('EVIDENCE 2')
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true')
  await shot(page, info, 'live-nc')
  await page.getByRole('button', { name: '程序可用', exact: true }).click()
  await page.getByRole('button', { name: '确认可用' }).click()
  await expect(page.locator('.program-toolbar')).toContainText('程序可用 · 人工确认')
  await expect(page.getByRole('button', { name: '下载已确认版本' })).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载已确认版本' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.zip$/)
  expect(core.commands.filter((c) => c.path === '/cam/runs')).toHaveLength(1)
})

test('长于四秒继续真实等待；不确定进度；完成交付后停止查询', async ({ page }, info) => {
  const core = await coreFixture(page, { planDelay: 5500 })
  await startPlanning(page)
  const progress = page.getByRole('progressbar', { name: 'Core 规划中' })
  await expect(progress).not.toHaveAttribute('value')
  await shot(page, info, 'live-progress')
  await page.waitForTimeout(4200)
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeEnabled({
    timeout: 5000,
  })
  await expect(progress).toHaveAttribute('value', '100')
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await shot(page, info, 'live-progress-complete')
  const queries = core.counts().runGets
  await page.waitForTimeout(1000)
  expect(core.counts().runGets).toBe(queries)
})

test('completed 但交付 pending 不解锁', async ({ page }) => {
  const core = await coreFixture(page, { deliveryPending: true })
  await startPlanning(page)
  await page.waitForTimeout(4400)
  await expect(page.getByText('结果校验或交付中', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
  core.options.deliveryPending = false
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeEnabled()
})

test('规划失败不解锁且终止轮询', async ({ page }, info) => {
  const core = await coreFixture(page, { failed: true })
  await startPlanning(page)
  await expect(page.getByRole('heading', { name: '规划失败' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
  await shot(page, info, 'live-needs-replan-readable')
  const count = core.counts().runGets
  await page.waitForTimeout(1000)
  expect(core.counts().runGets).toBe(count)
})

test('CAM阶段与等待确认使用后端状态，不自动重发执行', async ({ page }, info) => {
  const core = await coreFixture(page, { camStages: true, camWait: true })
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByRole('heading', { name: 'CAM · running / build' })).toBeVisible()
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('value')
  await expect(page.getByRole('heading', { name: 'CAM · running / execute' })).toBeVisible()
  await expect(page.getByText(/等待人工确认 · 自动查询已停止/)).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('3000 · 执行器状态待核实')
  await shot(page, info, 'live-cam-confirmation')
  const count = core.counts().camGets
  await page.waitForTimeout(1000)
  expect(core.counts().camGets).toBe(count)
  expect(core.counts().observe).toBeGreaterThan(0)
  await page.getByRole('button', { name: '继续查询 CAM / NC' }).click()
  expect(core.commands.filter((c) => c.path === '/cam/runs')).toHaveLength(1)
})

test('真实NC读取失败禁止审核；重试只读取原运行', async ({ page }) => {
  const core = await coreFixture(page, { ncFailure: true })
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByRole('alert')).toContainText('3000')
  await expect(page.getByRole('button', { name: '程序可用', exact: true })).toHaveCount(0)
  core.options.ncFailure = false
  await page.getByRole('button', { name: '重试 / 继续查询' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  expect(core.commands.filter((c) => c.path === '/cam/runs')).toHaveLength(1)
})

test('丢失规划和CAM回执沿用原命令，保留精确body', async ({ page }) => {
  const core = await coreFixture(page, { lostReplanReceipt: true, lostCamReceipt: true })
  await startPlanning(page)
  await page.getByRole('button', { name: '重试 / 继续查询' }).click()
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await page.getByRole('button', { name: '重试 / 继续查询' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  const replan = core.commands.filter((c) => c.path.endsWith('/replan'))
  const start = core.commands.filter((c) => c.path === '/cam/runs')
  expect(replan).toHaveLength(2)
  expect(replan[0]).toEqual(replan[1])
  expect(start).toHaveLength(2)
  expect(start[0]).toEqual(start[1])
})

test('无离线 descriptor 仍由 Core 选模并完成任务', async ({ page }) => {
  // S10/S12：前端不再读取前端集成配置；模板身份来自 Core 结果。
  const core = await coreFixture(page, {})
  await startPlanning(page)
  await openPlan(page)
  // commands 只记录 POST。
  const tasks = core.commands.filter((c) => c.path === '/planning/tasks')
  expect(tasks).toHaveLength(1)
  const body = tasks[0]!.body as { schema_version?: string; payload?: Record<string, unknown> }
  expect(body.schema_version).toBe('template-request-v2')
  expect(body.payload).not.toHaveProperty('template')
  expect(core.commands.every((c) => c.path !== '/frontend-integration.v1.json')).toBe(true)
})

test('仅支持 v1 的旧 Core 明确阻断，不降级重建任务', async ({ page }) => {
  // S14：新 Web 对不支持 template-request-v2 的 Core 显示阻断信息。
  const core = await coreFixture(page, { v1Only: true })
  await startPlanning(page)
  await expect(page.getByRole('alert')).toContainText('template-request-v2')
  expect(core.commands.filter((c) => c.path === '/planning/tasks')).toHaveLength(1)
})

test('reference_only 缺匹配证据仍可读工序，批准和执行均阻断', async ({ page }) => {
  await coreFixture(page, { referenceOnly: true })
  await startPlanning(page)
  await openPlan(page)
  await page.getByLabel('审核人 ID', { exact: true }).fill('test-reviewer')
  await page.getByLabel('查看任务状态详情').click()
  await expect(page.getByText(/方案仅供参考/)).toBeVisible()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
})

test('丢失规划回执后实际刷新，原请求恢复不创建第二任务', async ({ page }) => {
  const core = await coreFixture(page, { lostReplanReceipt: true })
  await startPlanning(page)
  await expect(page.getByRole('button', { name: '重试 / 继续查询' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByRole('button', { name: '重试 / 继续查询' }).click()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await openPlan(page)
  const commands = core.commands.filter((c) => c.path.endsWith('/replan'))
  expect(commands).toHaveLength(2)
  expect(commands[0]).toEqual(commands[1])
  expect(core.commands.filter((c) => c.path === '/planning/tasks')).toHaveLength(1)
})

test('旧修订已有 CAM 后提交新修订并刷新，不沿用旧 NC 或阻塞新批准', async ({ page }) => {
  const core = await coreFixture(page)
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  await page.getByRole('button', { name: '返回工艺决策', exact: true }).click()
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await page.getByLabel('粗车参数 rough_step').fill('0.4')
  await page.getByRole('button', { name: '提交修改并重新规划' }).click()
  await openPlan(page)
  await page.reload()
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await openPlan(page)
  await expect(page.getByText(/revision 2/).first()).toBeVisible()
  await approvePlan(page)
  expect(core.commands.filter((command) => command.path === '/cam/runs')).toHaveLength(1)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByLabel('NC 文件')).toHaveCount(0)
})

test('解析后进入02；补充字段可填、待填定位、提交回读', async ({ page }, info) => {
  const core = await coreFixture(page, { planDelay: 700, lostSupplementReceipt: true })
  await startPlanning(page)
  await expect(page.getByRole('region', { name: '输入处理进度' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '工艺规划真实进度' })).toBeVisible()
  await openPlan(page)
  await expect(page.getByText('待补充 6 项', { exact: true })).toBeVisible()
  await page.getByLabel('查看任务状态详情').click()
  await expect(
    page.getByText('修改加工参数或现场信息后，提交修改并重新规划。', { exact: false }),
  ).toBeVisible()
  await page.getByLabel('查看任务状态详情').click()
  await expect(page.getByRole('button', { name: '提交修改并重新规划', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '任务共用信息 待填 5' }).click()
  await expect(page.getByRole('region', { name: '任务共用信息详情' })).toBeVisible()
  for (const [name, value] of [
    ['现场毛坯外径', '43'],
    ['现场毛坯预孔直径', '38'],
    ['现场毛坯长度', '100'],
    ['工件零点 / 偏置核对', 'G54 待工程核对'],
    ['装夹方式与夹具核对', '三爪卡盘 待工程核对'],
  ]) {
    await page.getByRole('textbox', { name, exact: true }).fill(value)
  }
  await expect(page.getByRole('button', { name: '任务共用信息 已补齐' })).toBeVisible()
  await page.getByRole('button', { name: '定位待填信息，1 项' }).click()
  await page.getByRole('textbox', { name: '内孔表面粗糙度要求 Ra', exact: true }).fill('1.6')
  await page.getByRole('button', { name: '提交修改并重新规划', exact: true }).click()
  await page.getByRole('button', { name: '重试 / 继续查询', exact: true }).click()
  await openPlan(page)
  await expect(page.getByText('现场信息已回读 · 未应用到 CAM', { exact: true })).toBeVisible()
  const actions = await page.locator('.live-planning-actions').boundingBox()
  expect(actions!.height).toBeLessThanOrEqual(56)
  await expect(page.getByRole('button', { name: '提交修改并重新规划', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '提交修改并重新规划' })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await openPlan(page)
  await page.getByRole('button', { name: '任务共用信息 已补齐' }).click()
  await expect(page.getByRole('textbox', { name: '现场毛坯外径', exact: true })).toHaveValue('43')
  await shot(page, info, 'live-task-information')
  await expect(page.getByText('revision 2', { exact: false }).first()).toBeVisible()
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await expect(page.getByRole('region', { name: '任务共用信息详情' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '工步详情', exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('navigation', { name: '工序列表' })
      .getByRole('button')
      .filter({ hasText: '外圆粗车' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(core.commands.filter((c) => c.path === '/planning/tasks')).toHaveLength(1)
})

test('点击解析立即进入02，解析尚未返回也显示原进度条', async ({ page }, info) => {
  const core = await coreFixture(page, { parseDelay: 2500 })
  await startPlanning(page)
  await expect(page.getByRole('heading', { name: '正在执行 NX 解析，请稍候' })).toBeVisible()
  await expect(page.getByRole('button', { name: '02 工艺决策' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('progressbar', { name: 'Core 规划中' })).not.toHaveAttribute('value')
  expect(core.commands.filter((c) => c.path === '/planning/tasks')).toHaveLength(0)
  await shot(page, info, 'live-parsing-in-planning')
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeEnabled()
  expect(core.commands.filter((c) => c.path === '/planning/tasks')).toHaveLength(1)
})

test('已交付但needs_replan的工艺可查看，不能批准或执行且不重复查询', async ({ page }, info) => {
  const core = await coreFixture(page, { needsReplan: true })
  await startPlanning(page)
  await expect(
    page.getByText(
      '本版工艺已生成，可查看；补充信息尚未满足规划与校验要求，当前不能批准或执行 CAM。',
    ),
  ).toBeVisible()
  await openPlan(page)
  await expect(page.getByRole('navigation', { name: '工序列表' })).toBeVisible()
  await page.getByRole('textbox', { name: '审核人 ID', exact: true }).fill('test-reviewer')
  await expect(page.getByRole('button', { name: '批准当前工艺卡', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '运行 Mastercam', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '重试 / 继续查询' })).toHaveCount(0)
  await shot(page, info, 'live-needs-replan-readable')
  const count = core.counts().runGets
  await page.waitForTimeout(1000)
  expect(core.counts().runGets).toBe(count)
})
