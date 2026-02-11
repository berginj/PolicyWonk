import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import './Dashboard.css';

interface Policy {
  id: string;
  title: string;
  sourceUrl?: string;
  updatedAt: string;
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
                  <div className="policy-title">
                    <Link to={`/policies/${policy.id}`}>{policy.title}</Link>
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
          <h3>Active Alerts</h3>
          {activeAlerts.length === 0 ? (
            <p className="empty-message">No active alerts configured.</p>
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
    </div>
  );
}
