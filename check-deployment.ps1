# Check Deployment Status
# Verifies that the multi-version tracking features are deployed

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Checking PolicyWonk Deployment Status" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$functionAppUrl = "https://func-pwonk-v2.azurewebsites.net"
$webappUrl = "https://proud-sand-06951430f.6.azurestaticapps.net"

# Check Function App Health
Write-Host "Checking Function App..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$functionAppUrl/api/health" -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Function App is running" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Function App may not be deployed yet" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Message)" -ForegroundColor Gray
}
Write-Host ""

# Check if new GET endpoint exists
Write-Host "Checking new GET /api/documents endpoint..." -ForegroundColor Yellow
try {
    # Try to get a document (will 404 but that's ok - we just need to see if endpoint exists)
    $response = Invoke-WebRequest -Uri "$functionAppUrl/api/documents/test-id" -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Host "✓ GET /api/documents/:id endpoint exists!" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode.Value__ -eq 404) {
        Write-Host "✓ GET /api/documents/:id endpoint exists (404 is expected for test ID)" -ForegroundColor Green
    } else {
        Write-Host "✗ GET /api/documents/:id endpoint not found yet" -ForegroundColor Yellow
        Write-Host "  Deployment may still be in progress..." -ForegroundColor Gray
    }
}
Write-Host ""

# Check GitHub Actions status
Write-Host "Checking GitHub Actions deployment status..." -ForegroundColor Yellow
Write-Host "Visit: https://github.com/berginj/PolicyWonk/actions" -ForegroundColor Cyan
Write-Host ""

Write-Host "Recent commits with function changes:" -ForegroundColor Yellow
git log --oneline --grep="multi-version" -5 | ForEach-Object {
    Write-Host "  $_" -ForegroundColor White
}
Write-Host ""

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Deployment Options:" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Auto-Deploy (Recommended):" -ForegroundColor Yellow
Write-Host "   GitHub Actions automatically deploys on push to main" -ForegroundColor White
Write-Host "   Check status: https://github.com/berginj/PolicyWonk/actions" -ForegroundColor White
Write-Host ""
Write-Host "2. Manual Trigger:" -ForegroundColor Yellow
Write-Host "   a) Go to: https://github.com/berginj/PolicyWonk/actions/workflows/deploy-functions.yml" -ForegroundColor White
Write-Host "   b) Click 'Run workflow' button" -ForegroundColor White
Write-Host "   c) Select 'main' branch" -ForegroundColor White
Write-Host "   d) Click 'Run workflow'" -ForegroundColor White
Write-Host ""
Write-Host "3. Local Deploy:" -ForegroundColor Yellow
Write-Host "   Run from functions directory:" -ForegroundColor White
Write-Host "   func azure functionapp publish func-pwonk-v2 --typescript" -ForegroundColor Gray
Write-Host ""

Write-Host "================================================" -ForegroundColor Green
Write-Host "Next Steps:" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Wait 2-3 minutes for GitHub Actions deployment" -ForegroundColor White
Write-Host "2. Run: .\test-multi-version.ps1" -ForegroundColor White
Write-Host "3. View results in web app: $webappUrl" -ForegroundColor White
