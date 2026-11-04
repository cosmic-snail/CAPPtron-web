# 贡献指南

1. 开发前阅读 `AGENTS.md` 和 `docs/architecture/frontend-architecture.md`，遵守当前已确认的 Figma r06 业务设计与安全边界。
2. 从最新 `main` 创建短期功能分支（例如 `feat/model-input`），通过 PR 合回 `main`。合并需要维护者授权并满足分支保护。已完成的旧开发分支不再作为开发入口。
3. 使用 `npm ci` 安装锁定版本的依赖；提交 PR 前执行 `npm run quality`，涉及页面/交互/视觉的改动还须运行 `npm run test:e2e`，并提交实际浏览器截图。
4. 在 PR 模板中用中文说明修改目的、验证证据，以及真实业务与 Mock 的边界；必要时提供不同数据规模的测试结果。
5. 等待 GitHub Actions 的 **Frontend Quality**、**Chromium E2E** 等适用检查完成，阅读 Codex Code Review 意见；不要以 AI 审查代替人工产品验收。
6. 修复确认的问题、处理讨论后，由维护者决定是否合并。不得绕过 `main` 分支保护。

## 代码与文档习惯

- 新增前端业务代码、组件、API Adapter、单元测试及 Playwright 测试默认使用 TypeScript（`.ts` / `.tsx`）；已稳定的 Node.js `.js` / `.mjs` 脚本可保留。
- README、设计说明、开发规范和必要的人工注释默认使用**简体中文**；标识符、API 字段、命令和配置键保持标准英文。
- 新增依赖时使用 `npm install`，同时提交 `package.json` 与 `package-lock.json`。
- 不提交 `dist/` 等构建产物、本地凭据、密钥或涉密/客户 CAD 数据。
- 不得把 Mock 结果标成真实 CAM、NC 或实机验证通过。

## 当前 UI 基线

遵守 [UI 基线](docs/workflows/UI-BASELINE.md)。未经维护者明确要求，不调整已确认的布局、字号、提示密度、导航和审核操作。后端能力接入应复用真实/模拟共用组件；不得借文档整理改动业务代码。
