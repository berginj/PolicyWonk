// Unit tests for config utility

describe('config', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset modules to clear singleton
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  describe('loadConfig', () => {
    it('should load config with required environment variables', () => {
      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.cosmosDb.endpoint).toBe('https://test-cosmos.documents.azure.com:443/');
      expect(config.cosmosDb.database).toBe('test-db');
      expect(config.storage.accountName).toBe('teststorage');
      expect(config.search.endpoint).toBe('https://test-search.search.windows.net');
      expect(config.documentIntelligence.endpoint).toBe('https://test-di.cognitiveservices.azure.com/');
      expect(config.openai.endpoint).toBe('https://test-openai.openai.azure.com/');
      expect(config.keyVault.name).toBe('test-keyvault');
    });

    it('should use default values for optional config', () => {
      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.search.indexName).toBe('policywonk-documents');
      expect(config.openai.embeddingDeployment).toBe('text-embedding-3-large');
      expect(config.openai.chatDeployment).toBe('gpt-4o');
      expect(config.queues.processing).toBe('document-processing');
      expect(config.queues.diff).toBe('diff-computation');
      expect(config.queues.alert).toBe('alert-evaluation');
      expect(config.monitoring.schedule).toBe('0 0 6 * * *');
      expect(config.monitoring.timezone).toBe('America/New_York');
    });

    it('should use custom values when environment variables are set', () => {
      process.env.SEARCH_INDEX_NAME = 'custom-index';
      process.env.OPENAI_EMBEDDING_DEPLOYMENT = 'custom-embedding';
      process.env.QUEUE_NAME_PROCESSING = 'custom-queue';

      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.search.indexName).toBe('custom-index');
      expect(config.openai.embeddingDeployment).toBe('custom-embedding');
      expect(config.queues.processing).toBe('custom-queue');
    });

    it('should throw error when required env var is missing', () => {
      delete process.env.COSMOS_DB_ENDPOINT;

      const { loadConfig } = require('../../src/utils/config');

      expect(() => loadConfig()).toThrow('Missing required environment variable: COSMOS_DB_ENDPOINT');
    });

    it('should throw error when STORAGE_ACCOUNT_NAME is missing', () => {
      delete process.env.STORAGE_ACCOUNT_NAME;

      const { loadConfig } = require('../../src/utils/config');

      expect(() => loadConfig()).toThrow('Missing required environment variable: STORAGE_ACCOUNT_NAME');
    });

    it('should throw error when KEY_VAULT_NAME is missing', () => {
      delete process.env.KEY_VAULT_NAME;

      const { loadConfig } = require('../../src/utils/config');

      expect(() => loadConfig()).toThrow('Missing required environment variable: KEY_VAULT_NAME');
    });
  });

  describe('auth configuration', () => {
    it('should default to auth disabled and bypass enabled for testing', () => {
      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.auth.enabled).toBe(false);
      expect(config.auth.bypassForTesting).toBe(true);
    });

    it('should enable auth when AUTH_ENABLED is true', () => {
      process.env.AUTH_ENABLED = 'true';

      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.auth.enabled).toBe(true);
    });

    it('should handle AUTH_ENABLED case insensitively', () => {
      process.env.AUTH_ENABLED = 'TRUE';

      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.auth.enabled).toBe(true);
    });

    it('should disable auth bypass when AUTH_BYPASS_FOR_TESTING is false', () => {
      process.env.AUTH_BYPASS_FOR_TESTING = 'false';

      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.auth.bypassForTesting).toBe(false);
    });

    it('should handle invalid auth values as false', () => {
      process.env.AUTH_ENABLED = 'invalid';
      process.env.AUTH_BYPASS_FOR_TESTING = 'invalid';

      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.auth.enabled).toBe(false);
      expect(config.auth.bypassForTesting).toBe(false);
    });
  });

  describe('getConfig singleton', () => {
    it('should return the same instance on multiple calls', () => {
      const { getConfig } = require('../../src/utils/config');

      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });
  });

  describe('storage container names', () => {
    it('should have correct default container names', () => {
      const { loadConfig } = require('../../src/utils/config');
      const config = loadConfig();

      expect(config.storage.containerNames.raw).toBe('raw-documents');
      expect(config.storage.containerNames.extracted).toBe('extracted-text');
      expect(config.storage.containerNames.diffs).toBe('diffs');
    });
  });
});
