# PolicyWonk Deployment Validation Script
# Verifies that all components are deployed and functioning correctly

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory=$false)]
    [switch]$Detailed
)

$ErrorActionPreference = 'Stop'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Deployment Validation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$results = @()
$failureCount = 0

function Test-Resource {
    param(
        [string]$Name,
        [string]$Type,
        [scriptblock]$ValidationScript
    )

    Write-Host "Testing: $Name" -ForegroundColor Yellow

    try {
        $result = & $ValidationScript
        if ($result) {
            Write-Host "  ✅ PASS" -ForegroundColor Green
            $script:results += [PSCustomObject]@{
                Component = $Name
                Status = "PASS"
                Details = $result
            }
            return $true
        } else {
            Write-Host "  ❌ FAIL - No response" -ForegroundColor Red
            $script:failureCount++
            $script:results += [PSCustomObject]@{
                Component = $Name
                Status = "FAIL"
                Details = "No response"
            }
            return $false
        }
    } catch {
        Write-Host "  ❌ FAIL - $($_.Exception.Message)" -ForegroundColor Red
        $script:failureCount++
        $script:results += [PSCustomObject]@{
            Component = $Name
            Status = "FAIL"
            Details = $_.Exception.Message
        }
        return $false
    }
}

# Test 1: Resource Group Exists
Test-Resource -Name "Resource Group" -Type "Group" -ValidationScript {
    $rg = az group show --name $ResourceGroupName 2>$null | ConvertFrom-Json
    if ($rg) { "Exists in $($rg.location)" } else { $null }
}

# Test 2: Storage Account
Test-Resource -Name "Storage Account" -Type "Storage" -ValidationScript {
    $storage = az storage account list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($storage) {
        $accountName = $storage.name
        # Check if account is accessible
        $containers = az storage container list --account-name $accountName --auth-mode login 2>$null
        if ($containers) { "Account: $accountName - Accessible" } else { $null }
    } else { $null }
}

# Test 3: Cosmos DB
Test-Resource -Name "Cosmos DB" -Type "Database" -ValidationScript {
    $cosmos = az cosmosdb list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($cosmos) {
        $accountName = $cosmos.name
        # Check databases
        $databases = az cosmosdb sql database list --account-name $accountName --resource-group $ResourceGroupName | ConvertFrom-Json
        "Account: $accountName - $($databases.Count) database(s)"
    } else { $null }
}

# Test 4: Function App
$functionAppName = $null
Test-Resource -Name "Function App" -Type "Compute" -ValidationScript {
    $func = az functionapp list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($func) {
        $script:functionAppName = $func.name
        $state = $func.state
        if ($state -eq "Running") {
            "App: $($func.name) - $state"
        } else {
            throw "Function App is not running (State: $state)"
        }
    } else { $null }
}

# Test 5: Function App Health Endpoint
if ($functionAppName) {
    Test-Resource -Name "Function App Health Check" -Type "Health" -ValidationScript {
        $url = "https://$functionAppName.azurewebsites.net/api/health"
        try {
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 10 -ErrorAction Stop
            "Health endpoint responding"
        } catch {
            throw "Health endpoint not responding"
        }
    }
}

# Test 6: Static Web App
Test-Resource -Name "Static Web App" -Type "Frontend" -ValidationScript {
    $swa = az staticwebapp list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($swa) {
        $hostname = $swa.defaultHostname
        # Test if site is accessible
        try {
            $response = Invoke-WebRequest -Uri "https://$hostname" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            "App: $($swa.name) - Accessible at https://$hostname"
        } catch {
            throw "Static Web App not accessible"
        }
    } else { $null }
}

# Test 7: Key Vault
Test-Resource -Name "Key Vault" -Type "Security" -ValidationScript {
    $kv = az keyvault list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($kv) {
        $vaultName = $kv.name
        # Check if accessible
        $secrets = az keyvault secret list --vault-name $vaultName 2>$null | ConvertFrom-Json
        if ($secrets) {
            "Vault: $vaultName - $($secrets.Count) secret(s)"
        } else {
            throw "Key Vault not accessible"
        }
    } else { $null }
}

# Test 8: AI Search
Test-Resource -Name "AI Search" -Type "Search" -ValidationScript {
    $search = az search service list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json
    if ($search) {
        "Service: $($search.name) - $($search.sku.name) tier"
    } else { $null }
}

# Test 9: Application Insights
Test-Resource -Name "Application Insights" -Type "Monitoring" -ValidationScript {
    $appInsights = az monitor app-insights component show --resource-group $ResourceGroupName --query "[0]" 2>$null | ConvertFrom-Json
    if ($appInsights) {
        "Component: $($appInsights.name) - Instrumentation Key exists"
    } else { $null }
}

# Test 10: Communication Services
Test-Resource -Name "Communication Services" -Type "Communication" -ValidationScript {
    $comm = az communication list --resource-group $ResourceGroupName --query "[0]" 2>$null | ConvertFrom-Json
    if ($comm) {
        "Service: $($comm.name)"
    } else { $null }
}

# Detailed Tests (if enabled)
if ($Detailed) {
    Write-Host ""
    Write-Host "Running detailed tests..." -ForegroundColor Cyan
    Write-Host ""

    # Test: Multi-Version Tracking
    if ($functionAppName) {
        Write-Host "Testing: Multi-Version Tracking Feature" -ForegroundColor Yellow

        try {
            $testUrl = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
            $body = @{
                url = $testUrl
                docType = "policy"
            } | ConvertTo-Json

            $ingestUrl = "https://$functionAppName.azurewebsites.net/api/ingest/url"
            $response = Invoke-RestMethod -Uri $ingestUrl -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30

            if ($response.documentId) {
                Write-Host "  ✅ Document ingested: $($response.documentId)" -ForegroundColor Green

                # Wait for processing
                Start-Sleep -Seconds 15

                # Check document
                $docUrl = "https://$functionAppName.azurewebsites.net/api/documents/$($response.documentId)"
                $doc = Invoke-RestMethod -Uri $docUrl -TimeoutSec 10

                if ($doc.versionInfo) {
                    Write-Host "  ✅ Version info extracted: $($doc.versionInfo.publicationSeries) Rev $($doc.versionInfo.revision)" -ForegroundColor Green
                } else {
                    Write-Host "  ⚠️  No version info (may need more time)" -ForegroundColor Yellow
                }

                if ($doc.formats) {
                    $formatCount = ($doc.formats.PSObject.Properties | Measure-Object).Count
                    Write-Host "  ✅ Formats tracked: $formatCount" -ForegroundColor Green
                } else {
                    Write-Host "  ⚠️  No formats tracked" -ForegroundColor Yellow
                }

                if ($doc.contentType -eq "application/pdf") {
                    Write-Host "  ✅ Content type is PDF (not HTML)" -ForegroundColor Green
                } else {
                    Write-Host "  ⚠️  Content type: $($doc.contentType)" -ForegroundColor Yellow
                }

            } else {
                Write-Host "  ❌ Ingestion failed" -ForegroundColor Red
                $script:failureCount++
            }
        } catch {
            Write-Host "  ❌ Multi-version test failed: $($_.Exception.Message)" -ForegroundColor Red
            $script:failureCount++
        }
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Validation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$results | Format-Table -AutoSize

Write-Host ""
$passCount = $results.Count - $failureCount
$passRate = [math]::Round(($passCount / $results.Count) * 100, 1)

if ($failureCount -eq 0) {
    Write-Host "✅ All tests passed! ($passCount/$($results.Count))" -ForegroundColor Green
    Write-Host ""
    Write-Host "Deployment is ready to use!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  $failureCount test(s) failed ($passCount/$($results.Count) passed - $passRate%)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please review the failed tests above and:" -ForegroundColor Yellow
    Write-Host "1. Check Azure Portal for resource status"
    Write-Host "2. Verify resource configuration"
    Write-Host "3. Check application logs"
    Write-Host "4. Re-run validation after fixing issues"
    Write-Host ""
    exit 1
}
