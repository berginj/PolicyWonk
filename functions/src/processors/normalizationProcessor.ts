// Text normalization for stable diffing

import { logger } from '../utils/logger';

export class NormalizationProcessor {
  /**
   * Normalize text to canonical form for stable diffing
   */
  normalize(text: string): string {
    let normalized = text;

    // Step 1: Normalize line breaks (CRLF -> LF)
    normalized = normalized.replace(/\r\n/g, '\n');
    normalized = normalized.replace(/\r/g, '\n');

    // Step 2: Remove multiple consecutive spaces
    normalized = normalized.replace(/ +/g, ' ');

    // Step 3: Normalize bullet points
    normalized = normalized.replace(/[•●○■]/g, '-');

    // Step 4: Remove end-of-line hyphens (hyphenation artifacts)
    normalized = normalized.replace(/-\n/g, '');

    // Step 5: Normalize whitespace around punctuation
    normalized = normalized.replace(/ +\./g, '.');
    normalized = normalized.replace(/ +,/g, ',');

    // Step 6: Remove multiple consecutive line breaks (max 2)
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Step 7: Trim each line
    normalized = normalized
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    // Step 8: Remove common boilerplate patterns (cautiously)
    normalized = this.removeBoilerplate(normalized);

    return normalized.trim();
  }

  private removeBoilerplate(text: string): string {
    // Remove common navigation patterns
    const patterns = [
      /^(Home|Menu|Navigation|Breadcrumb).*$/gim,
      /^(Copyright|©).*$/gim,
      /^(Privacy Policy|Terms of Service|Cookie Policy).*$/gim,
      /^(Follow us|Share|Tweet|Like).*$/gim,
    ];

    let cleaned = text;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned;
  }

  /**
   * Extract clean text from HTML
   */
  normalizeHtml(html: string): string {
    // Use JSDOM and Readability for clean extraction
    const { JSDOM } = require('jsdom');
    const { Readability } = require('@mozilla/readability');

    try {
      const dom = new JSDOM(html, { url: 'https://example.com' });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.textContent) {
        // Fallback: strip HTML tags
        return this.stripHtmlTags(html);
      }

      return this.normalize(article.textContent);
    } catch (error) {
      logger.warn('Failed to parse HTML with Readability, falling back to strip tags', error);
      return this.stripHtmlTags(html);
    }
  }

  private stripHtmlTags(html: string): string {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    // Remove script and style tags
    $('script, style, nav, footer, aside').remove();

    // Get text content
    return $('body').text() || $.text();
  }
}

export const normalizationProcessor = new NormalizationProcessor();
