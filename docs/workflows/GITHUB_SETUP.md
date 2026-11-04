# GitHub 仓库初始化与分支保护

仓库：`James-FE/CAPPtron-web`。

**当前状态说明**：仓库已经建立，当前可见性为 **Public**；`main` 已标记为受保护分支，并已存在 GitHub Actions 工作流。以下初始化流程主要用于了解历史工程搭建过程或在新仓库复用，**不应在现有仓库上盲目重新执行**。保护规则是否完整生效，以 GitHub 设置与实际 PR 检查为准。

## 首次初始化流程（仅供新仓库参考）

1. 安装 Node.js 22.12+、Git、GitHub CLI，并在目标 GitHub 账号中执行 `gh auth login`。
2. 确认源代码目录包含 `package.json`、`.github`、`src` 和 `docs`。
3. 对**尚未创建的**目标仓库，可以运行 `.\scripts\bootstrap-github.ps1`。脚本负责依赖安装、格式及工程检查、Git 初始化、创建/推送仓库；其新仓库创建逻辑默认请求 **Private**，但不会更改已经存在的仓库可见性。
4. 到 [GitHub Actions](https://github.com/James-FE/CAPPtron-web/actions) 检查 `Quality / Frontend Quality` 和 `Package / Web Package` 的真实运行结果。工作流存在不代表已经成功运行。
5. 如需配置/更新 Ruleset，先运行只读计划与检查，再按[Ruleset IaC](RULESET_IAC.md)中的审批流程显式应用。上传 `.github/rulesets/main.json` 本身并不会更改 GitHub 的保护策略。
6. 使用独立功能分支提交测试 PR，验证要求的质量检查确实能够阻止不符合规则的合并。

## 分支保护目标

- `main` 采用 PR 审核流程，未经维护者明确批准不得自动合并。
- 对更新后的 `main` 代码要求确切名称的 **Frontend Quality** 检查通过；是否还应把 `Chromium E2E` 设为必需检查，由维护者根据当前 Ruleset 配置确认。
- 需要解决 Review 中未处理的讨论；项目只有一名人工维护者时，不强制添加不必要的第二名人工审批者。
- 禁止强制推送或删除默认分支。
- 如果以后增加正式人工维护者，再评估所需审批人数。Codex Review 留言不等于人工 `APPROVE`。

当前从最新 `main` 创建短期 `feat/*`、`fix/*` 或 `docs/*` 分支，提交 PR 至 `main`。旧 `develop/r06-ui` 已完成集成，不再作为开发入口。合并需满足分支保护及维护者授权；当前界面以 [UI 基线](UI-BASELINE.md) 为准。

**GitHub 计划与权限**：Ruleset 在私有仓库的可用范围可能取决于计划等级和仓库权限。当前仓库是 Public，不能沿用旧文档中“仓库仍为 Private”的假设，也不能只凭 JSON 文件断定规则已经生效。

## 凭据与安全

- 初始化脚本使用本地 `gh` 登录，不在仓库中保存 Token。
- CI 通常只需要 `contents: read` 权限，无需 SSH Key、OpenAI API Key 或 CAM 凭据。
- `VITE_` 环境变量会暴露在浏览器客户端，**不能存放秘密信息**。
- 只授予被授权的 ChatGPT/Codex 账号与工作区必要的仓库访问权限。

## 当前核对清单

- [x] GitHub 仓库已创建，默认分支为 `main`；仓库目前为 Public。
- [x] `package-lock.json` 已提交。
- [x] 仓库中已配置 `Frontend Quality` 和 `Chromium E2E` 工作流。
- [ ] 在目标 PR 上确认两项检查的实际执行状态均为成功。
- [ ] 在 GitHub 远程设置中确认 `main` 的 Ruleset 内容、执行状态及其实际阻止不合规合并的能力。
- [ ] 确认正式 Codex 自动审查已在预期账号中启用（如计划使用）。
- [ ] 对开发分支至 `main` 的合并始终执行人工批准。
