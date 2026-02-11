import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Dashboard from './components/dashboard/Dashboard';
import PolicyDetail from './components/policy/PolicyDetail';
import DiffViewer from './components/diff/DiffViewer';
import IngestForm from './components/ingest/IngestForm';
import LogViewer from './components/logs/LogViewer';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ingest" element={<IngestForm />} />
          <Route path="/logs" element={<LogViewer />} />
          <Route path="/policies/:id" element={<PolicyDetail />} />
          <Route path="/diffs/:diffId" element={<DiffViewer />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
