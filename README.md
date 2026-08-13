# DeepSeek Harness Desktop

An unofficial, minimal desktop wrapper for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The application starts the official `@deepseek-ai/dsh` Web profile on a random loopback port and displays it in an Electron window. It does not fork, patch, inject into, or reimplement the Harness UI.

## Download

Download the latest macOS Apple Silicon build from [GitHub Releases](https://github.com/steven-kid/deepseek-harness-desktop/releases/latest).

The release is currently unsigned. On first launch, macOS may require you to right-click the app, choose **Open**, and confirm.

## Development

Requirements:

- Node.js 24 or newer
- npm

```bash
npm install
npm start
```

Run tests and create a local package:

```bash
npm test
npm run dist:mac
```

## How it works

1. Electron starts the packaged `@deepseek-ai/dsh` CLI with `--profile web --host 127.0.0.1 --port 0`.
2. It waits for the official `dsh web:` readiness line.
3. It loads that loopback URL in a sandboxed Electron window.
4. Closing the application stops the child service.

All DeepSeek Harness data, settings, providers, sessions, plugins, and model behavior remain owned by the upstream package.

## Upstream version

This release pins `@deepseek-ai/dsh` to `0.1.0-rc.6` for reproducible packaging.

## Disclaimer

This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related names are trademarks of their respective owners.

## License

The desktop wrapper is available under the [MIT License](LICENSE). The bundled DeepSeek Harness package is also MIT-licensed; its notice is preserved in [`third-party-licenses/deepseek-harness-LICENSE`](third-party-licenses/deepseek-harness-LICENSE).

The application icon reuses the black whale artwork from the upstream DeepSeek Harness Web favicon.
