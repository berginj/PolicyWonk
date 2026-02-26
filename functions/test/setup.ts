// Jest test setup file

// Mock environment variables for testing
process.env.COSMOS_DB_ENDPOINT = 'https://test-cosmos.documents.azure.com:443/';
process.env.COSMOS_DB_DATABASE = 'test-db';
process.env.STORAGE_ACCOUNT_NAME = 'teststorage';
process.env.SEARCH_SERVICE_ENDPOINT = 'https://test-search.search.windows.net';
process.env.DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test-di.cognitiveservices.azure.com/';
process.env.OPENAI_ENDPOINT = 'https://test-openai.openai.azure.com/';
process.env.KEY_VAULT_NAME = 'test-keyvault';
process.env.AUTH_ENABLED = 'false';
process.env.AUTH_BYPASS_FOR_TESTING = 'true';

// Global test timeout
jest.setTimeout(10000);

// Suppress console output during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
