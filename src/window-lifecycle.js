export function shouldHideWindowOnClose(isQuitting, hasTray = true) {
  return !isQuitting && hasTray
}

export function createTrayMenuTemplate({
  locale = 'en',
  platform = process.platform,
  showWindow,
  hideWindow,
  restart,
  quit,
}) {
  const isChinese = locale.toLowerCase().startsWith('zh')

  return [
    {
      label: isChinese ? '打开 DeepSeek Harness' : 'Open DeepSeek Harness',
      click: showWindow,
    },
    {
      label: isChinese ? '隐藏窗口' : 'Hide Window',
      click: hideWindow,
    },
    { type: 'separator' },
    ...(platform === 'win32'
      ? [{
        label: isChinese ? '重启应用' : 'Restart App',
        click: restart,
      }]
      : []),
    {
      label: isChinese ? '退出' : 'Quit',
      click: quit,
    },
  ]
}
