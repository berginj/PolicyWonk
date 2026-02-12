// PolicyWonk Infrastructure - Complete Azure Deployment
// This template deploys all resources needed for the AI-powered policy monitoring system

@description('Environment name (e.g., dev, prod)')
param environmentName string = 'prod'

@description('Location for all resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param uniqueSuffix string = uniqueString(resourceGroup().id)

// ============================================================================
// VARIABLES
// ============================================================================

var resourcePrefix = 'pwonk-${environmentName}-${uniqueSuffix}'
var cosmosDbAccountName = 'cosmos-${resourcePrefix}'
var storageAccountName = replace('st${resourcePrefix}', '-', '')
var keyVaultName = 'kv-${resourcePrefix}'
var searchServiceName = 'srch-${resourcePrefix}'
var documentIntelligenceName = 'docint-${resourcePrefix}'
var openAiName = 'openai-${resourcePrefix}'

// ============================================================================
// COSMOS DB - Document and metadata storage
// ============================================================================

resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosDbAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosDbAccount
  name: 'policywonk'
  properties: {
    resource: {
      id: 'policywonk'
    }
  }
}

// Documents container - stores policy/contract metadata
resource documentsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'documents'
  properties: {
    resource: {
      id: 'documents'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
      }
    }
  }
}

// Versions container - stores document versions
resource versionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'versions'
  properties: {
    resource: {
      id: 'versions'
      partitionKey: {
        paths: ['/policyId']
        kind: 'Hash'
      }
    }
  }
}

// Diffs container - stores computed diffs with AI analysis
resource diffsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'diffs'
  properties: {
    resource: {
      id: 'diffs'
      partitionKey: {
        paths: ['/policyId']
        kind: 'Hash'
      }
    }
  }
}

// Alerts container - stores user alert configurations
resource alertsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'alerts'
  properties: {
    resource: {
      id: 'alerts'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
    }
  }
}

// Notifications container - stores sent notifications
resource notificationsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'notifications'
  properties: {
    resource: {
      id: 'notifications'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
    }
  }
}

// ============================================================================
// STORAGE ACCOUNT - Blob storage for documents
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

// Raw documents container
resource rawContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'raw-documents'
  properties: {
    publicAccess: 'None'
  }
}

// Extracted text container
resource extractedContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'extracted-text'
  properties: {
    publicAccess: 'None'
  }
}

// Diffs container
resource diffsStorageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'diffs'
  properties: {
    publicAccess: 'None'
  }
}

// Storage queues for background processing
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource processingQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'document-processing'
}

resource diffQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'diff-computation'
}

resource alertQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'alert-evaluation'
}

// ============================================================================
// KEY VAULT - Secure secrets storage
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// Store Cosmos DB connection string
resource cosmosConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'CosmosDbConnectionString'
  properties: {
    value: cosmosDbAccount.listConnectionStrings().connectionStrings[0].connectionString
  }
}

// Store Storage Account connection string
resource storageConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'StorageConnectionString'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  }
}

// ============================================================================
// AZURE AI SEARCH - Semantic search for documents
// ============================================================================

resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  sku: {
    name: 'basic'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
  }
}

// ============================================================================
// DOCUMENT INTELLIGENCE - Text extraction from documents
// ============================================================================

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: documentIntelligenceName
  location: location
  sku: {
    name: 'S0'
  }
  kind: 'FormRecognizer'
  properties: {
    customSubDomainName: documentIntelligenceName
    publicNetworkAccess: 'Enabled'
  }
}

// Store Document Intelligence key
resource docIntelKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'DocumentIntelligenceKey'
  properties: {
    value: documentIntelligence.listKeys().key1
  }
}

// ============================================================================
// AZURE OPENAI - AI analysis and embeddings
// Note: Azure OpenAI requires special access approval
// ============================================================================

resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: openAiName
  location: location
  sku: {
    name: 'S0'
  }
  kind: 'OpenAI'
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

// Store OpenAI key
resource openAiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'OpenAIKey'
  properties: {
    value: openAiAccount.listKeys().key1
  }
}

// ============================================================================
// APPLICATION INSIGHTS - Monitoring and logging
// ============================================================================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourcePrefix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 90
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ============================================================================
// OUTPUTS - Configuration values for Function App
// ============================================================================

output cosmosDbEndpoint string = cosmosDbAccount.properties.documentEndpoint
output storageAccountName string = storageAccount.name
output keyVaultName string = keyVault.name
output searchServiceEndpoint string = 'https://${searchService.name}.search.windows.net'
output documentIntelligenceEndpoint string = documentIntelligence.properties.endpoint
output openAiEndpoint string = openAiAccount.properties.endpoint
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey

// Environment variables to configure in Function App
output environmentVariables object = {
  COSMOS_DB_ENDPOINT: cosmosDbAccount.properties.documentEndpoint
  COSMOS_DB_DATABASE: 'policywonk'
  STORAGE_ACCOUNT_NAME: storageAccount.name
  KEY_VAULT_NAME: keyVault.name
  SEARCH_SERVICE_ENDPOINT: 'https://${searchService.name}.search.windows.net'
  SEARCH_INDEX_NAME: 'policywonk-documents'
  DOCUMENT_INTELLIGENCE_ENDPOINT: documentIntelligence.properties.endpoint
  OPENAI_ENDPOINT: openAiAccount.properties.endpoint
  OPENAI_EMBEDDING_DEPLOYMENT: 'text-embedding-3-large'
  OPENAI_CHAT_DEPLOYMENT: 'gpt-4o'
  QUEUE_NAME_PROCESSING: 'document-processing'
  QUEUE_NAME_DIFF: 'diff-computation'
  QUEUE_NAME_ALERT: 'alert-evaluation'
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
}
