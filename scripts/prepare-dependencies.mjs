import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nativeCommandPath = path.join(
  root,
  'node_modules',
  '@deepseek-ai',
  'dsh-native-command',
  'lib',
  'index.js',
)
const windowsNodePath = path.join(root, 'assets', 'dsh-node.exe')
const nodeLicensePath = path.join(root, 'third-party-licenses', 'nodejs-LICENSE')

/**
 * Upstream 0.1.7 turned `openWindowsPath` into an `explorer.exe <file-uri>`
 * invocation, which removes the console flash the PowerShell encoding patch
 * existed to prevent. This project pins exactly one Harness release line, so the
 * old PowerShell branch is not carried: Explorer means no work, anything else
 * fails loudly for a human to review against the new release.
 */
const EXPLORER_WINDOWS_OPENER = /runExplorer\(\[explorerTarget\(path\)\]/

export function patchWindowsPathOpener(source) {
  if (EXPLORER_WINDOWS_OPENER.test(source)) return source
  throw new Error(
    'Could not find the DeepSeek Harness Windows path opener; review '
    + 'scripts/prepare-dependencies.mjs against the new upstream release before packaging.',
  )
}

export function prepareApiProxy(target = nativeCommandPath) {
  const source = readFileSync(target, 'utf8')
  const patched = patchWindowsPathOpener(source)
  if (patched !== source) writeFileSync(target, patched)
}

export function findNodeLicense(executablePath = process.execPath) {
  const executableDirectory = path.dirname(executablePath)
  const candidates = [
    path.join(executableDirectory, 'LICENSE'),
    path.join(executableDirectory, 'LICENSE.md'),
    path.join(executableDirectory, '..', 'LICENSE'),
  ]
  return candidates.find(existsSync)
}

export function prepareWindowsNode({
  platform = process.platform,
  executablePath = process.execPath,
  outputPath = windowsNodePath,
  licenseOutputPath = nodeLicensePath,
} = {}) {
  if (platform !== 'win32') return
  const licensePath = findNodeLicense(executablePath)
  if (!licensePath) {
    throw new Error(`Could not find the Node.js license next to ${executablePath}`)
  }

  mkdirSync(path.dirname(outputPath), { recursive: true })
  mkdirSync(path.dirname(licenseOutputPath), { recursive: true })
  copyFileSync(executablePath, outputPath)
  copyFileSync(licensePath, licenseOutputPath)
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  prepareApiProxy()
  prepareWindowsNode()
}
