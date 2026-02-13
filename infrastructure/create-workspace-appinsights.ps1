# Create workspace-based Application Insights
$ErrorActionPreference = "Stop"

$ResourceGroup = "rg-policywonk-prod"
$Location = "westus2"
$AppInsightsName = "appi-pwonk-logs"
$WorkspaceName = "law-pwonk-logs"

Write-Host "`n=== Creating Workspace-Based Application Insights ===" -ForegroundColor Cyan

# 1. Create Log Analytics Workspace first
Write-Host "`n1. Creating Log Analytics Workspace..." -ForegroundColor Yellow
az monitor log-analytics workspace create `
    --resource-group $ResourceGroup `
    --workspace-name $WorkspaceName `
    --location $Location

$workspaceId = az monitor log-analytics workspace show `
    --resource-group $ResourceGroup `
    --workspace-name $WorkspaceName `
    --query customerId -o tsv

Write-Host "✓ Log Analytics Workspace created!" -ForegroundColor Green
Write-Host "  Workspace ID: $workspaceId" -ForegroundColor Gray

# 2. Get workspace resource ID
$workspaceResourceId = az monitor log-analytics workspace show `
    --resource-group $ResourceGroup `
    --workspace-name $WorkspaceName `
    --query id -o tsv

Write-Host "  Workspace Resource ID: $workspaceResourceId" -ForegroundColor Gray

# 3. Create Application Insights linked to workspace
Write-Host "`n2. Creating Application Insights..." -ForegroundColor Yellow
az monitor app-insights component create `
    --app $AppInsightsName `
    --location $Location `
    --resource-group $ResourceGroup `
    --workspace $workspaceResourceId

Write-Host "✓ Application Insights created!" -ForegroundColor Green

# 4. Get connection string
$connectionString = az monitor app-insights component show `
    --app $AppInsightsName `
    --resource-group $ResourceGroup `
    --query connectionString -o tsv

Write-Host "  Connection String: $($connectionString.Substring(0,50))..." -ForegroundColor Gray

# 5. Apply to Function App
Write-Host "`n3. Configuring Function App..." -ForegroundColor Yellow
az functionapp config appsettings set `
    --name func-pwonk-v2 `
    --resource-group rg-pwonk-prod `
    --settings `
        "APPLICATIONINSIGHTS_CONNECTION_STRING=$connectionString" `
        "APPLICATIONINSIGHTS_WORKSPACE_ID=$workspaceId"

Write-Host "✓ Function App configured!" -ForegroundColor Green

# 6. Verify
$verifyWorkspaceId = az functionapp config appsettings list `
    --name func-pwonk-v2 `
    --resource-group rg-pwonk-prod `
    --query "[?name=='APPLICATIONINSIGHTS_WORKSPACE_ID'].value | [0]" -o tsv

Write-Host "`n4. Verification:" -ForegroundColor Yellow
Write-Host "  Expected: $workspaceId" -ForegroundColor Gray
Write-Host "  Got: $verifyWorkspaceId" -ForegroundColor Gray

if ($verifyWorkspaceId -eq $workspaceId) {
    Write-Host "  ✓ Match!" -ForegroundColor Green
} else {
    Write-Host "  ✗ Mismatch!" -ForegroundColor Red
}

# 7. Restart Function App
Write-Host "`n5. Restarting Function App..." -ForegroundColor Yellow
az functionapp restart --name func-pwonk-v2 --resource-group rg-pwonk-prod

Write-Host "Waiting 45 seconds for restart..." -ForegroundColor Yellow
Start-Sleep -Seconds 45

# 8. Test
Write-Host "`n6. Testing logs endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "https://func-pwonk-v2.azurewebsites.net/api/logs" -Method GET
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Try the logs page: https://icy-ocean-0e6729d1e.6.azurestaticapps.net/logs" -ForegroundColor Cyan
Write-Host ""
