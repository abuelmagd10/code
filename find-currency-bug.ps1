# Find all files that select from companies table with currency field
Get-ChildItem -Path "." -Include "*.tsx","*.ts" -Recurse -Exclude "node_modules","*.next",".git" | 
ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match 'from\(["\']companies["\']\)' -and $content -match 'currency[^_]') {
        Write-Host "Found in: $($_.FullName)"
        Select-String -Path $_.FullName -Pattern 'from\(["\']companies["\']\)|\.select\(' -Context 2,2
        Write-Host "---"
    }
}

