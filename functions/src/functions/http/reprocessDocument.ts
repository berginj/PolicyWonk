// POST /api/admin/reprocess - Manually trigger document processing (bypasses queue)

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { blobService } from '../../services/blobService';
import { documentIntelligenceService } from '../../services/documentIntelligenceService';
import { openaiService } from '../../services/openaiService';
import { searchService } from '../../services/searchService';
import { normalizationProcessor } from '../../processors/normalizationProcessor';
import { Document } from '../../types/document';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/config';
import { isAppError } from '../../utils/errors';

interface ReprocessRequest {
  documentId?: string;
  processAll?: boolean;
  limit?: number;
}

interface ProcessingResult {
  documentId: string;
  title: string;
  status: 'success' | 'failed';
  message: string;
  tags?: string[];
  errorCategory?: string;
}

export async function reprocessDocument(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestLogger = createLogger({
    functionName: 'reprocessDocument',
    correlationId: context.invocationId,
  });

  try {
    const body = await request.json() as ReprocessRequest;
    const results: ProcessingResult[] = [];

    let documentsToProcess: Document[] = [];

    if (body.documentId) {
      // Process single document
      const doc = await cosmosService.getDocument<Document>(
        'documents',
        body.documentId,
        body.documentId
      );

      if (!doc) {
        return {
          status: 404,
          jsonBody: { error: 'Document not found', documentId: body.documentId },
        };
      }

      documentsToProcess = [doc];
    } else if (body.processAll) {
      // Process all pending documents
      const limit = body.limit || 10;
      documentsToProcess = await cosmosService.queryDocuments<Document>(
        'documents',
        'SELECT * FROM c WHERE c.status = @status ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit',
        [
          { name: '@status', value: 'pending' },
          { name: '@limit', value: limit },
        ]
      );

      if (documentsToProcess.length === 0) {
        return {
          status: 200,
          jsonBody: { message: 'No pending documents found', processed: 0 },
        };
      }
    } else {
      return {
        status: 400,
        jsonBody: { error: 'Either documentId or processAll must be provided' },
      };
    }

    requestLogger.info('Starting manual reprocessing', {
      documentCount: documentsToProcess.length,
    });

    // Process each document
    for (const doc of documentsToProcess) {
      const result = await processDocumentDirectly(doc, requestLogger);
      results.push(result);
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    requestLogger.info('Manual reprocessing completed', {
      total: results.length,
      success: successCount,
      failed: failedCount,
    });

    return {
      status: 200,
      jsonBody: {
        message: `Processed ${results.length} document(s)`,
        summary: {
          total: results.length,
          success: successCount,
          failed: failedCount,
        },
        results,
      },
    };
  } catch (error: unknown) {
    if (isAppError(error)) {
      return {
        status: (error as { statusCode: number }).statusCode,
        jsonBody: { error: (error as Error).message },
      };
    }

    requestLogger.error('Unexpected error during reprocessing', error);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
    };
  }
}

async function processDocumentDirectly(
  doc: Document,
  logger: ReturnType<typeof createLogger>
): Promise<ProcessingResult> {
  const config = getConfig();

  try {
    logger.info('Processing document', { documentId: doc.id, title: doc.title });

    // Update status to processing
    await cosmosService.updateDocument<Document>(
      'documents',
      doc.id,
      doc.id,
      { status: 'processing' }
    );

    // Download raw content
    const blobPath = doc.rawBlobPath.split('/').slice(1).join('/');
    const rawContent = await blobService.downloadBlob(
      config.storage.containerNames.raw,
      blobPath
    );

    // Extract text based on content type
    let extractedText: string;

    if (doc.contentType?.includes('pdf')) {
      const result = await documentIntelligenceService.extractTextFromPdf(rawContent);
      extractedText = result.text;
      logger.info('Extracted text from PDF', { documentId: doc.id, pages: result.pages });
    } else if (
      doc.contentType?.includes('word') ||
      doc.contentType?.includes('officedocument')
    ) {
      const result = await documentIntelligenceService.extractTextFromDocx(rawContent);
      extractedText = result.text;
      logger.info('Extracted text from DOCX', { documentId: doc.id, pages: result.pages });
    } else if (doc.contentType?.includes('html')) {
      extractedText = normalizationProcessor.normalizeHtml(rawContent.toString('utf-8'));
      logger.info('Extracted text from HTML', { documentId: doc.id });
    } else {
      extractedText = rawContent.toString('utf-8');
      logger.info('Using raw text', { documentId: doc.id });
    }

    // Normalize text
    const normalizedText = normalizationProcessor.normalize(extractedText);

    // Upload extracted text
    const extractedBlobName = `${doc.id}/${Date.now()}_extracted.txt`;
    await blobService.uploadBlob(
      config.storage.containerNames.extracted,
      extractedBlobName,
      normalizedText,
      'text/plain'
    );

    const extractedTextBlobPath = `${config.storage.containerNames.extracted}/${extractedBlobName}`;

    // Update document with extracted text path
    await cosmosService.updateDocument<Document>(
      'documents',
      doc.id,
      doc.id,
      { extractedTextBlobPath }
    );

    // Generate embeddings for chunks
    const chunkSize = 512;
    const chunks = chunkText(normalizedText, chunkSize);
    const embeddings = await openaiService.generateEmbeddings(
      chunks.map((c) => c.text)
    );

    // Generate tags using LLM
    const tags = await generateTags(normalizedText.substring(0, 2000));

    // Detect frameworks from tags
    const frameworks = tags.filter((t) => isFramework(t.tag)).map((t) => t.tag);

    // Index in search
    await searchService.indexDocument({
      id: doc.id,
      title: doc.title,
      docType: doc.docType,
      tags: tags.map((t) => t.tag),
      frameworks,
      contentVector: embeddings[0] || [],
      chunks: chunks.map((c, idx) => ({
        chunkId: `${doc.id}_chunk_${idx}`,
        text: c.text,
        chunkVector: embeddings[idx] || [],
      })),
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
    });

    // Update document with tags and completed status
    await cosmosService.updateDocument<Document>(
      'documents',
      doc.id,
      doc.id,
      {
        tags,
        frameworks,
        status: 'completed',
      }
    );

    logger.info('Document processing completed', {
      documentId: doc.id,
      tagCount: tags.length,
      frameworkCount: frameworks.length,
    });

    return {
      documentId: doc.id,
      title: doc.title,
      status: 'success',
      message: `Processed successfully. ${tags.length} tags, ${frameworks.length} frameworks detected.`,
      tags: tags.map(t => t.tag),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Classify error
    let errorCategory = 'unknown';
    if (errorMessage.includes('blob') || errorMessage.includes('download')) {
      errorCategory = 'storage_error';
    } else if (errorMessage.includes('extract') || errorMessage.includes('Document Intelligence')) {
      errorCategory = 'extraction_error';
    } else if (errorMessage.includes('embed') || errorMessage.includes('OpenAI')) {
      errorCategory = 'ai_error';
    } else if (errorMessage.includes('index') || errorMessage.includes('search')) {
      errorCategory = 'search_error';
    } else if (errorMessage.includes('Cosmos') || errorMessage.includes('database')) {
      errorCategory = 'database_error';
    }

    logger.error('Document processing failed', {
      documentId: doc.id,
      errorCategory,
      errorMessage,
    });

    // Update document status to failed
    try {
      await cosmosService.updateDocument<Document>(
        'documents',
        doc.id,
        doc.id,
        {
          status: 'failed',
          errorMessage: `[${errorCategory}] ${errorMessage}`,
        }
      );
    } catch {
      // Ignore update error
    }

    return {
      documentId: doc.id,
      title: doc.title,
      status: 'failed',
      message: errorMessage,
      errorCategory,
    };
  }
}

function chunkText(
  text: string,
  chunkSize: number
): Array<{ text: string; offset: number }> {
  const chunks: Array<{ text: string; offset: number }> = [];
  const words = text.split(/\s+/);
  let currentChunk: string[] = [];
  let currentLength = 0;
  let offset = 0;

  for (const word of words) {
    if (currentLength + word.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join(' '),
        offset,
      });
      currentChunk = [word];
      currentLength = word.length;
      offset += chunks[chunks.length - 1].text.length + 1;
    } else {
      currentChunk.push(word);
      currentLength += word.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join(' '),
      offset,
    });
  }

  return chunks;
}

async function generateTags(
  text: string
): Promise<Array<{ tag: string; confidence: number; evidence: string }>> {
  const prompt = [
    {
      role: 'system',
      content:
        'You are a compliance and policy tagging system. Identify relevant compliance frameworks, security standards, and key topics.',
    },
    {
      role: 'user',
      content: `Analyze this document excerpt and return relevant tags as JSON array:\n\n${text}\n\nReturn: {"tags": [{"tag": "FedRAMP", "confidence": 0.95, "evidence": "mentions FedRAMP requirements"}]}`,
    },
  ];

  try {
    const result = await openaiService.chatWithJson<{
      tags: Array<{ tag: string; confidence: number; evidence: string }>;
    }>(prompt);
    return result.tags || [];
  } catch {
    return [];
  }
}

function isFramework(tag: string): boolean {
  const frameworks = [
    'FedRAMP',
    'NIST',
    'ISO27001',
    'SOC2',
    'HIPAA',
    'GDPR',
    'PCI-DSS',
    'Zero Trust',
  ];
  return frameworks.some((f) => tag.toLowerCase().includes(f.toLowerCase()));
}

app.http('reprocessDocument', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/reprocess',
  handler: reprocessDocument,
});
