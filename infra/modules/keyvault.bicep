// Key Vault module

param location string
param environmentName string
param resourcePrefix string
param tags object

// Key Vault name must be globally unique and <= 24 chars
// Using uniqueString to avoid soft-delete conflicts
var keyVaultName = 'kv-${take(replace(resourcePrefix, '-', ''), 5)}-${take(uniqueString(subscription().subscriptionId), 6)}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri
