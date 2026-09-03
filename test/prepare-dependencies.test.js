import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import {
  encodeWindowsOpenCommand,
  patchWindowsPathOpener,
  prepareApiProxy,
} from '../scripts/prepare-dependencies.mjs'

const ORIGINAL = `async function openWindowsPath(path, signal, run) {
\tawait run("powershell.exe", [
\t\t"-NoProfile",
\t\t"-Command",
\t\t\`Invoke-Item -LiteralPath \${powershellLiteral(path)}\`
\t], signal);
}`

test('default dependency patch targets the DSH native command package', () => {
  const target = new URL('../node_modules/@deepseek-ai/dsh-native-command/lib/index.js', import.meta.url)
  const source = readFileSync(target, 'utf8')
  try {
    prepareApiProxy()
    assert.match(readFileSync(target, 'utf8'), /Buffer\.from\(command, "utf16le"\)/)
  } finally {
    writeFileSync(target, source)
  }
})

test('Windows path opener uses a UTF-16LE encoded PowerShell command', () => {
  const encoded = encodeWindowsOpenCommand("C:\\项目\\Steven's file.txt")
  assert.equal(
    Buffer.from(encoded, 'base64').toString('utf16le'),
    "Invoke-Item -LiteralPath 'C:\\项目\\Steven''s file.txt'",
  )
})

test('dependency patch replaces exactly the pinned Windows path opener', () => {
  const patched = patchWindowsPathOpener(`before\n${ORIGINAL}\nafter`)
  assert.match(patched, /Buffer\.from\(command, "utf16le"\)/)
  assert.match(patched, /"-EncodedCommand"/)
  assert.doesNotMatch(patched, /"-Command",/)
  assert.equal(patchWindowsPathOpener(patched), patched)
})

test('dependency patch fails loudly when upstream implementation drifts', () => {
  assert.throws(
    () => patchWindowsPathOpener('async function openWindowsPath() {}'),
    /Expected exactly one/,
  )
})
