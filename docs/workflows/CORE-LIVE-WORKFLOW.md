# Core 真实工作区接线

> 本文下方为2026-10-22独立工作区历史记录，已由[FE-CONTRACT-002](../api/FE-CONTRACT-002-Acceptance.md)取代。当前真实入口复用原r06三阶段页面，模板必须来自部署配置；不得再按下文固定2.2.0或独立表单方式使用。

入口为主界面的“打开 Core 真实工作区”。演示/历史案例仍保留并明确标识，不共享业务状态。设置 `VITE_API_BASE_URL=http://localhost:8000` 后启动 Vite；Core 必须允许前端来源的 CORS。未设置时使用同源 API，部署需要反向代理。不要在 VITE 变量中放制造凭据。

## 已接线

- 原始 STEP 二进制上传与存储回执；以 asset_id + command_id 触发/读取 NX 解析。
- 解析成功后创建 template-request-v1，绑定 source.asset_id/sha256/parse_command_id。
- 固定 golden-b7 2.2.0 及 digest（来自 Core `load_chamfer_template()`）；part 字段是用户目标声明，不是解析证据。
- 读取/恢复任务、生成模板、展示完整服务端计划和工艺卡；使用 current_revision/feedback_version/template_digest/plan_digest 提交 rough_step 修订。
- 工艺卡批准后，必须由 approved-plans 返回 execution_configured/profile_matches 且匹配当前 revision 才可发起 CAM。
- 读取已有 CAM 运行、刷新/核实状态、读取所有候选 NC 文件、按完整 NcVersionRef 审核和下载。文件 ID 使用查询参数，保留斜线。

## 边界

工作区目前使用显式刷新。服务端回执与错误原样可检查。NX 解析报告不表示模板已获制造准入；无真实执行配置或匹配计划时按钮阻塞。没有成功回执时不要推断执行成功；可用任务 ID 和运行 ID 恢复查询。

本次实现不包含 NC 文本编辑或模型反馈修订。参数修改走工艺版本再审批再生成，不能在浏览器修改执行资格。工具链测试和请求替身只验证前端行为，不能替代真实 Windows/NX/Mastercam 验收。

## 2026-10-22 验证

`npm run quality` 通过（17 个测试文件，265 项测试，包含类型检查、Lint、格式和构建）。新增 Core 浏览器检查在 1920×1080 和 1440×900 两种视口共 6 项通过，覆盖真实模式隔离、上传失败不推进、旧批准版本不能启动当前 CAM。截图见 `core-live-evidence/`。

完整 Playwright：54 通过、4 失败。失败均为既有 `program-review.spec.ts` 的编辑器键盘/差异测试（108、208 行，各两视口）；在未修改的 main `35534d9` 独立快照中同样 4 项失败，未改动该编辑器。本机使用 Playwright Chromium 156/v1248。沙箱缺少 macOS MachPort 启动权限时需允许浏览器进程在沙箱外运行。

没有连接真实 Windows 后端，本记录不表示 NX、Mastercam、NC 或实际制造通过。

### 审核修复

补充跨任务刷新失败、规划 POST 响应丢失、终态与修订读取先后、NC 正文读取失败的保护。规划请求发出前冻结审核与 CAM；结果不确定时保留原请求，并通过刷新重用 command_id 恢复。当前任务快照全部读取成功后统一展示；NC 正文全部读取成功后才能审核。补充回归后 Core 双视口 E2E 共 12 项通过，`npm run quality` 再次通过（265 项单元测试）。

明确 HTTP 4xx 拒绝与网络/5xx 不确定结果分开处理：拒绝后清除待确认命令，需重新读取权威任务才能继续；未知结果仍保留原命令恢复。新增 422 拒绝恢复测试后 Core 双视口 E2E 为 14 项通过，quality 再次通过。

### 恢复时服务端已有新修订

浏览器保存的规划运行已完成、但其输出早于服务端当前修订时，恢复流程只读查询当前结果及对应运行，再执行原有结果身份、交付、工艺卡和批准检查。不会重新发送规划、批准或 CAM 写请求；批准状态仍按当前修订读取。

若存在旧修订的未提交参数草稿，保留原日志并阻止自动套用到新修订，提示先核对草稿。活动运行和未决写请求继续使用原命令恢复路径。此调整不改变原型布局。
