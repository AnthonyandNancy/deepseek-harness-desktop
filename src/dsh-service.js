import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)\b/m

/** Measured teardown of the dsh tree takes milliseconds; this leaves ample headroom. */
export const TERMINATION_GRACE_MS = 3_000

// A JS/native version gap inside the packaged node_modules means the install
// mixes two app builds. In-place upgrades cannot overwrite the native binaries
// of a running app, so the installer silently skips them and the mismatch only
// shows up on the next boot. Surface a fix instead of the raw loader stack.
export function nativeMismatchGuidance(output) {
  if (!/(Mismatched native Koffi modules|Could not load the sharp module)/.test(output)) return ''
  return [
    'This install mixes native modules from two app versions, usually because an',
    'upgrade ran while the app was still open. Quit the app from the tray,',
    'uninstall it, then install the latest release again.',
  ].join(' ')
}

function describeStartupFailure(reason, output) {
  const guidance = nativeMismatchGuidance(output)
  return `${reason}\n${guidance ? `${guidance}\n\n` : ''}${output}`
}

export function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

// On POSIX the service leads its own process group, so a negative pid signals
// every descendant. Windows has no equivalent: the hidden-console launcher owns
// a KILL_ON_JOB_CLOSE job object, so terminating the launcher reaps the tree.
export function signalProcessTree(child, signal, {
  platform = process.platform,
  kill = process.kill,
} = {}) {
  if (hasExited(child)) return false
  try {
    if (platform === 'win32') child.kill(signal)
    else kill(-child.pid, signal)
    return true
  } catch {
    return false
  }
}

function settlesWithin(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    void promise.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

// Escalates SIGTERM to SIGKILL but always resolves: a shutdown path that can
// hang is worse than one that leaks a warning.
export async function stopProcessTree({
  child,
  platform = process.platform,
  graceMs = TERMINATION_GRACE_MS,
  kill = process.kill,
  warn = console.warn,
}) {
  if (hasExited(child)) return true

  const exited = new Promise((resolve) => child.once('exit', resolve))

  signalProcessTree(child, 'SIGTERM', { platform, kill })
  if (await settlesWithin(exited, graceMs)) return true

  signalProcessTree(child, 'SIGKILL', { platform, kill })
  if (await settlesWithin(exited, graceMs)) return true

  warn(`DeepSeek Harness did not terminate within ${graceMs * 2}ms; continuing shutdown.`)
  return false
}

export function resolveDshEntry() {
  return unpackedPath(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js')))
}

export function unpackedPath(path) {
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
}

export function extractReadyUrl(output) {
  return READY_PATTERN.exec(output)?.[1]
}

export function resolveWindowsPickerPatch() {
  return fileURLToPath(new URL('../config/windows-directory-picker.patch.yml', import.meta.url))
}

export function resolveWindowsHiddenConsoleLauncher() {
  return fileURLToPath(new URL('../assets/windows-hidden-console.exe', import.meta.url))
}

export function resolveWindowsNodeExecutable() {
  return fileURLToPath(new URL('../assets/dsh-node.exe', import.meta.url))
}

export function buildDshArgs(entry, {
  platform = process.platform,
  windowsPickerPatch = resolveWindowsPickerPatch(),
} = {}) {
  // --patch is a launcher flag, --no-open is a web-app flag. The launcher
  // passes everything through after the first flag it does not recognize, so
  // --patch must come first or the web app would reject it as unknown.
  return [
    '--expose-internals',
    entry,
    '--profile',
    'web',
    ...(platform === 'win32' ? ['--patch', windowsPickerPatch] : []),
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ]
}

export function buildDshCommand({
  electronExecutable,
  entry = resolveDshEntry(),
  platform = process.platform,
  windowsLauncher = resolveWindowsHiddenConsoleLauncher(),
  windowsNodeExecutable = resolveWindowsNodeExecutable(),
} = {}) {
  if (!electronExecutable) {
    throw new Error('electronExecutable is required')
  }

  const args = buildDshArgs(entry, { platform })
  return platform === 'win32'
    ? { command: windowsLauncher, args: [windowsNodeExecutable, ...args] }
    : { command: electronExecutable, args }
}

export function startDshService({
  electronExecutable,
  entry = resolveDshEntry(),
  environment = process.env,
  platform = process.platform,
  timeoutMs = 60_000,
  windowsLauncher = resolveWindowsHiddenConsoleLauncher(),
  windowsNodeExecutable = resolveWindowsNodeExecutable(),
} = {}) {
  const { command, args } = buildDshCommand({
    electronExecutable,
    entry,
    platform,
    windowsLauncher,
    windowsNodeExecutable,
  })

  const child = spawn(command, args, {
    env: {
      ...environment,
      ...(platform === 'win32' ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Leads its own process group so shutdown can signal the whole tree. On
    // Windows this would detach the process from the launcher's job object,
    // which is what reaps the tree there.
    detached: platform !== 'win32',
  })

  let output = ''
  let settled = false

  const ready = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }

    const inspect = (chunk) => {
      output += chunk.toString()
      const url = extractReadyUrl(output)
      if (url) finish(resolve, url)
    }

    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => finish(reject, error))
    child.once('exit', (code, signal) => {
      finish(
        reject,
        new Error(describeStartupFailure(
          `DeepSeek Harness stopped before it was ready (code ${String(code)}, signal ${String(signal)}).`,
          output,
        )),
      )
    })

    const timeout = setTimeout(() => {
      signalProcessTree(child, 'SIGTERM', { platform })
      finish(
        reject,
        new Error(describeStartupFailure(
          `DeepSeek Harness did not become ready within ${timeoutMs}ms.`,
          output,
        )),
      )
    }, timeoutMs)
  })

  let stopping
  const stop = () => {
    stopping ??= stopProcessTree({ child, platform })
    return stopping
  }

  return { child, ready, stop }
}

export function dshEntryUrl() {
  return pathToFileURL(resolveDshEntry()).href
}
