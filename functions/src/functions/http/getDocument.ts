// GET /api/documents/:id - Get a single document by ID

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { Document } from '../../types/document';
import { isAppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

export async function getDocument(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestLogger = createLogger({
    functionName: 'getDocument',
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

    requestLogger.info('Fetching document', { documentId });

    // Get the document from Cosmos DB
    try {
      const document = await cosmosService.getDocument<Document>(
        'documents',
        documentId,
        documentId
      );

      requestLogger.info('Document fetched successfully', { documentId });

      return {
        status: 200,
        jsonBody: document,
      };
    } catch (error: any) {
      if (error.code === 404 || error.statusCode === 404) {
        requestLogger.warn('Document not found', { documentId });
        return {
          status: 404,
          jsonBody: { error: 'Document not found' }
        };
      }
      throw error;
    }
  } catch (error: any) {
    if (isAppError(error)) {
      requestLogger.warn('Validation error', { error: error.message });
      return {
        status: error.statusCode,
        jsonBody: { error: error.message },
      };
    }

    requestLogger.error('Unexpected error fetching document', error);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error', message: error.message },
    };
  }
}

app.http('getDocument', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'documents/{id}',
  handler: getDocument,
});

