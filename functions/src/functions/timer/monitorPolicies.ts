// Timer trigger for policy monitoring

import { app, InvocationContext, Timer } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { cosmosService } from '../../services/cosmosService';
import { blobService } from '../../services/blobService';
import { queueService } from '../../services/queueService';
import { fetchService } from '../../services/fetchService';
import { Document } from '../../types/document';
import { PolicyVersion } from '../../types/version';
import { ProcessingJob } from '../../types/job';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/config';

export async function monitorPolicies(
  myTimer: Timer,
  context: InvocationContext
): Promise<void> {
  const logger = createLogger({
    functionName: 'monitorPolicies',
    correlationId: context.invocationId,
  });

  try {
    logger.info('Policy monitoring started');

    const config = getConfig();
    const now = new Date().toISOString();

    // Query policies due for monitoring
    const policies = await cosmosService.queryDocuments<Document>(
      'documents',
      `SELECT * FROM c WHERE
        c.docType = 'policy'
        AND c.sourceType = 'url'
        AND c.monitoringConfig.enabled = true
        AND c.monitoringConfig.nextCheckAt <= @now`,
      [{ name: '@now', value: now }]
    );

    logger.info(`Found ${policies.length} policies to monitor`);

    for (const policy of policies) {
      try {
        await monitorPolicy(policy, logger);
      } catch (error) {
        logger.error(`Failed to monitor policy ${policy.id}`, error);
        // Continue with other policies
      }
    }

    logger.info('Policy monitoring completed', { count: policies.length });
  } catch (error) {
    logger.error('Policy monitoring failed', error);
    throw error;
  }
}

async function monitorPolicy(
  policy: Document,
  logger: any
): Promise<void> {
  const config = getConfig();

  logger.info('Monitoring policy', {
    policyId: policy.id,
    url: policy.sourceUrl,
  });

  // Fetch with conditional headers
  const fetchResult = await fetchService.fetchWithRetry(policy.sourceUrl!, {
    ifNoneMatch: policy.etag,
    ifModifiedSince: policy.lastModified,
  });

  // Update next check time
  const nextCheckMs =
    policy.monitoringConfig!.cadence === 'daily'
      ? 24 * 60 * 60 * 1000
      : policy.monitoringConfig!.cadence === 'weekly'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

  const nextCheckAt = new Date(Date.now() + nextCheckMs).toISOString();

  await cosmosService.updateDocument<Document>('documents', policy.id, policy.id, {
    monitoringConfig: {
      ...policy.monitoringConfig!,
      nextCheckAt,
    },
  });

  // If not modified (304 or null), skip
  if (!fetchResult) {
    logger.info('Policy not modified', { policyId: policy.id });
    return;
  }

  // Compute new hash
  const newSha256 = crypto
    .createHash('sha256')
    .update(fetchResult.content)
    .digest('hex');

  // Check if content actually changed
  if (newSha256 === policy.sha256) {
    logger.info('Policy hash unchanged', { policyId: policy.id });
    return;
  }

  logger.info('Policy change detected', { policyId: policy.id });

  // Get current version number
  const versions = await cosmosService.queryDocuments<PolicyVersion>(
    'versions',
    'SELECT * FROM c WHERE c.policyId = @policyId ORDER BY c.versionNumber DESC OFFSET 0 LIMIT 1',
    [{ name: '@policyId', value: policy.id }]
  );

  const nextVersionNumber = versions.length > 0 ? versions[0].versionNumber + 1 : 1;

  // Upload new raw content
  const blobName = `${policy.id}/${Date.now()}_raw`;
  await blobService.uploadBlob(
    config.storage.containerNames.raw,
    blobName,
    fetchResult.content,
    fetchResult.contentType
  );

  const rawBlobPath = `${config.storage.containerNames.raw}/${blobName}`;

  // Create new version
  const versionId = uuidv4();
  const newVersion: PolicyVersion = {
    versionId,
    policyId: policy.id,
    versionNumber: nextVersionNumber,
    fetchedAt: new Date().toISOString(),
    sha256: newSha256,
    rawBlobPath,
    extractedTextBlobPath: '', // Will be set during processing
    sectionsJson: [],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await cosmosService.createDocument('versions', newVersion);

  // Update policy document
  await cosmosService.updateDocument<Document>('documents', policy.id, policy.id, {
    currentVersionId: versionId,
    sha256: newSha256,
    etag: fetchResult.etag,
    lastModified: fetchResult.lastModified,
    fetchedAt: new Date().toISOString(),
  });

  // Create processing job
  const job: ProcessingJob = {
    documentId: policy.id,
    docType: policy.docType,
    rawBlobPath,
    contentType: fetchResult.contentType || 'application/octet-stream',
    isUpdate: true,
    versionId,
  };

  await queueService.sendMessage(config.queues.processing, job);

  logger.info('Policy version created and processing initiated', {
    policyId: policy.id,
    versionId,
    versionNumber: nextVersionNumber,
  });
}

app.timer('monitorPolicies', {
  schedule: '0 0 6 * * *', // Daily at 6 AM
  handler: monitorPolicies,
});
