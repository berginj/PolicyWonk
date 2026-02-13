// Monitoring Service
// Handles periodic checking for document updates and deprecation

import { Document } from '../types/document';
import { fetchService } from './fetchService';
import { cosmosService } from './cosmosService';
import { detectDeprecation, extractNewVersionUrl } from './versionDetectionService';
import { createLogger } from '../utils/logger';

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

    await cosmosService.updateDocument('documents', documentId, document, documentId);

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

      // TODO: Create alert for user
      // TODO: Auto-ingest new version if newVersionUrl is provided

      return {
        hasChanges: true,
        isDeprecated: true,
        newVersionUrl: deprecationStatus.newVersionUrl,
      };
    }

    // TODO: Check for content changes (compare hash)
    // This would involve fetching the document again and comparing

    // Update next check time
    if (document.monitoringConfig) {
      const cadenceMs = getCadenceMilliseconds(document.monitoringConfig.cadence);
      document.monitoringConfig.nextCheckAt = new Date(Date.now() + cadenceMs).toISOString();
      await cosmosService.updateDocument('documents', documentId, document, documentId);
    }

    return { hasChanges: false, isDeprecated: false };
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
