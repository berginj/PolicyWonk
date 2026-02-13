// Version Detection Service
// Analyzes URLs and HTML content to detect version information, landing pages, and download links

import { createLogger } from '../utils/logger';

const logger = createLogger({ functionName: 'versionDetectionService' });

export interface VersionInfo {
  publicationSeries: string;  // "SP 800-53"
  revision: string;            // "5"
  update: string;              // "1"
  status: 'draft' | 'final' | 'superseded' | 'withdrawn';
  publishedDate?: string;
  supersededDate?: string;
}

export interface DownloadLink {
  url: string;
  format: 'pdf' | 'docx' | 'html' | 'json' | 'xlsx';
  size?: string;  // "700KB"
  priority: number; // Lower is better (PDF=0, DOCX=1, etc.)
}

export interface LandingPageInfo {
  versionInfo: VersionInfo | null;
  downloadLinks: DownloadLink[];
  isLandingPage: boolean;
  deprecationNotice?: string;
  supersededBy?: string;
}

/**
 * Detect version information from URL patterns
 * Currently supports NIST-style URLs like: /pubs/sp/800/53/r5/upd1/final
 */
export function detectVersionFromUrl(url: string): VersionInfo | null {
  try {
    // NIST URL pattern: /pubs/sp/(series1)/(series2)/r(revision)/upd(update)/(status)
    const nistPattern = /\/pubs\/sp\/(\d+)\/(\d+)\/r(\d+)(?:\/upd(\d+))?(?:\/(draft|final))?/i;
    const match = url.match(nistPattern);

    if (match) {
      const publicationSeries = `SP ${match[1]}-${match[2]}`;
      const revision = match[3];
      const update = match[4] || '0';
      const status = match[5]?.toLowerCase() === 'draft' ? 'draft' : 'final';

      logger.info('Version detected from URL', {
        url,
        publicationSeries,
        revision,
        update,
        status,
      });

      return {
        publicationSeries,
        revision,
        update,
        status,
      };
    }

    // Additional patterns can be added here for other policy providers

    return null;
  } catch (error) {
    logger.error('Error detecting version from URL', { url, error });
    return null;
  }
}

/**
 * Extract download links from HTML content
 * Looks for links to PDF, DOCX, Excel, JSON files
 */
export function extractDownloadLinks(html: string, baseUrl: string): DownloadLink[] {
  const links: DownloadLink[] = [];

  try {
    // PDF links with optional size
    const pdfRegex = /<a[^>]*href=["']([^"']*\.pdf)["'][^>]*>.*?(?:(\d+(?:\.\d+)?)\s*(KB|MB|GB))?/gi;
    let match;

    while ((match = pdfRegex.exec(html)) !== null) {
      try {
        const url = new URL(match[1], baseUrl).href;
        links.push({
          url,
          format: 'pdf',
          size: match[2] ? `${match[2]}${match[3]}` : undefined,
          priority: 0, // PDF is highest priority
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // DOCX links
    const docxRegex = /<a[^>]*href=["']([^"']*\.docx?)["'][^>]*>/gi;
    while ((match = docxRegex.exec(html)) !== null) {
      try {
        const url = new URL(match[1], baseUrl).href;
        links.push({
          url,
          format: 'docx',
          priority: 1,
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Excel links
    const xlsxRegex = /<a[^>]*href=["']([^"']*\.xlsx?)["'][^>]*>/gi;
    while ((match = xlsxRegex.exec(html)) !== null) {
      try {
        const url = new URL(match[1], baseUrl).href;
        links.push({
          url,
          format: 'xlsx',
          priority: 2,
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // JSON links
    const jsonRegex = /<a[^>]*href=["']([^"']*\.json)["'][^>]*>/gi;
    while ((match = jsonRegex.exec(html)) !== null) {
      try {
        const url = new URL(match[1], baseUrl).href;
        links.push({
          url,
          format: 'json',
          priority: 3,
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Sort by priority (lower is better)
    links.sort((a, b) => a.priority - b.priority);

    logger.info('Download links extracted', {
      baseUrl,
      count: links.length,
      formats: links.map(l => l.format),
    });

    return links;
  } catch (error) {
    logger.error('Error extracting download links', { error });
    return [];
  }
}

/**
 * Detect deprecation notices in HTML content
 * Looks for keywords like "superseded", "replaced", "deprecated"
 */
export function detectDeprecation(html: string): {
  isDeprecated: boolean;
  notice?: string;
  supersededBy?: string;
} {
  try {
    // Pattern 1: Direct superseded/replaced/deprecated language
    const deprecationPatterns = [
      /(?:superseded|replaced|deprecated)\s+by\s+([^<.]+)/i,
      /<div[^>]*class=["'][^"']*alert[^"']*["'][^>]*>(.*?superseded.*?)<\/div>/is,
      /<div[^>]*class=["'][^"']*notice[^"']*["'][^>]*>(.*?replaced.*?)<\/div>/is,
      /<p[^>]*>(.*?(?:superseded|replaced|deprecated).*?)<\/p>/is,
    ];

    for (const pattern of deprecationPatterns) {
      const match = html.match(pattern);
      if (match) {
        logger.info('Deprecation detected', {
          notice: match[0]?.substring(0, 200),
        });

        return {
          isDeprecated: true,
          notice: match[0]?.substring(0, 500), // Truncate to 500 chars
          supersededBy: match[1]?.trim(),
        };
      }
    }

    return { isDeprecated: false };
  } catch (error) {
    logger.error('Error detecting deprecation', { error });
    return { isDeprecated: false };
  }
}

/**
 * Extract new version URL from deprecation notice
 */
export function extractNewVersionUrl(html: string, supersededBy?: string): string | undefined {
  if (!supersededBy) return undefined;

  try {
    // Look for links containing the superseding version text
    const linkPattern = new RegExp(
      `<a[^>]*href=["']([^"']+)["'][^>]*>.*?${supersededBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'i'
    );
    const match = html.match(linkPattern);

    if (match && match[1]) {
      logger.info('New version URL extracted', {
        supersededBy,
        newUrl: match[1],
      });
      return match[1];
    }

    return undefined;
  } catch (error) {
    logger.error('Error extracting new version URL', { error });
    return undefined;
  }
}

/**
 * Main function: Analyze a landing page for version info, download links, and deprecation
 */
export async function analyzeLandingPage(url: string, html: string): Promise<LandingPageInfo> {
  try {
    // Extract version info from URL
    const versionInfo = detectVersionFromUrl(url);

    // Extract download links
    const downloadLinks = extractDownloadLinks(html, url);

    // Check for deprecation
    const deprecation = detectDeprecation(html);

    // Determine if this is a landing page
    // Heuristics: has download links and relatively small HTML (< 50KB)
    const isLandingPage = downloadLinks.length > 0 && html.length < 50000;

    const result: LandingPageInfo = {
      versionInfo,
      downloadLinks,
      isLandingPage,
      deprecationNotice: deprecation.notice,
      supersededBy: deprecation.supersededBy,
    };

    logger.info('Landing page analysis complete', {
      url,
      isLandingPage,
      hasVersionInfo: !!versionInfo,
      downloadLinksCount: downloadLinks.length,
      isDeprecated: deprecation.isDeprecated,
    });

    return result;
  } catch (error) {
    logger.error('Error analyzing landing page', { url, error });
    return {
      versionInfo: null,
      downloadLinks: [],
      isLandingPage: false,
    };
  }
}
