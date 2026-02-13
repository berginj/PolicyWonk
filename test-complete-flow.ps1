# Complete Multi-Version Flow Test
# Tests: Landing page detection, PDF download, version extraction, format tracking, version chains

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Complete Multi-Version Tracking Flow Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"
$results = @()

# Test 1: SP 800-53A Rev 5 (Assessment Procedures)
Write-Host "Test 1: SP 800-53A Rev 5 (Assessment Procedures)" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/53/a/r5/final" -ForegroundColor Gray

$body1 = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/a/r5/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response1 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body1 -ContentType "application/json" -ErrorAction Stop
    Write-Host "[OK] Ingestion successful" -ForegroundColor Green
    Write-Host "    Document ID: $($response1.documentId)" -ForegroundColor Gray

    Start-Sleep -Seconds 12

    $doc1 = Invoke-RestMethod -Uri "$baseUrl/documents/$($response1.documentId)" -Method GET -ErrorAction Stop

    $result1 = @{
        Name = "SP 800-53A Rev 5"
        DocumentId = $response1.documentId
        ContentType = $doc1.contentType
        IsLandingPage = $doc1.isLandingPage
        VersionInfo = $doc1.versionInfo
        Formats = $doc1.formats
        Status = if ($doc1.contentType -eq "application/pdf") { "PASS" } else { "FAIL" }
    }

    Write-Host "    Content-Type: $($doc1.contentType)" -ForegroundColor $(if ($doc1.contentType -eq "application/pdf") { "Green" } else { "Red" })
    Write-Host "    Landing Page: $($doc1.isLandingPage)" -ForegroundColor $(if ($doc1.isLandingPage) { "Green" } else { "Red" })

    if ($doc1.versionInfo) {
        Write-Host "    Version: $($doc1.versionInfo.publicationSeries) Rev $($doc1.versionInfo.revision)" -ForegroundColor Green
        Write-Host "    Status: $($doc1.versionInfo.status)" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] No version info extracted" -ForegroundColor Yellow
    }

    if ($doc1.formats) {
        $formatList = ($doc1.formats.PSObject.Properties.Name | ForEach-Object { $_.ToUpper() }) -join ", "
        Write-Host "    Formats: $formatList" -ForegroundColor Green
    }

    $results += $result1
    Write-Host ""

} catch {
    Write-Host "[ERROR] Test 1 failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: SP 800-171 Rev 3 (Protecting CUI)
Write-Host "Test 2: SP 800-171 Rev 3 (Protecting CUI)" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/171/r3/final" -ForegroundColor Gray

$body2 = @{
    url = "https://csrc.nist.gov/pubs/sp/800/171/r3/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body2 -ContentType "application/json" -ErrorAction Stop
    Write-Host "[OK] Ingestion successful" -ForegroundColor Green
    Write-Host "    Document ID: $($response2.documentId)" -ForegroundColor Gray

    Start-Sleep -Seconds 12

    $doc2 = Invoke-RestMethod -Uri "$baseUrl/documents/$($response2.documentId)" -Method GET -ErrorAction Stop

    $result2 = @{
        Name = "SP 800-171 Rev 3"
        DocumentId = $response2.documentId
        ContentType = $doc2.contentType
        IsLandingPage = $doc2.isLandingPage
        VersionInfo = $doc2.versionInfo
        Formats = $doc2.formats
        Status = if ($doc2.contentType -eq "application/pdf") { "PASS" } else { "FAIL" }
    }

    Write-Host "    Content-Type: $($doc2.contentType)" -ForegroundColor $(if ($doc2.contentType -eq "application/pdf") { "Green" } else { "Red" })
    Write-Host "    Landing Page: $($doc2.isLandingPage)" -ForegroundColor $(if ($doc2.isLandingPage) { "Green" } else { "Red" })

    if ($doc2.versionInfo) {
        Write-Host "    Version: $($doc2.versionInfo.publicationSeries) Rev $($doc2.versionInfo.revision)" -ForegroundColor Green
        Write-Host "    Status: $($doc2.versionInfo.status)" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] No version info extracted" -ForegroundColor Yellow
    }

    if ($doc2.formats) {
        $formatList = ($doc2.formats.PSObject.Properties.Name | ForEach-Object { $_.ToUpper() }) -join ", "
        Write-Host "    Formats: $formatList" -ForegroundColor Green
    }

    $results += $result2
    Write-Host ""

} catch {
    Write-Host "[ERROR] Test 2 failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: SP 800-37 Rev 2 (Risk Management Framework)
Write-Host "Test 3: SP 800-37 Rev 2 (Risk Management Framework)" -ForegroundColor Yellow
Write-Host "URL: https://csrc.nist.gov/pubs/sp/800/37/r2/final" -ForegroundColor Gray

$body3 = @{
    url = "https://csrc.nist.gov/pubs/sp/800/37/r2/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response3 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body3 -ContentType "application/json" -ErrorAction Stop
    Write-Host "[OK] Ingestion successful" -ForegroundColor Green
    Write-Host "    Document ID: $($response3.documentId)" -ForegroundColor Gray

    Start-Sleep -Seconds 12

    $doc3 = Invoke-RestMethod -Uri "$baseUrl/documents/$($response3.documentId)" -Method GET -ErrorAction Stop

    $result3 = @{
        Name = "SP 800-37 Rev 2"
        DocumentId = $response3.documentId
        ContentType = $doc3.contentType
        IsLandingPage = $doc3.isLandingPage
        VersionInfo = $doc3.versionInfo
        Formats = $doc3.formats
        Status = if ($doc3.contentType -eq "application/pdf") { "PASS" } else { "FAIL" }
    }

    Write-Host "    Content-Type: $($doc3.contentType)" -ForegroundColor $(if ($doc3.contentType -eq "application/pdf") { "Green" } else { "Red" })
    Write-Host "    Landing Page: $($doc3.isLandingPage)" -ForegroundColor $(if ($doc3.isLandingPage) { "Green" } else { "Red" })

    if ($doc3.versionInfo) {
        Write-Host "    Version: $($doc3.versionInfo.publicationSeries) Rev $($doc3.versionInfo.revision)" -ForegroundColor Green
        Write-Host "    Status: $($doc3.versionInfo.status)" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] No version info extracted" -ForegroundColor Yellow
    }

    if ($doc3.formats) {
        $formatList = ($doc3.formats.PSObject.Properties.Name | ForEach-Object { $_.ToUpper() }) -join ", "
        Write-Host "    Formats: $formatList" -ForegroundColor Green
    }

    $results += $result3
    Write-Host ""

} catch {
    Write-Host "[ERROR] Test 3 failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Summary
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$passCount = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$totalCount = $results.Count

Write-Host "Results: $passCount / $totalCount tests passed" -ForegroundColor $(if ($passCount -eq $totalCount) { "Green" } else { "Yellow" })
Write-Host ""

foreach ($result in $results) {
    $statusColor = if ($result.Status -eq "PASS") { "Green" } else { "Red" }
    $statusIcon = if ($result.Status -eq "PASS") { "[OK]" } else { "[FAIL]" }

    Write-Host "$statusIcon $($result.Name)" -ForegroundColor $statusColor
    Write-Host "    Document ID: $($result.DocumentId)" -ForegroundColor Gray
    Write-Host "    UI Link: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$($result.DocumentId)" -ForegroundColor Gray

    if ($result.ContentType -eq "application/pdf") {
        Write-Host "    [OK] PDF downloaded" -ForegroundColor Green
    } else {
        Write-Host "    [X] HTML only (no PDF)" -ForegroundColor Red
    }

    if ($result.IsLandingPage) {
        Write-Host "    [OK] Landing page detected" -ForegroundColor Green
    } else {
        Write-Host "    [X] Not detected as landing page" -ForegroundColor Yellow
    }

    if ($result.VersionInfo) {
        Write-Host "    [OK] Version info extracted" -ForegroundColor Green
    } else {
        Write-Host "    [X] No version info" -ForegroundColor Yellow
    }

    if ($result.Formats) {
        Write-Host "    [OK] Formats tracked" -ForegroundColor Green
    } else {
        Write-Host "    [X] No formats tracked" -ForegroundColor Yellow
    }

    Write-Host ""
}

Write-Host "================================================" -ForegroundColor Green
Write-Host "Test Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: Open the UI links above to verify the frontend display" -ForegroundColor Cyan
