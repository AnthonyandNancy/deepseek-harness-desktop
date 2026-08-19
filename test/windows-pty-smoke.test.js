import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WINDOWS_PTY_NATIVE_MODULES,
  assertPtyRoundTripOutput,
  buildWindowsPtyNativeModuleScript,
  buildWindowsPtyRoundTripScript,
  createPtySmokeToken,
} from '../scripts/windows-pty-smoke.mjs'

test('smoke tokens are unique and identifiable', () => {
  const first = createPtySmokeToken()
  const second = createPtySmokeToken()
  assert.match(first, /^DSH_DESKTOP_PTY_SMOKE_[0-9A-F]{16}$/)
  assert.notEqual(first, second)
})

test('Windows expects only the ConPTY native modules node-pty 1.2 ships', () => {
  assert.deepEqual(WINDOWS_PTY_NATIVE_MODULES, ['conpty', 'conpty_console_list'])
  assert.ok(!WINDOWS_PTY_NATIVE_MODULES.includes('pty'), 'winpty was removed in node-pty 1.2')
})

test('the round-trip script writes the token into the PTY and reads it back', () => {
  const token = 'DSH_DESKTOP_PTY_SMOKE_TEST'
  const script = buildWindowsPtyRoundTripScript({ nodePtyPath: 'C:/app/node_modules/node-pty', token })
  assert.match(script, /pty\.spawn\('powershell\.exe'/)
  assert.match(script, /terminal\.write\(/)
  assert.match(script, /terminal\.onData\(/)
  assert.match(script, /terminal\.kill\(\)/)
  assert.match(script, /terminal\.onExit\(/)
  assert.match(script, /PTY_ROUND_TRIP_OK/)
  assert.ok(script.includes(JSON.stringify('C:/app/node_modules/node-pty')))
  assert.ok(script.includes(JSON.stringify(token)))
})

test('the round-trip requires the shell to echo the token, not just the command line', () => {
  const script = buildWindowsPtyRoundTripScript({ nodePtyPath: 'node-pty', token: 'T' })
  assert.match(script, /split\(token\)\.length - 1 < 2/)
})

test('the native module script loads each expected module', () => {
  const script = buildWindowsPtyNativeModuleScript({ nodePtyUtilsPath: 'C:/app/lib/utils.js' })
  assert.match(script, /loadNativeModule/)
  assert.match(script, /NODE_PTY_NATIVE_OK/)
  assert.ok(script.includes(JSON.stringify(WINDOWS_PTY_NATIVE_MODULES)))
})

test('a missing token or non-zero exit fails the round trip', () => {
  const token = 'DSH_DESKTOP_PTY_SMOKE_TEST'
  assert.doesNotThrow(() => assertPtyRoundTripOutput({
    status: 0,
    output: `PTY_ROUND_TRIP_OK pid=1 token=${token}`,
    token,
    context: 'Windows',
  }))
  assert.throws(
    () => assertPtyRoundTripOutput({ status: 1, output: 'PTY_ROUND_TRIP_FAIL timeout', token, context: 'Windows' }),
    /Windows PTY round trip failed/,
  )
  assert.throws(
    () => assertPtyRoundTripOutput({ status: 0, output: 'PTY_ROUND_TRIP_OK token=OTHER', token, context: 'Packaged Windows' }),
    /Packaged Windows PTY round trip failed/,
  )
})
