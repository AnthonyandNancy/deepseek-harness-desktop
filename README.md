# DeepSeek Harness Desktop

一个非官方的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 轻量桌面封装。

应用会在随机本地端口启动官方 `@deepseek-ai/dsh` Web 服务，并在 Electron 桌面窗口中显示。它不会 fork、修改、注入或重新实现 Harness UI。

## 下载

目前提供 macOS Apple Silicon 安装包：

- [下载 Mac 安装包（Apple Silicon DMG）](https://github.com/steven-kid/deepseek-harness-desktop/releases/latest/download/DeepSeek-Harness-Desktop-0.1.2-arm64.dmg)
- [查看所有版本](https://github.com/steven-kid/deepseek-harness-desktop/releases/latest)

## macOS 安装

应用已进行完整性签名，但尚未经过 Apple 公证。首次打开时请按以下步骤操作：

1. 打开下载的 DMG，将 **DeepSeek Harness** 拖入“应用程序”。
2. 打开 **DeepSeek Harness**。如果 macOS 阻止启动，请点击“完成”。
3. 打开“系统设置 → 隐私与安全性”。
4. 滚动到“安全性”，找到关于 **DeepSeek Harness** 的提示，点击“仍要打开”。
5. 再次点击“打开”进行确认。

“隐私与安全性”确认通常只需完成一次。

## 工作原理

1. Electron 使用 `--profile web --host 127.0.0.1 --port 0` 启动内置的 `@deepseek-ai/dsh` CLI。
2. 等待官方 `dsh web:` 就绪信号。
3. 在沙箱化的 Electron 窗口中加载本地页面。
4. 退出应用时自动关闭本地服务。

所有 DeepSeek Harness 数据、设置、模型、会话和插件能力均由上游官方包提供。

## 上游版本

当前版本固定使用 `@deepseek-ai/dsh` `0.1.0-rc.6`，以保证打包结果可复现。

## 说明

本项目为非官方社区封装，与 DeepSeek 不存在隶属或官方合作关系。DeepSeek Harness 及相关名称的权利归其各自所有者所有。

## 许可

桌面封装采用 [MIT License](LICENSE)。内置的 DeepSeek Harness 同样采用 MIT License，其许可声明保存在 [`third-party-licenses/deepseek-harness-LICENSE`](third-party-licenses/deepseek-harness-LICENSE)。

应用图标使用上游 DeepSeek Harness Web favicon 中的黑色鲸鱼图案。

---

## English

An unofficial, minimal desktop wrapper for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The application starts the official `@deepseek-ai/dsh` Web profile on a random loopback port and displays it in an Electron window. It does not fork, patch, inject into, or reimplement the Harness UI.

### Download

- [Download for Mac (Apple Silicon DMG)](https://github.com/steven-kid/deepseek-harness-desktop/releases/latest/download/DeepSeek-Harness-Desktop-0.1.2-arm64.dmg)
- [View all releases](https://github.com/steven-kid/deepseek-harness-desktop/releases/latest)

### Install on macOS

The release is integrity-signed but is not Apple-notarized. Follow these steps the first time you open it:

1. Open the downloaded DMG and drag **DeepSeek Harness** into **Applications**.
2. Open **DeepSeek Harness**. If macOS blocks it, click **Done**.
3. Open **System Settings → Privacy & Security**.
4. Scroll to **Security**, find the message about **DeepSeek Harness**, and click **Open Anyway**.
5. Confirm by clicking **Open** once more.

You normally only need to complete the Privacy & Security confirmation once.

### How it works

1. Electron starts the packaged `@deepseek-ai/dsh` CLI with `--profile web --host 127.0.0.1 --port 0`.
2. It waits for the official `dsh web:` readiness line.
3. It loads the local page in a sandboxed Electron window.
4. Closing the application stops the local service.

All DeepSeek Harness data, settings, models, sessions, and plugin capabilities remain provided by the official upstream package.

### Upstream version

The current release pins `@deepseek-ai/dsh` to `0.1.0-rc.6` for reproducible packaging.

### Disclaimer

This is an unofficial community wrapper and is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related names belong to their respective owners.

### License

The desktop wrapper is available under the [MIT License](LICENSE). The bundled DeepSeek Harness package is also MIT-licensed; its notice is preserved in [`third-party-licenses/deepseek-harness-LICENSE`](third-party-licenses/deepseek-harness-LICENSE).

The application icon uses the black whale artwork from the upstream DeepSeek Harness Web favicon.
