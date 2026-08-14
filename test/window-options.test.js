import assert from 'node:assert/strict'
import test from 'node:test'
import { createWindowOptions } from '../src/window-options.js'

test('macOS retains the native draggable title bar', () => {
  assert.equal(createWindowOptions('darwin').titleBarStyle, 'default')
})

test('Windows keeps the menu bar hidden', () => {
  assert.equal(createWindowOptions('win32').autoHideMenuBar, true)
})
