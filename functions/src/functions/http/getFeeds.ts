// GET /api/feeds - List policy feeds (alias for monitored policies)

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { cosmosService } from '../../services/cosmosService';
import { Document } from '../../types/document';

export async function getFeeds(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('getFeeds called');

  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

    // Get monitored policies as feeds
    const query = `
      SELECT * FROM c
      WHERE c.docType = @docType AND c.monitoringConfig.enabled = true
      ORDER BY c.updatedAt DESC
      OFFSET 0 LIMIT @limit
    `;

    const feeds = await cosmosService.queryDocuments<Document>('documents', query, [
      { name: '@docType', value: 'policy' },
      { name: '@limit', value: limit },
    ]);

    return {
      status: 200,
      jsonBody: {
        feeds: feeds.map(f => ({
          id: f.id,
          title: f.title,
          sourceUrl: f.sourceUrl,
          status: f.status,
          cadence: f.monitoringConfig?.cadence,
          nextCheckAt: f.monitoringConfig?.nextCheckAt,
          updatedAt: f.updatedAt,
        })),
        total: feeds.length,
      },
    };
  } catch (error) {
    context.log('Error fetching feeds', { error: (error as Error).message });
    return {
      status: 500,
      jsonBody: { error: 'Failed to fetch feeds', message: (error as Error).message },
    };
  }
}

app.http('getFeeds', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'feeds',
  handler: getFeeds,
});
