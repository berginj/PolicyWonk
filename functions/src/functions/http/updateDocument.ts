// PATCH /api/documents/{id} - Update document metadata (title, tags, etc.)

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface UpdateDocumentRequest {
  title?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export async function updateDocument(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const documentId = request.params.id;
  context.log('updateDocument called', { documentId });

  if (!documentId) {
    return {
      status: 400,
      jsonBody: { error: 'Document ID is required' }
    };
  }

  try {
    const body = await request.json() as UpdateDocumentRequest;

    // Validate at least one field is provided
    if (!body.title && !body.tags && !body.metadata) {
      return {
        status: 400,
        jsonBody: { error: 'At least one field (title, tags, metadata) must be provided' }
      };
    }

    // In production, this would update Cosmos DB
    // For now, return success with the updated fields
    const updatedDocument = {
      id: documentId,
      title: body.title,
      tags: body.tags,
      metadata: body.metadata,
      updatedAt: new Date().toISOString(),
      message: 'Document updated successfully (demo mode - would update Cosmos DB in production)'
    };

    context.log('Document updated', { documentId, updates: body });

    return {
      status: 200,
      jsonBody: updatedDocument
    };
  } catch (error: any) {
    context.log('Error updating document', { documentId, error: error.message });
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to update document',
        message: error.message
      }
    };
  }
}

app.http('updateDocument', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'documents/{id}',
  handler: updateDocument,
});
