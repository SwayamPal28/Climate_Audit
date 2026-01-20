import React, { useEffect, useState } from "react";
import axios from "axios";
// Import your new components (make sure the filenames match exactly)
import ShapleyForm from "./components/ShapleyForm";
import GraphVisualization from "./components/GraphVisualization";
import PolicyLab from "./components/PolicyLab";

function App() {
  const [anomalies, setAnomalies] = useState({ top_positive: [], top_negative: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch structured anomalies from the new backend endpoint (use proxy)
    axios.get("/api/audit/anomalies")
      .then(res => {
        setAnomalies(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching anomalies:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="dashboard-container"> {/* Use CSS class instead of inline style */}
      <header className="dashboard-header">
        <h1>ClimaAuditX Dashboard</h1>
        <p>AI-Powered Global Carbon Attribution & Anomaly Detection</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}> {/* Reduced gap */}

        {/* SECTION 1: GRAPH VISUALIZATION */}
        <div className="dashboard-card">
          <h3>Network Trade Graph</h3>
          <div style={{ height: "500px", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "8px", overflow: "hidden" }}>
            <GraphVisualization />
          </div>
        </div>

        {/* SECTION 2: SHAPLEY FAIR-SHARE ATTRIBUTION */}
        <div className="dashboard-card">
          <h3>Shared Responsibility Model (Audited)</h3>
          <ShapleyForm />
        </div>

        {/* SECTION 3: TOP POSITIVE ANOMALIES (High Predicted vs Actual) */}
        <div className="dashboard-card">
          <h3 style={{ color: "#ef4444" }}>⚠️ Top Audit Flags (Potential Under-reporting)</h3>
          {loading ? <p className="loading">Analyzing roles...</p> : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Actual CO2</th>
                    <th>Anomaly Score</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.top_positive.map((a, i) => (
                    <tr key={i}>
                      <td>{a.iso3 || a.id}</td>
                      <td>{a.co2_emissions_kt?.toLocaleString()} kt</td>
                      <td className="negative">{a.anomaly_score?.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SECTION 4: TOP NEGATIVE ANOMALIES (Low Predicted vs Actual) */}
        <div className="dashboard-card">
          <h3 style={{ color: "#10b981" }}>✅ Top Efficiency Flags (Over-performers)</h3>
          {loading ? <p className="loading">Analyzing roles...</p> : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Actual CO2</th>
                    <th>Anomaly Score</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.top_negative.map((a, i) => (
                    <tr key={i}>
                      <td>{a.iso3 || a.id}</td>
                      <td>{a.co2_emissions_kt?.toLocaleString()} kt</td>
                      <td className="positive">{a.anomaly_score?.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* SECTION 5: POLICY LAB - Full Width */}
      <div style={{ marginTop: "30px" }}>
        <div className="dashboard-card">
          <h3 style={{ marginBottom: "20px" }}>🧪 Policy Lab - What-If Scenarios</h3>
          <PolicyLab />
        </div>
      </div>
    </div>
  );
}

// Simple CSS-in-JS styles
const cardStyle = {
  backgroundColor: "#fff",
  padding: "25px",
  borderRadius: "12px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
  border: "1px solid #e0e0e0"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "10px"
};

export default App;