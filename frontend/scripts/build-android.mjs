import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(frontendDir, 'android')
const signingProperties = join(androidDir, 'keystore.properties')
const buildEnv = { ...loadEnv('production', frontendDir, 'VITE_'), ...process.env }

function fail(message) {
  console.error(`Android release build: ${message}`)
  process.exit(1)
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

if (!isPublicHttpsUrl(buildEnv.VITE_API_URL || '')) {
  fail('Set VITE_API_URL to the deployed backend HTTPS origin before building (for example, the origin supplied by your API host).')
}

if (!buildEnv.VITE_GOOGLE_WEB_CLIENT_ID?.trim()) {
  fail('Set VITE_GOOGLE_WEB_CLIENT_ID to the Google Web application client ID used by the backend before building.')
}

if (buildEnv.VITE_ANDROID_DOWNLOAD_URL && !isPublicHttpsUrl(buildEnv.VITE_ANDROID_DOWNLOAD_URL)) {
  fail('VITE_ANDROID_DOWNLOAD_URL must be a public HTTPS URL when set.')
}

const signingEnvironment = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
]
const signingEnvironmentComplete = signingEnvironment.every((name) => process.env[name])
if (!signingEnvironmentComplete && !existsSync(signingProperties)) {
  fail('Configure release signing using android/keystore.properties or all four ANDROID_KEYSTORE_* / ANDROID_KEY_* environment variables.')
}

const localProperties = join(androidDir, 'local.properties')
const sdkFromEnvironment = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdkFromEnvironment && !existsSync(localProperties)) {
  fail('Install Android Studio and Android SDK, then set ANDROID_HOME/ANDROID_SDK_ROOT or configure android/local.properties.')
}
if (sdkFromEnvironment && !existsSync(sdkFromEnvironment)) {
  fail('ANDROID_HOME/ANDROID_SDK_ROOT does not point to an existing Android SDK directory.')
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) process.exit(result.status || 1)
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
run(npmCommand, ['run', 'build'], frontendDir)
run(npmCommand, ['run', 'cap:sync'], frontendDir)

const gradleWrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
run(gradleWrapper, ['--no-daemon', '--console=plain', 'assembleRelease'], androidDir)

const apkPath = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!existsSync(apkPath)) fail(`Gradle completed without creating ${apkPath}`)
const distributionDir = join(frontendDir, 'distribution')
mkdirSync(distributionDir, { recursive: true })
const distributionPath = join(distributionDir, 'splitter-android.apk')
copyFileSync(apkPath, distributionPath)
console.log(`Signed APK copied to ${distributionPath}`)
