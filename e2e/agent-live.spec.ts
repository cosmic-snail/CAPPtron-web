import { test, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { coreFixture, startPlanning, openPlan, approvePlan } from './coreFixture'

// 截图证据：Agent 回答为 Playwright 合成替身，不代表真实模型输出或制造结论。
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const directory = `docs/api/agent-live-evidence/${info.project.name}`
  mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true })
}

async function openAgent(page: Page) {
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  const dialog = page.getByRole('dialog', { name: 'Agent 协同' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('Core 未开启 Agent 时保持基线不可用抽屉且不可发送', async ({ page }, info) => {
  const core = await coreFixture(page)
  await startPlanning(page)
  await openPlan(page)
  const dialog = await openAgent(page)
  // Core 未开启 Agent 时，抽屉保持已确认基线的不可用说明。
  await expect(dialog.getByText('Agent 服务尚未接入，暂不能发送消息。')).toBeVisible()
  await expect(dialog.getByLabel('消息', { exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '发送消息' })).toBeDisabled()
  await expect(dialog).not.toContainText('Demo')
  await shot(page, info, 'agent-disabled')
  expect(core.agentMessages).toHaveLength(0)
})

test('工艺决策与程序审核页提问：只读回答、查询卡片与核对依据', async ({ page }, info) => {
  const core = await coreFixture(page, { agent: true })
  await startPlanning(page)
  await openPlan(page)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  const before = core.commands.length
  const dialog = await openAgent(page)
  await expect(dialog.getByText('只读 Agent · 回答依据 Core 记录')).toBeVisible()
  await dialog.getByLabel('消息', { exact: true }).fill('粗车步距现在是多少，从哪里来？')
  await dialog.getByRole('button', { name: '发送消息' }).click()
  const log = dialog.getByRole('log', { name: 'Agent 对话记录' })
  await expect(log.getByText(/外圆粗车当前 rough_step 为/)).toBeVisible()
  await expect(log.getByText('读取工序 ring-op-2')).toBeVisible()
  await expect(log.getByText('已读取 · ring-op-2 外圆粗车')).toBeVisible()
  await log.getByText('依据 1 条（另有 1 条未通过核对）').click()
  await expect(log).toContainText('planning_result r1 · /payload/operations/')
  await expect(dialog.getByLabel('消息', { exact: true })).toHaveValue('')
  await shot(page, info, 'agent-planning-answer')
  const planning = core.agentMessages.at(-1) as { context: Record<string, unknown> }
  expect(planning.context).toMatchObject({ page: 'planning', operation_id: 'ring-op-2' })
  expect(planning.context).not.toHaveProperty('nc_ref')
  // Agent 只读：提问不产生任何规划、工艺卡或 CAM 命令。
  expect(core.commands.length).toBe(before)

  await dialog.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  const review = await openAgent(page)
  await expect(review.getByText(/外圆粗车当前 rough_step 为/)).toBeVisible()
  await review.getByLabel('消息', { exact: true }).fill('这个 NC 版本是怎么来的？')
  await review.getByRole('button', { name: '发送消息' }).click()
  await expect(review.getByRole('log').getByText('这个 NC 版本是怎么来的？')).toBeVisible()
  await expect(review.locator('.agent-turn')).toHaveCount(2)
  await shot(page, info, 'agent-review-answer')
  const reviewMessage = core.agentMessages.at(-1) as { context: Record<string, unknown> }
  expect(reviewMessage.context).toMatchObject({ page: 'review' })
  expect(reviewMessage.context.nc_ref).toMatchObject({ version: expect.any(Number) })
})

for (const entry of ['drawer', 'sidebar'] as const) {
  test(`任务级上下文切换保持界面和发送内容一致：${entry}`, async ({ page }, info) => {
    const core = await coreFixture(page, { agent: true })
    await startPlanning(page)
    await openPlan(page)
    let dialog = await openAgent(page)
    const picker = () => dialog.getByLabel('当前工序', { exact: true })
    const send = async (operationId?: string) => {
      const count = core.agentMessages.length
      await dialog.getByLabel('消息', { exact: true }).fill(`上下文核对 ${count + 1}`)
      await dialog.getByRole('button', { name: '发送消息' }).click()
      await expect.poll(() => core.agentMessages.length).toBe(count + 1)
      await expect(dialog.getByLabel('消息', { exact: true })).toHaveValue('')
      const payload = core.agentMessages.at(-1) as { context: Record<string, unknown> }
      expect(payload.context).toMatchObject({ page: 'planning', revision: 1 })
      if (operationId) expect(payload.context.operation_id).toBe(operationId)
      else expect(payload.context).not.toHaveProperty('operation_id')
    }
    // 保留首次打开默认首工序的行为。
    await expect(picker()).toHaveValue('ring-op-1')
    await send('ring-op-1')
    for (const operationId of ['ring-op-2', 'ring-op-4', 'ring-op-2']) {
      await picker().selectOption(operationId)
      await expect(picker()).toHaveValue(operationId)
      await send(operationId)
      if (entry === 'drawer') {
        await picker().selectOption('')
      } else {
        await dialog.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
        await page.getByRole('button', { name: /任务共用信息/ }).click()
        dialog = await openAgent(page)
      }
      // 先检查请求以防 UI 的选项回退掩盖错误上下文。
      await send()
      await expect(picker()).toHaveValue('')
      await dialog.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
      await expect(page.getByRole('button', { name: /任务共用信息/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      dialog = await openAgent(page)
    }
    await shot(page, info, `agent-task-context-${entry}`)
  })
}
