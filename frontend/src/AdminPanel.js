import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AdminDashboard = () => {
    const [analytics, setAnalytics] = useState(null);

    useEffect(() => {
        axios.get("http://127.0.0.1:8000/admin/analytics")
            .then(res => setAnalytics(res.data))
            .catch(err => console.error("Admin access denied"));
    }, []);

    if (!analytics) return <div className="loading">Loading Analytics...</div>;

    return (
        <div className="admin-panel section card full-width">
            <h2 style={{color: '#006a4e'}}>🏛️ Administrator Analytics Dashboard</h2>
            <hr />
            <div className="stats-grid" style={{display: 'flex', gap: '20px', marginTop: '20px'}}>
                <div className="stat-card" style={{flex: 1, background: '#f8f9fa', padding: '20px', borderRadius: '10px'}}>
                    <h3>Total Population Scanned</h3>
                    <p style={{fontSize: '2rem', fontWeight: 'bold'}}>{analytics.total_scans_all_users}</p>
                </div>
                
                <div className="stat-card" style={{flex: 1, background: '#f8f9fa', padding: '20px', borderRadius: '10px'}}>
                    <h3>Highest Demand Service</h3>
                    <p>{Object.keys(analytics.service_trends).reduce((a, b) => analytics.service_trends[a] > analytics.service_trends[b] ? a : b)}</p>
                </div>
            </div>

            <div className="charts-mockup" style={{marginTop: '30px'}}>
                <h3>Demographic Breakdown (Regional Needs)</h3>
                {Object.entries(analytics.demographics).map(([group, count]) => (
                    <div key={group} style={{marginBottom: '10px'}}>
                        <label>{group}: {count}</label>
                        <div style={{
                            background: '#e9ecef', 
                            borderRadius: '5px', 
                            width: '100%', 
                            height: '20px'
                        }}>
                            <div style={{
                                background: '#006a4e', 
                                width: ${(count / analytics.total_scans_all_users) * 100}%, 
                                height: '100%',
                                borderRadius: '5px',
                                transition: 'width 1s'
                            }}></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminDashboard;