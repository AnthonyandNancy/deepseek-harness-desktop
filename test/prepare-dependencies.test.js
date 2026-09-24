import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { patchWindowsPathOpener, prepareApiProxy } from '../scripts/prepare-dependencies.mjs'

// Upstream 0.1.7 replaced the PowerShell `Invoke-Item` call with
// `explorer.exe <file-uri>`; Explorer is GUI-subsystem, so the console flash
// this patch existed to prevent is gone.
const EXPLORER_OPENER = `async function openWindowsPath(path, signal, run) {
\tawait runExplorer([explorerTarget(path)], signal, run);
}
/** Translate a WSL path before handing it to the Windows desktop. */`

test('prepare is a no-op when upstream opens paths through Explorer', () => {
  const source = `before\n${EXPLORER_OPENER}\nafter`
  const patched = patchWindowsPathOpener(source)
  assert.equal(patched, source, 'source was rewritten on an explorer.exe build')
  assert.equal(patchWindowsPathOpener(patched), patched, 'the patch is not idempotent')
})

test('prepare fails loudly when the upstream opener is unknown', () => {
  assert.throws(
    () => patchWindowsPathOpener('async function openWindowsPath() {}'),
    /Could not find the DeepSeek Harness Windows path opener/,
  )
})

test('the installed DSH native command package needs no patch at 0.1.7', () => {
  const target = new URL('../node_modules/@deepseek-ai/dsh-native-command/lib/index.js', import.meta.url)
  const source = readFileSync(target, 'utf8')
  try {
    prepareApiProxy()
    assert.equal(readFileSync(target, 'utf8'), source, 'the installed file was rewritten')
  } finally {
    writeFileSync(target, source)
  }
})
