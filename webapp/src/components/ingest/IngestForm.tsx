import { useState } from 'react';
import { api } from '../../services/api';
import './IngestForm.css';

export default function IngestForm() {
  const [url, setUrl] = useState('');
  const [docType, setDocType] = useState<'policy' | 'contract'>('policy');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [enableMonitoring, setEnableMonitoring] = useState(false);
  const [monitoringCadence, setMonitoringCadence] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ documentId: string; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate URL
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);

    try {
      const metadata: any = {};
      if (title) metadata.title = title;
      if (tags) metadata.tags = tags.split(',').map(t => t.trim()).filter(t => t);

      if (enableMonitoring) {
        const nextCheckMs =
          monitoringCadence === 'daily' ? 24 * 60 * 60 * 1000 :
          monitoringCadence === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
          30 * 24 * 60 * 60 * 1000;

        metadata.monitoringConfig = {
          enabled: true,
          cadence: monitoringCadence,
          nextCheckAt: new Date(Date.now() + nextCheckMs).toISOString()
        };
      }

      const response = await api.ingestUrl(url, docType, metadata);

      setSuccess({
        documentId: response.documentId,
        message: response.message || 'Document submitted for processing'
      });

      // Clear form on success
      setUrl('');
      setTitle('');
      setTags('');
      setEnableMonitoring(false);
      setMonitoringCadence('daily');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to submit document');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setUrl('');
    setTitle('');
    setTags('');
    setEnableMonitoring(false);
    setMonitoringCadence('daily');
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="ingest-form-container">
      <div className="ingest-form-card">
        <h1>Add New Policy Document</h1>
        <p className="ingest-form-description">
          Submit a policy or contract document for monitoring and analysis.
          The system will extract text, analyze changes, and generate AI-powered insights.
        </p>

        {error && (
          <div className="ingest-alert ingest-alert-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="ingest-alert ingest-alert-success">
            <strong>Success!</strong> {success.message}
            <div className="ingest-document-id">
              Document ID: <code>{success.documentId}</code>
            </div>
            <p className="ingest-next-steps">
              Processing typically takes 30-60 seconds. Check the logs to monitor progress.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="ingest-form">
          <div className="ingest-form-group">
            <label htmlFor="url">
              Document URL <span className="required">*</span>
            </label>
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/policy.pdf"
              required
              disabled={loading}
              className="ingest-input"
            />
            <small className="ingest-help-text">
              Enter the URL of a PDF, DOCX, HTML, or text document
            </small>
          </div>

          <div className="ingest-form-group">
            <label>
              Document Type <span className="required">*</span>
            </label>
            <div className="ingest-radio-group">
              <label className="ingest-radio-label">
                <input
                  type="radio"
                  value="policy"
                  checked={docType === 'policy'}
                  onChange={(e) => setDocType(e.target.value as 'policy')}
                  disabled={loading}
                />
                <span>Policy</span>
                <small>Terms of Service, Privacy Policy, Compliance Docs</small>
              </label>
              <label className="ingest-radio-label">
                <input
                  type="radio"
                  value="contract"
                  checked={docType === 'contract'}
                  onChange={(e) => setDocType(e.target.value as 'contract')}
                  disabled={loading}
                />
                <span>Contract</span>
                <small>Vendor Agreements, SLAs, Legal Contracts</small>
              </label>
            </div>
          </div>

          <div className="ingest-form-group">
            <label htmlFor="title">Title (optional)</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="White House Privacy Policy"
              disabled={loading}
              className="ingest-input"
            />
            <small className="ingest-help-text">
              A friendly name for this document
            </small>
          </div>

          <div className="ingest-form-group">
            <label htmlFor="tags">Tags (optional)</label>
            <input
              type="text"
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="federal, privacy, critical"
              disabled={loading}
              className="ingest-input"
            />
            <small className="ingest-help-text">
              Comma-separated tags for organization
            </small>
          </div>

          <div className="ingest-form-group">
            <label className="ingest-checkbox-label">
              <input
                type="checkbox"
                checked={enableMonitoring}
                onChange={(e) => setEnableMonitoring(e.target.checked)}
                disabled={loading}
              />
              <span>Enable automatic monitoring for changes</span>
            </label>
            <small className="ingest-help-text">
              PolicyWonk will periodically check the source URL for updates and compute diffs
            </small>
          </div>

          {enableMonitoring && (
            <div className="ingest-form-group">
              <label htmlFor="cadence">Monitoring Frequency</label>
              <select
                id="cadence"
                value={monitoringCadence}
                onChange={(e) => setMonitoringCadence(e.target.value as 'daily' | 'weekly' | 'monthly')}
                disabled={loading}
                className="ingest-input"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <small className="ingest-help-text">
                How often to check for changes
              </small>
            </div>
          )}

          <div className="ingest-form-actions">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="ingest-button ingest-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !url}
              className="ingest-button ingest-button-primary"
            >
              {loading ? 'Submitting...' : 'Submit for Processing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
