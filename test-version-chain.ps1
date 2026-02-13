# Test Version Chain - Ingest two versions and verify linking

Write-Host "Testing Version Chain Functionality" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://func-pwonk-v2.azurewebsites.net/api"

# Test 1: Ingest SP 800-53 Rev 5 (base revision)
Write-Host "Test 1: Ingesting NIST SP 800-53 Rev 5 (base)" -ForegroundColor Yellow
$body1 = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r5/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response1 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body1 -ContentType "application/json"
    Write-Host "[OK] Success!" -ForegroundColor Green
    Write-Host "Document ID: $($response1.documentId)"
    $docId1 = $response1.documentId

    # Wait for processing
    Write-Host "Waiting 10 seconds for processing..."
    Start-Sleep -Seconds 10

    # Get document details
    $doc1 = Invoke-RestMethod -Uri "$baseUrl/documents/$docId1" -Method GET
    Write-Host "Version: Rev $($doc1.versionInfo.revision) Update $($doc1.versionInfo.update)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Ingest SP 800-53 Rev 5 Update 1 (should link to previous)
Write-Host "Test 2: Ingesting NIST SP 800-53 Rev 5 Update 1" -ForegroundColor Yellow
$body2 = @{
    url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
    docType = "policy"
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/ingest/url" -Method POST -Body $body2 -ContentType "application/json"
    Write-Host "[OK] Success!" -ForegroundColor Green
    Write-Host "Document ID: $($response2.documentId)"
    $docId2 = $response2.documentId

    # Wait for processing
    Write-Host "Waiting 10 seconds for processing..."
    Start-Sleep -Seconds 10

    # Get document details
    $doc2 = Invoke-RestMethod -Uri "$baseUrl/documents/$docId2" -Method GET
    Write-Host "Version: Rev $($doc2.versionInfo.revision) Update $($doc2.versionInfo.update)" -ForegroundColor Green

    # Check version chain
    if ($doc2.versionChain) {
        Write-Host "[OK] Version chain created!" -ForegroundColor Green
        Write-Host "  Previous Version ID: $($doc2.versionChain.previousVersionId)"
        Write-Host "  Related Versions: $($doc2.versionChain.relatedVersions.Count)"

        # Verify the previous version points to this one
        $doc1Updated = Invoke-RestMethod -Uri "$baseUrl/documents/$docId1" -Method GET
        if ($doc1Updated.versionChain -and $doc1Updated.versionChain.nextVersionId -eq $docId2) {
            Write-Host "[OK] Bi-directional link verified!" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Previous version doesn't point to new version" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] No version chain created" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "View in UI:" -ForegroundColor Cyan
    Write-Host "  Rev 5: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$docId1"
    Write-Host "  Rev 5 Update 1: https://proud-sand-06951430f.6.azurestaticapps.net/policies/$docId2"
} catch {
    Write-Host "[ERROR] Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Version Chain Test Complete!" -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Green
