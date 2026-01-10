# 🔒 MANDATORY ERP GOVERNANCE FIXES - Execution Script
# Run this script to apply all governance fixes

Write-Host "🔒 MANDATORY ERP GOVERNANCE FIXES" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "scripts/MANDATORY_ERP_GOVERNANCE_FIXES.sql")) {
    Write-Host "❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    Write-Host "Expected to find: scripts/MANDATORY_ERP_GOVERNANCE_FIXES.sql" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Step 1: Applying Database Schema Fixes..." -ForegroundColor Cyan
Write-Host "This will enforce Company → Branch → Cost Center → Warehouse hierarchy" -ForegroundColor Gray
Write-Host ""

# Prompt for database connection
$dbUrl = Read-Host "Enter your Supabase database URL (or press Enter to use .env.local)"

if ([string]::IsNullOrEmpty($dbUrl)) {
    if (Test-Path ".env.local") {
        Write-Host "📄 Reading database URL from .env.local..." -ForegroundColor Green
        $envContent = Get-Content ".env.local"
        $dbLine = $envContent | Where-Object { $_ -match "DATABASE_URL" }
        if ($dbLine) {
            $dbUrl = ($dbLine -split "=", 2)[1].Trim('"')
            Write-Host "✅ Found database URL in .env.local" -ForegroundColor Green
        } else {
            Write-Host "❌ DATABASE_URL not found in .env.local" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ .env.local file not found" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🔧 Applying mandatory governance fixes..." -ForegroundColor Yellow

try {
    # Apply the main governance fixes
    $result = psql $dbUrl -f "scripts/MANDATORY_ERP_GOVERNANCE_FIXES.sql" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database schema fixes applied successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Error applying database fixes:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: psql command not found. Please install PostgreSQL client tools." -ForegroundColor Red
    Write-Host "Or run the SQL script manually in your database." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔍 Step 2: Verifying Governance Compliance..." -ForegroundColor Cyan

try {
    # Run verification script
    $verifyResult = psql $dbUrl -f "scripts/ERP_GOVERNANCE_VERIFICATION.sql" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Governance verification completed!" -ForegroundColor Green
        Write-Host "Check the output above for compliance status." -ForegroundColor Gray
    } else {
        Write-Host "❌ Error running verification:" -ForegroundColor Red
        Write-Host $verifyResult -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️  Could not run verification script automatically." -ForegroundColor Yellow
    Write-Host "Please run manually: psql `$DATABASE_URL -f scripts/ERP_GOVERNANCE_VERIFICATION.sql" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📝 Step 3: Next Steps for Application Code..." -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Update your API routes to use the new governance layer:" -ForegroundColor White
Write-Host "   - Import: import { withGovernance } from '@/lib/erp-governance-layer'" -ForegroundColor Gray
Write-Host "   - Replace: export const GET = withGovernance(getSecureSuppliers)" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Remove dangerous NULL escape patterns:" -ForegroundColor White
Write-Host "   - Search for: OR branch_id IS NULL" -ForegroundColor Gray
Write-Host "   - Search for: OR cost_center_id IS NULL" -ForegroundColor Gray
Write-Host "   - Search for: OR warehouse_id IS NULL" -ForegroundColor Gray
Write-Host "   - REMOVE ALL OF THESE!" -ForegroundColor Red
Write-Host ""
Write-Host "3. Use SecureQueryBuilder for all database queries:" -ForegroundColor White
Write-Host "   - Import: import { SecureQueryBuilder } from '@/lib/api-security-governance'" -ForegroundColor Gray
Write-Host "   - Use: const queryBuilder = new SecureQueryBuilder(supabase, governance)" -ForegroundColor Gray
Write-Host ""

Write-Host "📖 For detailed instructions, see:" -ForegroundColor Cyan
Write-Host "   MANDATORY_ERP_GOVERNANCE_IMPLEMENTATION_GUIDE.md" -ForegroundColor White
Write-Host ""

Write-Host "🎯 CRITICAL REMINDERS:" -ForegroundColor Red
Write-Host "=====================" -ForegroundColor Red
Write-Host "❌ Do NOT enable refunds until these fixes are complete" -ForegroundColor Red
Write-Host "❌ Do NOT enable approval workflows until governance is enforced" -ForegroundColor Red
Write-Host "❌ Do NOT enable credit/debit notes until NULL escapes are removed" -ForegroundColor Red
Write-Host ""
Write-Host "✅ Only after ALL fixes are applied is the system legally safe!" -ForegroundColor Green
Write-Host ""

# Check for dangerous patterns in the codebase
Write-Host "🔍 Scanning codebase for dangerous patterns..." -ForegroundColor Cyan

$dangerousPatterns = @(
    "OR.*branch_id.*IS.*NULL",
    "OR.*cost_center_id.*IS.*NULL", 
    "OR.*warehouse_id.*IS.*NULL",
    "branch_id.*IS.*NULL.*OR",
    "cost_center_id.*IS.*NULL.*OR",
    "warehouse_id.*IS.*NULL.*OR"
)

$foundViolations = $false

foreach ($pattern in $dangerousPatterns) {
    $patternMatches = Select-String -Path "app\**\*.ts", "app\**\*.tsx", "lib\**\*.ts" -Pattern $pattern -ErrorAction SilentlyContinue
    
    if ($patternMatches) {
        if (-not $foundViolations) {
            Write-Host ""
            Write-Host "⚠️  DANGEROUS PATTERNS FOUND:" -ForegroundColor Red
            Write-Host "=============================" -ForegroundColor Red
            $foundViolations = $true
        }
        
        foreach ($match in $patternMatches) {
            Write-Host "❌ $($match.Filename):$($match.LineNumber) - $($match.Line.Trim())" -ForegroundColor Red
        }
    }
}

if ($foundViolations) {
    Write-Host ""
    Write-Host "🚨 CRITICAL: Remove all dangerous patterns above before going live!" -ForegroundColor Red
    Write-Host "These patterns destroy ERP security and auditability." -ForegroundColor Red
} else {
    Write-Host "✅ No dangerous patterns found in codebase!" -ForegroundColor Green
}

Write-Host ""
Write-Host "🏁 Governance fixes application completed!" -ForegroundColor Green
Write-Host "Follow the implementation guide for the remaining steps." -ForegroundColor Gray