# 决策记录：不同步上游 Desktop 端

- 状态：已采纳（2026-09-24，随 dsh 0.1.7-rc.1 升级）
- 范围：`@deepseek-ai/dsh` 升级到 0.1.7-rc.1 时，是否引入上游 `apps/desktop`

## 结论

不引入。本仓库继续作为基于已发布 npm 包的 Electron 宿主，profile 继续使用 `web`。

## 依据

1. 上游 Desktop 端不出现在 npm 上。`apps/desktop` 是 `@deepseek-ai/dsh-desktop@0.1.7-rc.1`，
   `"private": true`，依赖大量 workspace 私有包（`dsh-api-gateway`、`dsh-deepseek-account`、
   `dsh-agent`、`dsh-client-connection`、`dsh-host-webserver` 等），无法作为依赖取得。
2. 上游 Desktop 的构建链不属于本仓库能力范围：自带 Python/Node/pnpm 三段运行时
   （`prepare-primary-runtime`）、COS 产物上传、macOS 公证、Windows 硬件签名与 NSIS 深度定制。
3. `desktop` 这个 profile 名被上游 Electron 独占，CLI 会直接拒绝
   （`error: profile "desktop" is managed exclusively by the Electron application`），
   且 0.1.7 随包不提供 `desktop` profile 模板。本仓库没有等价实现，也不应伪造该名称。
4. 本项目的定位是"包装官方 Web 体验"（见 README 首段）：不 fork、不修改、不注入、不重新实现 UI。
   引入上游 Desktop 的 Electron 壳会改变项目性质，并与上游产生同名的第二实现，增加混淆与维护面。

## 影响

- 运行方式不变：Electron 以 `ELECTRON_RUN_AS_NODE` 启动 `@deepseek-ai/dsh/lib/bin.js --profile web`。
- Windows 继续使用 browse 目录选择器（`config/windows-directory-picker.patch.yml`）。
- 上游 Desktop 独有的能力（应用内浏览器 tab 的租约/分区桥、强制更新与崩溃恢复、账号内嵌页）
  在本项目中不提供。
- 0.1.7 随包可获得的能力照常生效：agent preset 体系、`dsh-hmr` 配置热重载、
  "Open In..." 外部应用打开、Office 文档预览（LibreOffice 引擎按平台原生包随依赖装入）、
  侧边栏终端与文件预览。

## 已知的上游声明缺口（本次实测记录）

升级到 0.1.7 后，打包产物中以下能力**在任意裁剪安装里都不可用**（electron-builder 只复制根
清单可达的依赖，而这些包上游仅声明为 peer、从未安装）。它们在 0.1.5 产物里同样缺失，非本次
升级引入：

| 缺口 | 影响 |
|---|---|
| `@deepseek-ai/dsh-ptc-runtime` | `dsh-workflow-ptc` / `dsh-tools` / `dsh-ptc-runtime-node` 的 PTC 运行时；`DSH_TOOLS_MODE=ptc` 不可用（默认 native 模式不受影响） |
| `@deepseek-ai/dsh-deepseek-account` | `dsh-api-account-controller` / `dsh-deepseek-account-platform` 的账号后端；设置里的账号页不可用 |
| `@deepseek-ai/dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-store` | 实验性 agent-team / voice-input 客户端界面 |
| `bufferutil`、`utf-8-validate`、`@modelcontextprotocol/sdk` | `ws` 的可选原生加速与 MCP SDK 的 peer；缺失时按上游设计降级 |

这些缺口由 `scripts/verify-packaged-natives.mjs` 在每次打包时以 `note` 形式列出，便于后续需要时
补 pin；它们**不会**阻断构建（根清单声明的依赖缺失才会）。
