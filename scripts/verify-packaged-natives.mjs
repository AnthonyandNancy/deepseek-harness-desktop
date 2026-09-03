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

for (const note of notes) console.log(note)
if (errors.length > 0) {
  console.error('verify-packaged-natives: FAILED')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`verify-packaged-natives: verified ${koffiCopies.length} koffi copy/copies`)
