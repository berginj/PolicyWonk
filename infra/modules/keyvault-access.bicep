// Grant Function App managed identity access to Key Vault

param keyVaultName string
param functionAppPrincipalId string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Key Vault Secrets User role (read secrets)
// TEMPORARILY COMMENTED OUT - Configure manually after deployment
// var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
//   name: guid(keyVault.id, functionAppPrincipalId, keyVaultSecretsUserRoleId)
//   scope: keyVault
//   properties: {
//     roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
//     principalId: functionAppPrincipalId
//     principalType: 'ServicePrincipal'
//   }
// }

// output roleAssignmentId string = roleAssignment.id
output roleAssignmentId string = 'manual-config-required'
