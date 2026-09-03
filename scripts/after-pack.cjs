const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const appPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    : context.appOutDir

  if (context.electronPlatformName === 'darwin') {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], {
      stdio: 'inherit',
    })
    execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
      stdio: 'inherit',
    })
  }

  // Reject a packed app whose JS and native modules come from different
  // versions (see verify-packaged-natives.mjs) before it can ship.
  execFileSync(process.execPath, [
    path.join(__dirname, 'verify-packaged-natives.mjs'),
    appPath,
  ], {
    stdio: 'inherit',
  })
}
