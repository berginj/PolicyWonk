# Deployment Day Checklist

**Print this checklist and check off items as you complete them during deployment.**

---

## Pre-Deployment (15 minutes)

**Time Started**: ___:___ AM/PM

- [ ] Run readiness check:
  ```powershell
  .\deployment\check-readiness.ps1
  ```
  - Result: _____ / 10 checks passed

- [ ] Verify Azure login:
  ```powershell
  az account show
  ```
  - Current subscription: _________________________________

- [ ] Set correct subscription:
  ```powershell
  az account set --subscription "<YOUR-SUBSCRIPTION-ID>"
  ```
  - Subscription ID: _________________________________

- [ ] Pull latest code:
  ```powershell
  git pull origin main
  ```
  - Git status: [ ] Clean [ ] Has changes

- [ ] Document deployment details:
  - Environment: [ ] dev [ ] staging [ ] prod
  - Location: _________________________________
  - Resource prefix: _________________________________
  - Estimated cost: $_________ / month

---

## Phase 1: Infrastructure Deployment (45 minutes)

**Time Started**: ___:___ AM/PM

- [ ] Start deployment:
  ```powershell
  .\deployment\deploy-infrastructure.ps1 `
      -SubscriptionId "<YOUR-SUBSCRIPTION-ID>" `
      -EnvironmentName "prod" `
      -Location "eastus" `
      -ResourcePrefix "pwonk"
  ```

- [ ] Monitor deployment progress (30-45 minutes)
  - Status: [ ] In Progress [ ] Completed [ ] Failed
  - Resource Group created: _________________________________
  - Function App name: _________________________________
  - Static Web App name: _________________________________
  - Key Vault name: _________________________________

- [ ] Save deployment outputs:
  - Outputs saved to: deployment/outputs-<RG-NAME>.json
  - File exists: [ ] Yes [ ] No

**Time Completed**: ___:___ AM/PM

---

## Phase 2: Configure External Services (20 minutes)

**Time Started**: ___:___ AM/PM

### Option A: Using Existing Azure OpenAI

- [ ] Get OpenAI key:
  ```powershell
  $openaiKey = az cognitiveservices account keys list `
      --name "your-openai-name" `
      --resource-group "your-openai-rg" `
      --query "key1" -o tsv
  ```
  - OpenAI account: _________________________________
  - Key retrieved: [ ] Yes [ ] No

- [ ] Store in Key Vault:
  ```powershell
  az keyvault secret set `
      --vault-name "kv-pwonk-prod" `
      --name "OpenAIKey" `
      --value $openaiKey
  ```
  - Secret stored: [ ] Yes [ ] No

- [ ] Store endpoint:
  ```powershell
  $openaiEndpoint = az cognitiveservices account show `
      --name "your-openai-name" `
      --resource-group "your-openai-rg" `
      --query "properties.endpoint" -o tsv

  az keyvault secret set `
      --vault-name "kv-pwonk-prod" `
      --name "OpenAIEndpoint" `
      --value $openaiEndpoint
  ```
  - Endpoint stored: [ ] Yes [ ] No

### Option B: Deploy New Azure OpenAI

- [ ] Deploy OpenAI account (requires quota approval)
- [ ] Deploy embedding model: text-embedding-3-large
- [ ] Deploy chat model: gpt-4o
- [ ] Store keys in Key Vault

**Time Completed**: ___:___ AM/PM

---

## Phase 3: Configure Application (15 minutes)

**Time Started**: ___:___ AM/PM

- [ ] Run configuration script:
  ```powershell
  .\deployment\configure-app.ps1 `
      -ResourceGroupName "rg-pwonk-prod" `
      -OpenAIResourceGroup "your-openai-rg" `
      -OpenAIAccountName "your-openai-name"
  ```

- [ ] Verify configuration steps:
  - [ ] OpenAI key stored in Key Vault
  - [ ] OpenAI endpoint stored in Key Vault
  - [ ] Function App settings configured
  - [ ] CORS configured
  - [ ] Key Vault access verified
  - [ ] Function App restarted

- [ ] Configuration file saved:
  - Path: deployment/app-config-<RG-NAME>.json
  - File exists: [ ] Yes [ ] No

**Time Completed**: ___:___ AM/PM

---

## Phase 4: Deploy Application Code (30 minutes)

**Time Started**: ___:___ AM/PM

### Option A: GitHub Actions (Recommended)

- [ ] Configure GitHub secrets:
  - Repository URL: https://github.com/berginj/PolicyWonk/settings/secrets/actions

- [ ] Get Azure credentials for GitHub:
  ```powershell
  az ad sp create-for-rbac `
      --name "github-actions-pwonk-prod" `
      --role Contributor `
      --scopes "/subscriptions/<SUBSCRIPTION-ID>/resourceGroups/rg-pwonk-prod" `
      --sdk-auth
  ```
  - [ ] AZURE_CREDENTIALS → Added to GitHub

- [ ] Get Function App publish profile:
  ```powershell
  az functionapp deployment list-publishing-profiles `
      --name "func-pwonk-v2-prod" `
      --resource-group "rg-pwonk-prod" `
      --xml
  ```
  - [ ] AZURE_FUNCTIONAPP_PUBLISH_PROFILE → Added to GitHub

- [ ] Get Static Web App token:
  ```powershell
  az staticwebapp secrets list `
      --name "swa-pwonk-prod" `
      --resource-group "rg-pwonk-prod" `
      --query "properties.apiKey" -o tsv
  ```
  - [ ] AZURE_STATIC_WEB_APPS_API_TOKEN → Added to GitHub

- [ ] Trigger deployment:
  ```powershell
  git push origin main
  ```
  - GitHub Actions URL: https://github.com/berginj/PolicyWonk/actions
  - Deploy Functions workflow: [ ] Success [ ] Failed
  - Deploy Web App workflow: [ ] Success [ ] Failed

### Option B: Manual Deployment

- [ ] Deploy Functions:
  ```powershell
  cd functions
  npm install
  npm run build
  func azure functionapp publish func-pwonk-v2-prod --typescript
  ```

- [ ] Deploy Web App (via GitHub Actions only)

**Time Completed**: ___:___ AM/PM

---

## Phase 5: Validate Deployment (20 minutes)

**Time Started**: ___:___ AM/PM

- [ ] Run validation script:
  ```powershell
  .\deployment\validate-deployment.ps1 `
      -ResourceGroupName "rg-pwonk-prod" `
      -Detailed
  ```

- [ ] Validation results:
  - Tests passed: _____ / 10
  - Tests failed: _____ / 10
  - Overall status: [ ] PASS [ ] FAIL

- [ ] Manual verification:

  - [ ] Test Function App health:
    ```powershell
    Invoke-RestMethod -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/health"
    ```
    - Response: [ ] OK [ ] Error

  - [ ] Test document ingestion:
    ```powershell
    $body = @{
        url = "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final"
        docType = "policy"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "https://func-pwonk-v2-prod.azurewebsites.net/api/ingest/url" `
        -Method POST `
        -Body $body `
        -ContentType "application/json"
    ```
    - Document ID: _________________________________
    - Status: [ ] Success [ ] Failed

  - [ ] Verify multi-version tracking:
    - Wait 15 seconds for processing
    - Fetch document details
    - Content type: [ ] application/pdf [ ] text/html
    - Landing page detected: [ ] Yes [ ] No
    - Version info extracted: [ ] Yes [ ] No
    - Formats tracked: [ ] PDF [ ] DOCX [ ] XLSX

  - [ ] Test frontend:
    ```powershell
    Start-Process "https://swa-pwonk-prod.azurestaticapps.net"
    ```
    - Site loads: [ ] Yes [ ] No
    - Can view policies: [ ] Yes [ ] No
    - Version info displays: [ ] Yes [ ] No

**Time Completed**: ___:___ AM/PM

---

## Phase 6: Post-Deployment Configuration (15 minutes)

**Time Started**: ___:___ AM/PM

- [ ] Configure monitoring alerts:
  ```powershell
  # Set up high error rate alert
  az monitor metrics alert create `
      --name "High Error Rate" `
      --resource-group "rg-pwonk-prod" `
      --scopes "<FUNCTION-APP-RESOURCE-ID>" `
      --condition "count Http5xx > 10" `
      --window-size 5m `
      --evaluation-frequency 1m
  ```
  - Alert created: [ ] Yes [ ] No

- [ ] Enable continuous backup:
  ```powershell
  az cosmosdb update `
      --name "cosmos-pwonk-prod" `
      --resource-group "rg-pwonk-prod" `
      --backup-policy-type Continuous
  ```
  - Backup enabled: [ ] Yes [ ] No

- [ ] Configure cost alerts (optional):
  - Threshold: $_________ / month
  - Alert email: _________________________________
  - Alert configured: [ ] Yes [ ] No

**Time Completed**: ___:___ AM/PM

---

## Phase 7: Documentation & Handoff (10 minutes)

**Time Started**: ___:___ AM/PM

- [ ] Document deployment details:
  - Resource Group: _________________________________
  - Function App URL: _________________________________
  - Static Web App URL: _________________________________
  - Key Vault: _________________________________
  - Cosmos DB: _________________________________
  - Storage Account: _________________________________

- [ ] Save connection strings (if needed):
  - Cosmos DB connection string saved: [ ] Yes [ ] No [ ] N/A
  - Storage Account connection string saved: [ ] Yes [ ] No [ ] N/A

- [ ] Update documentation with URLs:
  - README.md updated: [ ] Yes [ ] No
  - Team wiki updated: [ ] Yes [ ] No [ ] N/A

- [ ] Notify stakeholders:
  - Deployment complete email sent: [ ] Yes [ ] No
  - Access instructions shared: [ ] Yes [ ] No

**Time Completed**: ___:___ AM/PM

---

## Final Verification

- [ ] All phases completed successfully
- [ ] No errors or warnings in logs
- [ ] Multi-version tracking tested and working
- [ ] Frontend accessible and functional
- [ ] Backend API responding correctly
- [ ] Monitoring configured
- [ ] Backups enabled
- [ ] Documentation updated
- [ ] Team notified

**Total Deployment Time**: _______ hours _______ minutes

---

## Rollback Plan (If Needed)

If deployment fails, follow these steps:

1. **Identify failure point**: _________________________________

2. **Check error logs**:
   ```powershell
   az functionapp log tail --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"
   ```

3. **Review deployment errors**:
   ```powershell
   az deployment sub show --name "policywonk-deployment-<TIMESTAMP>"
   ```

4. **Delete resource group** (if starting over):
   ```powershell
   az group delete --name "rg-pwonk-prod" --yes --no-wait
   ```

5. **Restart deployment** from Phase 1

---

## Troubleshooting

### Function App Not Responding
- [ ] Check Function App status in Azure Portal
- [ ] Verify Key Vault access policy
- [ ] Check Application Insights for errors
- [ ] Restart Function App: `az functionapp restart --name "func-pwonk-v2-prod" --resource-group "rg-pwonk-prod"`

### Static Web App Not Loading
- [ ] Check GitHub Actions deployment status
- [ ] Verify Static Web App token
- [ ] Check CORS configuration
- [ ] Redeploy: Push new commit to trigger workflow

### Multi-Version Tracking Not Working
- [ ] Verify OpenAI key is in Key Vault
- [ ] Check Function App logs for errors
- [ ] Test with known-good URL: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- [ ] Run validation script with -Detailed flag

---

## Contact Information

**Deployment Lead**: _________________________________

**Azure Admin**: _________________________________

**Support Contact**: _________________________________

**Emergency Contact**: _________________________________

---

## Notes

Use this space for additional notes during deployment:

```
_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________
```

---

**Deployment Date**: _________________________________

**Completed By**: _________________________________

**Signature**: _________________________________

---

*Version: 1.0*
*Last Updated: 2026-02-17*
*For: PolicyWonk Production Deployment*
