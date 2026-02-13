# Deploy PolicyWonk Backend with Multi-Version Tracking
# Run this script after implementing multi-version policy tracking

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Backend Deployment" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if logged into Azure
Write-Host "Checking Azure authentication..." -ForegroundColor Yellow
$account = az account show 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged into Azure. Running 'az login'..." -ForegroundColor Yellow
    az login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to login to Azure. Please ensure Azure CLI is installed." -ForegroundColor Red
        exit 1
    }
}

Write-Host "✓ Azure authentication successful" -ForegroundColor Green
Write-Host ""

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Yellow
Set-Location functions
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Build successful" -ForegroundColor Green
Write-Host ""

# Deploy to Azure
Write-Host "Deploying to Azure Function App: func-pwonk-v2..." -ForegroundColor Yellow
func azure functionapp publish func-pwonk-v2
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "✓ Deployment Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "New endpoints available:" -ForegroundColor Cyan
Write-Host "  - GET  /api/documents/{id}    (Get single document)" -ForegroundColor White
Write-Host "  - POST /api/ingest/url         (Smart ingestion with version detection)" -ForegroundColor White
Write-Host ""
Write-Host "Enhanced features:" -ForegroundColor Cyan
Write-Host "  ✓ Landing page detection (NIST URLs)" -ForegroundColor White
Write-Host "  ✓ PDF download (instead of HTML)" -ForegroundColor White
Write-Host "  ✓ Version parsing (SP 800-53 r5/upd1)" -ForegroundColor White
Write-Host "  ✓ Version chain creation" -ForegroundColor White
Write-Host "  ✓ Multi-format tracking" -ForegroundColor White
Write-Host "  ✓ Deprecation monitoring" -ForegroundColor White
Write-Host ""
Write-Host "Next: Run test-multi-version.ps1 to test the new features!" -ForegroundColor Yellow
