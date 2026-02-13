# Debug Logs Configuration
Write-Host "`n=== Debugging Logs Configuration ===" -ForegroundColor Cyan

# 1. Check if workspace ID is set
Write-Host "`n1. Checking Function App settings..." -ForegroundColor Yellow
$workspaceIdSetting = az functionapp config appsettings list --name func-pwonk-v2 --resource-group rg-pwonk-prod --query "[?name=='APPLICATIONINSIGHTS_WORKSPACE_ID'].value | [0]" -o tsv
$connectionStringSetting = az functionapp config appsettings list --name func-pwonk-v2 --resource-group rg-pwonk-prod --query "[?name=='APPLICATIONINSIGHTS_CONNECTION_STRING'].value | [0]" -o tsv

if ($workspaceIdSetting) {
    Write-Host "✓ APPLICATIONINSIGHTS_WORKSPACE_ID is set: $workspaceIdSetting" -ForegroundColor Green
} else {
    Write-Host "✗ APPLICATIONINSIGHTS_WORKSPACE_ID is NOT set!" -ForegroundColor Red
}

if ($connectionStringSetting) {
    Write-Host "✓ APPLICATIONINSIGHTS_CONNECTION_STRING is set" -ForegroundColor Green
} else {
    Write-Host "✗ APPLICATIONINSIGHTS_CONNECTION_STRING is NOT set!" -ForegroundColor Red
}

# 2. Test the logs endpoint directly
Write-Host "`n2. Testing logs endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "https://func-pwonk-v2.azurewebsites.net/api/logs" -Method GET -ErrorAction Stop
    Write-Host "✓ Logs endpoint responded successfully!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Logs endpoint failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Yellow
    }
}

# 3. List all App Insights resources
Write-Host "`n3. Checking for Application Insights resources..." -ForegroundColor Yellow
$appInsightsList = az resource list --resource-type "Microsoft.Insights/components" | ConvertFrom-Json

if ($appInsightsList.Count -eq 0) {
    Write-Host "✗ No Application Insights resources found!" -ForegroundColor Red
    Write-Host "  You need to create one first." -ForegroundColor Yellow
} else {
    Write-Host "✓ Found $($appInsightsList.Count) Application Insights resource(s):" -ForegroundColor Green
    foreach ($ai in $appInsightsList) {
        Write-Host "  - $($ai.name) in $($ai.resourceGroup)" -ForegroundColor Gray
    }
}

Write-Host "`n=== End Debug ===" -ForegroundColor Cyan
Write-Host ""
