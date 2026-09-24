import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { collectPinViolations } from '../scripts/verify-dependency-closure.mjs'

// `new URL(...).pathname` yields `/D:/...` on Windows, which path.join then
// treats as a relative segment; resolve through fileURLToPath instead.
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const upstream = JSON.parse(readFileSync(new URL('../config/dsh-upstream.json', import.meta.url), 'utf8'))

test('every installed DeepSeek Harness package matches the pinned release line', () => {
  const violations = collectPinViolations({ projectRoot })
  assert.deepEqual(violations, [], violations.join('\n'))
})

test('the pinned runtime package itself is installed at the recorded upstream version', () => {
  const runtime = JSON.parse(
    readFileSync(new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url), 'utf8'),
  )
  assert.equal(runtime.version, upstream.version)
  assert.equal(collectPinViolations({ projectRoot }).length, 0)
})
