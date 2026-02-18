# PolicyWonk Logging Configuration Script
# Configures Application Insights workspace ID and enables comprehensive logging

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory=$false)]
    [string]$FunctionAppName
)

$ErrorActionPreference = 'Stop'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PolicyWonk Logging Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Discover Function App if not provided
if (!$FunctionAppName) {
    Write-Host "Step 1: Discovering Function App..." -ForegroundColor Yellow
    $functionApp = az functionapp list --resource-group $ResourceGroupName --query "[0]" | ConvertFrom-Json

    if (!$functionApp) {
        Write-Host "  [ERROR] Function App not found in resource group" -ForegroundColor Red
        exit 1
    }

    $FunctionAppName = $functionApp.name
    Write-Host "  [OK] Found Function App: $FunctionAppName" -ForegroundColor Green
} else {
    Write-Host "Step 1: Using provided Function App: $FunctionAppName" -ForegroundColor Yellow
}

Write-Host ""

# Get Application Insights information
Write-Host "Step 2: Getting Application Insights information..." -ForegroundColor Yellow

try {
    # Get the Application Insights connection string from Function App
    $appSettings = az functionapp config appsettings list `
        --name $FunctionAppName `
        --resource-group $ResourceGroupName | ConvertFrom-Json

    $appInsightsConnectionString = ($appSettings | Where-Object { $_.name -eq 'APPLICATIONINSIGHTS_CONNECTION_STRING' }).value

    if (!$appInsightsConnectionString) {
        Write-Host "  [ERROR] Application Insights not configured" -ForegroundColor Red
        exit 1
    }

    Write-Host "  [OK] Application Insights connection string found" -ForegroundColor Green

    # Extract instrumentation key from connection string
    if ($appInsightsConnectionString -match 'InstrumentationKey=([^;]+)') {
        $instrumentationKey = $matches[1]
        Write-Host "  Instrumentation Key: $instrumentationKey" -ForegroundColor Gray
    }

    # Get Application Insights resource
    $appInsightsList = az monitor app-insights component show `
        --resource-group $ResourceGroupName `
        --query "[?instrumentationKey=='$instrumentationKey']" | ConvertFrom-Json

    if (!$appInsightsList -or $appInsightsList.Count -eq 0) {
        # Try alternative: get all App Insights in the resource group
        $allAppInsights = az monitor app-insights component show `
            --resource-group $ResourceGroupName | ConvertFrom-Json

        if ($allAppInsights) {
            $appInsights = $allAppInsights[0]
        } else {
            Write-Host "  [ERROR] Could not find Application Insights resource" -ForegroundColor Red
            exit 1
        }
    } else {
        $appInsights = $appInsightsList[0]
    }

    $appInsightsName = $appInsights.name
    $workspaceId = $appInsights.workspaceResourceId

    Write-Host "  [OK] Application Insights: $appInsightsName" -ForegroundColor Green

    if ($workspaceId) {
        Write-Host "  Workspace ID: $workspaceId" -ForegroundColor Gray
    } else {
        Write-Host "  [WARN] No workspace linked to Application Insights" -ForegroundColor Yellow
    }

} catch {
    Write-Host "  [ERROR] Failed to get Application Insights information" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Configure workspace ID in Function App if available
if ($workspaceId) {
    Write-Host "Step 3: Configuring workspace ID in Function App..." -ForegroundColor Yellow

    try {
        # Extract just the workspace ID from the resource ID
        # Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.OperationalInsights/workspaces/{workspace}
        if ($workspaceId -match '/workspaces/([^/]+)$') {
            $workspaceName = $matches[1]

            # Get the actual workspace ID (GUID)
            $workspace = az monitor log-analytics workspace show `
                --name $workspaceName `
                --resource-group $ResourceGroupName | ConvertFrom-Json

            if ($workspace -and $workspace.customerId) {
                $workspaceGuid = $workspace.customerId

                Write-Host "  Workspace Name: $workspaceName" -ForegroundColor Gray
                Write-Host "  Workspace GUID: $workspaceGuid" -ForegroundColor Gray

                # Set the workspace ID in Function App settings
                az functionapp config appsettings set `
                    --name $FunctionAppName `
                    --resource-group $ResourceGroupName `
                    --settings "APPLICATIONINSIGHTS_WORKSPACE_ID=$workspaceGuid" | Out-Null

                Write-Host "  [OK] Workspace ID configured in Function App" -ForegroundColor Green
            } else {
                Write-Host "  [WARN] Could not get workspace GUID" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "  [WARN] Failed to configure workspace ID" -ForegroundColor Yellow
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Step 3: Creating Log Analytics workspace..." -ForegroundColor Yellow

    try {
        $workspaceName = "log-$($ResourceGroupName -replace '^rg-', '')"

        Write-Host "  Creating workspace: $workspaceName" -ForegroundColor Gray

        $newWorkspace = az monitor log-analytics workspace create `
            --resource-group $ResourceGroupName `
            --workspace-name $workspaceName `
            --location eastus | ConvertFrom-Json

        if ($newWorkspace -and $newWorkspace.customerId) {
            $workspaceGuid = $newWorkspace.customerId

            Write-Host "  [OK] Log Analytics workspace created" -ForegroundColor Green
            Write-Host "  Workspace GUID: $workspaceGuid" -ForegroundColor Gray

            # Link Application Insights to the workspace
            az monitor app-insights component update `
                --app $appInsightsName `
                --resource-group $ResourceGroupName `
                --workspace $newWorkspace.id | Out-Null

            Write-Host "  [OK] Application Insights linked to workspace" -ForegroundColor Green

            # Set the workspace ID in Function App settings
            az functionapp config appsettings set `
                --name $FunctionAppName `
                --resource-group $ResourceGroupName `
                --settings "APPLICATIONINSIGHTS_WORKSPACE_ID=$workspaceGuid" | Out-Null

            Write-Host "  [OK] Workspace ID configured in Function App" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [ERROR] Failed to create Log Analytics workspace" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Enable live metrics and detailed telemetry
Write-Host "Step 4: Enabling enhanced telemetry..." -ForegroundColor Yellow

try {
    az functionapp config appsettings set `
        --name $FunctionAppName `
        --resource-group $ResourceGroupName `
        --settings `
            "APPLICATIONINSIGHTS_ENABLE_LIVE_METRICS=true" `
            "APPLICATIONINSIGHTS_ENABLE_DEPENDENCY_TRACKING=true" `
            "APPLICATIONINSIGHTS_ENABLE_PERFORMANCE_COUNTERS=true" | Out-Null

    Write-Host "  [OK] Enhanced telemetry enabled" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Could not enable enhanced telemetry" -ForegroundColor Yellow
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Restart Function App to apply settings
Write-Host "Step 5: Restarting Function App..." -ForegroundColor Yellow

az functionapp restart --name $FunctionAppName --resource-group $ResourceGroupName | Out-Null

Write-Host "  [OK] Function App restarted" -ForegroundColor Green

Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Green
Write-Host "Logging Configuration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "How to view logs:" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Via API endpoint:" -ForegroundColor White
Write-Host "   https://$FunctionAppName.azurewebsites.net/api/logs?take=50" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Via Azure Portal:" -ForegroundColor White
Write-Host "   - Function App → Logs → Query 'traces | order by timestamp desc | take 100'" -ForegroundColor Gray
Write-Host "   - Application Insights → Logs → Same query" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Via PowerShell:" -ForegroundColor White
Write-Host "   Invoke-RestMethod -Uri 'https://$FunctionAppName.azurewebsites.net/api/logs?take=50'" -ForegroundColor Gray
Write-Host ""

Write-Host "4. Live Metrics Stream:" -ForegroundColor White
Write-Host "   - Azure Portal → Application Insights → Live Metrics" -ForegroundColor Gray
Write-Host "   - See logs in real-time as they happen" -ForegroundColor Gray
Write-Host ""

Write-Host "Note: It may take 2-5 minutes for logs to start appearing after configuration." -ForegroundColor Yellow
Write-Host ""

# Test logging
Write-Host "Running test to generate logs..." -ForegroundColor Cyan

try {
    Write-Host "  Calling health endpoint..." -ForegroundColor Gray
    Invoke-RestMethod -Uri "https://$FunctionAppName.azurewebsites.net/api/health" -TimeoutSec 10 | Out-Null

    Write-Host "  [OK] Health endpoint called (logs should be generated)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Wait 2-3 minutes, then check logs with:" -ForegroundColor Yellow
    Write-Host "  pwsh -File test-logs.ps1" -ForegroundColor Gray
} catch {
    Write-Host "  [WARN] Could not call health endpoint" -ForegroundColor Yellow
}

Write-Host ""
