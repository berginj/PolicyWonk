// POST /api/ingest/url - Ingest document from URL

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { cosmosService } from '../../services/cosmosService';
import { blobService } from '../../services/blobService';
import { queueService } from '../../services/queueService';
import { fetchService } from '../../services/fetchService';
import { Document, DocType } from '../../types/document';
import { ProcessingJob } from '../../types/job';
import { analyzeLandingPage, VersionInfo } from '../../services/versionDetectionService';
// import { requireAuth, requireAnyRole, Role } from '../../utils/auth';
import { validateRequired, validateUrl, validateEnum } from '../../utils/validation';
import { isAppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/config';

// Extract title from HTML content
function extractTitleFromHtml(html: string, url: string): string {
  // Try to extract <title> tag
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    let title = titleMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    return title.substring(0, 200);
  }

  // Fallback to URL parsing
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/\/$/, '').split('/').pop() || '';
    if (path && path !== '') {
      return path
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
    return urlObj.hostname;
  } catch {
    return url;
  }
}

interface IngestUrlRequest {
  url: string;
  docType: DocType;
  metadata?: Record<string, any>;
}

export async function ingestUrl(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestLogger = createLogger({
    functionName: 'ingestUrl',
    correlationId: context.invocationId,
  });

  try {
    // Authentication disabled for testing - allows anonymous access
    // TODO: Re-enable authentication after initial testing
    // const user = requireAuth(request);
    // requireAnyRole(user, [Role.ADMIN, Role.ANALYST]);

    requestLogger.info('ingestUrl called - authentication bypassed for testing');

    // Parse and validate request
    const body: IngestUrlRequest = await request.json() as IngestUrlRequest;
    validateRequired(body.url, 'url');
    validateUrl(body.url);
    validateRequired(body.docType, 'docType');
    validateEnum(body.docType, ['policy', 'contract'], 'docType');

    requestLogger.info('URL ingestion requested', { url: body.url, docType: body.docType });

    // Fetch content
    const fetchResult = await fetchService.fetchWithRetry(body.url);
    if (!fetchResult) {
      return {
        status: 400,
        jsonBody: { error: 'Failed to fetch URL or content not modified' },
      };
    }


    // Extract title from HTML if not provided
    let title = body.metadata?.title;
    const contentStr = Buffer.isBuffer(fetchResult.content)
      ? fetchResult.content.toString('utf-8')
      : fetchResult.content;

    if (!title && fetchResult.contentType && fetchResult.contentType.includes('html')) {
      title = extractTitleFromHtml(contentStr, body.url);
      requestLogger.info('Extracted title from HTML', { title });
    }
    if (!title) {
      title = body.url;
    }

    // Smart landing page detection
    let landingPageInfo;
    let actualContent = fetchResult.content;
    let actualContentType = fetchResult.contentType || 'application/octet-stream';
    let actualUrl = body.url;
    let isLandingPage = false;
    let downloadUrl: string | undefined;

    if (fetchResult.contentType && fetchResult.contentType.includes('html')) {
      landingPageInfo = await analyzeLandingPage(body.url, contentStr);

      if (landingPageInfo.isLandingPage && landingPageInfo.downloadLinks.length > 0) {
        requestLogger.info('Landing page detected', {
          url: body.url,
          downloadLinksCount: landingPageInfo.downloadLinks.length,
          versionInfo: landingPageInfo.versionInfo,
        });

        // Get best format (PDF preferred)
        const bestLink = landingPageInfo.downloadLinks[0];
        downloadUrl = bestLink.url;

        try {
          // Fetch the actual document
          const docFetchResult = await fetchService.fetchWithRetry(bestLink.url);
          if (docFetchResult) {
            actualContent = docFetchResult.content;
            actualContentType = docFetchResult.contentType || 'application/pdf';
            actualUrl = bestLink.url;
            isLandingPage = true;

            requestLogger.info('Downloaded document from landing page', {
              format: bestLink.format,
              url: bestLink.url,
              size: bestLink.size,
            });
          }
        } catch (error) {
          requestLogger.warn('Failed to download from landing page, using HTML', { error });
          // Continue with HTML content
        }
      }
    }

    // Recompute hash with actual content
    const sha256 = crypto.createHash('sha256').update(actualContent).digest('hex');

    // Check for existing document with same URL and hash
    const canonicalUrl = new URL(body.url).href;
    const existing = await cosmosService.queryDocuments<Document>(
      'documents',
      'SELECT * FROM c WHERE c.canonicalUrl = @url AND c.sha256 = @hash',
      [
        { name: '@url', value: canonicalUrl },
        { name: '@hash', value: sha256 },
      ]
    );

    if (existing.length > 0) {
      requestLogger.info('Document already exists with same content', {
        documentId: existing[0].id,
      });
      return {
        status: 200,
        jsonBody: {
          message: 'Document already ingested with identical content',
          documentId: existing[0].id,
        },
      };
    }

    // Generate document ID
    const documentId = uuidv4();

    // Upload to blob storage
    const config = getConfig();
    const blobName = `${documentId}/${Date.now()}_raw`;
    const rawBlobPath = `${config.storage.containerNames.raw}/${blobName}`;

    await blobService.uploadBlob(
      config.storage.containerNames.raw,
      blobName,
      actualContent,
      actualContentType
    );

    // Create document record
    const document: Document = {
      id: documentId,
      docType: body.docType,
      title: title,
      sourceUrl: body.url,
      canonicalUrl,
      sourceType: 'url',
      rawBlobPath,
      sha256,
      contentType: actualContentType,
      fetchedAt: new Date().toISOString(),
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
      metadata: body.metadata || {},
      tags: [],
      frameworks: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add version tracking fields if landing page was detected
    if (isLandingPage && landingPageInfo) {
      document.isLandingPage = true;
      document.landingPageUrl = body.url;
      document.downloadUrl = downloadUrl;

      // Add version info
      if (landingPageInfo.versionInfo) {
        document.versionInfo = landingPageInfo.versionInfo;
      }

      // Add format info
      if (landingPageInfo.downloadLinks.length > 0) {
        document.formats = {};
        for (const link of landingPageInfo.downloadLinks) {
          document.formats[link.format] = {
            url: link.url,
            blobPath: isLandingPage && link.url === downloadUrl
              ? rawBlobPath
              : `${config.storage.containerNames.raw}/${documentId}/${link.format}`,
            size: link.size,
          };
        }
      }
    }

    // Search for existing versions and create version chain
    if (document.versionInfo) {
      try {
        const existingVersions = await findExistingVersions(document.versionInfo, documentId);

        if (existingVersions.length > 0) {
          requestLogger.info('Found existing versions', {
            count: existingVersions.length,
            series: document.versionInfo.publicationSeries,
          });

          // Link to version chain
          const latestExisting = existingVersions[0];
          document.versionChain = {
            previousVersionId: latestExisting.id,
            relatedVersions: existingVersions.map(v => v.id),
          };

          // Update previous version to point to this one
          await updateVersionChain(latestExisting.id, documentId, requestLogger);

          requestLogger.info('Version chain created', {
            newDocId: documentId,
            previousVersionId: latestExisting.id,
          });
        }
      } catch (error) {
        requestLogger.warn('Failed to create version chain', { error });
        // Continue anyway
      }
    }

    // Enable monitoring for policy documents
    if (body.docType === 'policy') {
      document.monitoringConfig = {
        enabled: true,
        cadence: 'daily',
        nextCheckAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    await cosmosService.createDocument('documents', document);

    // Create processing job
    const job: ProcessingJob = {
      documentId,
      docType: body.docType,
      rawBlobPath,
      contentType: fetchResult.contentType || 'application/octet-stream',
    };

    await queueService.sendMessage(config.queues.processing, job);

    requestLogger.info('Document ingestion initiated', { documentId });

    return {
      status: 202,
      jsonBody: {
        documentId,
        title,
        status: 'pending',
        message: 'Document queued for AI processing (full pipeline)',
      },
    };
  } catch (error: any) {
    if (isAppError(error)) {
      requestLogger.warn('Validation error', { error: error.message });
      return {
        status: error.statusCode,
        jsonBody: { error: error.message },
      };
    }

    requestLogger.error('Unexpected error during URL ingestion', error);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
    };
  }
}

/**
 * Find existing versions of a document series
 */
async function findExistingVersions(versionInfo: VersionInfo, excludeDocId: string): Promise<Document[]> {
  const query = `
    SELECT * FROM c
    WHERE c.versionInfo.publicationSeries = @series
    AND c.id != @excludeId
    ORDER BY c.versionInfo.revision DESC, c.versionInfo.update DESC
  `;

  return await cosmosService.queryDocuments<Document>(
    'documents',
    query,
    [
      { name: '@series', value: versionInfo.publicationSeries },
      { name: '@excludeId', value: excludeDocId },
    ]
  );
}

/**
 * Update version chain to link previous version to new version
 */
async function updateVersionChain(previousDocId: string, nextDocId: string, logger: any): Promise<void> {
  try {
    const prevDoc = await cosmosService.getDocument<Document>('documents', previousDocId, previousDocId);

    prevDoc.versionChain = prevDoc.versionChain || {};
    prevDoc.versionChain.nextVersionId = nextDocId;

    // If there are related versions, add the new one
    if (prevDoc.versionChain.relatedVersions) {
      prevDoc.versionChain.relatedVersions.push(nextDocId);
    } else {
      prevDoc.versionChain.relatedVersions = [nextDocId];
    }

    await cosmosService.updateDocument('documents', previousDocId, prevDoc, previousDocId);

    logger.info('Updated version chain', { previousDocId, nextDocId });
  } catch (error) {
    logger.error('Failed to update version chain', { previousDocId, nextDocId, error });
    throw error;
  }
}

app.http('ingestUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ingest/url',
  handler: ingestUrl,
});
