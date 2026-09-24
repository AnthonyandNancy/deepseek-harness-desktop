# Typert 注册表被整体回滚：内置面板全挂的事故复盘与修复方案

**Goal:** 修掉 `0.3.15` / `@deepseek-ai/dsh@0.1.7-rc.1` 下「选择工作区目录为空、设置→内置插件读不出、Agent 预设报错」这一组故障。已定位唯一触发点（profile 里一个第三方插件的**旧格式 typert 清单**），方案分三层：profile 立即恢复 → 插件侧根治 → 桌面端加固（不再被单个第三方插件拖垮内置功能）。

**Architecture:** 类型化 Remote 接口由 Harness **宿主侧**的 `@deepseek-ai/dsh-typert-loader` 统一扫描 Loader 条目、校验各包的 `./typert` 清单，再 `ctx.typert.register()` 进 `DescriptorStore`。该校验是**全有全无**的：任一 contributor 失败会在 `apply()` 末尾聚合抛错 → 该 fiber 的 `ctx.effect` 全部回滚 → **所有** contributor 的 strict 定义一起被撤；而 `DescriptorStore.history` 不随 `withdraw()` 清空 → `dsh-api-gateway` 认定这些 endpoint「见过但定义没了」，拒绝 SRC 兜底 → 所有「只有 strict 定义」的接口整体报 `gateway/definition-unavailable`。桌面端的 Windows 目录选择器走的正是其中一条（`directoryPicker/list`），因此被一并打掉。

**Tech Stack:** Electron 宿主 + 已发布 npm 包（不 fork、不改 Harness UI）；profile 层 `~/.dsh/profiles/web/{package.json,cordis.patch.yml}` + `--patch` overlay；验证用 Node 26 + 宿主 CLI。

---

## Global Constraints

- 桌面端不 fork、不修改、不注入 Harness UI；扩展只走 profile patch 层与 Electron 宿主能力。
- 诊断结论必须可复现：每个结论都要有实测证据，不得只凭读码推断。
- 上游缺陷只**上报**，不在本仓库打补丁越权修 Harness。
- 改动 profile（用户 home）前保留 `.bak`；墓碑注释必须写明「删除时机」。

---

## 事实基线（均为实测）

| 项目 | 结论 | 证据 |
|---|---|---|
| 应用的错误文案 | `typert gateway: directoryPicker/list: its strict definition was withdrawn and SRC fallback is forbidden`；同型报错见 `agentPresets/list`；设置→内置插件渲染为「暂时无法读取插件。」（`pluginInventory/list` 失败） | 用户截图 + 直接 RPC 探针复现 |
| 报错来源 | `dsh-api-gateway` 的 `resolveDescriptor()`：`local.get()` 未命中且 `local.hasSeen()` 为真 → 抛 `gateway/definition-unavailable` | `node_modules/@deepseek-ai/dsh-api-gateway/lib/index.js:989` |
| 触发者 | profile bundle `dsh-plugin-archived-sessions@0.1.0`（`link:D:\code\ai\dsh-plugin-archived-sessions\...`）的 `lib/typert.host.js` 是**旧格式**：codec 用 `schema:`，无 `create()` 工厂 | `dsh-typert-loader: ... invocation "...#archivedSessions/delete" parameter codec has no create() factory` |
| 放大器 | `dsh-typert-loader.apply()` 末尾 `throw new AggregateError(failures, ...)` → 该 fiber 全部注册被 Cordis 回滚 | `node_modules/@deepseek-ai/dsh-typert-loader/lib/index.js:344` + 启动日志栈 |
| 兜底被永久关闭 | `DescriptorStore.withdraw()` 不删 `history`，`hasSeen()` 因此长期为真 | `node_modules/@deepseek-ai/dsh-typert-registry/lib/index.js:59-126` |
| 影响面 | profile 全部 bundle 中只有这一个包带 `./typert` 导出，且它是坏的 → 一个坏包打掉全部内置 strict 接口 | 全 profile 扫描 + 实测 |
| 修复验证 | 追加 `--patch` 只禁用 `archived-sessions` 一行 → warning 4→3，三个 endpoint 全部 `ok:true` | 实测（本次事故的直接证明） |
| 附带问题 1 | `cordis.patch.yml` 里 `- id: authorization / disabled: true` 仍**生效**，压掉的是官方 `@deepseek-ai/dsh-base` 的 `@deepseek-ai/dsh-authorization` 行 → `deepseek-account` / `account-controller` 停在 `pending (waiting for service: authorization)` | `--dump-config` 输出第 64-67 行 `# == @deepseek-ai/dsh-base, patched by ...cordis.patch.yml` |
| 附带问题 2 | 同文件另有 9 条失效墓碑，各产生一条 `patch: entry "..." not found` 噪声警告 | `--dump-config` stderr |
| 附带问题 3 | `dsh-shell-selector` 报 `failed to import`，真因是它 import 了 0.1.7 已删除的 `settingsNamespace`（`@deepseek-ai/dsh-settings` 现在只导出 `SettingsConflictError, SettingsForms, default, redactSecrets`） | 用 `--import` 探针包住 `EntryTree.prototype.import` 抓到：`SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'settingsNamespace'` |
| Harness 诊断缺陷 | 失败条目只报字面量 `failed to import`，真实原因被 `Entry._init` 吞进 `ctx.logger.error`（桌面端未订阅日志 → 完全不可见） | `dsh-app-boot` 的 `inactiveEntries()`；`cordis-plugin-loader` `Entry._init` 的 `catch` |
| 桌面端缺口 | 子进程 stdout/stderr 只在**启动失败**时随异常带出；就绪后整段输出（含 `dsh: warning: N entries did not activate` 与 AggregateError）被丢弃 | `src/dsh-service.js` 的 `startDshService`（`ready` resolve 后不再引用 `output`） |
| 工具链现状 | `@deepseek-ai/dsh-typert-generator` 已发布 `0.1.7-rc.1`（新版生成 `create: ...`）；插件 workspace 里装的是 `0.1.0-rc.5`，且指向 `file:../deepseek-harness-desktop/upstream/...`（该目录已不存在） | `npm view` + 插件 `node_modules` manifest |
| 手改方案可行性 | 把 host 清单里 7 处 `codec.schema: X` 改成 `codec.create: () => X` 后，`validateTypertManifest()` **通过**；原文件按原样失败 | 实测（内存内改写 + 调用官方校验器） |

---

## Task 1：profile 立即恢复（5 分钟，先让内置功能回来）

- [ ] 1.1 备份：`cp ~/.dsh/profiles/web/cordis.patch.yml ~/.dsh/profiles/web/cordis.patch.yml.bak-$(date +%Y%m%d-%H%M%S)`
- [ ] 1.2 在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加临时墓碑（**保留功能的前提是 Task 2 完成**）：

```yaml
# 2026-09-24：dsh-plugin-archived-sessions 的 ./typert 是旧格式（codec.schema，缺 create()），
# 0.1.7 的 dsh-typert-loader 校验失败即整体抛错，会把该 fiber 的**全部** strict 注册一起回滚，
# 导致内置 directoryPicker / agentPresets / pluginInventory 等接口全挂。
# 删除时机：Task 2 重建清单并验证通过后，删掉这三行。
- id: archived-sessions
  disabled: true
```

- [ ] 1.3 删除 `authorization` 墓碑（第 47-53 行整段）。用户原注释判断「重启后已无作用」在 0.1.7 上**不成立**：该 seam 现在是官方 `dsh-base` 的行，墓碑照样命中。
- [ ] 1.4 顺手删掉 9 条失效墓碑（`dsh-cleanup-archived` / `conversation-enhancer` / `dsh-vision-cloud` / `vision-cloud` / `dsh-better-sidebar` / `@anthonyandnancy/dsh-auto-collapse` / `dsh-vision-tool` / `lmm-model-provider` / `dsh-lmm-provider`），去掉 9 条 `patch: entry ... not found`。
- [ ] 1.5 验证：`node --expose-internals node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --dump-config` → stderr 无 `patch: entry ... not found`，输出中不再出现 `id: authorization`；正常启动后 `dsh: warning: 2 entries did not activate`（剩 `shell-selector` 与 typert-loader，见 Task 2/3）。

## Task 2：根治 archived-sessions（保留功能，推荐）

两条路，任选；**A 是正路，B 是应急**。

- [ ] 2.A.1 在 `D:\code\ai\dsh-plugin-archived-sessions` 里把两个悬空的 `file:` 依赖改成已发布版本（根 `package.json`）：

```jsonc
"@deepseek-ai/dsh-typert-generator": "0.1.7-rc.1",
"@deepseek-ai/dsh-typert-protocol": "0.1.7-rc.1"
```

  （原值 `file:../deepseek-harness-desktop/upstream/deepseek-harness/packages/typert/*` 指向的目录已不存在；插件包内 `@deepseek-ai/dsh-typert-protocol: workspace:^` 若解析失败，同样改成 `0.1.7-rc.1`。）
- [ ] 2.A.2 `pnpm install && npm run build`（`build:host` 重生成 `lib/typert.host.js`，`build:client` 重生成 `lib/typert.remote-client.js`）。
- [ ] 2.A.3 静态自检：`grep -c "create:" packages/dsh-plugin-archived-sessions/lib/typert.host.js` 应 ≥ 7、`grep -c "schema:"` 应为 0；`lib/typert.remote-client.js` 同理。
- [ ] 2.A.4 删掉 Task 1.2 的墓碑，重启后 `dsh: warning: 1 entries did not activate`（只剩 `shell-selector`）。
- [ ] 2.B.1（应急，保留功能但改的是生成物）手改 `packages/dsh-plugin-archived-sessions/lib/typert.host.js`：7 处 `schema: <expr>,` → `create: () => <expr>,`；`lib/typert.remote-client.js` 同样 7 处。
- [ ] 2.B.2 已实测：改后的 host 清单能被 `validateTypertManifest()` 接受（原样则报 `has no create() factory`）。**注意**：这是生成文件，`npm run build` 会覆盖，只作应急；且它只处理 host 面，插件自己的客户端 UI 若仍异常，再对 `./remote` 做同样处理。

## Task 3：修 `dsh-shell-selector` 的 `failed to import`

- [ ] 3.1 在 `D:\code\ai\dsh-shell-parser\dsh-shell-selector\src\settings.ts` 去掉已删除的 `settingsNamespace` 导入，改为本地等价实现（语义即注释里的 lowercase kebab）：

```ts
/** The settings namespace (lowercase kebab). */
const settingsNamespace = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const SHELL_SELECTOR_SETTINGS_NAMESPACE = settingsNamespace('shell-selector')
```

- [ ] 3.2 重新构建该插件（`lib/` 是产物），重启确认 `shell-selector` 不再出现在未激活列表。
- [ ] 3.3 复核其余 peer 声明（插件按 `^0.1.0-rc.6` 编译），必要时整体升到 `0.1.7-rc.1` 的 API。

## Task 4：桌面端加固（本仓库，让这类故障不再"哑"）

- [ ] 4.1 `src/dsh-service.js`：就绪后不再丢弃子进程输出。把累积的 `output` 显式返回/回调出去，并落到 `userData/logs/dsh-service-<ts>.log`（可用环境变量开关，默认只保留最近 N 个）。
- [ ] 4.2 解析启动输出里的激活告警（`dsh: warning: (\d+) entries did not activate`、`typert-loader ... failed to register`、`... has no create() factory`），在 UI 上给一条可操作提示：指出是哪个插件、以及「它的清单格式与当前 Harness 不兼容，已导致内置面板失效」。
- [ ] 4.3 （推荐）启动前预检 + 自动降级：对本 profile 每个 bundle 尝试 `import(<pkg>/typert)` 并调用官方 `validateTypertManifest()`（本次事故就是这么定位的）；失败的 bundle → 追加一条**临时** `--patch`（`- id: <row> / disabled: true`）并在 UI 提示「已临时禁用插件 X」。即使上游不修，一个第三方插件也不会再拖垮全部内置面板。
- [ ] 4.4 补 node:test：fixture 用一个旧格式 manifest 的假包，断言「生成 disable patch + 正确提示文案 + 不阻断启动」。

## Task 5：上游上报（三个缺陷，附最小复现）

- [ ] 5.1 `dsh-typert-loader`：一个 contributor 的清单校验失败会通过 `AggregateError` + Cordis effect 回滚撤掉**其他所有** contributor 的 strict 定义 → 应改为「坏 contributor 跳过并记录」，或每个 contributor 用独立 registration scope。
- [ ] 5.2 `dsh-typert-registry`：`DescriptorStore.withdraw()` 不清 `history` → `dsh-api-gateway` 的 `hasSeen` 分支永久拒绝 SRC 兜底，回滚后的接口即使定义恢复也报 `definition-unavailable`。
- [ ] 5.3 `dsh-app-boot`：`inactiveEntries()` 对无 fiber 的条目只报字面量 `failed to import`，真实原因只在 `ctx.logger.error` → 把 `Entry._init` 捕获的原因带进诊断输出（本次排查全靠自己注入 loader hook 才拿到真因）。

## Task 6：回归验证清单

- [ ] 6.1 `--dump-config` 干净（无 `not found`、无 `authorization` 行）。
- [ ] 6.2 启动后激活告警条数与预期一致。
- [ ] 6.3 三个内置接口恢复：`POST /api/directoryPicker/list`、`/api/agentPresets/list`、`/api/pluginInventory/list` 均 `result.ok === true`。探针：先 `GET /?token=...`（`redirect:'manual'` 取 `Set-Cookie`，再带 Cookie 取页面），随后按浏览器客户端的方式发 `{type:'client-request', rpcId, method, payload:{args:{}}}`。
- [ ] 6.4 桌面端（打包版）启动到就绪行 `dsh web: http://127.0.0.1:<port>`，且「选择工作区目录」列表非空。
- [ ] 6.5 `npm test` 0 fail。

---

## 排查手法备忘（Harness 吞掉的错误怎么捞回来）

Harness 会把 Loader 的导入失败吞进 `ctx.logger.error`，桌面端读不到，`0.1.7` 也没有 debug 环境变量。可在不修改任何 Harness 文件的前提下注入探针：

```js
// probe.mjs —— 用 node --import file:///<绝对路径>/probe.mjs 启动宿主 CLI
const url = new URL('./node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js', import.meta.url).href
const { EntryTree } = await import(url)
const original = EntryTree.prototype.import
EntryTree.prototype.import = async function (name, ...rest) {
  try { return await original.call(this, name, ...rest) }
  catch (error) { process.stderr.write(`[import-fail] ${name}\n${error?.stack ?? error}\n`); throw error }
}
```

（同理可包装 `dsh-typert-loader` 的 `validateTypertManifest` 看清单校验细节。）

---

## 执行记录（2026-09-24 第二轮）

**Task 1 ✅ 完成。** `cordis.patch.yml` 里 `authorization` 墓碑与 9 条失效墓碑已删；`archived-sessions` 墓碑在 Task 2 完成后删除。

**Task 2 ✅ 完成（A 路线）。** `dsh-plugin-archived-sessions` 侧换了 typert 生成器链路，并把 peer 范围整体升到 `^0.1.7-rc.1`（新增 `dsh-api-gateway` / `dsh-api-session-controller` / `dsh-api-workspace-controller` / `dsh-client-ui-renderer`，删掉已退役的 `dsh-client-runtime` / `dsh-client-web-react` / `dsh-settings`）；客户端半边按 0.1.7 约定重写（类型目标是 Cordis `Context`，客户端服务用 `import type {}` 从归属包引入）。另按要求 `RiskConfirmation` 新增的必填 `closeLabel` 补了 zh/en 文案。`scripts/check-typert-contract.mjs` 已加固：现在同时要求 `create:` 且拒绝 `schema:`（两个方向都实测过会拦下）。

**验证证据（UI 级，headless Chromium + CDP，非仅 RPC）：** 设置页正常渲染（通用设置/模型/Command Code/内置插件/技能/Agent 预设/归档会话/模型能力/插件），内置插件页列出「全局插件 187 个」无「暂时无法读取插件。」，Agent 预设页 4 个内置预设齐全，控制台零报错、无失败请求；profile 7 个插件里有 6 个的 `client.js` 被 shell 打包加载（含本次修复的 `dsh-plugin-archived-sessions/client.js`）。宿主侧 `dsh: warning: 1 entry did not activate` 只剩 `shell-selector`。

**Task 3 ❌ 未执行（范围超出「先修复」）。** 复查后这**不是**一行补丁能修的，`shell-selector` 要按 0.1.7 迁移 5 处：

1. `settingsNamespace` 已从 `@deepseek-ai/dsh-settings@0.1.7-rc.1` 删除（该包现在只导出 `SettingsConflictError`/`SettingsForms`/`redactSecrets`）→ host 半边在 ESM link 阶段就抛错，整个插件不加载。用 `Entry.prototype._init` 探针抓到的原文：`SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'settingsNamespace'`。
2. `ctx.settings.register(ns, schema, {base, applies})` 在 0.1.7 不存在：表单现在挂在**插件自己的 loader entry** 上（`entry.fiber.runtime.Config`），键就是 entry id（`shell-selector`）。要改成 `export const Config = ...`，读取走 `describe()`（按 entry id）或 `apply(ctx, config)`；`replace(ns, section, rev)` 名字与签名仍在（`ns` 语义改为 entry id），`writable` 变成 getter。
3. `settingsScope.get()` 随 scope 一起消失 → 改读 `describe()`/`config`。
4. **比 1 更致命**：插件 `cordis.patch.yml` 里由 `scripts/render-patch.mjs` 生成的 `!!js` 启动表达式读的是 `$DSH_HOME/settings.yaml`（决定这次进程挂哪个 shell executor）——0.1.7 不再用这个文件，`SettingsForms.importLegacyDocument()` 启动时会把它改名（实测 `~/.dsh/settings.yaml` 已在 09:41 变成 `settings.yaml.imported`）。所以只修 1-3 的话，设置页能回来，但用户在页面里选的 shell **永远不会在下次启动生效**。表达式要改成读 profile patch 中 `shell-selector` 条目的 `config`。
5. 客户端 `src/client/index.tsx` 的 `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` 与 `dsh.client.inject` 里的退役包，按 Task 2 的做法重写。

**Task 4 ❌ 未执行。** 4.1（就绪后保留子进程输出）是本次事故里最省力的止血点：真因当时的启动日志里就有，只是被桌面端丢弃了。

### 上一轮遗留的手法补充

Harness 吞掉的导入错误，用 `Entry.prototype._init` 探针比包 `EntryTree.prototype.import` 更贴：`_init` 的 `catch (error) { this.ctx.logger.error(error) }` 正是吞掉真因的那一行，而 `Entry` 从 `@deepseek-ai/cordis-plugin-loader` 是具名导出的，可直接替换（进程用 `NODE_OPTIONS=--import=file:///<probe>.mjs` 起）。另注：`inactiveEntries()` 输出的 `failed to import` 是字面占位符（`entry.fiber === undefined`），与真实原因无关，不要据此推断。
