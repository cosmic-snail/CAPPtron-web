# FE-CONTRACT-001｜Core 协作交接清单

> 2026-10-23。技术审计完成，**尚待 Web 维护者、Core 负责人及涉及制造语义的工程负责人确认**。本文件不是已冻结的新 API 清单。本次没有实施任何下列能力，也没有执行制造操作。

基线：Web `ce46313a4637947b9e31500509dc7661d1e7b201`；Core 上游 `a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef`。Core 结论来自源码、Pydantic、静态生成 OpenAPI（37 paths / 40 operations / 102 schemas），不是运行实例验证。PR #24 已在本地归档为 `archive/pr24-interface-reference`，SHA `c36b1597f25a983532df559d6dc6228b1872d87c`，不推送、不恢复 UI。

[主文档](CAPPtron-Frontend-Consumer-Contracts-v1.0.md)说明依据和状态边界；[矩阵](FE-CONTRACT-001-Interface-Matrix.md)提供全部消费者、精确字段、证据和分类。本清单使用相同 Contract ID、Q 编号和优先级。

## 1. 已有能力：优先由前端接线

- **P0 / B**：CAD 上传/解析/回读、任务创建/查询、规划和参数 patch、run/result/output 查询、工艺卡/人工审核/批准归档、批准计划资格、CAM 启动与观察恢复、NC 正文/审核/精确下载、统一错误和原命令恢复。无需创建同义 API。
- **P1 / B**：输入预检、反馈新增/回读/撤回、控制及人工收尾、NC 版本列表/保存/父版本 comparison/revise。当前真实工作区只读 NC，不能据此认定 Core 没有编辑版本能力。
- `rough_step` 已有 metadata/rules、离散值 `[0.5,0.4]` mm 与来源/变更记录，P-06 是 B；其余完整参数描述 P-07 才是 C。
- 前端负责修复当前 CoreWorkspace 固定 2.2.0 请求和工艺卡 raw task_id 路径。卡片路径优先使用 snapshot.card_path，编码规则已有；不要求后端改成另一路由。

以下问题才需要后端或双方参与。P0 是固定 Golden 完整协作的决策/投影阻塞，不表示已证明所有运行路径均失败，也不要求一次建设完整通用平台。

## 2. P0：固定 Golden 协作前必须决定

| 问题 / 对应矩阵分类 | 当前问题与期望结果 | 复用 / 建议最小变更（未冻结） | 契约版本影响 | 确认者与联合验收 |
| --- | --- | --- | --- | --- |
| **Q1 模板发布与工程准入**；I-05 / C | Web固定2.2.0，Core2.3.0只有配置EngineeringBinding才注册；catalog只有内部方法。需明确可选模板的版本/摘要、适用条件、安装及执行状态 | P0先发布受控固定配置，包含模板标识、摘要、准入依赖与部署来源；若选目录投影，复用TemplatePlanner.catalog与模板包，不先定新URL/数据库。明确pending与execution_ready可以并存 | 配置需独立版本/摘要；只读目录若增加须声明响应schema；不得改变既有模板digest含义 | Core+Web+工程负责人；用配置匹配/缺失binding/错误digest三种fixture，未满足显示不可用；新增解析报告不因同STEP自动准入 |
| **Q2 规范工步与来源展示工步**；P-05 / C | normalized steps与display_steps不是一一对应；native准入覆盖attributes后参考内容可能缺失，原UI无法稳定显示加工内容 | 复用PlanProduced、NormalizedStep；明确展示优先级、稳定ID对应、来源及缺失语义。若扩展只加最小展示投影或受版本约束配置，不复制SDK操作 | 动态payload schema/profile需要可识别版本；含义变化必须版本化 | Core+Web+工艺负责人；七工序按sequence，ring-op-7在第二位；工步无重复计数，缺失有提示，重排不改ID |
| **Q3 完整参数描述与修改权限**；P-07 / C | rough_step已有规范；其余native参数缺全量单位/type/source/required/编辑规则，推荐值没有统一身份；按键名推断会误导 | 复用parameter_metadata/parameter_rules/parameter_changes；决定描述随响应还是模板/profile摘要绑定配置发布；补当前Golden显示必需字段，未知参数只读；推荐值可明确暂不支持 | 新描述字段一般可加法演进，但payload与配置版本需约定；不改变既有patch校验语义 | Core+Web+工程负责人；逐参数核单位/径向直径语义；0.45、错误单位、旧摘要被拒；旧/新值来源可追溯；frontend editable不能绕gate |
| **Q4 资源、加工方法和装夹投影**；P-08 / C | native tool_number/station/setup_id不等于资源ID/说明；VM资源状态仅demo/pending。需让既有资源区正确展示真实或未提供信息 | 复用plan.resources/attributes和内部ResourceSnapshot；确认machine/tool稳定引用、显示名/规格、方法映射、装夹说明及有效性来源。可最小只读投影，不要求完整数据底座 | 增加投影/目录描述需版本；不得把station重解释成resource_id | Core+Web+资源负责人；查得到来源/摘要，缺名称显示未提供，不拼假ID，不把工具配置称设备在线 |
| **Q9 恢复和持久化边界**；G-03 / C | task/feedback/planning run/snapshot在内存，CAD/archive/CAM/NC持久；TaskView无active_run_id。刷新或Core重启可能丢未批准规划 | 复用已有GET及原键重放；P0明确是否接受“规划限同进程”，约定部署代际/活动run发现或最小恢复信息；若要求跨重启草稿恢复，另定义持久策略。禁止绕过expected_current_revision | 仅明确边界可不改DTO；新增恢复字段通常加法；跨重启幂等含义需明确版本/迁移 | Core+Web；刷新前持有run可恢复，丢回执不重复制造；Core重启后明确不可恢复而非拼旧Task；原批准不授权未知当前草稿 |
| **Q10 审核身份及部署权限**；G-07 / D | X-Reviewer-ID为声明，工艺authenticated=false、NC identity_source=declared；没有证据证明实际鉴权/任务权限已实现 | P0确认受控联调的人员/网络/操作边界；正式部署由Core/身份系统定义认证、角色、任务及下载授权。前端保持声明标记；allowed_actions不是全量身份授权 | 仅联调边界说明无DTO改动；正式认证/401/403和身份字段需兼容评审，不先发明登录API | 维护者+Core+部署/制造负责人；身份缺失拒绝；未授权不能通过直接HTTP审核/制造/下载；正式安全验收与本次文档完成分开 |
| **Q11 OpenAPI与实际语义一致**；G-08 / C | 静态download声明JSON但实际ZIP；cancel/reset遗漏200；手读审核头、卡片编码路径、部分错误和自由payload描述不完整 | 修正现有OpenAPI媒体类型、headers、200/202和错误模型说明；注明task_key协议；为支持的payload profile提供可验证schema。无需新路径 | 文档/Schema修正通常不改wire；若新增必需字段或改变payload必须显式版本化 | Core主责、Web复核；schema生成客户端能按ZIP读取并保留摘要；所有真实status可解析；历史PR24错误fixture不得沿用 |

这些是具体待回答问题，不是要求 Core 直接返回整个 React ProcessPlan。完整参数/资源缺口可由受摘要约束的目录描述补齐；翻译名称、布局、选择、草稿和错误展示仍由前端负责。

## 3. P1：正式既有交互补齐

| 问题 / 对应矩阵分类 | 当前问题与期望结果 | 复用 / 最小方案 | 版本影响 | 确认与验收 |
| --- | --- | --- | --- | --- |
| **Q5 现场量测与约束**；S-02 / C | 当前仅本地输入；反馈自由JSON不等于已验证制造事实。需任务/工序scope、稳定字段ID、单位、必填、来源/人员/时间、更新/撤回和影响规则 | 复用HumanFeedbackRequest.supplement_schema_version/supplement和ledger；先发布Golden所需测量schema及校验，返回可回读状态。TemplateProvider当前不会把文本反馈应用进方案，不能宣称反馈已生效 | 新supplement schema版本；若新增确认/更新动作先联合设计，不能假定现有feedback已涵盖 | Core+Web+现场工程；缺项/错单位拒绝或标未验证；录入、回读、撤回可追溯；明确是否需新revision/使审核失效 |
| **Q6 建议的确认和执行语义**；A-02 / D | Demo消息没有真实建议身份/持久历史，不能点击“确认”便显示已修改 | 参数变更复用replan，NC提示修正复用revise，普通意见复用feedback；决定是否需建议记录、适用基线及采纳结果关联，通用聊天留P2 | 仅FE呈现已有命令可无后端改动；持久建议需新schema评审 | Web+Core+产品；过期建议不能应用；确认后等业务回执；拒绝不执行；结果引用精确plan/NC版本 |
| **Q7 案例与可执行模板映射**；R-04 / D | case v2与template2.3.0不是同一版本，新钻孔和工程材料变化；名称相同不证明对应 | 复用importer源摘要/source_operation_id；发布经过验证的两侧版本/摘要、工序对应、验证依据/适用范围；明确映射更新和撤销责任 | 映射记录独立版本；案例与模板版本保持各自生命周期，不改旧案例内容冒充新模板 | Core+Web+工程/案例维护者；摘要变化使映射失效；未验证只显示参考；加载示例不创建真实任务 |

NC版本保存、历史比较、revise、驳回等 P1 工作是 B 类前端接线，不应加入“新增后端接口”清单。正式现场保存和通用Agent尚未上线前继续标明Mock/不可用，不用自由文本填充制造真值。

## 4. P2：未来扩展，当前不阻塞

| 问题 / 矩阵 | 最小下一步与复用 | 契约版本、责任与验收 |
| --- | --- | --- |
| **Q8 真实数据底座**；F-08 / D | 保留DataFoundationReader七方法；先确定六类资产/事件/模型登记与部署状态的所有者、时区、快照、权限过滤分页、事件去重；Core内部machine/tool快照仅部分来源 | 数据源/schema需版本；Core+资源/数据平台+Web确认。验收五KPI口径、真实来源、同快照统计、迟到/重复事件与不可见资产；本阶段不建数据库 |
| 设计解读；D-01 / E | 入口当前不可用；已有parse原报告和内部TurningFeature可作为证据。需业务先定特征/尺寸/面边/异常/人工确认范围 | 公开特征视图和确认schema待定；CAD/工艺负责人+Core+Web；可追溯source/report/feature IDs，不能把内部模型当已发布HTTP |
| 通用Agent；A-03 / E | 先确定会话、历史、上下文、流式输出和工具执行权限；当前Demo继续保留 | 不预定SSE/WebSocket或URL；产品+Core+Web；确认未来schema及状态恢复后实施 |
| 通用STEP与更多模板 | 固定Golden七工序真实NC不代表任意STEP可创建工序/自动几何绑定；需专门工程准入和模板发布方案 | 属未来业务范围；工程负责人牵头，不以FE-CONTRACT-001批准替代制造验证 |

## 5. 前端实施与联合评审入口

前端独立负责：保留原Reader和UI；类型/错误/动态payload校验；卡片路径修复；版本化请求配置；本地草稿与Core版本分开；未决command记录与恢复；读取过期响应隔离；NC多文件/编码/摘要/下载适配。所有F项无需后端API，A项仅对当前Reference/Mock用途成立。

待双方确认后的实施顺序建议：先P0决策和B类Adapter，再P1正式交互，再排P2。FE-CONTRACT-002/003的编号范围尚待维护者确认；本次仅给出边界，没有实施。

联合评审请对Q1—Q11逐条记录“负责人、选定方案、配置/schema版本、验收fixture、是否冻结”；未回复条目保持C/D。本次文档技术审计完成，不代表这些问题已经关闭。三个最大风险是：**展示参考值与实际执行值混淆、草稿/批准/NC版本串用、超时或重启后误判结果并重复执行**。
