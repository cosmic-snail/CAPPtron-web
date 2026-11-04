# CAPPtron Web 前端架构与工程化设计说明书

> **版本**：v0.1（设计评审稿）  
> **日期**：2026-10-14  
> **适用范围**：CNC Agentic Programming Web 前端 / Figma r06 工程化  
> **实施状态**：本文保留初始设计基线；各阶段的实际实现以对应验收文档为准。FE-004B 数据底座实现见[验收记录](../workflows/FE-004B-ACCEPTANCE.md)，不表示后端 CAM 能力已验收。<br>
> **建议入库路径**：`CAPPtron-web/docs/architecture/frontend-architecture.md`  
> **核心原则**：先实现核心界面，再接真实业务；非核心增强功能先 Mock；不把示例数据固化为产品结构。

---

## 0. 执行摘要与已确定决策

### 0.1 项目目标

在现有 **Figma r06** 原型和 **CAPPtron-core** Python 业务后端基础上，建立一个可维护、可联调、可逐步替换 Mock 的工业智能编程 Web 前端。第一阶段关注 **模型输入 → 工艺决策（工序、工步、资源与参数）→ 程序审核** 的界面、数据驱动展示、必要用户交互和可验证的演示流程，而不是一次性实现完整 CAM 或三维 CAD 系统。

“核心界面完成”的含义是：界面结构稳定、数据由结构化对象驱动、关键操作能够反馈、多个示例任务可正确展示、模拟数据与真实数据来源可区分；**不意味着已生成可加工 NC 程序，也不意味着生产就绪**。

### 0.2 优先级与范围控制

| 层级 | 交付内容 | 第一版验收方式 | 延迟内容 |
|---|---|---|---|
| **P0 / 核心显示与交互** | r06 主要页面、导航、动态工序/工步、参数与资源、现场补充入口、Agent 抽屉、程序审核视图、数据底座展示、空/加载/错误状态 | 使用不同规模的 Mock 任务，完整演示页面及核心用户操作 | 真实 CAM、真实 Agent、数据持久化 |
| **P1 / 现有后端联调** | 接入 FastAPI 既有可用端点；任务/版本/反馈/快照/状态查询；与后端对齐的审核接口边界 | 本地联调与契约测试，记录真实返回与失败场景 | 尚未发布的业务端点不得假设存在 |
| **P2 / 增强能力** | STEP 三维模型预览、CAD 特征高亮、真实几何解析、高级图形可视化、复杂动画 | 在 P0/P1 稳定后独立评估价值与技术成本 | 第一版全部采用明确标识的示意/占位，不阻塞主线 |

**特别决策**：STEP 文件作为输入来源与 STEP 三维展示是两个功能。P0 可提供文件选择、文件名/大小/后缀展示及前端校验；但若后端没有文件上传/存储接口，必须明确标注“本地选择 / 尚未上传”，不得伪装服务端已接收或已解析。P2 才决定 STEP 解析、几何转换与渲染方案；第一版不选型复杂的三维 CAD 引擎。

### 0.3 非目标

首版不实施 MES/ERP 全功能，不自行建设 CAM 内核，不在浏览器中直连 Mastercam，不引入微前端、微服务、GraphQL、复杂工作流引擎、独立 BFF 或重型业务状态机。非必需的知识库管理、三维识别、真实仿真及高级监控均不作为 P0 的前置条件。

---

## 1. 事实依据、设计权威与版本管理

### 1.1 核对依据（截至 2026-10-14）

**Figma**：`r06_Contextual_Agent` 页面（文件 Key `87LfnDXn7hlAF5NiaQVNPK`）。审查了页面层级、`r06/00_Interaction_Spec` 中的文字约定及以下关键场景：

- `166:1174` — `r06/upload`：模型输入；
- `166:1210` — `r06/plan`：工序列表与右侧工步详情；
- `166:1261` — `r06/parameters`：参数、资源、现场约束；
- `166:1311` — `r06/review`：NC 程序审核示例；
- `171:284` — `r06/agentoverlay`：Agent 协同抽屉；
- `166:333` — `01_Data_Foundation`：数据底座；
- `179:317` — `r06/00_Interaction_Spec`：关键交互规则。

**后端**：[CAPPtron-core](https://github.com/James-FE/CAPPtron-core)，重点参见：[HTTP](https://github.com/James-FE/CAPPtron-core/blob/main/docs/http.md)、[算法 API](https://github.com/James-FE/CAPPtron-core/blob/main/docs/algorithm.md)、[前端发布契约](https://github.com/James-FE/CAPPtron-core/blob/main/docs/frontend-contracts.md)、[输出](https://github.com/James-FE/CAPPtron-core/blob/main/docs/output.md)、[工艺卡/审核/归档](https://github.com/James-FE/CAPPtron-core/blob/main/docs/process-card.md)、[Mastercam 部署验证](https://github.com/James-FE/CAPPtron-core/blob/main/docs/validation/mastercam/deployment.md)。

**谨慎说明**：仓库部分概览段落仍写“工艺卡尚未实现”，而较新的 `process-card.md` 已列出工艺卡审批与归档 HTTP 接口。本文以细分模块文档描述其设计现状，接入前仍以实际运行的 `/openapi.json`、服务启动与集成测试作为最终证据。**不能仅因文档列出接口就断定本地部署已可用。**

### 1.2 权威来源分工

| 内容 | 主要权威 | 冲突时的处理 |
|---|---|---|
| 页面布局、视觉语言、导航意图 | Figma r06；本文件规范化后的 design tokens | 保留 r06 的主要视觉方向；允许适应动态数据的布局修正 |
| 业务输入输出、身份、版本和错误 | `CAPPtron-core/contracts` + `/openapi.json` | 后端契约优先；前端不能发明权威业务状态 |
| 用户操作语义及页面交互 | 本文件的交互规范 | 对照真实业务流程审查；不能只复制 Figma 的 Demo 点击路径 |
| 已实现能力 | 可运行代码 + 测试 + 验收证据 | Mock 与真实必须明确区分 |
| 页面渲染状态与临时选择 | React 前端 | 仅保存 UI 临时状态，不能覆盖服务端权威数据 |

文档作为版本化设计资产与代码一同维护，变更重大结构需记录原因；普通按钮文案和局部微调不必设立正式设计决策流程。

---

## 2. 用户流程、信息架构与页面映射

### 2.1 核心流程

```text
选择 / 记录模型文件
        ↓
模型输入与输入准备
        ↓
工艺决策
  ├─ 工序列表（动态数量）
  ├─ 工步详情（随工序切换）
  ├─ 资源与推荐参数
  ├─ 现场条件补充 / 人工实测
  └─ Agent 协同（同一任务上下文）
        ↓
生成请求（P0 为 Mock；真实业务能力待后端提供）
        ↓
NC 程序审核视图（样例或真实程序版本）
  ├─ 代码查看
  ├─ 意见 / 修订入口
  ├─ 人工确认（明确区分 Mock）
  └─ 下载入口（真实文件可用时开放）
```

`数据底座` 为独立导航区域，不是上述流程的强制步骤。`设计文件解读` 在 r06 中是辅助展示页/入口，不代表浏览器已能解析 STEP 几何。

### 2.2 r06 静态场景到 React 页面/状态的映射

| r06 原型场景 | React 工程目标 | 处理方式 |
|---|---|---|
| `r06/upload` | `ModelInputPage` | 真页面，输入状态按任务更新 |
| `r06/plan` | `ProcessPlanningPage` | 真页面；一个工序列表驱动右侧详情 |
| `r06/parameters`、`r06/paramready`、`r06/changed` | `ProcessPlanningPage` 的子视图与数据状态 | 不复制出三个业务页面；依据字段完整性和版本变化渲染 |
| `r06/fields` | `OnsiteMeasurementsPanel` | 工序上下文内的独立面板/子路由，可局部滚动 |
| `r06/review`、`r06/review2`、`r06/approved`、`r06/approved_v1` | `ProgramReviewPage` | 一个页面依据版本及审核状态显示 |
| `r06/codefull1`、`r06/codefull2` | `NcCodeViewer` 展开模式 | 同一组件，不因 NC 版本复制页面 |
| `r06/agentoverlay` | `AgentDrawer` | 任务级共享抽屉；非独立业务页 |
| `05_Design_Interpretation_F01–F04` | `DesignInterpretationPage` 或辅助面板 | 预设的特征选择展示；P2 才考虑真实模型特征高亮 |
| `01_Data_Foundation` | `DataFoundationPage` | P0 以清晰标注的 Mock 统计展示为主 |

**初始路由建议**（实现可因现有总仓结构微调）：

```text
/data
/input
/tasks/:taskId/plan
/tasks/:taskId/review
/tasks/:taskId/interpretation   # 辅助入口，允许独立实现或抽屉化
```

无任务时不可假定存在 `taskId`；打开示例任务应有明确 `demo` 标记或独立的 Mock 任务 ID。刷新带 `taskId` 的页面后应重新查询/恢复状态，未知任务展示可理解的空/失效状态，而不是无条件回到固定圆环演示。

### 2.3 需要保留的交互约定

源自 Figma `r06/00_Interaction_Spec`：

1. 主阶段为 **模型输入 → 工艺决策 → 程序审核**，参数/资源/现场约束属于工艺决策。
2. 工序选中后**原位更新**右侧工步详情，标题与来源固定；不恢复原先的工序详情弹窗。
3. 工序列表、工步参数、现场信息、代码正文、对话记录各有独立滚动区域。NC 代码需要纵/横滚动，Agent 输入区固定。
4. Agent 气泡在数据底座和模型上传页隐藏；工作页面共享对话入口。设计要求默认右下、允许拖动并记忆位置（Figma 原型固定演示）。
5. 进入审核可以通过主要 CTA 或顶部流程导航；真实业务应在必要条件符合后才能生成，**不能将原型的直接跳转视为完成真实 CAM 生成**。
6. 修改参数、现场约束或 Agent 建议后，关联程序可能过期；页面至少要能提示“需重新生成/重新审核”。

---

## 3. 技术栈与选择理由

| 领域 | 建议方案 | 选择理由 / 约束 |
|---|---|---|
| 语言及前端 | React + TypeScript | 长期可维护的组件化与类型系统；支持复杂工业控制台 |
| 工具链 | Vite | 纯客户端应用；无需 SSR、SEO 或 Next.js 服务器 |
| 样式与组件 | Tailwind CSS + shadcn/ui | 便于还原 r06、共享基础组件；不能用组件库默认主题覆盖视觉设计 |
| 路由 | React Router | 清晰表达任务页面及深链接 |
| 服务端数据 | TanStack Query | 缓存、查询、刷新、请求状态；服务端业务真值保留在后端 |
| 界面临时状态 | Zustand + React 本地状态 | 当前工序、抽屉位置、展示模式；避免冗余全局状态 |
| HTTP/类型 | OpenAPI → TS types + 轻量 API client | FastAPI 现有 OpenAPI 契约；动态 payload 须补充显式校验 |
| NC 程序浏览 | Monaco Editor（延迟加载） | 纵横滚动、行号和可扩展语法规则；初版只读 |
| 测试 | Vitest + React Testing Library + Playwright | 组件逻辑与用户流程、视觉回归 |
| 开发 Mock | 显式 `MockApi` + fixtures（必要时 MSW） | 不依赖后端全部完成就能交互；保留切换真实 API 的边界 |
| STEP 三维渲染 | **P0 不选型** | 先 Mock；另立 P2 技术评估，不让依赖提前进入主包 |

版本与包管理：初始化时选择兼容版本并锁定 `package-lock.json`/等效 lockfile；CI 使用锁文件安装。避免文档写死未经环境验证的具体版本号。

**不选 Electron/Tauri 的理由**：第一版是浏览器 + FastAPI 的工作台；即使需要离线本机部署，也能服务静态资源和本地 API。除非后续需要操作系统原生窗口、特殊文件/设备能力，再单独评估桌面封装。

---

## 4. 系统架构与责任边界

```text
[浏览器：CAPPtron Web]
  Pages / Business Components
     ├─ API Layer (contracts, mapping, mock/live switch)
     ├─ Query Cache (任务、工艺、结果、快照)
     └─ UI State (当前选中、抽屉、局部布局)
                │ HTTPS/HTTP JSON
                ▼
[CAPPtron-core / FastAPI]
  input → algorithm/Agent provider → output/process-card
  contracts, revision, feedback, review gate, archival
                │ 服务端适配层
                ▼
[Windows Mastercam Worker / CAM SDK]
```

边界规则：

- 浏览器只通过 CAPPtron-core 暴露的 HTTP API 访问业务；不直接连接 Mastercam、IPC、Windows 管道、SSH 或 CAM SDK。
- 后端业务 ID、`revision`、`feedback_version`、`run_id` 等是权威；前端不能凭数组序号或随机值伪造版本。
- 页面组件不能直接拼 URL 和 `fetch`；统一通过 `src/api` 实现认证头（后续）、超时、错误映射、追踪 ID 与响应转换。
- 不增加独立 BFF；已有 FastAPI 本身承担后端接口协调。
- Mock 和真实数据使用一致的 **前端 ViewModel 形态**，但不得用 Mock 属性冒充已公开的后端字段。

**部署边界**：优先单一内网应用；开发时 Vite 与 FastAPI 分端口，设置明确的 CORS Origin。生产优先同域静态文件/API 代理。CORS 不是身份认证；现有审核头 `X-Reviewer-ID` 仅是身份声明，未实现真实鉴权，不能直接暴露不可信网络或允许未经授权的 CAM 操作。

---

## 5. 数据驱动展示与 ViewModel

### 5.1 设计原则

- 前端支持任意 `operations.length`，不能把“圆环九道工序”硬编码成九个节点。
- 工序/工步使用稳定 ID，不使用显示序号作为唯一标识。顺序和身份分离。
- 每个工步可能没有说明、参数、刀具或资源。缺失值显示“待补充/暂无数据”，**不能凭空补造数值**。
- 参数需要保留 `unit`、`source`（模板/上游/Agent/人工/Mock）、可编辑性和当前展示值；来源必须来自契约或适配逻辑，不能在页面写死。
- 制造约束与现场测量值不应被默认视为 Agent 自动确定；人工实测需标记来源与确认情况。
- ViewModel 允许为显示而聚合，但不得未经许可向后端回写未经验证的内容。

### 5.2 建议的前端显示类型（内部类型，不是替代 Pydantic 契约）

```ts
type DataOrigin = 'real' | 'mock';
type ParameterSource = 'template' | 'upstream' | 'agent' | 'human' | 'mock' | 'unknown';

type ParameterVM = {
  key: string;
  label: string;
  value: string | number | null;
  unit?: string;
  source: ParameterSource;
  editable: boolean;
};

type StepVM = {
  id: string;
  sequence: number;
  name: string;
  description?: string;
  parameters: ParameterVM[];
};

type OperationVM = {
  id: string;
  sequence: number;
  name: string;
  steps: StepVM[];
  parameters: ParameterVM[];
  resourceLabels: string[];
  onsiteItems: ParameterVM[];
};

type PlanningTaskVM = {
  taskId: string;
  partLabel: string;
  inputFileName?: string;
  revision: number | null;
  feedbackVersion: number | null;
  origin: DataOrigin;
  operations: OperationVM[];
};
```

正式接入时必须写 `fromApiToTaskVM(...)`，以生成的 OpenAPI 类型/真实 JSON 结构为输入。这里的 `StepVM.parameters` 等字段是 UI **理想显示模型**，不意味着当前 `NormalizedPlan` 已提供全部参数、测量和资源字段。实际没有的字段为空或 Mock，不能从任务 ID 反推业务数据。

### 5.3 必备测试数据（fixtures）

| Fixture | 必测情况 | 用途 |
|---|---|---|
| `ring-demo` | 圆环样例，9 道工序，部分工步和参数存在 | 对照 r06 默认布局 |
| `short-plan` | 另一零件，2 道工序，字段不同 | 排除“只适用于圆环” |
| `large-plan` | 15～25 道工序、长工步文本 | 验证独立滚动与长内容 |
| `incomplete-plan` | 工步缺失、资源/实测未提供 | 验证空状态和约束提示 |
| `changed-plan` | 相同任务的新修订、工序增删与次序调整 | 验证选中状态、数据刷新与程序过期提示 |
| `api-error` | 查询失败、任务不存在、服务不可用 | 验证故障反馈与恢复入口 |

上述内容均为前端测试数据，不代表机器真实工艺建议。

---

## 6. 状态管理与关键一致性规则

**状态分层**：

1. **URL / 路由**：`taskId` 和当前页面，供刷新/复制链接使用。
2. **TanStack Query**：后端任务、规划修订、反馈、运行、工艺卡、审核和快照，按 ID/修订构成稳定 Query Key。
3. **Zustand**：当前选中的工序 ID、抽屉开启和位置、界面展示偏好。按任务隔离与清理，避免任务 A 的选择污染任务 B。
4. **React 局部状态**：临时输入框、弹出菜单、代码区域展开、当前编辑字段等；提交成功后由后端响应和 Query invalidation 更新数据。

**最小一致性规则**：

- 切换工序用 `operation.id` 定位；新修订删除该工序后，回退首个合法工序或空状态。
- Agent 的上下文展示与当前任务/当前工序同步；P0 的对话明确为预设演示，不伪称真实模型理解。
- 修改参数或反馈后，前端不能把旧 NC 版本标记为仍与当前工艺匹配；必要时显示“待重新生成/审核”。
- 后端 `completed` 只是规划运行结束；不等于输出就绪、卡片批准、CAM 仿真通过或 NC 可加工。
- `FrontendPublisher` 的 `available` 只表示快照可读取，不表示浏览器已收到或数据已落盘。
- 运行中的按钮可以禁用重复提交；恢复/重试必须尊重后端 `command_id` 的幂等规则，不因超时盲目发新命令。

当前后端快照单进程内存保存、进程重启会丢失；因此不能将其误作永久历史。第一版轮询任务状态即可，暂不引入 WebSocket；若后来存在高频实时日志需求，再评估 SSE。

---

## 7. API 集成与 Mock 边界

### 7.1 可优先核验并逐步集成的 HTTP 端点

| 端点 | 前端用途 | 备注 |
|---|---|---|
| `GET /health` | 服务连通性 | **只代表 HTTP 存活**，不代表 Mastercam 就绪 |
| `POST /inputs/prepare` | 结构化 JSON 输入准备 | **不是 STEP 文件上传端点** |
| `POST /planning/tasks` | 创建规划任务 | 创建不自动运行算法 |
| `GET /planning/tasks/{task_id}` | 读取任务与版本 | 真实业务状态来源 |
| `POST /planning/tasks/{task_id}/feedback` | 用户反馈/补充 | 添加反馈本身不自动重规划 |
| `POST /planning/tasks/{task_id}/replan` | 显式发起重规划 | 接受后通过运行 ID 查询 |
| `GET /planning/tasks/{task_id}/runs/{run_id}` | 查询规划运行情况 | 关注失败原因与待重规划 |
| `GET /planning/tasks/{task_id}/results/{revision}` | 查询某一规划结果 | 当前 Provider 仍是 Mock |
| `GET /frontend/tasks/{task_id}/snapshots` | 读取最新发布快照 | 内存通道，重启失效 |
| `GET /outputs/tasks/{task_id}/latest` | 查询输出校验/准备状态 | **不直接返回完整 NC 程序** |
| `GET /process-cards/tasks/{task_key}/results/{revision}` | 工艺卡读取与审核信息 | `task_key` 是不透明编码令牌，来源需正确处理 |
| `POST /process-cards/tasks/{task_key}/results/{revision}/review` | **工艺卡**批准/驳回 | 不等于 r06 中 NC 程序的审核 |
| `GET /archives/tasks/{task_id}/results/{result_id}/revisions/{revision}` | 查询已归档工艺卡 | 与运行中内存任务状态不同 |

上述端点来自后端仓库文档。执行 P1 之前需启动本地服务、读取 `/openapi.json` 并做响应结构核验，不能直接按文档中的想象字段编码。

### 7.2 不能假定已经存在的真实能力

| 能力 | P0 表现 | 后端接入前的明确边界 |
|---|---|---|
| 浏览器上传 STEP 到服务器 | 本地选择文件 + 元数据显示 | 需要文件上传/存储/解析接口；不得显示“已成功解析” |
| STEP 三维预览 | 通用模型占位图、可替换预览面板 | 不解析真实几何；不应误标为实际 CAD 模型 |
| 实时 Agent 聊天与修改工艺 | 演示对话、预设响应与界面反馈 | 不伪造模型推理/真实工艺修改成功 |
| CAM 自动生成 NC | 生成按钮展示 Mock 流程 | 没有通过真实接口前不能宣称“程序生成成功” |
| NC 程序审核/批准 | 可演示本地页面状态 | 不直接调用工艺卡审核端点冒充 NC 审核 |
| NC 程序下载 | 按钮 + “暂无真实可下载文件”反馈 | 不输出可误用的伪造 `.nc` 文件；必要的演示文本用 `.txt` 并标注不可执行 |
| 数据底座 KPI | Mock 指标和列表 | 未核验统计 API 前不得显示为真实系统数据 |

### 7.3 Mock / Live 切换策略

- 由显式环境配置或开发菜单选择 `mock` / `live`；生产默认不得悄悄退回 Mock 后继续宣称真实结果。
- Mock 适配器返回与 ViewModel 兼容的结构，真实 API 由适配器转换；页面不直接读取 fixtures。
- 在页面显著位置对 Mock 模式/示例数据设置一次性来源标识，不必给每个数字都反复上色。
- Live 失败应显示错误与重试入口，不自动拿假数据“填充成功”。
- 样例文件、假 NC 文本、模拟接口必须与真实产物隔离，不参加正式导出和审批。

---

## 8. 页面行为与交互规范（轻量，不做大型状态机）

统一只回答：**用户操作 → 系统行为 → 可见反馈**。实现阶段如果出现真实需要再新增例外规则。

| 用户操作 | 系统行为 | 页面反馈 |
|---|---|---|
| 选择模型文件 | 本地检查格式/体积，保存临时选择 | 文件名、选择状态或错误；不冒充上传成功 |
| 打开圆环示例 | 加载 Mock 任务 | 明确显示 Demo 标识及示例工序 |
| 选择工序 | 更新当前 `operationId` | 右侧工步、参数和上下文同步刷新 |
| 查看现场条件 | 打开当前工序的表单 | 显示已有值、缺失项和可编辑范围 |
| 补充/修改参数 | P0 更新草稿并反馈；P1 按后端契约提交 | 成功/失败与未保存提示；不强行声称 CAM 已同步 |
| 发送 Agent 消息 | P0 演示回复；P1 真实模型接口另行接入 | 对话出现响应，显示真实/演示来源 |
| 生成并进入审核 | P0 执行演示跳转；P1 等候明确业务回执 | 生成中、不可用、或明确 Demo 程序 |
| 展开 NC 正文 | 打开只读代码查看 | 文本纵横滚动，版本名与来源固定可见 |
| 确认可用 | P0 仅演示页面状态；真实审批按对应产物接口 | 显示人工确认状态，但不宣称仿真或实机验证完成 |
| 下载程序 | 仅在真实可下载产物存在时执行 | 下载或“暂无真实程序可下载”说明 |

通用约定：所有可点击的主要控件都应有可见结果；禁用需说明原因；表单校验先保留最必要的非空、格式、单位范围等要求，不提前建设通用审批工作流。

---

## 9. UI / UX 设计系统与屏幕规则

### 9.1 r06 设计令牌（首轮从设计节点观察，最终需视觉校验）

- 基准画布：**1920 × 1080**；验证另一常用桌面尺寸 **1440 × 900**。不是按缩放整张截图适配。
- 字体：r06 工艺决策页面文字主要使用 **Noto Sans SC**。在 CSS 声明合理中文回退，不将私有字体文件提交或外发；离线部署不得依赖运行时 CDN。
- 观察到的常用底色：`#101516`（外层背景 / 暗面板）、`#192123`（主要容器）；分隔与次级色包含 `#3b4b4e`。
- 观察到的文字色包含 `#f0f5f3`、`#a8b8b7`；强调色有 `#64dfc4`，另有警示/信息辅助色。具体 token 命名及适用位置以完整视觉检查为准。

为颜色、字号、间距、边框、阴影、滚动条定义语义 Token，例如 `surface.canvas`、`surface.panel`、`text.primary`、`accent.primary`、`border.subtle`。**不要把这些颜色直接复制进每个组件。**

### 9.2 布局规则

- 核心工作区保持高信息密度和明确视觉层级，不替换成普通白底 SaaS 样式。
- 主导航、流程导航与主要 CTA 保持稳定位置；数据密度增加时优先内容区内部滚动。
- 工序列表、右侧工步详情、现场参数区域分别滚动，切换工序不应滚动整个页面到不可预测位置。
- 对长文本采用换行/省略与可展开策略；参数单位和来源尽量与值保持可辨识关系。
- 代码查看区高度受父容器约束，横向溢出允许滚动，不强制折行破坏 NC 排版。
- Agent 抽屉由单例协调，默认右下；可拖动、位置记忆属于 P0 可用性改进，但不必引入复杂窗口管理器。

### 9.3 状态与可用性

必须为任务未选择、加载中、加载失败、任务不存在、工序为空、字段缺失、Mock、修订过期提供清晰视图。项目第一版不要求列出所有工业异常码的专属 UI；未知错误统一保留可读信息和 `request_id`/`trace_id` 以便排查。

---

## 10. 组件分层与前端目录

### 10.1 组件边界

- **Application Shell**：品牌区、顶部导航、流程阶段条、全局提示。
- **Pages**：负责路由级数据加载、错误边界、页面组合；不写大块可重复业务控件。
- **Features**：工序列表、工步详情、参数表、现场条件、Agent、NC 查看、审核操作。
- **Shared UI**：按钮、输入框、滚动容器、弹层、状态标签、空状态。
- **API / Adapters**：服务调用、协议字段转换、Mock/Live 切换；不在 JSX 中内联复杂业务映射。

### 10.2 建议目录

```text
CAPPtron-web/
├── docs/
│   └── architecture/frontend-architecture.md
├── src/
│   ├── app/                 # router、providers、错误边界、App Shell
│   ├── pages/
│   │   ├── model-input/
│   │   ├── process-planning/
│   │   ├── program-review/
│   │   ├── data-foundation/
│   │   └── design-interpretation/
│   ├── features/
│   │   ├── operations/
│   │   ├── steps/
│   │   ├── parameters/
│   │   ├── onsite-measurements/
│   │   ├── agent-drawer/
│   │   └── nc-review/
│   ├── components/ui/       # 通用可复用 UI
│   ├── api/
│   │   ├── generated/       # OpenAPI 生成，不手动编辑
│   │   ├── adapters/        # DTO → ViewModel
│   │   ├── mock/
│   │   └── client.ts
│   ├── stores/
│   ├── styles/
│   └── test/fixtures/
├── e2e/
└── package.json
```

命名方向以 Feature + 清晰职责为主，避免为几个简单组件建立独立 package。测试与源码就近放置（必要的 e2e 单独集中）。

---

## 11. 数据输入、工艺卡与 NC 程序审核的特殊边界

### 11.1 结构化输入 ≠ 文件解析

`POST /inputs/prepare` 接受带版本的 JSON 包装请求，用于准备资源和归一化输入；并不是“上传 `.step` → 自动识别制造特征 → 生成工艺”。P0 可模拟 STEP 文件被选中、结构化输入由演示数据驱动，但页面应将两种来源区分清楚。

### 11.2 工艺卡审核 ≠ NC 程序审核

后端 `process-card.md` 已描述工艺卡读取、审核、归档及防过期反馈版本约束；这是**工艺规划成果/卡片**的审核。r06 的 `ProgramReviewPage` 侧重 **NC 文本、程序版本、人工确认与程序下载**。两者可以共享审核按钮和布局组件，但不能共享“批准代表什么”的业务含义。只有在后端提供真实 NC 产物与 NC 审核契约后，才接入真正的程序确认。

### 11.3 CAM 状态与安全表达

Mastercam 执行器的基础部署、只读构建/探针和断线恢复有工程验证记录，但验证文档明确 **尚未完成真实 CAD → 刀路 → 仿真 → NC 生成的业务加工验收**。因此界面中必须区分：

- `规划运行完成` — Agent/Mock Provider 已返回；
- `结果校验就绪` — 公共输出契约通过；
- `工艺卡已人工批准` — 指向特定卡片修订；
- `NC 程序已生成` — 必须有真实生成与可验证产物；
- `仿真验证通过` — 必须另有可靠验证证据；
- `允许实机加工` — 不由网页的单次人工确认自动推断。

第一版不需要复杂的工业状态机，但 UI 文案不能把这几个不同层次混为一谈。

---

## 12. 测试、质量门槛与验收

### 12.1 P0 验收清单

- [ ] 1920×1080、1440×900 下页面无关键控件遮挡或内容重叠。
- [ ] 模型输入、工艺决策、程序审核、数据底座可稳定导航；解读页可进入/返回。
- [ ] 与 r06 主视觉基调一致；共用设计令牌，不按页面复制大段 CSS。
- [ ] 核心按钮可点击并产生明确反馈；不可执行的操作有说明。
- [ ] 工序数量不是写死九道；`short-plan`、`large-plan`、`incomplete-plan` 正确展示。
- [ ] 工序切换更新工步、参数、资源和 Agent 上下文；保持局部滚动能力。
- [ ] 缺失数据不补造；数据来源（Demo/真实）清晰可见。
- [ ] Agent 抽屉在设计规定的工作页面出现，在数据底座/上传页隐藏。
- [ ] 程序审核不同状态由同一页面驱动，而不是多套截图式组件。
- [ ] 示例 NC 内容显著标注不可执行；无真实文件不提供假 `.nc` 下载。
- [ ] STEP 预览可以 Mock 占位，不能成为核心界面验收阻塞项。
- [ ] 静态检查、组件测试和至少一条 Mock 端到端流程通过。

### 12.2 P1 验收清单

- [ ] 本地 FastAPI `/openapi.json` 对照生成类型；合同失配在 CI 中可发现。
- [ ] 端点接入以业务 Query/Mutation 封装，HTTP 错误和后端业务码合理显示。
- [ ] 真实任务 ID、版本与反馈版本由后端控制，旧修订冲突有提示。
- [ ] 已有 Mock Planner 返回仍标注为 Mock，`completed` 不被写成“NC 已通过”。
- [ ] 查询最新快照能工作；重启丢失/404 时给出合理恢复信息。
- [ ] 工艺卡审核如需在前端展示，明确不同于 NC 程序批准。
- [ ] 在内网/本机环境验证 CORS、超时、接口地址配置和无 CDN 依赖。

### 12.3 测试结构建议

- **Vitest / RTL**：组件选择、空值渲染、数据源显示、按钮禁用和 UI 更新。
- **Playwright**：P0 Mock 全链路 + 1920/1440 视觉回归；P1 增加 API 联调用例。
- **契约测试**：OpenAPI 生成后的类型与 Live Adapter 映射；用现有可运行服务验证关键响应。
- **性能基本检查**：长工序列表、长 NC 文本、连续切换工序时无明显卡顿；必要时再做列表虚拟化。

---

## 13. 分阶段实施顺序（不绑定日历时长）

| 阶段 | 目标 | 交付物与退出条件 |
|---|---|---|
| **S0 设计基线** | 冻结 r06 保留项，完成动态数据/交互/Mock 边界审查 | 本文件评审版 + 关键页面映射 + fixtures 计划 |
| **S1 工程骨架** | Vite/React/TS、样式主题、路由、API 抽象与测试工具 | 启动、打包、lint/typecheck/test 可重复执行 |
| **S2 核心展示** | 模型输入、工序动态列表、工步/参数、程序审核、数据底座 | 全套 Mock 流程可操作，非单零件硬编码 |
| **S3 交互完善** | 输入反馈、Agent 抽屉、审阅状态、滚动与异常 UI | P0 验收清单通过；处理不同尺寸和数据边界 |
| **S4 后端联调** | 接现有 API，并记录未实现接口依赖 | 真实/Mock 边界可切换，P1 合同与功能验收通过 |
| **S5 增强评估** | STEP 预览、几何特征、高级可视化（如必要） | 按使用价值决策，单独立项，不影响核心界面发布 |

**实施建议**：先做一条完整的“选择任务 → 选择工序 → 查看工步参数 → 打开程序审核（演示）”垂直切片，再补全其余功能；避免一次性生成所有页面而缺少可测试的系统行为。

---

## 14. 已作决策、待定事项与升级触发

### 14.1 当前已作决策

| 编号 | 决策 | 依据 |
|---|---|---|
| ADR-FE-001 | React + TypeScript + Vite，单体 Web 应用 | 内部工业工作台、已有 FastAPI，SSR 无必要 |
| ADR-FE-002 | Tailwind + shadcn/ui；r06 视觉作为基准 | 可定制、复用、避免默认主题覆盖 |
| ADR-FE-003 | Mock/Live 通过 API Adapter 切换 | 后端未齐全但 UI 必须先实现 |
| ADR-FE-004 | 服务端状态 Query，临时 UI 状态 Zustand/本地 | 降低版本错乱、避免复制权威数据 |
| ADR-FE-005 | 三维 STEP 展示延至 P2，不提前引入 CAD 引擎 | 非核心、风险和开发成本较高 |
| ADR-FE-006 | 不将工艺卡审核等同 NC 审核 | 产物类型和安全语义不同 |
| ADR-FE-007 | 行为契约采用三列简表，必要时按功能补充 | 避免首版过度文档化 |

### 14.2 待决定（不阻塞 S1/S2）

- 真实 STEP 文件上传、存储与解析 HTTP 方案（由后端提供）——阻塞真实上传，但**不阻塞 P0 界面**。
- 真实 NC 生成/批准/下载的业务契约与 CAM 文件所在位置——阻塞 Live NC 审核闭环。
- 真实 Agent 对话：只读解释已按 Core `/agent/conversations` 接入（同步 JSON，见 [Agent 抽屉接入](../api/Agent-Drawer-Live.md)）；增量输出与工艺修改提议回执仍待 Core 后续阶段。
- 统一用户身份认证及授权边界——对任何不可信网络部署或真实 CAM 控制都是**上线前必需**；不阻塞本地演示界面。
- 数据底座正式数据服务——FE-004A 已定义 `DataFoundationReader` 契约；FE-004B 通过固定 Mock 快照驱动页面，正式资源数据库与统计服务仍待接入。
- 任务持久化及重启恢复策略——当前后端内存态不是生产级持久化。

### 14.3 何时考虑引入额外技术

| 触发条件 | 再评估的技术 |
|---|---|
| 真实 CAD 预览成为重要用户任务，并提供标准解析路径 | STEP → 网格转换 + 3D 渲染方案 |
| 用户需要持续追踪实时 Agent token/执行日志 | SSE；必要时才评估 WebSocket |
| 多任务实时管理/大量历史数据出现 | 持久化、分页与列表虚拟化 |
| 需要深度系统托盘/桌面窗口/本地设备能力 | Tauri / Electron |
| 复杂多人审核与权限成为确切需求 | 独立权限模型与审计流程；不从按钮反推审批系统 |

---

## 附录 A：给 Codex 的实现约束（初始版）

1. 首先读取本文、Figma r06 及后端 OpenAPI/Contracts；不得直接把 Figma 中的九道工序硬编码为 UI。
2. 先实现 Shell + 一条 Mock 业务垂直切片，再扩展页面。重要修改应有可运行验收用例。
3. UI 页面从 `features/` 获取业务组件，从 `api/` 获取数据；不允许 JSX 中散落真实 API URL。
4. Mock 数据由统一适配层提供，生产失败不静默回退 Mock；示例在界面显著标注。
5. 业务版本/审核/运行状态不可通过前端常量臆造；后端已有接口以实际 OpenAPI 为准。
6. STEP 三维展示是可替换占位组件；**不要为了它安装 Three.js、CAD 转换器或独立解析服务**。
7. NC 程序示例必须明显标注“不可执行”；不得将“确认可用”混淆为仿真通过/可实机加工。
8. 对照 1920×1080 和 1440×900 验收，保持局部滚动与信息密度；提取 tokens，不散落魔法数。
9. 遇到没有后端契约的功能，标注 `MOCK_ONLY` / `BACKEND_PENDING` 并记录依赖，不自行虚构正式接口。
10. 每个 PR 写清变更页面、Mock/Live 状态、验收结果与剩余问题，必要时同步维护本文。

## 附录 B：首次工程评审检查项

- [ ] Figma r06 的页面、字体、颜色与交互规则已与本文对齐。
- [ ] 任务、工序、工步与参数的前端 ViewModel 不依赖特定零件。
- [ ] 与 CAPPtron-core 已有契约冲突的设计已经标注并决定适配方向。
- [ ] NC 审核与工艺卡审核在数据和文案上明确分开。
- [ ] P0、P1、P2 范围与 Mock 边界达成一致。
- [ ] 目录、依赖、路由、状态归属与验收门槛足以开始 S1。

---

> **设计结论**：r06 是高保真视觉和流程基线，而不是不可修改的代码规范。第一版前端要先做到 **“界面真实、数据动态、交互有反馈、Mock 可辨认、后端可接入”**。STEP 三维渲染及类似锦上添花的能力不应拖延核心界面建设。
