import React, { useState, useEffect } from 'react';
import { HealthResponse, VersionResponse } from '../../../packages/schema';

const SERVICE_URL = 'http://127.0.0.1:8000';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [statusState, setStatusState] = useState<'checking' | 'healthy' | 'offline'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkHealth = async () => {
    setStatusState('checking');
    setErrorMsg(null);
    try {
      const [healthRes, versionRes] = await Promise.all([
        fetch(`${SERVICE_URL}/health`),
        fetch(`${SERVICE_URL}/version`)
      ]);

      if (!healthRes.ok || !versionRes.ok) {
        throw new Error(`HTTP Error: Health (${healthRes.status}) / Version (${versionRes.status})`);
      }

      const healthData: HealthResponse = await healthRes.json();
      const versionData: VersionResponse = await versionRes.json();

      setHealth(healthData);
      setVersion(versionData);
      setStatusState('healthy');
    } catch (err: any) {
      setStatusState('offline');
      setErrorMsg(err.message || 'Unable to connect to local FastAPI service');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="container">
      <header className="header">
        <div className="logo-group">
          <div className="logo-icon">W</div>
          <h1 className="title">WebRAG Studio</h1>
        </div>
        <div className={`status-badge status-${statusState}`}>
          <span className="status-dot"></span>
          <span>{statusState.toUpperCase()}</span>
        </div>
      </header>

      <section className="card">
        <h2 className="card-title">Backend Connectivity</h2>
        
        {statusState === 'checking' && (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Connecting to http://127.0.0.1:8000 ...</p>
        )}

        {statusState === 'healthy' && health && version && (
          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">API Version</span>
              <span className="meta-value">v{health.version}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Schema Version</span>
              <span className="meta-value">v{health.schemaVersion}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Capture Modes</span>
              <span className="meta-value">{version.supportedModes.length} modes</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Chunkers</span>
              <span className="meta-value">{version.supportedChunkers.length} strategies</span>
            </div>
          </div>
        )}

        {statusState === 'offline' && (
          <div className="error-banner">
            <strong>Service Unreachable</strong>
            <span>{errorMsg}</span>
            <span>Make sure your local FastAPI backend is running:</span>
            <div className="code-block">python3 -m uvicorn service.main:app --port 8000</div>
          </div>
        )}

        <button className="btn btn-secondary" onClick={checkHealth} style={{ marginTop: '4px' }}>
          Check Service Status
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Day 1 Walking Skeleton</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          MV3 Extension side panel established. Ready for Day 2 DOM extraction and provenance pipeline.
        </p>
      </section>
    </div>
  );
};
