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
      await axios.post(http://127.0.0.1:8000${endpoint}, credentials);
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
      const res = await axios.post(http://127.0.0.1:8000/extract-nid?username=${credentials.username}, data);
      setFormData(res.data.data);
    } catch (err) { alert("Extraction Failed!"); }
    setLoading(false);
  };

  // Module 5: Analytics & History Fetch
  const fetchHistory = async () => {
    const res = await axios.get(http://127.0.0.1:8000/history/${credentials.username});
    setHistory(res.data);
    setView('history');
  };

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(http://127.0.0.1:8000/admin/analytics);
      setAnalytics(res.data);
      setView('analytics');
    } catch (err) { alert("Admin Analytics fetch failed!"); }
  };

  // Module 5: PDF Download Logic (Memory-Safe)
  const handleDownloadPDF = async () => {
    try {
      const res = await axios.post("http://127.0.0.1:8000/generate-report", formData, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', NID_Report_${formData.nid_number}.pdf);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { alert("PDF Error! Check backend console."); }
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-container card">
          <h2>{authMode === 'login' ? '🔐 Member Login' : '📝 Create Account'}</h2>
          <input type="text" placeholder="Username" onChange={e => setCredentials({...credentials, username: e.target.value})} />
          <input type="password" placeholder="Password" onChange={e => setCredentials({...credentials, password: e.target.value})} />
          <button className="btn-primary" onClick={handleAuth}>{authMode === 'login' ? 'Login' : 'Register'}</button>
          <p onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{cursor: 'pointer', color: '#006a4e', marginTop: '10px'}}>
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
          <button onClick={fetchAnalytics} className="btn-admin">Admin Analytics</button>
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
              <p><strong>Name:</strong> {formData.name || '---'}</p>
              <p><strong>NID:</strong> {formData.nid_number || '---'}</p>
              <p><strong>DOB:</strong> {formData.dob || '---'}</p>
              <div className="benefits">
                {formData.benefits && formData.benefits.map((b, i) => (
                  <span key={i} className="badge">✅ {b}</span>
                ))}
              </div>
              {formData.name && formData.name !== 'Not Found' && (
                <button onClick={handleDownloadPDF} className="btn-pdf">📄 Download Official Report</button>
              )}
            </div>
          </div>
        ) : view === 'history' ? (
          <div className="section card full-width">
            <h3>📜 Personal Scan History</h3>
            <div className="history-list">
              {history.length > 0 ? history.map((h, i) => (
                <div key={i} className="history-item">
                  <span>📅 {h.timestamp}</span> | <strong>{h.name}</strong> (NID: {h.nid_number})
                </div>
              )) : <p>No history found.</p>}
            </div>
          </div>
        ) : (
          <div className="section card full-width">
            <h3>📊 Administrator Dashboard: Regional Needs</h3>
            <hr />
            {analytics ? (
              <div className="analytics-container">
                <div className="analytics-grid">
                  <div className="stat-box"><h4>Total Scans</h4><p>{analytics.total_population || analytics.total_scans}</p></div>
                  <div className="stat-box"><h4>Youth (18-35)</h4><p>{analytics.age_groups?.Youth || analytics.demographics?.Youth}</p></div>
                  <div className="stat-box"><h4>Seniors (65+)</h4><p>{analytics.age_groups?.Senior || analytics.demographics?.Senior}</p></div>
                </div>
                
                <div className="service-trends">
                  <h4>Demographic Service Demand</h4>
                  {analytics.service_demand && Object.entries(analytics.service_demand).map(([service, count]) => (
                    <div key={service} className="trend-bar">
                      <span>{service}</span>
                      <div className="bar-bg"><div className="bar-fill" style={{width: ${(count/analytics.total_scans)*100}%}}></div></div>
                      <span>{count} req.</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p>Loading Analytics...</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;