import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import './PolicyDetail.css';

interface Document {
  id: string;
  title: string;
  docType: string;
  sourceUrl?: string;
  downloadUrl?: string;
  landingPageUrl?: string;
  isLandingPage?: boolean;
  contentType: string;
  fetchedAt: string;
  status: string;
  tags: Array<{ tag: string; confidence: number; }>;
  frameworks: string[];
  metadata: Record<string, any>;
  versionInfo?: {
    publicationSeries: string;
    revision: string;
    update: string;
    status: 'draft' | 'final' | 'superseded' | 'withdrawn';
    publishedDate?: string;
    supersededDate?: string;
  };
  versionChain?: {
    previousVersionId?: string;
    nextVersionId?: string;
    supersededBy?: string;
    relatedVersions?: string[];
  };
  formats?: {
    pdf?: { url: string; blobPath: string; size?: string; };
    docx?: { url: string; blobPath: string; };
    html?: { url: string; blobPath: string; };
    json?: { url: string; blobPath: string; };
    xlsx?: { url: string; blobPath: string; };
  };
}

export default function PolicyDetail() {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDocument();
  }, [id]);

  async function loadDocument() {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api.getDocument(id);
      setDocument(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="policy-detail">
        <div className="loading">Loading policy details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="policy-detail">
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="policy-detail">
        <div className="error">Document not found</div>
      </div>
    );
  }

  return (
    <div className="policy-detail">
      {/* Deprecation Banner */}
      {document.versionInfo?.status === 'superseded' && (
        <div className="deprecation-banner">
          <strong>⚠️ This version has been superseded</strong>
          {document.versionChain?.nextVersionId && (
            <Link to={`/policies/${document.versionChain.nextVersionId}`}>
              View latest version →
            </Link>
          )}
        </div>
      )}

      {/* Document Header */}
      <div className="document-header">
        <h2>{document.title}</h2>
        <div className="document-meta">
          <span className="doc-type">{document.docType.toUpperCase()}</span>
          <span className="status">{document.status}</span>
          <span className="fetched-at">
            Fetched {new Date(document.fetchedAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="policy-content">
        {/* Version Information Card */}
        {document.versionInfo && (
          <div className="version-info-card">
            <h3>Version Information</h3>
            <div className="version-details">
              <div className="version-row">
                <span className="label">Publication:</span>
                <span className="value">{document.versionInfo.publicationSeries}</span>
              </div>
              <div className="version-row">
                <span className="label">Revision:</span>
                <span className="value">
                  Revision {document.versionInfo.revision}
                  {document.versionInfo.update !== '0' && ` Update ${document.versionInfo.update}`}
                </span>
              </div>
              <div className="version-row">
                <span className="label">Status:</span>
                <span className={`status-badge status-${document.versionInfo.status}`}>
                  {document.versionInfo.status.toUpperCase()}
                </span>
              </div>
              {document.versionInfo.publishedDate && (
                <div className="version-row">
                  <span className="label">Published:</span>
                  <span className="value">
                    {new Date(document.versionInfo.publishedDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              {document.versionInfo.supersededDate && (
                <div className="version-row">
                  <span className="label">Superseded:</span>
                  <span className="value">
                    {new Date(document.versionInfo.supersededDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Available Formats */}
        {document.formats && Object.keys(document.formats).length > 0 && (
          <div className="formats-card">
            <h3>Available Formats</h3>
            <div className="format-buttons">
              {document.formats.pdf && (
                <a
                  href={document.formats.pdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="format-button"
                >
                  📄 PDF {document.formats.pdf.size && `(${document.formats.pdf.size})`}
                </a>
              )}
              {document.formats.docx && (
                <a
                  href={document.formats.docx.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="format-button"
                >
                  📝 Word
                </a>
              )}
              {document.formats.xlsx && (
                <a
                  href={document.formats.xlsx.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="format-button"
                >
                  📊 Excel
                </a>
              )}
              {document.formats.json && (
                <a
                  href={document.formats.json.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="format-button"
                >
                  {'{}'} JSON
                </a>
              )}
              {document.formats.html && (
                <a
                  href={document.formats.html.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="format-button"
                >
                  🌐 HTML
                </a>
              )}
            </div>
          </div>
        )}

        {/* Version Timeline */}
        {document.versionChain && (
          <div className="version-timeline-card">
            <h3>Version History</h3>
            <div className="version-timeline">
              {/* Current version */}
              <div className="timeline-item current">
                <div className="timeline-marker"></div>
                <div className="timeline-content">
                  <div className="version-label">
                    {document.versionInfo && (
                      <>
                        Revision {document.versionInfo.revision}
                        {document.versionInfo.update !== '0' && ` Update ${document.versionInfo.update}`}
                      </>
                    )}
                    <span className="badge-current">Current</span>
                  </div>
                  <div className="version-date">
                    {document.versionInfo?.publishedDate &&
                      new Date(document.versionInfo.publishedDate).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Next version (if this is superseded) */}
              {document.versionChain.nextVersionId && (
                <div className="timeline-item">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <div className="version-label">Newer Version Available</div>
                    <Link to={`/policies/${document.versionChain.nextVersionId}`} className="view-version-link">
                      View newer version →
                    </Link>
                  </div>
                </div>
              )}

              {/* Previous version */}
              {document.versionChain.previousVersionId && (
                <div className="timeline-item">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <div className="version-label">Previous Version</div>
                    <Link to={`/policies/${document.versionChain.previousVersionId}`} className="view-version-link">
                      View previous version →
                    </Link>
                  </div>
                </div>
              )}

              {/* Related versions count */}
              {document.versionChain.relatedVersions && document.versionChain.relatedVersions.length > 0 && (
                <div className="related-versions-count">
                  {document.versionChain.relatedVersions.length} related version(s) available
                </div>
              )}
            </div>
          </div>
        )}

        {/* Document Metadata */}
        <div className="metadata-card">
          <h3>Document Information</h3>
          <div className="metadata-row">
            <span className="label">Source URL:</span>
            <span className="value">
              {document.sourceUrl && (
                <a href={document.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {document.sourceUrl}
                </a>
              )}
            </span>
          </div>
          {document.isLandingPage && document.landingPageUrl && (
            <div className="metadata-row">
              <span className="label">Landing Page:</span>
              <span className="value">
                <a href={document.landingPageUrl} target="_blank" rel="noopener noreferrer">
                  {document.landingPageUrl}
                </a>
              </span>
            </div>
          )}
          {document.downloadUrl && (
            <div className="metadata-row">
              <span className="label">Document URL:</span>
              <span className="value">
                <a href={document.downloadUrl} target="_blank" rel="noopener noreferrer">
                  {document.downloadUrl}
                </a>
              </span>
            </div>
          )}
          <div className="metadata-row">
            <span className="label">Content Type:</span>
            <span className="value">{document.contentType}</span>
          </div>
        </div>

        {/* Tags and Frameworks */}
        {(document.tags.length > 0 || document.frameworks.length > 0) && (
          <div className="tags-card">
            <h3>Tags & Frameworks</h3>
            {document.frameworks.length > 0 && (
              <div className="frameworks">
                <strong>Frameworks:</strong>
                {document.frameworks.map((framework, i) => (
                  <span key={i} className="framework-tag">{framework}</span>
                ))}
              </div>
            )}
            {document.tags.length > 0 && (
              <div className="tags">
                <strong>Tags:</strong>
                {document.tags.map((tag, i) => (
                  <span key={i} className="tag">
                    {tag.tag} ({Math.round(tag.confidence * 100)}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
