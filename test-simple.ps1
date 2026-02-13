# Simple Multi-Version Test

Write-Host "Testing Multi-Version Policy Tracking" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"

# Test 1: Ingest NIST SP 800-53 Rev 5 Update 1
Write-Host "Test 1: Ingesting NIST SP 800-53 Rev 5 Update 1" -ForegroundColor Yellow
$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body -ContentType "application/json"
    Write-Host "[OK] Success!" -ForegroundColor Green
    Write-Host "Document ID: $($response.documentId)"
    Write-Host "Title: $($response.title)"
    Write-Host "Status: $($response.status)"
    Write-Host ""

    $docId = $response.documentId

    # Wait for processing
    Write-Host "Waiting 10 seconds for processing..."
    Start-Sleep -Seconds 10

    # Get document details
    Write-Host "Fetching document details..." -ForegroundColor Yellow
    try {
        $doc = Invoke-RestMethod -Uri "$baseUrl/documents/$docId" -Method GET
        Write-Host "[OK] Document retrieved!" -ForegroundColor Green
        Write-Host "Content Type: $($doc.contentType)"
        if ($doc.isLandingPage) {
            Write-Host "[OK] Detected as landing page" -ForegroundColor Green
        }
        if ($doc.versionInfo) {
            Write-Host "[OK] Version Info extracted:" -ForegroundColor Green
            Write-Host "  Series: $($doc.versionInfo.publicationSeries)"
            Write-Host "  Revision: $($doc.versionInfo.revision)"
            Write-Host "  Update: $($doc.versionInfo.update)"
            Write-Host "  Status: $($doc.versionInfo.status)"
        }
        if ($doc.formats) {
            Write-Host "[OK] Available Formats:" -ForegroundColor Green
            $doc.formats.PSObject.Properties | ForEach-Object {
                Write-Host "  - $($_.Name.ToUpper())"
            }
        }
        Write-Host ""
        Write-Host "View in UI: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$docId" -ForegroundColor Cyan
    } catch {
        Write-Host "[ERROR] Failed to get document: $($_.Exception.Message)" -ForegroundColor Red
    }

} catch {
    Write-Host "[ERROR] Ingestion failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Test Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
