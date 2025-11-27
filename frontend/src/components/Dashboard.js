import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as d3 from 'd3';
import './Dashboard.css';

const Dashboard = () => {
  const [anomalies, setAnomalies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [countryNames, setCountryNames] = useState({});

  // Load country names from CSV
  useEffect(() => {
    const loadCountryNames = async () => {
      try {
        const response = await fetch('/iso3_to_name_map.csv');
        const csvText = await response.text();
        const data = d3.csvParse(csvText);
        const namesMap = {};
        data.forEach(row => {
          if (row.iso3 && row['Country Name']) {
            namesMap[row.iso3] = row['Country Name'];
          }
        });
        setCountryNames(namesMap);
      } catch (error) {
        console.error('Error loading country names:', error);
      }
    };

    loadCountryNames();
  }, []);

  useEffect(() => {
    const fetchAnomalies = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/audit/anomalies');
        const data = await response.json();
        
        // Process and combine all anomalies
        const processData = (items) => items.map(item => ({
          ...item,
          country_name: countryNames[item.iso3] || item.country_name || item.wb_name || item.name || 'N/A',
          iso3: item.iso3 || item.wb_code || 'N/A',
          gdp_usd: Number(item.gdp_usd) || 0,
          co2_emissions_kt: Number(item.co2_emissions_kt) || 0,
          anomaly_score: Number(item.anomaly_score) || 0
        }));

        // Combine and sort all anomalies
        const allAnomalies = [
          ...processData(data.top_positive || []),
          ...processData(data.top_negative || [])
        ].sort((a, b) => Math.abs(b.anomaly_score) - Math.abs(a.anomaly_score));

        setAnomalies(allAnomalies);
      } catch (error) {
        console.error('Error fetching anomalies:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (Object.keys(countryNames).length > 0) {
      fetchAnomalies();
    }
  }, [countryNames]);

  if (isLoading) {
    return <div className="loading">Loading dashboard data...</div>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Climate Audit Dashboard</h1>
        <p>Analysis of environmental and economic indicators</p>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Country</th>
                  <th>Anomaly Score</th>
                  <th>GDP (USD)</th>
                  <th>CO2 (kt)</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((item, index) => (
                  <tr key={index}>
                    <td>{item.iso3}</td>
                    <td>{item.country_name || 'N/A'}</td>
                    <td className={item.anomaly_score > 0 ? 'positive' : 'negative'}>
                      {item.anomaly_score?.toFixed(4)}
                    </td>
                    <td>${item.gdp_usd?.toLocaleString()}</td>
                    <td>{item.co2_emissions_kt?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="visualization-cta">
          <h3>Explore the Data Visually</h3>
          <p>View an interactive 3D visualization of the climate data</p>
          <Link to="/visualization" className="cta-button">
            View 3D Visualization
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;