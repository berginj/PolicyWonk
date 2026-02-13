# Test SP 800-88 Rev 1 - Different document to verify URL pattern

Write-Host "Testing URL Pattern Fix with Fresh Document" -ForegroundColor Cyan
Write-Host "Document: SP 800-88 Rev 1 (Media Sanitization)" -ForegroundColor Yellow
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"

$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/88/r1/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body -ContentType "application/json"
    Write-Host "[OK] Ingestion started" -ForegroundColor Green
    Write-Host "Document ID: $($response.documentId)" -ForegroundColor Gray

    Start-Sleep -Seconds 12

    $doc = Invoke-RestMethod -Uri "$baseUrl/documents/$($response.documentId)" -Method GET

    Write-Host ""
    Write-Host "Results:" -ForegroundColor Cyan
    Write-Host "  Content-Type: $($doc.contentType)" -ForegroundColor $(if ($doc.contentType -eq "application/pdf") { "Green" } else { "Yellow" })
    Write-Host "  Landing Page: $($doc.isLandingPage)" -ForegroundColor $(if ($doc.isLandingPage) { "Green" } else { "Yellow" })

    if ($doc.versionInfo) {
        Write-Host "  Version Info: ✅" -ForegroundColor Green
        Write-Host "    Series: $($doc.versionInfo.publicationSeries)" -ForegroundColor Green
        Write-Host "    Revision: $($doc.versionInfo.revision)" -ForegroundColor Green
        Write-Host "    Status: $($doc.versionInfo.status)" -ForegroundColor Green
    } else {
        Write-Host "  Version Info: ❌" -ForegroundColor Red
    }

    if ($doc.formats) {
        $formatList = ($doc.formats.PSObject.Properties.Name | ForEach-Object { $_.ToUpper() }) -join ", "
        Write-Host "  Formats: $formatList" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "View: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$($response.documentId)" -ForegroundColor Cyan

} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
