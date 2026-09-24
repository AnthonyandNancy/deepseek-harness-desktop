#!/usr/bin/env node
/**
 * Guard against a half-landed runtime upgrade: the recorded upstream version and
 * the actually installed @deepseek-ai/dsh* tree must agree. Upstream ships every
 * @deepseek-ai/dsh package in lockstep and pins its family exactly, so any other
 * version means the install mixes two Harness builds. Verified against both the
 * 0.1.5-rc.1 and 0.1.7-rc.1 installed trees: zero packages of this family sit off
 * the release line, so this check needs no allowlist.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCOPE = '@deepseek-ai'

export function collectPinViolations({ projectRoot = root } = {}) {
  const expected = JSON.parse(
    readFileSync(path.join(projectRoot, 'config', 'dsh-upstream.json'), 'utf8'),
  ).version
  const scopeRoot = path.join(projectRoot, 'node_modules', SCOPE)
  const violations = []

  for (const entry of readdirSync(scopeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('dsh')) continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(path.join(scopeRoot, entry.name, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    const { name, version } = manifest
    if (typeof name !== 'string' || !name.startsWith('@deepseek-ai/dsh')) continue
    if (typeof version !== 'string' || version === expected) continue
    violations.push(`${name}@${version} (expected ${expected})`)
  }

  return violations.sort()
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  const violations = collectPinViolations()
  if (violations.length > 0) {
    console.error('Installed DeepSeek Harness packages drift from the pinned release line:')
    for (const line of violations) console.error(`  ${line}`)
    console.error('Run: npm ci')
    process.exitCode = 2
  } else {
    console.log('DeepSeek Harness install closure matches the pinned release line.')
  }
}
