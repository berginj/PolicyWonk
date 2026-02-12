// Simplified ingestion endpoint for testing without full infrastructure
// POST /api/ingest/url/simple

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import http from 'http';

interface IngestUrlRequest {
  url: string;
  docType: 'policy' | 'contract';
  metadata?: Record<string, any>;
}

// Extract title from HTML content
function extractTitle(html: string, url: string): string {
  // Try to extract <title> tag
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    // Decode HTML entities and clean up
    let title = titleMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    return title.substring(0, 200); // Limit length
  }

  // Fallback: try to extract from URL
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/\/$/, '').split('/').pop() || '';
    if (path && path !== '') {
      return path
        .replace(/\.[^.]+$/, '') // Remove extension
        .replace(/[-_]/g, ' ')   // Replace dashes/underscores with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Title case
    }
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// Simple fetch function
function fetchUrl(url: string): Promise<{ content: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000,
    };

    const req = client.request(url, options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          content: data,
          contentType: res.headers['content-type'] || 'text/html'
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

export async function ingestUrlSimple(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('ingestUrlSimple called');

  try {
    const body = await request.json() as IngestUrlRequest;

    // Validate
    if (!body.url) {
      return {
        status: 400,
        jsonBody: { error: 'URL is required' }
      };
    }

    if (!body.docType || !['policy', 'contract'].includes(body.docType)) {
      return {
        status: 400,
        jsonBody: { error: 'docType must be "policy" or "contract"' }
      };
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return {
        status: 400,
        jsonBody: { error: 'Invalid URL format' }
      };
    }

    context.log('Fetching URL', { url: body.url });

    // Fetch the document
    const fetchResult = await fetchUrl(body.url);

    context.log('Document fetched', {
      url: body.url,
      contentType: fetchResult.contentType,
      size: fetchResult.content.length
    });

    // Extract title from content
    let title = body.metadata?.title;
    if (!title && fetchResult.contentType.includes('html')) {
      title = extractTitle(fetchResult.content, body.url);
      context.log('Extracted title from HTML', { title });
    }

    if (!title) {
      title = body.url; // Fallback to URL
    }

    const documentId = uuidv4();

    // Store in in-memory cache (would be Cosmos DB in production)
    const document = {
      id: documentId,
      docType: body.docType,
      title: title,
      sourceUrl: body.url,
      contentType: fetchResult.contentType,
      contentLength: fetchResult.content.length,
      monitoringConfig: body.metadata?.monitoringConfig || null,
      status: 'completed',
      createdAt: new Date().toISOString(),
      note: 'This is a simplified ingestion for testing. In production, this would trigger full AI processing.'
    };

    context.log('Document ingested', { documentId, title });

    return {
      status: 202,
      jsonBody: {
        documentId,
        title,
        status: 'completed',
        message: 'Document ingested successfully (simplified mode - no AI processing yet)',
        document
      }
    };
  } catch (error: any) {
    context.log('Error ingesting URL', { error: error.message });
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to ingest URL',
        message: error.message
      }
    };
  }
}

app.http('ingestUrlSimple', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ingest/url/simple',
  handler: ingestUrlSimple,
});
