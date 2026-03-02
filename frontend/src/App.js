import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '', nid_number: '', dob: '', benefits: []
  });

  const onFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
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
    } catch (error) {
      alert("Backend error. Make sure your Python server is running!");
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <header className="navbar">
        <h2>Smart-Nagorik Gateway</h2>
      </header>
      <div className="container">
        <div className="section">
          <h3>1. Scan NID Card</h3>
          <div className="upload-box">
            <input type="file" onChange={onFileChange} accept="image/*" />
            {preview && <img src={preview} alt="NID Preview" className="nid-preview" />}
            <button onClick={handleAutoFill} disabled={loading} className="btn-primary">
              {loading ? "AI Processing..." : "Auto-Fill Application"}
            </button>
          </div>
        </div>
        <div className="section">
          <h3>2. Digital Application</h3>
          <div className="field"><label>Full Name</label><input type="text" value={formData.name} readOnly /></div>
          <div className="field"><label>NID Number</label><input type="text" value={formData.nid_number} readOnly /></div>
          <div className="field"><label>Date of Birth</label><input type="text" value={formData.dob} readOnly /></div>
          <div className="benefits-box">
            <h4>Eligible Services:</h4>
            {formData.benefits.map((b, i) => <p key={i}>✅ {b}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;