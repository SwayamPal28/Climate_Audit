// frontend/src/components/AuditDashboard.jsx
// V2.0 Component for displaying country audit results
import React, { useState } from 'react';
import axios from 'axios';

const AuditDashboard = () => {
  const [isoCode, setIsoCode] = useState('');
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAudit = async () => {
    if (!isoCode.trim()) {
      setError('Please enter an ISO code (e.g., IND, USA, CHN)');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/audit/${isoCode.trim().toUpperCase()}`);
      setAuditData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch audit data');
      setAuditData(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'CLEAN':
        return '#27ae60'; // Green
      case 'FLAGGED':
        return '#e74c3c'; // Red
      case 'INCONCLUSIVE':
        return '#f39c12'; // Orange
      default:
        return '#95a5a6'; // Gray
    }
  };

  const getRiskColor = (score) => {
    if (score >= 70) return '#e74c3c'; // High risk - Red
    if (score >= 40) return '#f39c12'; // Medium risk - Orange
    return '#27ae60'; // Low risk - Green
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>ClimaAuditX 2.0 - Country Audit</h2>
      
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Enter ISO Code (e.g., IND, USA, BDI)"
          value={isoCode}
          onChange={(e) => setIsoCode(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && fetchAudit()}
          style={{
            padding: '10px',
            fontSize: '16px',
            flex: 1,
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        />
        <button
          onClick={fetchAudit}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Loading...' : 'Audit'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {auditData && (
        <div style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#f9f9f9'
        }}>
          <h3 style={{ marginTop: 0 }}>Audit Results for {auditData.iso}</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <strong>AI Status:</strong>
            <span style={{
              marginLeft: '10px',
              padding: '5px 15px',
              borderRadius: '4px',
              backgroundColor: getStatusColor(auditData.ai_status),
              color: 'white',
              fontWeight: 'bold'
            }}>
              {auditData.ai_status}
            </span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong>Risk Score:</strong>
            <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                flex: 1,
                height: '25px',
                backgroundColor: '#ecf0f1',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${auditData.risk_score}%`,
                  height: '100%',
                  backgroundColor: getRiskColor(auditData.risk_score),
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <span style={{ fontWeight: 'bold', color: getRiskColor(auditData.risk_score) }}>
                {auditData.risk_score}%
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong>Supply Chain Role:</strong>
            <span style={{ marginLeft: '10px', fontSize: '18px' }}>
              {auditData.supply_chain_role}
            </span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong>Reported Energy Intensity:</strong>
            <span style={{ marginLeft: '10px' }}>
              {auditData.reported_intensity} (units)
            </span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong>Message:</strong>
            <p style={{ marginTop: '5px', fontStyle: 'italic', color: '#555' }}>
              {auditData.message}
            </p>
          </div>

          <div style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#ecf0f1',
            borderRadius: '4px',
            fontSize: '14px'
          }}>
            <strong>Details:</strong>
            <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
              <li>GDP: ${auditData.details.gdp_bn.toFixed(2)} billion</li>
              <li>Model Version: {auditData.details.model_version}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditDashboard;
