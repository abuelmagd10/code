# ============================================================
# deploy-fix.ps1 — One-command deploy script for ERB VitaSlims
# ============================================================
# Usage:
#   .\deploy-fix.ps1 -Branch "fix/something" -Message "fix: short description"
#
# What it does (in order):
#   1. Creates a new feature branch from main
#   2. Stages all current changes
#   3. Commits with your message
#   4. Pushes to origin
#   5. Creates a PR via gh CLI
#   6. Auto-merges the PR (squash merge)
#   7. Deletes the local + remote branch
#   8. Returns you to main with latest changes pulled
#
# Requirements:
#   - gh CLI installed and authenticated (run `gh auth login` once)
#   - Git installed
#   - You're inside the ERB_VitaSlims repo
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Branch,

    [Parameter(Mandatory=$true)]
    [string]$Message,

    [string]$Body = "Auto-deploy via deploy-fix.ps1"
)

$ErrorActionPreference = "Stop"

function Write-Step($num, $text) {
    Write-Host ""
    Write-Host "[$num/8] $text" -ForegroundColor Cyan
}

function Write-Ok($text) {
    Write-Host "  OK $text" -ForegroundColor Green
}

function Write-Err($text) {
    Write-Host "  X $text" -ForegroundColor Red
}

try {
    # ---- Pre-checks ----
    $ghVersion = gh --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "GitHub CLI (gh) is not installed. Run: winget install --id GitHub.cli"
        exit 1
    }

    $ghAuth = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    }

    # ---- Step 1: Ensure on main with latest ----
    Write-Step 1 "Switching to main and pulling latest..."
    git checkout main
    git pull origin main
    Write-Ok "main is up to date"

    # ---- Step 2: Create new branch ----
    Write-Step 2 "Creating branch: $Branch"
    git checkout -b $Branch
    Write-Ok "On branch $Branch"

    # ---- Step 3: Stage changes ----
    Write-Step 3 "Staging all changes..."
    git add -A
    $staged = git diff --cached --name-only
    if (-not $staged) {
        Write-Err "No changes to commit. Did you forget to save your files?"
        git checkout main
        git branch -D $Branch
        exit 1
    }
    Write-Ok "Staged files:"
    $staged | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }

    # ---- Step 4: Commit ----
    Write-Step 4 "Committing..."
    git commit -m $Message
    Write-Ok "Committed: $Message"

    # ---- Step 5: Push ----
    Write-Step 5 "Pushing to origin..."
    git push -u origin $Branch
    Write-Ok "Branch pushed"

    # ---- Step 6: Create PR ----
    Write-Step 6 "Creating pull request..."
    $prUrl = gh pr create --title $Message --body $Body --base main --head $Branch
    Write-Ok "PR created: $prUrl"

    # ---- Step 7: Auto-merge PR ----
    Write-Step 7 "Merging PR (squash) and deleting branch..."
    gh pr merge $Branch --squash --delete-branch
    Write-Ok "PR merged into main"

    # ---- Step 8: Cleanup local ----
    Write-Step 8 "Returning to main with latest..."
    git checkout main
    git pull origin main
    Write-Ok "All done! Vercel will auto-deploy in 1-2 minutes."

    Write-Host ""
    Write-Host "Production URL: https://7esab.com" -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Err "Failed at: $_"
    Write-Host ""
    Write-Host "Current branch: $(git branch --show-current)" -ForegroundColor Yellow
    Write-Host "To recover: git checkout main && git branch -D $Branch (if needed)" -ForegroundColor Yellow
    exit 1
}
