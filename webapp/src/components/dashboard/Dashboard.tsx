import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import AlertForm from '../alerts/AlertForm';
import './Dashboard.css';

interface Policy {
  id: string;
  title: string;
  sourceUrl?: string;
  updatedAt: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  monitoringConfig?: {
    enabled: boolean;
  };
  latestDiff?: {
    diffId: string;
    changeType: string;
    changeScore: number;
    computedAt: string;
  };
}

interface Alert {
  alertId: string;
  name: string;
  enabled: boolean;
  alertType: string;
}

export default function Dashboard() {
  const [recentPolicies, setRecentPolicies] = useState<Policy[]>([]);
  const [monitoredCount, setMonitoredCount] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAlertForm, setShowAlertForm] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    setError(null);

    try {
      // Fetch recent policies with latest diffs
      const recentData = await api.getPolicies({ recent: true, limit: 5 });
      setRecentPolicies(recentData.policies || []);

      // Fetch monitored policies count
      const monitoredData = await api.getPolicies({ monitored: true, limit: 100 });
      setMonitoredCount(monitoredData.total || 0);

      // Fetch active alerts
      const alertsData = await api.getAlerts({ active: true });
      setActiveAlerts(alertsData.alerts || []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  function getChangeTypeBadgeClass(changeType: string): string {
    switch (changeType) {
      case 'MAJOR':
        return 'change-badge change-major';
      case 'MODERATE':
        return 'change-badge change-moderate';
      case 'MINOR':
        return 'change-badge change-minor';
      default:
        return 'change-badge';
    }
  }

  function getStatusBadge(status?: string): { label: string; className: string } | null {
    switch (status) {
      case 'failed':
        return { label: '⚠ Failed', className: 'status-badge status-failed' };
      case 'pending':
        return { label: '⏳ Pending', className: 'status-badge status-pending' };
      case 'processing':
        return { label: '⚙ Processing', className: 'status-badge status-processing' };
      default:
        return null;
    }
  }

  async function handleDeletePolicy(policyId: string, policyTitle: string) {
    if (!window.confirm(`Are you sure you want to delete "${policyTitle}"? This will remove all versions, diffs, and alerts associated with this policy.`)) {
      return;
    }

    setDeleting(policyId);
    try {
      await api.deleteDocument(policyId);
      // Remove from the list
      setRecentPolicies(prev => prev.filter(p => p.id !== policyId));
      setMonitoredCount(prev => prev - 1);
    } catch (err: any) {
      alert(`Failed to delete policy: ${err.response?.data?.error || err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="dashboard-error">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Policy Monitoring Dashboard</h2>
        <p>Track policy updates and analyze changes across cloud providers</p>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Recent Updates</h3>
          {recentPolicies.length === 0 ? (
            <p className="empty-message">No recent policy updates. <Link to="/ingest">Ingest a policy</Link> to get started.</p>
          ) : (
            <ul className="policy-list">
              {recentPolicies.map((policy) => (
                <li key={policy.id} className="policy-item">
                  <div className="policy-header">
                    <div className="policy-title">
                      <Link to={`/policies/${policy.id}`}>{policy.title}</Link>
                      {getStatusBadge(policy.status) && (
                        <span className={getStatusBadge(policy.status)!.className}>
                          {getStatusBadge(policy.status)!.label}
                        </span>
                      )}
                    </div>
                    <button
                      className="delete-button"
                      onClick={() => handleDeletePolicy(policy.id, policy.title)}
                      disabled={deleting === policy.id}
                      title="Delete this policy"
                    >
                      {deleting === policy.id ? '...' : '🗑️'}
                    </button>
                  </div>
                  {policy.latestDiff && (
                    <div className="policy-meta">
                      <span className={getChangeTypeBadgeClass(policy.latestDiff.changeType)}>
                        {policy.latestDiff.changeType}
                      </span>
                      <span className="policy-date">
                        {new Date(policy.latestDiff.computedAt).toLocaleDateString()}
                      </span>
                      <Link to={`/diffs/${policy.latestDiff.diffId}`} className="view-diff-link">
                        View Diff
                      </Link>
                    </div>
                  )}
                  {!policy.latestDiff && (
                    <div className="policy-meta">
                      <span className="policy-date">
                        Updated {new Date(policy.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header-row">
            <h3>Active Alerts</h3>
            <button className="add-alert-button" onClick={() => setShowAlertForm(true)}>
              + Create Alert
            </button>
          </div>
          {activeAlerts.length === 0 ? (
            <p className="empty-message">No active alerts configured. Create one to get notified of policy changes.</p>
          ) : (
            <ul className="alert-list">
              {activeAlerts.map((alert) => (
                <li key={alert.alertId} className="alert-item">
                  <div className="alert-name">{alert.name}</div>
                  <div className="alert-type">{alert.alertType}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="card-footer">
            <strong>{activeAlerts.length}</strong> active {activeAlerts.length === 1 ? 'alert' : 'alerts'}
          </div>
        </div>

        <div className="card">
          <h3>Monitored Policies</h3>
          <div className="stat-display">
            <div className="stat-number">{monitoredCount}</div>
            <div className="stat-label">{monitoredCount === 1 ? 'policy' : 'policies'} actively monitored</div>
          </div>
          {monitoredCount === 0 && (
            <p className="empty-message">
              <Link to="/ingest">Ingest a policy</Link> to start monitoring for changes.
            </p>
          )}
        </div>
      </div>

      {showAlertForm && (
        <AlertForm
          onClose={() => setShowAlertForm(false)}
          onCreated={() => {
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}
