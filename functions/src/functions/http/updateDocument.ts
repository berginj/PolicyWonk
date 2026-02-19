// PATCH /api/documents/{id} - Update document metadata (title, tags, etc.)

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { Document } from '../../types/document';
import { createLogger } from '../../utils/logger';
import { isAppError } from '../../utils/errors';
import { validateDocumentId, validateStringLength, validateArray } from '../../utils/validation';

interface UpdateDocumentRequest {
  title?: string;
  tags?: Array<{ tag: string; confidence: number; evidence: string }>;
  metadata?: Record<string, unknown>;
}

export async function updateDocument(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestLogger = createLogger({
    functionName: 'updateDocument',
    correlationId: context.invocationId,
  });

  const rawDocumentId = request.params.id;
  const documentId = validateDocumentId(rawDocumentId);

  if (!documentId) {
    return {
      status: 400,
      jsonBody: { error: 'Valid document ID is required' }
    };
  }

  requestLogger.info('Document update requested', { documentId });

  try {
    const body = await request.json() as UpdateDocumentRequest;

    // Validate at least one field is provided
    if (!body.title && !body.tags && !body.metadata) {
      return {
        status: 400,
        jsonBody: { error: 'At least one field (title, tags, metadata) must be provided' }
      };
    }

    // Validate title length if provided
    if (body.title !== undefined) {
      try {
        validateStringLength(body.title, 1, 500, 'title');
      } catch (validationError: unknown) {
        return {
          status: 400,
          jsonBody: { error: validationError instanceof Error ? validationError.message : 'Invalid title' }
        };
      }
    }

    // Validate tags array if provided
    if (body.tags !== undefined) {
      try {
        validateArray(body.tags, 'tags', { maxLength: 50 });
      } catch (validationError: unknown) {
        return {
          status: 400,
          jsonBody: { error: validationError instanceof Error ? validationError.message : 'Invalid tags' }
        };
      }
    }

    // Check if document exists
    const existingDoc = await cosmosService.getDocument<Document>(
      'documents',
      documentId,
      documentId
    );

    if (!existingDoc) {
      return {
        status: 404,
        jsonBody: { error: 'Document not found' }
      };
    }

    // Build update object with only provided fields
    const updates: Partial<Document> = {};

    if (body.title !== undefined) {
      updates.title = body.title;
    }

    if (body.tags !== undefined) {
      updates.tags = body.tags;
      // Update frameworks based on tags
      const frameworks = ['FedRAMP', 'NIST', 'ISO27001', 'SOC2', 'HIPAA', 'GDPR', 'PCI-DSS', 'Zero Trust'];
      updates.frameworks = body.tags
        .filter(t => frameworks.some(f => t.tag.toLowerCase().includes(f.toLowerCase())))
        .map(t => t.tag);
    }

    if (body.metadata !== undefined) {
      updates.metadata = { ...existingDoc.metadata, ...body.metadata };
    }

    // Perform the update
    const updatedDocument = await cosmosService.updateDocument<Document>(
      'documents',
      documentId,
      documentId,
      updates
    );

    requestLogger.info('Document updated successfully', {
      documentId,
      fieldsUpdated: Object.keys(updates),
    });

    return {
      status: 200,
      jsonBody: {
        message: 'Document updated successfully',
        document: updatedDocument,
      }
    };
  } catch (error: unknown) {
    if (isAppError(error)) {
      requestLogger.warn('Validation error during document update', { error: (error as Error).message });
      return {
        status: (error as { statusCode: number }).statusCode,
        jsonBody: { error: (error as Error).message }
      };
    }

    requestLogger.error('Failed to update document', error);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' }
    };
  }
}

app.http('updateDocument', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'documents/{id}',
  handler: updateDocument,
});
