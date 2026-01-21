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
          <Link to="/search" className="nav-link">Search</Link>
          <Link to="/alerts" className="nav-link">Alerts</Link>
        </nav>
      </div>
    </header>
  );
}
