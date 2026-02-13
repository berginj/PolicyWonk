# Grant Function App access to Log Analytics Workspace
$ErrorActionPreference = "Stop"

Write-Host "`n=== Granting Log Analytics Access ===" -ForegroundColor Cyan

# Get Function App principal ID
Write-Host "`n1. Getting Function App managed identity..." -ForegroundColor Yellow
$principalId = az functionapp identity show --name func-pwonk-v2 --resource-group rg-pwonk-prod --query principalId -o tsv
Write-Host "Principal ID: $principalId" -ForegroundColor Gray

# Get Log Analytics Workspace ID
Write-Host "`n2. Getting Log Analytics Workspace..." -ForegroundColor Yellow
$workspaceName = "law-pwonk-logs"
$resourceGroup = "rg-policywonk-prod"
$workspaceId = az monitor log-analytics workspace show --resource-group $resourceGroup --workspace-name $workspaceName --query id -o tsv
Write-Host "Workspace: $workspaceName" -ForegroundColor Gray
Write-Host "Workspace Resource ID: $workspaceId" -ForegroundColor Gray

# Grant Log Analytics Reader role
Write-Host "`n3. Granting Log Analytics Reader role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Log Analytics Reader" `
    --scope $workspaceId

Write-Host "✓ Log Analytics Reader role granted!" -ForegroundColor Green

# Also grant Monitoring Reader (broader access)
Write-Host "`n4. Granting Monitoring Reader role..." -ForegroundColor Yellow
az role assignment create `
    --assignee $principalId `
    --role "Monitoring Reader" `
    --scope $workspaceId

Write-Host "✓ Monitoring Reader role granted!" -ForegroundColor Green

# Wait for permissions to propagate
Write-Host "`n5. Waiting 60 seconds for permissions to propagate..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# Test the logs endpoint
Write-Host "`n6. Testing logs endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "https://func-pwonk-v2.azurewebsites.net/api/logs?take=10" -Method GET
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Found $($response.logs.Count) logs" -ForegroundColor Gray

    if ($response.logs.Count -gt 0) {
        Write-Host "`nSample log entry:" -ForegroundColor Cyan
        $response.logs[0] | ConvertTo-Json -Depth 2
    }
} catch {
    Write-Host "✗ Still failing!" -ForegroundColor Red

    # Get more details
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    Write-Host "Error response: $responseBody" -ForegroundColor Yellow
}

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Try the logs page: https://icy-ocean-0e6729d1e.6.azurestaticapps.net/logs" -ForegroundColor Cyan
Write-Host ""
