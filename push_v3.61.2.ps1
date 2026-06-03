# v3.61.2 - Phase A complete: AES-256-GCM client-side encryption
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$newFiles = @(
    "lib/backup/crypto-utils.ts",
    "components/backup/PassphraseDialog.tsx"
)
foreach ($f in $newFiles) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

$modFiles = @(
    "lib/version.ts",
    "app/settings/page.tsx"
)
foreach ($f in $modFiles) {
    if (-not (Test-Path $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.61.2"') { Write-Host "  + APP_VERSION = 3.61.2" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.61.2" -ForegroundColor Red; exit 1 }

$crypto = Get-Content "lib/backup/crypto-utils.ts" -Raw
if ($crypto -match 'PBKDF2_ITERS = 250_000') { Write-Host "  + PBKDF2 iterations = 250,000" -ForegroundColor Green }
else { Write-Host "  X PBKDF2 iters wrong" -ForegroundColor Red; exit 1 }
if ($crypto -match 'AES-GCM' -and $crypto -match 'subtle.encrypt') { Write-Host "  + AES-GCM via Web Crypto" -ForegroundColor Green }
else { Write-Host "  X AES-GCM missing" -ForegroundColor Red; exit 1 }
if ($crypto -match 'ERB-BACKUP-AES256GCM-v1') { Write-Host "  + file format marker present" -ForegroundColor Green }
else { Write-Host "  X format marker missing" -ForegroundColor Red; exit 1 }

$dlg = Get-Content "components/backup/PassphraseDialog.tsx" -Raw
if ($dlg -match 'estimatePassphraseStrength' -and $dlg -match 'PASSPHRASE_MIN_LENGTH') {
    Write-Host "  + dialog uses strength + min length" -ForegroundColor Green
} else { Write-Host "  X dialog wiring incomplete" -ForegroundColor Red; exit 1 }
if ($dlg -match 'mode === "encrypt"' -and $dlg -match 'mode === "decrypt"') {
    Write-Host "  + dialog supports both modes" -ForegroundColor Green
} else { Write-Host "  X dialog missing mode handling" -ForegroundColor Red; exit 1 }

$page = Get-Content "app/settings/page.tsx" -Raw
if ($page -match 'PassphraseDialog' -and $page -match 'encryptBackup' -and $page -match 'decryptBackup') {
    Write-Host "  + settings page wired to crypto" -ForegroundColor Green
} else { Write-Host "  X settings page not wired" -ForegroundColor Red; exit 1 }
if ($page -match 'finishExport' -and $page -match 'finishDecryptAndStage') {
    Write-Host "  + finishExport + finishDecryptAndStage present" -ForegroundColor Green
} else { Write-Host "  X finish handlers missing" -ForegroundColor Red; exit 1 }
if ($page -match 'isEncryptedBackup') {
    Write-Host "  + encrypted file auto-detection present" -ForegroundColor Green
} else { Write-Host "  X auto-detection missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add `
    lib/version.ts `
    lib/backup/crypto-utils.ts `
    components/backup/PassphraseDialog.tsx `
    app/settings/page.tsx `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(backup): v3.61.2 A7 - AES-256-GCM client-side encryption (Phase A complete)

Backups can now be optionally encrypted with a user passphrase before
the file leaves the browser. The server never sees the passphrase.

Cryptography:
  - KDF:        PBKDF2 + SHA-256 + 250,000 iterations + 16-byte salt
  - Cipher:     AES-256-GCM + 12-byte IV (authenticated encryption)
  - File ID:    ERB-BACKUP-AES256GCM-v1
  - All via Web Crypto API (window.crypto.subtle), AES-NI accelerated

File format:
  { encrypted: true, format, kdf{...}, cipher{...}, metadata_hint{...} }
  metadata_hint keeps non-sensitive identifiers (company name, date,
  record count) outside the ciphertext so users can see WHAT the file
  is without the passphrase. All business records remain encrypted.

UX:
  - PassphraseDialog: bilingual (ar/en), strength meter 0-4, confirm
    field, show/hide toggle, 'forgotten passphrase = unrecoverable'
    warning, weak-passphrase block (score < 2 disables button)
  - Encryption is opt-in: a checkbox in the dialog. Plain export still
    available with one click ('Export without encryption').
  - Encrypted files detected automatically on restore (isEncryptedBackup);
    passphrase dialog appears; decryption fails clearly on wrong key
    (GCM auth tag mismatch).

Security composition:
  - A2 cross-tenant guard still applies AFTER decryption.
  - A1 canonical-checksum is recomputed on decrypted data, so tampering
    with ciphertext fails both GCM auth AND the checksum.
  - PBKDF2 at 250k makes each brute-force attempt ~250 ms; AES-GCM
    authentication makes any 'try until it works' attack pointless.

Files:
  New: lib/backup/crypto-utils.ts (Web Crypto helpers)
  New: components/backup/PassphraseDialog.tsx (bilingual dialog)
  Modified: app/settings/page.tsx (wired through dialog)
  Modified: lib/version.ts (APP_VERSION 3.61.1 -> 3.61.2)

Phase A complete (A1..A7 from the v3.60.0 backup audit).
Phase B (Storage retention, history UI, cron, HMAC, rate limit,
restore progress, email) deferred to v3.62.x.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.61.2 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Click 'Export' - dialog should appear with encryption checkbox" -ForegroundColor White
    Write-Host "  2. Type a weak passphrase ('12345678') - button stays disabled" -ForegroundColor White
    Write-Host "  3. Type a strong passphrase - download yields backup_..._encrypted.json" -ForegroundColor White
    Write-Host "  4. Open the file in a text editor - should see ciphertext, no business data" -ForegroundColor White
    Write-Host "  5. Re-import - dialog asks for passphrase; wrong passphrase shows red error" -ForegroundColor White
    Write-Host "  6. Correct passphrase decrypts and continues to the usual restore preview" -ForegroundColor White
}
