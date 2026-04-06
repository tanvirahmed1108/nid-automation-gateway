import React, { useState } from 'react';
import axios from 'axios';
import './app.css';

const API = 'http://127.0.0.1:8000';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [view, setView] = useState('scan');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });
  const [toast, setToast] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAuth = async () => {
    if (!credentials.username || !credentials.password) return showToast('Enter username & password', 'error');

    if (authMode === 'admin') {
      if (credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD) {
        setIsAdmin(true);
        setIsLoggedIn(true);
        showToast('Welcome, Administrator!');
      } else {
        showToast('Invalid admin credentials', 'error');
      }
      return;
    }

    setAuthLoading(true);
    const endpoint = authMode === 'login' ? '/login' : '/register';
    try {
      await axios.post(`${API}${endpoint}`, credentials);
      if (authMode === 'login') {
        setIsAdmin(false);
        setIsLoggedIn(true);
        showToast(`Welcome back, ${credentials.username}!`);
      } else {
        showToast('Account created! Please log in.');
        setAuthMode('login');
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Authentication failed', 'error');
    }
    setAuthLoading(false);
  };

  const handleFileChange = (f) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setFormData({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) handleFileChange(f);
    else showToast('Please upload an image file', 'error');
  };

  const handleAutoFill = async () => {
    if (!file) return showToast('Upload an NID image first', 'error');
    setLoading(true);
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await axios.post(`${API}/extract-nid?username=${credentials.username}`, data);
      if (res.data.status === 'success') {
        setFormData(res.data.data);
        showToast('NID data extracted successfully!');
      } else {
        showToast(res.data.message || 'Extraction failed', 'error');
      }
    } catch (err) {
      showToast('Extraction failed. Check backend connection.', 'error');
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/history/${credentials.username}`);
      setHistory(res.data);
      setView('history');
    } catch {
      showToast('Failed to load history', 'error');
    }
  };

  const fetchAnalytics = async () => {
    setView('analytics');
    setAnalyticsLoading(true);
    try {
      const res = await axios.get(`${API}/admin/analytics`);
      setAnalytics(res.data);
    } catch {
      showToast('Analytics fetch failed', 'error');
    }
    setAnalyticsLoading(false);
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await axios.post(`${API}/generate-report`, formData, {
        responseType: 'blob',
        headers: { 'Content-Type': 'application/json' }
      });
      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const err = JSON.parse(text);
        showToast(err.detail || 'PDF generation failed', 'error');
        return;
      }
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NID_Report_${formData.nid_number || 'citizen'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Report downloaded successfully!');
    } catch (err) {
      showToast('PDF download failed. Check backend.', 'error');
    }
    setPdfLoading(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setIsAdmin(false);
    setAuthMode('login');
    setView('scan');
    setFormData({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });
    setFile(null);
    setPreview(null);
    setHistory([]);
    setAnalytics(null);
  };

  // --- AUTH SCREEN ---
  if (!isLoggedIn) {
    return (
      <div className="auth-screen">
        <div className="auth-bg-grid"></div>
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-flag">
              <span className="flag-green"></span>
              <span className="flag-circle"></span>
            </div>
            <h1>Smart-Nagorik</h1>
            <p>Bangladesh National ID Gateway</p>
          </div>

          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign In</button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
            <button className={authMode === 'admin' ? 'active admin-tab' : 'admin-tab'} onClick={() => setAuthMode('admin')}>🛡️ Admin</button>
          </div>

          <div className="auth-form">
            <div className="input-group">
              <span className="input-icon">👤</span>
              <input
                type="text" placeholder="Username"
                value={credentials.username}
                onChange={e => setCredentials({ ...credentials, username: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
              />
            </div>
            <div className="input-group">
              <span className="input-icon">🔒</span>
              <input
                type="password" placeholder="Password"
                value={credentials.password}
                onChange={e => setCredentials({ ...credentials, password: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
              />
            </div>
            <button className="btn-auth" onClick={handleAuth} disabled={authLoading}>
              {authLoading ? <span className="spinner"></span> : (
                authMode === 'login' ? 'Sign In' :
                authMode === 'register' ? 'Create Account' :
                '🛡️ Admin Login'
              )}
            </button>
          </div>
        </div>
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="app-shell">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-flag">
            <span className="flag-green-s"></span>
            <span className="flag-circle-s"></span>
          </div>
          <div>
            <h2>Smart-Nagorik</h2>
            <p>ID Gateway</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${view === 'scan' ? 'active' : ''}`} onClick={() => setView('scan')}>
            <span className="nav-icon">⚡</span>
            <span>NID Scanner</span>
          </button>
          <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={fetchHistory}>
            <span className="nav-icon">📋</span>
            <span>Scan History</span>
          </button>
          {isAdmin && (
            <button className={`nav-item nav-item-admin ${view === 'analytics' ? 'active' : ''}`} onClick={fetchAnalytics}>
              <span className="nav-icon">📊</span>
              <span>Admin Analytics</span>
            </button>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">{credentials.username.charAt(0).toUpperCase()}</div>
          <div className="user-info">
            <strong>{credentials.username}</strong>
            <span>{isAdmin ? '🛡️ Administrator' : 'Operator'}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Logout">⏻</button>
        </div>
      </aside>

      <main className="main-content">

        {/* SCAN VIEW */}
        {view === 'scan' && (
          <div className="page-content">
            <div className="page-header">
              <div>
                <h2>NID Scanner</h2>
                <p>Upload a National ID card to extract citizen data</p>
              </div>
              <div className="header-badge">Module 3 & 4</div>
            </div>

            <div className="scan-grid">
              <div className="panel">
                <div className="panel-header">
                  <span className="step-num">01</span>
                  <h3>Identity Upload</h3>
                </div>

                <div
                  className={`drop-zone ${dragOver ? 'drag-over' : ''} ${preview ? 'has-preview' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input').click()}
                >
                  {preview ? (
                    <img src={preview} alt="NID Preview" className="preview-img" />
                  ) : (
                    <div className="drop-hint">
                      <div className="drop-icon">🪪</div>
                      <p>Drop NID image here</p>
                      <span>or click to browse</span>
                    </div>
                  )}
                  <input
                    id="file-input" type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => handleFileChange(e.target.files[0])}
                  />
                </div>

                {file && (
                  <div className="file-info">
                    <span>📎 {file.name}</span>
                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                )}

                <button className="btn-extract" onClick={handleAutoFill} disabled={loading || !file}>
                  {loading ? (
                    <><span className="spinner"></span> AI Processing...</>
                  ) : (
                    <><span>⚡</span> Extract NID Data</>
                  )}
                </button>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="step-num">02</span>
                  <h3>Extracted Data & Eligibility</h3>
                </div>

                <div className="data-fields">
                  <div className="data-field">
                    <label>Full Name</label>
                    <div className="field-value">{formData.name || <span className="placeholder">—</span>}</div>
                  </div>
                  <div className="data-field">
                    <label>NID Number</label>
                    <div className="field-value mono">{formData.nid_number || <span className="placeholder">—</span>}</div>
                  </div>
                  <div className="data-row">
                    <div className="data-field">
                      <label>Date of Birth</label>
                      <div className="field-value">{formData.dob || <span className="placeholder">—</span>}</div>
                    </div>
                    <div className="data-field">
                      <label>Age</label>
                      <div className="field-value">{formData.age ? `${formData.age} yrs` : <span className="placeholder">—</span>}</div>
                    </div>
                  </div>
                </div>

                {formData.benefits && formData.benefits.length > 0 && (
                  <div className="benefits-section">
                    <label>Eligible Services</label>
                    <div className="benefits-grid">
                      {formData.benefits.map((b, i) => (
                        <div key={i} className="benefit-chip">
                          <span className="chip-dot"></span>
                          {b.split('(')[0].trim()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {formData.name && formData.name !== 'Not Found' && (
                  <button className="btn-pdf" onClick={handleDownloadPDF} disabled={pdfLoading}>
                    {pdfLoading ? (
                      <><span className="spinner"></span> Generating...</>
                    ) : (
                      <><span>📄</span> Download Official Report</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <div className="page-content">
            <div className="page-header">
              <div>
                <h2>Scan History</h2>
                <p>All NID scans performed by <strong>{credentials.username}</strong></p>
              </div>
              <div className="header-badge">{history.length} records</div>
            </div>

            <div className="panel">
              {history.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <p>No scan history yet. Start by scanning an NID.</p>
                </div>
              ) : (
                <div className="history-table">
                  <div className="table-header">
                    <span>Timestamp</span>
                    <span>Name</span>
                    <span>NID Number</span>
                    <span>Age</span>
                    <span>Services</span>
                  </div>
                  {history.map((h, i) => (
                    <div key={i} className="table-row">
                      <span className="mono small">{h.timestamp}</span>
                      <span className="bold">{h.name}</span>
                      <span className="mono">{h.nid_number}</span>
                      <span>{h.age ? `${h.age} yrs` : '—'}</span>
                      <span>
                        <span className="count-badge">{h.benefits?.length || 0} services</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ANALYTICS VIEW — admin only */}
        {view === 'analytics' && (
          <div className="page-content">
            {!isAdmin ? (
              <div className="access-denied">
                <div className="denied-icon">🚫</div>
                <h3>Access Denied</h3>
                <p>You do not have permission to view this page.</p>
              </div>
            ) : (
              <>
                <div className="page-header">
                  <div>
                    <h2>Admin Analytics</h2>
                    <p>Real-time regional citizen service demand insights</p>
                  </div>
                  <div className="header-badge admin">Admin Panel</div>
                </div>

                {analyticsLoading ? (
                  <div className="loading-state">
                    <span className="spinner large"></span>
                    <p>Loading analytics...</p>
                  </div>
                ) : analytics ? (
                  <>
                    <div className="stats-row">
                      <div className="stat-card primary">
                        <div className="stat-icon">👥</div>
                        <div>
                          <div className="stat-num">{analytics.total_scans}</div>
                          <div className="stat-label">Total Citizens Scanned</div>
                        </div>
                      </div>
                      {Object.entries(analytics.age_groups || {}).map(([group, count]) => (
                        <div key={group} className="stat-card">
                          <div className="stat-num">{count}</div>
                          <div className="stat-label">{group}</div>
                          <div className="stat-pct">
                            {analytics.total_scans > 0 ? ((count / analytics.total_scans) * 100).toFixed(1) : 0}%
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="panel">
                      <div className="panel-header">
                        <span className="step-num">📊</span>
                        <h3>Service Demand Breakdown</h3>
                      </div>
                      <div className="demand-bars">
                        {Object.entries(analytics.service_demand || {}).length === 0 ? (
                          <p className="placeholder">No service data available yet.</p>
                        ) : Object.entries(analytics.service_demand || {})
                          .sort(([, a], [, b]) => b - a)
                          .map(([service, count]) => {
                            const pct = analytics.total_scans > 0 ? (count / analytics.total_scans) * 100 : 0;
                            return (
                              <div key={service} className="demand-bar-row">
                                <div className="demand-label">
                                  <span>{service.split('(')[0].trim()}</span>
                                  <span className="demand-count">{count} req.</span>
                                </div>
                                <div className="bar-track">
                                  <div className="bar-fill" style={{ width: `${pct}%` }}>
                                    <span className="bar-pct">{pct.toFixed(0)}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">📊</div>
                    <p>No analytics data available.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
