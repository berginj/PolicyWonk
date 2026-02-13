# PolicyWonk Multi-Version Tracking - User Guide

## 🎯 Quick Start Guide

Welcome to PolicyWonk's new multi-version policy tracking system! This guide will help you understand and use the new features.

---

## 📋 What's New

### Automatic Version Detection
PolicyWonk now automatically detects when you're providing a NIST landing page URL and:
- ✅ Downloads the actual PDF document (not the HTML page)
- ✅ Extracts version information (series, revision, update, status)
- ✅ Tracks multiple document formats (PDF, Word, Excel, JSON)
- ✅ Links related versions together
- ✅ Monitors for deprecation/withdrawal

---

## 🚀 How to Use

### 1. Ingesting a Policy Document

**Before**: You would paste any URL and get whatever was at that URL (often HTML)

**Now**: Paste a NIST landing page URL and get the actual policy document!

#### Example:
```
URL: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
Result:
  ✅ PDF downloaded automatically
  ✅ Version detected: SP 800-53 Rev 5 Update 1
  ✅ Multiple formats tracked: PDF, DOCX, XLSX
```

#### Supported URL Patterns:
```
✅ /pubs/sp/800/53/r5/upd1/final     → SP 800-53 Rev 5 Update 1
✅ /pubs/sp/800/171/r3/final         → SP 800-171 Rev 3
✅ /pubs/sp/800/37/r2/final          → SP 800-37 Rev 2
✅ /pubs/sp/800/88/r1/final          → SP 800-88 Rev 1
✅ /pubs/sp/800/53/a/r5/final        → SP 800-53A Rev 5
```

### 2. Viewing Version Information

When you open a policy document, you'll now see:

#### Version Information Card
```
┌─────────────────────────────────────┐
│ Version Information                 │
├─────────────────────────────────────┤
│ Publication:  SP 800-53             │
│ Revision:     Revision 5 Update 1   │
│ Status:       FINAL                 │
└─────────────────────────────────────┘
```

The status badge shows:
- 🟢 **FINAL** - Current, active policy (green)
- 🟡 **DRAFT** - Draft version, not yet final (yellow)
- 🔴 **SUPERSEDED** - Replaced by newer version (red)
- 🔴 **WITHDRAWN** - No longer valid (red)

#### Available Formats
```
┌─────────────────────────────────────┐
│ Available Formats                   │
├─────────────────────────────────────┤
│ [📄 PDF]  [📝 Word]  [📊 Excel]    │
└─────────────────────────────────────┘
```

Click any format button to download that version directly from NIST.

#### Deprecation Warning (if applicable)
```
┌─────────────────────────────────────────────┐
│ ⚠️  This version has been superseded       │
│     View latest version →                   │
└─────────────────────────────────────────────┘
```

### 3. Navigating Between Versions

When multiple versions exist:

#### Version Timeline
```
┌─────────────────────────────────────┐
│ Version History                     │
├─────────────────────────────────────┤
│ ● Revision 5 Update 1  [Current]    │
│   │                                 │
│   ↓                                 │
│ ● Revision 5  [View this version →] │
└─────────────────────────────────────┘
```

Click "View this version" to navigate to older versions.

---

## 💡 Use Cases

### Use Case 1: Tracking Policy Updates
**Scenario**: You need to know when SP 800-53 was last updated

**Steps**:
1. Search for "SP 800-53"
2. Open the document
3. Check the "Version Information" card
4. See: "Revision 5 Update 1" with publication date

### Use Case 2: Accessing Different Formats
**Scenario**: You need the SP 800-171 controls in Excel format

**Steps**:
1. Open SP 800-171 Rev 3 document
2. Look at "Available Formats" section
3. Click [📊 Excel] button
4. Excel file downloads directly from NIST

### Use Case 3: Checking for Deprecation
**Scenario**: Verify you're using the current version of a policy

**Steps**:
1. Open your policy document
2. Check the status badge in "Version Information"
3. If status is "SUPERSEDED" or "WITHDRAWN", a warning banner appears
4. Click "View latest version" to go to the current policy

### Use Case 4: Comparing Versions
**Scenario**: See what changed between SP 800-37 Rev 1 and Rev 2

**Steps**:
1. Open SP 800-37 Rev 2
2. View "Version History" timeline
3. Click on Rev 1 to open the older version
4. Compare the two documents side-by-side

---

## 🎨 Visual Guide

### Policy Detail Page Layout

```
┌────────────────────────────────────────────────────────┐
│  PolicyWonk                                  [Search]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ ⚠️  This version has been superseded             │ │
│  │     View latest version →                        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  SP 800-53 Rev. 5: Security and Privacy Controls      │
│  ═══════════════════════════════════════════════      │
│                                                        │
│  ┌─────────────────────────────────────────┐          │
│  │ Version Information                     │          │
│  ├─────────────────────────────────────────┤          │
│  │ Publication:  SP 800-53                 │          │
│  │ Revision:     Revision 5 Update 1       │          │
│  │ Status:       FINAL                     │          │
│  └─────────────────────────────────────────┘          │
│                                                        │
│  ┌─────────────────────────────────────────┐          │
│  │ Available Formats                       │          │
│  ├─────────────────────────────────────────┤          │
│  │ [📄 PDF]  [📝 Word]  [📊 Excel]        │          │
│  └─────────────────────────────────────────┘          │
│                                                        │
│  ┌─────────────────────────────────────────┐          │
│  │ Version History                         │          │
│  ├─────────────────────────────────────────┤          │
│  │ ● Revision 5 Update 1  [Current]        │          │
│  │   │                                     │          │
│  │   ↓                                     │          │
│  │ ● Revision 5  [View →]                  │          │
│  └─────────────────────────────────────────┘          │
│                                                        │
│  Document Details                                      │
│  ────────────────────────────────────────────          │
│  Content Type: application/pdf                         │
│  Source: https://csrc.nist.gov/pubs/...               │
│  Ingested: 2026-02-13                                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 📱 Testing Your Installation

### Quick Verification

Open any of these example documents to see the new features:

1. **SP 800-53 Rev 5 Update 1** (Best example - 3 formats)
   - https://proud-sand-06951430f.6.azurestaticapps.net/policies/5a0d18f1-df11-4819-83a2-c746c503b6aa
   - Should show: Version card, PDF/Word/Excel buttons

2. **SP 800-171 Rev 3** (2 formats)
   - https://proud-sand-06951430f.6.azurestaticapps.net/policies/5ad17908-9624-4f1a-864a-1ace3369b12b
   - Should show: Version card, PDF/Excel buttons

3. **SP 800-88 Rev 1** (Latest test)
   - https://proud-sand-06951430f.6.azurestaticapps.net/policies/7f65c9ba-9751-4a33-95dc-ff0959a9e9d7
   - Should show: Version card, PDF/Word buttons

### What to Check

- [ ] Version Information card is visible
- [ ] Status badge shows correct color (green for FINAL)
- [ ] Available Formats section appears
- [ ] Format buttons are clickable
- [ ] Clicking buttons opens document download
- [ ] Document metadata shows "application/pdf" not "text/html"

---

## 🔍 Behind the Scenes

### What Happens When You Ingest a NIST URL

```
1. You paste: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
   │
   ↓
2. PolicyWonk fetches the page and analyzes it
   │
   ↓
3. Detects it's a landing page with download links
   │
   ↓
4. Finds PDF link: https://nvlpubs.nist.gov/.../NIST.SP.800-53r5.pdf
   │
   ↓
5. Downloads the actual PDF (not the HTML!)
   │
   ↓
6. Extracts version info from URL:
   - Series: SP 800-53
   - Revision: 5
   - Update: 1
   - Status: final
   │
   ↓
7. Finds all format links:
   - PDF: https://...pdf
   - DOCX: https://...docx
   - XLSX: https://...xlsx
   │
   ↓
8. Searches for existing versions of SP 800-53
   │
   ↓
9. Creates links to related versions
   │
   ↓
10. Stores everything in database
    │
    ↓
11. Enables daily monitoring for deprecation
    │
    ↓
12. Returns document ID to you
```

### Automatic Monitoring

Once ingested, PolicyWonk checks the landing page daily:
- ✅ Detects if policy is marked as "Withdrawn" or "Superseded"
- ✅ Updates status automatically
- ✅ Creates alerts (when configured)
- ✅ Can auto-ingest new versions

---

## ❓ Frequently Asked Questions

### Q: Do I need to do anything different when ingesting documents?
**A**: No! Just paste the URL like before. PolicyWonk automatically detects landing pages and downloads the PDF.

### Q: What happens to documents I ingested before this update?
**A**: They continue to work fine! The new fields are optional. Old documents won't have version info, but new ingestions will.

### Q: Can I re-ingest a document to get the version info?
**A**: PolicyWonk prevents duplicate ingestion by URL+hash. To get version info for an old document, you'd need to wait for it to be re-processed or delete and re-ingest.

### Q: What if a document doesn't have multiple formats?
**A**: The "Available Formats" section will only show formats that are available. Some documents only have PDF, and that's fine.

### Q: Will this work with non-NIST documents?
**A**: Currently optimized for NIST publications. Support for ISO, IEEE, CIS, and other providers is planned for future updates.

### Q: How do I know if a policy has been superseded?
**A**: Check the status badge in the "Version Information" card. If it shows "SUPERSEDED" (red), a warning banner will also appear at the top of the page.

### Q: Can I download all formats at once?
**A**: Not currently, but you can click each format button individually. Bulk download is on the roadmap.

---

## 🆘 Troubleshooting

### Issue: Version information not showing

**Possible Causes**:
1. Document was ingested before the multi-version update
2. URL doesn't match supported NIST patterns
3. Landing page wasn't detected (very large page, no download links)

**Solutions**:
- Ingest a new NIST document to test
- Check if URL matches patterns: `/pubs/sp/###/###/r#/final`
- Run test script: `.\test-simple.ps1`

### Issue: Still seeing "text/html" content type

**Cause**: Document ingested before landing page detection fix

**Solution**: Ingest a fresh document. The system prevents duplicate URLs, so documents ingested before the fix retain their original data.

### Issue: Format buttons not working

**Possible Causes**:
1. External NIST links are blocked by firewall/proxy
2. NIST site is temporarily down
3. Link has changed (rare)

**Solutions**:
- Try downloading directly from NIST site
- Check browser console for CORS errors
- Verify NIST site is accessible

### Issue: Version timeline not showing

**Cause**: Only one version of this policy series has been ingested

**Solution**: Ingest additional versions (Rev 4, Rev 5, etc.) to create version chains

---

## 🎓 Tips & Best Practices

### Tip 1: Always Use Final URLs
Use `/final` URLs instead of `/draft` for production tracking:
- ✅ `https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final`
- ❌ `https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/draft`

### Tip 2: Check for Updates Regularly
The monitoring system runs daily, but you can manually check by visiting the policy's landing page on NIST's site.

### Tip 3: Download Your Preferred Format
If you prefer Excel for compliance mapping, use the Excel button instead of PDF.

### Tip 4: Use Version Timeline for Historical Context
Before implementing controls from a policy, check the version timeline to see if you're looking at the latest version.

### Tip 5: Bookmark Frequently Used Policies
Save the PolicyWonk URLs (not NIST URLs) to always access the enriched version with metadata.

---

## 📈 What's Coming Next

### Planned Features

**Phase 6**: Extended Provider Support
- ISO standards (ISO 27001, ISO 27002)
- IEEE standards
- CIS Benchmarks
- SOC 2 frameworks

**Phase 7**: Advanced Features
- Visual version timeline with dates
- AI-powered change summaries
- Email/Slack alerts for deprecation
- Bulk version ingestion

**Phase 8**: Analytics
- Version adoption tracking
- Compliance gap analysis
- Popular policies dashboard

---

## 📞 Getting Help

### Resources
- **Documentation**: Check the repo for detailed technical docs
- **Test Scripts**: Run `.\test-simple.ps1` to verify system health
- **Examples**: Use the live example links above

### Common Commands
```powershell
# Test ingestion
.\test-simple.ps1

# Test multiple documents
.\test-complete-flow.ps1

# Check deployment status
.\check-deployment.ps1
```

---

## ✨ Summary

PolicyWonk's multi-version tracking transforms how you manage policy documents:

**Before**: Manual tracking, HTML pages, no version awareness
**After**: Automatic PDF download, version tracking, format options, deprecation monitoring

**Key Benefits**:
- ⏱️ **Save Time**: Automatic PDF detection and download
- 📊 **Stay Compliant**: Track versions and detect deprecation
- 🔄 **Access Formats**: Download in your preferred format (PDF/Word/Excel)
- 🔗 **Track History**: Navigate between policy versions easily

**Start using it today** - just ingest any NIST landing page URL!

---

*Version: 1.0.0*
*Last Updated: 2026-02-13*
*Status: Production Ready*
