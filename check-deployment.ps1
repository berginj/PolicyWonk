# Check Deployment Status

Write-Host "================================================"
Write-Host "Checking PolicyWonk Deployment Status"
Write-Host "================================================"
Write-Host ""

$functionAppUrl = "https://func-pwonk-v2.azurewebsites.net"

# Check Function App Health
Write-Host "Checking Function App..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$functionAppUrl/api/health" -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Function App is running" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN] Function App may not be responding" -ForegroundColor Red
}
Write-Host ""

# Check new GET endpoint
Write-Host "Checking new GET /api/documents endpoint..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "$functionAppUrl/api/documents/test-id" -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
} catch {
    if ($_.Exception.Response.StatusCode.Value__ -eq 404) {
        Write-Host "[OK] Endpoint exists! (404 expected for test ID)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Endpoint not found - deployment may be in progress" -ForegroundColor Yellow
    }
}
Write-Host ""

Write-Host "================================================"
Write-Host "Deployment Options:"
Write-Host "================================================"
Write-Host ""
Write-Host "1. Check GitHub Actions (Recommended):" -ForegroundColor Yellow
Write-Host "   https://github.com/berginj/PolicyWonk/actions"
Write-Host ""
Write-Host "2. Manual Trigger:" -ForegroundColor Yellow
Write-Host "   Go to: https://github.com/berginj/PolicyWonk/actions/workflows/deploy-functions.yml"
Write-Host "   Click 'Run workflow' -> Select 'main' -> Click 'Run workflow'"
Write-Host ""
Write-Host "3. Recent commits with function changes:" -ForegroundColor Yellow
git log --oneline -10 | Select-String "functions|multi-version" | ForEach-Object {
    Write-Host "   $_"
}
Write-Host ""
Write-Host "================================================"
Write-Host "Next Steps:"
Write-Host "================================================"
Write-Host ""
Write-Host "1. Wait 2-3 minutes for GitHub Actions deployment"
Write-Host "2. Run: .\test-multi-version.ps1"
Write-Host "3. View: https://proud-sand-06951430f.6.azurestaticapps.net"
