import './Dashboard.css';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Policy Monitoring Dashboard</h2>
        <p>Track policy updates and analyze changes across cloud providers</p>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Recent Updates</h3>
          <p>View the latest policy changes and updates</p>
        </div>
        <div className="card">
          <h3>Active Alerts</h3>
          <p>Monitor your configured alert rules</p>
        </div>
        <div className="card">
          <h3>Monitored Policies</h3>
          <p>Browse all tracked policy documents</p>
        </div>
      </div>
    </div>
  );
}
