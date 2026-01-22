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
import { requireAuth, requireAnyRole, Role } from '../../utils/auth';
import { validateRequired, validateUrl, validateEnum } from '../../utils/validation';
import { isAppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/config';

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
    // Authentication
    const user = requireAuth(request);
    requireAnyRole(user, [Role.ADMIN, Role.ANALYST]);

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

    // Compute hash
    const sha256 = crypto.createHash('sha256').update(fetchResult.content).digest('hex');

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
      fetchResult.content,
      fetchResult.contentType
    );

    // Create document record
    const document: Document = {
      id: documentId,
      docType: body.docType,
      title: body.metadata?.title || body.url,
      sourceUrl: body.url,
      canonicalUrl,
      sourceType: 'url',
      rawBlobPath,
      sha256,
      contentType: fetchResult.contentType || 'application/octet-stream',
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
        status: 'pending',
        message: 'Document ingestion initiated',
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

app.http('ingestUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ingest/url',
  handler: ingestUrl,
});
