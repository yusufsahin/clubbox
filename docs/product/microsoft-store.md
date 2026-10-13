# Clubbox — Microsoft Store (AppX) distribution

**Chosen path (2026-10-13):** Ship Windows builds through the Microsoft Store as **AppX**. After certification the Store **re-signs** the package with a Microsoft certificate — users on Windows 11 Smart App Control can install without a paid Authenticode cert and without turning SAC off.

electron-builder **26** in this repo targets **`appx`** (not the newer beta `msix` target in v27). Partner Center accepts `.appx` for desktop bridge / full-trust apps.

## Risk (read first)

Clubbox is an **unofficial** Clubhouse desktop studio (web session + Agora). Store certification may reject apps that:

- Impersonate or confuse users about affiliation with another brand
- Rely on undocumented / third-party API access against another service’s terms
- Request sensitive capabilities without a clear privacy story

Listing copy **must** say unofficial / not affiliated with Clubhouse. If certification fails, fall back to paid Authenticode (`docs/product/windows-smart-app-control.md`) or source-only installs.

## Owner checklist

### 1. Free Partner Center account

1. Open [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com) (new individual flow — no registration fee).
2. Complete ID verification.
3. In Partner Center → **Apps and games** → create a new app → reserve name **Clubbox** (or another available name; keep `productName` in sync).

### 2. Copy package identity

Partner Center → your app → **Product management** → **Product identity** (wording may vary):

| Field | Goes into |
| --- | --- |
| Package/Identity name | `appx.identityName` |
| Publisher (e.g. `CN=…GUID…`) | `appx.publisher` — **exact** string |
| Publisher display name | `appx.publisherDisplayName` |

Copy `electron-builder.store.example.json` → **`electron-builder.store.json`** (gitignored) and paste those values.

### 3. Build the Store package

```bat
npm run icons
npm run dist:store
```

Output (default): `../clubdeck-app/release/Clubbox-*.appx` (and related artifacts).

`dist:store` forces **no local code signing** (`CSC_IDENTITY_AUTO_DISCOVERY=false`). The Store signs after certification.

### 4. Local smoke (optional)

Developer Mode on →:

```powershell
Add-AppxPackage -Path "..\clubdeck-app\release\Clubbox-<version>.appx"
```

Unsigned / placeholder-publisher packages only install in Developer Mode. Real users install from the Store after publication.

### 5. Submit

1. Partner Center → new submission.
2. Upload the `.appx`.
3. Age rating, Store listing (EN + optionally TR), screenshots, privacy policy URL.
4. **Capabilities / notes:** microphone + internet; full-trust desktop app (Electron).
5. Submit → wait for certification (often 1–3 business days).

## Build configuration

| Piece | Location |
| --- | --- |
| Default AppX options | `package.json` → `build.appx` |
| Partner Center override | `electron-builder.store.json` (local, gitignored) |
| Tile / Store logos | `build/appx/` via `npm run icons` |
| Script | `npm run dist:store` → `scripts/run-electron-builder.mjs --store` |

Default capabilities: `runFullTrust`, `internetClient`, `microphone` (studio voice).

## What this does / does not solve

| | |
| --- | --- |
| ✅ | Other users install from Store under SAC On — Microsoft signature |
| ✅ | No paid code-signing certificate for the Store package |
| ❌ | Sideloaded `.appx` outside the Store still needs a trusted signature |
| ❌ | NSIS/portable EXE outside the Store still need Authenticode (separate path) |
| ❌ | Store approval is not guaranteed for this product category |
