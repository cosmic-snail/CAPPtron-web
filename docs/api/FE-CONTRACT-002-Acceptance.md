# FE-CONTRACT-002｜验收记录

> 2026-10-25 后续实现已改为统一 frontend-integration.v1 配置并增加持久恢复，见 [本轮接入说明](Golden-demo-integration-20261025.md)。本文保留 10/24 历史验收状态，旧配置与刷新限制不再作为当前部署指引。

日期：2026-10-24。基线 `origin/main ce46313`，分支 `feat/fe-contract-002-minimal-live-wiring`。PR #26 保持未合并，只读使用其审计成果；PR #24 仅参考归档接口实现，没有恢复其页面。原目录的未跟踪文档未改动。

## 交付结论

从65项审计中选取 **11项P0**，实现原r06界面的固定Golden最小接线；没有全量接口生成、BFF、路由/状态框架或Core源码修改。当前结论是前端实现及契约替身验证，不是制造运行通过。

逐项状态：

- **P0-01 模型上传**：已接通原文件选择/拖放入口；测试替身通过。原字节、文件名与command_id保留，上传成功只表示not_parsed。真实Core未验证。
- **P0-02 NX解析**：已接通POST及按原command_id查询；running/parsed/failed分开。测试替身通过，解析不授予执行资格。真实Core未验证。
- **P0-03 任务创建**：已接通；只使用解析源身份，不伪造part几何。缺少部署配置时明确阻断，不假定2.3.0已注册。测试替身通过；受真实部署配置/EngineeringBinding确认阻塞。
- **P0-04 工艺进度**：已接通；POST回执后GET run，按真实状态轮询，completed须frontend available、实际结果及工艺卡可读才能解锁。短于/长于四秒、交付pending及失败场景替身通过。真实Core未验证。
- **P0-05 工艺详情**：已接通原ProcessPlanningPage/OperationDetails/ParameterFields；七工序测试保持稳定ID与sequence，规范steps不与来源摘要重复计数。资源/单位缺失显示未提供或只读。测试替身通过；完整参数/资源投影仍受Core数据约束。
- **P0-06 参数修订**：已接通；metadata、parameter_rules、模板/profile摘要一致才开放离散选择。提交真实patch、查询run、读取新revision和卡片；新修订不继承旧批准。0.45拒绝、草稿保留、422修正、旧批准门禁替身通过。真实Core未验证。
- **P0-07 工艺审批**：已接通；task_key采用UTF-8 base64url，review后回读卡片与approved-plans。当前revision/result及profile匹配才允许CAM。测试替身通过；真实审核身份/部署权限待联合确认。
- **P0-08 CAM运行**：已接通；202仅表示接受，GET/allowed_actions允许的observe读取真实status/phase。等待人工确认停止自动轮询；继续查询不再次start。测试替身通过。真实Core→Mastercam未验证。
- **P0-09 NC正文**：已接通原ProgramReviewPage与CodeMirror区域；多文件原文、编码/换行/精确版本和来源可见。清单全部正文读完且身份一致才提供审核。读取失败替身通过。真实产物未验证。
- **P0-10 NC审核/下载**：已接通；审核对话框绑定完整NcVersionRef，按allowed_actions及approved状态下载服务器ZIP。测试替身通过；合成NC文本仅作测试，不是制造证据。真实产物未验证。
- **P0-11 会话/导航**：已接通；App持有Live状态，数据底座及Demo往返保留任务、修订、CAM、草稿；输入替换确认草稿，待确认命令/活动CAM阻止替换。单飞、AbortController及旧响应隔离；未知结果保留原请求，明确Core 4xx拒绝允许修正。替身及Hook测试通过。

## 直接复用的Core接口

- CAD：`POST /cad/assets`，`POST/GET /cad/assets/{asset_id}/parse`。
- 规划：`POST /planning/tasks`，`GET /planning/tasks/{task_id}`，`POST .../replan`，`GET .../runs/{run_id}`，`GET .../results/{revision}`。
- 工艺卡：`GET /process-cards/tasks/{task_key}/results/{revision}`，同路径`POST /review`。
- 准入：`GET /cam/tasks/{task_id}/approved-plans`。
- CAM：`POST /cam/runs`，`GET /cam/runs/{run_id}`，`POST .../observe`，observe无JSON请求体且遵循allowed_actions。不自动reset、cancel、closeout或reconcile。
- NC：`GET .../nc/versions/{version}`，`GET .../file?file_id=...`，`POST .../review`，`GET .../download`。

**无需Core新增业务接口。** `core-deployment.json` 是前端部署方发布的受控静态配置，不是新Core端点或模板管理后台。未知模板注册和EngineeringBinding不能由前端推定。

## 部署和联合验收

配置`VITE_API_BASE_URL`，或使用同源反向代理。浏览器不访问Mastercam/Worker端口，不放置制造凭据。沿用顶部真实模式切换，原模型输入是唯一主入口。

部署方在Web根目录发布 `core-deployment.json`（Vite本机可置于被忽略的 `public/core-deployment.json`）。字段必须来自对应Core部署的发布记录：

```json
{
  "schema_version": "golden-deployment-v1",
  "source": "对应Core部署的版本化发布记录",
  "template": {
    "id": "golden-b7",
    "version": "由部署方确认",
    "digest": "由部署方填写64位小写SHA256"
  },
  "execution_profile_digest": "由部署方填写64位小写SHA256",
  "engineering_binding_configured": false
}
```

此示例故意不可执行。部署方核对注册模板、参数profile、STEP/report/MCAM绑定和运行配置后才发布真实值及binding声明；Core创建、输出准入和approved-plans仍作权威校验。不能把测试fixture复制为部署配置。

2026-10-24只读探测：项目没有配置有效的Live API地址；对文档示例`http://127.0.0.1:8000/openapi.json`读取返回连接拒绝。没有启动Core、NX或Mastercam，没有调用真实审核、制造或复位。**真实浏览器→Core→Mastercam尚待联合验收。**

联合验收还须核对：实际固定Golden的已安装模板摘要、EngineeringBinding与parse摘要匹配；实际native结果是否保留rough_step metadata/rules；实际七工序及资源缺失语义；声明审核身份允许的受控联调边界。配置不匹配时阻断，不回退Mock。现有HTTP不提供模板目录，本轮不扩展后台。

## 自动化与视觉证据

`npm run quality`通过：仓库检查、ESLint、Prettier、TypeScript、19个测试文件/272项Vitest及生产构建。

完整Playwright使用`CAPPTRON_E2E_NETWORK_COMPAT=1 npm run test:e2e -- --workers=1`，**78/78通过**，包含双视口52项既有r06回归与26项Core场景。Windows兼容开关沿用项目配置，断言未放宽。此前双worker运行75项通过、3项在初始页面加载失败（含`ERR_ADDRESS_IN_USE`）；切换单worker后完整通过，没有跳过失败场景或启用重试。最后补充CAM错误码/原因显示及规划来源文案后，quality再次通过，双视口core-live定向回归**16/16通过**。定向首轮有1项因页面重新加载而丢失内存会话（trace显示Vite重新连接、页面返回初始态，同期正在更新文档）；停止文件编辑后原样重跑全部16项通过。

测试响应由审计基线Core的Pydantic模型校验；保存21个本轮所需请求/响应schema，浏览器替身发送前再次用Ajv校验。模板工序来自2.3.0静态包；revision 2通过Core的`apply_parameter_patch`及`plan_digest`生成。生命周期、审批、CAM与NC均为合成替身，不能作为真实运行证据。POST RunReceipt不含output_revision，必须GET RunView。没有沿用旧的短摘要、status=stored、phase=simulate或空card fixture。

旧`core-workflow.spec.ts`已迁移到原r06控件；重复的旧批准/丢回执/NC失败断言收敛到`core-live.spec.ts`，没有跳过失败测试。原Demo四秒、编辑器、Agent、数据底座、页面独立滚动回归继续执行。

原始UI对照来自独立只读工作树 `FE-CONTRACT-002-baseline` 的`ce46313`，实际运行其planning/program-review测试，双视口28项通过。截图目录：

- [1920×1080](fe-contract-002-evidence/chromium-1920x1080/)：`baseline-*`为原版，`demo-after-*`为本次Demo，`live-*`为本次Live。
- [1440×900](fe-contract-002-evidence/chromium-1440x900/)：同上。

每种视口保存原版/本次Demo的进度就绪、工序详情、数据底座返回NC、编辑器差异对照，以及Live进度、工序、参数、NC和CAM等待确认，共26张。人工逐区核对主要布局；Demo进度就绪截图两种视口的文件SHA256均与基线相同，其余对照未见结构性退化，不将动态编辑器截图宣称为全像素一致。

视觉变化限定为：输入准备增加真实动作/状态；进度区显示真实阶段且不显示伪百分比；参数rough_step改为离散下拉；底部增加提交修订、声明审核人、工艺批准与CAM按钮；NC工具栏增加文件选择，正文只读，审核绑定精确版本。沿用两列进度区、工序侧栏、详情/参数区域、NC编辑器、三阶段、Agent气泡和原滚动结构；不改全局字体、间距或配色。局部CSS仅增加不确定进度动画（尊重减少动态效果）和NC输入控件的既有主题样式。

## 限制与延期

- 11项P0的前端路径已接通；真实闭环仍受部署与制造联合验收阻塞，不能宣称完成实机验收。
- 当前页面会话保留任务与已知run，网络重试沿用原命令；浏览器刷新后File/草稿/未决闭包不持久化，Core内存规划跨重启恢复不在本轮。运行或未决命令存在时应在本页完成查询，勿刷新后重新制造。
- P1：NC保存/版本对比/revise、高级恢复、现场量测写入、模板目录；Core已有NC接口不要求重开发。Live只读，不显示本地“保存成功”。
- P2：真实数据底座、通用Agent、任意STEP工艺。Live Agent气泡保留并说明尚未接入，不发送虚构建议或模拟制造成功；Demo仍独立可用。
