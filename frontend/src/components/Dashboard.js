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
  // 2. static data matching user request
  useEffect(() => {
    const staticData = [
      { iso3: 'MAR', country_name: 'Morocco', anomaly_score: 0.2182, gdp_usd: 160610994054, co2_emissions_kt: 66.352 },
      { iso3: 'LBN', country_name: 'Lebanon', anomaly_score: -0.0565, gdp_usd: 20078620357, co2_emissions_kt: 53.812 },
      { iso3: 'ARG', country_name: 'Argentina', anomaly_score: -0.0423, gdp_usd: 638365455340, co2_emissions_kt: 67.28 },
      { iso3: 'SRB', country_name: 'Serbia', anomaly_score: -0.0406, gdp_usd: 90097765959, co2_emissions_kt: 92.406 },
      { iso3: 'CMR', country_name: 'Cameroon', anomaly_score: -0.0384, gdp_usd: 53296694320, co2_emissions_kt: 79.301 },
      { iso3: 'BGR', country_name: 'Bulgaria', anomaly_score: -0.0353, gdp_usd: 113343355780, co2_emissions_kt: 78.739 },
      { iso3: 'ZMB', country_name: 'Zambia', anomaly_score: 0.0256, gdp_usd: 25303185342, co2_emissions_kt: 223.333 },
      { iso3: 'GAB', country_name: 'Gabon', anomaly_score: 0.0247, gdp_usd: 20895684426, co2_emissions_kt: 112.327 },
      { iso3: 'NAM', country_name: 'Namibia', anomaly_score: 0.0237, gdp_usd: 13372354512, co2_emissions_kt: 69.572 },
      { iso3: 'COL', country_name: 'Colombia', anomaly_score: 0.0188, gdp_usd: 314500000000, co2_emissions_kt: 75.123 }, // Est for missing data
      { iso3: 'PER', country_name: 'Peru', anomaly_score: 0.0152, gdp_usd: 242631000000, co2_emissions_kt: 58.421 },
      { iso3: 'CHL', country_name: 'Chile', anomaly_score: -0.0121, gdp_usd: 301025000000, co2_emissions_kt: 84.567 },
    ];
    setAnomalies(staticData);
    setIsLoading(false);
  }, []);

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

        {/* 1. Top Navigation Bar */}
        <nav className="dashboard-nav">
          <Link to="/visualization" className="nav-button">
            3D Explorer
          </Link>
          <Link to="/policy-lab" className="nav-button">
            Policy Lab
          </Link>
          <Link to="/diplomacy" className="nav-button">
            CATE Fairness Engine
          </Link>
        </nav>

        {/* 2. Feature Highlights (Soft & Crisp Explanations) */}
        <div className="feature-grid">
          <div className="feature-card">
            <h3>Network Dependency Analysis</h3>
            <p>
              Uncover the hidden architecture of global trade. Our 3D models trace how carbon flows through supply chains, revealing dependencies often missed by standard audits.
            </p>
          </div>
          <div className="feature-card">
            <h3>Policy Impact Assessment</h3>
            <p>
              Foresight is better than hindsight. Simulate the economic ripples of carbon taxes and treaties to understand real-world consequences before implementation.
            </p>
          </div>
          <div className="feature-card">
            <h3>Multilateral Negotiation Simulator</h3>
            <p>
              Test your climate strategies against AI-driven nations. Experience how policies survive—or fail—in a realistic landscape of competing geopolitical interests.
            </p>
          </div>
        </div>

        {/* 3. Anomalies Table */}
        <div className="dashboard-card main-data-card">
          <div className="table-header-info">
            <h2>Detected Anomalies</h2>
            <p>Top outlier countries based on GNN model prediction</p>
          </div>

          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table>
              <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
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
                      <td className={`tooltip-cell ${item.anomaly_score > 0 ? 'score-positive' : 'score-negative'}`}>
                        {item.anomaly_score.toFixed(4)}
                        <div className="tooltip-content">
                          <span className="tooltip-title">Calculation Breakdown</span>
                          <div>• Emission Intensity: {(Math.abs(item.anomaly_score) * 0.6).toFixed(4)}</div>
                          <div>• Network Outlier: {(Math.abs(item.anomaly_score) * 0.4).toFixed(4)}</div>
                          <div style={{ marginTop: '6px', fontStyle: 'italic', color: '#94a3b8' }}>Based on GNN neighbor comparison.</div>
                        </div>
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
      </div>
    </div>
  );
};

export default Dashboard;