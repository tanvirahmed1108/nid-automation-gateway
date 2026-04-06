// AdminPanel is now integrated directly into App.js analytics view.
// This file is kept for reference / standalone use.
import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AdminDashboard = () => {
    const [analytics, setAnalytics] = useState(null);

    useEffect(() => {
        axios.get("http://127.0.0.1:8000/admin/analytics")
            .then(res => setAnalytics(res.data))
            .catch(err => console.error("Admin access denied", err));
    }, []);

    if (!analytics) return <div style={{ padding: '20px' }}>Loading Analytics Dashboard...</div>;

    const services = analytics.service_demand || {};
    const highestService = Object.keys(services).length > 0
        ? Object.keys(services).reduce((a, b) => services[a] > services[b] ? a : b)
        : "No data available";

    return (
        <div style={{ padding: '20px' }}>
            <h2>Analytics Dashboard</h2>
            <p>Total Scans: {analytics.total_scans}</p>
            <p>Highest Demand: {highestService}</p>
        </div>
    );
};

export default AdminDashboard;
