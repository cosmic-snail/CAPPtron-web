# CAPPtron-web

CAPPtron CNC Agentic Programming 项目的 Web 前端，技术基础为 **React + TypeScript + Vite**。

当前稳定入口为 **main**。2026-10-27，维护者完成 PR #35 合入版本 `b0c4e349cfef1e85e9496941d4a0594abf7a6879` 的人工视觉确认，作为当前 UI 基线。后续接口接入与修复应保持该布局、字号、信息密度和局部滚动体验；界面变更需维护者明确授权并重新验收。

当前支持三个入口：原型/历史案例、真实 Core 联调、`/?mode=simulation` 本地 JSON 模拟。真实与模拟复用三阶段页面；模拟可独立体验输入、规划、参数修订、审核人、CAM 状态及 NC 审核，不连接 NX 或 Mastercam。真实模式依赖受控部署配置和 Core 服务，不会自动回退模拟。模拟任务、恢复日志及 NC 本地草稿可持久保存；原型演示会话仍主要保存在内存中。真实模式下 Agent 抽屉连接 Core 只读对话 Agent（Core 需开启 `CAPPTRON_AGENT_ENABLED`，见 [Agent 抽屉接入](docs/api/Agent-Drawer-Live.md)）；原型与模拟模式仍为固定说明。文件解读页面和数据底座真实 Reader 尚未接入。

当前界面与证据入口见 [UI 基线](docs/workflows/UI-BASELINE.md)，真实接入见 [Golden 配置与恢复](docs/api/Golden-demo-integration-20261025.md)，模拟使用见 [模拟流程说明](docs/api/Simulation-Acceptance.md)。

## 设计与相关仓库

- [Figma r06 设计](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK)
- [CAPPtron-core 后端](https://github.com/James-FE/CAPPtron-core)
- [工程参考仓库](https://github.com/cosmic-snail/CAPPtron-core)

当前产品决策：**先高保真实现 r06，r07 布局重设计暂缓**。UI 是否完成以浏览器实际使用与人工验收为准，不能仅凭 CI 通过判定。

已讨论但暂不实施的功能统一记录在[待做功能](docs/待做功能.md)，后续按条目补充依赖、验收条件与实施进展。

## Quick Start｜快速启动

准备 **Git、Node.js 22.12+ 和 npm**；推荐使用与 `.nvmrc` / CI 一致的 Node.js 22.x。体验已验收版本请使用 `main`。

### 首次获取并启动

```bash
git clone --branch main https://github.com/James-FE/CAPPtron-web.git
cd CAPPtron-web
npm ci
npm run dev
```

浏览器打开 **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)**。保留运行命令的终端，停止服务按 `Ctrl+C`；修改源码后 Vite 通常自动热更新。普通 Demo 无需配置 `.env` 或启动 CAPPtron-core。

### 已有本地工程，每次启动

在工程根目录运行 `npm run dev` 即可。本机 Windows PowerShell 示例：

```powershell
Set-Location 'D:/GPT_workspace/CNC_project/CAPPtron-web'
npm run dev
```

其他电脑请将路径替换为自己的克隆目录。仅在首次安装、依赖变化或 `node_modules` 缺失时重新执行 `npm ci`。若 5173 已有本工程服务，直接打开上述地址。

### 构建与本地预览

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。构建产物为 `dist/` 静态文件；preview 用于检查构建结果，不提供开发模式下的本机私有 NC 读取。

完整步骤、启动后的 Demo 路径、可选 NC 配置、端口占用与 PowerShell 常见问题见 **[快速启动指南](docs/workflows/QUICK_START.md)**。

查看数据大屏：点击顶部 **“数据底座”**。点击资源条、模型登记或知识入口可搜索、分页和查看只读详情；“返回智能工艺工作台”保留原工序、参数、NC 编辑及 Agent 会话。当前快照固定为 2026-10-20，页面中的演示日不是系统当天。

工程检查使用 `npm run quality`，包含基础检查、ESLint、Prettier、TypeScript、Vitest 和生产构建。数据底座独立验证使用 `npm run validate:foundation`，调用示例使用 `npm run example:foundation`。新增或升级依赖时才使用 `npm install`，并同步提交 `package.json` 与 `package-lock.json`。

## 数据底座大屏与真实数据接入

大屏通过七个异步 `DataFoundationReader` 方法读取统计、目录和详情。顶部为五项 KPI，另有趋势、知识环图、模型库、业务资源概览和热点知识。模型调用卡片已按维护者意见移除，其底层统计字段保留兼容。

当前数据是经过人工审查的车削 Mock：24 个零件、32 套方案、3 台机床、40 把刀具、72 条知识、6 条模型登记。版本 `foundation-turning-mock-v2`，seed `20261020`，日期 `2026-10-20`；全部模型未接入。总资产 171 不含模型，六类目录总量 177。正式数据库、统计服务和模型 API 尚未接入。

后续维护者或 Agent 建议按以下顺序阅读：

1. **[Reader 接口与真实数据接入指南](docs/api/data-foundation-reader-v1.md)**：七个方法的输入、默认值、范围、返回字段、统计/时间/分页规则、来源、错误，以及真实 Reader 接入清单。
2. [领域契约与数据关系](docs/architecture/data-foundation-v1.md)：六类实体、稳定身份、单位、Schema、关系校验及制造可信度边界。
3. [FE-004B 验收记录与截图](docs/workflows/FE-004B-ACCEPTANCE.md)：页面结构、会话保持、测试和已知限制。
4. [组合入口](src/app/dataFoundation.ts)、[接口源码](src/api/data-foundation/reader.ts)、[完整类型](src/api/data-foundation/types.ts)、[可执行消费示例](src/api/data-foundation/example.ts)。

接入真实数据时，在数据层实现同一 Reader，再于组合入口替换稳定实例；页面不应直接请求原始数据或导入生成器。**目前没有已发布的数据底座 HTTP URL，也没有配置一个 `.env` 开关就能启用的 live 服务。** 先与后端确认实际接口、权限和快照一致性，再实现运行时校验、错误映射及联调测试；读取失败不得静默回退 Mock。详细步骤见上述接口指南。

## Playwright 浏览器验收

首次安装 Chromium 浏览器依赖：

```bash
npm ci
npx playwright install chromium
```

在 Linux / CI 中，如需系统级依赖：

```bash
npx playwright install --with-deps chromium
```

运行测试与查看报告：

```bash
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:report
```

Playwright 会通过 `webServer` 自动以 `e2e` 模式启动独立的 `127.0.0.1:5183` Vite 服务，本地和 CI 均不复用已有服务，也不读取日常开发的私有 NC 配置。日常开发仍使用 5173。`npm run test:e2e -- --headed` 可显示 Chromium 测试窗口。Chromium 浏览器文件在本机 Playwright 缓存中，不提交到 Git。

`e2e/smoke.spec.ts` 覆盖 FE-001 模型输入页，在 **1920×1080** 和 **1440×900** 两种桌面视口检查页面加载、运行时错误、控件可见性与遮挡、横向溢出、文件选择器、更换与取消、长文件名、非法格式、拖放、Demo 来源及未实现入口的鼠标/键盘反馈。测试同时确认没有上传请求，不依赖真实 FastAPI、Mastercam 或外部服务。通过测试仍不代表人工视觉验收通过。

- 初始、本地文件、Demo 三种状态的真实截图作为附件出现在 `playwright-report/index.html`，原始 PNG 位于 `test-results/` 各视口目录，分别名为 `model-input-empty.png`、`model-input-local.png`、`model-input-demo.png`。
- 失败时可查看错误、截图与 `trace.zip`；使用 `npx playwright show-trace <trace.zip的实际路径>` 调试。
- GitHub PR 的 **Quality / Chromium E2E** Job 会上传 `playwright-results` Artifact（保留 14 天）。下载、解压后可用 `npx playwright show-report <解压后playwright-report目录>` 查看。
- 当前人工确认的基线与截图清单见 [UI 基线](docs/workflows/UI-BASELINE.md)。历史运行截图不自动成为当前基线；尚未建立 `toHaveScreenshot` 像素快照断言。

FE-001 的设计来源与组件边界见 [FE-001 验收说明](docs/workflows/FE-001-ACCEPTANCE.md)。现有 `planning.spec.ts`、`case-catalog.spec.ts`、`program-review.spec.ts` 还覆盖动态工序、现场草稿、Agent、案例读取和程序编辑审核；程序来源与使用限制见 [FE-003 验收说明](docs/workflows/FE-003-ACCEPTANCE.md)，数据读取契约见 [数据底座 v1](docs/architecture/data-foundation-v1.md)。

`data-foundation.spec.ts` 覆盖两个桌面尺寸的大屏、固定快照标识、键盘图表、资源搜索/分页/详情、焦点恢复及工作台参数/Agent 保持；`program-review.spec.ts` 还验证大屏往返后的 NC 草稿、修订与撤销历史。页面组件测试通过独立小数据集 Reader 验证可替换性、live 来源、空数据、错误重试及迟到响应。

## GitHub 自动检查与分支协作

- `.github/workflows/quality.yml`：PR 及 `main` Push 时运行 **Frontend Quality**（基础、格式、类型、单测、构建、工程脚本）与独立 **Chromium E2E** 两个 Job。
- `.github/workflows/package.yml`：`main` Push 或手动触发时打包并上传 `dist/`（保留 30 天）。
- `.github/rulesets/main.json`：目标分支保护策略；**提交 JSON 本身不会使远程规则自动生效**。
- `AGENTS.md`：Codex 开发与审查规则；**仓库中存在审查规则不意味着云端自动 Code Review 已启用**。
- 从最新 `main` 创建短期功能分支，PR 提交至 `main`；未经维护者明确批准不得合并至 `main`。

详见 [贡献指南](CONTRIBUTING.md)、[GitHub 配置与分支保护](docs/workflows/GITHUB_SETUP.md)、[Codex 审查配置](docs/workflows/CODE_REVIEW.md) 以及 [测试说明](docs/workflows/TESTING.md)。

## GitHub 初始化与规则管理（历史/维护工具）

`scripts/bootstrap-github.ps1` 是**首次创建仓库**时使用的初始化脚本：安装依赖、运行检查、初始化 Git 并创建/推送远程仓库（新建时默认请求 Private 可见性）。**当前 GitHub 仓库已存在且公开，不应为了正常开发重复运行初始化脚本**；它也不会自动把现有公开仓库变为私有。

需要维护 Ruleset 时，在 Windows PowerShell 中先运行只读计划：

```powershell
.\scripts\configure-ruleset.ps1
.\scripts\configure-ruleset.ps1 -Mode Check
```

只有确认变更并具备权限时，才运行 `.\scripts\configure-ruleset.ps1 -Mode Apply`，根据提示输入 `APPLY`。私有仓库的部分 Ruleset 能力可能取决于 GitHub 计划。以 GitHub 远程规则的实际状态为准，不以文件存在推断已启用。

## 前后端与 CAM 安全边界

- 浏览器只通过 `CAPPtron-core` 暴露的 FastAPI 接口访问业务，不直连 Mastercam、SSH、Windows Worker 或 CAM SDK。
- 任务、工序、修订和反馈的权威 ID 与状态由后端提供。
- **工艺卡审批、NC 程序人工确认、仿真验证及加工安全是不同概念**，不得混用。
- 演示 Fixture、Mock NC 和模拟 Agent 回复不得伪装成真实制造结果。
- 优先完成 P0 动态业务 UI；STEP 三维预览属于后续增强内容。

开始实现页面之前，请阅读 [前端架构说明](docs/architecture/frontend-architecture.md)。
