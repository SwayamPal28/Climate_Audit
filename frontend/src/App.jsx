// src/App.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [status, setStatus] = useState("");
  const [anomalies, setAnomalies] = useState([]);

  useEffect(() => {
    // Check backend health
    axios.get("http://localhost:4000/health")
      .then(res => setStatus(res.data))
      .catch(err => setStatus("Error connecting to backend"));

    // Fetch anomalies
    axios.get("http://localhost:4000/api/audit/anomalies")
      .then(res => setAnomalies(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Climate Audit X</h1>
      <h2>Backend Status: {status}</h2>

      <h3>Anomalies:</h3>
      {anomalies.length > 0 ? (
        <ul>
          {anomalies.map((a, i) => (
            <li key={i}>{JSON.stringify(a)}</li>
          ))}
        </ul>
      ) : (
        <p>No anomalies loaded yet.</p>
      )}
    </div>
  );
}

export default App;
