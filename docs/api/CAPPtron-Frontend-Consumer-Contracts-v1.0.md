# FE-CONTRACT-001｜CAPPtron 前端全量消费契约审计 v1.0

> 2026-10-23（Asia/Shanghai）。技术审计交付稿，**待前端维护者与 Core 负责人联合评审，未冻结**。仅交付文档，不实施 FE-CONTRACT-002 / 003，不代表浏览器联调或制造验收。

配套交付：[逐项接口矩阵](FE-CONTRACT-001-Interface-Matrix.md)、[后端交接清单](FE-CONTRACT-001-Backend-Handoff.md)。[v0.1 原稿](CAPPtron-Frontend-Consumer-Contracts-v0.1.md)逐字节保留；历史结论与本次核查不一致时，以本文件注明的证据为准。

## 1. 结论与审计范围

已覆盖模型输入、设计解读入口、工艺决策、任务/工序现场信息、Agent、CAM/NC 审核、案例库、数据底座、全局任务与状态九类需求。当前主要缺口是既有 Core 能力到原有 r06 页面的消费适配，而非缺少整套业务 API。

- 上传、解析、任务、规划与受控参数修订、工艺卡、批准归档、CAM、NC 保存/比较/修正/审核/精确下载均有后端代码。矩阵 B 项要求前端适配，不能重开同义端点。
- `rough_step` 已有服务端 `parameter_metadata` 与 `parameter_rules`。缺口是完整执行参数、资源与展示工步的稳定消费语义，不能继续按字段名猜单位和修改权限。
- 当前 Web `CoreWorkspace` 仍固定 Golden 2.2.0，工艺卡使用原 task_id 拼路径；当前 Core 已有有条件注册的 2.3.0 七工序模板和编码任务路径。这两项是明确的前端接入问题。
- 数据底座实际显示 **5 个 KPI**；`modelInvocationsToday` 仍在 Reader 契约中，但不是第六张卡。案例库、数据底座、历史程序 Reader 都是已存在的接口抽象，保留。
- 结构化现场事实、完整参数/资源描述、模板目录发布、任务重启恢复及真实鉴权仍需共同决定；通用 STEP、几何视图、通用 Agent 会话不阻塞固定 Golden。

本次不修改 `src/`、`public/`、CSS、依赖或导航；没有启动 NX/Mastercam、提交业务命令、审核或下载真实制造产物。

## 2. 可复核基线与证据等级

| 对象 | 本次核对基线 / 结果 |
| --- | --- |
| Web 远程 | `https://github.com/James-FE/CAPPtron-web.git`；fetch 后 `origin/main=ce46313a4637947b9e31500509dc7661d1e7b201`，含 PR #25 撤销 |
| Web 原工作区 | `develop/r06-ui`，`a55138f`；只有用户未跟踪 v0.1，未切换、stash 或覆盖 |
| 文档工作树 | 从上述 origin/main 创建 `docs/fe-contract-001-audit`；与原工作区独立 |
| Core 上游 | 直接 fetch `https://github.com/cosmic-snail/CAPPtron-core.git main`，`a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef`（含 #149、#150） |
| Core 个人 Fork | 原仓 origin 为 `James-FE/CAPPtron-core`，本地 main `df9c8cf`；不把该旧 checkout 当最新后端，不修改其分支 |
| PR #24 归档 | 本地 `archive/pr24-interface-reference=c36b1597f25a983532df559d6dc6228b1872d87c`；直接 fetch `refs/pull/24/head`，未推送、合并、cherry-pick 或恢复旧 UI |
| 运行实例 | 本次 GET `http://127.0.0.1:8000/openapi.json` 连接被拒绝。没有可归属到精确 SHA 的运行实例证据 |
| 静态 OpenAPI | `create_app(settings=AppSettings(), manage_logging=False).openapi()`；未进入 lifespan。OpenAPI **3.1.0**、包版本 **0.1.0**、37 paths / 40 operations / 102 schemas |
| Schema 摘要 | 排序键、UTF-8、indent=2 导出 SHA-256 `a804f9be5f49f20aefb7d2e26026c14e7a08f11796c0f45cd1ab01bd48be5593`；包版本不等于部署 Git SHA |
| 临时核查材料 | 仓库外 `FE-CONTRACT-001-evidence/`：静态 OpenAPI、生成脚本、Git LF 导出与静态模板。不是 PR 内容、不是部署数据 |

证据等级独立于 A—F 能力分类：

1. **运行实例已验证**：本次无；历史验证记录不能填入这一类。
2. **源码静态确认**：本次 Web/Core 固定 SHA 的类型、路由、实现、测试源码和安全生成的 OpenAPI；下文已实现结论主要属于此类。
3. **文档描述，尚未验证**：已有实机验收记录中的事实，本次未重跑；只在其原始条件内引用。
4. **需求建议，待双方确认**：方法名、缺口最小方案、后续验收场景；不构成已发布 HTTP 契约。

`docs/template-planning.md`、`docs/process-card.md`、`docs/algorithm.md` 仍含六工序、仅 Mock、不能批准等历史段落。已逐一对照 provider、路由和新验证记录，不将历史标题当当前能力结论。架构文档里的 React Router、TanStack Query、Zustand、Monaco 是早期建议；当前实际使用 React 本地状态和 CodeMirror，不能据此引入新框架。

### 2.1 固定 Golden 的准确边界

源码静态装配 `load_integration_template()` 得到模板 `golden-b7@2.3.0`，digest 为 `6dbc61c6e11583db52a5ef60c58305df4032837e9f0f72e212110545ae44e861`。工序稳定 ID 按 sequence 排列为 `ring-op-1, ring-op-7, ring-op-2, ring-op-3, ring-op-4, ring-op-5, ring-op-6`；`ring-op-7` 的 sequence 是 2。这是测试基准，不是页面应写死的数量或顺序。

2.3.0 只有配置 `EngineeringBinding` 时才进入 `TemplatePlanner` 的目录。第一次准入可从受信 binding 的 `baseline_plan` 覆盖原生工序 attributes；所以参考模板的 `display_steps/resources/source_parameters` 不能假定在每个 Live 响应中都存在。必须验证响应 schema/profile 和字段存在性。

该路径的 `schema_version=template-plan-v1-integration`、`source_binding=integration_pending`、`engineering_status=pending` 可以与 `reference_only=false`、`execution_ready=true` 同时出现。它表示受控联调资格，不是全部工程验证完成。页面不得把 `execution_ready` 翻译为“制造安全已通过”。服务端批准、执行匹配与 NC 审核仍各自检查。

最新[七工序验证记录（固定 SHA）](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/docs/validation/golden-seven-operation-nc-2026-10-23.md)的末尾记载 run `b8eb74d6-527a-46e2-a6c4-9b3a02c544e2` 已产生 2160-byte NC、摘要读取通过、Worker idle；早先失败段落保留历史。**这是历史记录证据，不是本次实机验证**。0.5→0.4 mm 的修订可匹配执行；无改动 0.5 mm、重新解析生成的新报告自动准入、其他 STEP 自动工序创建均不能由此推导。报告摘要包含时间/路径，重新解析同一文件也可能不匹配固定策略。

## 3. 当前前端消费面及职责

| 模块 | 实际消费者 / 行为 | 当前数据来源与必须保留的边界 | 矩阵 |
| --- | --- | --- | --- |
| 模型输入 | `ModelInputPage`、`ModelFilePicker`、`FileInfoBar`、`InputPreparationPanel` | File 选择/拖放/更换仅本地；`CoreWorkspace` 另有真实上传与解析；示例加载不上传 | I-01—06 |
| 设计解读 | `FileInfoBar` 的“查看解读结果” | 当前只提示不可用；没有 `DesignInterpretationPage` 实现。架构记载的 Figma 意图不是已实现页面或 API | D-01 |
| 工艺决策 | `ProcessPlanningPage`、`OperationDetails`、`ParameterFields` | 稳定 ID、序号、工步、装夹、参数、资源、缺项；`ProcessPlan.origin` 当前仅允许 mock。真实结果仍在 Core 工作区显示 JSON | P-01—14 |
| 现场信息 | `TaskMeasurements`、工序 onsite 子视图 | `draftKey` 分 scope；有限数/空值校验仅格式，改动使本地演示审核失效；没有保存服务器按钮 | S-01—04 |
| Agent | `AgentDrawer`、`AgentBubble`、`createDemoExchange` | 固定 Demo 回复、消息和发送时上下文；没有真实建议执行/确认工作流 | A-01—03、N-06 |
| 程序审核 | `ProgramReviewPage`、`ProgramEditor`、`ProgramDiff` | 原文/草稿/暂存、撤销/重做、恢复、差异、演示确认和草稿导出均已实现；Live 工作区只读展示候选并批准/下载 | C-01—07、N-01—08 |
| 案例库 | `PlanningSourceSelector`、`CaseCatalogReader` | 版本化 JSON、Ajv、摘要与引用验证；静态实现有正式读取契约 | R-01—04 |
| 数据底座 | `DataFoundationPage`、KPI/图表/目录/详情 | 七种 Reader 方法、六类资产，当前合成数据。统计使用 Reader 返回口径，不在组件重新聚合 | F-01—09 |
| 全局 | `App`、`AppShell`、`WorkflowWorkspace`、`useWorkflowSession`、`CoreWorkspace` | stage/view/live 与业务状态分离；Core 工作区卸载会丢本地状态，不能声称跨模式已持久恢复 | G-01—09 |

全部源码相对路径及固定 SHA 链接见矩阵证据索引。FE-001—004 验收文档保留原历史状态，当前是否存在某行为以本次源码为准。本次没有访问或修改 Figma，解读页“规划中”的结论仅基于源码和仓内设计记载。

## 4. 消费分层（只定义，不重构）

```text
原有 React 页面与交互
  → ViewModel / 本地草稿与选择
  → 既有 Reader 或按业务定义的 Service / Gateway
  → DTO 校验与 Adapter + CoreClient
  → Core HTTP / Pydantic + 领域校验与制造门禁
```

- 保留 `CaseCatalogReader`、`DataFoundationReader`、`ProgramContentReader`；现有方法名不统一改名。Gateway 名称仅是责任划分建议，不要求新建 ports 目录。
- API 层负责 URL/头、DTO 运行时验证、错误归类、精确版本与来源映射。页面负责显示和本地交互，不负责 raw HTTP、制造默认值或服务端权限推断。
- Mock/Reference/Live 应共享经过确认的显示模型，不共享权威身份。现有 `ProcessPlan.origin='mock'` 不能通过类型断言装入 Live；002 应在不改变视觉布局的前提下明确来源类型与适配规则。
- 每个 React 按钮不对应一个新端点。工序选择、展开、草稿输入、恢复原文、Agent 气泡拖动均为本地操作。保存、批准、重新规划等才调用已有业务命令。
- 不增加 BFF、路由框架或新状态机。若采用 OpenAPI 类型生成，仍须补充动态 payload 的版本校验和领域语义，不能把 `dict[str, JsonValue]` 当无条件可信 VM。

## 5. 关键字段映射与缺口

### 5.1 工序、工步和参数

`PlanProduced` 是结果 envelope，保留 `task_id/result_id/revision/run_id/event_id/trace_id/provider/schema_version/feedback_snapshot`；不能只取 payload 后丢掉基准。对于 template 输出，payload 通过对应 profile 校验后消费 `NormalizedPlan`。Mock 或未知 Provider 不套用模板 Adapter。

- `payload.operations[].id/sequence/name` 直接映射工序身份/顺序/名称。页面数量取数组长度。未知/重复 ID 或不合法顺序应报契约错误，不按数组下标制造业务 ID。
- `steps[].id/sequence/content/attributes` 是规范工步；VM 可把 content 显示为名称，但它不是额外存在的 HTTP `step.name`。参考 `attributes.display_steps` 是来源展示摘要，不能计作新增 SDK 工序。是否优先展示来源工步、如何绑定规范工步，由 P-05 联合确认。
- `attributes.source_parameters[]` 保留历史字段 `id/name/value/unit/source/status/inputKind/editPolicy/requirement/description`；它们是历史参考值。`attributes.parameters[key]` 是该结果中的实际参数值，两者不能静默互相覆盖。
- `attributes.parameter_metadata[key]` 已提供 rough_step 的 `name/unit/edit_policy/allowed_values/source`；`source` 有 `kind/resource_id/sha256/pointer/engineering_status`。`extensions.parameter_rules[]` 提供类型、单位、稳定目标、JSON Pointer、离散值及可选上下界。**这部分属于 B；完整执行参数描述属于 C。**
- 静态 2.3.0 的 rough_step 目标为 `ring-op-2`，Pointer `/operations/2/attributes/parameters/rough_step`，允许值仅 `[0.5,0.4]` mm。数组下标仅是该包的定位证据；请求以 operation_id+parameter_id 提交，重排后不复用旧 Pointer。不能把两个点扩展成 0.4—0.5 连续区间。
- `attributes.parameter_changes[]` 保存 old_value/new_value/unit/base_revision/base_plan_digest/template_digest/execution_profile_digest/source；这是已应用变更证据。浏览器输入框里的值不是新工艺 revision。

完整参数描述最小建议：Core 或受版本/摘要约束的服务端发布配置提供稳定 key、scope、label、value_type、unit、source、edit_policy、allowed_values 或 bounds、required、空值语义；当前已经存在的字段直接复用。新增字段名在评审前只是建议。翻译 label 可由前端维护；单位、离散值、径向/直径语义与可改集合不得仅由前端命名表决定。推荐值与实际值如果需并排展示，必须先定义 recommendation 的来源和身份，当前没有通用 `recommended_value` DTO。

可编辑的必要条件是已识别且匹配模板/计划摘要的规则允许 replace、该参数的描述完整、无未知提交或过期草稿；这些只决定前端是否提供输入。后端收到 `parameter_patch` 仍重新验证单位、值、目标、摘要、revision 和 feedback_version。未知字段默认只读。

### 5.2 资源、装夹及现场信息

参考方案 `attributes.resources[]/setup/notes/onsite_fields` 与执行方案 `attributes.tool/setup_id/operation_type` 不是同一结构。tool_number、station 是设备侧引用，不是资源库 tool ID；`setup_id` 也不等于装夹说明。禁止生成 `${operation.id}-tool` 作为真实刀具身份。机床/刀具完整名称、规格、验证状态、稳定目录引用需确认最小投影；缺失时保留“未提供”。Core 内部 `ResourceSnapshot` 仅 machine/tool，不是数据底座六类资产服务。

任务 `extensions.task_fields`、工序 `onsite_fields` 可以带历史示例的待填字段，但其 `demo_required/demo_input` 不授权真实制造写入。现场提交拟复用 `HumanFeedbackRequest.supplement_schema_version/supplement`，尚未有正式测量 schema、录入者身份、更新规则或制造验证状态。不能将 text 或任意 JSON 当已验证事实。需先决定 scope、单位、量测时间/人员、原值覆盖策略、回读和撤回、对 revision/审核的影响。当前 Template Provider 保留自然语言反馈但 `applied_feedback_ids=[]`，不能声称已按反馈重新规划。

### 5.3 工艺卡与归档

卡片 `status=ready` 是渲染就绪，不是执行批准。返回 `card` 可空，包含 identity、布局模板 ID/version/digest、profile_digest、header、operations/steps。业务工艺模板 2.3.0 与卡片布局模板版本 2 不得混用。卡片 details 通过布局绑定复用同一参数/metadata/changes/source_parameters，不复制另一套执行值。

路径在 OpenAPI 中名为 `{task_id}`，但卡片 handler 要求 `id_ + base64url(UTF-8(raw task_id))`、去 `=` 的不透明令牌。优先使用 snapshot 的 `card_path`；恢复时若需编码，封装并测试该已存在协议。归档、planning 和 CAM 路径仍使用原始业务 ID 的 URL 编码。当前 CoreWorkspace 的原 task_id 拼接是 B 类修复，不要求后端改变路径。

review 绑定路径 revision、`expected_feedback_version`、command_id、decision/comment 与声明审核头。批准返回 `archive_status=archived`，归档包 `content_digest` 是 ApprovedPlanRef.archive_digest 的来源；不要使用 plan_digest 代替。未归档草稿不能从 archive GET 恢复。

### 5.4 NC 正文、草稿与修订

`NcVersionRef={cam_run_id,version,content_digest}` 是一整套文件的精确身份；每个文件还有 file_id/setup_id/sequence/filename/encoding/sha256/size_bytes。正文接口另有 newline/text。`content_digest` 不等于某个文件或 ZIP 的 SHA-256。

保存复用 `POST /cam/runs/{run_id}/nc/versions`：command_id、完整 base、edits[{file_id,text,newline_mode}]。只允许修改清单已有文件，编码/文件名/装夹/顺序继承服务器清单；无变化可返回原候选，不能假定每次保存 version+1。有变化生成 human_edit，批准不继承。过期链头或链上活动运行冲突时保留本地草稿并回读服务器，禁止静默覆盖。

当前 ProgramDocument 的 revision/savedRevision/history/review 是浏览器演示数据，与 Core version 分开。Live “恢复原文/暂存”只修改草稿；写回需另行 save，不能回退服务器 version。编辑器撤销栈、全文展开和未提交 diff 无需 API。Core 已有父版本 comparison；任意两个历史版本比较可先读取两个精确版本在前端比较，不发明 compare 路径。

Core 文件接口提供解码文本和原字节 metadata，不能只哈希 UTF-8(text) 宣称验证原文件字节。`utf-8-sig`、非 UTF-8、BOM 和混合换行尤其需要保留。Live 保存采用服务端 newline_mode；本地历史 Reader 的编码算法不是 Core 全部编码能力的上限。下载使用服务端 ZIP 原字节和 `X-Content-SHA256`，读取 `Content-Disposition`、可选 `X-Engineering-Status`；不得用前端 Blob 草稿代替已批准版本下载。

revise 绑定已保存 base 和 prompt，202 后查询新 CAM run。`nc_edit/cam_rerun/needs_plan_change` 是领域结果模式；HTTP CamRunView 使用 outcome、explanation、current_candidate 等投影，不存在通用 `mode` 字段。通过候选 origin、parent、simulation_version、comparison 表示实际产物；需要改计划时返回工艺流程，不自动批准。普通 reject 不启动 revise。

## 6. 身份、版本、持久化与结果未知

| 身份 | 权威与生命周期 | 不得混用 |
| --- | --- | --- |
| File / sourceVersion | 浏览器 File 与来源切换计数；刷新丢失 | 不是 asset_id 或 plan revision |
| CAD Asset | Core 持久上传回执、原字节摘要；status 始终 not_parsed | 不是解析成功 |
| CAD Report | asset_id + parse command_id + source/report/script 摘要 | 当前没有独立公开 report CRUD；不可伪造 report_id |
| Planning Task / Plan Revision | Core 内存任务/反馈/运行/结果，revision 只在成功产出后增加 | TaskView 不含 active_run_id/needs_replan；不要从 current_revision 推测无活动运行 |
| Process Card Revision | 与 task/result/revision 对齐的卡片和布局模板身份 | 布局版本不是工艺版本 |
| Approved Archive | 文件归档、不可变内容摘要；重启可读已批准材料 | 不能恢复丢失的内存草稿或用旧批准代替当前草稿 |
| CAM Run | 持久 cam_run_id/root_run_id、state_version、plan_ref | 不是 planning run_id；state_version 不是 NC version |
| NC Version | 精确 NcVersionRef 与每文件摘要、父引用和审核历史 | 不沿用另一版本批准，不用 root snapshot 代替版本 GET |
| Reference Case | caseId+caseVersion+contentDigest / planId | 不是服务端 Task、模板版本或新产物 |

同一任务跨页面状态建议使用模式+task_id+revision+目标 ID 的缓存与草稿键；结果响应必须核对请求时身份，晚到响应不能覆盖新任务。切换来源/模式时释放请求并隔离草稿，Live 失败不回退 Mock。现有 Demo 会话在数据底座往返时保留，但 CoreWorkspace 的条件挂载不保证同样恢复能力，002 要独立验收。

工艺新 revision 必须重新取得卡片/批准资格；未提交参数草稿也应阻止误用旧批准。启动 CAM 总是发送 `expected_current_revision`，虽然旧接口为兼容允许省略。Core 在规划锁内核对；服务重启后当前内存任务未知时拒绝该入口，不能通过省略字段绕过。

### 6.1 幂等与恢复规则

| 操作 | 幂等身份 / 范围 | 响应丢失后的动作 |
| --- | --- | --- |
| 上传 | command_id + filename + 原字节，持久 | 已知 asset_id 则 GET；未知则重放原命令和原字节，不换键 |
| NX parse | asset_id + command_id，持久 | GET 同路径 query command_id；running 中断不自动新建，failed 不自动重跑 |
| create task | command_id + schema_version/payload，进程内 | 同进程重放原请求；重启幂等窗口丢失，先确认服务代际，不能盲目重建 |
| feedback | feedback_id（新增），DELETE command_id，任务/命令类型范围内 | GET ledger 或原请求；保留原 expected/base，不修改成最新版本假装重试 |
| replan | task_id + command_id + 原 body，进程内 | 已知 run_id 则 GET；未知则原 body 重放获得 run_id，再查终态 |
| card review | 精确卡片 + command_id + 版本约束 | 查询卡片/归档；已归档批准可重放恢复，未归档重启恢复受限 |
| CAM start/revise | 持久 command_id + 规范请求 | 已知 run 则 GET/reconcile；回执未知只能重放原请求取得原回执，不以新键重新制造 |
| NC save/review | command_id + 精确 base/ref + 内容 | 原请求重放、精确版本 GET；不把保存冲突自动转成新基线覆盖 |
| cancel/reset | command_id | GET /cam/controls/{command_id}，必要时 reconcile 控制；不重复派发 |
| closeout | command_id + reason + evidence_command_id | 原回执与 run 查询；仅允许受信已确认控制证据结束 awaiting_confirmation |

现有 CoreClient 的 pending Map 仅在进程内按 path/content/reviewer 保留 POST 键；不覆盖上传、浏览器刷新，也不提供全部命令账本。需由 FE 服务保存未决意图及原 body 引用，不能把 Map 当后端幂等机制。协议性 4xx 拒绝与网络超时/断线/不确定 5xx 分开；收到非 Core 格式的代理错误不能直接认定制造失败。新请求应使用新 request_id；重放仍保持原 command_id。

### 6.2 错误、权限与页面状态

统一消费 `ApiErrorResponse.error.code/message`、`request_id/trace_id`、`issues[]`；CAM 另允许 stage/reset_required/file_id。不要仅保留响应字符串，原始异常和主机路径不进入业务 UI。各模块区分 loading、empty、error、unavailable、unknown_outcome；字段缺失显示未知，不补 0。

400/401/409/415/422 按具体协议处理；409 先回读身份和版本，422 显示字段/命令拒绝，503 说明能力不可用并保留未决身份。部分参数语义错误是 **202 后 run failed**，不是即时 422。具体错误码见矩阵，不用 HTTP 成功推导制造完成。

CAM/NC `allowed_actions` 是当前投影，优先于前端推断；请求时服务端仍重新判断。planning/card 不存在通用 allowed_actions 字段，不能编造。`X-Reviewer-ID`、`authenticated=false`、`identity_source=declared` 仅是声明身份。受控演示与生产认证/任务权限由负责人明确部署边界，不因 CORS 或按钮禁用就认为已授权。

## 7. Reference / Mock / Live 的独立契约

案例库以 index 定位版本化 JSON，验证 schemaVersion、case/version/plan/asset/evidence 引用与 contentDigest。`caseToProcessPlan()` 将 editPolicy/requirement 转为演示 editable/required；不转换为制造授权。`ProgramContentReader` 校验案例归属、NC 原字节 size/SHA、严格解码，只在开发本机私有入口提供正文。生产构建不可用时不加载替代程序。

案例 v2、Core process-template 2.3.0、卡片布局 2、规划 revision 2 都是不同对象。Core importer 有特定源字节和 source_operation_id 映射，但 2.3.0 插入钻孔且工程材料更新，不能宣称案例与新执行模板完全等价。建议映射记录绑定两侧版本/摘要、operation ID 对照、验证依据与适用范围；没有验证映射只显示“参考”，不启用执行。

模板选择应有服务端可发布的目录或受控版本化配置作为数据来源。当前 `TemplatePlanner.catalog()` 是 Python 方法，无公开 HTTP route，也未提供完整适用条件。P0 可先约定固定模板配置的版本与摘要、准入依赖；P1 再协商只读目录投影。此决定不要求数据库，也不先冻结新 URL。

数据底座保留所有七种 Reader，当前 `foundation-turning-mock-v2` 为合成数据：四类业务资产+知识+模型登记；使用事件独立。资产总量不包括模型、工序和事件；模型目录记录不等于已部署模型，synthetic model_invoked 不是真实调用。未来数据源需要统一快照、时区/统计窗口、权限过滤分页、真实事件身份与去重；Core 内部资源快照和 LLM 配置不能直接冒充该目录。

## 8. PR #24 历史参考分析

所有条目均指向归档 SHA，不是当前 UI 权威。未重新运行其旧 UI 或测试。

| 历史文件 / 证据 | 可复用内容 | 必须修正或禁止恢复 |
| --- | --- | --- |
| `src/api/core/client.ts` 与 client.test.ts | raw upload、URLSearchParams file_id、cardPath UTF-8 编码、同命令网络失败重放、observe 思路 | HTTP 错误仍为字符串、DTO 不完整、pending 内存化；observe 应尊重 allowed_actions；无体 POST 不应惯例发送 `{}` |
| `src/api/core/golden.ts` 与 golden.test.ts | 创建前校验 parse.asset_id/source_sha256，避免伪造 part 几何 | 2.3.0/digest 写死只适用受控示例；不能证明当前部署注册或允许该模板 |
| `src/api/core/viewModel.ts` 与 viewModel.test.ts | Adapter 独立于页面、保留部分 operation/step ID、空数组不填 Demo | sequence 用 index+1；按名称补 mm、只编辑首个 rough_step；虚构 tool ID；丢 source_parameters/display_steps/现场字段及详细来源；测试只是锁定这些假设 |
| `src/features/core/useCoreWorkflow.ts` | 以 task/revision 隔离参数草稿、未决 replan 阻断批准、读取终态后刷新版本、全文读完再显示审核候选 | 未覆盖刷新后的命令恢复/完整身份；正数校验不等于离散规则；仍只处理粗车参数；通用业务状态不能直接照搬 |
| `CoreInputPreparation.tsx` | 显示上传/解析/任务的不同状态 | 固定材料/几何要求/模板文案；不恢复该组件替换方案 |
| `CorePlanningPage.tsx` | 显式提交修订再批准的交互语义 | 另建页面与原有布局集成改动已被撤销；不恢复页面、样式、导航 |
| `CoreProgramReviewPage.tsx` | 精确候选、多文件选择、review/download 门禁 | Live 只读不证明 Core 无编辑能力；不恢复新审核页，也不把历史 readonly 限制设成最终契约 |
| `e2e/core-workflow.spec.ts` | 旧批准不可执行、响应丢失复用命令、失败切换清旧状态、无全文不可审等场景 | route.fulfill 测试替身不是实机；其中 status=stored、phase=simulate、非 64 位摘要等样例不符合当前 Pydantic，不能复制为契约 fixture |

## 9. 待确认决定及 002 / 003 边界

交接清单是唯一待办优先级索引，矩阵是字段和能力状态索引。联合决定：固定 Golden pending 的允许范围、完整参数/资源/展示工步投影、版本化目录发布、现场事实 schema、Agent 建议确认语义、恢复能力与认证部署边界。C/D 项均列具体问题和验收方式，未以建议替换已发布 API。

**FE-CONTRACT-002 建议范围（本次未实施）**：已确认 B 项的 DTO/错误适配、原有页面接线、身份和未知结果恢复、已存在 NC 保存/比较/审核/下载、原 Reader 保留、来源与门禁回归；以原 r06 视觉为基线。任何 VM 类型扩展必须保持原页面设计并单独验收。

**FE-CONTRACT-003 建议范围（本次未实施）**：双方确认后才实现 C/D 的 Core schema/投影、目录发布、现场输入、恢复及鉴权补齐；前后端联合契约 fixtures 与部署验证。E 项另排业务计划，不能把通用 STEP 或通用聊天默认塞入此阶段。编号与责任边界仍由维护者确认。

## 10. 验证与评审状态

已核对当前页面、三个 Reader、真实 CoreClient、PR #24 八组重点文件/测试、Core 指定指南/路由/模型及动态模板装配。矩阵共65项（A=10、B=35、C=7、D=4、E=2、F=7），包含每项的请求/响应、来源、状态、Owner、优先级、证据，以及展示字段的可空性/单位/编辑规则；另列101个OpenAPI模型/枚举、40个操作和OpenAPI未覆盖的源码字段。未确认字段明确待议。

本次实际软件检查：Windows 文档工作树 `npm run quality` 在 Prettier 阶段因 checkout CRLF 报 105 个既有文件格式问题；未格式化或修改源码。独立运行 typecheck、265 条 Vitest、build 均通过。随后用 `git -c core.autocrlf=false archive` 在仓库外还原同一 Web commit 的 LF 字节，完整 `npm run quality` 通过（baseline、lint、format、typecheck、17 文件 / 265 测试、build）。Core 模板资源也必须保留 Git 原字节，CRLF checkout 会导致来源摘要校验失败；静态模板核验使用仓外 LF 导出，未绕过摘要或修改 Core 文件。

文档链接、引用路径、端点与 schema 名、Contract ID、三份文档优先级、v0.1 字节一致性及 docs-only diff 在提交前检查。未执行浏览器视觉回归、Core 业务 HTTP 集成测试或 CNC 实机流程；纯文档修改不新增这些验证声明。已有测试源码仅作为实现证据，不冒充本次执行。

技术审计完成的含义是：九模块已纳入、当前/历史/建议有区分、关键字段可追溯、缺口与联合验收可执行、归档成功且只提交文档。**不表示全部字段已经冻结或系统已完成对接**。前端负责人需确认 UI/Adapter 语义；Core 负责人需确认动态 payload、部署策略与补齐项；工程/产品负责人需确认制造门禁和现场事实。所有签字状态仍为待评审。
