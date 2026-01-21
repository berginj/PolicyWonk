// HTTP fetch service with retries and conditional requests

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

export interface FetchResult {
  content: Buffer;
  statusCode: number;
  headers: Record<string, string>;
  etag?: string;
  lastModified?: string;
  contentType?: string;
}

class FetchService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 30000,
      maxRedirects: 5,
      responseType: 'arraybuffer',
      validateStatus: (status) => status < 500,
    });
  }

  async fetch(
    url: string,
    options?: {
      ifNoneMatch?: string;
      ifModifiedSince?: string;
    }
  ): Promise<FetchResult | null> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'PolicyWonk/1.0',
      };

      if (options?.ifNoneMatch) {
        headers['If-None-Match'] = options.ifNoneMatch;
      }
      if (options?.ifModifiedSince) {
        headers['If-Modified-Since'] = options.ifModifiedSince;
      }

      const response = await this.client.get(url, { headers });

      // HTTP 304 Not Modified
      if (response.status === 304) {
        logger.info('Content not modified (HTTP 304)', { url });
        return null;
      }

      // HTTP 200 OK
      if (response.status === 200) {
        return {
          content: Buffer.from(response.data),
          statusCode: response.status,
          headers: response.headers as Record<string, string>,
          etag: response.headers['etag'],
          lastModified: response.headers['last-modified'],
          contentType: response.headers['content-type'],
        };
      }

      // Other status codes
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      if (error.response) {
        logger.error('HTTP error during fetch', {
          url,
          status: error.response.status,
          statusText: error.response.statusText,
        });
      } else {
        logger.error('Network error during fetch', { url, error: error.message });
      }
      throw error;
    }
  }

  async fetchWithRetry(
    url: string,
    options?: {
      ifNoneMatch?: string;
      ifModifiedSince?: string;
      maxRetries?: number;
    }
  ): Promise<FetchResult | null> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetch(url, options);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Fetch attempt ${attempt}/${maxRetries} failed`, {
          url,
          error: lastError.message,
        });

        if (attempt < maxRetries) {
          await this.delay(1000 * attempt);
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const fetchService = new FetchService();
