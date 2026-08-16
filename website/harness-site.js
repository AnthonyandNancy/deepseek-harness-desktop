const translations = {
  zh: {
    features: "桌面能力",
    downloads: "下载",
    officialDocs: "官方文档",
    preview: "非官方社区桌面版",
    headlinePrimary: "让 Harness",
    headlineAccent: "桌面即用",
    description:
      "将官方 DeepSeek Harness 完整封装为原生桌面体验。无需命令行，无需管理端口，打开应用即可开始工作。",
    downloadMac: "下载 macOS 版",
    downloadWindows: "下载 Windows 版",
    downloadLinux: "下载 Linux 版",
    allDownloads: "全部下载",
    quark: "夸克网盘",
    availableFor: "支持平台",
    running: "Local · Running",
    desktopExperience: "完整 Harness 能力，原生桌面体验",
    desktopEdition: "Desktop Edition",
    featureTitle: "少一点配置，多一点专注",
    featureDescription:
      "保留官方 Harness 的能力与界面，只补齐桌面端需要的启动、窗口和系统集成。",
    featureOneTitle: "打开即用",
    featureOneDescription:
      "自动启动 Harness 服务、选择可用端口并加载 Web UI，不再记忆命令或维护终端进程。",
    openApp: "打开应用",
    featureTwoTitle: "本地优先",
    featureTwoDescription: "Harness 在本机运行，工作目录和会话保持在你的设备上。",
    featureThreeTitle: "跨平台",
    featureThreeDescription:
      "同时提供 macOS、Windows 和 Linux 安装包，覆盖 Apple Silicon 与 Intel Mac。",
    startNow: "Get Started",
    mirrorTitle: "选择适合你的版本",
    downloadDescription: "当前版本 v0.3.5，可从 GitHub Releases 或夸克网盘下载。",
    otherChannels: "其他下载渠道",
    mirrorDescription: "历史版本、压缩包与国内镜像",
    community: "非官方社区项目",
    powered: "Powered by",
  },
  en: {
    features: "Desktop",
    downloads: "Downloads",
    officialDocs: "Official Docs",
    preview: "Unofficial community desktop edition",
    headlinePrimary: "Harness,",
    headlineAccent: "ready on desktop",
    description:
      "The complete DeepSeek Harness experience, packaged as a native desktop app. No terminal or port management—open the app and start working.",
    downloadMac: "Download for macOS",
    downloadWindows: "Download for Windows",
    downloadLinux: "Download for Linux",
    allDownloads: "All downloads",
    quark: "Quark Drive",
    availableFor: "Available for",
    running: "Local · Running",
    desktopExperience: "Full Harness capabilities, native desktop experience",
    desktopEdition: "Desktop Edition",
    featureTitle: "Less setup. More focus.",
    featureDescription:
      "The official Harness capabilities and UI remain intact. The desktop app only adds startup, window, and system integration.",
    featureOneTitle: "Open and go",
    featureOneDescription:
      "Starts Harness, selects an available port, and loads the Web UI automatically—no commands or terminal processes to manage.",
    openApp: "Open the app",
    featureTwoTitle: "Local first",
    featureTwoDescription:
      "Harness runs locally, keeping your working directories and sessions on your device.",
    featureThreeTitle: "Cross-platform",
    featureThreeDescription:
      "Installers for macOS, Windows, and Linux, including both Apple Silicon and Intel Mac.",
    startNow: "Get Started",
    mirrorTitle: "Choose your platform",
    downloadDescription:
      "Version v0.3.5 is available from GitHub Releases and Quark Drive.",
    otherChannels: "Other download channels",
    mirrorDescription: "Previous versions, archives, and China mirror",
    community: "Unofficial community project",
    powered: "Powered by",
  },
};

const platformConfig = {
  mac: {
    labelKey: "downloadMac",
    href: "https://github.com/steven-kid/deepseek-harness-desktop/releases/latest",
    iconPath:
      "M17.05 12.54c-.02-2.27 1.86-3.37 1.95-3.42a4.2 4.2 0 0 0-3.31-1.79c-1.39-.15-2.74.83-3.45.83-.72 0-1.81-.82-2.98-.8a4.38 4.38 0 0 0-3.69 2.25c-1.6 2.77-.41 6.84 1.12 9.08.76 1.09 1.64 2.31 2.81 2.27 1.14-.05 1.57-.73 2.95-.73 1.36 0 1.77.73 2.96.7 1.23-.02 2-1.1 2.73-2.2a9.08 9.08 0 0 0 1.25-2.55 3.93 3.93 0 0 1-2.34-3.64ZM14.78 5.85a4 4 0 0 0 .92-2.86 4.1 4.1 0 0 0-2.66 1.36 3.8 3.8 0 0 0-.95 2.75 3.39 3.39 0 0 0 2.69-1.25Z",
  },
  windows: {
    labelKey: "downloadWindows",
    href: "https://github.com/steven-kid/deepseek-harness-desktop/releases/download/v0.3.5/DeepSeek-Harness-Desktop-0.3.5-windows-x64.exe",
    iconPath:
      "M2 4.2 10.5 3v8.15H2V4.2Zm9.5-1.34L22 1.35v9.8H11.5V2.86ZM2 12.15h8.5V20.3L2 19.1v-6.95Zm9.5 0H22v9.8l-10.5-1.51v-8.29Z",
  },
  linux: {
    labelKey: "downloadLinux",
    href: "https://github.com/steven-kid/deepseek-harness-desktop/releases/download/v0.3.5/DeepSeek-Harness-Desktop-0.3.5-linux-x86_64.AppImage",
    iconPath:
      "M12.1 2.1c-2.5 0-3.7 2-3.7 4.6v1.5c-1.8 1.2-3.1 3.7-3.1 6.4 0 3.9 2.8 7.2 6.7 7.2s6.7-3.3 6.7-7.2c0-2.7-1.3-5.2-3.1-6.4V6.7c0-2.6-1.1-4.6-3.5-4.6Zm-1.7 4.7c0-1.8.5-2.8 1.7-2.8 1.1 0 1.6 1 1.6 2.8v.5a7.1 7.1 0 0 0-3.3 0v-.5Zm-1.8 7.4c.6 0 1.1.5 1.1 1.1 0 .6-.5 1.1-1.1 1.1-.6 0-1.1-.5-1.1-1.1 0-.6.5-1.1 1.1-1.1Zm6.8 0c.6 0 1.1.5 1.1 1.1 0 .6-.5 1.1-1.1 1.1-.6 0-1.1-.5-1.1-1.1 0-.6.5-1.1 1.1-1.1Zm-6.3 4c1.8.9 4 .9 5.8 0-.6 1.1-1.7 1.8-2.9 1.8s-2.3-.7-2.9-1.8Z",
  },
};

let activeLanguage = window.localStorage.getItem("language") || "zh";

function detectPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const normalized = platform.toLowerCase();

  if (normalized.includes("win")) {
    return "windows";
  }

  if (normalized.includes("linux")) {
    return "linux";
  }

  return "mac";
}

function updatePrimaryDownload() {
  const platform = platformConfig[detectPlatform()];
  const primaryDownload = document.querySelector("#primary-download");
  const primaryLabel = document.querySelector("#primary-download-label");
  const platformIconPath = document.querySelector("#platform-icon-path");

  primaryDownload.href = platform.href;
  primaryLabel.textContent = translations[activeLanguage][platform.labelKey];
  platformIconPath.setAttribute("d", platform.iconPath);
}

function applyLanguage(language) {
  activeLanguage = translations[language] ? language : "zh";
  document.documentElement.lang = activeLanguage === "zh" ? "zh-CN" : "en";
  window.localStorage.setItem("language", activeLanguage);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    const value = translations[activeLanguage][key];

    if (value) {
      element.textContent = value;
    }
  });

  document.querySelectorAll(".language-button").forEach((button) => {
    const isActive = button.dataset.language === activeLanguage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  updatePrimaryDownload();
}

document.querySelectorAll(".language-button").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.language));
});

applyLanguage(activeLanguage);
