// DELETE /api/documents/:id - Delete a document and all related data

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { blobService } from '../../services/blobService';
import { Document } from '../../types/document';
import { isAppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

export async function deleteDocument(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestLogger = createLogger({
    functionName: 'deleteDocument',
    correlationId: context.invocationId,
  });

  try {
    // Get document ID from route parameters
    const documentId = request.params.id;

    if (!documentId) {
      return {
        status: 400,
        jsonBody: { error: 'Document ID is required' }
      };
    }

    requestLogger.info('Document deletion requested', { documentId });

    // Get the document first to check if it exists and get metadata
    const documents = await cosmosService.queryDocuments<Document>(
      'documents',
      'SELECT * FROM c WHERE c.id = @id',
      [{ name: '@id', value: documentId }]
    );

    if (documents.length === 0) {
      return {
        status: 404,
        jsonBody: { error: 'Document not found' }
      };
    }

    const document = documents[0];

    // Delete from Cosmos DB (document, versions, diffs, alerts)
    // Using batch delete for better performance
    let versionsResult = { deleted: 0, failed: 0 };
    let diffsResult = { deleted: 0, failed: 0 };
    let alertsResult = { deleted: 0, failed: 0 };

    try {
      // Delete the main document first
      await cosmosService.deleteDocument('documents', documentId, documentId);
      requestLogger.info('Document deleted from Cosmos DB', { documentId });

      // Delete all related data in parallel using batch delete
      const [versionsRes, diffsRes, alertsRes] = await Promise.all([
        // Delete all versions for this document
        cosmosService.deleteByQuery(
          'versions',
          'SELECT * FROM c WHERE c.policyId = @policyId',
          [{ name: '@policyId', value: documentId }],
          (doc) => doc.policyId as string,
          10 // concurrency
        ),
        // Delete all diffs for this document
        cosmosService.deleteByQuery(
          'diffs',
          'SELECT * FROM c WHERE c.policyId = @policyId',
          [{ name: '@policyId', value: documentId }],
          (doc) => doc.policyId as string,
          10
        ),
        // Delete alerts related to this document
        cosmosService.deleteByQuery(
          'alerts',
          'SELECT * FROM c WHERE c.policyId = @policyId',
          [{ name: '@policyId', value: documentId }],
          (doc) => doc.userId as string,
          10
        ),
      ]);

      versionsResult = versionsRes;
      diffsResult = diffsRes;
      alertsResult = alertsRes;

      requestLogger.info('Related data deleted', {
        versions: versionsResult,
        diffs: diffsResult,
        alerts: alertsResult,
      });

    } catch (cosmosError: any) {
      requestLogger.error('Failed to delete from Cosmos DB', cosmosError);
      // Continue anyway - we'll try to delete blobs
    }

    // Delete blobs
    try {
      if (document.rawBlobPath) {
        const pathParts = document.rawBlobPath.split('/');
        if (pathParts.length >= 2) {
          const containerName = pathParts[0];
          const blobName = pathParts.slice(1).join('/');
          await blobService.deleteBlob(containerName, blobName);
          requestLogger.info('Raw blob deleted', { blobPath: document.rawBlobPath });
        }
      }
    } catch (blobError: any) {
      requestLogger.warn('Failed to delete some blobs', { error: blobError.message });
      // Continue anyway
    }

    requestLogger.info('Document deletion completed', { documentId });

    return {
      status: 200,
      jsonBody: {
        message: 'Document and related data deleted successfully',
        documentId,
        deletedItems: {
          document: 1,
          versions: versionsResult.deleted,
          diffs: diffsResult.deleted,
          alerts: alertsResult.deleted,
        },
        failedDeletes: {
          versions: versionsResult.failed,
          diffs: diffsResult.failed,
          alerts: alertsResult.failed,
        },
      }
    };

  } catch (error: any) {
    if (isAppError(error)) {
      requestLogger.warn('Validation error', { error: error.message });
      return {
        status: error.statusCode,
        jsonBody: { error: error.message },
      };
    }

    requestLogger.error('Unexpected error during document deletion', error);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error', message: error.message },
    };
  }
}

app.http('deleteDocument', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'documents/{id}',
  handler: deleteDocument,
});
