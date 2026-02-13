# Test Multi-Version Policy Tracking
# Tests the new version detection and tracking features

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Multi-Version Policy Tracking Tests" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"
$webappUrl = "https://proud-sand-06951430f.6.azurestaticapps.net"

# Test 1: Ingest NIST SP 800-53 Rev 5 Update 1 (Landing Page)
Write-Host "Test 1: Ingesting NIST SP 800-53 Rev 5 Update 1" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final" -ForegroundColor Gray
Write-Host ""

$body = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
    docType = "policy"
} | ConvertTo-Json

Write-Host "Sending request..." -ForegroundColor Gray
try {
    $response1 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body -ContentType "application/json"
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Document ID: $($response1.documentId)" -ForegroundColor Cyan
    Write-Host "Title: $($response1.title)" -ForegroundColor Cyan
    Write-Host "Status: $($response1.status)" -ForegroundColor Cyan
    Write-Host "Message: $($response1.message)" -ForegroundColor Cyan

    $docId1 = $response1.documentId

    Write-Host ""
    Write-Host "Expected behavior:" -ForegroundColor Yellow
    Write-Host "  ✓ Detected as landing page" -ForegroundColor White
    Write-Host "  ✓ Downloaded PDF instead of HTML" -ForegroundColor White
    Write-Host "  ✓ Extracted version: SP 800-53, Rev 5, Update 1" -ForegroundColor White
    Write-Host "  ✓ Status: final" -ForegroundColor White
    Write-Host ""

    # Wait for processing
    Write-Host "Waiting 10 seconds for AI processing..." -ForegroundColor Gray
    Start-Sleep -Seconds 10

    # Get document details
    Write-Host "Fetching document details..." -ForegroundColor Gray
    $doc1 = Invoke-RestMethod -Uri "$baseUrl/documents/$docId1" -Method GET

    Write-Host ""
    Write-Host "Document Details:" -ForegroundColor Cyan
    Write-Host "  Title: $($doc1.title)" -ForegroundColor White
    Write-Host "  Content Type: $($doc1.contentType)" -ForegroundColor White
    if ($doc1.isLandingPage) {
        Write-Host "  ✓ Detected as landing page" -ForegroundColor Green
    }
    if ($doc1.versionInfo) {
        Write-Host "  Version Info:" -ForegroundColor White
        Write-Host "    Series: $($doc1.versionInfo.publicationSeries)" -ForegroundColor White
        Write-Host "    Revision: $($doc1.versionInfo.revision)" -ForegroundColor White
        Write-Host "    Update: $($doc1.versionInfo.update)" -ForegroundColor White
        Write-Host "    Status: $($doc1.versionInfo.status)" -ForegroundColor White
    }
    if ($doc1.formats) {
        Write-Host "  Available Formats:" -ForegroundColor White
        foreach ($format in $doc1.formats.PSObject.Properties) {
            Write-Host "    - $($format.Name.ToUpper()): $($format.Value.url)" -ForegroundColor White
        }
    }

    Write-Host ""
    Write-Host "View in UI: $webappUrl/policies/$docId1" -ForegroundColor Cyan
    Write-Host ""

} catch {
    Write-Host "✗ Failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Test 2: Ingest older version to test version chaining
Write-Host "Test 2: Ingesting NIST SP 800-53 Rev 4 Update 4 (Older Version)" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/53/r4/upd4/final" -ForegroundColor Gray
Write-Host ""

$body2 = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r4/upd4/final"
    docType = "policy"
} | ConvertTo-Json

Write-Host "Sending request..." -ForegroundColor Gray
try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body2 -ContentType "application/json"
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Document ID: $($response2.documentId)" -ForegroundColor Cyan

    $docId2 = $response2.documentId

    Write-Host ""
    Write-Host "Expected behavior:" -ForegroundColor Yellow
    Write-Host "  ✓ Detected as landing page" -ForegroundColor White
    Write-Host "  ✓ Extracted version: SP 800-53, Rev 4, Update 4" -ForegroundColor White
    Write-Host "  ✓ Created version chain: Rev 4 → Rev 5" -ForegroundColor White
    Write-Host ""

    Write-Host "View in UI: $webappUrl/policies/$docId2" -ForegroundColor Cyan
    Write-Host ""

} catch {
    Write-Host "✗ Failed (might not exist on NIST website)" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Gray
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Test 3: Test the new GET endpoint
Write-Host "Test 3: Testing GET /api/documents/{id} endpoint" -ForegroundColor Yellow
Write-Host ""

if ($docId1) {
    try {
        $getDoc = Invoke-RestMethod -Uri "$baseUrl/documents/$docId1" -Method GET
        Write-Host "✓ GET endpoint working!" -ForegroundColor Green
        Write-Host "Retrieved: $($getDoc.title)" -ForegroundColor Cyan
        Write-Host ""
    } catch {
        Write-Host "✗ GET endpoint failed!" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

Write-Host "================================================" -ForegroundColor Green
Write-Host "Testing Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary of New Features:" -ForegroundColor Cyan
Write-Host "  ✓ Smart landing page detection" -ForegroundColor White
Write-Host "  ✓ PDF download (not HTML)" -ForegroundColor White
Write-Host "  ✓ Version parsing from URLs" -ForegroundColor White
Write-Host "  ✓ Multi-format tracking" -ForegroundColor White
Write-Host "  ✓ Version chain creation" -ForegroundColor White
Write-Host "  ✓ GET /api/documents/{id} endpoint" -ForegroundColor White
Write-Host ""
Write-Host "Frontend Features:" -ForegroundColor Cyan
Write-Host "  ✓ Version information card" -ForegroundColor White
Write-Host "  ✓ Format download buttons" -ForegroundColor White
Write-Host "  ✓ Version timeline" -ForegroundColor White
Write-Host "  ✓ Deprecation banners" -ForegroundColor White
Write-Host ""
Write-Host "Visit the web app to see the new UI: $webappUrl" -ForegroundColor Yellow
