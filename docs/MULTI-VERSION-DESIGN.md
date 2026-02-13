# Multi-Version Policy Tracking Design

## Problem Statement

Policy websites like NIST (https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) have:
- Landing pages with metadata and download links
- Multiple formats (PDF, Excel, JSON, XML)
- Version indicators in URLs (r5/upd1)
- Deprecation notices when superseded by newer versions

## Current Limitations

1. **Ingests HTML of landing page** - not the actual policy document
2. **No version detection** - treats each URL as independent
3. **No deprecation handling** - doesn't detect when policies become outdated
4. **No format preference** - can't choose PDF over HTML

## Proposed Solution

### Phase 1: Smart Document Detection

**New Endpoint:** `POST /api/ingest/smart`

```typescript
{
  url: "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
  docType: "policy",
  options: {
    detectDownloads: true,       // Extract PDF/DOCX links
    preferredFormats: ["pdf", "docx", "html"],
    extractVersionInfo: true,    // Parse version from URL/content
    linkToExisting: true         // Find related versions
  }
}
```

**Processing Flow:**

1. **Fetch landing page HTML**
2. **Extract download links:**
   ```
   - https://csrc.nist.gov/.../.../sp800-53r5.pdf (PDF - 700KB)
   - https://csrc.nist.gov/.../.../sp800-53r5-controls.xlsx (Excel)
   - https://csrc.nist.gov/.../.../sp800-53r5-baseline.json (JSON)
   ```
3. **Detect version info:**
   ```
   - Publication: SP 800-53 Revision 5
   - Update: Update 1
   - Date: December 2020
   - Status: Final
   ```
4. **Choose best format:**
   - PDF (most complete, structured)
   - Fallback to Excel if no PDF
   - HTML as last resort

5. **Search for existing versions:**
   ```sql
   SELECT * FROM documents
   WHERE metadata.publicationSeries = 'SP 800-53'
   AND metadata.revision = 5
   ```

6. **Link versions:**
   - Set `previousVersionId` if found
   - Set `supersededBy` on old version
   - Create version chain

### Phase 2: Version Schema Enhancement

**Document Type Extension:**

```typescript
interface Document {
  // ... existing fields ...

  // Version tracking
  versionInfo?: {
    publicationSeries: string;  // "SP 800-53"
    revision: string;            // "5"
    update: string;              // "1"
    status: 'draft' | 'final' | 'superseded' | 'withdrawn';
    publishedDate: string;
    supersededDate?: string;
  };

  // Version chain
  versionChain?: {
    previousVersionId?: string;
    nextVersionId?: string;
    supersededBy?: string;
    relatedVersions?: string[];
  };

  // Multi-format support
  formats?: {
    pdf?: { url: string; blobPath: string; size: number; };
    docx?: { url: string; blobPath: string; };
    html?: { url: string; blobPath: string; };
    json?: { url: string; blobPath: string; };
  };

  // Smart monitoring
  landingPageUrl?: string;  // Monitor this for new versions
  downloadUrl?: string;      // Actual document URL
}
```

### Phase 3: Deprecation Detection

**Monitoring Enhancement:**

When checking for updates:

1. **Fetch landing page**
2. **Check for deprecation markers:**
   ```html
   <div class="alert">
     This publication has been superseded by SP 800-53 Revision 5 Update 2
   </div>
   ```
3. **Parse superseding version info**
4. **Update status:**
   ```typescript
   {
     status: 'superseded',
     supersededDate: '2024-01-15',
     supersededBy: 'new-version-id'
   }
   ```
5. **Create alert:**
   - "NIST SP 800-53 Rev 5 Update 1 has been superseded by Update 2"
   - Link to new version

### Phase 4: Version Comparison

**Smart Diff Logic:**

When comparing versions:

```typescript
if (oldDoc.versionInfo && newDoc.versionInfo) {
  // Same series, different versions
  if (oldDoc.versionInfo.publicationSeries === newDoc.versionInfo.publicationSeries) {

    // Version upgrade (r5 upd1 → r5 upd2)
    if (newDoc.versionInfo.update > oldDoc.versionInfo.update) {
      return {
        changeType: 'VERSION_UPGRADE',
        oldVersion: 'r5 upd1',
        newVersion: 'r5 upd2',
        computeDiff: true  // Show what changed between versions
      };
    }

    // Major revision (r4 → r5)
    if (newDoc.versionInfo.revision > oldDoc.versionInfo.revision) {
      return {
        changeType: 'MAJOR_REVISION',
        oldVersion: 'r4',
        newVersion: 'r5',
        computeDiff: false  // Too different to compare
      };
    }
  }
}
```

### Phase 5: UI Enhancements

**Policy Detail Page:**

```
┌────────────────────────────────────────────────────────┐
│  NIST SP 800-53 Revision 5 Update 1                    │
│  Status: [Superseded by Update 2]                      │
├────────────────────────────────────────────────────────┤
│  Published: December 2020                              │
│  Superseded: January 2024                              │
│                                                        │
│  Version History:                                      │
│  • Rev 5 Update 2 (Current) → View                    │
│  • Rev 5 Update 1 (This version)                      │
│  • Rev 5 (2020) → View                                │
│  • Rev 4 (2013) → View                                │
│                                                        │
│  Available Formats:                                    │
│  [📄 PDF (700KB)] [📊 Excel] [{ } JSON]               │
│                                                        │
│  [View Changes from Update 1 → Update 2]              │
└────────────────────────────────────────────────────────┘
```

**Dashboard Enhancement:**

```
┌────────────────────────────────────────────────────────┐
│  Recent Updates                                        │
├────────────────────────────────────────────────────────┤
│  NIST SP 800-53 Rev 5 Update 2                        │
│  [NEW VERSION] Supersedes Update 1                    │
│  Published: Jan 15, 2024                              │
│  [View Changes] [View Document]                       │
│                                                        │
│  FedRAMP Baseline Update                              │
│  [MAJOR] Content changes detected                     │
│  Updated: Feb 10, 2024                                │
└────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Step 1: Add Version Detection (1-2 days)

**File:** `functions/src/services/versionDetectionService.ts`

```typescript
export async function detectVersionInfo(url: string, html: string): Promise<VersionInfo | null> {
  // Parse NIST URLs
  const nistMatch = url.match(/\/pubs\/sp\/(\d+)\/(\d+)\/r(\d+)(?:\/upd(\d+))?/);
  if (nistMatch) {
    return {
      publicationSeries: `SP ${nistMatch[1]}-${nistMatch[2]}`,
      revision: nistMatch[3],
      update: nistMatch[4] || '0',
      status: url.includes('draft') ? 'draft' : 'final'
    };
  }

  // Parse from HTML content
  const titleMatch = html.match(/Revision (\d+) Update (\d+)/i);
  // ... more parsing logic

  return null;
}

export function extractDownloadLinks(html: string, baseUrl: string): DownloadLink[] {
  const links: DownloadLink[] = [];

  // Find PDF links
  const pdfRegex = /<a[^>]*href="([^"]*\.pdf)"[^>]*>.*?(\d+(?:\.\d+)?\s*(?:KB|MB))?/gi;
  // ... extract links

  return links.sort((a, b) => {
    const formatPriority = { pdf: 0, docx: 1, html: 2, json: 3 };
    return formatPriority[a.format] - formatPriority[b.format];
  });
}
```

### Step 2: Update Ingestion Pipeline (2-3 days)

- Modify `ingestUrl` to detect landing pages
- Extract and ingest best format
- Store version metadata
- Link to existing versions

### Step 3: Add Version Chain Queries (1 day)

**New Endpoint:** `GET /api/policies/{id}/versions`

Returns:
```json
{
  "currentVersion": { ... },
  "previousVersions": [ ... ],
  "nextVersions": [ ... ],
  "supersededBy": { ... }
}
```

### Step 4: Enhanced Monitoring (2-3 days)

- Check landing pages for new versions
- Detect deprecation notices
- Auto-ingest new versions
- Update version chains

### Step 5: UI Updates (2-3 days)

- Version history timeline
- Format selector
- Superseded badges
- Version comparison view

## Example Scenarios

### Scenario 1: Initial Ingestion

User submits: `https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final`

System:
1. Detects it's a NIST publication (SP 800-53 Rev 5 Update 1)
2. Finds PDF link: `sp800-53r5.pdf`
3. Downloads and processes PDF (not HTML)
4. Checks for existing versions (finds Rev 5 Update 0)
5. Creates version link: Update 0 → Update 1
6. Sets up monitoring on landing page

### Scenario 2: New Version Detected

Daily monitor checks landing page, finds:
- URL now shows: `/r5/upd2/final`
- Notice: "Update 1 superseded by Update 2"

System:
1. Creates alert: "New version available"
2. Auto-ingests Update 2
3. Marks Update 1 as superseded
4. Links: Update 1 → Update 2
5. Computes diff between versions

### Scenario 3: User Views Policy

User clicks on "NIST SP 800-53":

System shows:
- Current version (Update 2) with [CURRENT] badge
- Previous versions with [SUPERSEDED] badges
- Version timeline
- Available formats for each version
- Changes between versions

## Configuration

Add to ingestion UI:

```typescript
<FormGroup>
  <Label>Smart Detection</Label>
  <Checkbox checked={detectDownloads}>
    Auto-detect and download PDF/DOCX from landing pages
  </Checkbox>
  <Checkbox checked={extractVersionInfo}>
    Extract version information from URL and content
  </Checkbox>
  <Checkbox checked={linkToExisting}>
    Link to existing versions of same policy
  </Checkbox>
</FormGroup>

<FormGroup>
  <Label>Format Preference</Label>
  <Select multiple>
    <Option value="pdf">PDF (preferred)</Option>
    <Option value="docx">Word Document</Option>
    <Option value="html">HTML</Option>
    <Option value="json">JSON</Option>
  </Select>
</FormGroup>
```

## Benefits

1. **Accurate tracking** - Monitors actual policy content, not HTML wrappers
2. **Version awareness** - Understands relationships between versions
3. **Deprecation handling** - Alerts when policies are superseded
4. **Format flexibility** - Uses best available format
5. **Historical context** - Maintains complete version history
6. **Smart alerting** - Distinguishes new versions from content changes

## Future Enhancements

- **Automatic version discovery** - Crawl publication page to find all versions
- **Cross-reference detection** - Link related publications (SP 800-53 → SP 800-53A)
- **Citation tracking** - Track which policies reference others
- **Compliance mapping** - Map controls to compliance frameworks
