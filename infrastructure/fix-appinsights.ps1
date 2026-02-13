# Fix Application Insights Configuration
$ErrorActionPreference = "Stop"

Write-Host "`n=== Fixing Application Insights Configuration ===" -ForegroundColor Cyan

# 1. Find Application Insights
Write-Host "`nFinding Application Insights..." -ForegroundColor Yellow
$appInsights = az resource list --resource-type "Microsoft.Insights/components" --query "[0]" | ConvertFrom-Json

if (-not $appInsights) {
    Write-Host "No Application Insights found. Creating one..." -ForegroundColor Yellow

    $appInsightsName = "appi-pwonk-prod"
    $resourceGroup = "rg-policywonk-prod"

    az monitor app-insights component create `
        --app $appInsightsName `
        --location "westus2" `
        --resource-group $resourceGroup `
        --kind web `
        --application-type web

    $appInsights = az resource list --resource-type "Microsoft.Insights/components" --query "[0]" | ConvertFrom-Json
}

$appInsightsName = $appInsights.name
$appInsightsRg = $appInsights.resourceGroup

Write-Host "Found: $appInsightsName in $appInsightsRg" -ForegroundColor Green

# 2. Get Connection String and Workspace ID
Write-Host "`nGetting Application Insights details..." -ForegroundColor Yellow
$connectionString = az monitor app-insights component show --app $appInsightsName --resource-group $appInsightsRg --query connectionString -o tsv
$workspaceId = az monitor app-insights component show --app $appInsightsName --resource-group $appInsightsRg --query customerId -o tsv

Write-Host "Connection String: $($connectionString.Substring(0, 50))..." -ForegroundColor Gray
Write-Host "Workspace ID: $workspaceId" -ForegroundColor Gray

# 3. Apply to Function App
Write-Host "`nApplying settings to Function App..." -ForegroundColor Yellow
az functionapp config appsettings set `
    --name func-pwonk-v2 `
    --resource-group rg-pwonk-prod `
    --settings `
        "APPLICATIONINSIGHTS_CONNECTION_STRING=$connectionString" `
        "APPLICATIONINSIGHTS_WORKSPACE_ID=$workspaceId"

Write-Host "✓ Settings applied!" -ForegroundColor Green

# 4. Verify settings were applied
Write-Host "`nVerifying settings..." -ForegroundColor Yellow
$verifyWorkspaceId = az functionapp config appsettings list --name func-pwonk-v2 --resource-group rg-pwonk-prod --query "[?name=='APPLICATIONINSIGHTS_WORKSPACE_ID'].value | [0]" -o tsv

if ($verifyWorkspaceId -eq $workspaceId) {
    Write-Host "✓ APPLICATIONINSIGHTS_WORKSPACE_ID verified: $verifyWorkspaceId" -ForegroundColor Green
} else {
    Write-Host "✗ Workspace ID mismatch!" -ForegroundColor Red
    Write-Host "  Expected: $workspaceId" -ForegroundColor Yellow
    Write-Host "  Got: $verifyWorkspaceId" -ForegroundColor Yellow
}

# 5. Restart Function App
Write-Host "`nRestarting Function App..." -ForegroundColor Yellow
az functionapp restart --name func-pwonk-v2 --resource-group rg-pwonk-prod

Write-Host "`nWaiting 45 seconds for Function App to restart..." -ForegroundColor Yellow
Start-Sleep -Seconds 45

Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
Write-Host "Application Insights is now configured!" -ForegroundColor Green
Write-Host "`nTest the logs page:" -ForegroundColor Cyan
Write-Host "https://icy-ocean-0e6729d1e.6.azurestaticapps.net/logs" -ForegroundColor Cyan
Write-Host ""
