// Queue trigger for document processing

import { app, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { blobService } from '../../services/blobService';
import { queueService, decodeQueueMessage } from '../../services/queueService';
import { documentIntelligenceService } from '../../services/documentIntelligenceService';
import { openaiService } from '../../services/openaiService';
import { searchService } from '../../services/searchService';
import { normalizationProcessor } from '../../processors/normalizationProcessor';
import { structureProcessor } from '../../processors/structureProcessor';
import { ProcessingJob } from '../../types/job';
import { Document } from '../../types/document';
import { PolicyVersion } from '../../types/version';
import { createLogger } from '../../utils/logger';
import { getConfig } from '../../utils/config';

export async function processDocument(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  // Initialize logger for early errors
  let logger = createLogger({
    functionName: 'processDocument',
    correlationId: context.invocationId,
  });

  // Parse and validate queue message
  let job: ProcessingJob;

  try {
    const parsed = decodeQueueMessage<ProcessingJob>(queueItem);

    if (!parsed.documentId || !parsed.rawBlobPath || !parsed.contentType) {
      throw new Error(`Invalid job message: missing required fields. Got: ${Object.keys(parsed).join(', ')}`);
    }

    job = parsed;
  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    logger.error('Failed to parse queue message', { error: errorMessage });
    throw parseError;
  }

  // Update logger with document context
  logger = createLogger({
    functionName: 'processDocument',
    correlationId: context.invocationId,
    documentId: job.documentId,
  });

  try {
    // Idempotency check: Skip if document is already completed or currently processing
    const existingDoc = await cosmosService.getDocument<Document>(
      'documents',
      job.documentId,
      job.documentId
    );

    if (!existingDoc) {
      logger.warn('Document not found, skipping processing', { documentId: job.documentId });
      return;
    }

    if (existingDoc.status === 'completed') {
      logger.info('Document already completed, skipping', { documentId: job.documentId });
      return;
    }

    // Check if already being processed by another instance
    // (within 5 minutes to handle stale processing states)
    if (existingDoc.status === 'processing') {
      const updatedAt = new Date(existingDoc.updatedAt).getTime();
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      if (updatedAt > fiveMinutesAgo) {
        logger.info('Document already being processed, skipping', {
          documentId: job.documentId,
          updatedAt: existingDoc.updatedAt,
        });
        return;
      }
      // Processing state is stale, continue with processing
      logger.warn('Stale processing state detected, retrying', { documentId: job.documentId });
    }

    logger.info('Processing document', { documentId: job.documentId, contentType: job.contentType });

    // Update status to processing
    await cosmosService.updateDocument<Document>(
      'documents',
      job.documentId,
      job.documentId,
      { status: 'processing' }
    );

    // Download raw content
    const config = getConfig();
    const rawContent = await blobService.downloadBlob(
      config.storage.containerNames.raw,
      job.rawBlobPath.split('/').slice(1).join('/')
    );

    // Extract text
    let extractedText: string;
    if (job.contentType.includes('pdf')) {
      const result = await documentIntelligenceService.extractTextFromPdf(rawContent);
      extractedText = result.text;
      logger.info('Extracted text from PDF', { pages: result.pages });
    } else if (
      job.contentType.includes('word') ||
      job.contentType.includes('officedocument')
    ) {
      const result = await documentIntelligenceService.extractTextFromDocx(rawContent);
      extractedText = result.text;
      logger.info('Extracted text from DOCX', { pages: result.pages });
    } else if (job.contentType.includes('html')) {
      extractedText = normalizationProcessor.normalizeHtml(rawContent.toString('utf-8'));
      logger.info('Extracted text from HTML');
    } else {
      extractedText = rawContent.toString('utf-8');
      logger.info('Using raw text');
    }

    // Normalize text
    const normalizedText = normalizationProcessor.normalize(extractedText);

    // Extract structure
    const sections = structureProcessor.extractSections(normalizedText);

    // Upload extracted text
    const extractedBlobName = `${job.documentId}/${Date.now()}_extracted.txt`;
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
      job.documentId,
      job.documentId,
      { extractedTextBlobPath }
    );

    // Generate embeddings for chunks
    const chunkSize = 512;
    const chunks = chunkText(normalizedText, chunkSize);
    const embeddings = await openaiService.generateEmbeddings(
      chunks.map((c) => c.text)
    );

    // Generate tags using LLM
    const tags = await generateTags(normalizedText.substring(0, 2000), logger);

    // Index in search
    await searchService.indexDocument({
      id: job.documentId,
      title: (await cosmosService.getDocument<Document>(
        'documents',
        job.documentId,
        job.documentId
      ))!.title,
      docType: job.docType,
      tags: tags.map((t) => t.tag),
      frameworks: tags.filter((t) => isFramework(t.tag)).map((t) => t.tag),
      contentVector: embeddings[0] || [],
      chunks: chunks.map((c, idx) => ({
        chunkId: `${job.documentId}_chunk_${idx}`,
        text: c.text,
        chunkVector: embeddings[idx] || [],
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Update document with tags
    await cosmosService.updateDocument<Document>(
      'documents',
      job.documentId,
      job.documentId,
      {
        tags,
        frameworks: tags.filter((t) => isFramework(t.tag)).map((t) => t.tag),
        status: 'completed',
      }
    );

    // If this is a policy update, create version and diff
    if (job.isUpdate && job.versionId) {
      await handlePolicyUpdate(job, normalizedText, sections);
    }

    logger.info('Document processing completed', { documentId: job.documentId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Classify error for better debugging
    let errorCategory = 'unknown';
    if (errorMessage.includes('Failed to download') || errorMessage.includes('blob')) {
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
      documentId: job.documentId,
      errorCategory,
      errorMessage,
      errorStack,
    });

    // Update document status to failed
    try {
      await cosmosService.updateDocument<Document>(
        'documents',
        job.documentId,
        job.documentId,
        {
          status: 'failed',
          errorMessage: `[${errorCategory}] ${errorMessage}`,
        }
      );
    } catch (updateError) {
      logger.error('Failed to update document status after processing error', {
        documentId: job.documentId,
        originalError: errorMessage,
        updateError: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }

    throw error;
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
  text: string,
  requestLogger: ReturnType<typeof createLogger>
): Promise<Array<{ tag: string; confidence: number; evidence: string }>> {
  const prompt = [
    {
      role: 'system',
      content: 'You are a compliance and policy tagging system. Identify relevant compliance frameworks, security standards, and key topics.',
    },
    {
      role: 'user',
      content: `Analyze this document excerpt and return relevant tags as JSON array:\n\n${text}\n\nReturn: {"tags": [{"tag": "FedRAMP", "confidence": 0.95, "evidence": "mentions FedRAMP requirements"}]}`,
    },
  ];

  try {
    const result = await openaiService.chatWithJson<{ tags: Array<{ tag: string; confidence: number; evidence: string }> }>(prompt);

    if (!result.tags || !Array.isArray(result.tags)) {
      requestLogger.warn('Tag generation returned invalid format', { result });
      return [];
    }

    requestLogger.info('Generated tags successfully', { tagCount: result.tags.length });
    return result.tags;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    requestLogger.error('Tag generation failed', {
      error: errorMessage,
      textLength: text.length,
    });
    // Return empty array to allow document processing to continue
    // The document will be marked as completed but without tags
    return [];
  }
}

function isFramework(tag: string): boolean {
  const frameworks = ['FedRAMP', 'NIST', 'ISO27001', 'SOC2', 'HIPAA', 'GDPR', 'PCI-DSS', 'Zero Trust'];
  return frameworks.some((f) => tag.toLowerCase().includes(f.toLowerCase()));
}

async function handlePolicyUpdate(
  job: ProcessingJob,
  _normalizedText: string,
  sections: any[]
): Promise<void> {
  const config = getConfig();

  // Update version with sections
  await cosmosService.updateDocument(
    'versions',
    job.versionId!,
    job.documentId,
    {
      sectionsJson: sections,
      status: 'completed',
    }
  );

  // Get previous version
  const versions = await cosmosService.queryDocuments<PolicyVersion>(
    'versions',
    'SELECT * FROM c WHERE c.policyId = @policyId ORDER BY c.versionNumber DESC OFFSET 1 LIMIT 1',
    [{ name: '@policyId', value: job.documentId }]
  );

  if (versions.length > 0) {
    // Create diff job
    await queueService.sendMessage(config.queues.diff, {
      policyId: job.documentId,
      fromVersionId: versions[0].versionId,
      toVersionId: job.versionId!,
    });
  }
}

app.storageQueue('processDocument', {
  queueName: 'document-processing',
  connection: 'AzureWebJobsStorage',
  handler: processDocument,
});
