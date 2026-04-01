import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [view, setView] = useState('scan');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [formData, setFormData] = useState({ name: '', nid_number: '', dob: '', benefits: [] });

  // Module 2: Auth Logic
  const handleAuth = async () => {
    const endpoint = authMode === 'login' ? '/login' : '/register';
    try {
      await axios.post(`http://127.0.0.1:8000${endpoint}`, credentials);
      if (authMode === 'login') setIsLoggedIn(true);
      else { alert("Account Created! Login Now."); setAuthMode('login'); }
    } catch (err) { alert(err.response?.data?.detail || "Auth Error"); }
  };

  // Module 3 & 4: OCR & History Logic
  const handleAutoFill = async () => {
    if (!file) return alert("Upload NID image!");
    setLoading(true);
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await axios.post(`http://127.0.0.1:8000/extract-nid?username=${credentials.username}`, data);
      setFormData(res.data.data);
    } catch (err) { alert("Extraction Failed!"); }
    setLoading(false);
  };

  // Module 5: Analytics & History Fetch
  const fetchHistory = async () => {
    const res = await axios.get(`http://127.0.0.1:8000/history/${credentials.username}`);
    setHistory(res.data);
    setView('history');
  };

  const fetchAnalytics = async () => {
    const res = await axios.get(`http://127.0.0.1:8000/admin/analytics`);
    setAnalytics(res.data);
    setView('analytics');
  };

  // Module 5: PDF Download Logic
  const handleDownloadPDF = async () => {
    try {
      const res = await axios.post("http://127.0.0.1:8000/generate-report", formData, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NID_Report.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) { alert("PDF Error!"); }
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-container card">
          <h2>{authMode === 'login' ? '🔐 Member Login' : '📝 Create Account'}</h2>
          <input type="text" placeholder="Username" onChange={e => setCredentials({...credentials, username: e.target.value})} />
          <input type="password" placeholder="Password" onChange={e => setCredentials({...credentials, password: e.target.value})} />
          <button className="btn-primary" onClick={handleAuth}>{authMode === 'login' ? 'Login' : 'Register'}</button>
          <p onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? "New here? Create account" : "Have an account? Login"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="navbar">
        <h2 className="logo">🇧🇩 Smart-Nagorik</h2>
        <div className="nav-controls">
          <button onClick={() => setView('scan')}>New Scan</button>
          <button onClick={fetchHistory}>History</button>
          <button onClick={fetchAnalytics}>Admin Analytics</button>
          <button className="btn-logout" onClick={() => setIsLoggedIn(false)}>Logout</button>
        </div>
      </header>

      <div className="container">
        {view === 'scan' ? (
          <div className="main-grid">
            <div className="section card">
              <h3>1. Identity Upload</h3>
              <input type="file" onChange={e => {setFile(e.target.files[0]); setPreview(URL.createObjectURL(e.target.files[0]))}} />
              {preview && <img src={preview} alt="NID" className="preview-img" />}
              <button onClick={handleAutoFill} disabled={loading} className="btn-primary">
                {loading ? "AI Processing..." : "Start Extraction"}
              </button>
            </div>
            <div className="section card">
              <h3>2. Extracted Data & Eligibility</h3>
              <p><strong>Name:</strong> {formData.name}</p>
              <p><strong>NID:</strong> {formData.nid_number}</p>
              <div className="benefits">
                {formData.benefits.map((b, i) => <span key={i} className="badge">✅ {b}</span>)}
              </div>
              {formData.name !== 'Not Found' && <button onClick={handleDownloadPDF} className="btn-pdf">📄 Download PDF Report</button>}
            </div>
          </div>
        ) : view === 'history' ? (
          <div className="section card full-width">
            <h3>📜 Scan History</h3>
            {history.map((h, i) => (
              <div key={i} className="history-item">
                <span>{h.timestamp}</span> | <strong>{h.name}</strong> ({h.nid_number})
              </div>
            ))}
          </div>
        ) : (
          <div className="section card full-width">
            <h3>📊 Admin Insights</h3>
            {analytics && (
              <div className="analytics-grid">
                <div className="stat">Total Scans: {analytics.total_scans}</div>
                <div className="stat">Youth: {analytics.age_groups.Youth}</div>
                <div className="stat">Senior: {analytics.age_groups.Senior}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;