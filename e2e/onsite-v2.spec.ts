import { expect, test } from '@playwright/test'
import { coreFixture, startPlanning, openPlan } from './coreFixture'
import contract from './fixtures/onsite-v2.json' with { type: 'json' }
import fixture from './fixtures/core-golden.json' with { type: 'json' }

test('第二版现场信息使用配置选项，并展示输入有效但执行不支持的原因', async ({ page }) => {
  await coreFixture(page)
  await page.route('**/planning/tasks/*/results/*', async (route) => {
    const plan = structuredClone(fixture.plan)
    const extensions = plan.payload.extensions as Record<string, unknown>
    extensions.onsite_contract = contract
    extensions.reference_only = true
    extensions.execution_ready = false
    extensions.onsite_record_attestation = {
      input_status: 'valid',
      planning_status: 'constraints_recorded',
      execution_status: 'blocked',
      issues: [],
      execution_blockers: [
        {
          key: [contract.task_id, 'task', 'stock-od'],
          code: 'cam_stock_update_unsupported',
          message: '毛坯尺寸有效，当前执行模板尚不支持应用该毛坯',
        },
      ],
    }
    plan.revision = 1
    plan.run_id = 'planning-1'
    await route.fulfill({ json: plan })
  })
  await startPlanning(page)
  await openPlan(page)
  await page.getByRole('button', { name: /任务共用信息/ }).click()
  await expect(page.getByRole('combobox', { name: '装夹配置' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '工件零点与偏置' })).toBeVisible()
  await page.getByLabel('查看任务状态详情').click()
  await expect(page.getByText(/现场输入有效，已纳入本版约束记录/)).toBeVisible()
  await page.getByLabel('查看任务状态详情').click()
  await expect(page.getByLabel('夹持长度', { exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: '装夹配置' }).selectOption('change')
  await expect(page.getByLabel('夹持长度', { exact: true })).toBeVisible()
  await expect(page.getByLabel('夹持长度', { exact: true })).toHaveAttribute(
    'aria-required',
    'true',
  )
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
})

test('提交现场约束携带服务端配置摘要，不发送固定中文或旧版协议', async ({ page }) => {
  await coreFixture(page)
  await page.route('**/planning/tasks/*/results/*', async (route) => {
    const revision = Number(new URL(route.request().url()).pathname.split('/').pop())
    const plan = structuredClone(fixture.plan)
    ;(plan.payload.extensions as Record<string, unknown>).onsite_contract = contract
    plan.revision = revision
    plan.run_id = `planning-${revision}`
    await route.fulfill({ json: plan })
  })
  await startPlanning(page)
  await openPlan(page)
  await page.getByRole('button', { name: /任务共用信息/ }).click()
  await page.getByLabel('毛坯外径', { exact: true }).fill('43')
  await page.getByLabel('毛坯预孔直径', { exact: true }).fill('0')
  await page.getByLabel('毛坯长度', { exact: true }).fill('8')
  await page.getByLabel('工件零点与偏置', { exact: true }).selectOption('inherit')
  await page.getByLabel('装夹配置', { exact: true }).selectOption('inherit')
  const requirement = contract.fields.find((f) => f.unit === 'μm')!
  const operation = fixture.plan.payload.operations.find((op) => op.id === requirement.key[0])!
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: operation.name })
    .click()
  await page.getByRole('button', { name: '补充信息', exact: true }).click()
  await page.getByLabel(requirement.name, { exact: true }).fill('1.6')
  await page.getByLabel('粗糙度要求来源', { exact: true }).selectOption('drawing')
  const submission = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/feedback'),
  )
  await page.getByRole('button', { name: '提交修改并重新规划', exact: true }).click()
  const body = (await submission).postDataJSON()
  expect(body.supplement_schema_version).toBe('onsite-record-v2')
  expect((body.supplement as { contract_digest: string }).contract_digest).toBe(contract.digest)
  expect(JSON.stringify(body.supplement)).not.toContain('演示测试，沿用模板')
})
