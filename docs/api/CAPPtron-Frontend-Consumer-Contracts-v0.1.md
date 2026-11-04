# CAPPtron｜前端消费接口与前后端契约盘点 v0.1

> 日期：2026-10-23。性质：**需求盘点草案、协作接口清单，不是已冻结的后端 API 标准，也不代表全部功能已实现。**
>
> 审查基线：Web `main=d1975bd221420791fc1834b8e298f2fba3bb1701`；Web PR #24 `feat/golden-web-demo`（审查时开放，head `c36b1597f25a983532df559d6dc6228b1872d87c`）；Core 上游 `cosmic-snail/CAPPtron-core` main `7a1ddeda622...`，含 PR #149。**先核实运行中后端的 `/openapi.json` 和部署版本再实施。**

## 0. 执行结论

此前完成的是页面和局部数据组件，并非没有接口：数据底座有 `DataFoundationReader` 七个方法，案例库有 `CaseCatalogReader.listCases/getCaseVersion` 和 JSON Schema，历史程序有 `ProgramContentReader`；新 Core 联调有 `CoreClient`。真正的缺口是 **跨页面的前端消费需求（读什么、操作什么、版本/来源/错误语义）尚未统一规格化**，尤其是工序、工步、资源、参数及现场信息从 Core DTO 到 r06 ViewModel 的映射。不能把 UI 所需字段直接假定为 Core 的现有 Pydantic 字段。

**合作原则：** 前端提出「业务动作＋消费契约＋表现与状态需求」，Core 基于现有 HTTP/OpenAPI 确认业务真值和受信权限；Web Adapter 做实际 DTO→ViewModel 转换。不得让后端通过阅读 React JSX 猜数据协议，不得从前端直接复制 Mock JSON 作为生产请求格式。

## 1. 四层接口与职责

| 层次 | 输入与输出 | 权威/维护者 | 现状与规则 |
|---|---|---|---|
| ① UI 行为契约 | 用户动作、界面状态、字段、按钮条件 | Web 产品/前端 | 前端负责列完整需求，按 Figma r06 和实际操作审查 |
| ② 前端消费接口（Ports） | `CadGateway`、`PlanningGateway`、`CamGateway`、`NcGateway` 等方法 | Web 前端 | 页面只依赖类型接口，Mock/Live 分别实现；这是此次工作的重点 |
| ③ 后端 HTTP DTO | URL、请求/响应、错误码、鉴权、版本、命令回执 | Core/FastAPI `/openapi.json` | Core 已有许多端点，不应重新设计第二套 REST；生成类型并做运行时/契约检查 |
| ④ 工程事实与能力证据 | STEP/NX、工艺版本、CAM 运行、NC 文件、制造批准 | Core + NX/Mastercam/工艺负责人 | 前端不得根据本地按钮、JSON 数值或 Mock 自行确认执行资格 |

**三条当前既存边界**：

- `CaseCatalogReader`：静态版本化**参考案例**（Git + JSON），可用于 Demo，不等于生产任务/审批/运行历史。
- `DataFoundationReader`：工业资源**读取**契约；目前是经过人工验收的合成数据展示，不代表 Core 已有相同的生产 HTTP 服务。
- `CoreClient`：真实后端 HTTP 客户端；当前数据类型只描述了部分返回字段，在 UI 中还有临时拼接和硬编码的适配逻辑。

## 2. 全局接口与身份模型（G）

| ID | 前端需求与用户动作 | Core 现状 | 缺口/决定 |
|---|---|---|---|
| G-01 | 区分 Demo/Live；所有数字与程序有来源 | Web 模式切换 | 统一 `mode` 与页面来源标志；Live 失败绝不静默退回 Demo |
| G-02 | 任务身份、当前工艺 revision、feedback_version | `GET /planning/tasks/{task_id}` | 形成共享 `TaskContext`，所有页面用同一业务 ID，选择/切换任务时隔离旧值 |
| G-03 | 按任务重新进入工作流与恢复状态 | Task GET、run、结果、批准档案、CAM 查询可用 | 全任务持久恢复能力未完整保证；前端须明确可恢复范围、请求竞态、刷新行为 |
| G-04 | 服务连通性与后端能力可用性 | `GET /health`、`GET /cam/executor`、执行资格查询 | HTTP 健康≠NX/Mastercam 就绪；界面分层表达 |
| G-05 | 错误/诊断、加载/空/终态、重试 | Core 统一错误与 `request_id`/`trace_id` | 前端统一错误转换，保留可核对的错误码和追踪 ID；不展示内部主机路径/密钥 |
| G-06 | 命令幂等、结果不确定与执行状态 | Core 命令通常携 `command_id`；异步请求可返回 202 | 同一未知结果只能查询/重放**原命令**，绝不直接创建第二次 CAM 运行 |
| G-07 | 用户权限、审核声明 | 当前 `X-Reviewer-ID` 是声明而非认证 | 不把声明身份当成完整权限；后续正式部署需独立认证授权决策 |

## 3. 模型输入、STEP、设计文件解读（I）

| ID | 消费能力/页面行为 | 已有 Core HTTP | 当前程度/待确认内容 |
|---|---|---|---|
| I-01 | 选择 STEP/STP，显示本地文件名/大小/格式 | 前端本地，无需 HTTP | 区分 `local_selected` 与 `uploaded` |
| I-02 | 上传原始 STEP 并取得 asset_id 与 sha256 | `POST /cad/assets` | 已有；必须用原始 octet-stream 和稳定 command_id，不要 multipart 假设 |
| I-03 | 按 asset_id 查询资源和原始回执 | `GET /cad/assets/{asset_id}` | 已有；重启/刷新与文件校验语义需测试 |
| I-04 | 显式启动 NX 分析并保留 parse command_id | `POST /cad/assets/{asset_id}/parse` | 已有；上传成功与解析成功独立 |
| I-05 | 查询解析进度、失败原因、解析报告身份 | `GET /cad/assets/{asset_id}/parse?command_id=` | 已有；`parsed` 不代表制造可执行 |
| I-06 | 在设计文件解读中展示特征、坐标、面边、证据与待确认项 | 解析报告中可能含 analysis；后端存在规范化报告 | **前端消费结构未冻结**。要和 Core 明确列表/详情字段及状态，不可仅靠 `unknown` JSON 原样显示 |
| I-07 | 选择匹配的模板及版本/适用条件 | Core 当前固定 Golden 模板，存在后端目录实现 | **缺少适用于前端的通用可查询目录契约**；近期可以固定单模板，但不得推广成通用能力 |
| I-08 | 创建关联可信解析来源的规划任务 | `POST /planning/tasks` | 已有；携带 `asset_id/sha256/parse_command_id`，业务值必须由 Core 校验，前端声明不是几何事实 |
| I-09 | 模型 3D 预览/特征高亮 | 当前无已确认通用前端预览契约 | P2 需求：先明确几何产物形式、坐标转换和安全来源，再讨论接口 |

## 4. 工艺决策、工序、工步、参数与现场信息（P）

| ID | 消费能力/页面行为 | 已有 Core HTTP 或字段 | 缺口/优先级 |
|---|---|---|---|
| P-01 | 读取当前任务、revision 与反馈版本 | `GET /planning/tasks/{task_id}` | P0：权威身份；禁止旧修订被当作新修订 |
| P-02 | 显式请求生成/重规划 | `POST /planning/tasks/{task_id}/replan` | P0：202 只表示接受；命令与当前版本一致 |
| P-03 | 查询规划运行状态、结果与失败 | `GET /planning/tasks/{task_id}/runs/{run_id}` | P0：终态后才读取新结果，不能用超时当失败或成功 |
| P-04 | 读取完整工艺（任意道工序、步骤顺序、操作身份） | `GET /planning/tasks/{task_id}/results/{revision}` | P0：需要完整 DTO→`ProcessPlan` 映射；不写死六或七工序 |
| P-05 | 展示参数名称、单位、来源、值、可编辑性、适用范围 | 当前 `NormalizedPlan.operations[].attributes.parameters` 等 | **P0 关键缺口**：前端 PR #24 按 `rough_step` 等字段名自己补名字、单位和 editable，需权威字段描述/参数策略契约 |
| P-06 | 展示机床/刀具、工步关联及资源是否有效 | 现有 plan、资源配置、运行资料 | P0：区别 `resource ID`、显示名称、引用的工具/机床、验证状态；不能由 `${operationId}-tool` 伪造真实资源 ID |
| P-07 | 现场人工实测、任务级与工序级必填项 | 目前 Demo 本地草稿；Core feedback 可带 supplement | **P1 业务约定缺口**：哪些值需要提交、归属 task/operation/step、单位、来源、是否形成 revision、回读/审核谁负责 |
| P-08 | 受控参数修订（当前 Golden `rough_step`） | `POST .../replan` 的 `parameter_patch` | 已有；必须带 base revision、feedback version、plan/template digest，前端不得允许未声明的参数修改 |
| P-09 | 文本工艺反馈、补充信息、删除/回读 | `POST/GET/DELETE /planning/tasks/{id}/feedback` | 已有反馈记录能力，但不等于 Agent 真正理解并落实意见；定义显示和待处理语义 |
| P-10 | 读取工艺卡、审核状态、缺项和资料来源 | `GET /process-cards/tasks/{task_key}/results/{revision}` | 已有；`task_key` 不透明编码，不能假设直接拼 task_id |
| P-11 | 工艺卡 approve/reject、精准修订审核 | `POST .../review` | 已有；不可把卡片 `ready` 当 `execution_ready`，服务端决定能否批准 |
| P-12 | 已批准工艺归档、是否允许 CAM | `GET /archives/...` 与 `GET /cam/tasks/{id}/approved-plans` | 已有；要求展示当前 revision 匹配、工程状态及阻塞理由 |
| P-13 | 基于真实返回的工艺步骤详情 ViewModel | Web PR #24 `toProcessPlan()` | 已有初步映射；应检查空字段/来源/多工序及真实后端 DTO 兼容，禁止页面内 `Record<string, number>` 无类型乱写 |

## 5. CAM 执行与状态（C）

| ID | 消费能力/用户动作 | Core 端点 | 状态/约束 |
|---|---|---|---|
| C-01 | 读取是否存在可执行的当前批准版本 | `GET /cam/tasks/{task_id}/approved-plans` | 已有；`execution_configured`、`profile_matches` 与当前 revision 必须同时核对 |
| C-02 | 启动本次 CAM 运行 | `POST /cam/runs` | 已有；冻结 `plan_ref`、执行 profile、expected revision、command_id |
| C-03 | 读取任务历史 CAM run、状态/阶段 | `GET /cam/tasks/{id}/runs`、`GET /cam/runs/{run_id}` | 已有；状态不同于进度百分比，不臆造 ETA |
| C-04 | 观测活动运行、核实不确定结果 | `POST /cam/runs/{id}/observe`、`.../reconcile` | 已有；observe 不派发新加工，reconcile 不重复 CAM |
| C-05 | 取消、复位、控制回执核对、人工收尾 | `/cam/runs/{id}/cancel`、`/cam/executor/reset`、`/cam/controls/...`、`/cam/runs/{id}/closeout` | 后端已有，Web 只应按 allowed_actions 暴露；高级操作需要明确操作者权限 |
| C-06 | 展示执行证据、仿真、后处理阶段与异常 | `CamRunView` 及产物/运行数据 | 界面字段需求需联合细化；仿真完成、尺寸合格、制造批准分开显示 |

## 6. NC 程序、审核、下载与 Agent 修改（N/A）

| ID | 消费能力/用户动作 | Core 端点 | 状态/缺口 |
|---|---|---|---|
| N-01 | 列出 NC 版本、当前候选、来源与父版本 | `GET /cam/runs/{run_id}/nc/versions`、`GET .../{version}` | 已有，Web PR #24 已使用精确候选，仍需完整版本导航 |
| N-02 | 逐文件读取 NC 正文、编码、换行与摘要 | `GET .../{version}/file?file_id=` | 已有；`file_id` 可含 `/`，必须经查询参数编码；全文未加载不得批准 |
| N-03 | 查看 NC 不同版本的 diff/修改原因 | `GET .../{version}/comparison` | Core 已有，正式 r06 Live 展示尚需接入 |
| N-04 | 编辑后保存 NC 形成新服务器版本 | `POST /cam/runs/{id}/nc/versions` | **Core 已有，Web Live 尚未实现**；UI 本地草稿≠已保存 NC，提交必须指向精确基线 |
| N-05 | 基于指定 NC 版本的 Agent 提示修正 | `POST .../{version}/revise` | Core 已有受控修正结果：`nc_edit`、`cam_rerun`、`needs_plan_change`；未形成完整通用聊天服务 |
| N-06 | NC 版本 approve/reject、历史回读 | `POST .../{version}/review`，版本 GET | 已有；审核指定版本和摘要，不能批准另一个候选 |
| N-07 | 仅下载精确已批准 NC ZIP | `GET .../{version}/download` | 已有；按服务端准入与原始文件字节下载，不能用案例 JSON 或前端造 `.nc` |
| A-01 | Agent 对话显示、消息上下文、运行关联、历史 | Demo `createDemoExchange`；Core 有 feedback/revise 但非统一聊天历史 | **需求未冻结**：需明确消息身份、task/operation/NC 范围及是否需要对话历史 API |
| A-02 | Agent 对工艺的反馈与执行建议 | Core feedback、显式 replan | 反馈被记录不等于工艺已改变；需产品定义如何显示 accepted/applied/rejected |
| A-03 | Agent 对 NC 的建议及原程序差异 | Core revise + comparison | 应复用已有 NC 版本/修正入口，不要新开一套不受控的程序编辑接口 |

## 7. 参考案例、知识与数据底座（R/F）

| ID | 前端需求 | 已有接口 | 下一步 |
|---|---|---|---|
| R-01 | 列出参考案例及指定版本 | `CaseCatalogReader.listCases()` / `.getCaseVersion()` | **已经设计了接口**：底层可为 Git 静态 JSON。保持完整摘要/版本校验，无须仅为“看起来像 API”就新增后端服务 |
| R-02 | 案例展示→`ProcessPlan` | `caseToProcessPlan()` | 保留 Demo/历史属性；不能自动当成当前任务的生产准入工艺 |
| R-03 | 参考案例与 Core 模板注册信息关联 | Core 有 Golden 模板包、受控版本和 digest | **需要版本对应与单一权威发布策略**：Case v2 参考与 Golden 模板 v2.3.0 是不同对象，不可按 `v2` 当 `2.3.0` 使用 |
| F-01 | 总览 KPI | `DataFoundationReader.getOverview()` | 已有 Mock 读取契约；真实后端统计资源尚未对接 |
| F-02 | 7 日趋势 | `.getGrowthTrend()` | 保持统计口径、来源/快照标识 |
| F-03 | 知识构成 | `.getKnowledgeDistribution()` | 知识来源与分类互斥性由数据源保证 |
| F-04 | 六类资源汇总 | `.getResourceSummary()` | 目录记录不代表设备在线或真实模型已部署 |
| F-05 | 热点知识 | `.getHotAssets()` | 计数来源与时间窗口清晰 |
| F-06 | 资源目录分页/筛选 | `.listAssets()` | 保持分组、排序、分页与查询正确 |
| F-07 | 资源详情 | `.getAssetDetail()` | 关联 ID 与来源可追踪；未来新增 `HttpDataFoundationReader`，不是直接改 UI |

## 8. 当前最需要前后端共同决定的 8 件事

| 编号 | 待决策主题 | 谁先提出 | 为什么重要 / 推荐方式 |
|---|---|---|---|
| D-01 | 规划结果的参数字段描述：label/unit/source/edit policy/range/allowed values | Web 出 UI 清单，Core 给可信元数据 | **第一优先**。不能在 `viewModel.ts` 根据参数名称猜单位或写可编辑权限 |
| D-02 | Operations/Steps/Setup/Tool/Machine 的最小字段及稳定 IDs | Web + Core | 对七工序、后续任意工序数量都可渲染；不能拼假的 ID |
| D-03 | 现场信息归属、写入、回读、何时影响 revision/审批 | 产品/工艺负责人 + Core | 现在主要是本地草稿；不要把人工输入直接提升成已验证制造事实 |
| D-04 | 设计文件解读需要的结构化特征视图 | CAD/特征团队 + Web | 保留面边、尺寸、轴、证据/置信度/待确认；解析成功≠可信制造准入 |
| D-05 | Demo Case 与服务端模板目录关系 | 前端 + Core | 示例是不可变参考，执行模板是受控工程资产；版本需要映射但不能混为一类 |
| D-06 | 真实 Agent 的最小产品语义 | 产品 + Core | 先重用 feedback 与 NC revise；决定是否真的需要通用聊天会话与流式消息 |
| D-07 | NC 编辑器 Live 保存、diff、回滚/修订路径 | Web + Core | Core 的 NC 版本 API 已有，但前端目前 Live 只读；优先复用旧接口 |
| D-08 | 任务恢复/可用性/失败回执 | Web + Core | 明确任务状态在服务器重启后保留到什么程度；前端不得用本地 React state 伪装持久化 |

## 9. 对接流程与验收产物

**FE-CONTRACT-001（只做契约盘点，不重构页面）：**

1. 以 `main` 为事实基线，同时检查当前 PR #24（未合并的实现单列）；建立「每个 UI 控件 → 前端 Port 方法 → 已有 HTTP 接口 → request/response 字段 → 状态/错误 → 测试」对照。
2. 在正在运行的 Core 实例导出 `/openapi.json`（记录 Core commit）；用生成类型而不是手写孤立 DTO，核对实际响应样例。没有的端点标 `needs_backend_contract`；不要虚构 URL。
3. 把接口需求分成 `covered`（Core 已有且契合）、`adapt`（Core 已有但前端需 DTO→VM 转换）、`missing_backend`（真正需要 Core 新能力）、`demo_only`（不需要真实 API）、`deferred`（不阻塞当前固定 Golden）。
4. 为每个 `missing_backend` 写最小可讨论 RFC：用户场景、字段、状态、权限、示例和失败模式。**不是**先写一堆空接口文件要求后端实现。
5. 每个重要模块提供至少两个 contract fixture：正确结果和非理想结果（缺字段、旧版本、失败、权限不足、空列表）。
6. 后端同事复核并在协作文档标注负责人/需要修改的 Core 接口/预计实施 PR；前端按已确认契约落实 Gateway/Adapter，并回归现有页面。

建议落点（仅说明职责，不要求全部新建文件）：

```text
src/api/
  core/generated/             # 从真实 Core /openapi.json 生成的 TypeScript DTO（如采用生成器）
  core/client.ts               # 统一 HTTP 传输和错误边界
  ports/                       # 前端消费接口，按域划分
    cad.ts
    planning.ts
    cam.ts
    nc.ts
    agent.ts                  # 先定义需求，未启用之前不假实现
  adapters/
    core/                      # Core DTO -> 前端可展示模型 / 用户命令映射
  case-catalog/                # 已有 CaseCatalogReader
  data-foundation/             # 已有 DataFoundationReader
  program-content/             # 已有 ProgramContentReader
```

不要把页面组件里的 `fetch`、REST 路径拼接、字段格式化和业务版本逻辑混在一起；但也不要把简单模块拆成多个微服务或引入额外 BFF。

## 10. 跨端验收清单

- **接口版本**：核对 Core/Web 精确 commit 和 `/openapi.json`；Mock/Live 切换无污染。
- **任务身份**：asset → parse command → task → revision → approved plan → CAM run → NC ref 可逐级追踪。
- **工序数量**：至少 0、1、6、7、20 道工序的显示契约覆盖；新 Golden 已有七工序，不能硬编码六。
- **字段与权限**：参数单位、可修改范围、缺失值、来源、只读状态来自权威契约；未知默认只读。
- **异步与错误**：202、409、422、503、超时、回复丢失等显示真实状态，不丢身份、不重复制造指令。
- **版本与审核**：修改工艺使旧 NC/批准失效；工艺卡批准与 NC 批准分开；只对指定版本读/存/审/下载。
- **浏览器 E2E**：API 替身测 UI，真实浏览器+Windows Core+NX/Mastercam 联调另立证据，不能互替。
- **制造语义**：报告解析、工艺卡 ready、CAM succeeded、NC pending、人工审核、尺寸/碰撞验收是不同层级。

## 11. 核查引用（2026-10-23）

Web：

- https://github.com/James-FE/CAPPtron-web/blob/main/src/api/data-foundation/reader.ts
- https://github.com/James-FE/CAPPtron-web/blob/main/src/api/case-catalog/types.ts
- https://github.com/James-FE/CAPPtron-web/blob/main/src/api/case-catalog/JsonCaseCatalogReader.ts
- https://github.com/James-FE/CAPPtron-web/blob/main/src/api/core/client.ts
- https://github.com/James-FE/CAPPtron-web/blob/main/src/features/process-planning/processPlan.ts
- https://github.com/James-FE/CAPPtron-web/pull/24
- https://github.com/James-FE/CAPPtron-web/blob/c36b1597f25a983532df559d6dc6228b1872d87c/src/api/core/viewModel.ts

Core：

- https://github.com/cosmic-snail/CAPPtron-core/blob/main/docs/http.md
- https://github.com/cosmic-snail/CAPPtron-core/blob/main/docs/algorithm.md
- https://github.com/cosmic-snail/CAPPtron-core/blob/main/docs/integrations/mastercam-frontend.md
- https://github.com/cosmic-snail/CAPPtron-core/pull/149
- https://github.com/cosmic-snail/CAPPtron-core/blob/main/docs/validation/golden-seven-operation-nc-2026-10-23.md

> 本清单是第一轮「前端实际需要什么」的业务需求盘点。正式对接须由两端共同核对运行时 OpenAPI、响应样本及 PR #24 的最终合并实现，并通过双方验收后再冻结版本。
