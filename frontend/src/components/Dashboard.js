import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as d3 from 'd3';
import './Dashboard.css';

const Dashboard = () => {
  const [anomalies, setAnomalies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countryNames, setCountryNames] = useState({});

  // 1. Load country names mapping from local CSV
  useEffect(() => {
    const loadCountryNames = async () => {
      try {
        const response = await fetch('/iso3_to_name_map.csv');
        if (!response.ok) throw new Error('Failed to load name map');

        const csvText = await response.text();
        const data = d3.csvParse(csvText);
        const namesMap = {};

        data.forEach(row => {
          if (row.iso3 && row['Country Name']) {
            namesMap[row.iso3.trim()] = row['Country Name'].trim();
          }
        });
        setCountryNames(namesMap);
      } catch (err) {
        console.error('Error loading country names:', err);
        // We don't block the whole dashboard if names fail, just log it
      }
    };

    loadCountryNames();
  }, []);

  // 2. Fetch anomalies from Backend
  useEffect(() => {
    const fetchAnomalies = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/audit/anomalies');

        // Check if server returned 200 OK
        if (!response.ok) {
          const errorDetail = await response.text();
          throw new Error(`Server Error (${response.status}): ${errorDetail}`);
        }

        const data = await response.json();

        // Helper to normalize data from different potential column names
        const processData = (items) => items.map(item => {
          const iso = (item.iso3 || item.wb_code || '').trim();
          return {
            ...item,
            iso3: iso || 'N/A',
            country_name: countryNames[iso] || item.country_name || item.name || 'Unknown',
            gdp_usd: Number(item.gdp_usd) || 0,
            // Fallback: Check both co2_emissions_kt AND co2_kt
            co2_emissions_kt: Number(item.co2_emissions_kt) || Number(item.co2_kt) || 0,
            anomaly_score: Number(item.anomaly_score) || 0
          };
        });

        // Combine positive and negative anomalies into one list for the table
        const allAnomalies = [
          ...processData(data.top_positive || []),
          ...processData(data.top_negative || [])
        ].sort((a, b) => Math.abs(b.anomaly_score) - Math.abs(a.anomaly_score));

        setAnomalies(allAnomalies);
        setError(null);
      } catch (err) {
        console.error('Error fetching anomalies:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch anomalies once countryNames mapping is loaded
    if (Object.keys(countryNames).length > 0) {
      fetchAnomalies();
    }
  }, [countryNames]);

  // Loading State
  if (isLoading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading dashboard data...</div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error-display">
          <h2>Dashboard Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Climate Audit Dashboard</h1>
        <p>Analysis of environmental and economic anomalies</p>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-card">
          <div className="table-header-info">
            <h2>Detected Anomalies</h2>
            <p>Top outlier countries based on GNN model prediction</p>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ISO Code</th>
                  <th>Country Name</th>
                  <th>Anomaly Score</th>
                  <th>GDP (USD)</th>
                  <th>CO2 (kt)</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.length > 0 ? (
                  anomalies.map((item, index) => (
                    <tr key={`${item.iso3}-${index}`}>
                      <td><code>{item.iso3}</code></td>
                      <td>{item.country_name}</td>
                      <td className={item.anomaly_score > 0 ? 'score-positive' : 'score-negative'}>
                        {item.anomaly_score.toFixed(4)}
                      </td>
                      <td>${item.gdp_usd.toLocaleString()}</td>
                      <td>{item.co2_emissions_kt.toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center' }}>No anomalies found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="visualization-cta">
          <div className="cta-text">
            <h3>Interactive Analysis</h3>
            <p>Dive into the relationship between these countries in a 3D Graph visualization.</p>
          </div>
          <Link to="/visualization" className="cta-button">
            Launch 3D Explorer
          </Link>
        </div>

        <div className="visualization-cta" style={{ marginTop: '20px' }}>
          <div className="cta-text">
            <h3>Policy Simulator</h3>
            <p>Run "What-If" scenarios: CBAM Carbon Tax, Technology Transfer, and Fairness Frameworks.</p>
          </div>
          <Link to="/policy-lab" className="cta-button" style={{ backgroundColor: '#6366f1' }}>
            Launch Policy Lab
          </Link>
        </div>

        <div className="visualization-cta" style={{ marginTop: '20px' }}>
          <div className="cta-text">
            <h3>⚔️ Diplomatic War Room</h3>
            <p>Test policies against AI opponents. See how countries retaliate in real-time game scenarios.</p>
          </div>
          <Link to="/diplomacy" className="cta-button" style={{ backgroundColor: '#ef4444' }}>
            Enter Sandbox (BETA)
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;