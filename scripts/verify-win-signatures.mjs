/**
 * Verify Authenticode signatures on Clubbox Windows release artifacts.
 * Run after `npm run dist:signed`. Uses PowerShell Get-AuthenticodeSignature.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.resolve(root, '../clubdeck-app/release')

function collectTargets() {
  const targets = []
  if (!fs.existsSync(releaseDir)) {
    return targets
  }

  for (const name of fs.readdirSync(releaseDir)) {
    const full = path.join(releaseDir, name)
    if (!fs.statSync(full).isFile()) continue
    if (/^Clubbox-.*-(setup|portable)\.exe$/i.test(name)) {
      targets.push(full)
    }
  }

  const unpacked = path.join(releaseDir, 'win-unpacked')
  if (fs.existsSync(unpacked)) {
    const appExe = path.join(unpacked, 'Clubbox.exe')
    if (fs.existsSync(appExe)) targets.push(appExe)

    // Any PE we may have rewritten or shipped ourselves under win-unpacked root.
    for (const name of fs.readdirSync(unpacked)) {
      if (!/\.(exe|dll|node)$/i.test(name)) continue
      const full = path.join(unpacked, name)
      if (fs.statSync(full).isFile()) targets.push(full)
    }
  }

  return [...new Set(targets)]
}

function verifyOne(filePath) {
  const ps = `
    $s = Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(filePath)}
    [PSCustomObject]@{
      Path = $s.Path
      Status = $s.Status.ToString()
      StatusMessage = $s.StatusMessage
      Publisher = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '' }
      Thumbprint = if ($s.SignerCertificate) { $s.SignerCertificate.Thumbprint } else { '' }
    } | ConvertTo-Json -Compress
  `
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    return {
      Path: filePath,
      Status: 'Error',
      StatusMessage: (result.stderr || result.stdout || 'powershell failed').trim(),
      Publisher: '',
      Thumbprint: '',
    }
  }
  try {
    return JSON.parse(result.stdout.trim())
  } catch {
    return {
      Path: filePath,
      Status: 'Error',
      StatusMessage: `unparseable: ${result.stdout}`,
      Publisher: '',
      Thumbprint: '',
    }
  }
}

const targets = collectTargets()
if (targets.length === 0) {
  console.error(
    `No release PE files under ${releaseDir}. Run npm run dist:signed first.`,
  )
  process.exit(1)
}

let failed = 0
for (const file of targets) {
  const info = verifyOne(file)
  const ok = info.Status === 'Valid'
  if (!ok) failed += 1
  const rel = path.relative(releaseDir, info.Path || file)
  console.log(
    `${ok ? 'OK' : 'FAIL'}  ${rel}\n` +
      `       status=${info.Status}` +
      (info.Publisher ? `  publisher=${info.Publisher}` : '') +
      (info.StatusMessage && !ok ? `\n       ${info.StatusMessage}` : ''),
  )
}

if (failed > 0) {
  console.error(
    `\n${failed} file(s) failed Authenticode checks. SAC needs Valid signatures from a Trusted Root CA.`,
  )
  process.exit(1)
}

console.log(`\nAll ${targets.length} PE file(s) have Valid Authenticode signatures.`)
