import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  assertSingleReleaseLine,
  buildUpstreamRecord,
  collectDshDependencies,
  parseArguments,
  parseTagCommit,
  updateArtifactNames,
  updateManifest,
  updateReadme,
} from '../scripts/sync-dsh-upstream.mjs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const upstream = JSON.parse(readFileSync(new URL('../config/dsh-upstream.json', import.meta.url), 'utf8'))

test('every DeepSeek Harness dependency is pinned to one exact release line', () => {
  const dependencies = collectDshDependencies(manifest)
  assert.ok(dependencies.length > 0)
  assert.equal(assertSingleReleaseLine(dependencies), upstream.version)
})

test('the recorded upstream version matches the pinned runtime package', () => {
  assert.equal(manifest.dependencies['@deepseek-ai/dsh'], upstream.version)
  assert.equal(upstream.tag, `dsh-v${upstream.version}`)
  assert.match(upstream.commit, /^[0-9a-f]{40}$/)
})

test('a dependency family split across release lines is refused', () => {
  assert.throws(
    () => assertSingleReleaseLine([
      { name: '@deepseek-ai/dsh', version: '0.1.0-rc.7' },
      { name: '@deepseek-ai/dsh-fs', version: '0.1.0-rc.6' },
    ]),
    /multiple release lines/,
  )
})

test('range specifiers are refused so Desktop releases stay reproducible', () => {
  assert.throws(
    () => assertSingleReleaseLine([{ name: '@deepseek-ai/dsh', version: '^0.1.0-rc.7' }]),
    /exact DeepSeek Harness pins/,
  )
})

test('only the DeepSeek Harness family is collected', () => {
  const dependencies = collectDshDependencies({
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.7',
      '@deepseek-ai/dsh-fs': '0.1.0-rc.7',
      '@deepseek-ai/cordis-plugin-group': '1.0.1',
      electron: '43.4.0',
    },
  })
  assert.deepEqual(dependencies.map(({ name }) => name), ['@deepseek-ai/dsh', '@deepseek-ai/dsh-fs'])
})

test('the manifest rewrite only touches the pinned versions', () => {
  const source = '{\n  "@deepseek-ai/dsh": "0.1.0-rc.7",\n  "electron": "0.1.0-rc.7"\n}'
  const updated = updateManifest(source, [{ name: '@deepseek-ai/dsh' }], '0.1.0-rc.8')
  assert.equal(updated, '{\n  "@deepseek-ai/dsh": "0.1.0-rc.8",\n  "electron": "0.1.0-rc.7"\n}')
})

test('the manifest rewrite fails loudly when a pin disappears', () => {
  assert.throws(() => updateManifest('{}', [{ name: '@deepseek-ai/dsh' }], '0.1.0-rc.8'), /Could not find/)
})

test('the README rewrite leaves historical version mentions alone', () => {
  const source = [
    'pins `@deepseek-ai/dsh@0.1.0-rc.7` for packaging',
    'v0.3.4 shipped @deepseek-ai/dsh@0.1.0-rc.6',
    'upgraded from 0.1.0-rc.7 in an earlier note',
  ].join('\n')
  const updated = updateReadme(source, '0.1.0-rc.7', '0.1.0-rc.8')
  assert.match(updated, /pins `@deepseek-ai\/dsh@0\.1\.0-rc\.8`/)
  assert.match(updated, /v0\.3\.4 shipped @deepseek-ai\/dsh@0\.1\.0-rc\.6/)
  assert.match(updated, /upgraded from 0\.1\.0-rc\.7 in an earlier note/)
})

test('the artifact name keeps the bundled DeepSeek Harness version in sync', () => {
  const source = [
    '"artifactName": "DeepSeek-Harness-Desktop-${version}-dsh-0.1.0-rc.8-${arch}.${ext}"',
    '"artifactName": "DeepSeek-Harness-Desktop-${version}-dsh-0.1.0-rc.8-windows-${arch}.${ext}"',
    '"artifactName": "DeepSeek-Harness-Desktop-${version}-dsh-0.1.0-rc.8-linux-${arch}.${ext}"',
  ].join('\n')
  const updated = updateArtifactNames(source, '0.1.0-rc.8', '0.1.1-rc.2')
  assert.match(updated, /dsh-0\.1\.1-rc\.2-\$\{arch\}/)
  assert.match(updated, /dsh-0\.1\.1-rc\.2-windows/)
  assert.match(updated, /dsh-0\.1\.1-rc\.2-linux/)
  assert.doesNotMatch(updated, /dsh-0\.1\.0-rc\.8/)
})

test('the upstream record omits an unresolved commit instead of inventing one', () => {
  const record = JSON.parse(buildUpstreamRecord({ version: '0.1.0-rc.8', tag: 'dsh-v0.1.0-rc.8' }))
  assert.equal(record.commit, undefined)
  assert.equal(record.repository, 'deepseek-ai/deepseek-harness')
})

test('the upstream record never carries a churn-only timestamp', () => {
  const record = JSON.parse(buildUpstreamRecord({ version: '0.1.0-rc.8', tag: 'dsh-v0.1.0-rc.8', commit: 'a'.repeat(40) }))
  assert.deepEqual(Object.keys(record), ['repository', 'package', 'version', 'tag', 'commit'])
})

test('the tag lookup reads the commit for the exact tag only', () => {
  const stdout = [
    '1111111111111111111111111111111111111111\trefs/tags/dsh-v0.1.0-rc.70',
    '2222222222222222222222222222222222222222\trefs/tags/dsh-v0.1.0-rc.7',
  ].join('\n')
  assert.equal(parseTagCommit(stdout, 'dsh-v0.1.0-rc.7'), '2'.repeat(40))
  assert.equal(parseTagCommit('', 'dsh-v0.1.0-rc.7'), undefined)
})

test('exactly one mode must be requested', () => {
  assert.deepEqual(parseArguments(['--check']), { mode: 'check', version: undefined })
  assert.deepEqual(parseArguments(['--version', '0.1.0-rc.8']), { mode: 'version', version: '0.1.0-rc.8' })
  assert.equal(parseArguments(['--latest']).mode, 'latest')
  assert.throws(() => parseArguments([]), /exactly one of/)
  assert.throws(() => parseArguments(['--version']), /requires a version/)
  assert.throws(() => parseArguments(['--upgrade']), /Unknown argument/)
})
