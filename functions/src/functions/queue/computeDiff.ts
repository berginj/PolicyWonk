// Queue trigger for diff computation

import { app, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { cosmosService } from '../../services/cosmosService';
import { blobService } from '../../services/blobService';
import { queueService } from '../../services/queueService';
import { diffComputer } from '../../diff/diffComputer';
import { changeClassifier } from '../../diff/changeClassifier';
import { changeExplainer } from '../../diff/changeExplainer';
import { DiffJob } from '../../types/job';
import { PolicyVersion } from '../../types/version';
import { DiffRecord } from '../../types/diff';
import { Document } from '../../types/document';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/config';
import { isDiffJobMessage } from '../../utils/validation';

export async function computeDiff(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  // Initialize logger for early errors
  let logger = createLogger({
    functionName: 'computeDiff',
    correlationId: context.invocationId,
  });

  // Parse and validate queue message
  let job: DiffJob;
  try {
    if (typeof queueItem !== 'string') {
      throw new Error(`Invalid queue message type: expected string, got ${typeof queueItem}`);
    }

    const decoded = Buffer.from(queueItem, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);

    if (!isDiffJobMessage(parsed)) {
      throw new Error(`Invalid diff job message: missing required fields (policyId, fromVersionId, toVersionId)`);
    }

    job = parsed as DiffJob;
  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    logger.error('Failed to parse queue message', { error: errorMessage });
    throw parseError;
  }

  // Update logger with job context
  logger = createLogger({
    functionName: 'computeDiff',
    correlationId: context.invocationId,
    policyId: job.policyId,
  });

  try {
    logger.info('Computing diff', {
      fromVersionId: job.fromVersionId,
      toVersionId: job.toVersionId,
    });

    const config = getConfig();

    // Get versions
    const fromVersion = await cosmosService.getDocument<PolicyVersion>(
      'versions',
      job.fromVersionId,
      job.policyId
    );
    const toVersion = await cosmosService.getDocument<PolicyVersion>(
      'versions',
      job.toVersionId,
      job.policyId
    );

    if (!fromVersion || !toVersion) {
      throw new Error('Version not found');
    }

    // Get extracted text for both versions
    const fromText = await blobService.downloadBlobAsString(
      config.storage.containerNames.extracted,
      fromVersion.extractedTextBlobPath.split('/').slice(1).join('/')
    );
    const toText = await blobService.downloadBlobAsString(
      config.storage.containerNames.extracted,
      toVersion.extractedTextBlobPath.split('/').slice(1).join('/')
    );

    // Compute diff
    const diffData = await diffComputer.computeDiff(
      job.policyId,
      job.fromVersionId,
      job.toVersionId,
      fromVersion.sectionsJson,
      toVersion.sectionsJson,
      fromText,
      toText
    );

    // Get policy document for sourceUrl
    const policy = await cosmosService.getDocument<Document>(
      'documents',
      job.policyId,
      job.policyId
    );

    // Classify change
    const { changeScore, changeType } = await changeClassifier.classifyChange(
      job.policyId,
      policy?.sourceUrl,
      diffData.summaryJson,
      fromVersion.sectionsJson,
      toVersion.sectionsJson
    );

    // Generate LLM explanation for MODERATE/MAJOR changes
    const llmExplanation = await changeExplainer.explainChanges(
      diffData.summaryJson,
      changeType
    );

    // Upload full text diff to blob
    const textDiff = diffData.summaryJson; // Full diff text would be generated in diffComputer
    const diffBlobName = `${job.policyId}/${job.fromVersionId}_${job.toVersionId}_diff.txt`;
    await blobService.uploadBlob(
      config.storage.containerNames.diffs,
      diffBlobName,
      JSON.stringify(textDiff, null, 2),
      'application/json'
    );

    const diffTextBlobPath = `${config.storage.containerNames.diffs}/${diffBlobName}`;

    // Create diff record
    const diffRecord: DiffRecord = {
      diffId: uuidv4(),
      policyId: job.policyId,
      fromVersionId: job.fromVersionId,
      toVersionId: job.toVersionId,
      changeScore,
      changeType,
      summaryJson: diffData.summaryJson,
      llmExplanation,
      diffTextBlobPath,
      computedAt: new Date().toISOString(),
    };

    await cosmosService.createDocument('diffs', diffRecord);

    logger.info('Diff computation completed', {
      diffId: diffRecord.diffId,
      changeType,
      changeScore,
    });

    // Trigger alert evaluation if change is significant
    if (changeType !== 'NO_CHANGE') {
      await queueService.sendMessage(config.queues.alert, {
        entityId: diffRecord.diffId,
        entityType: 'diff',
        triggerType: 'policy_update',
      });
    }
  } catch (error) {
    logger.error('Diff computation failed', error);
    throw error;
  }
}

app.storageQueue('computeDiff', {
  queueName: 'diff-computation',
  connection: 'AzureWebJobsStorage',
  handler: computeDiff,
});
