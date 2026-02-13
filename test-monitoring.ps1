# Test Deprecation Monitoring Service
# Tests the monitoring service's ability to detect withdrawn/superseded documents

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Deprecation Monitoring Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"

# Test with the withdrawn SP 800-53 Rev 5 (base, no update)
Write-Host "Testing with withdrawn document: SP 800-53 Rev 5" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/53/r5/final" -ForegroundColor Gray
Write-Host "Expected: Page shows '(Withdrawn)' status" -ForegroundColor Gray
Write-Host ""

# First, check if we already have this document
$withdrawnUrl = "https://csrc.nist.gov/pubs/sp/800/53/r5/final"

Write-Host "Step 1: Checking if document already exists..." -ForegroundColor Yellow

# Try to ingest (will fail or return existing)
$body = @{
    url = $withdrawnUrl
    docType = "policy"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    $docId = $response.documentId

    Write-Host "[OK] Document ID: $docId" -ForegroundColor Green
    Write-Host ""

    # Wait a bit for ingestion
    Start-Sleep -Seconds 10

    # Get document details
    Write-Host "Step 2: Fetching document details..." -ForegroundColor Yellow
    $doc = Invoke-RestMethod -Uri "$baseUrl/documents/$docId" -Method GET -ErrorAction Stop

    Write-Host "[OK] Document retrieved" -ForegroundColor Green
    Write-Host ""

    # Display current status
    Write-Host "Current Document Status:" -ForegroundColor Cyan
    Write-Host "  Document ID: $docId" -ForegroundColor Gray
    Write-Host "  Title: $($doc.title)" -ForegroundColor Gray
    Write-Host "  Content-Type: $($doc.contentType)" -ForegroundColor Gray
    Write-Host "  Status: $($doc.status)" -ForegroundColor Gray

    if ($doc.versionInfo) {
        Write-Host "  Version Status: $($doc.versionInfo.status)" -ForegroundColor $(if ($doc.versionInfo.status -eq "withdrawn") { "Red" } else { "Yellow" })
    } else {
        Write-Host "  Version Status: Not set" -ForegroundColor Yellow
    }

    Write-Host ""

    # Check the actual landing page for withdrawal notice
    Write-Host "Step 3: Checking landing page for withdrawal notice..." -ForegroundColor Yellow

    $htmlContent = Invoke-WebRequest -Uri $withdrawnUrl -UseBasicParsing
    $htmlText = $htmlContent.Content

    $isWithdrawn = $htmlText -match "withdrawn" -or $htmlText -match "Withdrawn"

    if ($isWithdrawn) {
        Write-Host "[OK] Withdrawal notice detected on landing page" -ForegroundColor Green

        # Show snippets
        $withdrawnMatches = [regex]::Matches($htmlText, ".{0,100}withdrawn.{0,100}", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($withdrawnMatches.Count -gt 0) {
            Write-Host ""
            Write-Host "  Sample text from page:" -ForegroundColor Gray
            Write-Host "  `"$($withdrawnMatches[0].Value.Trim())`"" -ForegroundColor Gray
        }
    } else {
        Write-Host "[WARN] No withdrawal notice found" -ForegroundColor Yellow
    }

    Write-Host ""

    # Explain monitoring behavior
    Write-Host "Step 4: Monitoring Configuration" -ForegroundColor Yellow

    if ($doc.monitoringConfig) {
        Write-Host "[OK] Monitoring is enabled" -ForegroundColor Green
        Write-Host "  Cadence: $($doc.monitoringConfig.cadence)" -ForegroundColor Gray
        Write-Host "  Next Check: $($doc.monitoringConfig.nextCheckAt)" -ForegroundColor Gray
    } else {
        Write-Host "[INFO] Monitoring not configured" -ForegroundColor Yellow
    }

    Write-Host ""

    # Summary
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "Summary" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""

    if ($isWithdrawn -and $doc.versionInfo -and $doc.versionInfo.status -eq "withdrawn") {
        Write-Host "[OK] Document correctly marked as WITHDRAWN" -ForegroundColor Green
        Write-Host ""
        Write-Host "The monitoring service successfully detected the withdrawal notice" -ForegroundColor Green
        Write-Host "and updated the document status." -ForegroundColor Green
    }
    elseif ($isWithdrawn -and (!$doc.versionInfo -or $doc.versionInfo.status -ne "withdrawn")) {
        Write-Host "[INFO] Withdrawal detected but not yet reflected in document status" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "The monitoring service will detect this on its next run." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To manually trigger monitoring (if monitoring service is running):" -ForegroundColor Cyan
        Write-Host "  - Wait for next scheduled check (see 'Next Check' above)" -ForegroundColor Gray
        Write-Host "  - Or trigger monitoring manually via API (if endpoint exists)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Expected behavior:" -ForegroundColor Cyan
        Write-Host "  1. Monitoring service fetches landing page" -ForegroundColor Gray
        Write-Host "  2. Detects 'withdrawn' keyword" -ForegroundColor Gray
        Write-Host "  3. Updates versionInfo.status to 'withdrawn'" -ForegroundColor Gray
        Write-Host "  4. Sets versionInfo.supersededDate" -ForegroundColor Gray
        Write-Host "  5. Creates deprecation alert (if configured)" -ForegroundColor Gray
    }
    else {
        Write-Host "[INFO] Document is not withdrawn" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "View in UI: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$docId" -ForegroundColor Cyan

} catch {
    Write-Host "[ERROR] Test failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "Monitoring Test Complete" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Note: The monitoring service runs on a schedule (daily cadence)." -ForegroundColor Cyan
Write-Host "Deprecation status updates will appear after the next monitoring run." -ForegroundColor Cyan
