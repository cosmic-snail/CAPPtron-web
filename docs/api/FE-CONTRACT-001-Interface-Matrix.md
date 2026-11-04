# FE-CONTRACT-001｜全量接口与字段矩阵

> 2026-10-23；Web `ce46313a4637947b9e31500509dc7661d1e7b201`；Core 上游 `a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef`。技术审计完成稿，双方未冻结。

[主文档](CAPPtron-Frontend-Consumer-Contracts-v1.0.md)定义身份、状态和实现边界；[后端交接](FE-CONTRACT-001-Backend-Handoff.md)回答 C/D 问题。所有 Proposed FE Method 都是消费层建议（现有 Reader/纯函数名除外），**不是新增 HTTP 承诺**。

## 1. 使用规则

- A｜已有且符合需求，只需正常消费；B｜后端已有，前端 Adapter/接入未完成；C｜部分能力存在，字段或语义待补齐；D｜双方尚未明确契约；E｜未来功能，不阻塞固定 Golden；F｜纯前端 UI 状态。
- A 的案例/数据底座/历史 Reader 仅表示其**当前参考或 Mock 用途**已满足，绝不表示 Core 已提供真实目录。F-08 单列真实来源缺口。
- 本次全部 Core HTTP 结论为**源码静态确认**，包括安全生成的 OpenAPI；运行实例未验证。历史测试源码/响应样例不等于本次执行或实机验收。D/E 的建议字段明确标记待定。
- Request Fields 未特别声明时为 JSON body；GET/DELETE 参数注明 path/query。`?` 表示可省略或空值的摘要记法；精确 required 与 nullable 以§4逐字段表为准。字段无单位时不添加单位。
- 显示字段的身份、可空性、单位、来源、可编辑性在§3补充；矩阵与字段表需一起实施。工艺、CAD和NC的制造门禁以Core判定为准。
- `task_key` 是卡片路径的不透明编码；OpenAPI占位符名虽然为task_id，不能传原始task_id。其余路由用原始业务ID并URL编码。
- P0阻塞当前固定Golden协作；P1正式既有交互补齐；P2未来扩展。C/D每项的Q编号对应交接清单。当前页面没有按钮的动作已标“未来接线”，不能宣称现已实现。

## 2. 逐项消费矩阵

### 模型输入

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I-01 | 模型输入 | ModelFilePicker / FileInfoBar / useModelInput | 选择、拖放、更换、取消；名称/大小/后缀 | selectFiles(files) | 无需 HTTP | File[]；恰一份 .step/.stp | ModelSelection empty/local/demo；file.name/size、extension、sourceVersion | size 字节仅显示换算；sourceVersion 仅 UI 计数 | 浏览器 File | F | 无效/取消保留原有效选择；不生成 asset_id | Frontend | P0 | [W1](#evidence-w1) |
| I-02 | 模型输入 | CoreWorkspace 上传；r06 尚未接线 | 存储 STEP、回读资产及摘要 | cad.upload(file,commandId); cad.get(assetId) | POST /cad/assets；GET /cad/assets/{asset_id} | query filename,command_id；application/octet-stream 原字节 | CadAsset: asset_id,command_id,filename,sha256,size_bytes,status,format,created_at | 本地 File → stored asset；status=not_parsed 不随解析改变 | Core 文件库 | B | 201；4101 格式、4102 超限、4103 未配置、4105 冲突、4106 损坏；同命令原字节恢复 | Frontend | P0 | [W2](#evidence-w2) [C1](#evidence-c1) [T1](#evidence-t1) |
| I-03 | 模型输入 | CoreWorkspace 解析/刷新；InputPreparationPanel 未来接线 | 启动 NX；查询未决/失败/报告 | cad.parse(assetId,commandId); cad.getParse(...) | POST/GET /cad/assets/{asset_id}/parse | POST {command_id}；GET query command_id | CadParseResult: asset_id,source_sha256,status,report_sha256?,nx_report?,analysis?,script_sha256,diagnostic?,execution_ready=false | 显示 running/parsed/failed；不可伪造百分比；校验回执资产和源摘要 | Core 解析作业 | B | POST 200 是有界等待结果；断线 GET 原命令；failed 不自动重新执行 | Frontend | P0 | [W2](#evidence-w2) [C1](#evidence-c1) [T1](#evidence-t1) |
| I-04 | 模型输入 | CoreWorkspace 创建模板规划任务 | 创建关联可信源的任务 | planning.create(envelope) | POST /planning/tasks | command_id,schema_version=template-request-v1,payload.template{id,version,digest},payload.source{asset_id,sha256,parse_command_id}；part 按 schema/用途，不伪造实测 | TaskView: task_id,result_id,trace_id,source_request_id,current_revision,feedback_version,provider | 保留返回身份；创建不是已规划；当前 Web 2.2.0/固定 part 需改为已确认部署配置 | Core 输入服务与 TemplatePlanner | B | 201；初始 revision=0；模板适用/几何不符在后续 preparation/run 中呈现 | Frontend | P0 | [W2](#evidence-w2) [C2](#evidence-c2) [C3](#evidence-c3) |
| I-05 | 模型输入 | InputPreparationPanel 模板待接入；CoreWorkspace 固定常量 | 真实模板身份、适用条件、部署可用性 | templates.getSelectionConfig()（建议） | 待协商；已有 TemplatePlanner.catalog() 仅 Python，无公开 HTTP | 固定模板配置/未来筛选条件待确认 | 现有 catalog: id,version,digest,family,execution_ready=false；包另有 applicability_conditions,parameter_rules,publication_status,required_capabilities | 不把案例 v2 当模板版本；2.3.0 需 EngineeringBinding 才注册 | Core 已安装目录/受控发布配置 | C | 缺目录或 digest 不匹配禁用选择；问题 Q1：P0 固定配置还是发布只读目录？ | Joint | P0 | [C3](#evidence-c3) [C4](#evidence-c4) [W2](#evidence-w2) |
| I-06 | 模型输入 | 输入准备三项状态；未来结构化制造要求 | 结构化 envelope 预检、资源缺项 | inputs.prepare(envelope) | POST /inputs/prepare | schema_version,payload；不是文件上传，不由浏览器填 context/resources | PlanningRequest: schema_version,payload,context{trace_id,request_id,source,received_at},resources{machines,tools} | 展示缺项/准备结果；planning.create 已做准备，无需所有流程先重复调用 | Core 输入校验 | B | ApiErrorResponse.issues；准备成功不等于解析/制造准入 | Frontend | P1 | [W1](#evidence-w1) [C5](#evidence-c5) |

### 设计解读

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | 设计解读 | FileInfoBar 查看解读结果（当前仅不可用提示） | 未来特征列表、尺寸、类型、面边、轴、置信/异常、确认与来源 | interpretation.read(asset,parseRef)（建议） | 现有 parse 返回原报告；结构化特征视图/确认写入待协商，无新路径 | asset_id,parse_command_id；确认命令字段待业务定义 | 公开 analysis/nx_report 为自由对象；内部 TurningFeature.feature_id/type/body_id/face_ids/edge_ids/coordinate_frame_id/axis_id/status/raw_facts 与 AnalysisIssue，不是已发布 HTTP DTO | 长度 mm 来自内部 bundle；置信度无统一数值字段；用户确认状态/写入尚未实现 | Core CAD 证据＋未来人工确认 | E | 当前入口 unavailable；未来缺拓扑/来源不可伪造识别结果 | Joint | P2 | [W1](#evidence-w1) [C1](#evidence-c1) [C6](#evidence-c6) |

### 工艺决策

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | 工艺决策 | CoreWorkspace 恢复/刷新任务；规划页任务上下文 | 读当前任务和版本 | planning.getTask(taskId) | GET /planning/tasks/{task_id} | path 原 task_id | TaskView 全字段 | task_id/result_id 稳定；current_revision/feedback_version 保留，不用本地计数替代 | Core 内存任务 | B | 404 未知/重启丢失；TaskView 无 active_run_id/needs_replan | Frontend | P0 | [W2](#evidence-w2) [C2](#evidence-c2) [T2](#evidence-t2) |
| P-02 | 工艺决策 | 生成模板工艺/重新规划 | 显式产出新方案 | planning.replan(taskId,command) | POST /planning/tasks/{task_id}/replan | command_id,base_revision>=0,expected_feedback_version>=0；parameter_patch 可选 | RunReceipt: task_id,run_id,command_id,status,basis_revision,basis_feedback_version,used_feedback_ids,provider,needs_replan,delivery_state | 202 保留 run_id；清理旧卡片/批准资格但保留审计身份 | Core 规划服务 | B | 409 旧版本/活动运行/同键异内容；未知响应保留原 body | Frontend | P0 | [W2](#evidence-w2) [C2](#evidence-c2) [T2](#evidence-t2) |
| P-03 | 工艺决策 | 规划进度/刷新；DemoPlanningProgress 仅模拟 | 读规划执行及交付状态 | planning.getRun(taskId,runId) | GET /planning/tasks/{task_id}/runs/{run_id} | task_id,run_id | RunView: RunReceipt＋output_revision?,execution_error?,delivery_error?,reason?,repair_chain_id?,repair_attempt? | queued/running/completed/failed/cancelled 与 delivery_state 分开；真实流程不用 Demo 4秒进度 | Core 运行记录 | B | 成功后按 output_revision 查询结果；失败不增 revision；needs_replan 仍可 true | Frontend | P0 | [W3](#evidence-w3) [C2](#evidence-c2) [T2](#evidence-t2) |
| P-04 | 工艺决策 | ProcessPlanningPage 工序列表/来源；Core JSON | 工序数量/稳定 ID/顺序/名称/方案身份 | planning.getPlan(taskId,revision) | GET /planning/tasks/{task_id}/results/{revision} | task_id,revision>=1 | PlanProduced envelope；payload.part/blank/resources/operations/extensions；operations[].id/sequence/name | 校验 provider/schema_version；任意数量；按服务端 sequence；part.name 非上传文件名 | Core 该 revision | B | operations=[] 展空；动态 payload 校验失败显示契约错误，不填示例 | Frontend | P0 | [W3](#evidence-w3) [C2](#evidence-c2) [C7](#evidence-c7) [C3](#evidence-c3) |
| P-05 | 工艺决策 | OperationDetails 工步详情 | 加工内容、工步关联和说明 | planning.toSteps(plan) | 同 P-04 | 无额外请求 | operations[].steps[].id/sequence/content/attributes；参考 attributes.display_steps[] | content 可映射 VM name；display_steps 是参考展示结构，不能冒充规范 step 或 SDK 操作 | Core 规范计划＋标注的源参考 | C | 无工步显示缺失；Q2：来源展示步与规范步的映射、去重和 provenance 如何发布？ | Joint | P0 | [W3](#evidence-w3) [C7](#evidence-c7) [C8](#evidence-c8) |
| P-06 | 工艺决策 | ParameterFields；Core rough_step 修订输入 | 受控 rough_step 当前值、单位、来源、离散权限 | planning.toParameter(plan,opId,key) | 同 P-04 | 无额外请求 | attributes.parameters.rough_step；parameter_metadata.rough_step{name,unit,edit_policy,allowed_values,source}；extensions.parameter_rules[]；parameter_changes[] | 参考包已有 mm/[0.5,0.4]/replace；规则目标 ring-op-2；有规则且来源匹配才给编辑提示 | Core 模板规则与精确计划 | B | 缺 metadata/rule 默认只读；运行策略覆盖 attributes 后还需核对实际回包 | Frontend | P0 | [W3](#evidence-w3) [C4](#evidence-c4) [C8](#evidence-c8) [T3](#evidence-t3) |
| P-07 | 工艺决策 | ParameterFields 工序/工步参数与推荐值 | 全部参数 label/type/unit/source/nullable/范围/推荐-实际差异 | planning.toParameters(plan,descriptor)（建议） | 复用 P-04；完整版本化描述投影待确认 | 无额外命令；descriptor 绑定 template/profile digest（建议） | 已确认 source_parameters[] 与 parameters{}；其余 native 参数描述、推荐值身份没有通用 HTTP 定义 | 优先实际值＋权威描述；source_parameters 只展示历史参考，不覆盖实际值 | Core/版本化参数配置；FE 只翻译 label | C | Q3：rpm/feed/负值/直径径向含义、缺值、可编辑集合由哪份摘要约束的配置提供？ | Joint | P0 | [W3](#evidence-w3) [C4](#evidence-c4) [C8](#evidence-c8) [C9](#evidence-c9) |
| P-08 | 工艺决策 | OperationDetails 装夹定位/生产资源/说明 | 加工方法、机床、刀具、装夹、资源状态 | planning.toResources(plan) | 复用 P-04；目录映射待协商 | 无额外请求 | 参考 attributes.setup/notes/resources[]；执行 attributes.setup_id/tool/operation_type；payload.resources；ResourceSnapshot 内部 machine/tool | setup_id≠说明；tool.station/tool_number≠资源 ID；SDK operation_type 不直接当中文加工方法 | Core 执行计划/资源目录＋来源参考 | C | Q4：稳定 resource ID、显示名称/规格/可用性和加工方法映射的权威来源？禁止拼假 ID | Joint | P0 | [W3](#evidence-w3) [C7](#evidence-c7) [C8](#evidence-c8) [C10](#evidence-c10) |
| P-09 | 工艺决策 | 任务共用信息、缺项计数、参数待确认提示 | 展示任务/工序参考字段与缺项 | planning.toSupplementFields(plan) | 复用 P-04 | 无额外请求 | extensions.task_fields[]；attributes.onsite_fields[]；字段 id/name/value/unit/source/status/inputKind/editPolicy/requirement/description | 历史 demo_required/demo_input 仅参考；实际值缺失保留 null；Live 正式必填定义见 S-02 | 源参考文档，非实测真值 | B | 原生策略可能不保留 onsite_fields；缺失不能解释为无需现场确认 | Frontend | P1 | [W3](#evidence-w3) [C8](#evidence-c8) |
| P-10 | 工艺决策 | 提交参数修订 | 基于精确计划提交离散替换 | planning.patchParameters(task,patch) | POST /planning/tasks/{task_id}/replan | command_id,base_revision,expected_feedback_version,parameter_patch{template_digest,base_plan_digest,changes[{operation_id,parameter_id,value,unit}]} | RunReceipt→RunView→新 PlanProduced；parameter_changes 保存 old/new 等证据 | 不得提交完整 VM；不把 editable=true 当服务端授权 | Core 参数规则和规划锁 | B | changes 1..100 且目标唯一；语义错误可202后failed/5006；409回读；0.45不合法 | Frontend | P0 | [W2](#evidence-w2) [C2](#evidence-c2) [C4](#evidence-c4) [T3](#evidence-t3) |
| P-11 | 工艺决策 | 规划/卡片不可用诊断 | 读输出校验、修复、交付状态 | planning.getOutput(taskId,revision) | GET /outputs/tasks/{task_id}/results/{revision}；GET /outputs/tasks/{task_id}/latest | task_id,revision；latest 仅查询便利 | OutputStatusResponse: identity,schema_version,provider,profile_id?,profile_digest?,model_version?,status,report,repair_state,repair_reason?,repair_run_id?,publication_state,engineering_status? | 输出 ready≠NC；report.issues 按 path 展示，保留 total_count/truncated | Core 输出服务 | B | invalid/unavailable 与 HTTP 错误分开；latest 返回 revision 须核对 | Frontend | P0 | [C7](#evidence-c7) [C11](#evidence-c11) [T4](#evidence-t4) |
| P-12 | 工艺决策 | CoreWorkspace 工艺卡详情；r06 接入需求 | 完整卡片、审核摘要、缺项和来源 | cards.get(cardPath) | GET /process-cards/tasks/{task_key}/results/{revision} | task_key 为 id_ UTF-8 base64url 令牌，revision | ProcessCardResponse：identity,expected_feedback_version,basis_feedback_version,status,template_id/version/digest,report,publication_state,card?,review?,engineering_status? | card.header/operations/steps.details 展示；卡片模板版本与工艺模板版本分离 | Core 卡片投影 | B | 当前 Web 拼原 task_id 会失配；card=null 不批准；ready 不代表 execution_ready | Frontend | P0 | [W2](#evidence-w2) [C12](#evidence-c12) [T5](#evidence-t5) [H1](#evidence-h1) |
| P-13 | 工艺决策 | 批准当前工艺卡；未来驳回交互 | 精确修订人工审核 | cards.review(cardPath,command) | POST /process-cards/tasks/{task_key}/results/{revision}/review | command_id,decision=approve/reject,expected_feedback_version,comment?；X-Reviewer-ID | ReviewReceipt: task_id,result_id,revision,decision,archive_status,archive_id?,trace_id,request_id,reviewed_at | 批准后重新读取归档/资格；reject 必须非空意见；本地草稿阻断提交 | Core 审核 gate/归档 | B | 401身份声明缺失；409过期/未就绪；503写入失败可原命令恢复 | Frontend | P0 | [W2](#evidence-w2) [C12](#evidence-c12) [T5](#evidence-t5) |
| P-14 | 工艺决策 | 批准工艺来源/恢复 | 读取不可变批准材料 | cards.getArchive(planRef) | GET /archives/tasks/{task_id}/results/{result_id}/revisions/{revision} | 原 task_id,result_id,revision（不使用 task_key） | ArchiveBundle: archive_version,event,prepared,card,public_report,card_report,profile,template,feedback_snapshot,review,resolved_feedback_contracts,content_digest | content_digest→archive_digest；只读追溯，不把归档当当前内存草稿 | Core 文件归档 | B | 404未归档/不存在；同身份歧义冲突；摘要损坏明确错误 | Frontend | P0 | [C12](#evidence-c12) [C13](#evidence-c13) [T5](#evidence-t5) |

### 现场信息

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | 现场信息 | TaskMeasurements / ParameterFields / 补充工序信息 | 输入、任务共享、缺项定位、格式校验 | updateDraft(draftKey,value) | 无需 HTTP | scope id,section,parameter.id,string draft | Drafts；getPlanReadiness.missing/incompleteOperations/ready；contextRevision | task/operation/step 隔离；empty/finite number 只是格式；原值不变 | 浏览器会话 | F | readonly拒绝；500字符输入限制；更改使本地 Program review 失效，刷新丢失 | Frontend | P1 | [W3](#evidence-w3) [W4](#evidence-w4) |
| S-02 | 现场信息 | 现场信息未来正式保存/回读/更新（当前无服务器保存） | 测量、约束、必填性、单位、人员和验证状态 | feedback.saveSupplement(schema,data)（建议） | 可复用 POST/GET /planning/tasks/{task_id}/feedback；正式 supplement schema 待协商 | 已有 feedback_id,expected_feedback_version,base_revision,kind,supplement_schema_version,supplement；建议 scope/field_id/value/unit/source/actor/measured_at/validation_status，均未冻结 | 现有 FeedbackList 可回读 JSON/received_at/source/status；无结构化量测确认投影 | 人工录入→未验证声明；不能自动写成事实；更新/撤回需定义反馈生命周期 | Core ledger＋工程人员确认 | C | Q5：任务/工序归属、修改方式、必填清单、是否触发 revision/审核失效、真实录入身份？ | Joint | P1 | [W3](#evidence-w3) [C2](#evidence-c2) [C14](#evidence-c14) |
| S-03 | 现场信息 | Agent/工艺意见未来接线；现有 Core 人工反馈 | 新增并回读文本反馈 | feedback.add(...); feedback.list(...) | POST/GET /planning/tasks/{task_id}/feedback | POST feedback_id,base_revision,expected_feedback_version,kind,text? 或成对 supplement/schema；GET include_deleted=false | FeedbackReceipt；FeedbackList.feedback_version/items；item.source=1,request_id,received_at,status,digest 和原字段 | added≠applied；TemplatePlanner applied_feedback_ids=[]，活动反馈可能 needs_replan | Core 反馈账本 | B | 反馈不自动 replan；缺文本且无 supplement 拒绝；重复同ID相同内容幂等 | Frontend | P1 | [C2](#evidence-c2) [C14](#evidence-c14) [T2](#evidence-t2) |
| S-04 | 现场信息 | 未来撤回反馈操作 | 删除/回读已删除或 superseded 记录 | feedback.remove(taskId,feedbackId,command) | DELETE /planning/tasks/{task_id}/feedback/{feedback_id} | query command_id,expected_feedback_version；禁止 body | FeedbackReceipt.status=deleted/already_deleted,feedback_version；GET include_deleted=true | 墓碑保留；新补充新 feedback_id，不重写历史快照 | Core 反馈账本 | B | 409版本冲突；删除不取消运行也不自动产生新 revision | Frontend | P1 | [C2](#evidence-c2) [C14](#evidence-c14) [T2](#evidence-t2) |

### Agent

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-01 | Agent | AgentDrawer/AgentBubble | 发送 Demo、历史、上下文切换、未发送文本、拖动 | createDemoExchange(text,operationId,contextLabel) | 无需 HTTP | text.trim,operationId\|null,contextLabel | AgentMessage{id,role=user/demo,text,operationId,contextLabel} | 消息保留发送时上下文；programContext 含参考版本/本次未CAM；localStorage仅气泡坐标 | 浏览器 Demo | F | 无任务/空文本不发送；固定回复，不产生建议或业务修改 | Frontend | P1 | [W4](#evidence-w4) |
| A-02 | Agent | Agent 建议→预览→用户确认（尚未真实实现） | 建议绑定 task/op/plan revision/NC ref，展示执行结果 | agent.presentSuggestion / confirmIntent（建议） | 复用 feedback/replan 与 NC revise；无通用聊天/执行新路径 | 已有业务请求按各契约；suggestion_id/预期上下文/采纳结果结构待定 | 建议身份、适用基线、差异、accepted/applied/rejected 对应证据待定 | 不能将收到文本当已修改；用户确认后才提交适当既有命令 | Core 业务回执＋用户意图 | D | Q6：建议是否需要持久历史、采纳确认与操作权限？参数/NC建议如何关联已保存结果？ | Joint | P1 | [W4](#evidence-w4) [C14](#evidence-c14) [C15](#evidence-c15) |
| A-03 | Agent | 未来交互式 Agent 会话 | 会话、流式输出、历史和多工具上下文 | agent.send/readHistory（未冻结） | 无已确认公开 HTTP；不能把内部 Agent 插件当聊天服务 | 消息/会话 schema 待业务定义 | 会话消息/错误/引用/执行状态均待定 | 未来服务契约，不由当前 Demo 推断 | 未来Agent服务 | E | 尚未实现；当前保留 Demo，不能假设 SSE/WebSocket 已有 | Joint | P2 | [W4](#evidence-w4) [C15](#evidence-c15) |

### CAM

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | CAM | CoreWorkspace 可执行资格/运行按钮 | 当前批准工艺与执行配置匹配 | cam.approvedPlans(taskId) | GET /cam/tasks/{task_id}/approved-plans | 原 task_id | ApprovedPlanList.execution_configured,execution_profile_id?,plans[{plan_ref,trace_id,archived_at,profile_matches,engineering_status?}] | 选 task/current_revision 匹配且 profile_matches；未提交草稿/未决命令额外阻断 | Core 冻结配置/批准档案 | B | 空计划不等于报错；false说明阻塞，现有接口无逐项 eligibility reason code | Frontend | P0 | [W2](#evidence-w2) [C16](#evidence-c16) [C17](#evidence-c17) |
| C-02 | CAM | 运行 Mastercam / 未来原页面生成入口 | 显式启动 CAM | cam.start(command) | POST /cam/runs | command_id,plan_ref{task_id,result_id,revision,archive_digest},execution_profile_id,expected_current_revision（FE必须发） | 202 CamRunReceipt{command_id,context{cam_run_id,request_id,trace_id},kind,feedback_id?,base?} | 接受不是完成；锁定批准材料并查询 context.cam_run_id | Core 运行服务 | B | 旧批准409；新草稿未批准不能省略 expected_current_revision 走历史入口 | Frontend | P0 | [W2](#evidence-w2) [C16](#evidence-c16) [C17](#evidence-c17) [T6](#evidence-t6) |
| C-03 | CAM | 运行列表/刷新 CAM 状态 | 已保存运行、阶段、候选/失败、结果未知 | cam.listRuns(taskId); cam.getRun(runId) | GET /cam/tasks/{task_id}/runs；GET /cam/runs/{run_id} | task_id 或 run_id | CamRunList.runs；CamRunView 全字段，见字段表 | status与phase/observation分开；accepted/running/awaiting_confirmation仍占用；candidate可空 | Core 持久记录 | B | 空列表正常；failed不意味着没有历史候选；phase不是百分比 | Frontend | P0 | [W2](#evidence-w2) [C16](#evidence-c16) [T6](#evidence-t6) |
| C-04 | CAM | 未来阶段刷新 | 只观察活动运行阶段和健康 | cam.observe(runId) | POST /cam/runs/{run_id}/observe | 无 body | CamRunView: phase,observation{availability,observed_at,state?,executor_id?,active_run_id?},其他字段 | 按 allowed_actions；不可达 unavailable≠观测到 offline；不派发新加工 | Core 观测/记录 | B | 旧阶段不倒退，已结束运行不变；无可信进度不生成 ETA | Frontend | P0 | [C16](#evidence-c16) [T6](#evidence-t6) [H1](#evidence-h1) |
| C-05 | CAM | 核实执行结果 | 查询原执行并核对持久结果 | cam.reconcile(runId) | POST /cam/runs/{run_id}/reconcile | 无 body | CamRunView；可保持 awaiting_confirmation | 结果未知保留原 run，不以新 command 重发制造 | Core 原执行记录 | B | 按 allowed_actions；失败保留身份，前端不得自动 reset/closeout | Frontend | P0 | [W2](#evidence-w2) [C16](#evidence-c16) [T6](#evidence-t6) |
| C-06 | CAM | 未来取消/复位/控制回执；当前未接线 | 显式控制与原命令核对 | cam.cancel/reset/getControl/reconcileControl | POST /cam/runs/{run_id}/cancel；POST /cam/executor/reset；GET /cam/controls/{command_id}；POST /cam/controls/{command_id}/reconcile | cancel/reset {command_id}；查询path；控制reconcile无body | CamControlReceipt；CamControlView: command_id,action,cam_run_id?,executor_id?,admission_status/admission_observed_at,status/observed_at,allowed_actions | 接受和最终确认分开；reset目标由服务端配置，不由浏览器指定 | Core 控制记录/执行器 | B | submitted/unknown→202；confirmed/rejected→200；控制核对不核对整个运行 | Frontend | P1 | [C16](#evidence-c16) [T6](#evidence-t6) |
| C-07 | CAM | 未来人工收尾；当前无正式按钮 | 凭已确认控制证据结束未知运行 | cam.closeout(runId,command) | POST /cam/runs/{run_id}/closeout | command_id,reason（非空白）,evidence_command_id；X-Reviewer-ID | CamCloseoutReceipt: command_id,request_id,cam_run_id,status=closed,run_status,error,evidence_action/evidence_command_id,operator_id,identity_source | 仅 awaiting_confirmation；取消→cancelled，复位→failed；不改成succeeded/已批准 | Core 收尾门禁 | B | 旧/未确认控制证据409；必须确认操作者权限流程后接入 | Joint | P1 | [C16](#evidence-c16) [T6](#evidence-t6) |

### NC 审核

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N-01 | NC 审核 | 未来版本导航/来源；Core只读取当前候选 | 列表与精确版本、父链、仿真、历史审核 | nc.listVersions(runId); nc.get(ref) | GET /cam/runs/{run_id}/nc/versions；GET /cam/runs/{run_id}/nc/versions/{version} | run_id；version>=1 | NcVersionList.versions[{ref,parent?,origin,review_status,engineering_status?}]；NcVersionView 全字段 | 精确 ref与root_run_id分开；simulation_version为空或指真实仿真版本；未保存草稿不是列表项 | Core NC 文件库 | B | 404未知版本；历史批准不继承给新候选；is_current_candidate只表示链头 | Frontend | P1 | [W5](#evidence-w5) [C16](#evidence-c16) [C18](#evidence-c18) [T7](#evidence-t7) |
| N-02 | NC 审核 | CoreWorkspace 正文；ProgramEditor未来Live来源 | 按清单读取全部 NC 文件与编码/摘要 | nc.readFile(ref,fileId) | GET /cam/runs/{run_id}/nc/versions/{version}/file | query file_id；URLSearchParams编码，允许斜杠 | NcFileView: file_id,filename,setup_id,sequence,encoding,newline,sha256,size_bytes,text | 每文件独立保存来源；不拼接文件名到可保存正文；null不适用，读取失败为错误 | Core 原字节与解码投影 | B | 8304非法文本/编码；8305字节缺失/摘要错；未读完全部文件不开放前端审核 | Frontend | P0 | [W2](#evidence-w2) [W5](#evidence-w5) [C16](#evidence-c16) [T7](#evidence-t7) |
| N-03 | NC 审核 | ProgramEditor/ProgramDiff/恢复原文/暂存/撤销/展开 | 原文、当前/已暂存草稿、局部修订与diff | applyProgramChange/saveProgramDraft/restore | 无需 HTTP（本地状态）；持久保存另见 N-04 | documentId,taskKey,expectedRevision,text,actor,reason | ProgramDocument originalText/draftText/savedDraftText/revision/savedRevision/history/reviewInvalidated | 恢复文本也是新本地修订；与Core version分开；草稿diff不当服务端comparison | 浏览器会话 | F | 身份/本地修订冲突拒绝；刷新丢失；演示确认/导出不得转成Live批准/下载 | Frontend | P1 | [W5](#evidence-w5) |
| N-04 | NC 审核 | 暂存草稿的未来Live持久保存 | 整套版本中指定文件的人工作品保存 | nc.save(runId,command) | POST /cam/runs/{run_id}/nc/versions | SaveNcCommand{command_id,base:NcVersionRef,edits[{file_id,text,newline_mode=preserve/lf/crlf}]} | NcSaveReceipt{command_id,request_id,base,candidate} | base当前链头；candidate可等于base（无变化）；变更才形成human_edit，重新读取该候选 | Core NC 版本存储 | B | 409旧链头/活动修正；8304编码/换行/大小；只改现有file_id，不改编码/文件名/装夹 | Frontend | P1 | [W5](#evidence-w5) [C18](#evidence-c18) [T7](#evidence-t7) |
| N-05 | NC 审核 | 查看差异/历史比较 | 父版本比较与修正说明 | nc.comparison(ref) | GET /cam/runs/{run_id}/nc/versions/{version}/comparison | run_id,version | NcComparisonView{nc_ref,parent?,explanation?,diff} | 服务端差异保留来源；任意两个版本对比可双GET后本地diff，不冒充专门API | Core 保存的版本/比较 | B | parent=null显示初版；无解释不编造；读取失败保持error而非空diff | Frontend | P1 | [W5](#evidence-w5) [C16](#evidence-c16) [T7](#evidence-t7) |
| N-06 | NC 审核 | Agent 程序修正未来接线 | 精确已保存版本的提示修正 | nc.revise(ref,prompt,commandId) | POST /cam/runs/{run_id}/nc/versions/{version}/revise | ReviseNcCommand{command_id,base,prompt非空白}；path和base身份一致 | 202 CamRunReceipt；再查新run、候选、comparison；outcome=candidate/needs_plan_change\|null | nc_edit/cam_rerun领域模式通过产物来源/仿真关联表现；needs_plan_change不自动修改工艺 | Core revise/模型与受控执行器 | B | 8307模型未配置；8302旧链头/活动运行；8204上下文预算；未知响应保留原command | Frontend | P1 | [C15](#evidence-c15) [C16](#evidence-c16) [C18](#evidence-c18) [T7](#evidence-t7) |
| N-07 | NC 审核 | 批准当前NC；正式驳回待接线 | 整套精确NC版本人工审核及回读 | nc.review(ref,command) | POST /cam/runs/{run_id}/nc/versions/{version}/review | command_id,nc_ref,decision=approve/reject,comment?；X-Reviewer-ID | NcReviewReceipt{command_id,request_id,identity_source=declared,review{nc_ref,decision,reviewer_id,reviewed_at,comment?}}；版本GET reviews含request_id | 只审核保存版本；reject非空意见；后一次决定生效但历史保留 | Core 审核记录 | B | 401身份；409链占用/版本冲突；全部文件完整性在服务器再验；普通reject不revise | Frontend | P0 | [W2](#evidence-w2) [C16](#evidence-c16) [C18](#evidence-c18) [T7](#evidence-t7) |
| N-08 | NC 审核 | 下载批准版本；与本地下载草稿隔离 | 下载精确已批准 ZIP 与来源/摘要 | nc.download(ref) | GET /cam/runs/{run_id}/nc/versions/{version}/download | run_id,version；不查找latest approved替换 | application/zip；Content-Disposition,X-Content-SHA256,可选X-Engineering-Status；原文件和审核manifest | 校验ZIP摘要，保留精确版本与pending标记；不重编码成浏览器草稿 | Core 请求时最新审核与原字节 | B | 8303未批准/后来驳回；8302导出期间审核变化；8305损坏；历史批准版本可下载不代表授权新工艺 | Frontend | P0 | [W2](#evidence-w2) [C16](#evidence-c16) [C18](#evidence-c18) [T7](#evidence-t7) |

### 参考案例

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | 参考案例 | PlanningSourceSelector | 参考案例列表/版本/标签 | CaseCatalogReader.listCases() | 静态 case-catalog/index.json；不是Core HTTP | 无参数 | CaseSummary{caseId,name,description,partType,sourceCategory,tags,versions[{version,path,contentDigest}]} | 选择身份不生成Planning Task；静态JSON也是契约数据源 | 版本化参考仓库 | A | 15s超时/Schema错误/索引缺失明确报错，空列表不填默认 | Frontend | P1 | [W6](#evidence-w6) |
| R-02 | 参考案例 | 显式加载案例/重试/ProcessPlan Adapter | 指定案例版本全量数据、程序引用/证据 | CaseCatalogReader.getCaseVersion(caseId,version) | index中已验证path指向的静态JSON | caseId,version；不接受任意路径 | CaseDocument{schemaVersion,case,caseVersion,contentDigest,processPlan,programAssets,verificationEvidence} | caseToProcessPlan保留caseReference；onsiteFields→onsiteMeasurements；taskFields→taskMeasurements；demo_input→editable仅Demo | 版本化参考仓库 | A | 摘要/引用/Schema失败拒绝；不修改v2，不当实时模板目录 | Frontend | P1 | [W6](#evidence-w6) |
| R-03 | 参考案例 | ProgramReviewPage 历史正文加载/重试 | 私有历史NC原字节校验与解码 | ProgramContentReader.read(document,asset,signal) | 开发专用 <BASE_URL>__local_reference/golden-b7；不是Core公开API | 已校验CaseDocument/ProgramAsset；AbortSignal；专用请求头 | ProgramContent{text,source,sourceDigest,sizeBytes,format{encoding,bom,newline}} | 校验asset.caseId/caseVersion/planId与大小SHA；metadata_only不等于已含正文 | 本机冻结字节＋Case元数据 | A | 生产模式unavailable；不匹配409/Reader拒绝；demo_fixture禁止确认/导出 | Frontend | P1 | [W5](#evidence-w5) [W6](#evidence-w6) |
| R-04 | 参考案例 | 参考案例与真实模板的未来关联展示 | 经验证版本/摘要/工序映射 | catalog.resolveVerifiedTemplateMapping(...)（建议） | 待协商；无新URL | caseId/version/contentDigest与template id/version/digest（建议） | 现有导入器source raw_sha256/declared_content_digest/source_schema_version/case_version/core_version；正式映射记录/验证者待定 | 原始文件摘要与语义contentDigest分开；新钻孔工序不强配旧案例 | Joint版本发布与工程验证 | D | Q7：谁批准映射、如何失效/更新、是否仅展示？不得由名称相同自动认定 | Joint | P1 | [W6](#evidence-w6) [C8](#evidence-c8) |

### 数据底座

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | 数据底座 | FoundationKpis（5项） | 概览与统计日 | DataFoundationReader.getOverview(query?) | MockDataFoundationReader；Core无同名HTTP | OverviewQuery.date?,timeZone? | FoundationOverview{date,totalAssets,addedToday,knowledgeCount,businessDataCount,modelCount,modelInvocationsToday}＋FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?} | 显示前5个数量字段；modelInvocationsToday契约保留但不显示卡片；totalAssets不含模型 | 当前合成快照；未来真实源 | A | 非法日期/未来日期invalid_query；错误不显示全0；5卡不是6卡 | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-02 | 数据底座 | FoundationGrowthChart | 近7天知识/业务新增 | DataFoundationReader.getGrowthTrend(query) | Mock Reader；无Core端点 | days?1..366,endDate?,timeZone?；页面days=7 | GrowthTrend{startDate,endDate,points[{date,knowledgeAdded,businessDataAdded}]}＋FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?} | 原日期/零值保留；FE只算坐标，不改统计 | 当前合成快照 | A | 零数据正常；loading/error独立；自然日与timeZone一致 | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-03 | 数据底座 | FoundationKnowledgeChart | 互斥知识分类/数量/百分比 | DataFoundationReader.getKnowledgeDistribution() | Mock Reader；无Core端点 | 无 | KnowledgeDistribution{total,categories[{category,count,percentage}]}＋FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?} | industry/institute/experience；百分比分配来自Reader，不在UI重算；institute非真实单位证明 | 当前合成快照 | A | 空集total=0/比例0；来源错误不能隐去标记 | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-04 | 数据底座 | FoundationModelPanel / FoundationResourcePanel | 四类业务资源汇总、模型类型和接入状态 | DataFoundationReader.getResourceSummary() | Mock Reader；无Core端点 | 无；两个面板共享一次读取 | ResourceSummary{businessDataCount,businessResources[{kind,count}],models{total,byType[{modelType,count}],byIntegrationStatus[{integrationStatus,count}]}}＋FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?} | 六类目录；资源柱只有4类业务；模型登记/available声明不等于实测服务在线 | 当前合成目录 | A | 共享查询失败影响两面板；模型total=0显示空；不猜部署状态 | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-05 | 数据底座 | FoundationHotKnowledge | 热点知识、排名/引用数/窗口、点击详情 | DataFoundationReader.getHotAssets(query) | Mock Reader；无Core端点 | days?,endDate?,timeZone?,limit?1..100；页面7天/5条 | HotAsset[]{kind=knowledge,id,title,referenceCount,rank}＋FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?} | 以事件聚合非点击次数；相同数量按稳定ID；无事件不入榜 | 当前合成usageEvents | A | 空窗口显示无引用；模拟引用不得称真实调用 | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-06 | 数据底座 | FoundationAssetBrowser 搜索/类别/分页 | 资源目录、总量、稳定排序 | DataFoundationReader.listAssets(query) | Mock Reader；无Core端点 | kind?,keyword?≤200,sortBy?name/createdAt/id,sortDirection?asc/desc,page?≥1≤1000000,pageSize?1..100；页面10条/name/asc | AssetPage{items[{id,kind,name,createdAt,provenance}],total,page,pageSize}＋FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?} | 提交搜索归第一页；NFKC/trim/lower在Reader；查询变更隐藏旧响应 | 当前合成目录 | A | 空列表≠错误；total和权限过滤须同源；跨页不复用旧选中 | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-07 | 数据底座 | FoundationAssetDetail / 关联按钮 | 六类只读详情、关联回读 | DataFoundationReader.getAssetDetail(kind,id) | Mock Reader；无Core端点 | kind=part/process_plan/machine/tool/knowledge/model；id正则已定义 | AssetDetail\|null 与FoundationResponse.meta{schemaVersion,datasetVersion,dataMode,asOf,timeZone,window?}；详细字段见§3.3 | kind鉴别联合；知识title、其他name；关联(kind,id)不解释为制造兼容性 | 当前合成目录 | A | null=不存在/不可见；optional规格显示未提供；无编辑API | Frontend | P1 | [W7](#evidence-w7) [W8](#evidence-w8) |
| F-08 | 数据底座 | 未来HttpDataFoundationReader | 真实目录/统计/使用事件/模型部署状态 | 实现既有七个Reader方法 | 待协商；Core只有内部machine/tool资源快照，无完整公开目录 | 既有Reader查询可复用；权限/快照token/事件采集规则待定 | 真实资源和事件到FoundationResponse；ResourceSnapshot{id,kind,schema_version,revision?,fetched_at,attributes}仅可作为部分来源 | 不能由CAM历史推算全部KPI；模型配置≠部署可用，事件必须有真实来源/唯一ID | 未来真实资源系统/事件源 | D | Q8：数据所有者、统计时区、权限过滤、快照一致性、迟到/重复事件和模型状态权威？ | Joint | P2 | [W7](#evidence-w7) [C10](#evidence-c10) |
| F-09 | 数据底座 | 数据底座模态目录/详情/图表键盘状态 | 筛选输入、选中详情、关闭、焦点/图表hover、重试 | useFoundationQuery/retry + local state | 无新增HTTP；重试调用原Reader | selected{kind,id},browse,search,query,attempt | loading/success/error；过期响应丢弃 | 纯交互不当资源变更；跨页面保留工作台草稿 | 浏览器 | F | 失败不退回Mock；关闭不触发业务提交 | Frontend | P1 | [W8](#evidence-w8) |

### 全局

| Contract ID | UI Module | UI Consumer | Frontend Data / Action | Proposed FE Method | Core Endpoint / 数据源 | Request Fields | Response Fields | DTO → ViewModel | Source of Truth | Current Status | Error / State / 待确认 | Owner | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | 全局 | App / WorkflowNavigation / WorkflowWorkspace | 页面切换、工序选择、Agent展开、专注编辑 | navigate/selectOperation/setView | 无需HTTP | stage=input/planning/review；view=workflow/foundation；selectedId,detailView | UI状态；选择fallback到合法工序或空 | 导航不是业务完成；scope/task隔离 | 浏览器 | F | 换来源清理旧会话；取消选择不清理；不新增路由框架 | Frontend | P0 | [W9](#evidence-w9) [W3](#evidence-w3) [W4](#evidence-w4) [W5](#evidence-w5) |
| G-02 | 全局 | App live开关 / 来源标识 | Mock / Reference / Live隔离 | setMode/resetScope（接入规则） | 无需独立HTTP；Live调用既有契约 | mode与业务ID命名空间 | 原始来源、参考版本、工程状态与本地草稿标记 | 当前live条件挂载CoreWorkspace；切回会卸载；不得声称已有持久共享TaskContext | 浏览器控制模式；Core掌握Live事实 | F | Live错误不回退演示；返回数据底座不丢Demo，但Live需002补恢复 | Frontend | P0 | [W9](#evidence-w9) [W2](#evidence-w2) |
| G-03 | 全局 | 恢复任务ID / 刷新页面 / 多页面共享 | 按已知身份恢复、服务重启的能力边界 | workflow.restore(locator)（建议） | 复用 task/run/card/archive/CAM/NC/CAD GET；无完整任务列表/恢复端点 | 可保留task_id,asset_id,parse_command_id,planning run_id,cam_run_id,nc_ref,未决command/body定位 | 已有各域状态；缺完整持久task/feedback/draft；TaskView无active_run_id/needs_replan | 先区分内存404和持久档案；不能重建旧草稿或省略current revision门禁 | Core各域记录；FE只存定位/意图 | C | Q9：P0接受进程内规划边界吗？刷新时活动run发现/服务重启代际如何确认？ | Joint | P0 | [W2](#evidence-w2) [C2](#evidence-c2) [C12](#evidence-c12) [C16](#evidence-c16) |
| G-04 | 全局 | 所有读取/提交的错误区与字段提示 | 统一错误、追踪与结果未知 | CoreClient→ConsumerError Adapter | 所有Core端点 | 可选X-Request-ID/X-Trace-ID；业务command独立 | ApiErrorResponse{error{code,message},request_id,trace_id,issues[]}；CAM可选stage/reset_required/file_id | 保留HTTP status/业务码/追踪；统一loading/empty/error/unavailable/unknown_outcome | Core错误体＋传输层事实 | B | 当前CoreHttpError只有status/detail字符串需适配；不暴露原始内部异常 | Frontend | P0 | [W2](#evidence-w2) [C19](#evidence-c19) |
| G-05 | 全局 | 连接性/执行器可用性（后续接线） | HTTP存活与执行器观察 | core.health(); cam.executor() | GET /health；GET /cam/executor | 无 | HealthStatus；ExecutorView{executor_id?,availability,observed_at?,state?,active_run_id?,error?,reset_required} | HTTP健康≠NX可用≠Mastercam就绪；不可达不等于offline | Core/执行器观察 | B | 8307未配置；503明确unavailable；无自动制造探针 | Frontend | P0 | [C16](#evidence-c16) [C19](#evidence-c19) |
| G-06 | 全局 | 跨页面刷新通知/工艺卡路径 | 按topic/resource读最新快照 | workflow.snapshots(taskId) | GET /frontend/tasks/{task_id}/snapshots | 原task_id | TaskSnapshots{task_id,trace_id,items[{topic,resource_id,version,payload,context,sequence}]} | 只通知；process_card.status payload.card_path是编码路径；NC正文/最新审核仍GET | Core内存通知；各域GET权威 | B | 404/3101可能只是未发布；重启清空；不当历史日志/SSE | Frontend | P1 | [C19](#evidence-c19) [C12](#evidence-c12) |
| G-07 | 全局 | 审核人输入、制造/下载权限 | 声明身份与真正认证/任务授权 | identity/review policy（待确认） | 现有X-Reviewer-ID；无已确认登录/授权HTTP | 审核头1..64 ASCII字母数字_-；正式认证方案待定 | 工艺review.authenticated=false；NC/closeout.identity_source=declared；allowed_actions非完整身份权限 | 不能凭审核文本框授予制造权限 | Core部署/身份系统＋维护者 | D | Q10：受控演示参与人/网络边界？正式认证、任务权限、审核角色和下载授权何时交付？ | Joint | P0 | [C12](#evidence-c12) [C16](#evidence-c16) [C19](#evidence-c19) |
| G-08 | 全局 | OpenAPI类型/错误/下载Adapter | 补齐机器可读Schema与运行语义差异 | DTO generation + runtime validation（建议） | 复用现有端点，修订OpenAPI描述；不新增路径 | 现有请求字段不改；review头/无体命令/路径语义需描述 | 静态download误示application/json；cancel/reset仅202 schema而运行可200；parse错误模型/动态payload细节不完整 | 以源码与OpenAPI差异显式补充，不生成错误下载客户端；领域validator不能只靠JSON schema | Core发布契约 | C | Q11：补媒体类型/headers/200/error及task_key说明，动态payload采用何版本Schema供FE验证？ | Backend | P0 | [C1](#evidence-c1) [C16](#evidence-c16) [C19](#evidence-c19) |
| G-09 | 全局 | 全部长时命令/重试 | 幂等命令登记、禁止未知结果重复制造 | commandStore + domain recovery（建议FE服务） | 复用各域原命令与GET，无新command状态总入口 | 原command_id/feedback_id及原body、业务locator；request_id每请求独立 | 已有域回执及持久状态；不伪造统一receipt DTO | 区分协议4xx拒绝和网络/代理/不确定5xx；保留原键，不改expected版本重放 | Core幂等账本；FE未决意图 | B | 现有pending Map不覆盖上传/刷新；已知run优先GET；未知回执仅按原命令恢复 | Frontend | P0 | [W2](#evidence-w2) [C2](#evidence-c2) [C16](#evidence-c16) [C18](#evidence-c18) |

共 **65** 项：A 10、B 35、C 7、D 4、E 2、F 7。分类以能力为单位，不是按HTTP端点计数。

## 3. 展示字段、空值与写入边界

下表穷举当前核心展示类型的字段；字段路径是相对于本行指定对象的路径。TypeScript `?` 是可省略，不等于允许 `null`；显式 `null` 只在类型允许时使用。所有 Live 来源缺失都显示“未提供/不可用”，禁止补 Mock 值。表中“拟映射”表示 Adapter 尚未实施；既有案例 Adapter 则是当前实现。

### 3.1 工艺、参数和输入（I / P / S）

证据：[W1](#evidence-w1)、[W3](#evidence-w3)、[C7](#evidence-c7)、[C8](#evidence-c8)、[C4](#evidence-c4)。Core 动态 payload 路径仅适用于已校验的 template profile。

| 当前 FE 字段 | 已确认来源 / 拟映射及缺口 | 空值、单位、身份和编辑规则 |
| --- | --- | --- |
| `ProcessPlan.id` | Reference Adapter生成 `JSON.stringify(['case',case.id,caseVersion.version,contentDigest])`，原processPlan.id保存在caseReference.planId；Live需附带PlanProduced identity | 必需 string；浏览器显示对象 ID 与 task_id/result_id/revision 分开 |
| `name, partName` | Reference 同名；Live `payload.part.name` 可提供零件名；完整方案标题无统一同名 DTO，需展示规则 | 必需 string；不得以 File.name 冒充解析零件名；标题可用明确的展示标签 |
| `origin, sourceDescription, caseReference?` | 当前 origin 只允许 mock；caseReference={caseId,version,planId,contentDigest}；Live provider/schema_version 和 source 摘要需另接 | 来源必需且只读；不得强转 mock 为 Live；caseReference 可省略 |
| `operations, initialOperationId?` | `payload.operations`；初始选择是 FE 合法 ID 或首项 | 数量动态；空数组显示空，不生成六/七项占位业务数据；初始选择不需 API |
| `taskMeasurements?` | Case `taskFields`；参考 payload `extensions.task_fields`；正式测量语义 S-02 | 可省略数组；未发布字段≠无需测量；草稿为本地 |
| `ProcessOperation.id, sequence, name` | `payload.operations[].id/sequence/name` | 必需；ID 不随排序变化；sequence 无单位、只读；不以 index+1 覆盖 |
| `ProcessOperation.source` | Case Adapter原样保留 `CaseOperation.source`；Live结合envelope provider、源摘要及工程状态，尚无通用operation.source | 必需展示说明；不得把integration_pending译为已验证 |
| `setup?, notes?` | 参考 `operations[].attributes.setup/notes`；Live native `setup_id` 不是 setup 文本 | 可省略 string、只读；缺装夹说明明确未提供，不猜夹持方式 |
| `steps` | 规范 `operations[].steps`；参考 `attributes.display_steps` 另有结构，Q2决定映射 | 必需数组；为空提示缺工步；展示步不新增可执行 SDK 操作 |
| `parameters` | 参考 `attributes.source_parameters`；实际 `attributes.parameters` 配元数据/规则 | 必需数组；缺字段保留缺失；范围/来源不足默认只读，Q3 |
| `resources` | 参考 `attributes.resources`；native tool/setup/资源快照需 Q4 映射 | 必需数组；缺失不伪造设备/刀具；不把空数组当无需资源 |
| `onsiteMeasurements` | Case `onsiteFields`；参考 `attributes.onsite_fields` | 必需数组；Live 正式字段/回写由 S-02定义 |
| `ProcessStep.id, sequence, name, description?` | Case 同名；规范 `steps[].id/sequence/content`，content 拟映射 name；description 无统一顶层字段 | ID和sequence只读；description 可省略，禁止从名称编造加工说明 |
| `ProcessStep.parameters` | Case 步内 parameters；规范 step.attributes 自由对象，尚无全参数描述约定 | 必需数组；与工序参数分 scope；不能把工序全部参数复制到每步 |
| `Parameter.id, name` | 参考字段同名；rough_step 用参数 key 与 metadata.name | ID 在所属 task/op/step 内稳定；显示名可翻译，身份不可翻译 |
| `Parameter.value` | `attributes.parameters[key]` 为当前值；source_parameters.value 为历史参考值 | 必需 `string/number/null`；0 与 null 不同；不得回退历史值填空；推荐值未有统一字段 |
| `Parameter.unit?` | 参考 unit；rough_step metadata.unit/rule.unit；native 其他参数需描述配置 | 可省略 string；缺单位不按名字推断；mm/r 与 mm/min、直径/径向语义必须区分 |
| `Parameter.source` | 参考 historical_record/template/upstream/human/unknown；Mock 可 mock；Live source 是有摘要/指针的对象，应保留原 provenance 再映射显示标签 | 必需枚举；Core `kind` 不一定直接属于 FE 枚举，未知来源映射 unknown，不能丢原值 |
| `Parameter.status` | 参考 provided/missing/pending；Live 根据已定义缺值和验证语义映射 | 必需；有数值不等于已验证；pending 不自动改 provided |
| `Parameter.editable` | 当前 Case editPolicy demo_input；Live metadata.edit_policy/rules 只决定输入提示 | 必需 boolean；不能授权后端写入；未知规则 false，提交仍过 Core gate |
| `Parameter.required?, description?, inputKind` | 参考 requirement demo_required、description、inputKind；Live typed rule/描述配置需覆盖 | required/description 可省略；inputKind 必需 number/text；number 先验有限数，再按服务器离散集合/范围验证 |
| `ProductionResource.id/name/kind/description?/status` | Reference resources 同名；kind tool/machine/other，status demo/pending；Live 资源引用/可用性 Q4 | description 可省略；其他必需。现有status不能表示真实设备在线，不能硬填demo；不得用station当ID |
| `Drafts[draftKey]` | JSON.stringify([scopeId,section,parameterId])→string；scopeId 为 plan/op，step 用 section 区分 | 本地可编辑；空白=待补，非有限数=格式错；500字符输入上限不是制造校验；不改变原 value |
| `getPlanReadiness.missing/incompleteOperations/ready` | FE 扫描 required、空步和数组 | 演示按钮门槛，不等于解析、批准或 CAM 准入；Live 仍需业务门禁 |
| `File.name/size/extension, sourceVersion` | 本地选择；CadAsset.filename/size_bytes/sha256 独立回执 | size 为byte；显示换算不改变原值；本地文件无服务端 ID；有效替换递增 sourceVersion |
| `解析状态/报告摘要/输入状态` | CadParseResult.status/source_sha256/report_sha256/nx_report/analysis | report等允许null，详见§4；不提供百分比；上传not_parsed、解析parsed、制造execution_ready必须分别显示 |

`NormalizedPlan.part/blank/resources/extensions` 和 `NormalizedOperation/Step.attributes` 是可扩展结构，不能把任意键都视作允许编辑参数。参数命令请求只提交 `operation_id/parameter_id/value/unit` 和模板/计划摘要、版本基准，不回传整个 VM。rough_step 只有 0.5 和 0.4 mm 两个已发布值；0.45、错误单位、陌生 key、重复目标、过期摘要均不合法。合法格式也可能在异步 run 中因 profile/工程准入失败。

### 3.2 案例、历史程序、Agent 和审核草稿（R / A / N）

证据：[W4](#evidence-w4)、[W5](#evidence-w5)、[W6](#evidence-w6)。以下是现有前端契约；Core 对照能力见 N 系列和§4，不能把这些类型直接发布为 HTTP DTO。

| 对象 / 字段 | 数据源与用途 | 可空性、来源和编辑边界 |
| --- | --- | --- |
| CaseSummary.caseId/name/description/partType/sourceCategory/tags/versions | index.json；versions[].version/path/contentDigest | 必需；sourceCategory=engineering_reference；稳定caseId+version+digest，标签非适用性认证 |
| CaseDocument.schemaVersion/case/caseVersion/contentDigest | 版本JSON；case.id/name/description/partType/sourceCategory/tags；caseVersion.caseId/version | schemaVersion=1.0或1.1；摘要/引用先校验再交给页面；只读 |
| CaseDocument.processPlan.id/name/partName/sourceDescription/operations/taskFields/initialOperationId? | 原始参考工艺；caseToProcessPlan Adapter | initialOperationId 可省略；operations 下 onsiteFields→onsiteMeasurements，taskFields→taskMeasurements |
| CaseField.id/name/value/unit?/source/status/inputKind/editPolicy/requirement/description? | 版本化参考字段 | value显式可null；editPolicy=read_only/demo_input；requirement=optional/demo_required；unit枚举 mm/μm/m/min/mm/r/r/min/mm/min/deg/%；只允许演示编辑 |
| ProgramAsset.id/kind/source/sha256?/sizeBytes?/availability/boundary/caseId/caseVersion/planId | 参考NC元数据；kind=nc | sha/size可省略不代表已校验；availability=metadata_only/unavailable；来源和边界文本必须保留 |
| VerificationEvidence.id/programAssetIds/subject/method/result/conditions/sources/limitations/caseId/caseVersion/planId | 历史验证证据 | result=passed_with_limits/failed/not_performed；只读。通过有条件，不能转换为当前任务审核记录 |
| ProgramContent.text/source/sourceDigest/sizeBytes/format | ProgramContentReader 原字节校验后解码；format含encoding/bom/newline | 具体联合约束见reader.ts；byte摘要不是重新编码text摘要；当前仅开发私有历史源可读 |
| ProgramDocument.id/taskKey/sourceAssetId/caseId/caseVersion/caseContentDigest/planId | programDocument.ts；id为浏览器UUID，其余ProgramIdentity继承 | 必需string，稳定关联当前文档/来源；不当作Core task/run/version身份 |
| ProgramDocument.originalText/draftText/savedDraftText/revision/savedRevision | 创建时三份文本相同、revision=1、savedRevision=0 | 必需；本地revision不是NC version；原文不可直接改，草稿可改，暂存不上传；有变化的恢复原文递增本地修订 |
| ProgramDocument.lastModifiedBy?/history/review?/reviewInvalidated | lastModifiedBy=human/agent；history[]{revision,actor,reason}；review{revision,contextRevision,taskKey,documentId}；reviewInvalidated必需boolean | lastModifiedBy/review可省略；修改清review；ProgramContent的source/sourceDigest/sizeBytes/format也继承，不能丢来源 |
| 程序工具栏：撤销、重做、恢复、暂存、差异、全文、演示确认、草稿导出 | 编辑器状态与ProgramDocument规则 | 禁止读取失败时替换占位正文；演示确认/导出不能成为Live审核/精确下载；不需要每按钮一个HTTP |
| AgentMessage.id/role/text/operationId/contextLabel | createDemoExchange；role=user/demo，发送时冻结上下文 | operationId可null；本地消息不可冒充Core建议回执；未发送文本/抽屉/气泡位置是F |
| 将来建议身份/版本/差异/采纳结果 | A-02建议，尚未发布schema | 不虚构 suggestion_id 已存在；NC revise已有能力单独接线N-06，聊天留E |

Live NC 只以 `NcVersionRef` 定位保存版本；文件清单 `NcFileSummary` 与 `NcFileView` 的编码/摘要/size必须保留。编辑文件用已有file_id，不用显示文件名当身份。Core review针对一套精确版本，前端要显示所有文件读取状态；未保存草稿需先保存并重新选择回执candidate。比较视图允许parent=null（初版），不能显示伪造“零差异”掩盖加载错误。历史版仍可有批准和下载资格，但新候选从未审核开始；实际仿真版本用simulation_version，不把手工改后的候选视作已仿真。

### 3.3 数据底座全部详情字段（F）

证据：[W7](#evidence-w7)、[W8](#evidence-w8)。以下均来自 `src/api/data-foundation/types.ts` 的真实契约，并经 Reader/Schema 校验；**没有对应的已确认 Core 六类资产 HTTP 服务**。页面只读，任何模型/设备“状态”都须保留 `provenance.dataMode`。

| 对象 | 必需字段 / 嵌套字段 | 可省略字段、单位、来源及关联 |
| --- | --- | --- |
| ResourceBase（六类共用） | id,createdAt,provenance{dataMode,source} | 无可省略；id稳定；createdAt为时间；dataMode synthetic_demo/live；没有编辑操作 |
| Part | name,category,material,features[],description | category shaft/ring/disc/plate/housing；features是字符串描述不是CAD拓扑ID；material文本不等于已验证材料证书 |
| ProcessPlan（目录类型） | name,partId,version,manufacturingType,operations[] | manufacturingType turning/milling/drilling/turn_mill/mixed；version是目录版本字符串，不是Core任务revision |
| 目录Operation | id,sequence,name,method,toolIds[],knowledgeIds[] | machineId?；method turning/milling/drilling/boring/parting；关联(kind,id)回读，不暗示可制造 |
| Machine | name,machineType,capabilities,supportedOperations[] | manufacturer?；capabilities.axisCount?、maxSpindleSpeed?{value,unit=r/min}、workEnvelope?{x,y,z,unit=mm}；缺规格显示未提供，不填0 |
| Tool | name,toolType,specification{description},supportedOperations[],compatibleMachineTypes[] | specification.diameter?{value,unit=mm},cuttingEdgeCount?；设备兼容类别只为目录信息，非当前CAM适配结论 |
| Knowledge | title,content,topic,knowledgeCategory,applicability{operations[],partCategories[],materials[]},relatedAssets[{kind,id}] | 全文只读；knowledgeCategory industry/institute/experience；topic process_rules/material/tool_selection/fixturing/parameters/quality；来源分类不等于认证 |
| Model | name,modelType,supportedTasks[],integrationStatus | version?；integrationStatus not_connected/configured/available/unavailable；登记/配置/可用声明不等于实际模型部署检测 |
| UsageEvent公共 | id,occurredAt,provenance,type | scenario?；事件稳定ID；不是资产，也不计入totalAssets |
| knowledge_referenced事件 | knowledgeId | 当前为合成引用事件；需真实唯一事件及来源才可报真实引用 |
| model_invoked事件 | modelId | task?；实际调用统计不能根据Model登记数推断 |
| FoundationResponse.meta | schemaVersion=1.0,datasetVersion,dataMode,asOf,timeZone | window?{startDate,endDate}；页面显示合成标签及asOf，时间窗口不由浏览器本地时区偷偷替换 |
| FoundationDataset | schemaVersion,datasetVersion,dataMode,asOf,timeZone,parts,processPlans,machines,tools,knowledge,models,usageEvents | 当前seed为foundation-turning-mock-v2；24零件/32方案/3机床/40刀具/72知识/6模型；模型全部not_connected |

Reader 七方法、请求字段、响应聚合字段和 UI 位置已逐项列于 F-01—07。关键统计口径：businessDataCount=四类业务资产99，knowledgeCount=72，totalAssets=171（不含模型和事件），六类目录合计177；modelCount=6另计。实际五张 KPI 是totalAssets、addedToday、knowledgeCount、businessDataCount、modelCount。modelInvocationsToday保留在契约但不渲染第六张卡。

查询默认：概览日期/时区以dataset.asOf/timeZone解析；趋势默认7天，days范围1..366；热点默认limit5，范围1..100；列表默认page1/pageSize20/createdAt降序，页面显式使用pageSize10/name升序。keyword上限200字符、NFKC/trim/lower归一；page最大1000000、pageSize最大100；详情id匹配 `^[a-z0-9][a-z0-9._:-]{0,159}$`。非法日期/未来日、非法参数为invalid_query；详情null=不存在或不可见；空数组/0是有效数据，加载失败不能以0兜底。热点、分布、增长使用Reader返回口径，不由页面重复统计。

### 3.4 OpenAPI未覆盖的源码字段

以下只标为Pydantic/实现源码确认，**不在本次OpenAPI components中**，不能声称生成客户端已涵盖。

| 类型 / 字段 | 精确类型与约束 | 证据与消费规则 |
| --- | --- | --- |
| CamErrorResponse | 继承ApiErrorResponse；stage: string或null，reset_required: boolean或null，file_id: string或null；三者均可省略，默认null | [C16](#evidence-c16)对应contracts/frontend/cam.py；保留受控诊断和文件身份；Q11要求补机器可读错误响应 |
| ParameterRule.path/value_type | path为JsonPointer；value_type为number/integer/string/boolean，均必需 | [C4](#evidence-c4)对应contracts/algorithm/templates.py；来自模板规则，按profile校验 |
| ParameterRule.allowed_values/edit_policy | allowed_values可空数组，非空时至少1项；edit_policy可空read_only/replace，默认null | allowed_values不是建议值；replace要求identity/unit/allowed_values齐备 |
| ParameterRule.operation_id/parameter_id | 两者string或null，默认null；非空字符串，必须成对 | 稳定目标，不用pointer数组下标做身份 |
| ParameterRule.minimum/maximum/unit | minimum/maximum为int/float或null；unit非空string或null；均默认null | 仅数值类型可有单位/上下界；minimum≤maximum；allowed_values须符合类型和边界；不存在即不编造范围 |

### 3.5 跨域错误、并发和恢复验收

§4给出字段结构；下列是不能靠类型生成解决的语义。HTTP 4xx明确拒绝与网络断线/超时/不确定5xx分开。代理错误可能发生在服务端已执行之后，保留原command/body；先按已知身份GET，必要时按该域原键恢复，不能换键重发制造动作。`request_id/trace_id`用于追踪，不能代替command_id。

| 域 | 已有约束 / 主要错误证据 | 002/003的联合验收场景（本阶段不执行制造） |
| --- | --- | --- |
| CAD | 原始字节上传、filename不能含路径、默认32MiB上限；4101非法输入/4102超限/4103未配置/4104不存在/4105冲突/4106损坏/4107解析不可用 | 同命令同内容恢复；异内容409；断线以原parse命令查询；parsed但execution_ready=false仍不得启动CAM |
| Planning | strict Pydantic、有限数、expected_feedback_version/base_revision；planning run与output delivery独立 | 旧revision/feedback409；接受后failed不显示成功；重复键不重复产出；异步晚到结果不能覆盖另一个任务 |
| Feedback | text或成对supplement_schema_version/supplement；feedback_id同内容幂等，删除有独立command/query版本 | added但未applied需明确；文本不转换为实测；删除不自动取消执行；unknown supplement version不能假装已校验 |
| 工艺卡 / 审核 | 编码task_key；ready/card非空；reject须非空comment；7101/7102冲突、7103身份、7104归档/审核服务异常 | 中文task ID编码；旧反馈不批准；审核写入丢响应按原命令恢复；新revision不继承旧批准 |
| CAM | ApprovedPlanRef+expected_current_revision；allowed_actions、state_version、health；成功/失败/awaiting_confirmation分别展示 | 未批准草稿不得复用旧批准；unknown不判failed；reconcile/observe仅做已有观察；cancel/reset受服务端gate；收尾必须有确认证据 |
| NC 保存/修正 | base须精确且链头，活动运行冲突；8301不存在/8302冲突/8303审核门禁/8304文本校验/8305损坏/8307模型不可用 | 同内容保存可无新版本；混合换行/不可编码内容拒绝；保存新版本不继承审核；needs_plan_change回工艺；未知命令保持原键 |
| NC 审核/下载 | reject须comment，review精确nc_ref；版本GET回读最新审核；下载服务器检查文件和审核 | 逐文件读取失败禁用前端提交；新旧版本隔离；旧批准版可精确下载；后来驳回不可下载；ZIP摘要不是NC文件摘要 |
| 读取与权限 | ApiErrorResponse/error.code/message/request_id/trace_id/issues；CAM另有stage/reset_required/file_id；X-Reviewer-ID是声明而非认证 | loading/empty/error/unavailable分开；保留错误码/追踪；身份缺失401；不能靠改按钮状态绕过服务端门禁 |
| Reference/Foundation | Schema/摘要/引用和查询验证；取消/晚到请求隔离 | 损坏案例拒绝；缺历史字节显示unavailable；合成事件不报实时；筛选变更后旧详情不得覆盖新选择 |

这些场景是实施验收要求，不是本次已经运行的E2E。现有相关测试证据见T-索引（实际键T1—T7）；Web本次执行17文件265测试，Core只读源码，未跑NX/Mastercam。

## 4. Core 字段精确核对表（由本次静态 OpenAPI 提取）

此表是字段类型/required/null/结构限制索引，不是独立规范；对象引用继续查同名 Pydantic。`必需=是, 可空=是` 代表键必需但值可null；`必需=否` 不能擅自补制造默认值。动态 `payload/attributes/details` 的业务字段只按§3所列已验证profile处理。输出字段均只读，只有明确命令字段可提交。模型级validator（例如reject必须comment、supplement配对、链头和摘要校验）不完全表达在OpenAPI，必须遵守§2及主文档。

`engineering_status` 在序列化为None时可因exclude_if被省略；不得将省略解读为validated。以下默认值是模型默认，不是前端可擅自填写的工程值。

### CadAsset

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/cad.py)；OpenAPI `#/components/schemas/CadAsset`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `asset_id` | string | 是 | 否 | pattern="^[0-9a-f]{64}$" |
| `command_id` | string | 是 | 否 | minLength=1; maxLength=128; pattern="^[A-Za-z0-9][A-Za-z0-9_.-]*$" |
| `created_at` | string | 是 | 否 | format="date-time" |
| `filename` | string | 是 | 否 | minLength=1; maxLength=255 |
| `format` | 'step' | 否 | 否 | default="step" |
| `sha256` | string | 是 | 否 | pattern="^[0-9a-f]{64}$" |
| `size_bytes` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `status` | 'not_parsed' | 否 | 否 | default="not_parsed" |

### CadParseCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/cad_parsing.py)；OpenAPI `#/components/schemas/CadParseCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1; maxLength=128; pattern="^[A-Za-z0-9][A-Za-z0-9_.-]*$" |

### CadParseResult

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/cad_parsing.py)；OpenAPI `#/components/schemas/CadParseResult`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `analysis` | object 或 null | 否 | 是 | — |
| `asset_id` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `command_id` | string | 是 | 否 | minLength=1; maxLength=128; pattern="^[A-Za-z0-9][A-Za-z0-9_.-]*$" |
| `diagnostic` | string 或 null | 否 | 是 | — |
| `execution_ready` | False | 否 | 否 | default=false |
| `nx_report` | object 或 null | 否 | 是 | — |
| `report_sha256` | string 或 null | 否 | 是 | pattern="^[a-f0-9]{64}$" |
| `script_sha256` | object<string> | 否 | 否 | — |
| `source_sha256` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `status` | running/parsed/failed | 是 | 否 | — |

### CreateTaskRequest

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/planning.py)；OpenAPI `#/components/schemas/CreateTaskRequest`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `payload` | object<JsonValue> | 是 | 否 | — |
| `schema_version` | string | 是 | 否 | minLength=1 |

### PlanningRequest

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/models.py)；OpenAPI `#/components/schemas/PlanningRequest`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `context` | InputContext | 是 | 否 | — |
| `payload` | object<JsonValue> | 是 | 否 | — |
| `resources` | ResolvedResources | 是 | 否 | — |
| `schema_version` | string | 是 | 否 | minLength=1 |

### TaskView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/models.py)；OpenAPI `#/components/schemas/TaskView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `current_revision` | integer | 是 | 否 | minimum=0.0 |
| `feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `provider` | string | 是 | 否 | minLength=1 |
| `result_id` | string | 是 | 否 | minLength=1 |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### HumanReplanRequest

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/planning.py)；OpenAPI `#/components/schemas/HumanReplanRequest`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base_revision` | integer | 是 | 否 | minimum=0.0 |
| `command_id` | string | 是 | 否 | minLength=1 |
| `expected_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `parameter_patch` | ParameterPatch 或 null | 否 | 是 | — |

### ParameterPatch

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/parameter_patches.py)；OpenAPI `#/components/schemas/ParameterPatch`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base_plan_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `changes` | array<ParameterChange> | 是 | 否 | minItems=1; maxItems=100 |
| `template_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |

### ParameterChange

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/parameter_patches.py)；OpenAPI `#/components/schemas/ParameterChange`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `operation_id` | string | 是 | 否 | minLength=1 |
| `parameter_id` | string | 是 | 否 | minLength=1 |
| `unit` | string | 是 | 否 | minLength=1 |
| `value` | integer 或 number | 是 | 否 | — |

### RunReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/models.py)；OpenAPI `#/components/schemas/RunReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `basis_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `basis_revision` | integer | 是 | 否 | minimum=0.0 |
| `command_id` | string | 是 | 否 | minLength=1 |
| `delivery_state` | DeliveryState | 是 | 否 | — |
| `needs_replan` | boolean | 是 | 否 | — |
| `provider` | string | 是 | 否 | minLength=1 |
| `run_id` | string | 是 | 否 | minLength=1 |
| `status` | queued/running/completed/failed/cancelled | 是 | 否 | — |
| `task_id` | string | 是 | 否 | minLength=1 |
| `used_feedback_ids` | array<string> | 否 | 否 | — |

### RunView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/models.py)；OpenAPI `#/components/schemas/RunView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `basis_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `basis_revision` | integer | 是 | 否 | minimum=0.0 |
| `command_id` | string | 是 | 否 | minLength=1 |
| `delivery_error` | ErrorDetail 或 null | 否 | 是 | — |
| `delivery_state` | DeliveryState | 是 | 否 | — |
| `execution_error` | ErrorDetail 或 null | 否 | 是 | — |
| `needs_replan` | boolean | 是 | 否 | — |
| `output_revision` | integer 或 null | 否 | 是 | exclusiveMinimum=0.0 |
| `provider` | string | 是 | 否 | minLength=1 |
| `reason` | human_request/validation_repair 或 null | 否 | 是 | — |
| `repair_attempt` | integer 或 null | 否 | 是 | exclusiveMinimum=0.0 |
| `repair_chain_id` | string 或 null | 否 | 是 | minLength=1 |
| `run_id` | string | 是 | 否 | minLength=1 |
| `status` | queued/running/completed/failed/cancelled | 是 | 否 | — |
| `task_id` | string | 是 | 否 | minLength=1 |
| `used_feedback_ids` | array<string> | 否 | 否 | — |

### DeliveryState

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/models.py)；OpenAPI `#/components/schemas/DeliveryState`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `consumer` | unconfigured/pending/delivered/failed | 是 | 否 | — |
| `frontend` | available/failed/pending | 是 | 否 | — |

### PlanProduced

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/models.py)；OpenAPI `#/components/schemas/PlanProduced`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `event_id` | string | 是 | 否 | minLength=1 |
| `feedback_snapshot` | FeedbackSnapshot | 是 | 否 | — |
| `payload` | object<JsonValue> | 是 | 否 | — |
| `provider` | string | 是 | 否 | minLength=1 |
| `result_id` | string | 是 | 否 | minLength=1 |
| `revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `run_id` | string | 是 | 否 | minLength=1 |
| `schema_version` | string | 是 | 否 | minLength=1 |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |
| `trigger_request_id` | string | 是 | 否 | minLength=1 |

### HumanFeedbackRequest

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/planning.py)；OpenAPI `#/components/schemas/HumanFeedbackRequest`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base_revision` | integer | 是 | 否 | minimum=0.0 |
| `expected_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `feedback_id` | string | 是 | 否 | minLength=1 |
| `kind` | string | 是 | 否 | minLength=1 |
| `supplement` | object<JsonValue> 或 null | 否 | 是 | — |
| `supplement_schema_version` | string 或 null | 否 | 是 | minLength=1 |
| `text` | string 或 null | 否 | 是 | — |

### FeedbackReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)；OpenAPI `#/components/schemas/FeedbackReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string 或 null | 否 | 是 | minLength=1 |
| `feedback_id` | string | 是 | 否 | minLength=1 |
| `feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `status` | added/already_added/deleted/already_deleted | 是 | 否 | — |
| `task_id` | string | 是 | 否 | minLength=1 |

### FeedbackList

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)；OpenAPI `#/components/schemas/FeedbackList`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `items` | array<FeedbackItem> | 否 | 否 | — |

### FeedbackItem

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)；OpenAPI `#/components/schemas/FeedbackItem`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base_revision` | integer | 是 | 否 | minimum=0.0 |
| `digest` | string | 是 | 否 | minLength=1 |
| `expected_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `feedback_id` | string | 是 | 否 | minLength=1 |
| `issues` | array<FeedbackIssue> | 否 | 否 | — |
| `kind` | string | 是 | 否 | minLength=1 |
| `received_at` | string | 是 | 否 | format="date-time" |
| `repair_chain_id` | string 或 null | 否 | 是 | minLength=1 |
| `request_id` | string | 是 | 否 | minLength=1 |
| `source` | FeedbackSource | 是 | 否 | — |
| `status` | active/deleted/superseded | 是 | 否 | — |
| `supplement` | object<JsonValue> 或 null | 否 | 是 | — |
| `supplement_schema_version` | string 或 null | 否 | 是 | minLength=1 |
| `text` | string 或 null | 否 | 是 | — |

### OutputStatusResponse

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/outputs.py)；OpenAPI `#/components/schemas/OutputStatusResponse`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `engineering_status` | pending/validated 或 null | 否 | 是 | — |
| `event_id` | string | 是 | 否 | minLength=1 |
| `model_version` | string 或 null | 是 | 是 | minLength=1 |
| `profile_digest` | string 或 null | 是 | 是 | minLength=1 |
| `profile_id` | string 或 null | 是 | 是 | minLength=1 |
| `provider` | string | 是 | 否 | minLength=1 |
| `publication_state` | pending/published/blocked/failed | 是 | 否 | — |
| `repair_reason` | string 或 null | 否 | 是 | minLength=1 |
| `repair_run_id` | string 或 null | 否 | 是 | minLength=1 |
| `repair_state` | string | 是 | 否 | minLength=1 |
| `report` | ValidationReport | 是 | 否 | — |
| `result_id` | string | 是 | 否 | minLength=1 |
| `revision` | integer | 是 | 否 | — |
| `run_id` | string | 是 | 否 | minLength=1 |
| `schema_version` | string | 是 | 否 | minLength=1 |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `status` | ready/invalid/unavailable | 是 | 否 | — |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |
| `trigger_request_id` | string | 是 | 否 | minLength=1 |

### ProcessCardResponse

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/process_cards.py)；OpenAPI `#/components/schemas/ProcessCardResponse`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `basis_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `card` | ProcessCard 或 null | 否 | 是 | — |
| `engineering_status` | pending/validated 或 null | 否 | 是 | — |
| `event_id` | string | 是 | 否 | minLength=1 |
| `expected_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `publication_state` | pending/published/blocked/failed | 是 | 否 | — |
| `report` | CardValidationReport 或 ValidationReport | 是 | 否 | — |
| `result_id` | string | 是 | 否 | minLength=1 |
| `review` | ReviewSummary 或 null | 否 | 是 | — |
| `revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `run_id` | string | 是 | 否 | minLength=1 |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `status` | ready/invalid/unavailable | 是 | 否 | — |
| `task_id` | string | 是 | 否 | minLength=1 |
| `template_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `template_id` | string | 是 | 否 | minLength=1 |
| `template_version` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |
| `trigger_request_id` | string | 是 | 否 | minLength=1 |

### ProcessCard

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/ProcessCard`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `header` | CardHeader | 是 | 否 | — |
| `identity` | CardIdentity | 是 | 否 | — |
| `operations` | array<CardOperation> | 是 | 否 | — |
| `profile_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `template_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `template_id` | string | 是 | 否 | minLength=1 |
| `template_version` | string | 是 | 否 | minLength=1 |

### CardHeader

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/CardHeader`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `blank_quantity` | integer 或 number 或 null | 否 | 是 | — |
| `blank_specification` | string 或 null | 否 | 是 | — |
| `document_number` | string 或 null | 否 | 是 | — |
| `material` | string 或 null | 否 | 是 | — |
| `model_code` | string 或 null | 否 | 是 | — |
| `name` | string | 是 | 否 | minLength=1; pattern="\\S" |
| `pieces_per_blank` | integer 或 number 或 null | 否 | 是 | — |
| `quantity` | integer 或 number 或 null | 否 | 是 | — |

### CardOperation

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/CardOperation`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | 否 | minLength=1 |
| `inspection_mode` | string 或 null | 否 | 是 | — |
| `name` | string | 是 | 否 | minLength=1; pattern="\\S" |
| `resource_notes` | string 或 null | 否 | 是 | — |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `steps` | array<CardStep> | 是 | 否 | — |

### CardStep

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/CardStep`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `content` | string | 是 | 否 | minLength=1; pattern="\\S" |
| `details` | object<JsonValue> | 否 | 否 | — |
| `id` | string | 是 | 否 | minLength=1 |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |

### ReviewRequest

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/process_cards.py)；OpenAPI `#/components/schemas/ReviewRequest`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `comment` | string 或 null | 否 | 是 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `expected_feedback_version` | integer | 是 | 否 | minimum=0.0 |

### ReviewSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/process_cards.py)；OpenAPI `#/components/schemas/ReviewSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `authenticated` | boolean | 是 | 否 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `request_id` | string | 是 | 否 | minLength=1 |
| `reviewed_at` | string | 是 | 否 | format="date-time" |
| `reviewer_id` | string | 是 | 否 | minLength=1 |

### ReviewReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/review/models.py)；OpenAPI `#/components/schemas/ReviewReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `archive_id` | string 或 null | 否 | 是 | minLength=1 |
| `archive_status` | archived/not_required | 是 | 否 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `request_id` | string | 是 | 否 | minLength=1 |
| `result_id` | string | 是 | 否 | minLength=1 |
| `reviewed_at` | string | 是 | 否 | format="date-time" |
| `revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### ApprovedPlanRef

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/inputs.py)；OpenAPI `#/components/schemas/ApprovedPlanRef`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `archive_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `result_id` | string | 是 | 否 | minLength=1 |
| `revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `task_id` | string | 是 | 否 | minLength=1 |

### ApprovedPlanList

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/ApprovedPlanList`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `execution_configured` | boolean | 是 | 否 | — |
| `execution_profile_id` | string 或 null | 否 | 是 | minLength=1 |
| `plans` | array<ApprovedPlanSummary> | 是 | 否 | — |

### ApprovedPlanSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/ApprovedPlanSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `archived_at` | string | 是 | 否 | format="date-time" |
| `engineering_status` | pending/validated 或 null | 否 | 是 | — |
| `plan_ref` | ApprovedPlanRef | 是 | 否 | — |
| `profile_matches` | boolean | 是 | 否 | — |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### StartCamCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/StartCamCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `execution_profile_id` | string | 是 | 否 | minLength=1 |
| `expected_current_revision` | integer 或 null | 否 | 是 | exclusiveMinimum=0.0 |
| `plan_ref` | ApprovedPlanRef | 是 | 否 | — |

### CamRunReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/CamRunReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base` | NcVersionRef 或 null | 否 | 是 | — |
| `command_id` | string | 是 | 否 | minLength=1 |
| `context` | CamRunContext | 是 | 否 | — |
| `feedback_id` | string 或 null | 否 | 是 | minLength=1 |
| `kind` | generate/revise | 是 | 否 | — |

### CamRunContext

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/inputs.py)；OpenAPI `#/components/schemas/CamRunContext`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `cam_run_id` | string | 是 | 否 | minLength=1 |
| `request_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### CamRunView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/CamRunView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `allowed_actions` | array<reconcile/observe/cancel/closeout/reset/save/review/revise/download> | 是 | 否 | — |
| `cam_run_id` | string | 是 | 否 | minLength=1 |
| `closeout` | CloseoutSummary 或 null | 否 | 是 | — |
| `control` | ControlSummary 或 null | 否 | 是 | — |
| `current_candidate` | NcVersionRef 或 null | 否 | 是 | — |
| `engineering_status` | pending/validated 或 null | 否 | 是 | — |
| `error` | ErrorDetail 或 null | 否 | 是 | — |
| `explanation` | string 或 null | 否 | 是 | — |
| `kind` | generate/revise | 是 | 否 | — |
| `observation` | HealthSummary 或 null | 否 | 是 | — |
| `outcome` | candidate/needs_plan_change 或 null | 否 | 是 | — |
| `phase` | prepare/feedback/edit_nc/generate_code/build/execute/collect | 是 | 否 | — |
| `plan_ref` | ApprovedPlanRef | 是 | 否 | — |
| `reset_required` | boolean | 是 | 否 | — |
| `root_run_id` | string | 是 | 否 | minLength=1 |
| `state_version` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `status` | accepted/running/awaiting_confirmation/succeeded/failed/cancelled | 是 | 否 | — |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### HealthSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/HealthSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `active_run_id` | string 或 null | 否 | 是 | minLength=1 |
| `availability` | observed/unavailable | 是 | 否 | — |
| `executor_id` | string 或 null | 否 | 是 | minLength=1 |
| `observed_at` | string | 是 | 否 | format="date-time" |
| `state` | idle/busy/reset_required/offline 或 null | 否 | 是 | — |

### ExecutorView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/ExecutorView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `active_run_id` | string 或 null | 否 | 是 | minLength=1 |
| `availability` | observed/unavailable | 是 | 否 | — |
| `error` | ErrorDetail 或 null | 否 | 是 | — |
| `executor_id` | string 或 null | 否 | 是 | minLength=1 |
| `observed_at` | string 或 null | 否 | 是 | format="date-time" |
| `reset_required` | boolean | 否 | 否 | default=false |
| `state` | idle/busy/reset_required/offline 或 null | 否 | 是 | — |

### CamCommandBody

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/CamCommandBody`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |

### CamControlReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/CamControlReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command` | CamControlCommand | 是 | 否 | — |
| `observed_at` | string | 是 | 否 | format="date-time" |
| `request_id` | string | 是 | 否 | minLength=1 |
| `status` | submitted/unknown/confirmed/rejected | 是 | 否 | — |

### CamControlView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/CamControlView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `action` | cancel/reset | 是 | 否 | — |
| `admission_observed_at` | string | 是 | 否 | format="date-time" |
| `admission_status` | submitted/unknown/confirmed/rejected | 是 | 否 | — |
| `allowed_actions` | array<'reconcile'> | 是 | 否 | — |
| `cam_run_id` | string 或 null | 否 | 是 | minLength=1 |
| `command_id` | string | 是 | 否 | minLength=1 |
| `executor_id` | string 或 null | 否 | 是 | minLength=1 |
| `observed_at` | string | 是 | 否 | format="date-time" |
| `status` | submitted/unknown/confirmed/rejected | 是 | 否 | — |

### CloseCamBody

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/CloseCamBody`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `evidence_command_id` | string | 是 | 否 | minLength=1 |
| `reason` | string | 是 | 否 | minLength=1; pattern="\\S" |

### CamCloseoutReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/CamCloseoutReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `cam_run_id` | string | 是 | 否 | minLength=1 |
| `command_id` | string | 是 | 否 | minLength=1 |
| `error` | ErrorDetail | 是 | 否 | — |
| `evidence_action` | cancel/reset | 是 | 否 | — |
| `evidence_command_id` | string | 是 | 否 | minLength=1 |
| `identity_source` | 'declared' | 否 | 否 | default="declared" |
| `operator_id` | string | 是 | 否 | minLength=1 |
| `request_id` | string | 是 | 否 | minLength=1 |
| `run_status` | failed/cancelled | 是 | 否 | — |
| `status` | 'closed' | 否 | 否 | default="closed" |

### NcVersionRef

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/nc.py)；OpenAPI `#/components/schemas/NcVersionRef`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `cam_run_id` | string | 是 | 否 | minLength=1 |
| `content_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `version` | integer | 是 | 否 | exclusiveMinimum=0.0 |

### NcVersionSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcVersionSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `engineering_status` | pending/validated 或 null | 否 | 是 | — |
| `origin` | cam_generated/human_edit/agent_edit | 是 | 否 | — |
| `parent` | NcVersionRef 或 null | 否 | 是 | — |
| `ref` | NcVersionRef | 是 | 否 | — |
| `review_status` | pending/approved/rejected | 是 | 否 | — |

### NcVersionView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcVersionView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `allowed_actions` | array<reconcile/observe/cancel/closeout/reset/save/review/revise/download> | 是 | 否 | — |
| `comparison_sha256` | string 或 null | 否 | 是 | pattern="^[a-f0-9]{64}$" |
| `engineering_status` | pending/validated 或 null | 否 | 是 | — |
| `feedback_id` | string 或 null | 否 | 是 | minLength=1 |
| `files` | array<NcFileSummary> | 是 | 否 | — |
| `is_current_candidate` | boolean | 是 | 否 | — |
| `origin` | cam_generated/human_edit/agent_edit | 是 | 否 | — |
| `parent` | NcVersionRef 或 null | 否 | 是 | — |
| `plan_ref` | ApprovedPlanRef | 是 | 否 | — |
| `ref` | NcVersionRef | 是 | 否 | — |
| `review_status` | pending/approved/rejected | 是 | 否 | — |
| `reviews` | array<NcReviewSummary> | 是 | 否 | — |
| `root_run_id` | string | 是 | 否 | minLength=1 |
| `simulation_version` | NcVersionRef 或 null | 否 | 是 | — |

### NcFileSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcFileSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `encoding` | string | 是 | 否 | minLength=1 |
| `file_id` | string | 是 | 否 | minLength=1 |
| `filename` | string | 是 | 否 | minLength=1 |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `setup_id` | string | 是 | 否 | minLength=1 |
| `sha256` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `size_bytes` | integer | 是 | 否 | — |

### NcFileView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcFileView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `encoding` | string | 是 | 否 | minLength=1 |
| `file_id` | string | 是 | 否 | minLength=1 |
| `filename` | string | 是 | 否 | minLength=1 |
| `newline` | string | 是 | 否 | minLength=1 |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `setup_id` | string | 是 | 否 | minLength=1 |
| `sha256` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `size_bytes` | integer | 是 | 否 | — |
| `text` | string | 是 | 否 | — |

### SaveNcCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/SaveNcCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base` | NcVersionRef | 是 | 否 | — |
| `command_id` | string | 是 | 否 | minLength=1 |
| `edits` | array<NcTextEdit> | 是 | 否 | minItems=1 |

### NcTextEdit

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/NcTextEdit`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `file_id` | string | 是 | 否 | minLength=1 |
| `newline_mode` | preserve/lf/crlf | 否 | 否 | default="preserve" |
| `text` | string | 是 | 否 | — |

### NcSaveReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/NcSaveReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base` | NcVersionRef | 是 | 否 | — |
| `candidate` | NcVersionRef | 是 | 否 | — |
| `command_id` | string | 是 | 否 | minLength=1 |
| `request_id` | string | 是 | 否 | minLength=1 |

### NcComparisonView

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcComparisonView`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `diff` | string | 是 | 否 | — |
| `explanation` | string 或 null | 否 | 是 | — |
| `nc_ref` | NcVersionRef | 是 | 否 | — |
| `parent` | NcVersionRef 或 null | 否 | 是 | — |

### ReviseNcCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/ReviseNcCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `base` | NcVersionRef | 是 | 否 | — |
| `command_id` | string | 是 | 否 | minLength=1 |
| `prompt` | string | 是 | 否 | minLength=1; pattern="\\S" |

### ReviewNcCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/ReviewNcCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `comment` | string 或 null | 否 | 是 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `nc_ref` | NcVersionRef | 是 | 否 | — |

### NcReviewReceipt

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/NcReviewReceipt`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `identity_source` | 'declared' | 否 | 否 | default="declared" |
| `request_id` | string | 是 | 否 | minLength=1 |
| `review` | NcReviewRecord | 是 | 否 | — |

### NcReviewRecord

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/nc.py)；OpenAPI `#/components/schemas/NcReviewRecord`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `comment` | string 或 null | 否 | 是 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `nc_ref` | NcVersionRef | 是 | 否 | — |
| `reviewed_at` | string | 是 | 否 | format="date-time" |
| `reviewer_id` | string | 是 | 否 | minLength=1 |

### NcReviewSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcReviewSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `comment` | string 或 null | 否 | 是 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `request_id` | string | 是 | 否 | minLength=1 |
| `reviewed_at` | string | 是 | 否 | format="date-time" |
| `reviewer_id` | string | 是 | 否 | minLength=1 |

### ApiErrorResponse

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/api.py)；OpenAPI `#/components/schemas/ApiErrorResponse`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `error` | ErrorDetail | 是 | 否 | — |
| `issues` | array<InputIssue> | 否 | 否 | maxItems=50 |
| `request_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### ErrorDetail

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/common/errors.py)；OpenAPI `#/components/schemas/ErrorDetail`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `code` | integer | 是 | 否 | minimum=0.0 |
| `message` | string | 是 | 否 | minLength=1 |

### InputIssue

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/errors.py)；OpenAPI `#/components/schemas/InputIssue`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `code` | string | 是 | 否 | minLength=1 |
| `message` | string | 是 | 否 | minLength=1 |
| `path` | string | 是 | 否 | — |

### TaskSnapshots

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/models.py)；OpenAPI `#/components/schemas/TaskSnapshots`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `items` | array<FrontendSnapshot> | 是 | 否 | — |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### FrontendSnapshot

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/models.py)；OpenAPI `#/components/schemas/FrontendSnapshot`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `context` | FrontendTaskContext | 是 | 否 | — |
| `payload` | object<JsonValue> | 是 | 否 | — |
| `resource_id` | string | 是 | 否 | minLength=1 |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `topic` | string | 是 | 否 | minLength=1 |
| `version` | integer | 是 | 否 | exclusiveMinimum=0.0 |

### FrontendTaskContext

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/models.py)；OpenAPI `#/components/schemas/FrontendTaskContext`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `result_id` | string 或 null | 否 | 是 | minLength=1 |
| `revision` | integer 或 null | 否 | 是 | exclusiveMinimum=0.0 |
| `run_id` | string 或 null | 否 | 是 | minLength=1 |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### HealthStatus

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/health.py)；OpenAPI `#/components/schemas/HealthStatus`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `status` | 'ok' | 否 | 否 | default="ok" |

### ArchiveBundle

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/storage/models.py)；OpenAPI `#/components/schemas/ArchiveBundle`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `archive_version` | 'v1' | 否 | 否 | default="v1" |
| `card` | ProcessCard | 是 | 否 | — |
| `card_report` | CardValidationReport | 是 | 否 | — |
| `content_digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `event` | PlanProduced | 是 | 否 | — |
| `feedback_snapshot` | FeedbackSnapshot | 是 | 否 | — |
| `prepared` | PreparedPlan | 是 | 否 | — |
| `profile` | ProfileSnapshot | 是 | 否 | — |
| `public_report` | ValidationReport | 是 | 否 | — |
| `resolved_feedback_contracts` | array<ResolvedFeedbackContract> | 否 | 否 | — |
| `review` | ReviewDecisionRecord | 是 | 否 | — |
| `template` | CardTemplateSnapshot | 是 | 否 | — |

### CamControlCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)；OpenAPI `#/components/schemas/CamControlCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `action` | cancel/reset | 是 | 否 | — |
| `cam_run_id` | string 或 null | 否 | 是 | minLength=1 |
| `command_id` | string | 是 | 否 | minLength=1 |
| `executor_id` | string 或 null | 否 | 是 | minLength=1 |

### CamRunList

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/CamRunList`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `runs` | array<CamRunView> | 是 | 否 | — |

### CardIdentity

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/CardIdentity`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `basis_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `event_id` | string | 是 | 否 | minLength=1 |
| `provider` | string | 是 | 否 | minLength=1 |
| `result_id` | string | 是 | 否 | minLength=1 |
| `revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `run_id` | string | 是 | 否 | minLength=1 |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |
| `trigger_request_id` | string | 是 | 否 | minLength=1 |

### CardIssue

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/CardIssue`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `code` | string | 是 | 否 | minLength=1 |
| `document` | 'card' | 否 | 否 | default="card" |
| `field_key` | string | 是 | 否 | pattern="^[A-Za-z_][A-Za-z0-9_.-]*$" |
| `message` | string | 是 | 否 | minLength=1 |
| `path` | string | 是 | 否 | pattern="^(?:/(?:[^~/]\|~[01])*)*$" |
| `public_path` | string 或 null | 否 | 是 | pattern="^(?:/(?:[^~/]\|~[01])*)*$" |
| `repairable` | boolean | 是 | 否 | — |
| `scope` | QueryScope 或 null | 否 | 是 | — |
| `severity` | error/warning | 是 | 否 | — |
| `source_paths` | array<string> | 否 | 否 | — |
| `stage` | string | 是 | 否 | minLength=1 |

### CardTemplateConfig

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/CardTemplateConfig`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `details` | object | 否 | 否 | — |
| `header` | HeaderBindings | 否 | 否 | — |
| `operation` | OperationBindings | 否 | 否 | — |
| `step` | StepBindings | 否 | 否 | — |

### CardTemplateSnapshot

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/CardTemplateSnapshot`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `config` | CardTemplateConfig | 是 | 否 | — |
| `digest` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `template_id` | string | 是 | 否 | minLength=1 |
| `version` | string | 是 | 否 | minLength=1 |

### CardValidationReport

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/models.py)；OpenAPI `#/components/schemas/CardValidationReport`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `has_errors` | boolean | 是 | 否 | — |
| `has_nonrepairable_errors` | boolean | 是 | 否 | — |
| `issues` | array<CardIssue> | 是 | 否 | maxItems=50 |
| `total_count` | integer | 是 | 否 | minimum=0.0 |
| `truncated` | boolean | 是 | 否 | — |

### CloseoutSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/CloseoutSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `evidence_action` | cancel/reset | 是 | 否 | — |
| `evidence_command_id` | string | 是 | 否 | minLength=1 |
| `identity_source` | 'declared' | 否 | 否 | default="declared" |
| `operator_id` | string | 是 | 否 | minLength=1 |
| `reason` | string | 是 | 否 | minLength=1 |

### ControlSummary

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/ControlSummary`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `action` | cancel/reset | 是 | 否 | — |
| `observed_at` | string | 是 | 否 | format="date-time" |
| `status` | submitted/unknown/confirmed/rejected | 是 | 否 | — |

### DetailBinding

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/DetailBinding`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `field_key` | string | 是 | 否 | pattern="^[A-Za-z_][A-Za-z0-9_.-]*$" |
| `member` | string 或 null | 否 | 是 | pattern="^[A-Za-z_][A-Za-z0-9_.-]*$" |
| `required` | boolean | 否 | 否 | default=true |
| `scope` | operation/step | 是 | 否 | — |

### FeedbackIssue

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)；OpenAPI `#/components/schemas/FeedbackIssue`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `code` | string | 是 | 否 | minLength=1 |
| `message` | string | 是 | 否 | minLength=1 |
| `path` | string | 是 | 否 | — |
| `stage` | string | 是 | 否 | minLength=1 |

### FeedbackSnapshot

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)；OpenAPI `#/components/schemas/FeedbackSnapshot`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `items` | array<FeedbackItem> | 否 | 否 | — |

### FeedbackSource

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)；OpenAPI `#/components/schemas/FeedbackSource`。

取值：`1/2`。

### FieldBinding

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/FieldBinding`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `field_key` | string | 是 | 否 | pattern="^[A-Za-z_][A-Za-z0-9_.-]*$" |
| `required` | boolean | 否 | 否 | default=true |

### FieldDefinition

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/profiles.py)；OpenAPI `#/components/schemas/FieldDefinition`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `declared_type` | string/number/integer/boolean/object/array/null | 是 | 否 | — |
| `public_path` | string | 是 | 否 | pattern="^(?:/(?:[^~/]\|~[01])*)*$" |
| `scope` | plan/operation/step | 是 | 否 | — |
| `unit` | string 或 null | 否 | 是 | minLength=1 |

### HTTPValidationError

来源：静态OpenAPI同名Schema；OpenAPI `#/components/schemas/HTTPValidationError`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `detail` | array<ValidationError> | 否 | 否 | — |

### HeaderBindings

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/HeaderBindings`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `blank_quantity` | FieldBinding 或 null | 否 | 是 | — |
| `blank_specification` | FieldBinding 或 null | 否 | 是 | — |
| `document_number` | FieldBinding 或 null | 否 | 是 | — |
| `material` | FieldBinding | 否 | 否 | — |
| `model_code` | FieldBinding 或 null | 否 | 是 | — |
| `name` | FieldBinding | 否 | 否 | — |
| `pieces_per_blank` | FieldBinding 或 null | 否 | 是 | — |
| `quantity` | FieldBinding 或 null | 否 | 是 | — |

### InputContext

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/models.py)；OpenAPI `#/components/schemas/InputContext`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `received_at` | string | 是 | 否 | format="date-time" |
| `request_id` | string | 是 | 否 | minLength=1 |
| `source` | cli/http | 是 | 否 | — |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### InputErrorResponse

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/input_errors.py)；OpenAPI `#/components/schemas/InputErrorResponse`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `error` | ErrorDetail | 是 | 否 | — |
| `issues` | array<InputIssue> | 否 | 否 | maxItems=50 |
| `request_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |

### MappingNode

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/profiles.py)；OpenAPI `#/components/schemas/MappingNode`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `fields` | object<MappingNode> 或 null | 否 | 是 | — |
| `items` | MappingNode 或 null | 否 | 是 | — |
| `pointer` | string 或 null | 否 | 是 | pattern="^(?:/(?:[^~/]\|~[01])*)*$" |
| `required` | boolean | 否 | 否 | default=true |

### NcVersionList

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/cam.py)；OpenAPI `#/components/schemas/NcVersionList`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `versions` | array<NcVersionSummary> | 是 | 否 | — |

### NormalizedOperation

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)；OpenAPI `#/components/schemas/NormalizedOperation`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `attributes` | object<JsonValue> | 否 | 否 | — |
| `id` | string | 是 | 否 | minLength=1 |
| `name` | string | 是 | 否 | minLength=1 |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `steps` | array<NormalizedStep> | 是 | 否 | — |

### NormalizedPlan

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)；OpenAPI `#/components/schemas/NormalizedPlan`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `blank` | object<JsonValue> | 是 | 否 | — |
| `extensions` | object<JsonValue> | 否 | 否 | — |
| `operations` | array<NormalizedOperation> | 是 | 否 | — |
| `part` | object<JsonValue> | 是 | 否 | — |
| `resources` | object<JsonValue> | 是 | 否 | — |

### NormalizedStep

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)；OpenAPI `#/components/schemas/NormalizedStep`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `attributes` | object<JsonValue> | 否 | 否 | — |
| `content` | string | 是 | 否 | minLength=1 |
| `id` | string | 是 | 否 | minLength=1 |
| `sequence` | integer | 是 | 否 | exclusiveMinimum=0.0 |

### OperationBindings

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/OperationBindings`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `inspection_mode` | FieldBinding 或 null | 否 | 是 | — |
| `name` | FieldBinding | 否 | 否 | — |
| `resource_notes` | FieldBinding 或 null | 否 | 是 | — |

### OutputIssue

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)；OpenAPI `#/components/schemas/OutputIssue`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `code` | string | 是 | 否 | minLength=1 |
| `document` | raw/normalized | 是 | 否 | — |
| `message` | string | 是 | 否 | minLength=1 |
| `path` | string | 是 | 否 | pattern="^(?:/(?:[^~/]\|~[01])*)*$" |
| `repairable` | boolean | 是 | 否 | — |
| `severity` | error/warning | 是 | 否 | — |
| `stage` | string | 是 | 否 | minLength=1 |

### PreparedPlan

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)；OpenAPI `#/components/schemas/PreparedPlan`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `event_id` | string | 是 | 否 | minLength=1 |
| `feedback_snapshot` | FeedbackSnapshot | 是 | 否 | — |
| `model_version` | string | 是 | 否 | minLength=1 |
| `normalized_plan` | NormalizedPlan | 是 | 否 | — |
| `profile_digest` | string | 是 | 否 | minLength=1 |
| `profile_id` | string | 是 | 否 | minLength=1 |
| `provider` | string | 是 | 否 | minLength=1 |
| `result_id` | string | 是 | 否 | minLength=1 |
| `revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |
| `run_id` | string | 是 | 否 | minLength=1 |
| `source_map` | object | 是 | 否 | — |
| `source_request_id` | string | 是 | 否 | minLength=1 |
| `task_id` | string | 是 | 否 | minLength=1 |
| `trace_id` | string | 是 | 否 | minLength=1; maxLength=64; pattern="^[A-Za-z0-9_-]{1,64}$" |
| `trigger_request_id` | string | 是 | 否 | minLength=1 |

### ProfileConfig

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/profiles.py)；OpenAPI `#/components/schemas/ProfileConfig`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `fields` | object<FieldDefinition> | 否 | 否 | — |
| `mapping` | MappingNode | 是 | 否 | — |
| `raw_schema` | object<JsonValue> | 是 | 否 | — |
| `rules` | array<RuleConfig> | 否 | 否 | — |

### ProfileSnapshot

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/profiles.py)；OpenAPI `#/components/schemas/ProfileSnapshot`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `config` | ProfileConfig | 是 | 否 | — |
| `digest` | string | 是 | 否 | minLength=1 |
| `model_version` | string | 是 | 否 | minLength=1 |
| `profile_id` | string | 是 | 否 | minLength=1 |
| `source_schema_version` | string | 是 | 否 | minLength=1 |

### QueryScope

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/query.py)；OpenAPI `#/components/schemas/QueryScope`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `operation_id` | string 或 null | 否 | 是 | minLength=1 |
| `step_id` | string 或 null | 否 | 是 | minLength=1 |

### ResolvedFeedbackContract

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/algorithm/review.py)；OpenAPI `#/components/schemas/ResolvedFeedbackContract`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `feedback_id` | string | 是 | 否 | minLength=1 |
| `sha256` | string | 是 | 否 | pattern="^[a-f0-9]{64}$" |
| `target_contract` | object<JsonValue> | 是 | 否 | — |
| `version` | 'feedback-contract-ref-v1' | 否 | 否 | default="feedback-contract-ref-v1" |

### ResolvedResources

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/resources/models.py)；OpenAPI `#/components/schemas/ResolvedResources`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `machines` | object<ResourceSnapshot> | 否 | 否 | — |
| `tools` | object<ResourceSnapshot> | 否 | 否 | — |

### ResourceSnapshot

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/resources/models.py)；OpenAPI `#/components/schemas/ResourceSnapshot`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `attributes` | object<JsonValue> | 是 | 否 | — |
| `fetched_at` | string | 是 | 否 | format="date-time" |
| `id` | string | 是 | 否 | minLength=1 |
| `kind` | machine/tool | 是 | 否 | — |
| `revision` | string 或 null | 否 | 是 | minLength=1 |
| `schema_version` | string | 是 | 否 | minLength=1 |

### ReviewCommand

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/review/models.py)；OpenAPI `#/components/schemas/ReviewCommand`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `command_id` | string | 是 | 否 | minLength=1 |
| `comment` | string 或 null | 否 | 是 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `expected_feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `expected_revision` | integer | 是 | 否 | exclusiveMinimum=0.0 |

### ReviewDecisionRecord

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/review/models.py)；OpenAPI `#/components/schemas/ReviewDecisionRecord`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `authenticated` | boolean | 是 | 否 | — |
| `command` | ReviewCommand | 是 | 否 | — |
| `decision` | approve/reject | 是 | 否 | — |
| `feedback_version` | integer | 是 | 否 | minimum=0.0 |
| `identity` | CardIdentity | 是 | 否 | — |
| `request_id` | string | 是 | 否 | minLength=1 |
| `reviewed_at` | string | 是 | 否 | format="date-time" |
| `reviewer_id` | string | 是 | 否 | minLength=1 |

### RuleConfig

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/profiles.py)；OpenAPI `#/components/schemas/RuleConfig`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `name` | string | 是 | 否 | minLength=1 |
| `options` | object<JsonValue> | 否 | 否 | — |

### StepBindings

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/process_card/templates.py)；OpenAPI `#/components/schemas/StepBindings`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `content` | FieldBinding | 否 | 否 | — |

### ValidationError

来源：静态OpenAPI同名Schema；OpenAPI `#/components/schemas/ValidationError`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `ctx` | object | 否 | 否 | — |
| `input` | 自由JSON | 否 | 否 | — |
| `loc` | array<string 或 integer> | 是 | 否 | — |
| `msg` | string | 是 | 否 | — |
| `type` | string | 是 | 否 | — |

### ValidationReport

[Pydantic 源码](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)；OpenAPI `#/components/schemas/ValidationReport`。

| 字段（相对本模型） | 类型 / 枚举 | 必需 | 可空 | 约束 / 默认 |
| --- | --- | --- | --- | --- |
| `has_errors` | boolean | 是 | 否 | — |
| `has_nonrepairable_errors` | boolean | 是 | 否 | — |
| `issues` | array<OutputIssue> | 是 | 否 | maxItems=50 |
| `total_count` | integer | 是 | 否 | minimum=0.0 |
| `truncated` | boolean | 是 | 否 | — |

## 5. OpenAPI 路由核对索引

40个操作均来自当前create_app静态装配；不是部署可用性保证。卡片路径下列保留OpenAPI原占位符名，实际编码语义见P-12。download的JSON声明、cancel/reset缺200、部分手工读取头和错误响应描述是G-08待修正项。

| 现有操作 | OpenAPI请求体 | OpenAPI路径/查询参数 | OpenAPI成功响应 |
| --- | --- | --- | --- |
| GET /archives/tasks/{task_id}/results/{result_id}/revisions/{revision} | 无body | path: task_id 必需 (—); path: result_id 必需 (—); path: revision 必需 (minimum=1) | 200 application/json: ArchiveBundle |
| POST /cad/assets | application/octet-stream: string | query: filename 必需 (—); query: command_id 必需 (—) | 201 application/json: CadAsset |
| GET /cad/assets/{asset_id} | 无body | path: asset_id 必需 (—) | 200 application/json: CadAsset |
| GET /cad/assets/{asset_id}/parse | 无body | path: asset_id 必需 (—); query: command_id 必需 (—) | 200 application/json: CadParseResult |
| POST /cad/assets/{asset_id}/parse | application/json: CadParseCommand | path: asset_id 必需 (—) | 200 application/json: CadParseResult |
| GET /cam/controls/{command_id} | 无body | path: command_id 必需 (—) | 200 application/json: CamControlView |
| POST /cam/controls/{command_id}/reconcile | 无body | path: command_id 必需 (—) | 200 application/json: CamControlView |
| GET /cam/executor | 无body | — | 200 application/json: ExecutorView |
| POST /cam/executor/reset | application/json: CamCommandBody | — | 202 application/json: CamControlReceipt |
| POST /cam/runs | application/json: StartCamCommand | — | 202 application/json: CamRunReceipt |
| GET /cam/runs/{run_id} | 无body | path: run_id 必需 (—) | 200 application/json: CamRunView |
| POST /cam/runs/{run_id}/cancel | application/json: CamCommandBody | path: run_id 必需 (—) | 202 application/json: CamControlReceipt |
| POST /cam/runs/{run_id}/closeout | application/json: CloseCamBody | path: run_id 必需 (—) | 200 application/json: CamCloseoutReceipt |
| GET /cam/runs/{run_id}/nc/versions | 无body | path: run_id 必需 (—) | 200 application/json: NcVersionList |
| POST /cam/runs/{run_id}/nc/versions | application/json: SaveNcCommand | path: run_id 必需 (—) | 200 application/json: NcSaveReceipt |
| GET /cam/runs/{run_id}/nc/versions/{version} | 无body | path: run_id 必需 (—); path: version 必需 (minimum=1) | 200 application/json: NcVersionView |
| GET /cam/runs/{run_id}/nc/versions/{version}/comparison | 无body | path: run_id 必需 (—); path: version 必需 (minimum=1) | 200 application/json: NcComparisonView |
| GET /cam/runs/{run_id}/nc/versions/{version}/download | 无body | path: run_id 必需 (—); path: version 必需 (minimum=1) | 200 application/json: 自由JSON |
| GET /cam/runs/{run_id}/nc/versions/{version}/file | 无body | path: run_id 必需 (—); path: version 必需 (minimum=1); query: file_id 必需 (minLength=1) | 200 application/json: NcFileView |
| POST /cam/runs/{run_id}/nc/versions/{version}/review | application/json: ReviewNcCommand | path: run_id 必需 (—); path: version 必需 (minimum=1) | 200 application/json: NcReviewReceipt |
| POST /cam/runs/{run_id}/nc/versions/{version}/revise | application/json: ReviseNcCommand | path: run_id 必需 (—); path: version 必需 (minimum=1) | 202 application/json: CamRunReceipt |
| POST /cam/runs/{run_id}/observe | 无body | path: run_id 必需 (—) | 200 application/json: CamRunView |
| POST /cam/runs/{run_id}/reconcile | 无body | path: run_id 必需 (—) | 200 application/json: CamRunView |
| GET /cam/tasks/{task_id}/approved-plans | 无body | path: task_id 必需 (—) | 200 application/json: ApprovedPlanList |
| GET /cam/tasks/{task_id}/runs | 无body | path: task_id 必需 (—) | 200 application/json: CamRunList |
| GET /frontend/tasks/{task_id}/snapshots | 无body | path: task_id 必需 (—) | 200 application/json: TaskSnapshots |
| GET /health | 无body | — | 200 application/json: HealthStatus |
| POST /inputs/prepare | application/json: object | — | 200 application/json: PlanningRequest |
| GET /outputs/tasks/{task_id}/latest | 无body | path: task_id 必需 (—) | 200 application/json: OutputStatusResponse |
| GET /outputs/tasks/{task_id}/results/{revision} | 无body | path: task_id 必需 (—); path: revision 必需 (minimum=1) | 200 application/json: OutputStatusResponse |
| POST /planning/tasks | application/json: CreateTaskRequest | — | 201 application/json: TaskView |
| GET /planning/tasks/{task_id} | 无body | path: task_id 必需 (—) | 200 application/json: TaskView |
| GET /planning/tasks/{task_id}/feedback | 无body | path: task_id 必需 (—); query: include_deleted 可选 (default=false) | 200 application/json: FeedbackList |
| POST /planning/tasks/{task_id}/feedback | application/json: HumanFeedbackRequest | path: task_id 必需 (—) | 200 application/json: FeedbackReceipt |
| DELETE /planning/tasks/{task_id}/feedback/{feedback_id} | 无body | path: task_id 必需 (—); path: feedback_id 必需 (—); query: command_id 必需 (minLength=1); query: expected_feedback_version 必需 (minimum=0) | 200 application/json: FeedbackReceipt |
| POST /planning/tasks/{task_id}/replan | application/json: HumanReplanRequest | path: task_id 必需 (—) | 202 application/json: RunReceipt |
| GET /planning/tasks/{task_id}/results/{revision} | 无body | path: task_id 必需 (—); path: revision 必需 (minimum=1) | 200 application/json: PlanProduced |
| GET /planning/tasks/{task_id}/runs/{run_id} | 无body | path: task_id 必需 (—); path: run_id 必需 (—) | 200 application/json: RunView |
| GET /process-cards/tasks/{task_id}/results/{revision} | 无body | path: task_id 必需 (—); path: revision 必需 (minimum=1) | 200 application/json: ProcessCardResponse |
| POST /process-cards/tasks/{task_id}/results/{revision}/review | application/json: ReviewRequest | path: task_id 必需 (—); path: revision 必需 (minimum=1) | 200 application/json: ReviewReceipt |

## 6. 证据索引

W=当前Web；C/T=当前Core源码/测试源码；H=历史PR24。链接固定Git SHA，避免main移动造成证据漂移。测试路径证明覆盖意图；本次执行范围见主文档。相邻文件说明以对应仓库根解析。

<a id="evidence-w1"></a>

- **W1** [src/features/model-input/modelInput.ts](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/features/model-input/modelInput.ts)：另见同目录 useModelInput/InputPreparationPanel/FileInfoBar/ModelFilePicker 和 pages/model-input/ModelInputPage.tsx。

<a id="evidence-w2"></a>

- **W2** [src/features/core/CoreWorkspace.tsx](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/features/core/CoreWorkspace.tsx)：及 src/api/core/client.ts、client.test.ts；当前真实工作区，不是PR24版本。

<a id="evidence-w3"></a>

- **W3** [src/features/process-planning/processPlan.ts](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/features/process-planning/processPlan.ts)：及 OperationDetails.tsx、ParameterFields.tsx、TaskMeasurements.tsx、useWorkflowSession.ts、pages/process-planning/ProcessPlanningPage.tsx。

<a id="evidence-w4"></a>

- **W4** [src/app/WorkflowWorkspace.tsx](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/app/WorkflowWorkspace.tsx)：及 features/agent/agentSession.ts、AgentDrawer.tsx、AgentBubble.tsx。

<a id="evidence-w5"></a>

- **W5** [src/pages/program-review/ProgramReviewPage.tsx](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/pages/program-review/ProgramReviewPage.tsx)：及 features/program-review/programDocument.ts、ProgramEditor.tsx、ProgramDiff.tsx；api/program-content/reader.ts、format.ts。

<a id="evidence-w6"></a>

- **W6** [src/api/case-catalog/types.ts](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/api/case-catalog/types.ts)：及 JsonCaseCatalogReader.ts、adapter.ts、validation.ts、schema/*.json、public/case-catalog/index.json 和 golden-b7/v2.json。

<a id="evidence-w7"></a>

- **W7** [src/api/data-foundation/reader.ts](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/api/data-foundation/reader.ts)：及 types.ts、queries.ts、statistics.ts、validation.ts、assets.ts、schema/foundation-dataset.schema.json；mock/MockDataFoundationReader.ts。

<a id="evidence-w8"></a>

- **W8** [src/pages/data-foundation/DataFoundationPage.tsx](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/pages/data-foundation/DataFoundationPage.tsx)：及 features/data-foundation/FoundationPanels.tsx、FoundationCharts.tsx、FoundationAssetBrowser.tsx、FoundationAssetDetail.tsx、useFoundationQuery.ts。

<a id="evidence-w9"></a>

- **W9** [src/app/App.tsx](https://github.com/James-FE/CAPPtron-web/blob/ce46313a4637947b9e31500509dc7661d1e7b201/src/app/App.tsx)：及 AppShell.tsx、WorkflowNavigation.tsx；docs/architecture/frontend-architecture.md、docs/workflows/FE-001—004验收文件。

<a id="evidence-c1"></a>

- **C1** [src/capptron/infrastructure/frontend/routes/cad.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/infrastructure/frontend/routes/cad.py)：contracts/input/cad.py、cad_parsing.py；docs/cad-intake.md。

<a id="evidence-c2"></a>

- **C2** [src/capptron/infrastructure/frontend/routes/planning.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/infrastructure/frontend/routes/planning.py)：contracts/frontend/planning.py、contracts/algorithm/models.py、parameter_patches.py；docs/algorithm.md。

<a id="evidence-c3"></a>

- **C3** [src/capptron/algorithm/providers/template.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/algorithm/providers/template.py)：templates/integration.py、contracts/algorithm/engineering.py；源码覆盖历史template-planning说明。

<a id="evidence-c4"></a>

- **C4** [src/capptron/algorithm/templates/parameters.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/algorithm/templates/parameters.py)：contracts/algorithm/templates.py ParameterRule；templates/integration.py 更新参数Pointer。

<a id="evidence-c5"></a>

- **C5** [src/capptron/infrastructure/frontend/routes/inputs.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/infrastructure/frontend/routes/inputs.py)：contracts/input/models.py、contracts/resources/models.py。

<a id="evidence-c6"></a>

- **C6** [src/capptron/contracts/input/nx_analysis.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/input/nx_analysis.py)：内部离线类型；HTTP的analysis/nx_report尚无同等结构化Schema承诺。

<a id="evidence-c7"></a>

- **C7** [src/capptron/contracts/output/models.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/models.py)：NormalizedPlan/Operation/Step；contracts/algorithm/models.py PlanProduced。

<a id="evidence-c8"></a>

- **C8** [src/capptron/algorithm/templates/case_import.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/algorithm/templates/case_import.py)：templates/chamfer.py、integration.py、parameters.py；来源attributes并非所有Live原生字段。

<a id="evidence-c9"></a>

- **C9** [src/capptron/contracts/output/profiles.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/output/profiles.py)：FieldDefinition.scope/public_path/declared_type/unit；不是完整参数编辑策略；archive.profile.config.fields可追溯。

<a id="evidence-c10"></a>

- **C10** [src/capptron/contracts/resources/models.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/resources/models.py)：ResourceSnapshot/ResolvedResources是内部资源契约；无Foundation公开route。

<a id="evidence-c11"></a>

- **C11** [src/capptron/contracts/frontend/outputs.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/outputs.py)：routes/outputs.py；不返回完整NC或完整PreparedPlan。

<a id="evidence-c12"></a>

- **C12** [src/capptron/infrastructure/frontend/routes/process_cards.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/infrastructure/frontend/routes/process_cards.py)：app/process_card_handlers.py、contracts/frontend/identifiers.py、frontend/process_cards.py、process_card/models.py；docs/process-card.md。

<a id="evidence-c13"></a>

- **C13** [src/capptron/contracts/storage/models.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/storage/models.py)：ArchiveBundle；contracts/review/models.py、cam/inputs.py。

<a id="evidence-c14"></a>

- **C14** [src/capptron/contracts/feedback/models.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/feedback/models.py)：frontend/planning.py HumanFeedbackRequest；TemplatePlanner自然语言未应用。

<a id="evidence-c15"></a>

- **C15** [src/capptron/contracts/cam/workflow.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/workflow.py)：ReviseNcCommand；application/nc_revision.py；docs/integrations/cam-nc-use-cases.md。

<a id="evidence-c16"></a>

- **C16** [src/capptron/infrastructure/frontend/routes/cam.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/infrastructure/frontend/routes/cam.py)：contracts/frontend/cam.py、contracts/cam/workflow.py；app/cam_handlers.py。

<a id="evidence-c17"></a>

- **C17** [src/capptron/contracts/cam/inputs.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/inputs.py)：ApprovedPlanRef/CamRunContext；infrastructure/mastercam/approved_sample.py。

<a id="evidence-c18"></a>

- **C18** [src/capptron/contracts/cam/nc.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/cam/nc.py)：contracts/cam/workflow.py；application/nc_candidates.py、nc_text.py、nc_review.py；docs/integrations/cam-nc-use-cases.md。

<a id="evidence-c19"></a>

- **C19** [src/capptron/contracts/frontend/api.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/src/capptron/contracts/frontend/api.py)：frontend/models.py、health.py、common/models.py、common/errors.py；app/bootstrap.py、frontend/errors.py。

<a id="evidence-t1"></a>

- **T1** [tests/cad/test_parsing.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/cad/test_parsing.py)：tests/cad/test_upload.py、test_parse_review_regressions.py；本次只读测试源码。

<a id="evidence-t2"></a>

- **T2** [tests/infrastructure/frontend/test_planning.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/infrastructure/frontend/test_planning.py)：本次只读测试源码。

<a id="evidence-t3"></a>

- **T3** [tests/integration/test_template_revision_review_flow.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/integration/test_template_revision_review_flow.py)：tests/algorithm/test_template_integration_policy.py、tests/integration/test_pending_template_approval.py。

<a id="evidence-t4"></a>

- **T4** [tests/infrastructure/frontend/test_outputs.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/infrastructure/frontend/test_outputs.py)：tests/infrastructure/frontend/test_output_provenance.py。

<a id="evidence-t5"></a>

- **T5** [tests/infrastructure/frontend/test_process_cards.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/infrastructure/frontend/test_process_cards.py)：test_process_card_recovery.py。

<a id="evidence-t6"></a>

- **T6** [tests/infrastructure/frontend/test_cam.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/infrastructure/frontend/test_cam.py)：examples/cam/frontend/requests/、responses/；均为替身样例证据。

<a id="evidence-t7"></a>

- **T7** [tests/application/test_nc_candidates.py](https://github.com/cosmic-snail/CAPPtron-core/blob/a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef/tests/application/test_nc_candidates.py)：test_nc_text.py、test_nc_revision.py、test_nc_review.py；tests/infrastructure/storage/test_nc_export.py。

<a id="evidence-h1"></a>

- **H1** [src/api/core/client.ts](https://github.com/James-FE/CAPPtron-web/blob/c36b1597f25a983532df559d6dc6228b1872d87c/src/api/core/client.ts)：PR24历史实现，归档SHA；client.test.ts、viewModel.test.ts、golden.test.ts、e2e/core-workflow.spec.ts。
