# 执行预检与操作提示验收（2026-10-27）

基于 main `b0c4e349`，待 PR 审核。保持原三阶段、工序列表、详情区域和底部操作栏；没有 CSS 或页面布局变更。详细阻塞原因、下一步和“重新检查执行条件”放在原任务状态详情内，批准与运行按钮提供禁用原因。

Core 工艺卡可返回 `execution_preflight`，批准清单可返回 `preflight`，字段为 `status/code/message/next_action`。前端收紧阻塞条件，不以预检替代批准或运行时校验。旧 Core 缺少可选诊断时保持既有执行资格判断。

重新检查只查询原任务、工艺卡、批准清单，不创建任务、不重复批准、不提交 CAM；保留本地草稿和审核人。发现修订或反馈变化时提示恢复核对，解除只读查询重试锁，避免旧版本死循环；不会自动把旧草稿应用到新版本。

验证：`NODE_OPTIONS=--no-experimental-webstorage npm run quality` 通过（319 项测试、类型检查、格式、构建）；Playwright 在 1920×1080 与 1440×900 共 104 项通过。既有布局断言保持底部操作栏不超过 56px、正文可视空间及页面无溢出。Node 本地实验性 WebStorage 被关闭以使用测试自己的存储替身；未修改生产逻辑。

截图使用隔离 API 测试替身，不是 Windows/NX/Mastercam 真实执行证据。用户当前 5174 页面及任务未替换。

| 视口 | 阻塞原因与下一步 | 查询恢复后 |
| --- | --- | --- |
| 1440×900 | [截图](execution-readiness-evidence/1440x900/execution-blocked.png) | [截图](execution-readiness-evidence/1440x900/execution-ready.png) |
| 1920×1080 | [截图](execution-readiness-evidence/1920x1080/execution-blocked.png) | [截图](execution-readiness-evidence/1920x1080/execution-ready.png) |
