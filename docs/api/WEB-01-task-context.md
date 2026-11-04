# WEB-01：Agent 抽屉任务级上下文修复

日期：2026-10-30。基线：Web `78b26a1`（PR #42 分支内容；上游 main 为 `0a1a305`）。

## 问题与修复

真实模式下，抽屉“任务级 · 共用信息”选项传入空字符串。工作区原先把它写入 `selectedId`，并将任务视图切回工步视图；工序解析随后回退到首工序，导致请求错误携带 `operation_id: ring-op-1`。

现在空值选择只切换 `view: task`，保留之前的工序 ID，与现有 Demo 和侧栏任务入口一致。抽屉、主面板和发送上下文共同使用任务视图，任务级请求省略 `operation_id`。重新选工序后恢复该工序上下文。未修改 API、默认首工序回退、Agent 不可用界面或布局。

## 回归证据

新增 `e2e/agent-live.spec.ts` 参数化用例，分别通过抽屉和侧栏进入任务级；每种入口连续覆盖 `op2 → task`、`op4 → task`、`task → op2 → task`。每次选择都发送消息并检查浏览器实际 POST 请求 JSON，检查工序 ID 或字段缺省、抽屉选中值及主界面任务按钮选中状态；首次打开仍验证首工序及其发送 ID。

修复前运行同一测试：抽屉失败、侧栏通过（1 failed / 1 passed）。失败为 `Expected path: not "operation_id"; Received value: "ring-op-1"`，不是浏览器或测试环境错误。修复后 Agent 专项在两个视口共 8 项通过，包括未开启 Agent 时输入和发送禁用，以及工艺决策/程序审核上下文。

## 验证结果

- `NODE_OPTIONS=--no-experimental-webstorage npm run quality`：退出码 0，32 个测试文件、363 项单元测试通过；仓库、lint、格式、类型和构建检查通过。构建仍有已有的单包超过 500 kB 提示。
- `NODE_OPTIONS=--no-experimental-webstorage npx playwright test`：退出码 0，116 项通过（49.3 秒），包含 1920×1080 和 1440×900 两个项目。
- 本机 Node 25 使用上述 WebStorage 兼容参数；浏览器启动需允许 macOS Chromium 进程创建，首次受限启动失败未计入红绿证据。
- 截图已逐视口检查：任务级选择与主面板一致，输入和关闭控件可见，没有新增横向溢出。既有测试自动生成的无关截图恢复为基线，仅保留本次新增截图。

| 视口 | 抽屉进入任务级 | 侧栏进入任务级 |
| --- | --- | --- |
| 1920×1080 | [截图](agent-live-evidence/chromium-1920x1080/agent-task-context-drawer.png) | [截图](agent-live-evidence/chromium-1920x1080/agent-task-context-sidebar.png) |
| 1440×900 | [截图](agent-live-evidence/chromium-1440x900/agent-task-context-drawer.png) | [截图](agent-live-evidence/chromium-1440x900/agent-task-context-sidebar.png) |

边界：这是本机浏览器对合成 Core fixture 的端到端请求验证，截图中回答为固定替身；未连接真实模型、未执行 Windows 联调，不代表模型回答质量或制造验收。本修复待 PR 评审，未合入。
