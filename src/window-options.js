export function createWindowOptions(platform = process.platform) {
  return {
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DeepSeek Harness',
    backgroundColor: '#f5f7fb',
    titleBarStyle: 'default',
    autoHideMenuBar: platform === 'win32',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}
