import { randomBytes } from 'node:crypto'

/**
 * Native modules node-pty ships for Windows. Since node-pty 1.2 the winpty
 * backend (`pty.node`) is gone and ConPTY is the only Windows backend, so
 * asserting `pty.node` would fail on a healthy install.
 */
export const WINDOWS_PTY_NATIVE_MODULES = ['conpty', 'conpty_console_list']

export function createPtySmokeToken() {
  return `DSH_DESKTOP_PTY_SMOKE_${randomBytes(8).toString('hex').toUpperCase()}`
}

/**
 * Build the script that proves a Windows PTY is genuinely interactive: it
 * spawns PowerShell through ConPTY, writes a unique token into the pseudo
 * terminal, reads that token back from the PTY output stream, then terminates
 * the shell and waits for its exit.
 */
export function buildWindowsPtyRoundTripScript({
  nodePtyPath,
  token,
  timeoutMs = 45_000,
}) {
  return `
const pty = require(${JSON.stringify(nodePtyPath)})
const token = ${JSON.stringify(token)}
const terminal = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile'], {
  name: 'xterm-256color',
  cols: 120,
  rows: 30,
  cwd: process.cwd(),
  env: process.env,
})

let output = ''
let echoed = false

const fail = (message) => {
  clearTimeout(timeout)
  clearInterval(writer)
  process.stdout.write('PTY_ROUND_TRIP_FAIL ' + message + ' output=' + JSON.stringify(output.slice(-600)))
  try { terminal.kill() } catch {}
  process.exit(1)
}

const timeout = setTimeout(() => fail('token was never echoed back within ${timeoutMs}ms'), ${timeoutMs})

// The shell may still be initialising when the first write lands, so keep
// offering the command until the PTY echoes the token back.
const writer = setInterval(() => {
  terminal.write('Write-Output "' + token + '"\\r')
}, 1500)

terminal.onData((chunk) => {
  output += chunk
  // The echoed command line also contains the token, so require a second
  // occurrence: that one is the shell's own output.
  if (echoed || output.split(token).length - 1 < 2) return
  echoed = true
  clearTimeout(timeout)
  clearInterval(writer)
  // Terminating here proves the round trip completed and that the shell exits.
  terminal.kill()
})

terminal.onExit(({ exitCode }) => {
  if (!echoed) fail('shell exited before echoing the token (code ' + String(exitCode) + ')')
  process.stdout.write('PTY_ROUND_TRIP_OK pid=' + terminal.pid + ' token=' + token + ' exitCode=' + String(exitCode))
  process.exit(0)
})
`
}

export function buildWindowsPtyNativeModuleScript({ nodePtyUtilsPath, modules = WINDOWS_PTY_NATIVE_MODULES }) {
  return `
const { loadNativeModule } = require(${JSON.stringify(nodePtyUtilsPath)})
const loaded = ${JSON.stringify(modules)}.map((name) => name + '=' + loadNativeModule(name).dir)
process.stdout.write('NODE_PTY_NATIVE_OK ' + loaded.join(','))
`
}

export function assertPtyRoundTripOutput({ status, output, token, context }) {
  if (status !== 0 || !output.includes('PTY_ROUND_TRIP_OK') || !output.includes(token)) {
    throw new Error(`${context} PTY round trip failed (status ${String(status)}): ${output}`)
  }
}
