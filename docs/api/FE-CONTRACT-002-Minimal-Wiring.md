# FE-CONTRACT-002｜最小真实接线

基线：origin/main `ce46313`；独立分支 `feat/fe-contract-002-minimal-live-wiring`。PR #26（未合并）的三份审计成果只读参考自 `../FE-CONTRACT-001-web/docs/api/`。不重审65项，不恢复PR #24页面。

## 11项P0

1. **P0-01 / I-01** 原模型选择器上传：`POST /cad/assets`；CoreClient/useLiveWorkflow；已有支持。验收原字节上传、保存原command_id，回执只表示not_parsed。
2. **P0-02 / I-02/03** 输入准备NX解析：`POST/GET /cad/assets/{id}/parse`；同Hook；已有支持。区分running/parsed/failed并核对资产摘要。
3. **P0-03 / I-04/05** 输入准备创建固定Golden任务：`POST /planning/tasks`；受控部署配置+同Hook；API已有，配置需部署方提供。禁止默认2.2.0或假定2.3.0已安装，不提交虚构part。
4. **P0-04 / P-02/03/04** 原进度区：replan、GET run/results；同Hook+LiveProgress；已有支持。无百分比字段时不确定进度，completed须frontend available且实际结果/卡片可读，才解锁。
5. **P0-05 / P-04/05/06/08** 原工序/工步/参数/资源面板：复用结果；viewModel Adapter；已有部分支持。稳定ID/sequence，动态数量；缺少资源/单位明确未提供，未知参数只读，规范工步不与display_steps混算。
6. **P0-06 / P-06** 原参数区草稿及提交：replan.parameter_patch + run/result；Adapter/Hook；已有支持。只开放metadata与rules匹配的离散值，保留草稿直至新revision回读，不继承旧批准。
7. **P0-07 / C-01/02** 原底部操作区工艺批准：GET/POST process-card/review、GET approved-plans；Client/Hook；已有支持。卡片task_key使用UTF-8 base64url编码，批准精确revision，执行资格由Core确认。
8. **P0-08 / M-01/02** 原进度区CAM运行：POST /cam/runs、GET run、允许时observe；Hook/LiveProgress；已有支持。202非完成，展示真实phase/error/observation，等待确认停止自动轮询，恢复不再start。
9. **P0-09 / N-01/02** 原程序编辑器读取：GET NC版本及各file；Client/Hook/ProgramReviewPage；已有支持。多文件选择，原始正文、编码和版本来源，任何文件读取失败禁审。
10. **P0-10 / N-06/07** 原底部审核/下载：POST精确NC review、GET download；Client/Hook；已有支持。绑定完整NcVersionRef，按allowed_actions，仅下载服务端ZIP；本轮Live只读，NC保存/比较/revise延期P1。
11. **P0-11 / G-01/02/03** 三阶段及数据底座往返：App持有独立Live Hook，Demo Hook不变；已有GET用于已知ID续查。导航不丢身份/草稿；单飞可取消轮询、旧响应隔离、网络失败不切Mock、未知命令保留原意图供重试。

## 修改范围与状态边界

新增 `src/api/core/{contracts,viewModel,golden}.ts`、`src/features/core/useLiveWorkflow.ts`、`LiveProgress.tsx`；扩展既有client。App/WorkflowWorkspace仅注入数据与动作；ModelInputPage/InputPreparationPanel接原文件入口；ProcessPlanningPage/ProgramReviewPage以可选Live分支复用布局；ParameterFields/OperationDetails修正来源和离散规则；ProgramEditor增加只读能力。新增契约/Hook/E2E测试和两个视口截图。全局字体、间距、配色、滚动布局不重做。

后端权威：资产/解析、任务/运行/revision、工艺值及规则、工艺卡审批、执行资格、CAM阶段、NC精确版本/正文/审核/下载。前端状态：选中工序/文件、展开、草稿、当前页面、错误与重试入口。Demo、数据底座和Agent演示不能参与Live命令。

接线中实际增加的局部修改：AppShell恢复Live三阶段及数据底座导航；FileInfoBar/ModelFilePicker显示上传与解析状态；planning.css仅为无百分比进度条增加动画，review.css为新增审核人/文件选择控件复用既有主题。

## 最小阻塞与明确延期

- Q1：Core无HTTP模板目录。使用部署方发布的版本化固定配置（模板id/version/digest、execution_profile_digest、来源、EngineeringBinding声明），默认缺失即阻断创建。真实注册仍由Core创建及执行资格校验；配置不等于批准。
- Q2—Q4：缺少完整资源/参数描述时只读及“未提供”，不阻塞已有结果展示；只消费规范steps。
- Q9/Q10：本轮限当前浏览器会话；Core内存任务跨重启恢复和正式认证由部署方联合验收。审核人明确为声明身份。未决命令在当前会话保存原body；禁止以新键自动重发。
- 真实运行环境未证实可达前仅做契约替身测试和只读探测，不触发未授权Mastercam。
- P1：NC保存/比较/revise、现场事实写入、模板目录；P2：真实数据底座、通用Agent/任意STEP规划。无需新增同义Core接口。
