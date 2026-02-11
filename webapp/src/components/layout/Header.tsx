import { Link } from 'react-router-dom';
import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <h1>PolicyWonk</h1>
          <span className="tagline">Policy Monitoring & Diff Analysis</span>
        </Link>
        <nav className="nav">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/ingest" className="nav-link">Ingest Policy</Link>
          <Link to="/logs" className="nav-link">Logs</Link>
        </nav>
      </div>
    </header>
  );
}
