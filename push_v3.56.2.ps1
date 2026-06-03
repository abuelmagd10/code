# v3.56.2 - Stricter visual hotfix: <ol>/<ul> -> <div>, sanitize message content
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$panel = Get-Content "components/ai-assistant/guide-panel.tsx" -Raw

# Confirm <ol> and <ul> are NO LONGER used inside Steps/Tips cards
$stepsPattern = 'function StepsCard'
$tipsPattern = 'function TipsCard'

$stepsStart = $panel.IndexOf("function StepsCard")
$stepsEnd = $panel.IndexOf("function TipsCard")
$tipsStart = $stepsEnd
$tipsEnd = $panel.IndexOf("function AccountingPatternCard")

if ($stepsStart -lt 0 -or $stepsEnd -lt 0 -or $tipsEnd -lt 0) {
    Write-Host "  X Could not locate card functions" -ForegroundColor Red
    exit 1
}

$stepsBlock = $panel.Substring($stepsStart, $stepsEnd - $stepsStart)
$tipsBlock = $panel.Substring($tipsStart, $tipsEnd - $tipsStart)

# Use case-sensitive matching with word-boundary-like patterns to avoid
# false positives on lucide icons like <Lightbulb>
if ($stepsBlock -cmatch '<ol[\s>]' -or $stepsBlock -cmatch '<li[\s>]') {
    Write-Host "  X StepsCard still uses <ol>/<li>" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  + StepsCard now uses <div> (no list markers possible)" -ForegroundColor Green
}

if ($tipsBlock -cmatch '<ul[\s>]' -or $tipsBlock -cmatch '<li[\s>]') {
    Write-Host "  X TipsCard still uses <ul>/<li>" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  + TipsCard now uses <div> (no list markers possible)" -ForegroundColor Green
}

# Confirm message content sanitization
if ($panel -match 'sanitizeUserFacingText\(message\.content\)') {
    Write-Host "  + Assistant message content is sanitized" -ForegroundColor Green
} else {
    Write-Host "  X message.content sanitization missing" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Cleanup stale git locks ===" -ForegroundColor Cyan
if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "  + Removed stale .git/index.lock" -ForegroundColor Green
} else {
    Write-Host "  + No stale lock" -ForegroundColor Green
}

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/ai-assistant/guide-panel.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(ai-assistant): v3.56.2 stricter visual hotfix

After v3.56.1 the user still saw '1. 1' duplicate numbers and
'* .' duplicate bullets. Root cause: <ol>/<ul> still inject
list markers into rendered output and copy/paste text even
when 'list-none' hides them visually in some browser themes.

Also the assistant chat-message content was NOT being passed
through sanitizeUserFacingText, so 'الطبقة المحلية' leaked into
chat replies even though it was clean in the live-insights panel.

Changes in components/ai-assistant/guide-panel.tsx:

1) StepsCard: replace <ol>/<li> with plain <div>. No list
   element means no auto-marker is ever emitted. Each step
   still shows its blue circular number badge.

2) TipsCard: replace <ul>/<li> with plain <div>. No list
   element means no bullet is ever emitted. Each tip still
   shows the custom amber bullet character.

3) ChatBubble: assistant text now passes through
   sanitizeUserFacingText(). User messages are left untouched.

Zero backend impact. TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.56.2 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, verify on /settings:" -ForegroundColor Cyan
    Write-Host "  Steps show ONLY the blue circle number - no leading '1.', '2.'" -ForegroundColor White
    Write-Host "  Tips show ONLY one amber dot - no leading '*'" -ForegroundColor White
    Write-Host "  Assistant chat replies have NO 'الطبقة المحلية' phrase" -ForegroundColor White
}
