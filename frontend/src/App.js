import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // --- 1. STATE MANAGEMENT ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '', nid_number: '', dob: '', benefits: []
  });

  // --- 2. AUTHENTICATION LOGIC ---
  const handleAuth = async () => {
    const endpoint = authMode === 'login' ? '/login' : '/register';
    try {
      // Points to the FastAPI backend port 8000
      await axios.post(`http://127.0.0.1:8000${endpoint}`, credentials);
      
      if (authMode === 'login') {
        setIsLoggedIn(true);
      } else {
        alert("Registration Successful! Please switch to Login.");
        setAuthMode('login');
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Connection Error: Is the backend running?");
    }
  };

  // --- 3. NID SCANNER LOGIC ---
  const onFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleAutoFill = async () => {
    if (!file) return alert("Please upload an NID image first!");
    setLoading(true);
    
    const data = new FormData();
    data.append('file', file);

    try {
      const response = await axios.post('http://127.0.0.1:8000/extract-nid', data);
      const res = response.data.data;
      setFormData({
        name: res.name,
        nid_number: res.nid_number,
        dob: res.dob,
        benefits: res.eligible_benefits
      });
    } catch (err) {
      alert("AI Processing Error. Check if Python backend is running in CPU mode.");
    }
    setLoading(false);
  };

  // --- 4. CONDITIONAL UI RENDERING ---

  // VIEW A: Polished Login/Register Screen
  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <h2>{authMode === 'login' ? '🔐 Member Login' : '📝 Create Account'}</h2>
          <div className="field">
            <input 
              type="text" 
              placeholder="Username" 
              onChange={e => setCredentials({...credentials, username: e.target.value})} 
            />
          </div>
          <div className="field">
            <input 
              type="password" 
              placeholder="Password" 
              onChange={e => setCredentials({...credentials, password: e.target.value})} 
            />
          </div>
          <button className="btn-primary" onClick={handleAuth}>
            {authMode === 'login' ? 'Login' : 'Register'}
          </button>
          <p className="toggle-text" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? "New here? Create an account" : "Already have an account? Login"}
          </p>
        </div>
      </div>
    );
  }

  // VIEW B: Main NID Gateway Dashboard (Restored with Full UI)
  return (
    <div className="App">
      <header className="navbar">
        <h2>Smart-Nagorik Gateway</h2>
        <button className="btn-logout" onClick={() => setIsLoggedIn(false)}>Logout</button>
      </header>
      
      <div className="container">
        {/* Step 1: Upload and Preview Section */}
        <div className="section card">
          <h3>1. Upload NID Image</h3>
          <div className="upload-box">
            <input type="file" onChange={onFileChange} accept="image/*" />
          </div>
          {preview && (
            <div className="preview-container">
              <img src={preview} alt="NID Preview" className="nid-preview" />
            </div>
          )}
          <button 
            onClick={handleAutoFill} 
            disabled={loading} 
            className={`btn-primary ${loading ? 'btn-loading' : ''}`}
          >
            {loading ? "AI is Extracting Data..." : "Auto-Fill Form"}
          </button>
        </div>

        {/* Step 2: Extracted Information and Benefits Section */}
        <div className="section card">
          <h3>2. Processed Information</h3>
          <div className="field-group">
            <div className="field">
              <label>Full Name</label>
              <input type="text" value={formData.name} readOnly placeholder="Waiting for scan..." />
            </div>
            <div className="field">
              <label>NID Number</label>
              <input type="text" value={formData.nid_number} readOnly placeholder="Waiting for scan..." />
            </div>
            <div className="field">
              <label>Date of Birth</label>
              <input type="text" value={formData.dob} readOnly placeholder="Waiting for scan..." />
            </div>
          </div>
          
          <div className="benefits-box">
            <h4>Eligible Government Services:</h4>
            <div className="benefits-list">
              {formData.benefits.length > 0 ? (
                formData.benefits.map((service, index) => (
                  <div key={index} className="benefit-item">
                    <span className="check-icon">✅</span> {service}
                  </div>
                ))
              ) : (
                <p className="hint-text">Upload and scan an NID to check eligibility.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;