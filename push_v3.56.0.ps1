# v3.56.0 - Phase 1: Merge Guide + Assistant + clean up user language
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$panel = Get-Content "components/ai-assistant/guide-panel.tsx" -Raw

$checks = @(
    @{ p = "panelTitle:";                  m = "L labels use 'panelTitle' instead of aiCopilot/aiGuide" },
    @{ p = "مساعدك الذكى";                 m = "Arabic friendly title present" },
    @{ p = "Your smart assistant";          m = "English friendly title present" },
    @{ p = "WelcomeBlock";                  m = "WelcomeBlock component present (no Tabs)" },
    @{ p = "StepsCard";                     m = "StepsCard sub-component" },
    @{ p = "TipsCard";                      m = "TipsCard sub-component" },
    @{ p = "AccountingPatternCard";         m = "AccountingPatternCard sub-component" },
    @{ p = "LiveInsightsPanel";             m = "LiveInsightsPanel (renamed from CopilotInteractivePanel)" },
    @{ p = "readOnlyChip:";                 m = "Read-only badge label present" },
    @{ p = "safeMode:";                     m = "safeMode label replaces fallback" }
)

# Confirm the OLD developer terms are NOT present anymore in the labels object
$badPatterns = @(
    @{ p = "copilotDescription:";  m = "old 'copilotDescription' label removed" },
    @{ p = "copilotSafeTitle:";    m = "old 'copilotSafeTitle' label removed" },
    @{ p = "copilotTab:";          m = "old 'copilotTab' label removed" },
    @{ p = "guideTab:";            m = "old 'guideTab' label removed" }
)

foreach ($c in $checks) {
    if ($panel -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

foreach ($b in $badPatterns) {
    if ($panel -match $b.p) {
        Write-Host ("  X " + $b.m + " -- still present: " + $b.p) -ForegroundColor Red
        exit 1
    } else {
        Write-Host ("  + " + $b.m) -ForegroundColor Green
    }
}

# Verify Tabs component removed
if ($panel -match "TabsList|TabsTrigger|TabsContent|<Tabs ") {
    Write-Host "  X Tabs components still present" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  + Tabs UI fully removed (unified chat experience)" -ForegroundColor Green
}

# Verify floating help button updated
$fhb = Get-Content "components/ai-assistant/floating-help-button.tsx" -Raw
if ($fhb -match "مساعدك الذكى") {
    Write-Host "  + FloatingHelpButton tooltip updated" -ForegroundColor Green
} else {
    Write-Host "  X FloatingHelpButton tooltip NOT updated" -ForegroundColor Red
    exit 1
}

# Verify settings page updated
$settings = Get-Content "app/settings/page.tsx" -Raw
if ($settings -notmatch "مساعد ERP للقراءة فقط يعمل عبر مزودات محلية مثل Ollama") {
    Write-Host "  + Settings card description cleaned (no Ollama in user copy)" -ForegroundColor Green
} else {
    Write-Host "  X Settings card description still mentions Ollama" -ForegroundColor Red
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
git add components/ai-assistant/guide-panel.tsx `
        components/ai-assistant/floating-help-button.tsx `
        app/settings/page.tsx `
        CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ai-assistant): v3.56.0 Phase 1 - unify guide+assistant, user-friendly language

Phase 1 of a 7-phase plan to bring the AI assistant up to
enterprise ERP standards. Pure UI changes - zero backend impact.

components/ai-assistant/guide-panel.tsx (full restructure):
- Remove Tabs (Guide/Copilot) - single unified chat experience
- Guide content (steps/tips/accounting pattern) now appears
  as welcome messages from the assistant inside the chat
- All developer terminology removed:
  * Copilot -> 'مساعدك الذكى' / 'Your smart assistant'
  * Fallback -> 'وضع آمن' / 'Safe mode'
  * Page Context, Interactive Payload, Bootstrap -> removed
  * Governance -> 'صلاحياتك' / 'Your access'
- Added 'Read-only' badge in the header for visual safety
- Conversation auto-hydrates when panel opens (no tab switch needed)

components/ai-assistant/floating-help-button.tsx:
- Tooltip: 'مساعدك الذكى' / 'Your smart assistant'

app/settings/page.tsx:
- Settings card description cleaned (no Ollama in user copy)
- Info note rewritten in natural language

Safety guarantees:
- ZERO changes to /api/ai/*  endpoints
- ZERO changes to lib/ai/*  (16k lines of engine untouched)
- ZERO changes to DB / migrations
- ZERO changes to governance / RLS
- TypeScript: OK" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.56.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  Open any page -> click the floating help button" -ForegroundColor White
    Write-Host "  -> Drawer should show a UNIFIED chat (no tabs)" -ForegroundColor White
    Write-Host "  -> Guide content (steps/tips/accounting) appears as a welcome bubble" -ForegroundColor White
    Write-Host "  -> No 'Copilot', 'Fallback', 'Context' technical terms" -ForegroundColor White
    Write-Host "  -> 'Read-only' badge visible in header" -ForegroundColor White
    Write-Host "  -> Suggested prompts shown after welcome" -ForegroundColor White
    Write-Host "  -> Sending a message works (calls /api/ai/chat unchanged)" -ForegroundColor White
}
