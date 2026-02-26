// Unit tests for versionDetectionService

import {
  detectVersionFromUrl,
  extractDownloadLinks,
  detectDeprecation,
  extractNewVersionUrl,
  analyzeLandingPage,
} from '../../src/services/versionDetectionService';

describe('versionDetectionService', () => {
  describe('detectVersionFromUrl', () => {
    it('should detect version from standard NIST URL', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.publicationSeries).toBe('SP 800-53');
      expect(result?.revision).toBe('5');
      expect(result?.update).toBe('1');
      expect(result?.status).toBe('final');
    });

    it('should detect version from URL without update', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r5/final';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.publicationSeries).toBe('SP 800-53');
      expect(result?.revision).toBe('5');
      expect(result?.update).toBe('0');
      expect(result?.status).toBe('final');
    });

    it('should detect version from URL with letter suffix (e.g., SP 800-53A)', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/a/r5/final';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.publicationSeries).toBe('SP 800-53A');
      expect(result?.revision).toBe('5');
      expect(result?.status).toBe('final');
    });

    it('should detect draft status', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r6/draft';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('draft');
    });

    it('should return null for non-matching URLs', () => {
      const url = 'https://example.com/some/other/path';
      const result = detectVersionFromUrl(url);

      expect(result).toBeNull();
    });

    it('should handle SP 800-171 URLs', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/171/r3/final';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.publicationSeries).toBe('SP 800-171');
      expect(result?.revision).toBe('3');
    });

    it('should handle SP 800-37 URLs', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/37/r2/final';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.publicationSeries).toBe('SP 800-37');
      expect(result?.revision).toBe('2');
    });

    it('should handle SP 800-88 URLs', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/88/r1/final';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.publicationSeries).toBe('SP 800-88');
      expect(result?.revision).toBe('1');
    });

    it('should be case insensitive for status', () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r5/FINAL';
      const result = detectVersionFromUrl(url);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('final');
    });
  });

  describe('extractDownloadLinks', () => {
    const baseUrl = 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final';

    it('should extract PDF links', () => {
      const html = '<a href="/files/sp800-53.pdf">Download PDF</a>';
      const result = extractDownloadLinks(html, baseUrl);

      expect(result.length).toBe(1);
      expect(result[0].format).toBe('pdf');
      expect(result[0].priority).toBe(0);
    });

    it('should extract DOCX links', () => {
      const html = '<a href="/files/sp800-53.docx">Download Word</a>';
      const result = extractDownloadLinks(html, baseUrl);

      expect(result.length).toBe(1);
      expect(result[0].format).toBe('docx');
      expect(result[0].priority).toBe(1);
    });

    it('should extract Excel links', () => {
      const html = '<a href="/files/controls.xlsx">Download Excel</a>';
      const result = extractDownloadLinks(html, baseUrl);

      expect(result.length).toBe(1);
      expect(result[0].format).toBe('xlsx');
      expect(result[0].priority).toBe(2);
    });

    it('should extract JSON links', () => {
      const html = '<a href="/files/controls.json">Download JSON</a>';
      const result = extractDownloadLinks(html, baseUrl);

      expect(result.length).toBe(1);
      expect(result[0].format).toBe('json');
      expect(result[0].priority).toBe(3);
    });

    it('should sort by priority (PDF first)', () => {
      const html = `
        <a href="/files/doc.json">JSON</a>
        <a href="/files/doc.xlsx">Excel</a>
        <a href="/files/doc.pdf">PDF</a>
        <a href="/files/doc.docx">Word</a>
      `;
      const result = extractDownloadLinks(html, baseUrl);

      expect(result.length).toBe(4);
      expect(result[0].format).toBe('pdf');
      expect(result[1].format).toBe('docx');
      expect(result[2].format).toBe('xlsx');
      expect(result[3].format).toBe('json');
    });

    it('should resolve relative URLs', () => {
      const html = '<a href="/files/doc.pdf">PDF</a>';
      const result = extractDownloadLinks(html, baseUrl);

      expect(result[0].url).toBe('https://csrc.nist.gov/files/doc.pdf');
    });

    it('should return empty array for HTML with no download links', () => {
      const html = '<p>No links here</p>';
      const result = extractDownloadLinks(html, baseUrl);

      expect(result).toEqual([]);
    });
  });

  describe('detectDeprecation', () => {
    it('should detect superseded language', () => {
      const html = '<p>This document has been superseded by SP 800-53 Rev 5</p>';
      const result = detectDeprecation(html);

      expect(result.isDeprecated).toBe(true);
      expect(result.notice).toContain('superseded');
    });

    it('should detect replaced language', () => {
      const html = '<div class="alert">This version has been replaced by a newer version</div>';
      const result = detectDeprecation(html);

      expect(result.isDeprecated).toBe(true);
    });

    it('should detect deprecated language', () => {
      const html = '<p>This standard has been deprecated and should not be used</p>';
      const result = detectDeprecation(html);

      expect(result.isDeprecated).toBe(true);
    });

    it('should extract superseding document reference', () => {
      const html = '<p>This document has been superseded by SP 800-53 Rev 6</p>';
      const result = detectDeprecation(html);

      expect(result.isDeprecated).toBe(true);
      expect(result.supersededBy).toContain('SP 800-53 Rev 6');
    });

    it('should return isDeprecated false for non-deprecated content', () => {
      const html = '<p>This is the current version of the standard</p>';
      const result = detectDeprecation(html);

      expect(result.isDeprecated).toBe(false);
    });
  });

  describe('extractNewVersionUrl', () => {
    it('should extract URL when supersededBy matches link text', () => {
      const html = '<a href="/pubs/sp/800/53/r6/final">SP 800-53 Rev 6</a>';
      const result = extractNewVersionUrl(html, 'SP 800-53 Rev 6');

      expect(result).toBe('/pubs/sp/800/53/r6/final');
    });

    it('should return undefined when supersededBy is not provided', () => {
      const html = '<a href="/pubs/sp/800/53/r6/final">SP 800-53 Rev 6</a>';
      const result = extractNewVersionUrl(html, undefined);

      expect(result).toBeUndefined();
    });

    it('should return undefined when no matching link found', () => {
      const html = '<a href="/pubs/sp/800/53/r6/final">Some other link</a>';
      const result = extractNewVersionUrl(html, 'SP 800-53 Rev 6');

      expect(result).toBeUndefined();
    });
  });

  describe('analyzeLandingPage', () => {
    it('should identify page as landing page with download links and small size', async () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final';
      const html = `
        <html>
          <head><title>SP 800-53</title></head>
          <body>
            <h1>SP 800-53 Rev 5</h1>
            <a href="/files/sp800-53.pdf">Download PDF</a>
          </body>
        </html>
      `;

      const result = await analyzeLandingPage(url, html);

      expect(result.isLandingPage).toBe(true);
      expect(result.versionInfo).not.toBeNull();
      expect(result.downloadLinks.length).toBeGreaterThan(0);
    });

    it('should not identify as landing page when no download links', async () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final';
      const html = '<html><body>No downloads here</body></html>';

      const result = await analyzeLandingPage(url, html);

      expect(result.isLandingPage).toBe(false);
    });

    it('should not identify as landing page when HTML is too large', async () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final';
      const largeHtml = '<a href="/doc.pdf">PDF</a>' + 'x'.repeat(200000);

      const result = await analyzeLandingPage(url, largeHtml);

      expect(result.isLandingPage).toBe(false);
    });

    it('should detect deprecation when present', async () => {
      const url = 'https://csrc.nist.gov/pubs/sp/800/53/r4/final';
      const html = `
        <div class="alert">This document has been superseded by SP 800-53 Rev 5</div>
        <a href="/files/sp800-53r4.pdf">Download PDF</a>
      `;

      const result = await analyzeLandingPage(url, html);

      expect(result.deprecationNotice).toContain('superseded');
    });

    it('should return safe defaults on error', async () => {
      const url = '';
      const html = '';

      const result = await analyzeLandingPage(url, html);

      expect(result.versionInfo).toBeNull();
      expect(result.downloadLinks).toEqual([]);
      expect(result.isLandingPage).toBe(false);
    });
  });
});
