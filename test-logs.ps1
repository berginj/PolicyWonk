# Test Logging System
# Verifies that logs are being captured in Application Insights

$ErrorActionPreference = 'Continue'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing PolicyWonk Logging System" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"

# Test 1: Check getLogs endpoint
Write-Host "Test 1: Checking getLogs endpoint..." -ForegroundColor Yellow

try {
    $logsResponse = Invoke-RestMethod -Uri "$baseUrl/logs?take=10" -Method GET -TimeoutSec 15 -ErrorAction Stop

    if ($logsResponse.logs) {
        Write-Host "  [OK] getLogs endpoint responding" -ForegroundColor Green
        Write-Host "  Total logs: $($logsResponse.total)" -ForegroundColor Gray

        if ($logsResponse.total -gt 0) {
            Write-Host ""
            Write-Host "  Recent logs:" -ForegroundColor Cyan
            foreach ($log in $logsResponse.logs | Select-Object -First 5) {
                Write-Host "    [$($log.level)] $($log.message)" -ForegroundColor Gray
                Write-Host "      Time: $($log.timestamp)" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "  [WARN] No logs found - logs may not be configured" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [WARN] Unexpected response format" -ForegroundColor Yellow
        Write-Host "  Response: $($logsResponse | ConvertTo-Json -Depth 2)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [ERROR] Failed to query logs" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  Status Code: $statusCode" -ForegroundColor Red
    }
}

Write-Host ""

# Test 2: Trigger an ingestion to generate logs
Write-Host "Test 2: Triggering ingestion to generate logs..." -ForegroundColor Yellow

try {
    $body = @{
        url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
        docType = "policy"
    } | ConvertTo-Json

    $ingestResponse = Invoke-RestMethod `
        -Uri "$baseUrl/ingest/url" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 30 `
        -ErrorAction Stop

    Write-Host "  [OK] Ingestion triggered" -ForegroundColor Green
    Write-Host "  Document ID: $($ingestResponse.documentId)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Expected logs to be generated:" -ForegroundColor Cyan
    Write-Host "    - 'ingestUrl called - authentication bypassed for testing'" -ForegroundColor Gray
    Write-Host "    - 'URL ingestion requested'" -ForegroundColor Gray
    Write-Host "    - 'Landing page detected' (if landing page)" -ForegroundColor Gray
    Write-Host "    - 'Downloaded document from landing page'" -ForegroundColor Gray
    Write-Host "    - 'Document ingestion initiated'" -ForegroundColor Gray

} catch {
    Write-Host "  [WARN] Ingestion failed" -ForegroundColor Yellow
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Wait and check for new logs
Write-Host "Test 3: Waiting 10 seconds then checking for new logs..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

try {
    $newLogsResponse = Invoke-RestMethod -Uri "$baseUrl/logs?take=10" -Method GET -TimeoutSec 15 -ErrorAction Stop

    if ($newLogsResponse.logs -and $newLogsResponse.total -gt 0) {
        Write-Host "  [OK] Found $($newLogsResponse.total) logs" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Most recent logs:" -ForegroundColor Cyan
        foreach ($log in $newLogsResponse.logs | Select-Object -First 10) {
            $color = switch ($log.level) {
                "ERROR" { "Red" }
                "WARN" { "Yellow" }
                "INFO" { "Gray" }
                default { "Gray" }
            }
            Write-Host "    [$($log.level)] $($log.message)" -ForegroundColor $color
            Write-Host "      Time: $($log.timestamp)" -ForegroundColor DarkGray
            if ($log.data) {
                Write-Host "      Data: $($log.data | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "  [WARN] Still no logs found" -ForegroundColor Yellow
        Write-Host "  Message: $($newLogsResponse.message)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [ERROR] Failed to query logs" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Logging Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Provide recommendations
Write-Host "If no logs are showing:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Check if APPLICATIONINSIGHTS_WORKSPACE_ID is configured:" -ForegroundColor White
Write-Host "   az functionapp config appsettings list --name func-pwonk-v2 --resource-group rg-pwonk" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Check Application Insights connection:" -ForegroundColor White
Write-Host "   - Go to Azure Portal → Function App → Application Insights" -ForegroundColor Gray
Write-Host "   - Verify Application Insights is connected" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check logs in Azure Portal directly:" -ForegroundColor White
Write-Host "   - Function App → Logs → Query 'traces'" -ForegroundColor Gray
Write-Host "   - Application Insights → Logs → Query 'traces | take 100'" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Disable sampling to capture all logs:" -ForegroundColor White
Write-Host "   - Edit functions/host.json" -ForegroundColor Gray
Write-Host "   - Set 'samplingSettings.isEnabled' to false" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Check if logs are using console output:" -ForegroundColor White
Write-Host "   - All logging goes through console.log/error/warn" -ForegroundColor Gray
Write-Host "   - Azure Functions automatically captures console output" -ForegroundColor Gray
Write-Host ""
