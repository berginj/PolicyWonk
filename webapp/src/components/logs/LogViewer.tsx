import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import './LogViewer.css';

interface Log {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  correlationId: string;
  functionName: string;
  data?: any;
}

export default function LogViewer() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Filters
  const [filterFunction, setFilterFunction] = useState('');
  const [filterLevel, setFilterLevel] = useState<Set<string>>(new Set(['ERROR', 'WARN', 'INFO']));
  const [filterSearch, setFilterSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Pagination
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const take = 50;

  useEffect(() => {
    loadLogs();
  }, [skip, filterFunction, filterLevel]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [autoRefresh, skip, filterFunction, filterLevel]);

  async function loadLogs() {
    setLoading(true);
    setError(null);

    try {
      const params: any = { skip, take };
      if (filterFunction) params.functionName = filterFunction;
      if (filterLevel.size > 0 && filterLevel.size < 4) {
        params.level = Array.from(filterLevel).join(',');
      }

      const response = await api.getLogs(params);
      setLogs(response.logs);
      setHasMore(response.hasMore);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  function toggleLevel(level: string) {
    const newFilter = new Set(filterLevel);
    if (newFilter.has(level)) {
      newFilter.delete(level);
    } else {
      newFilter.add(level);
    }
    setFilterLevel(newFilter);
    setSkip(0); // Reset pagination
  }

  function toggleExpanded(correlationId: string) {
    setExpandedLog(expandedLog === correlationId ? null : correlationId);
  }

  const filteredLogs = logs.filter(log => {
    if (filterSearch && !log.message.toLowerCase().includes(filterSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="log-viewer">
      <div className="log-viewer-header">
        <h1>System Logs</h1>
        <label className="auto-refresh-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (10s)
        </label>
      </div>

      <div className="log-filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>Function:</label>
            <select
              value={filterFunction}
              onChange={(e) => { setFilterFunction(e.target.value); setSkip(0); }}
              className="filter-select"
            >
              <option value="">All Functions</option>
              <option value="ingestUrl">ingestUrl</option>
              <option value="getDiff">getDiff</option>
              <option value="healthCheck">healthCheck</option>
              <option value="processDocument">processDocument</option>
              <option value="computeDiff">computeDiff</option>
              <option value="monitorPolicies">monitorPolicies</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Level:</label>
            <div className="level-checkboxes">
              {['ERROR', 'WARN', 'INFO', 'DEBUG'].map((level) => (
                <label key={level} className="level-checkbox">
                  <input
                    type="checkbox"
                    checked={filterLevel.has(level)}
                    onChange={() => toggleLevel(level)}
                  />
                  {level}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Search:</label>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Filter by message..."
              className="filter-input"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="log-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && <div className="log-loading">Loading logs...</div>}

      {!loading && filteredLogs.length === 0 && (
        <div className="log-empty">No logs found matching your filters.</div>
      )}

      {!loading && filteredLogs.length > 0 && (
        <>
          <div className="log-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Function</th>
                  <th>Message</th>
                  <th>Correlation ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, idx) => (
                  <tr
                    key={`${log.correlationId}-${idx}`}
                    className={`log-row log-level-${log.level.toLowerCase()}`}
                    onClick={() => toggleExpanded(log.correlationId)}
                  >
                    <td className="log-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="log-level">
                      <span className={`level-badge level-${log.level.toLowerCase()}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="log-function">{log.functionName}</td>
                    <td className="log-message">{log.message}</td>
                    <td className="log-correlation">
                      <code>{log.correlationId.substring(0, 8)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {expandedLog && (
            <div className="log-detail-modal" onClick={() => setExpandedLog(null)}>
              <div className="log-detail-content" onClick={(e) => e.stopPropagation()}>
                <h3>Log Details</h3>
                {filteredLogs
                  .filter((l) => l.correlationId === expandedLog)
                  .map((log, idx) => (
                    <div key={idx} className="log-detail">
                      <div className="detail-row">
                        <strong>Timestamp:</strong>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Level:</strong>
                        <span className={`level-badge level-${log.level.toLowerCase()}`}>
                          {log.level}
                        </span>
                      </div>
                      <div className="detail-row">
                        <strong>Function:</strong>
                        <span>{log.functionName}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Correlation ID:</strong>
                        <code>{log.correlationId}</code>
                      </div>
                      <div className="detail-row">
                        <strong>Message:</strong>
                        <span>{log.message}</span>
                      </div>
                      {log.data && (
                        <div className="detail-row">
                          <strong>Data:</strong>
                          <pre>{JSON.stringify(log.data, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                <button
                  className="close-button"
                  onClick={() => setExpandedLog(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          <div className="log-pagination">
            <div>
              Showing {skip + 1}-{skip + filteredLogs.length} logs
            </div>
            <div className="pagination-buttons">
              <button
                onClick={() => setSkip(Math.max(0, skip - take))}
                disabled={skip === 0}
              >
                Previous
              </button>
              <button
                onClick={() => setSkip(skip + take)}
                disabled={!hasMore}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
