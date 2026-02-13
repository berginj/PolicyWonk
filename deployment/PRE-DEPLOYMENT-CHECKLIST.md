# Pre-Deployment Checklist

Complete this checklist before deploying PolicyWonk to a new Azure subscription.

## ✅ Prerequisites

### Azure Subscription
- [ ] New Azure subscription created
- [ ] Subscription ID documented: `_______________________________`
- [ ] Billing configured and verified
- [ ] Spending limit reviewed (if applicable)

### Access & Permissions
- [ ] Owner or Contributor + User Access Administrator role assigned
- [ ] Ability to create service principals verified
- [ ] Ability to access Azure Portal confirmed
- [ ] Ability to run Azure CLI commands confirmed

### Development Environment
- [ ] Azure CLI installed (version 2.50+)
  ```powershell
  az --version
  ```
- [ ] PowerShell 7.0+ installed
  ```powershell
  $PSVersionTable.PSVersion
  ```
- [ ] Node.js 20.x installed
  ```powershell
  node --version
  ```
- [ ] Git installed
  ```powershell
  git --version
  ```
- [ ] Bicep CLI available
  ```powershell
  az bicep version
  ```

### Repository Access
- [ ] PolicyWonk repository cloned
- [ ] Current branch: `main`
- [ ] Latest code pulled
  ```powershell
  git pull origin main
  ```
- [ ] Deployment scripts accessible in `./deployment/` folder

---

## 📋 Planning & Configuration

### Resource Naming
- [ ] Environment name chosen: `dev` | `staging` | `prod`
- [ ] Resource prefix chosen (3-6 chars): `_______`
- [ ] Naming convention documented
  ```
  Example: rg-pwonk-prod, func-pwonk-v2-prod
  ```

### Azure Region Selection
- [ ] Primary region chosen: `_______________________`
- [ ] Region has required services available:
  - [ ] Azure Functions
  - [ ] Azure Cosmos DB
  - [ ] Azure AI Search
  - [ ] Azure Static Web Apps
  - [ ] Azure OpenAI (or alternative)
  - [ ] Azure AI Document Intelligence

**Check regional availability**:
```powershell
az account list-locations --query "[].{Name:name, DisplayName:displayName}" -o table
```

### Capacity & SKU Planning

**Current (Small Footprint)**:
- Cosmos DB: 400 RU/s provisioned
- Functions: Consumption (Y1) plan
- AI Search: Basic tier
- Storage: Standard LRS

**Large Footprint (Your Target)**:
- [ ] Cosmos DB: Autoscale 400-4000 RU/s
- [ ] Functions: Premium EP1 or EP2 plan
- [ ] AI Search: Standard S1 or S2
- [ ] Storage: Standard GRS or ZRS
- [ ] Multi-region deployment (optional)

### Cost Estimation
- [ ] Monthly cost estimated: $____________
- [ ] Cost alerts configured (threshold): $____________
- [ ] Budget approved

---

## 🔑 External Dependencies

### Azure OpenAI

**Option A: Use Existing OpenAI Resource**
- [ ] Existing OpenAI account name: `_______________________`
- [ ] Resource group: `_______________________`
- [ ] Subscription: `_______________________`
- [ ] Access key available
- [ ] Deployments exist:
  - [ ] `text-embedding-3-large` (for embeddings)
  - [ ] `gpt-4o` or `gpt-4` (for classification)

**Option B: Deploy New OpenAI Resource**
- [ ] Quota request submitted (if needed)
- [ ] Region for OpenAI chosen: `_______________________`
- [ ] Deployment names planned:
  - Embedding model: `_______________________`
  - Chat model: `_______________________`

### Azure AI Document Intelligence

**Option A: Use Existing Document Intelligence**
- [ ] Existing account name: `_______________________`
- [ ] Resource group: `_______________________`
- [ ] Access key available

**Option B: Deploy New Document Intelligence**
- [ ] Region chosen: `_______________________`
- [ ] SKU selected: `S0` (Standard)

---

## 🔐 Security & Networking

### Key Vault Configuration
- [ ] Key Vault naming convention planned
- [ ] Access policies approach chosen:
  - [ ] RBAC (recommended)
  - [ ] Access policies (legacy)
- [ ] Firewall rules planned (if restricted access needed)

### Networking (Optional)
- [ ] Virtual Network needed? Yes / No
  - If yes:
    - [ ] VNet CIDR range: `_______________________`
    - [ ] Subnet for Functions: `_______________________`
    - [ ] Private endpoints needed? Yes / No

### Managed Identities
- [ ] System-assigned managed identity will be used for Function App
- [ ] User-assigned managed identities needed? Yes / No

---

## 📊 Data Migration (If Applicable)

### Existing Data
- [ ] Existing PolicyWonk deployment? Yes / No

**If Yes:**
- [ ] Source Cosmos DB connection string available
- [ ] Source Storage Account connection string available
- [ ] Data export completed
  ```powershell
  .\deployment\export-data.ps1 -SourceCosmosConnectionString "..."
  ```
- [ ] Export size documented: ___________ GB
- [ ] Migration window scheduled
  - Start: `_______________________`
  - End: `_______________________`
  - Duration: ___________ hours

### Data Retention
- [ ] Data retention policy defined
- [ ] Backup strategy planned
- [ ] Archive strategy planned (if needed)

---

## 🔄 CI/CD Configuration

### GitHub Integration
- [ ] GitHub repository URL: `_______________________`
- [ ] GitHub Actions enabled
- [ ] Branch protection rules configured (optional)

### GitHub Secrets (To Be Added After Deployment)
- [ ] `AZURE_CREDENTIALS` (for infrastructure deployment)
- [ ] `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` (for Functions deployment)
- [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN` (for Web App deployment)

### Deployment Workflows
- [ ] `deploy-infra.yml` exists
- [ ] `deploy-functions.yml` exists
- [ ] `deploy-webapp.yml` exists

---

## 📞 Communication & Support

### Email Configuration (Azure Communication Services)
- [ ] Sender email address planned: `_______________________`
- [ ] Recipient email addresses for alerts documented:
  - [ ] `_______________________`
  - [ ] `_______________________`
- [ ] Email domain verified (if custom domain)

### Monitoring & Alerts
- [ ] Email recipients for deployment alerts: `_______________________`
- [ ] Slack channel for notifications (optional): `_______________________`
- [ ] On-call rotation defined (if applicable)

---

## 🗓️ Deployment Schedule

### Timeline
- [ ] Deployment date scheduled: `_______________________`
- [ ] Deployment time window: `_______ to _______` (allow 3-4 hours)
- [ ] Stakeholders notified
- [ ] Rollback plan documented

### Team Availability
- [ ] Deployment lead: `_______________________`
- [ ] Azure admin available: Yes / No
- [ ] Developer available: Yes / No
- [ ] Backup contact: `_______________________`

---

## ✅ Final Checks

### Documentation Review
- [ ] Read `DEPLOYMENT-GUIDE.md`
- [ ] Reviewed deployment scripts in `./deployment/`
- [ ] Understood rollback procedure
- [ ] Tested scripts in non-production environment (optional)

### Dry Run
- [ ] Ran deployment with `--WhatIf` flag:
  ```powershell
  .\deployment\deploy-infrastructure.ps1 `
      -SubscriptionId "<SUBSCRIPTION-ID>" `
      -EnvironmentName "prod" `
      -Location "eastus" `
      -ResourcePrefix "pwonk" `
      -WhatIf
  ```
- [ ] Reviewed what-if output
- [ ] No unexpected changes detected

### Communication
- [ ] Team notified of upcoming deployment
- [ ] Users notified of potential downtime (if applicable)
- [ ] Stakeholders aware of deployment schedule

---

## 🚀 Ready to Deploy?

**All items checked?** You're ready to proceed!

**Next step**: Open `DEPLOYMENT-GUIDE.md` and follow Phase 2: Infrastructure Deployment

```powershell
# Run this command to start deployment
.\deployment\deploy-infrastructure.ps1 `
    -SubscriptionId "<YOUR-SUBSCRIPTION-ID>" `
    -EnvironmentName "prod" `
    -Location "eastus" `
    -ResourcePrefix "pwonk"
```

---

## 📋 Checklist Summary

**Prerequisites**: _____ / 15 complete
**Planning**: _____ / 12 complete
**External Dependencies**: _____ / 8 complete
**Security**: _____ / 6 complete
**Data Migration**: _____ / 8 complete (if applicable)
**CI/CD**: _____ / 7 complete
**Communication**: _____ / 5 complete
**Final Checks**: _____ / 7 complete

**Overall**: _____ / 68 complete

---

**Minimum Required**: Complete all items in Prerequisites, Planning, and Final Checks before deploying.

**Recommended**: Complete all applicable items for production deployment.

---

*Checklist Version: 1.0*
*Last Updated: 2026-02-13*
