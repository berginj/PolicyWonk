import { useState } from 'react';
import { api } from '../../services/api';
import './AlertForm.css';

interface AlertFormProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function AlertForm({ onClose, onCreated }: AlertFormProps) {
  const [name, setName] = useState('');
  const [alertType, setAlertType] = useState<'new_document' | 'policy_update' | 'deprecation'>('policy_update');
  const [email, setEmail] = useState('');
  const [minSeverity, setMinSeverity] = useState<'MAJOR' | 'MODERATE' | 'MINOR' | ''>('');
  const [keywords, setKeywords] = useState('');
  const [tags, setTags] = useState('');
  const [meaningfulOnly, setMeaningfulOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Alert name is required');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Valid email address is required');
      return;
    }

    setLoading(true);

    try {
      const criteria: any = {};

      if (keywords.trim()) {
        criteria.keywords = keywords.split(',').map(k => k.trim()).filter(Boolean);
      }

      if (tags.trim()) {
        criteria.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }

      if (minSeverity) {
        criteria.minSeverity = minSeverity;
      }

      criteria.meaningfulChangeOnly = meaningfulOnly;

      await api.createAlert({
        name: name.trim(),
        alertType,
        criteria,
        notificationChannels: [{ type: 'email', address: email.trim() }],
      });

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create alert');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="alert-form-overlay" onClick={onClose}>
      <div className="alert-form-modal" onClick={e => e.stopPropagation()}>
        <div className="alert-form-header">
          <h3>Create Alert</h3>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="alert-form-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="alertName">Alert Name *</label>
            <input
              id="alertName"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., AWS Policy Changes"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="alertType">Alert Type *</label>
            <select
              id="alertType"
              value={alertType}
              onChange={e => setAlertType(e.target.value as any)}
              disabled={loading}
            >
              <option value="policy_update">Policy Update</option>
              <option value="new_document">New Document</option>
              <option value="deprecation">Deprecation</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address *</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="minSeverity">Minimum Severity</label>
            <select
              id="minSeverity"
              value={minSeverity}
              onChange={e => setMinSeverity(e.target.value as any)}
              disabled={loading}
            >
              <option value="">Any</option>
              <option value="MINOR">Minor or higher</option>
              <option value="MODERATE">Moderate or higher</option>
              <option value="MAJOR">Major only</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="keywords">Keywords (comma-separated)</label>
            <input
              id="keywords"
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="e.g., security, compliance"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags (comma-separated)</label>
            <input
              id="tags"
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g., AWS, HIPAA"
              disabled={loading}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={meaningfulOnly}
                onChange={e => setMeaningfulOnly(e.target.checked)}
                disabled={loading}
              />
              Only notify on meaningful changes
            </label>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Creating...' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
