import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AdminDashboard = () => {
    const [analytics, setAnalytics] = useState(null);

    useEffect(() => {
        // Backend URL check kore nio, port 8000 default thake
        axios.get("http://127.0.0.1:8000/admin/analytics")
            .then(res => setAnalytics(res.data))
            .catch(err => console.error("Admin access denied", err));
    }, []);

    if (!analytics) return <div className="loading" style={{padding: '20px'}}>Loading Analytics Dashboard...</div>;

    // Highest Demand Service ber korar age check kora dorkar data ache ki na
    const services = analytics.service_demand || {}; // Backend-e service_demand name chilo
    const highestService = Object.keys(services).length > 0 
        ? Object.keys(services).reduce((a, b) => services[a] > services[b] ? a : b)
        : "No data available";

    return (
        <div className="admin-panel section card full-width" style={{padding: '20px', border: '1px solid #ddd', borderRadius: '15px'}}>
            <h2 style={{color: '#006a4e'}}>🏛️ Administrator Analytics Dashboard</h2>
            <p>Real-time insights for regional citizen needs.</p>
            <hr />
            
            <div className="stats-grid" style={{display: 'flex', gap: '20px', marginTop: '20px'}}>
                <div className="stat-card" style={{flex: 1, background: '#f8f9fa', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}>
                    <h3 style={{fontSize: '1rem', color: '#555'}}>Total Population Scanned</h3>
                    <p style={{fontSize: '2.5rem', fontWeight: 'bold', margin: '10px 0', color: '#006a4e'}}>
                        {analytics.total_scans || 0}
                    </p>
                </div>
                
                <div className="stat-card" style={{flex: 1, background: '#f8f9fa', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}>
                    <h3 style={{fontSize: '1rem', color: '#555'}}>Highest Demand Service</h3>
                    <p style={{fontSize: '1.2rem', fontWeight: '600', marginTop: '15px', color: '#d9534f'}}>
                        🔥 {highestService}
                    </p>
                </div>
            </div>

            <div className="charts-mockup" style={{marginTop: '40px'}}>
                <h3 style={{marginBottom: '20px'}}>Demographic Breakdown (Age-based Needs)</h3>
                {/* age_groups backend theke ashtese */}
                {Object.entries(analytics.age_groups || {}).map(([group, count]) => {
                    // Calculation logic for width
                    const percentage = analytics.total_scans > 0 ? (count / analytics.total_scans) * 100 : 0;
                    
                    return (
                        <div key={group} style={{marginBottom: '15px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                                <strong>{group} Group</strong>
                                <span>{count} citizens ({percentage.toFixed(1)}%)</span>
                            </div>
                            <div style={{
                                background: '#e9ecef', 
                                borderRadius: '10px', 
                                width: '100%', 
                                height: '15px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    background: '#006a4e', 
                                    // FIXED: Backticks added for Template Literal
                                    width: `${percentage}%`, 
                                    height: '100%',
                                    transition: 'width 1s ease-in-out'
                                }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminDashboard;