# Final Verification - Test SP 800-53A URL Pattern Fix

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Final Verification: SP 800-53A URL Pattern" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"

Write-Host "Testing URL pattern fix for suffixed publications..." -ForegroundColor Yellow
Write-Host "Document: SP 800-53A Rev 5 (Assessment Procedures)" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/53/a/r5/final" -ForegroundColor Gray
Write-Host "Expected: Version info should extract 'SP 800-53A Rev 5'" -ForegroundColor Gray
Write-Host ""

$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/a/r5/final"
    docType = "policy"
} | ConvertTo-Json

try {
    Write-Host "Step 1: Ingesting document..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    $docId = $response.documentId

    Write-Host "[OK] Document ingested successfully" -ForegroundColor Green
    Write-Host "    Document ID: $docId" -ForegroundColor Gray
    Write-Host ""

    Write-Host "Step 2: Waiting for processing (12 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 12

    Write-Host "Step 3: Fetching document details..." -ForegroundColor Yellow
    $doc = Invoke-RestMethod -Uri "$baseUrl/documents/$docId" -Method GET -ErrorAction Stop

    Write-Host "[OK] Document retrieved" -ForegroundColor Green
    Write-Host ""

    # Display results
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "Results" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "Content Type: $($doc.contentType)" -ForegroundColor $(if ($doc.contentType -eq "application/pdf") { "Green" } else { "Red" })
    Write-Host "Landing Page: $($doc.isLandingPage)" -ForegroundColor $(if ($doc.isLandingPage) { "Green" } else { "Red" })

    if ($doc.versionInfo) {
        Write-Host ""
        Write-Host "[OK] VERSION INFO EXTRACTED!" -ForegroundColor Green
        Write-Host "    Publication Series: $($doc.versionInfo.publicationSeries)" -ForegroundColor Green
        Write-Host "    Revision: $($doc.versionInfo.revision)" -ForegroundColor Green
        Write-Host "    Update: $($doc.versionInfo.update)" -ForegroundColor Green
        Write-Host "    Status: $($doc.versionInfo.status)" -ForegroundColor Green

        # Verify it captured the 'A' suffix
        if ($doc.versionInfo.publicationSeries -eq "SP 800-53A") {
            Write-Host ""
            Write-Host "[SUCCESS] URL pattern fix verified! ✅" -ForegroundColor Green
            Write-Host "The 'A' suffix was correctly captured." -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "[WARN] Expected 'SP 800-53A' but got '$($doc.versionInfo.publicationSeries)'" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "[FAIL] No version info extracted" -ForegroundColor Red
        Write-Host "URL pattern may not be matching correctly." -ForegroundColor Red
    }

    if ($doc.formats) {
        Write-Host ""
        Write-Host "Available Formats:" -ForegroundColor Green
        $doc.formats.PSObject.Properties.Name | ForEach-Object {
            Write-Host "  - $($_.ToUpper())" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "View in UI:" -ForegroundColor Cyan
    Write-Host "  https://proud-sand-06951430f.6.azurestaticapps.net/policies/$docId" -ForegroundColor Cyan

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "Verification Complete!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] Test failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    }
}
