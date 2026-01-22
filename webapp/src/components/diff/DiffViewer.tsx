// Critical component: Diff Viewer for policy changes

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { DiffRecord, ModifiedSection } from '../../types/diff';
import { api } from '../../services/api';
import './DiffViewer.css';

export default function DiffViewer() {
  const { diffId } = useParams<{ diffId: string }>();
  const [diff, setDiff] = useState<DiffRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'added' | 'removed' | 'modified'>('summary');

  useEffect(() => {
    loadDiff();
  }, [diffId]);

  async function loadDiff() {
    try {
      setLoading(true);
      const data = await api.getDiff(diffId!);
      setDiff(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load diff');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading diff...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!diff) {
    return <div className="error">Diff not found</div>;
  }

  const { summaryJson, llmExplanation, changeType, changeScore } = diff;

  return (
    <div className="diff-viewer">
      {/* Header */}
      <div className="diff-header">
        <div className="diff-title">
          <h1>Policy Update Diff</h1>
          <span className={`severity-badge severity-${changeType.toLowerCase()}`}>
            {changeType}
          </span>
        </div>
        <div className="diff-meta">
          <span className="change-score">
            Change Score: <strong>{changeScore}</strong>/100
          </span>
          <span className="diff-date">
            {format(new Date(diff.computedAt), 'MMM d, yyyy HH:mm')}
          </span>
        </div>
      </div>

      {/* Summary Panel */}
      {llmExplanation && (
        <div className="summary-panel">
          <h2>Summary of Changes</h2>
          <ul className="summary-bullets">
            {llmExplanation.summaryBullets.map((bullet, idx) => (
              <li key={idx}>{bullet}</li>
            ))}
          </ul>

          {llmExplanation.impactedTags.length > 0 && (
            <div className="impacted-tags">
              <strong>Impacted Tags:</strong>
              <div className="tag-list">
                {llmExplanation.impactedTags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {llmExplanation.riskNotes && (
            <div className="risk-notes">
              <strong>Risk Notes:</strong>
              <p>{llmExplanation.riskNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Statistics */}
      <div className="diff-stats">
        <div className="stat">
          <div className="stat-value">{summaryJson.stats.totalSections}</div>
          <div className="stat-label">Total Sections</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summaryJson.stats.sectionsChanged}</div>
          <div className="stat-label">Changed</div>
        </div>
        <div className="stat added">
          <div className="stat-value">{summaryJson.addedSections.length}</div>
          <div className="stat-label">Added</div>
        </div>
        <div className="stat removed">
          <div className="stat-value">{summaryJson.removedSections.length}</div>
          <div className="stat-label">Removed</div>
        </div>
        <div className="stat modified">
          <div className="stat-value">{summaryJson.modifiedSections.length}</div>
          <div className="stat-label">Modified</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="diff-tabs">
        <button
          className={activeTab === 'summary' ? 'active' : ''}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={activeTab === 'added' ? 'active' : ''}
          onClick={() => setActiveTab('added')}
        >
          Added ({summaryJson.addedSections.length})
        </button>
        <button
          className={activeTab === 'removed' ? 'active' : ''}
          onClick={() => setActiveTab('removed')}
        >
          Removed ({summaryJson.removedSections.length})
        </button>
        <button
          className={activeTab === 'modified' ? 'active' : ''}
          onClick={() => setActiveTab('modified')}
        >
          Modified ({summaryJson.modifiedSections.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="diff-content">
        {activeTab === 'summary' && llmExplanation && (
          <div className="evidence-snippets">
            <h3>Evidence Snippets</h3>
            {llmExplanation.evidenceSnippets.map((snippet, idx) => (
              <div key={idx} className="evidence-snippet">
                <div className="snippet-before">
                  <strong>Before:</strong>
                  <p>{snippet.before}</p>
                </div>
                <div className="snippet-after">
                  <strong>After:</strong>
                  <p>{snippet.after}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'added' && (
          <div className="section-list">
            {summaryJson.addedSections.map((section, idx) => (
              <div key={idx} className="section-card added">
                <h4 className="section-heading">{section.headingPath.join(' > ')}</h4>
                <p className="section-preview">{section.preview}</p>
              </div>
            ))}
            {summaryJson.addedSections.length === 0 && (
              <p className="empty-state">No sections added</p>
            )}
          </div>
        )}

        {activeTab === 'removed' && (
          <div className="section-list">
            {summaryJson.removedSections.map((section, idx) => (
              <div key={idx} className="section-card removed">
                <h4 className="section-heading">{section.headingPath.join(' > ')}</h4>
                <p className="section-preview">{section.preview}</p>
              </div>
            ))}
            {summaryJson.removedSections.length === 0 && (
              <p className="empty-state">No sections removed</p>
            )}
          </div>
        )}

        {activeTab === 'modified' && (
          <div className="modified-sections">
            {summaryJson.modifiedSections.map((section, idx) => (
              <ModifiedSectionCard key={idx} section={section} />
            ))}
            {summaryJson.modifiedSections.length === 0 && (
              <p className="empty-state">No sections modified</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModifiedSectionCard({ section }: { section: ModifiedSection }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="section-card modified">
      <div className="section-header" onClick={() => setExpanded(!expanded)}>
        <div>
          <h4 className="section-heading">{section.headingPath.join(' > ')}</h4>
          <span className="change-percent">{section.changePercent.toFixed(1)}% changed</span>
        </div>
        <button className="expand-button">{expanded ? '−' : '+'}</button>
      </div>

      {expanded && (
        <div className="section-content">
          <ReactDiffViewer
            oldValue={section.beforeSnippet}
            newValue={section.afterSnippet}
            splitView={true}
            hideLineNumbers={false}
            showDiffOnly={true}
          />
        </div>
      )}
    </div>
  );
}
