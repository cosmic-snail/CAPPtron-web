# CASE-FE-001｜Git + JSON 标准工艺案例库 v1

## 范围与入口

案例库是共享的、版本化的工程参考数据源，不是用户任务数据库。运行时通过 `fetch` 读取 `public/case-catalog/index.json` 和索引指定的独立版本文件。当前工程参考目录只保留 Golden-B7 环件 `v2`。按维护者要求，v1 文件及索引项已删除，历史内容可从 Git 追溯。不修改 CAPPtron-core，不建设数据库、上传服务、任务恢复、真实 Agent、CAM 或 NC 生成。

工艺决策页的方案选择器分为“工程参考案例 · Demo 使用”和“合成 Demo · UI 测试数据”。选择器展示案例名称及明确版本；点击“加载 Demo 方案”读取并校验版本。输入页的具名 Ring_A 示例入口明确绑定 Golden-B7 v2；这是入口配置，不是根据本地 STEP 文件名匹配案例。更换有效模型来源清除原任务会话；切换页面保留当前会话。

案例索引与版本文件读取失败时分别提供重试，不自动回退 Fixture。切换任务或更换有效文件后，迟到的旧请求不能创建新任务的方案。默认每次读取使用 `cache: no-store`，请求超时为 15 秒；SHA-256 由 `src/api/browserCrypto.ts` 计算，安全上下文下使用 WebCrypto，普通 HTTP 跨机访问时回退到 `@noble/hashes`，结果一致。

## 契约与文件职责

- `src/api/case-catalog/types.ts`：独立数据契约，不依赖页面 ViewModel。
- `src/api/case-catalog/schema/case-index.schema.json`：索引 JSON Schema，Draft-07。
- `src/api/case-catalog/schema/case-document.schema.json`：版本文档 JSON Schema，Draft-07。
- `src/api/case-catalog/validation.ts`：Ajv 校验、作用域唯一性、引用与摘要校验。
- `JsonCaseCatalogReader`：实现 `CaseCatalogReader.listCases()` 与 `getCaseVersion(caseId, version)`，统一处理 BASE_URL、fetch 和错误。
- `adapter.ts`：独立版本文档 → FE-002 `ProcessPlan`，复制参数与资源数据，不回写原文档。
- `src/api/case-catalog/index.ts`：当前 Reader 实例及输入页具名示例入口配置。

所有 JSON 对象拒绝未定义的额外字段，缺少必需字段也拒绝。不做字符串到数字的隐式转换，不自动填默认制造数值。JSON Schema 与 TypeScript 类型同时维护，契约校验及页面测试检查实际文档。

### Case 与 CaseVersion

索引根级 `schemaVersion` 固定为 `1.0`，`cases` 是案例摘要数组，每项包含：

- `caseId`：稳定案例身份，不使用显示顺序或文件名作为业务身份。
- `name`、`description`、`partType`、`tags`：用于列表和检索的元数据；本轮不新增搜索后台。
- `sourceCategory`：v1 正式目录只接受 `engineering_reference`。
- `versions`：可读取版本，每项含 `version`、目录内相对 `path`、`contentDigest`。

文档 Schema 支持 `1.0`、`1.1`；1.1 增加 μm 单位，v2 使用 1.1。索引结构仍为 1.0，部署 v2 时必须同步发布支持 1.1 的读取端，旧读取端会明确拒绝未知 Schema。

独立版本文档含 `schemaVersion`、`case`、`caseVersion`、`contentDigest`、`processPlan`、`programAssets`、`verificationEvidence`。`case.id` 与 `caseVersion.caseId` 必须一致，加载时还必须匹配索引请求身份。`caseVersion.version` 是数据版本（例如 v1），与 Schema 版本分开。

`case` 是该版本的案例元数据快照。索引可以更新展示描述，但不会改写历史版本中的名称、描述或工艺。校验要求身份与版本一致，不要求可变索引描述覆盖历史快照。

以下是索引片段示意，摘要占位符必须替换为实际 64 位小写十六进制值才能加载：

```json
{
  "schemaVersion": "1.0",
  "cases": [
    {
      "caseId": "golden-b7",
      "name": "Golden-B7 环件",
      "description": "历史工程参考，在工作台中以 Demo 会话使用",
      "partType": "ring",
      "sourceCategory": "engineering_reference",
      "tags": ["车削", "环件"],
      "versions": [
        {
          "version": "v2",
          "path": "golden-b7/v2.json",
          "contentDigest": "<实际 SHA-256 摘要>"
        }
      ]
    }
  ]
}
```

完整可运行示例以 `public/case-catalog/golden-b7/v2.json` 为准，不在文档复制整份加工数据。

### ProcessPlan、参数与现场定义

`processPlan` 含稳定 `id`、`name`、`partName`、`sourceDescription`、动态 `operations`、`taskFields`，可选 `initialOperationId` 必须引用存在的工序。工序与工步各有稳定 ID、显示 `sequence`，使用数组顺序呈现，序号不作为身份。

工序包含 `steps`、`parameters`、`resources`、`onsiteFields`，可选装夹和说明。工步也可以有自己的参数。数组可以为空，以保持零工序、无切削参数或缺失资源等真实空状态。

字段定义包括：

- `value`：有限数值、文本或 null；数字输入只允许数值/null，文本输入只允许文本/null。
- `unit`：当前读取端支持 `μm`（Schema 1.1 新增）、`mm`、`m/min`、`mm/r`、`r/min`、`mm/min`、`deg`、`%`；文本及无量纲项可省略。新增单位需明确修改受支持契约和测试，不能把未知单位静默映射成另一单位。
- `source`：`historical_record`、`template`、`upstream`、`human`、`unknown`。Adapter 无损保留来源；historical_record 在前端显示“历史记录”，不转换为“模板”。合成 Fixture 的 mock 仍显示“Mock 演示值”。本轮不提供 Agent 推荐来源。
- 单位兼容性由 JSON Schema 条件直接校验：1.0 仅支持上述旧单位，拒绝 μm；1.1 额外支持 μm。约束覆盖工序参数、工步参数、任务共用字段和工序专用字段，不依赖摘要校验；未知版本及单位仍拒绝。
- `status`：`provided`、`missing`、`pending`；missing 必须为 null，provided 不能为空。
- `inputKind`：number 或 text；`editPolicy`：read_only 或 demo_input。
- `requirement`：optional 或 demo_required。后者只表示 Demo 按钮的填写门槛，不是制造规范或正式批准。
- `description`：来源说明或要求补充的理由。

`taskFields` 是任务共用现场字段，`onsiteFields` 是对应工序专用补充字段，可表达加工前要求或现场条件，字段名称和说明明确区分。UI 入口为“补充信息”，不会将所有输入都称为实测。demo_input 字段只能以 null、unknown 定义空草稿；不能将案例参考尺寸预置成现场实测。草稿在 React 会话中保存，未写入 JSON、Git 或服务器。

任务共用字段集中在工作台左侧固定的“任务共用信息”入口，右侧统一填写，不在每道工序中重复展示。工序专用必填且可编辑的缺失项，在对应工序上显示“待填 N”文字标记；列表上方的“待填 N 项”按钮定位首个待填工序及对应参数/工步/现场视图。数量根据当前草稿和基础格式校验动态更新，清空或无效输入会重新出现标记；只读上游缺失项不会伪装成用户可填写。列表长时共用入口和定位按钮保持可见，工序列表独立滚动。

共用信息视图中的 Agent 消息标记为“任务级 · 共用信息”，返回工序时按工序同步上下文，已有消息保留原发送上下文。任何“已补齐”仅表示 Demo 必填草稿完整，不能解释为现场确认或制造校核。

工序 ID 在计划内唯一；工步 ID 在所属工序内唯一；参数 ID 在各自参数组内唯一；资源 ID 在工序内唯一。任务字段和现场字段各自在所属组内唯一。同一把刀可在不同工序中被引用，不要求所有局部 ID 全局唯一。

### ProgramAsset 与 VerificationEvidence

ProgramAsset 为 FE-003 保留 NC 关联：`id`、`caseId`、`caseVersion`、`planId`、`kind: nc`、`source`、可选文件 `sha256` 和 `sizeBytes`、`availability`、`boundary`。v1 只允许 metadata_only 或 unavailable，没有公开文件 URL，不提供下载。内容摘要与 NC 文件字节摘要是不同字段。

VerificationEvidence 含证据 ID、案例/版本/方案身份、`programAssetIds`、具体验证对象 `subject`、方法 `method`、结果 `result`、适用条件 `conditions`、证据来源 `sources`、限制 `limitations`。引用必须指向本文档内已定义程序资产，身份必须匹配当前案例版本。结果只允许 passed_with_limits、failed、not_performed；所有证据都必须写明条件、来源和限制。

Golden-B7 引用历史 NC `baseline.nc` 元数据：1752 字节，SHA-256 `9930cd6114a6b175c372aa1d797d615df7daca0a9a765b812e25fe60c090a57e`。历史验证限定原建模条件，保留前端 +0.1 mm、未完整验证卡盘/夹具、不等于全表面拟合或实机验证。未提交 MCAM、NC、STL 或私人目录。资料关系详见 [FE-002-RING-SOURCE.md](../workflows/FE-002-RING-SOURCE.md)。

FE-002 Adapter 只保存案例版本关联 `caseReference`，不将历史验证映射成当前任务已通过。未来 FE-003 可以按同一案例版本读取 ProgramAsset 和 VerificationEvidence，不需要从工序名称推断程序。

## 版本、摘要与 Git Review

本 PR 首次发布前，按维护者明确要求直接精简 v2 的 Ra 补充原因并同步摘要，删除目录中的 v1；不为这次文字调整增加 v3。正式发布后仍采用以下规则：已发布版本文件不可变；工艺数值、来源、限制、字段定义或元数据快照变化时新建版本文件，并保留旧版本。Schema 不兼容变更必须升级 schemaVersion 和加载器；v1 未知 Schema 直接拒绝。

`contentDigest` 是整个文档除根级 contentDigest 外的 SHA-256。v1 规范化规则：对象键按 ECMAScript 字符串顺序递归排序，数组保持顺序，原始值使用 JSON.stringify 的表示，UTF-8 编码，无额外空白。不做 Unicode 归一化。这是本项目 v1 规则，不声称兼容所有 JCS 实现。缩进和对象键排列变化不影响摘要，数组顺序和数值变化影响摘要。NaN、Infinity、无法表示的 JSON 值均拒绝。

同一摘要写入版本文档和索引，两处都必须与实算值一致。辅助命令只读文件并输出摘要：

```bash
node scripts/case-catalog-digest.mjs public/case-catalog/golden-b7/v2.json
npm run validate:catalog
```

摘要帮助识别错配或意外修改，不是数字签名，不能证明制造真实性。若同时篡改正文和两个摘要，单次加载无法证明它曾经发布过不同内容。因此不可变性仍由 Git 历史、PR 评审和发布管理保证，评审时检查是否改动了已有发布文件。

## 新增案例与同步步骤

1. 核对可公开资料、工序语义、单位及证据限制；不确定制造信息保持缺失，不编造数值。
2. 从契约建立新的 `<case-id>/<version>.json`，补齐身份、来源、动态方案、资产元数据与证据。没有程序或证据时使用空数组，不伪造历史验证。
3. 用摘要命令得到值，填入文档；在 index.json 添加案例或版本引用及相同摘要。路径只能位于案例目录内，不接受外部地址或 `..` 路径。
4. 执行 `npm run validate:catalog`。它遍历索引所有版本，检查 Schema、关联、摘要，并检查目录中是否有未索引 JSON。该测试也包含在 quality 和 CI 的 Vitest 中。
5. 启动开发服务，在已打开的工艺决策页点击“刷新案例列表”，选择新案例/版本并加载。原则上无需修改 React 组件。新加一种 Schema 能力、特殊 UI 或输入页具名快捷入口不属于纯数据新增。
6. 检查显示、现场草稿与来源边界，执行完整质量及浏览器测试，通过 PR 评审后发布。不自动合并。

Git 同步是开发者拉取和评审文件的机制，不是浏览器同步协议。开发环境会读取更新后的静态文件；生产构建将 public 内容复制到 dist，已部署站点仍需分发新的静态资源。建议先发布不可变版本文件，再更新索引，或使用原子部署；CDN/代理缓存策略也须由部署端配置。Git 更新不会自动更新所有站点。

## 工程参考与合成数据

Golden-B7 来自已核对离线资料，保留六工序顺序、刀具、G96 恒线速、G99 每转进给、G50 转速上限及现场填写理由。JSON 文档中的 sourceCategory 表达工程参考来源；工作台中的 origin 仍为 mock，明确表示此次交互是 Demo，不能理解为参考资料是 Agent 新生成的结果。

支架、复杂壳体、不完整、零工序仍由 `src/api/mock/processPlans.ts` 提供合成 Fixture，单独分组，不写入正式案例索引。它们用于 UI 和自动化测试，不宣称已有工程验证。

会话按案例 ID＋版本＋摘要隔离，合成任务仍按独立方案身份隔离；切换回同一已加载版本可恢复未提交草稿和 Agent Demo 历史，刷新网页不恢复任务。标准 JSON 从不包含用户对话、现场填写结果或审批状态。

## 后续接入方向

未来 CAPPtron-core 可存储案例身份、不可变版本、工艺文档、程序资产引用与验证证据，并由 API 提供相同契约。前端可将当前 Reader 实例换为 HttpCaseCatalogReader，保留 Adapter 和通用工序/字段/Agent 组件；必要的认证与错误映射属于届时的数据访问层工作。本轮未实现该 Reader，也没有修改 CAPPtron-core。

将来数据库模型应区分标准案例版本与用户任务实例。现场草稿持久化、版本冲突、正式制造必填规范、工艺确认、NC 审核及制造执行需另行定义，不能由本轮 Demo 门槛推导。

## 验收记录

2026-10-19：基于 FE-002 合并提交 b833531，在独立分支实现。已核对迁移前后六工序、18 个切削参数值及单位、刀具和 5＋1 现场定义。

实际执行结果：`npm run quality` 通过，含 ESLint、Prettier、TypeScript、Vitest 60 项及生产构建；`npm run test:infra` 10 项通过；`npm run test:e2e` 在 1920×1080、1440×900 两视口合计 38 项通过。保留 FE-001/FE-002 原交互覆盖，新增 JSON 加载、失败重试、迟到请求隔离、动态发现与会话隔离测试。

浏览器证据位于仓库外 `D:/GPT_workspace/CNC_project/CASE-FE-001-evidence/2026-10-19/`。两个视口目录各有 `catalog-golden-b7-parameters.png`、`catalog-golden-b7-onsite.png`、`catalog-agent.png`、`catalog-error-retry.png`、`catalog-dynamic-case.png`，并保存完整 playwright-report。实际查看参数、现场信息、Agent 和错误状态截图，未见横向溢出或关键输入遮挡。保留 FE-002 已认可的视觉体系，只扩展加载控件；不是重新宣布 Figma 视觉基准已由维护者批准。PR 的 Quality 工作流提供 playwright-results Artifact，保留期以工作流为准。

另以独立开发服务的 `/case-preview/` 基础路径在真实 Chromium 加载六道工序，确认所有案例 fetch 均带正确前缀，记录为 base-url-browser.json。

另执行真实静态文件发现实验：在同一已打开的开发页面中新增临时案例 JSON、更新 public 索引，点击刷新后加载六工序；未修改 React、未重启服务，测试页面关闭 HMR 通道以排除自动刷新影响。原索引已恢复，临时案例已删除。记录为 actual-json-file-discovery.json 和对应 1440×900 截图；正式目录只包含 Golden-B7。

## 维护者手动检查路径

1. 打开本机开发预览，点击“使用示例 Ring_A.step”，等待 Demo 进度并点击“查看工艺规划结果”。应为六道环件工序，来源显示 Golden-B7 v2。
2. 左侧“任务共用信息”应显示“待填 5”，只有“05 内孔精车”显示工序专用“待填 1”。若该工序位于滚动区下方，可以点击列表上方的待填定位按钮。
3. 在共用入口集中填写五项演示记录。数量应递减，填完显示“已补齐”；打开其他工序不再重复这五个输入框，回到共用入口原值仍在。
4. 定位“05 内孔精车”，补充内孔表面粗糙度要求 Ra（μm），初始应为空，旁边说明为加工前目标要求。填写后对应待填标记消失；将其清空会重新出现。共用信息里把数字改成 abc，也应重新提示待填并禁用生成入口。
5. 六项格式有效后，生成入口可以点击，但只提示 FE-003 未开放，没有生成 NC。切换合成 Demo 再返回 Golden-B7，草稿应恢复；更换有效本地 STEP 后方案及会话应清除。
6. 在共用信息视图与内孔精车工序分别打开 Agent，检查上下文分别为任务级、内孔精车工序，关闭重开保留记录。

无需修改案例文件即可完成上述交互验收。数据层的 JSON 拒绝、摘要、动态新增及部署基础路径由契约测试与浏览器实验提供证据；需要新增正式案例时再按前述版本步骤操作，遵循正式发布后的不可变版本规则。

### 共用信息集中填写补充验收（2026-10-19）

共用字段集中到独立任务入口，工序专用必填字段显示待填数量，列表顶部可直接定位待填工序。计数随草稿有效性更新；任务级 Agent 上下文与工序上下文分别标注，历史仍按同一任务保留。未修改 Golden-B7 已发布 JSON 或制造参数。

补充后 quality 通过，Vitest 共 61 项；test:infra 10 项通过。两视口 Chromium 共 38 项通过，实际检查共用表单和切断专用信息截图，证据保存在上述目录的 shared-inputs/ 下。

本机默认 E2E 启动出现间歇性 ERR_ADDRESS_IN_USE，trace 显示 main.tsx 或 @react-refresh 请求失败，继而导致页面未初始化。降低并发仍会复现。本机完整成功运行使用临时、未提交的 Playwright 配置与单 worker，启动参数为 --disable-features=TcpPortRandomizationWin；未删改断言、增加重试或修改操作系统。e2e-windows-network.log 和临时配置副本记录该次 38 项通过，失败日志也保留。仓库标准测试配置保持不变，PR CI 使用标准配置另行验证。该实验不能证明所有 Windows 环境下的根因均相同。

### Golden-B7 v2：加工要求填写示例

按维护者确认，将工序专用 Demo 门槛从切断装配核对替换为“05 内孔精车”的“内孔表面粗糙度要求 Ra”，单位 μm，初始 null / unknown。来源说明要求依据图纸或技术要求补充；未知时保持待确认。该字段是新增演示交互，不是 Golden-B7 已核实制造要求，不是加工后的实测值，也不是 Agent 推荐值。自动化测试中的 1.6 仅为输入测试值，不写入案例或充当该环件图纸要求。

当前仅保留 v2 文件、摘要及索引项，输入页快捷入口绑定 v2。六道工序顺序、工步、刀具、18 个切削参数及单位、五个共用字段和历史证据内容保持不变，资产和证据的案例版本关联更新为 v2。历史 NC 仍指向同一冻结基线，不表示 v2 新增要求已被该程序满足或验证。

会话仍按案例版本及摘要隔离，不迁移旧切断装配草稿。v1 已从目录删除，列表不再提供该版本；v2 的待填标记出现在内孔精车；切断不再有人工填写门槛。填写只检查有限数值等基础格式，没有设置未经确认的粗糙度要求或制造合格范围，也不会改写切削参数、生成或验证程序。

v2 补充验证：quality 通过（62 项 Vitest、静态检查和构建），test:infra 10 项通过；真实 Chromium 两视口合计 38 项通过，沿用前述本机临时网络兼容参数。新增版本对比验证、μm 映射、空值与无效输入门槛、v1/v2 草稿隔离覆盖；原有 FE-001/FE-002 用例保留。浏览器截图及报告存于仓库外证据目录 roughness-input/，已检查两视口的 Ra 空白输入、待填提示及说明。标准配置仍由 PR CI 另行执行。

### 本轮文字精简与目录清理

按维护者指定，Ra 字段说明精简为：“加工要求补充：参考内径为 Ø39 mm，请依据图纸或技术要求填写目标 Ra。”v2 内容摘要与索引同步重算，未更改切削参数、输入要求或历史证据。正式目录仅保留 v2；不再读取、展示或打包 v1 文件。此前 v1/v2 对比验收属于历史记录，当前测试改为验证最新案例、缺失版本拒绝以及临时构造版本的会话隔离。

本轮清理验证：quality（62 项单测及构建）、test:infra（10 项）通过；两视口 Chromium 合计 38 项通过，沿用前述临时网络兼容参数。截图与报告在仓库外证据目录 latest-only/。案例目录及生产构建仅包含 v2，旧版移除后的当前案例校验、动态发现、草稿与 Agent 回归均保留覆盖。
