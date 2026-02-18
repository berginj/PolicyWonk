// Monitoring Service
// Handles periodic checking for document updates and deprecation

import { Document } from '../types/document';
import { NotificationPayload } from '../types/alert';
import { fetchService } from './fetchService';
import { cosmosService } from './cosmosService';
import { queueService } from './queueService';
import { detectDeprecation, extractNewVersionUrl } from './versionDetectionService';
import { createLogger } from '../utils/logger';
import { getConfig } from '../utils/config';
import crypto from 'crypto';

const logger = createLogger({ functionName: 'monitoringService' });

export interface DeprecationStatus {
  isDeprecated: boolean;
  newVersionUrl?: string;
  deprecationNotice?: string;
}

/**
 * Check if a document has been deprecated/superseded
 * Monitors the landing page for deprecation notices
 */
export async function checkForDeprecation(document: Document): Promise<DeprecationStatus> {
  if (!document.landingPageUrl) {
    return { isDeprecated: false };
  }

  try {
    logger.info('Checking for deprecation', {
      documentId: document.id,
      landingPageUrl: document.landingPageUrl,
    });

    // Fetch the landing page again
    const fetchResult = await fetchService.fetchWithRetry(document.landingPageUrl);
    if (!fetchResult) {
      logger.warn('Failed to fetch landing page for deprecation check', {
        documentId: document.id,
      });
      return { isDeprecated: false };
    }

    const html = Buffer.isBuffer(fetchResult.content)
      ? fetchResult.content.toString('utf-8')
      : fetchResult.content;

    // Check for deprecation notice
    const deprecation = detectDeprecation(html);

    if (deprecation.isDeprecated) {
      logger.info('Deprecation detected', {
        documentId: document.id,
        notice: deprecation.notice?.substring(0, 200),
        supersededBy: deprecation.supersededBy,
      });

      // Try to find the new version URL
      const newVersionUrl = extractNewVersionUrl(html, deprecation.supersededBy);

      return {
        isDeprecated: true,
        newVersionUrl,
        deprecationNotice: deprecation.notice,
      };
    }

    logger.info('No deprecation detected', { documentId: document.id });
    return { isDeprecated: false };
  } catch (error) {
    logger.error('Error checking for deprecation', { documentId: document.id, error });
    return { isDeprecated: false };
  }
}

/**
 * Update document status to superseded
 */
export async function markDocumentAsSuperseded(
  documentId: string,
  supersededBy?: string,
  deprecationNotice?: string
): Promise<void> {
  try {
    const document = await cosmosService.getDocument<Document>('documents', documentId, documentId);

    if (!document) {
      logger.warn('Document not found for superseded marking', { documentId });
      return;
    }

    // Update version info
    if (!document.versionInfo) {
      document.versionInfo = {
        publicationSeries: '',
        revision: '',
        update: '',
        status: 'superseded',
      };
    } else {
      document.versionInfo.status = 'superseded';
    }

    document.versionInfo.supersededDate = new Date().toISOString();

    // Update version chain if we know what supersedes this
    if (supersededBy) {
      document.versionChain = document.versionChain || {};
      document.versionChain.supersededBy = supersededBy;
    }

    // Add deprecation notice to metadata
    if (deprecationNotice) {
      document.metadata = document.metadata || {};
      document.metadata.deprecationNotice = deprecationNotice;
    }

    document.updatedAt = new Date().toISOString();

    await cosmosService.updateDocument('documents', document.id, document.id, document);

    logger.info('Document marked as superseded', {
      documentId,
      supersededBy,
    });
  } catch (error) {
    logger.error('Failed to mark document as superseded', { documentId, error });
    throw error;
  }
}

/**
 * Monitor a document for changes
 * This function will be called by a periodic timer trigger
 */
export async function monitorDocument(documentId: string): Promise<{
  hasChanges: boolean;
  isDeprecated: boolean;
  newVersionUrl?: string;
}> {
  try {
    logger.info('Monitoring document', { documentId });

    const document = await cosmosService.getDocument<Document>('documents', documentId, documentId);

    if (!document) {
      logger.warn('Document not found for monitoring', { documentId });
      return { hasChanges: false, isDeprecated: false };
    }

    // Check if monitoring is enabled
    if (!document.monitoringConfig?.enabled) {
      logger.info('Monitoring disabled for document', { documentId });
      return { hasChanges: false, isDeprecated: false };
    }

    // Check for deprecation
    const deprecationStatus = await checkForDeprecation(document);

    if (deprecationStatus.isDeprecated) {
      await markDocumentAsSuperseded(
        documentId,
        undefined, // We don't have the superseding document ID yet
        deprecationStatus.deprecationNotice
      );

      // Create deprecation alert notification
      await createDeprecationAlert(document, deprecationStatus);

      // Auto-ingest new version if URL is available
      if (deprecationStatus.newVersionUrl) {
        await triggerAutoIngest(document, deprecationStatus.newVersionUrl);
      }

      return {
        hasChanges: true,
        isDeprecated: true,
        newVersionUrl: deprecationStatus.newVersionUrl,
      };
    }

    // Check for content changes (compare hash)
    const contentChangeStatus = await checkForContentChanges(document);

    // Update next check time and content changes
    if (document.monitoringConfig) {
      const cadenceMs = getCadenceMilliseconds(document.monitoringConfig.cadence);
      document.monitoringConfig.nextCheckAt = new Date(Date.now() + cadenceMs).toISOString();

      // If content changed, update the hash and trigger re-processing
      if (contentChangeStatus.hasChanges && contentChangeStatus.newHash) {
        logger.info('Content change detected, triggering re-ingestion', {
          documentId: document.id,
        });

        // Trigger re-ingestion of the document
        const config = getConfig();
        await queueService.sendMessage(config.queues.ingest || 'document-ingestion', {
          type: 'content_update',
          url: document.downloadUrl || document.sourceUrl,
          documentId: document.id,
          previousHash: document.sha256,
          newHash: contentChangeStatus.newHash,
        });
      }

      await cosmosService.updateDocument('documents', document.id, document.id, document);
    }

    return {
      hasChanges: contentChangeStatus.hasChanges,
      isDeprecated: false,
    };
  } catch (error) {
    logger.error('Error monitoring document', { documentId, error });
    return { hasChanges: false, isDeprecated: false };
  }
}

/**
 * Convert cadence to milliseconds
 */
function getCadenceMilliseconds(cadence: 'daily' | 'weekly' | 'monthly'): number {
  switch (cadence) {
    case 'daily':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Create a deprecation alert notification for users monitoring this document
 */
async function createDeprecationAlert(
  document: Document,
  deprecationStatus: DeprecationStatus
): Promise<void> {
  try {
    const config = getConfig();

    const notificationPayload: NotificationPayload = {
      type: 'deprecation',
      policyTitle: document.title,
      sourceUrl: document.sourceUrl,
      timestamp: new Date().toISOString(),
      deprecationNotice: deprecationStatus.deprecationNotice,
      newVersionUrl: deprecationStatus.newVersionUrl,
      summaryBullets: [
        `${document.title} has been superseded`,
        deprecationStatus.newVersionUrl
          ? `A new version is available at: ${deprecationStatus.newVersionUrl}`
          : 'Please check for updated guidance',
      ],
    };

    // Queue the notification for processing
    await queueService.sendMessage(config.queues.alerts || config.queues.alert, {
      type: 'deprecation_notification',
      documentId: document.id,
      payload: notificationPayload,
    });

    logger.info('Deprecation alert created', {
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    logger.error('Failed to create deprecation alert', {
      documentId: document.id,
      error,
    });
    // Don't throw - alert failure shouldn't stop monitoring
  }
}

/**
 * Trigger automatic ingestion of a new version when deprecation is detected
 */
async function triggerAutoIngest(
  oldDocument: Document,
  newVersionUrl: string
): Promise<void> {
  try {
    const config = getConfig();

    logger.info('Triggering auto-ingest for new version', {
      oldDocumentId: oldDocument.id,
      newVersionUrl,
    });

    // Queue the new document for ingestion
    await queueService.sendMessage(config.queues.ingest || 'document-ingestion', {
      type: 'auto_ingest',
      url: newVersionUrl,
      docType: oldDocument.docType,
      previousVersionId: oldDocument.id,
      metadata: {
        title: `Updated: ${oldDocument.title}`,
        autoIngestedFrom: oldDocument.id,
        autoIngestedAt: new Date().toISOString(),
      },
    });

    logger.info('Auto-ingest queued', {
      oldDocumentId: oldDocument.id,
      newVersionUrl,
    });
  } catch (error) {
    logger.error('Failed to trigger auto-ingest', {
      oldDocumentId: oldDocument.id,
      newVersionUrl,
      error,
    });
    // Don't throw - auto-ingest failure shouldn't stop monitoring
  }
}

/**
 * Check if document content has changed by comparing hashes
 */
async function checkForContentChanges(document: Document): Promise<{
  hasChanges: boolean;
  newHash?: string;
}> {
  try {
    // Need a URL to check for changes
    const urlToCheck = document.downloadUrl || document.sourceUrl;
    if (!urlToCheck) {
      return { hasChanges: false };
    }

    logger.info('Checking for content changes', {
      documentId: document.id,
      url: urlToCheck,
    });

    // Fetch the current content
    const fetchResult = await fetchService.fetchWithRetry(urlToCheck);
    if (!fetchResult) {
      logger.warn('Failed to fetch content for change detection', {
        documentId: document.id,
      });
      return { hasChanges: false };
    }

    // Calculate hash of new content
    const newHash = crypto
      .createHash('sha256')
      .update(fetchResult.content)
      .digest('hex');

    // Compare with stored hash
    if (document.sha256 && newHash !== document.sha256) {
      logger.info('Content change detected', {
        documentId: document.id,
        oldHash: document.sha256?.substring(0, 16),
        newHash: newHash.substring(0, 16),
      });

      return {
        hasChanges: true,
        newHash,
      };
    }

    return { hasChanges: false };
  } catch (error) {
    logger.error('Error checking for content changes', {
      documentId: document.id,
      error,
    });
    return { hasChanges: false };
  }
}
