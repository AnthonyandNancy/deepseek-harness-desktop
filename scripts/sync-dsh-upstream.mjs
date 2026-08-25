#!/usr/bin/env node
/**
 * Propose a DeepSeek Harness runtime upgrade for this Electron host.
 *
 * Desktop is not a fork of deepseek-ai/deepseek-harness: the Harness runtime
 * and Web UI arrive as published npm packages, so "syncing upstream" means
 * re-pinning the `@deepseek-ai/dsh*` dependency family, not merging source.
 * This script only produces that dependency proposal — building, packaging,
 * and the cross-platform smoke tests stay in CI.
 */
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = path.join(root, 'package.json')
const upstreamJsonPath = path.join(root, 'config', 'dsh-upstream.json')
const readmePaths = [path.join(root, 'README.md'), path.join(root, 'README.zh-CN.md')]

const RUNTIME_PACKAGE = '@deepseek-ai/dsh'
const UPSTREAM_REPOSITORY = 'deepseek-ai/deepseek-harness'
const UPSTREAM_GIT_URL = `https://github.com/${UPSTREAM_REPOSITORY}.git`
/** Desktop pins the whole `@deepseek-ai/dsh` family to one release line. */
const DSH_DEPENDENCY_PATTERN = /^@deepseek-ai\/dsh(?:-|$)/
/** Upstream publishes one git tag per npm release. */
const upstreamTag = (version) => `dsh-v${version}`

class UpstreamCompatibilityError extends Error {
  constructor(message) {
    super(`Upstream compatibility change detected.\n${message}`)
    this.name = 'UpstreamCompatibilityError'
  }
}

export function parseArguments(argv) {
  const options = { mode: undefined, version: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      options.mode = 'check'
      continue
    }
    if (argument === '--latest') {
      options.mode = 'latest'
      continue
    }
    if (argument === '--version') {
      options.mode = 'version'
      options.version = argv[index + 1]
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }
  if (options.mode === undefined) {
    throw new Error('Pass exactly one of --check, --latest, or --version <version>.')
  }
  if (options.mode === 'version' && !options.version) {
    throw new Error('--version requires a version, for example --version 0.1.0-rc.7.')
  }
  return options
}

export function collectDshDependencies(manifest) {
  const dependencies = manifest.dependencies ?? {}
  return Object.keys(dependencies)
    .filter((name) => DSH_DEPENDENCY_PATTERN.test(name))
    .sort()
    .map((name) => ({ name, version: dependencies[name] }))
}

/**
 * Refuse to upgrade a tree that is already inconsistent: a mixed rc6/rc7 pin
 * means an earlier sync half-landed, and re-pinning on top of it would hide
 * that instead of surfacing it.
 */
export function assertSingleReleaseLine(dependencies) {
  if (dependencies.length === 0) {
    throw new Error(`No ${RUNTIME_PACKAGE} dependencies found in package.json.`)
  }
  const ranged = dependencies.filter(({ version }) => !/^\d/.test(version))
  if (ranged.length > 0) {
    throw new Error(
      `Desktop requires exact DeepSeek Harness pins for reproducible releases, found: ${
        ranged.map(({ name, version }) => `${name}@${version}`).join(', ')
      }`,
    )
  }
  const versions = [...new Set(dependencies.map(({ version }) => version))]
  if (versions.length > 1) {
    const detail = dependencies.map(({ name, version }) => `  ${name}@${version}`).join('\n')
    throw new Error(
      `DeepSeek Harness dependencies span multiple release lines (${versions.join(', ')}):\n${detail}`,
    )
  }
  return versions[0]
}

async function npmView(specifier, field) {
  const { stdout } = await run('npm', ['view', specifier, field, '--json'], {
    cwd: root,
    shell: process.platform === 'win32',
  })
  return JSON.parse(stdout)
}

export async function readLatestRuntimeVersion() {
  return npmView(RUNTIME_PACKAGE, 'version')
}

/**
 * Every package Desktop pins must exist at the target version before anything
 * is written. A missing or renamed package is an upstream compatibility change
 * for a human to resolve, never something to silently drop from the manifest.
 */
export async function verifyPackageAvailability(dependencies, version) {
  const results = await Promise.all(dependencies.map(async ({ name }) => {
    try {
      return { name, version: await npmView(`${name}@${version}`, 'version') }
    } catch (error) {
      return { name, error: error instanceof Error ? error.message : String(error) }
    }
  }))
  const unavailable = results.filter((result) => result.version !== version)
  if (unavailable.length > 0) {
    throw new UpstreamCompatibilityError(
      `These packages are not published at ${version} (removed, renamed, or not released yet):\n${
        unavailable.map(({ name, error }) => `  ${name}@${version}${error ? ` — ${error.split('\n')[0]}` : ''}`).join('\n')
      }`,
    )
  }
}

export function parseTagCommit(stdout, tag) {
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    .map((line) => line.split(/\s+/))
    .find(([, reference]) => reference === `refs/tags/${tag}`)?.[0]
}

/**
 * Resolve the upstream release tag and commit an npm version was built from.
 * This is provenance, not a gate: npm is the authoritative version source, so a
 * tag that is unreachable or not published yet is reported and recorded as
 * absent rather than failing the upgrade.
 */
export async function readUpstreamTagCommit(version) {
  const tag = upstreamTag(version)
  try {
    const { stdout } = await run('git', ['ls-remote', '--tags', UPSTREAM_GIT_URL, `refs/tags/${tag}`], {
      cwd: root,
      shell: process.platform === 'win32',
    })
    return { tag, commit: parseTagCommit(stdout, tag) }
  } catch (error) {
    return { tag, error: error instanceof Error ? error.message.split('\n')[0] : String(error) }
  }
}

export function updateManifest(source, dependencies, version) {
  let updated = source
  for (const { name } of dependencies) {
    const pattern = new RegExp(`("${name.replaceAll('/', '\\/')}"\\s*:\\s*")[^"]+(")`)
    if (!pattern.test(updated)) {
      throw new Error(`Could not find the ${name} pin in package.json.`)
    }
    updated = updated.replace(pattern, `$1${version}$2`)
  }
  return updated
}

/**
 * Only rewrite the two documented "currently bundled version" phrasings. A
 * repository-wide replace would also rewrite historical release notes.
 */
export function updateReadme(source, previousVersion, version) {
  return source
    .replaceAll(`${RUNTIME_PACKAGE}@${previousVersion}`, `${RUNTIME_PACKAGE}@${version}`)
}

/**
 * The packaged artifact name advertises the bundled DeepSeek Harness release
 * (for example `...-dsh-0.1.1-rc.2-windows-x64.exe`). Keep that segment in sync
 * when the sync script moves the whole family to a new upstream version.
 */
export function updateArtifactNames(source, previousVersion, version) {
  return source.replaceAll(`-dsh-${previousVersion}-`, `-dsh-${version}-`)
}

export function buildUpstreamRecord({ version, tag, commit }) {
  return `${JSON.stringify({
    repository: UPSTREAM_REPOSITORY,
    package: RUNTIME_PACKAGE,
    version,
    tag,
    ...(commit === undefined ? {} : { commit }),
  }, undefined, 2)}\n`
}

async function updateLockfile() {
  // A dependency proposal must be produced on any runner, so skip the
  // platform-specific postinstall patch here; CI runs the real `npm ci`.
  await run('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
    cwd: root,
    shell: process.platform === 'win32',
  })
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const manifestSource = readFileSync(packageJsonPath, 'utf8')
  const dependencies = collectDshDependencies(JSON.parse(manifestSource))
  const currentVersion = assertSingleReleaseLine(dependencies)

  const targetVersion = options.mode === 'version'
    ? options.version
    : await readLatestRuntimeVersion()

  console.log(`current ${RUNTIME_PACKAGE}: ${currentVersion}`)
  console.log(`target  ${RUNTIME_PACKAGE}: ${targetVersion}`)
  console.log(`pinned DeepSeek Harness packages: ${dependencies.length}`)

  if (targetVersion === currentVersion) {
    console.log('Desktop already pins this DeepSeek Harness release; nothing to do.')
    return
  }

  await verifyPackageAvailability(dependencies, targetVersion)
  console.log(`all ${dependencies.length} pinned packages are published at ${targetVersion}`)

  if (options.mode === 'check') {
    console.log(`A newer DeepSeek Harness release is available: ${currentVersion} -> ${targetVersion}`)
    console.log(`Run: node scripts/sync-dsh-upstream.mjs --version ${targetVersion}`)
    process.exitCode = 1
    return
  }

  const { tag, commit, error } = await readUpstreamTagCommit(targetVersion)
  if (commit !== undefined) console.log(`upstream ${tag} -> ${commit}`)
  else if (error === undefined) console.log(`upstream tag ${tag} is not published yet; recording without a commit`)
  else console.warn(`could not resolve upstream tag ${tag}: ${error}`)

  writeFileSync(packageJsonPath, updateArtifactNames(
    updateManifest(manifestSource, dependencies, targetVersion),
    currentVersion,
    targetVersion,
  ))
  writeFileSync(upstreamJsonPath, buildUpstreamRecord({ version: targetVersion, tag, commit }))
  for (const readmePath of readmePaths) {
    const source = readFileSync(readmePath, 'utf8')
    const updated = updateReadme(source, currentVersion, targetVersion)
    if (updated !== source) writeFileSync(readmePath, updated)
  }

  await updateLockfile()

  console.log(`Updated ${dependencies.length} pins, config/dsh-upstream.json, both READMEs, and package-lock.json.`)
  console.log('Run npm ci, npm test, the platform package, and smoke:packaged before merging.')
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
}
