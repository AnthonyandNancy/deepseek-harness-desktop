// Verifies that a packaged app never mixes native modules from two versions of
// the same package. In-place upgrades silently skip the native binaries of a
// running app, so a broken install can ship a fresh koffi JS copy next to an
// old koffi.node — the app then dies at boot with "Mismatched native Koffi
// modules". Fail the build here instead.
//
// Usage: node scripts/verify-packaged-natives.mjs [appOutDir]
// Runs automatically from scripts/after-pack.cjs after every pack.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultAppDirs = [
  path.join(scriptRoot, 'dist', 'win-unpacked'),
  path.join(scriptRoot, 'dist', 'linux-unpacked'),
  path.join(scriptRoot, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac'),
]
const explicitAppOutDir = process.argv[2]
if (!explicitAppOutDir && !defaultAppDirs.some(existsSync)) {
  console.error('verify-packaged-natives: no packaged app found; pass an appOutDir argument')
  process.exit(1)
}
const appOutDir = path.resolve(explicitAppOutDir ?? defaultAppDirs.find(existsSync))

const errors = []
const notes = []

function report(label, detail) {
  console.log(`${label} ${detail}`)
}

function findAppResources(appOutDir) {
  const candidates = [
    path.join(appOutDir, 'resources', 'app'),
    path.join(appOutDir, 'Contents', 'Resources', 'app'),
    appOutDir,
  ]
  return candidates.find((dir) => existsSync(path.join(dir, 'package.json')))
}

function collectPackageDirs(root, name) {
  const found = []
  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name === name && existsSync(path.join(full, 'package.json'))) {
        found.push(full)
      } else if (entry.name !== '.bin') {
        walk(full)
      }
    }
  }
  walk(root)
  return found
}

function readPackage(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
}

// koffi checks its JS version against the version reported by the loaded
// native module (koffi/src/koffi: wrapNative). Requiring the packaged copy
// under this Node runs exactly that check, since koffi ships Node-API
// binaries. Skip only when the package targets a different platform than the
// verifying machine (a cross-arch build cannot be loaded here).
function verifyKoffiCopy(koffiDir, resourcesRoot) {
  const packageJson = readPackage(koffiDir)
  const requireFromPackagedApp = createRequire(path.join(koffiDir, '__verify__.cjs'))

  // The koffi native module ships as @koromix/koffi-<platform>; a stale copy
  // left behind by an upgrade keeps its old package.json version.
  const optionalPlatformPackages = Object.keys(packageJson.optionalDependencies ?? {})
    .filter((name) => name.startsWith('@koromix/koffi-'))
  for (const name of optionalPlatformPackages) {
    const koromixDir = path.join(resourcesRoot, 'node_modules', name)
    if (!existsSync(koromixDir)) continue
    const koromixVersion = readPackage(koromixDir).version
    if (koromixVersion !== packageJson.version) {
      errors.push(
        `koffi@${packageJson.version} expects ${name}@${koromixVersion} next to it; ` +
        'reinstall dependencies from a clean lockfile before packing',
      )
    }
  }

  const relative = path.relative(resourcesRoot, koffiDir)
  const entry = existsSync(path.join(koffiDir, 'index.cjs'))
    ? path.join(koffiDir, 'index.cjs')
    : koffiDir
  try {
    requireFromPackagedApp(entry)
    report('ok', `koffi@${packageJson.version} ${relative} (native modules match)`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/Cannot find the native Koffi module/.test(message)) {
      const hostedPlatform = optionalPlatformPackages.map((name) => name.slice('@koromix/koffi-'.length))
      if (hostedPlatform.includes(`${process.platform}-${process.arch}`)) {
        errors.push(
          `koffi@${packageJson.version} ${relative} cannot find its native module for ` +
          `${process.platform}-${process.arch} (${message})`,
        )
      } else {
        notes.push(`skip koffi@${packageJson.version} ${relative} (packaged for ${hostedPlatform.join(', ')})`)
      }
      return
    }
    errors.push(`koffi@${packageJson.version} ${relative} fails to load: ${message}`)
  }
}

// npm installs a package that only a peer edge requires — the lockfile records
// that as `peer: true` — but electron-builder packs the closure it walks from the
// app manifest's `dependencies`, so it drops that package. The gap is invisible
// from the source tree, which is why it ships: the checkout boots and the product
// does not. `dev: true` marks the build tooling (electron-builder's own
// transitive peers) that legitimately never ships; everything else in this set is
// a package the product must carry.
function collectPeerOnlyRuntimePackages(lockfilePath = path.join(scriptRoot, 'package-lock.json')) {
  let lockfile
  try {
    lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'))
  } catch (error) {
    notes.push(
      `note could not read ${path.relative(scriptRoot, lockfilePath)} `
      + `(${error.message}); reporting missing peers as notes only`,
    )
    return new Set()
  }

  const names = new Set()
  for (const [key, entry] of Object.entries(lockfile.packages ?? {})) {
    if (entry.peer !== true || entry.dev === true) continue
    const name = entry.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
    if (name.length > 0) names.add(name)
  }
  return names
}

// electron-builder collects the manifest dependency closure, but upstream
// packages also import peers at runtime. `dsh-app-boot` imports
// `@deepseek-ai/cordis-plugin-group`, which it declares only as a peer and which
// nothing else requires as a dependency, so a manifest that does not pin it
// produces an app that installs and boots from the source tree yet dies at
// startup with ERR_MODULE_NOT_FOUND once packed.
//
// `@deepseek-ai/dsh-ptc-runtime` is the same shape of gap and reached a release:
// `dsh-ptc-runtime-node` imports it from its first line, so the app shipped with
// no `ptcRuntime` service, every agent preset that delegates workflows stayed
// pending, and creating a session failed outright. Resolve every declared
// dependency and peer from its own package the way Node would, so the gap fails
// the build instead of the first launch.
function verifyDeclaredDependenciesResolve(resourcesRoot) {
  const nodeModulesRoot = path.join(resourcesRoot, 'node_modules')
  const rootManifest = readPackage(resourcesRoot)
  const peerOnlyPackages = collectPeerOnlyRuntimePackages()

  // Only the root manifest's dependency closure is what electron-builder packs.
  // Packages outside it are vendored example directories that happen to carry a
  // package.json (for example `fast-json-stable-stringify/benchmark`), and
  // checking those produces noise rather than signal.
  //
  // The walk stops at the packaged app root. Ascending past it would resolve
  // against this checkout's node_modules, which hides exactly the packaging gap
  // this check exists to catch.
  function resolvePackageDir(requesterDir, name) {
    let dir = requesterDir
    while (true) {
      const candidate = path.join(dir, 'node_modules', name)
      if (existsSync(path.join(candidate, 'package.json'))) return candidate
      if (dir === resourcesRoot) return undefined
      const parent = path.dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  }

  const closure = new Map()
  const queue = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({ name, kind: 'dependency' }))
  while (queue.length > 0) {
    const { name, kind } = queue.shift()
    const previous = closure.get(name)
    if (previous !== undefined) {
      // A real install edge outranks a peer edge for the same package.
      if (previous.kind === 'dependency' || kind === 'peer') continue
    }
    const dir = resolvePackageDir(resourcesRoot, name)
    closure.set(name, { kind, dir })
    if (dir === undefined) continue
    const manifest = readPackage(dir)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name: dependency, kind: 'dependency' })
    }
    for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
      queue.push({ name: dependency, kind: 'peer' })
    }
  }

  // A package the product is meant to carry is a release blocker when it cannot
  // resolve. That is any real install edge, and also a peer edge whose package
  // npm installed for this checkout — electron-builder prunes the latter, which
  // is how a peer-only import becomes a shipped crash. A peer that nothing
  // installs (bufferutil, utf-8-validate, @modelcontextprotocol/sdk) is upstream
  // declaring an optional integration instead, so it stays a note. Both classes
  // are listed either way.
  const record = (detail, expected) => {
    if (expected) {
      errors.push(`${detail}; pin it in package.json dependencies so electron-builder includes it`)
    } else {
      notes.push(`note ${detail} (upstream declares it as a peer that nothing installs)`)
    }
  }

  for (const [name, entry] of closure) {
    // A package that is absent entirely is judged by the edge that required it
    // and by whether npm installed it for this checkout.
    if (entry.dir === undefined) {
      record(
        `the packaged app is missing ${name}`,
        entry.kind === 'dependency' || peerOnlyPackages.has(name),
      )
      continue
    }

    const manifest = readPackage(entry.dir)
    const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}))
    const checks = [
      { entries: manifest.dependencies ?? {}, fatal: true },
      { entries: manifest.peerDependencies ?? {}, fatal: false },
    ]
    for (const { entries, fatal } of checks) {
      for (const dependency of Object.keys(entries)) {
        if (optional.has(dependency)) continue
        if (manifest.peerDependenciesMeta?.[dependency]?.optional === true) continue
        if (resolvePackageDir(entry.dir, dependency) !== undefined) continue
        record(
          `${name}@${manifest.version ?? '?'} cannot resolve ${dependency} in the packaged app`,
          fatal || peerOnlyPackages.has(dependency),
        )
      }
    }
  }

  report('ok', `resolved ${closure.size} packaged dependencies against their declared requirements`)
}

// sharp's prebuilt binaries encode their version in the file name, so stale
// files from an older install are detectable without loading anything.
function verifySharpPackages(resourcesRoot) {
  const imgRoot = path.join(resourcesRoot, 'node_modules', '@img')
  if (!existsSync(imgRoot)) return
  for (const name of readdirSync(imgRoot)) {
    if (!name.startsWith('sharp-')) continue
    const pkgDir = path.join(imgRoot, name)
    const packageJson = readPackage(pkgDir)
    const scanDirs = [pkgDir, path.join(pkgDir, 'lib')].filter((dir) => {
      try {
        return statSync(dir).isDirectory()
      } catch {
        return false
      }
    })
    for (const dir of scanDirs) {
      for (const file of readdirSync(dir)) {
        const match = /-(\d+\.\d+\.\d+)\.node$/.exec(file)
        if (!match) continue
        if (match[1] !== packageJson.version) {
          errors.push(
            `${name}@${packageJson.version} still contains ${file} from an older install; ` +
            'reinstall dependencies from a clean lockfile before packing',
          )
        }
      }
    }
  }
}

const resourcesRoot = findAppResources(appOutDir)
if (!resourcesRoot) {
  console.error(`verify-packaged-natives: ${appOutDir} does not look like an unpacked app`)
  process.exit(1)
}

const koffiCopies = collectPackageDirs(path.join(resourcesRoot, 'node_modules'), 'koffi')
if (koffiCopies.length === 0) {
  errors.push('packaged app has no koffi dependency to verify')
}
for (const koffiDir of koffiCopies) verifyKoffiCopy(koffiDir, resourcesRoot)
verifySharpPackages(resourcesRoot)
verifyDeclaredDependenciesResolve(resourcesRoot)

for (const note of notes) console.log(note)
if (errors.length > 0) {
  console.error('verify-packaged-natives: FAILED')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`verify-packaged-natives: verified ${koffiCopies.length} koffi copy/copies`)
