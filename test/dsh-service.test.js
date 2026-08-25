import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import {
  buildDshCommand,
  buildDshArgs,
  extractReadyUrl,
  hasExited,
  resolveDshEntry,
  resolveWindowsHiddenConsoleLauncher,
  resolveWindowsNodeExecutable,
  resolveWindowsPickerPatch,
  signalProcessTree,
  stopProcessTree,
  unpackedPath,
} from '../src/dsh-service.js'

function createFakeChild({ pid = 4321, exitOn } = {}) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.signals = []
  child.kill = (signal) => {
    child.signals.push({ target: pid, signal })
    child.emit('signalled', signal)
    return true
  }
  child.settle = (signal) => {
    child.signalCode = signal
    child.emit('exit', null, signal)
  }
  if (exitOn) {
    child.on('signalled', (signal) => {
      if (signal === exitOn) setImmediate(() => child.settle(signal))
    })
  }
  return child
}

function groupKillInto(child) {
  return (target, signal) => {
    child.signals.push({ target, signal })
    child.emit('signalled', signal)
  }
}

test('extractReadyUrl reads the canonical loopback readiness URL', () => {
  assert.equal(
    extractReadyUrl('booting\ndsh web: http://127.0.0.1:60882\n'),
    'http://127.0.0.1:60882',
  )
})

test('extractReadyUrl ignores non-loopback output', () => {
  assert.equal(extractReadyUrl('dsh web: http://192.168.1.10:3080'), undefined)
})

test('resolveDshEntry finds the pinned CLI package', () => {
  assert.equal(
    resolveDshEntry().endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')),
    true,
  )
})

test('unpackedPath maps packaged dependencies to Electron unpacked resources', () => {
  assert.equal(
    unpackedPath('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
  )
  assert.equal(unpackedPath('/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js'), '/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js')
})

test('buildDshArgs includes the runtime flag required by upstream HMR', () => {
  assert.deepEqual(buildDshArgs('/app/dsh.js', { platform: 'darwin' }), [
    '--expose-internals',
    '/app/dsh.js',
    '--profile',
    'web',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ])
})

test('buildDshArgs pins the browse directory picker on Windows', () => {
  assert.deepEqual(buildDshArgs('C:\\app\\dsh.js', {
    platform: 'win32',
    windowsPickerPatch: 'C:\\app\\windows-picker.yml',
  }), [
    '--expose-internals',
    'C:\\app\\dsh.js',
    '--profile',
    'web',
    '--no-open',
    '--patch',
    'C:\\app\\windows-picker.yml',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ])
  assert.equal(resolveWindowsPickerPatch().endsWith('windows-directory-picker.patch.yml'), true)
})

test('buildDshCommand uses the hidden-console launcher on Windows', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: 'C:\\app\\DeepSeek Harness.exe',
    entry: 'C:\\app\\dsh.js',
    platform: 'win32',
    windowsLauncher: 'C:\\app\\windows-hidden-console.exe',
    windowsNodeExecutable: 'C:\\app\\dsh-node.exe',
  }), {
    command: 'C:\\app\\windows-hidden-console.exe',
    args: [
      'C:\\app\\dsh-node.exe',
      '--expose-internals',
      'C:\\app\\dsh.js',
      '--profile',
      'web',
      '--no-open',
      '--patch',
      resolveWindowsPickerPatch(),
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
  })
})

test('buildDshCommand starts Electron directly on other platforms', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: '/app/electron',
    entry: '/app/dsh.js',
    platform: 'linux',
  }), {
    command: '/app/electron',
    args: [
      '--expose-internals',
      '/app/dsh.js',
      '--profile',
      'web',
      '--no-open',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
  })
})

test('resolveWindowsHiddenConsoleLauncher points to the packaged launcher', () => {
  assert.equal(
    resolveWindowsHiddenConsoleLauncher().endsWith(path.join('assets', 'windows-hidden-console.exe')),
    true,
  )
})

test('resolveWindowsNodeExecutable points to the packaged console-subsystem Node runtime', () => {
  assert.equal(
    resolveWindowsNodeExecutable().endsWith(path.join('assets', 'dsh-node.exe')),
    true,
  )
})

test('signalProcessTree signals the process group on POSIX', () => {
  const child = createFakeChild()
  assert.equal(
    signalProcessTree(child, 'SIGTERM', { platform: 'linux', kill: groupKillInto(child) }),
    true,
  )
  assert.deepEqual(child.signals, [{ target: -4321, signal: 'SIGTERM' }])
})

test('signalProcessTree signals the launcher directly on Windows', () => {
  const child = createFakeChild()
  assert.equal(signalProcessTree(child, 'SIGTERM', { platform: 'win32' }), true)
  assert.deepEqual(child.signals, [{ target: 4321, signal: 'SIGTERM' }])
})

test('signalProcessTree ignores an already exited service', () => {
  const child = createFakeChild()
  child.exitCode = 0
  assert.equal(hasExited(child), true)
  assert.equal(signalProcessTree(child, 'SIGTERM', { platform: 'win32' }), false)
  assert.deepEqual(child.signals, [])
})

test('stopProcessTree resolves once the service exits on SIGTERM', async () => {
  const child = createFakeChild({ exitOn: 'SIGTERM' })
  assert.equal(await stopProcessTree({ child, platform: 'win32', graceMs: 1_000 }), true)
  assert.deepEqual(child.signals, [{ target: 4321, signal: 'SIGTERM' }])
})

test('stopProcessTree escalates to SIGKILL when SIGTERM is ignored', async () => {
  const child = createFakeChild({ exitOn: 'SIGKILL' })
  assert.equal(
    await stopProcessTree({
      child,
      platform: 'linux',
      graceMs: 50,
      kill: groupKillInto(child),
    }),
    true,
  )
  assert.deepEqual(child.signals, [
    { target: -4321, signal: 'SIGTERM' },
    { target: -4321, signal: 'SIGKILL' },
  ])
})

test('stopProcessTree warns but never hangs when the tree survives', async () => {
  const child = createFakeChild()
  const warnings = []
  assert.equal(
    await stopProcessTree({
      child,
      platform: 'win32',
      graceMs: 20,
      warn: (message) => warnings.push(message),
    }),
    false,
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /did not terminate within 40ms/)
})

test('stopProcessTree is a no-op for an already exited service', async () => {
  const child = createFakeChild()
  child.exitCode = 0
  assert.equal(await stopProcessTree({ child, platform: 'win32', graceMs: 20 }), true)
  assert.deepEqual(child.signals, [])
})
