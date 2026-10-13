/**
 * electron-builder entry for Clubbox Windows/mac builds.
 *
 * Default (npm run dist): unsigned local NSIS/portable — SAC-unsafe for third parties.
 * Signed (npm run dist:signed): requires PFX env vars or electron-builder.azure.json.
 * Store (npm run dist:store): AppX for Microsoft Store (Store re-signs; no local cert).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const signed = process.argv.includes('--signed')
const store = process.argv.includes('--store')
const azureConfigPath = path.join(root, 'electron-builder.azure.json')
const storeConfigPath = path.join(root, 'electron-builder.store.json')

const env = { ...process.env }
const args = []

if (store && signed) {
  console.error('Use either --store or --signed, not both.')
  process.exit(1)
}

if (store) {
  // Microsoft Store re-signs AppX after certification — do not locally Authenticode-sign.
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  args.push('--win', 'appx')

  if (fs.existsSync(storeConfigPath)) {
    let storeCfg
    try {
      storeCfg = JSON.parse(fs.readFileSync(storeConfigPath, 'utf8'))
    } catch (err) {
      console.error(`dist:store: invalid electron-builder.store.json: ${err.message}`)
      process.exit(1)
    }
    const appx = storeCfg?.appx
    if (!appx || typeof appx !== 'object') {
      console.error('dist:store: electron-builder.store.json must contain an "appx" object.')
      process.exit(1)
    }
    for (const [key, value] of Object.entries(appx)) {
      if (value == null || value === '') continue
      if (Array.isArray(value)) {
        args.push(`--config.appx.${key}=${value.join(',')}`)
      } else {
        args.push(`--config.appx.${key}=${value}`)
      }
    }
    console.log(
      'dist:store: merged Partner Center identity from electron-builder.store.json',
    )
  } else {
    console.warn(
      'dist:store: no electron-builder.store.json — using package.json appx defaults.\n' +
        '  Before Partner Center upload, copy electron-builder.store.example.json →\n' +
        '  electron-builder.store.json and paste Product identity (publisher CN, etc.).\n' +
        '  See docs/product/microsoft-store.md',
    )
  }
} else if (!signed) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
} else {
  args.push('--config.forceCodeSigning=true')

  const hasPfx =
    Boolean(env.WIN_CSC_LINK || env.CSC_LINK) &&
    Boolean(env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD)
  const hasAzureFile = fs.existsSync(azureConfigPath)
  const hasAzureEnv =
    Boolean(env.AZURE_TENANT_ID) &&
    Boolean(env.AZURE_CLIENT_ID) &&
    Boolean(env.AZURE_CLIENT_SECRET || env.AZURE_CLIENT_CERTIFICATE_PATH)

  if (hasAzureFile) {
    if (!hasAzureEnv) {
      console.error(
        'dist:signed: found electron-builder.azure.json but missing Azure auth env vars.\n' +
          'Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET (or certificate auth).\n' +
          'See docs/product/windows-smart-app-control.md',
      )
      process.exit(1)
    }
    let azure
    try {
      azure = JSON.parse(fs.readFileSync(azureConfigPath, 'utf8'))
    } catch (err) {
      console.error(`dist:signed: invalid ${path.basename(azureConfigPath)}: ${err.message}`)
      process.exit(1)
    }
    const sign = azure?.win?.sign
    if (!sign || sign.type !== 'azure') {
      console.error(
        'dist:signed: electron-builder.azure.json must contain win.sign with type "azure".\n' +
          'See electron-builder.azure.example.json',
      )
      process.exit(1)
    }
    const required = [
      'endpoint',
      'codeSigningAccountName',
      'certificateProfileName',
      'publisherName',
    ]
    for (const key of required) {
      if (!sign[key]) {
        console.error(`dist:signed: electron-builder.azure.json missing win.sign.${key}`)
        process.exit(1)
      }
      args.push(`--config.win.sign.${key}=${sign[key]}`)
    }
    args.push('--config.win.sign.type=azure')
  } else if (!hasPfx) {
    console.error(
      'dist:signed: no signing credentials.\n' +
        '  PFX: set WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD, or\n' +
        '  Azure: copy electron-builder.azure.example.json → electron-builder.azure.json\n' +
        '         and set AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.\n' +
        'See docs/product/windows-smart-app-control.md',
    )
    process.exit(1)
  }
}

const extra = process.argv
  .slice(2)
  .filter((a) => a !== '--signed' && a !== '--store')
const result = spawnSync('npx', ['electron-builder', ...args, ...extra], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
