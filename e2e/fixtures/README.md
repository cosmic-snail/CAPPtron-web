# Core契约测试数据

来源：FE-CONTRACT-001审计基线 Core `a1cd73082a44de7732633ccbaa8b0d8c6e3eaaef` 的 `contracts` Pydantic模型及静态golden-b7 2.3.0模板包。`core-schemas.json`仅含本轮使用的21个模型，未进行全量Schema生成。

`core-golden.json`的Task/Run/PlanProduced/Card/CAM/NC响应在生成时经Pydantic校验；参数revision 2使用Core `apply_parameter_patch`与`plan_digest`产生。`coreFixture.ts`对动态请求和响应再次作JSON Schema校验，run POST使用RunReceipt，最终版本来自GET RunView。

所有生命周期/审批/CAM/NC是显式合成测试替身；不是实际部署注册证据或真实NC产物。`deployment`仅允许由Playwright路由返回，不发布到public，不用于制造。配置、identity、archive摘要与NC摘要必须由真实Core返回后才参与真实运行。此处完整格式的测试摘要不证明真实文件、归档或制造状态。


`onsite-v2.json` 由第二阶段 Core `make_contract` 使用安装的 Golden 2.3.0 字段声明及固定模板配置生成，任务身份取自 `core-golden.json`。它只用于替身测试动态字段、配置选择、摘要提交和状态展示，不用于部署或执行；工程/制造状态仍未验证。
