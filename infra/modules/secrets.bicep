// Store connection strings and keys as secrets in Key Vault

param keyVaultName string
@secure()
param cosmosDbConnectionString string
@secure()
param storageAccountConnectionString string
@secure()
param searchServiceKey string
@secure()
param documentIntelligenceKey string = ''  // Optional - may not be deployed yet
@secure()
param openaiKey string = ''  // Optional - using existing OpenAI resource
@secure()
param communicationServicesConnectionString string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource cosmosDbSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'CosmosDbConnectionString'
  properties: {
    value: cosmosDbConnectionString
  }
}

resource storageSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'StorageAccountConnectionString'
  properties: {
    value: storageAccountConnectionString
  }
}

resource searchSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SearchServiceKey'
  properties: {
    value: searchServiceKey
  }
}

resource documentIntelligenceSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (documentIntelligenceKey != '') {
  parent: keyVault
  name: 'DocumentIntelligenceKey'
  properties: {
    value: documentIntelligenceKey
  }
}

resource openaiSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (openaiKey != '') {
  parent: keyVault
  name: 'OpenAIKey'
  properties: {
    value: openaiKey
  }
}

resource communicationServicesSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'CommunicationServicesConnectionString'
  properties: {
    value: communicationServicesConnectionString
  }
}

output secretNames array = [
  cosmosDbSecret.name
  storageSecret.name
  searchSecret.name
  documentIntelligenceSecret.name
  communicationServicesSecret.name
]
