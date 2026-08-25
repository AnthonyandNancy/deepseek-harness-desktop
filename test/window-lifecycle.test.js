import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createTrayMenuTemplate, shouldHideWindowOnClose } from '../src/window-lifecycle.js'

test('window close hides the app unless it is quitting', () => {
  assert.equal(shouldHideWindowOnClose(false), true)
  assert.equal(shouldHideWindowOnClose(true), false)
  assert.equal(shouldHideWindowOnClose(false, false), false)
})

test('tray menu exposes show, hide, and quit actions', () => {
  const actions = []
  const menu = createTrayMenuTemplate({
    locale: 'zh-CN',
    platform: 'darwin',
    showWindow: () => actions.push('show'),
    hideWindow: () => actions.push('hide'),
    quit: () => actions.push('quit'),
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    '打开 DeepSeek Harness',
    '隐藏窗口',
    'separator',
    '退出',
  ])

  menu[0].click()
  menu[1].click()
  menu[3].click()
  assert.deepEqual(actions, ['show', 'hide', 'quit'])
})

test('tray menu adds a restart action on Windows only', () => {
  const actions = []
  const menu = createTrayMenuTemplate({
    locale: 'zh-CN',
    platform: 'win32',
    showWindow: () => actions.push('show'),
    hideWindow: () => actions.push('hide'),
    restart: () => actions.push('restart'),
    quit: () => actions.push('quit'),
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    '打开 DeepSeek Harness',
    '隐藏窗口',
    'separator',
    '重启应用',
    '退出',
  ])

  menu[3].click()
  menu[4].click()
  assert.deepEqual(actions, ['restart', 'quit'])

  for (const platform of ['darwin', 'linux']) {
    const other = createTrayMenuTemplate({
      platform,
      showWindow() {},
      hideWindow() {},
      restart() {},
      quit() {},
    })
    assert.equal(other.some(({ label }) => label === 'Restart App'), false)
  }
})

test('tray menu falls back to English labels', () => {
  const menu = createTrayMenuTemplate({
    locale: 'en-US',
    platform: 'win32',
    showWindow() {},
    hideWindow() {},
    restart() {},
    quit() {},
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    'Open DeepSeek Harness',
    'Hide Window',
    'separator',
    'Restart App',
    'Quit',
  ])
})

test('startup screen contains only the logo and loading indicator', async () => {
  const html = await readFile(new URL('../src/startup.html', import.meta.url), 'utf8')

  assert.match(html, /trayTemplate@2x\.png/)
  assert.match(html, /class="progress"/)
  assert.doesNotMatch(html, /<h1|<p/)
})
