import { expect, test as base } from '@playwright/test'
import type { Locator, Page, TestInfo } from '@playwright/test'

const test = base.extend<{ browserChecks: void }>({
  browserChecks: [
    async ({ page }, use) => {
      const errors: string[] = []
      const mutations: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => {
        if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url())
      })
      // 不依赖后端或外部网络；文件选择也不应产生上传请求。
      await page.route('**/*', (route) => {
        return new URL(route.request().url()).origin === 'http://127.0.0.1:5183'
          ? route.continue()
          : route.abort()
      })
      await use()
      expect(errors, '浏览器未捕获异常').toEqual([])
      expect(mutations, '模型输入不得向服务器上传或提交业务数据').toEqual([])
    },
    { auto: true },
  ],
})

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

async function expectAccessibleControl(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 })
  // 实际命中测试发现遮挡，不固定任何布局坐标或像素相似度阈值。
  expect(
    await control.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return hit !== null && element.contains(hit)
    }),
  ).toBe(true)
}

function file(name: string, content = 'ISO-10303-21; TEST FIXTURE ONLY; END-ISO-10303-21;') {
  return { name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) }
}

async function chooseWithButton(page: Page, button: Locator, name: string) {
  const chooserEvent = page.waitForEvent('filechooser')
  await button.click()
  const chooser = await chooserEvent
  await chooser.setFiles(file(name))
}

test('模型输入初始页面与共享 Shell 可见且无溢出', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'CNC Agentic Programming', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: '模型输入', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '输入准备' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('region', { name: '当前模型文件' })).toContainText('尚未选择模型文件')
  await expect(page.getByRole('button', { name: '01 模型输入' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  for (const name of ['02 工艺决策', '03 程序审核']) {
    await expect(page.getByRole('button', { name })).not.toHaveAttribute('aria-current')
    await expect(page.getByRole('button', { name })).not.toHaveAttribute('data-unavailable')
  }
  for (const name of [
    '01 模型输入',
    '02 工艺决策',
    '03 程序审核',
    '数据底座',
    '更换文件',
    '查看解读结果',
    '选择模型文件',
    '使用示例 Ring_A.step',
  ]) {
    await expectAccessibleControl(page.getByRole('button', { name, exact: true }))
  }
  await expect(page.getByRole('contentinfo')).toBeInViewport({ ratio: 1 })
  await expectNoOverflow(page)
  await screenshot(page, testInfo, 'model-input-empty')
})

test('真实文件选择器支持本地选择、更换和取消，长文件名不挤出操作', async ({ page }, testInfo) => {
  await page.goto('/')
  const bar = page.getByRole('region', { name: '当前模型文件' })
  const preparation = page.getByRole('region', { name: '输入准备' })
  await chooseWithButton(
    page,
    page.getByRole('button', { name: '选择模型文件', exact: true }),
    'Bracket_A.STEP',
  )
  await expect(bar).toContainText('Bracket_A.STEP')
  await expect(bar).toContainText(`${file('Bracket_A.STEP').buffer.length} B · 本地选择`)
  await expect(preparation).toContainText('本地已选择，尚未上传或解析')
  const longName = `${'客户自定义模型名称_'.repeat(12)}Revision_B.StP`
  await chooseWithButton(page, page.getByRole('button', { name: '更换文件' }), longName)
  await expect(bar).toContainText(longName)
  await expect(bar).not.toContainText('Bracket_A.STEP')
  await page.getByLabel('选择 STEP 模型文件').setInputFiles([])
  await expect(bar).toContainText(longName)
  await expectAccessibleControl(page.getByRole('button', { name: '更换文件' }))
  await expectAccessibleControl(page.getByRole('button', { name: '使用示例 Ring_A.step' }))
  await expectNoOverflow(page)
  await screenshot(page, testInfo, 'model-input-local')
})

test('无效格式保留有效文件，再次选择同名文件可以恢复', async ({ page }) => {
  await page.goto('/')
  const input = page.getByLabel('选择 STEP 模型文件')
  const bar = page.getByRole('region', { name: '当前模型文件' })
  await input.setInputFiles(file('Valid.step'))
  await input.setInputFiles(file('drawing.pdf'))
  await expect(page.getByRole('alert')).toContainText('文件格式不支持')
  await expect(bar).toContainText('Valid.step')
  await input.setInputFiles(file('Valid.step', 'changed'))
  await expect(bar).toContainText('7 B · 本地选择')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('使用示例直接进入工艺决策，返回后保留元数据并区分同名本地文件', async ({ page }, testInfo) => {
  await page.goto('/')
  const bar = page.getByRole('region', { name: '当前模型文件' })
  const preparation = page.getByRole('region', { name: '输入准备' })
  await page.getByLabel('选择 STEP 模型文件').setInputFiles(file('Ring_A.step'))
  await page.getByRole('button', { name: '使用示例 Ring_A.step' }).click()
  await expect(bar).toContainText('Demo · 示例元数据')
  await expect(bar).not.toContainText('本地选择')
  await expect(page.getByRole('region', { name: '工艺决策', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '02 工艺决策' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('progressbar', { name: 'Demo 规划进度' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看工艺规划结果' })).toBeDisabled()
  await screenshot(page, testInfo, 'model-input-demo-planning')
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(preparation).toContainText('使用演示输入')
  await expect(preparation).toContainText('待提供')
  await expect(preparation).toContainText('待接入')
  await expect(page.getByRole('button', { name: '01 模型输入' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expectNoOverflow(page)
  await screenshot(page, testInfo, 'model-input-demo')
  await page.getByLabel('选择 STEP 模型文件').setInputFiles(file('Ring_A.step'))
  await expect(bar).not.toContainText('Demo')
  await expect(preparation).toContainText('本地已选择，尚未上传或解析')
})

test('未实现入口提供可关闭说明，鼠标和键盘操作均不推进业务阶段', async ({ page }) => {
  await page.goto('/')
  for (const [name, message] of [['查看解读结果', '设计文件解读尚未接入']]) {
    await page.getByRole('button', { name }).click()
    await expect(page.getByRole('status')).toContainText(message)
    await page.getByRole('button', { name: '关闭功能提示' }).click()
    await expect(page.getByRole('status')).toHaveCount(0)
    await page.getByRole('button', { name }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toContainText(message)
    await page.getByRole('button', { name: '关闭功能提示' }).click()
  }
  await expect(page.getByRole('button', { name: '01 模型输入' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByRole('region', { name: '模型输入', exact: true })).toBeVisible()
})

test('拖入文件使用相同格式校验并保留有效输入', async ({ page }) => {
  await page.goto('/')
  const zone = page.getByRole('group', { name: '模型文件选择区' })
  for (const name of ['Drag.STP', 'bad.pdf']) {
    const dataTransfer = await page.evaluateHandle((name) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['test-only file'], name, { type: 'application/octet-stream' }))
      return transfer
    }, name)
    await zone.dispatchEvent('dragover', { dataTransfer })
    await zone.dispatchEvent('drop', { dataTransfer })
    await dataTransfer.dispose()
  }
  await expect(page.getByRole('region', { name: '当前模型文件' })).toContainText('Drag.STP')
  await expect(page.getByRole('alert')).toContainText('文件格式不支持')
  await expectNoOverflow(page)
})
