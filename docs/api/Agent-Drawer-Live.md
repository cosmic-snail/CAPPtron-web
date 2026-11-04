# 真实模式 Agent 抽屉接入（2026-10-29）

基于 main `0a1a305`，待 PR 审核。对应 CAPPtron-core 对话 Agent 阶段 1 任务 1.7（Core 计划 `docs/superpowers/plans/2026-10-29-chat-agent.md`，接口见 Core `docs/http.md` 的“对话 Agent”一节，Core 已合入 #191）。

## 行为

- 只在真实 Core 联调模式下连接 Core Agent。原型/历史案例仍是 Demo 固定回复；`/?mode=simulation` 不连接 Agent，抽屉说明“本地模拟模式不连接 Agent”。
- 打开抽屉且已有规划任务时，先以只读 GET 探测：对话不存在（8401）表示 Core 已开启 Agent，路由不存在（3002）表示未开启（`CAPPTRON_AGENT_ENABLED`）。**只有 Core 确认 Agent 可用时，抽屉才切换为对话界面**；未开启、本地模拟、尚无任务或连接中时，抽屉与 main 基线的真实模式不可用抽屉逐字一致（“Agent 服务尚未接入，暂不能发送消息。”，输入禁用）。连接失败时在同一说明下另显示失败原因和“重新连接”。
- 对话按任务建立，浏览器只在 `localStorage`（`capptron.agent.conversations.v1`）保存对话 ID。刷新后先读取该 ID 的对话；Core 确认对话不存在（8401，例如 Core 已重启）时，用新 ID 新建空对话并提示“之前的问答已丢失”，不会用旧 ID 静默重建空对话。发送时发现对话丢失同样新建并提示，不自动重发问题。问答内容只在 Core 进程内存。换任务时丢弃旧对话，迟到响应被忽略。
- 每条消息附带页面上下文：`page`（工艺决策 `planning` / 程序审核 `review`）、`task_id`、当前修订、所选工序；程序审核页另带当前 NC 版本 `nc_ref`。上下文只是提示，Agent 以服务端记录为准。
- 展示服务端返回的事件：问题与上下文、查询卡片（摘要、结果状态）、回答、经 Core 核对的依据（可展开，显示资源、指针与取值，以及未通过核对的条数）、失败轮次的公开错误码。不补造回答或依据。
- 发送成功后清空输入；失败时保留原文并显示 Core 错误与 request ID。查询中禁止重复发送。
- Agent 请求不进入命令日志，不触发任何规划、工艺卡或 CAM 请求。批准、审核、下载与启动 CAM 仍只能在页面原入口完成。

## 布局与基线

- Demo/原型模式、模拟模式和 Agent 不可用时的抽屉，渲染结果与 main `0a1a305` 完全一致：在相同输入下逐字比较两版 `AgentDrawer` 的 HTML（Demo 空记录、Demo 有消息、无方案、真实模式不可用、程序审核页不可用，以及 checking/waiting/disabled/simulation 四种状态），全部相同；`AgentDrawer.test.tsx` 保留该比较。
- 只有 Agent 可用时才出现新的对话记录内容：查询卡片、回答与依据折叠区。新增样式只作用于真实对话的类名（`.agent-turn`、`.message-agent`、`.agent-tools`、`.agent-citations`），不改动抽屉尺寸、既有类名或其他页面。
- 在 main 与本分支分别运行全部 e2e，逐像素比较模拟与真实模式既有截图证据（72 张）：差异与 main 自身两次运行之间的差异属于同类（焦点与动画时序），无布局变化；既有证据文件未提交更新。

## 验证

- `NODE_OPTIONS=--no-experimental-webstorage npm run quality`：通过（361 项单元测试、lint、格式、类型检查、构建）。本机 Node 25 默认启用实验性 WebStorage，会覆盖 jsdom 的存储；CI 使用 `.nvmrc` 的 Node 22 不受影响。
- Playwright 1920×1080 与 1440×900 全部 112 项通过，其中新增 `e2e/agent-live.spec.ts` 4 项：Agent 未开启时不可发送；工艺决策页与程序审核页各提问一次，检查回答、查询卡片、依据、上下文字段（审核页带 `nc_ref`、工艺决策页不带）以及提问不产生业务命令。
- e2e 的 Agent 响应来自 `e2e/coreFixture.ts` 中的合成替身，请求和响应按 Core main `412ab13` 的 Pydantic 模型生成的 JSON Schema（`ConversationView`、`TurnResponse`、`CreateConversationRequest`、`SendMessageRequest`，已加入 `e2e/fixtures/core-schemas.json`）校验。截图中的回答不是真实模型输出。
- 未执行：连接真实 Core 与真实模型的浏览器联调；该项与 Core 侧 A01–A06 验收一起进行。

| 视口      | Agent 未开启                                                      | 工艺决策页回答                                                           | 程序审核页回答                                                         |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1440×900  | [截图](agent-live-evidence/chromium-1440x900/agent-disabled.png)  | [截图](agent-live-evidence/chromium-1440x900/agent-planning-answer.png)  | [截图](agent-live-evidence/chromium-1440x900/agent-review-answer.png)  |
| 1920×1080 | [截图](agent-live-evidence/chromium-1920x1080/agent-disabled.png) | [截图](agent-live-evidence/chromium-1920x1080/agent-planning-answer.png) | [截图](agent-live-evidence/chromium-1920x1080/agent-review-answer.png) |
