// Queue trigger for processing alerts when diffs are computed

import { app, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { notificationService } from '../../services/notificationService';
import { Document } from '../../types/document';
import { DiffRecord } from '../../types/diff';
import { Alert, Notification } from '../../types/alert';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface AlertMessage {
  entityId: string;  // diffId
  entityType: string;  // 'diff'
  triggerType: string;  // 'policy_update'
}

export async function processAlerts(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const message = JSON.parse(Buffer.from(queueItem as string, 'base64').toString('utf-8')) as AlertMessage;
  const logger = createLogger({
    functionName: 'processAlerts',
    correlationId: context.invocationId,
  });

  try {
    logger.info('Processing alerts', { entityId: message.entityId, triggerType: message.triggerType });

    if (message.entityType !== 'diff' || message.triggerType !== 'policy_update') {
      logger.warn('Unsupported alert type', { message });
      return;
    }

    const diffId = message.entityId;

    // Query for the diff record (we don't know policyId yet)
    const diffs = await cosmosService.queryDocuments<DiffRecord>(
      'diffs',
      'SELECT * FROM c WHERE c.diffId = @diffId',
      [{ name: '@diffId', value: diffId }]
    );

    if (diffs.length === 0) {
      logger.warn('Diff not found', { diffId });
      return;
    }

    const diff = diffs[0];

    // Get the policy document
    const policy = await cosmosService.getDocument<Document>(
      'documents',
      diff.policyId,
      diff.policyId
    );

    if (!policy) {
      logger.warn('Policy not found', { policyId: message.policyId });
      return;
    }

    // Query for matching alerts
    const alerts = await cosmosService.queryDocuments<Alert>(
      'alerts',
      'SELECT * FROM c WHERE c.enabled = true AND c.alertType = "policy_update"'
    );

    logger.info(`Found ${alerts.length} enabled policy_update alerts`);

    for (const alert of alerts) {
      try {
        if (await shouldTriggerAlert(alert, policy, diff, logger)) {
          await sendAlertNotification(alert, policy, diff, logger);
        }
      } catch (error) {
        logger.error(`Failed to process alert ${alert.alertId}`, error);
        // Continue with other alerts
      }
    }

    logger.info('Alert processing completed', { diffId: message.diffId });
  } catch (error) {
    logger.error('Alert processing failed', error);
    throw error;
  }
}

async function shouldTriggerAlert(
  alert: Alert,
  policy: Document,
  diff: DiffRecord,
  logger: any
): Promise<boolean> {
  const criteria = alert.criteria;

  // Check docType
  if (criteria.docType && policy.docType !== criteria.docType) {
    return false;
  }

  // Check tags (policy must have at least one matching tag)
  if (criteria.tags && criteria.tags.length > 0) {
    const policyTags = policy.tags.map(t => t.tag.toLowerCase());
    const hasMatchingTag = criteria.tags.some(tag =>
      policyTags.includes(tag.toLowerCase())
    );
    if (!hasMatchingTag) {
      return false;
    }
  }

  // Check keywords (policy title or URL must contain keyword)
  if (criteria.keywords && criteria.keywords.length > 0) {
    const searchText = `${policy.title} ${policy.sourceUrl}`.toLowerCase();
    const hasMatchingKeyword = criteria.keywords.some(keyword =>
      searchText.includes(keyword.toLowerCase())
    );
    if (!hasMatchingKeyword) {
      return false;
    }
  }

  // Check source pattern (simple substring match)
  if (criteria.sourcePattern && policy.sourceUrl) {
    if (!policy.sourceUrl.toLowerCase().includes(criteria.sourcePattern.toLowerCase())) {
      return false;
    }
  }

  // Check minimum severity
  if (criteria.minSeverity) {
    const severityOrder = { 'NO_CHANGE': 0, 'MINOR': 1, 'MODERATE': 2, 'MAJOR': 3 };
    if (severityOrder[diff.changeType] < severityOrder[criteria.minSeverity]) {
      return false;
    }
  }

  // Check meaningful change only
  if (criteria.meaningfulChangeOnly && diff.changeType === 'NO_CHANGE') {
    return false;
  }

  logger.info('Alert criteria matched', {
    alertId: alert.alertId,
    policyId: policy.id,
    changeType: diff.changeType
  });

  return true;
}

async function sendAlertNotification(
  alert: Alert,
  policy: Document,
  diff: DiffRecord,
  logger: any
): Promise<void> {
  const notificationId = uuidv4();

  const payload = {
    type: 'policy_update' as const,
    policyTitle: policy.title,
    sourceUrl: policy.sourceUrl,
    severity: diff.changeType,
    changeScore: diff.changeScore,
    summaryBullets: diff.llmExplanation?.summaryBullets,
    evidenceSnippets: diff.llmExplanation?.evidenceSnippets,
    diffLink: `https://yourapp.azurestaticapps.net/diffs/${diff.diffId}`,
    impactedTags: diff.llmExplanation?.impactedTags,
    timestamp: new Date().toISOString(),
  };

  // Send to each notification channel
  for (const channel of alert.notificationChannels) {
    try {
      if (channel.type === 'email') {
        await notificationService.sendPolicyUpdateNotification(
          channel.address,
          payload
        );

        logger.info('Notification sent', {
          alertId: alert.alertId,
          channel: channel.type,
          recipient: channel.address
        });
      }
    } catch (error) {
      logger.error('Failed to send notification', {
        alertId: alert.alertId,
        channel: channel.type,
        error
      });
      // Continue with other channels
    }
  }

  // Record notification in Cosmos DB
  const notification: Notification = {
    notificationId,
    alertId: alert.alertId,
    userId: alert.userId,
    entityId: diff.diffId,
    entityType: 'diff',
    payload,
    sentAt: new Date().toISOString(),
    status: 'sent'
  };

  await cosmosService.createDocument('notifications', notification);

  // Update alert's lastTriggered timestamp
  await cosmosService.updateDocument<Alert>(
    'alerts',
    alert.alertId,
    alert.userId,
    {
      lastTriggered: new Date().toISOString()
    }
  );
}

app.storageQueue('processAlerts', {
  queueName: 'alert-evaluation',
  connection: 'AzureWebJobsStorage',
  handler: processAlerts,
});
