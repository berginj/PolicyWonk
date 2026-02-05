// Main Bicep template for PolicyWonk infrastructure
targetScope = 'subscription'

@description('Environment name (dev, staging, prod)')
param environmentName string = 'prod'

@description('Primary Azure region')
param location string = 'eastus'

@description('Resource name prefix')
param resourcePrefix string = 'policywonk'

@description('Tags to apply to all resources')
param tags object = {
  Application: 'PolicyWonk'
  Environment: environmentName
  ManagedBy: 'Bicep'
}

// Resource group
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-${resourcePrefix}-${environmentName}'
  location: location
  tags: tags
}

// Monitoring (deploy first - needed by other resources)
module monitoring './modules/monitoring.bicep' = {
  scope: rg
  name: 'monitoring-deployment'
  params: {
    location: location
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
  }
}

// Storage Account (blobs + queues)
module storage './modules/storage.bicep' = {
  scope: rg
  name: 'storage-deployment'
  params: {
    location: location
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
  }
}

// Cosmos DB
module cosmosdb './modules/cosmosdb.bicep' = {
  scope: rg
  name: 'cosmosdb-deployment'
  params: {
    location: location
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
  }
}

// Key Vault (deploy before Function App for managed identity)
module keyvault './modules/keyvault.bicep' = {
  scope: rg
  name: 'keyvault-deployment'
  params: {
    location: location
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
  }
}

// Azure AI Search
module aisearch './modules/aisearch.bicep' = {
  scope: rg
  name: 'aisearch-deployment'
  params: {
    location: location
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
  }
}

// Document Intelligence - Temporarily commented out due to soft-delete conflicts
// Will be added back in a follow-up deployment after purge completes
// module documentintelligence './modules/documentintelligence.bicep' = {
//   scope: rg
//   name: 'documentintelligence-deployment'
//   params: {
//     location: location
//     environmentName: environmentName
//     resourcePrefix: resourcePrefix
//     tags: tags
//   }
// }

// Azure OpenAI - Commented out due to quota limitations in West US 2
// Use existing OpenAI resource: aitest2914493985 in East US 2
// module openai './modules/openai.bicep' = {
//   scope: rg
//   name: 'openai-deployment'
//   params: {
//     location: location
//     environmentName: environmentName
//     resourcePrefix: resourcePrefix
//     tags: tags
//   }
// }

// Communication Services
module communicationservices './modules/communicationservices.bicep' = {
  scope: rg
  name: 'communicationservices-deployment'
  params: {
    location: 'global'
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
  }
}

// Function App - Using Consumption (Y1) tier which has available quota
module functionapp './modules/functionapp.bicep' = {
  scope: rg
  name: 'functionapp-deployment'
  params: {
    location: location
    environmentName: environmentName
    resourcePrefix: resourcePrefix
    tags: tags
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    appInsightsInstrumentationKey: monitoring.outputs.appInsightsInstrumentationKey
    keyVaultName: keyvault.outputs.keyVaultName
  }
}

// Grant Function App managed identity access to Key Vault
module keyvaultAccess './modules/keyvault-access.bicep' = {
  scope: rg
  name: 'keyvault-access-deployment'
  params: {
    keyVaultName: keyvault.outputs.keyVaultName
    functionAppPrincipalId: functionapp.outputs.functionAppPrincipalId
  }
}

// Store secrets in Key Vault
module secrets './modules/secrets.bicep' = {
  scope: rg
  name: 'secrets-deployment'
  params: {
    keyVaultName: keyvault.outputs.keyVaultName
    cosmosDbConnectionString: cosmosdb.outputs.connectionString
    storageAccountConnectionString: storage.outputs.connectionString
    searchServiceKey: aisearch.outputs.adminKey
    documentIntelligenceKey: ''  // Temporarily empty - Document Intelligence not deployed yet
    openaiKey: ''  // Using existing OpenAI resource - configure manually in Key Vault
    communicationServicesConnectionString: communicationservices.outputs.connectionString
  }
  dependsOn: [
    keyvaultAccess
  ]
}

// Static Web App - Already deployed separately via GitHub Actions
// Commenting out to avoid conflicts with existing deployment
// module staticwebapp './modules/staticwebapp.bicep' = {
//   scope: rg
//   name: 'staticwebapp-deployment'
//   params: {
//     location: location
//     environmentName: environmentName
//     resourcePrefix: resourcePrefix
//     tags: tags
//     functionAppName: ''  // Function App not deployed yet
//   }
// }

// Outputs
output resourceGroupName string = rg.name
output storageAccountName string = storage.outputs.storageAccountName
output cosmosDbAccountName string = cosmosdb.outputs.accountName
output functionAppName string = functionapp.outputs.functionAppName
// output staticWebAppName string = staticwebapp.outputs.staticWebAppName  // Commented out - deployed separately
// output staticWebAppDefaultHostname string = staticwebapp.outputs.defaultHostname  // Commented out - deployed separately
output keyVaultName string = keyvault.outputs.keyVaultName
output searchServiceName string = aisearch.outputs.searchServiceName
// output documentIntelligenceEndpoint string = documentintelligence.outputs.endpoint  // Commented out - not deployed yet
// output openaiEndpoint string = openai.outputs.endpoint  // Commented out - using existing resource
output appInsightsInstrumentationKey string = monitoring.outputs.appInsightsInstrumentationKey
