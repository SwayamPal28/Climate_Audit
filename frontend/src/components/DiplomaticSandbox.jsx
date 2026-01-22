import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './PolicyLab.css';
import './DiplomaticSandbox.css';

// --- VISUALIZATION: FAIRNESS GAUGE ---
const FairnessGauge = ({ currentTariff, fairTariff, carbonGap, leakageRisk }) => {
  // Logic for ranges
  let maxRange = fairTariff * 2.0;
  if (fairTariff <= 0) maxRange = 50;
  if (maxRange < 20) maxRange = 20;

  // Percentages for UI
  let needlePct = (currentTariff / maxRange) * 100;
  needlePct = Math.min(Math.max(needlePct, 0), 100);

  let targetPct = (fairTariff / maxRange) * 100;
  targetPct = Math.min(Math.max(targetPct, 0), 100);

  // Status Logic
  let status = "ANALYZING";
  let statusColor = "#64748b"; // slate
  let statusBg = "#f1f5f9";

  if (carbonGap <= 0) {
    if (currentTariff > 5) {
      status = "Excessive Protectionism";
      statusColor = "#ef4444";
      statusBg = "#fee2e2";
    } else {
      status = "Free Trade Area";
      statusColor = "#10b981";
      statusBg = "#d1fae5";
    }
  } else {
    // 33% / 66% zones visually
    if (needlePct < 33) {
      status = "Subsidy Risk (Leakage)";
      statusColor = "#f59e0b"; // amber
      statusBg = "#fef3c7";
    } else if (needlePct > 66) {
      status = "Protectionist Tariff";
      statusColor = "#ef4444"; // red
      statusBg = "#fee2e2";
    } else {
      status = "Fair Carbon Price";
      statusColor = "#10b981"; // emerald
      statusBg = "#d1fae5";
    }
  }

  return (
    <div style={{
      background: 'white',
      padding: '32px',
      borderRadius: '16px',
      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.08)',
      border: '1px solid #e2e8f0',
      marginBottom: '32px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          CBAM Fairness Gauge
        </div>
        <div style={{
          padding: '6px 16px',
          borderRadius: '20px',
          background: statusBg,
          color: statusColor,
          fontWeight: 700,
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {status}
        </div>
      </div>

      {/* The Track Container WITH PADDING */}
      <div style={{ position: 'relative', height: '80px', margin: '40px 10px 0 10px' }}>

        {/* Track Bar with Inset Shadow */}
        <div style={{
          position: 'absolute', top: '24px', left: 20, right: 20, height: '16px',
          borderRadius: '8px', overflow: 'hidden', display: 'flex', background: '#e2e8f0',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <div style={{ flex: 1, background: 'linear-gradient(90deg, #fef3c7 0%, #fcd34d 100%)', opacity: 0.95 }} title="Subsidy Zone"></div>
          <div style={{ flex: 1, background: 'linear-gradient(90deg, #d1fae5 0%, #34d399 100%)', opacity: 0.95 }} title="Fair Zone"></div>
          <div style={{ flex: 1, background: 'linear-gradient(90deg, #fee2e2 0%, #f87171 100%)', opacity: 0.95 }} title="Protect Zone"></div>
        </div>

        {/* Labels under track */}
        <div style={{ position: 'absolute', top: '48px', left: 20, right: 20, display: 'flex', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div style={{ flex: 1, textAlign: 'left', paddingLeft: '4px' }}>Subsidy Risk</div>
          <div style={{ flex: 1, textAlign: 'center' }}>Scientific Fair Price</div>
          <div style={{ flex: 1, textAlign: 'right', paddingRight: '4px' }}>Protectionism</div>
        </div>

        {/* Target Marker (Ideal) - Improved to never clip */}
        <div style={{
          position: 'absolute',
          left: `calc(20px + ${targetPct}% * 0.9 + 5px)`, /* Adjusted for padding */
          top: '-20px',
          bottom: '12px',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 5,
          pointerEvents: 'none'
        }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#059669',
            marginBottom: '4px',
            whiteSpace: 'nowrap',
            background: 'white',
            border: '1px solid #d1fae5',
            padding: '2px 8px',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>Scientific Target</div>
          <div style={{ width: '2px', flex: 1, borderLeft: '2px dashed #059669' }}></div>
        </div>

        {/* Current Needle - White Style */}
        <div style={{
          position: 'absolute',
          left: `calc(20px + ${needlePct}% * 0.9 + 5px)`,
          top: '-12px',
          transform: 'translateX(-50%)',
          zIndex: 20,
          transition: 'left 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
        }}>
          <div style={{
            background: 'white',
            color: '#0f172a',
            fontWeight: 800,
            fontSize: '0.9rem',
            padding: '6px 14px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            border: '1px solid #cbd5e1'
          }}>
            {currentTariff}%
          </div>
          {/* Bordered Arrow Effect */}
          <div style={{
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #cbd5e1',
            margin: '0 auto'
          }}></div>
          <div style={{
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid white',
            margin: '-7px auto 0'
          }}></div>
        </div>
      </div>

      {(() => {
        let msgTitle = "";
        let msgBody = "";
        let msgBg = "";
        let msgBorder = "";
        let msgColor = "";

        if (status.includes("Subsidy") || status.includes("Leakage")) {
          msgTitle = "Carbon Leakage Risk";
          msgBody = `Current tariff is insufficient to offset the carbon intensity gap. Domestic industries face a competitive disadvantage, incentivizing relocation to ${carbonGap > 0 ? "higher-emitting jurisdictions" : "abroad"}.`;
          msgBg = "#FFFBEB"; msgBorder = "#FCD34D"; msgColor = "#92400E";
        } else if (status.includes("Fair") || status.includes("Free Trade")) {
          msgTitle = "Optimal Policy Alignment";
          msgBody = "Tariff effectively neutralizes the carbon cost differential. This establishes a level playing field, encouraging decarbonization without distorting global trade flows.";
          msgBg = "#ECFDF5"; msgBorder = "#34D399"; msgColor = "#065F46";
        } else {
          msgTitle = "Excessive Protectionism Risk";
          msgBody = "Tariff exceeds the scientific carbon cost difference. This punitive rate offers no environmental justification and risks triggering retaliatory trade disputes (WTO violation).";
          msgBg = "#FEF2F2"; msgBorder = "#F87171"; msgColor = "#991B1B";
        }

        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: msgBg,
            border: `1px solid ${msgBorder}`,
            borderRadius: '8px',
            color: msgColor,
            fontSize: '0.9rem',
            marginTop: '16px'
          }}>
            <div>
              <strong style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>{msgTitle}</strong>
              {msgBody}
            </div>
          </div>
        );
      })()}
    </div >
  );
};

// --- CONTROL: SIDEBAR ---
const CBAMControls = ({ config, setConfig, carbonPrice, setCarbonPrice, currentTariff, setTariff, accountabilityWeight, setAccountabilityWeight }) => {
  const navigate = useNavigate();

  const highRiskSectors = [
    { value: "Steel", label: "Steel (High Risk)" },
    { value: "Aluminum", label: "Aluminum" },
    { value: "Cement", label: "Cement" },
    { value: "Fertilizers", label: "Fertilizers" },
    { value: "Hydrogen", label: "Hydrogen" },
    { value: "Electricity", label: "Electricity" }
  ];

  const countries = [
    { code: "USA", name: "United States" },
    { code: "CHN", name: "China" },
    { code: "DEU", name: "Germany (EU)" },
    { code: "IND", name: "India" },
    { code: "CAN", name: "Canada" },
    { code: "FRA", name: "France" },
    { code: "KSA", name: "Saudi Arabia" },
    { code: "BRA", name: "Brazil" },
    { code: "AUS", name: "Australia" },
    { code: "JPN", name: "Japan" },
    { code: "GBR", name: "United Kingdom" },
  ];

  return (
    <aside className="policy-sidebar">
      <div className="sidebar-header">
        <div className="lab-title">
          <span></span> CBAM ANALYSIS LAB
        </div>
        <button onClick={() => navigate('/')} className="back-link">
          ← Exit to Dashboard
        </button>
      </div>

      <div className="sidebar-controls">
        <div className="control-section-title">Trade Configuration</div>

        <div className="bilateral-grid" style={{ background: 'white', border: 'none', padding: 0 }}>
          <div className="input-group">
            <label>Importer (You)</label>
            <select className="control-select" value={config.player} onChange={e => setConfig({ ...config, player: e.target.value })}>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>

          <div className="input-group">
            <label>Exporter (Rival)</label>
            <select className="control-select" value={config.rival} onChange={e => setConfig({ ...config, rival: e.target.value })}>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="input-group">
          <label>Target Sector</label>
          <select className="control-select" value={config.sector} onChange={e => setConfig({ ...config, sector: e.target.value })}>
            {highRiskSectors.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="input-group">
          <label>Carbon Price ($/tonne)</label>
          <input
            type="number"
            className="control-select"
            value={carbonPrice}
            onChange={(e) => setCarbonPrice(parseFloat(e.target.value) || 0)}
            min="0" max="500" step="10"
          />
        </div>

        <hr className="divider" style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />

        <div className="control-section-title">Policy Parameters</div>

        <div className="slider-container">
          <div className="slider-header">
            <span>Accountability Dist.</span>
            <span className="slider-value">{(accountabilityWeight * 100).toFixed(0)}% Cons.</span>
          </div>
          <input
            type="range"
            className="chunky-slider"
            min="0" max="100" step="10"
            value={accountabilityWeight * 100}
            onChange={(e) => setAccountabilityWeight(parseFloat(e.target.value) / 100)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>
            <span>Producer</span>
            <span>Shared</span>
            <span>Consumer</span>
          </div>
        </div>
        <small className="hint-text" style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.4' }}>
          Adjusts from Territorial Production (Smokestack) to Consumption Footprint. Re-exports included.
        </small>

        <div className="slider-container">
          <div className="slider-header">
            <span>CBAM Tariff Rate</span>
            <span className="slider-value">{currentTariff}%</span>
          </div>
          <input
            type="range"
            className="chunky-slider"
            min="0" max="50" step="1"
            value={currentTariff}
            onChange={(e) => setTariff(parseFloat(e.target.value))}
          />
        </div>

      </div>
    </aside>
  );
};

// --- MAIN CONTAINER ---
const DiplomaticSandbox = () => {
  const [config, setConfig] = useState({ player: 'USA', rival: 'CHN', sector: 'Steel' });
  const [carbonPrice, setCarbonPrice] = useState(85);
  const [tariff, setTariff] = useState(15);
  const [accountabilityWeight, setAccountabilityWeight] = useState(0.0);
  const [matchup, setMatchup] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const res = await axios.get(`http://localhost:8000/api/diplomacy/matchup?player=${config.player}&rival=${config.rival}&carbon_price=${carbonPrice}&accountability_weight=${accountabilityWeight}`);
        setMatchup(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAnalysis();
  }, [config.player, config.rival, carbonPrice, accountabilityWeight]);

  // Stat Card Component
  const Stat = ({ label, value, sub, color = "#0f172a" }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>{sub}</div>}
    </div>
  );

  return (
    <div className="policy-lab-container">
      <CBAMControls
        config={config}
        setConfig={setConfig}
        carbonPrice={carbonPrice}
        setCarbonPrice={setCarbonPrice}
        currentTariff={tariff}
        setTariff={setTariff}
        accountabilityWeight={accountabilityWeight}
        setAccountabilityWeight={setAccountabilityWeight}
      />

      <main className="policy-workspace">
        <div className="workspace-header">
          <div className="header-title">
            {config.player} vs {config.rival}: {config.sector} Sector
          </div>
          <div className="view-controls">
            <div className="view-chip active">
              Accountability: {(accountabilityWeight * 100).toFixed(0)}% Consumer
            </div>
          </div>
        </div>

        <div className="diplomatic-content" style={{ overflowY: 'auto', flex: 1, padding: '40px' }}>
          <div style={{ maxWidth: '850px', margin: '0 auto' }}>

            {/* 1. FAIRNESS GAUGE */}
            {matchup && (
              <FairnessGauge
                key={matchup.analysis.fair_tariff_rate + config.rival}
                currentTariff={tariff}
                fairTariff={matchup.analysis.fair_tariff_rate}
                carbonGap={matchup.analysis.carbon_gap}
                leakageRisk={matchup.analysis.leakage_risk}
              />
            )}

            {/* 2. SCIENTIFIC ANALYSIS PANEL */}
            {matchup && (
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', background: '#F8FAFC' }}>
                  <h4 style={{ margin: 0, textTransform: 'uppercase', color: '#64748b', fontSize: '0.8rem', letterSpacing: '0.05em', fontWeight: 700 }}>
                    CATE Scientific Analysis
                  </h4>
                </div>

                <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', alignItems: 'center' }}>
                  <Stat
                    label="Carbon Price"
                    value={`$${carbonPrice}`}
                    sub="Per Tonne"
                  />
                  <Stat
                    label="Scientific Target"
                    value={`${Math.max(0.5, matchup.analysis.fair_tariff_rate).toFixed(1)}%`}
                    color="#3E6985"
                    sub="Justified CATE Tariff"
                  />
                  <Stat
                    label="Intensity Gap"
                    value={Math.max(2.0, matchup.analysis.carbon_gap).toFixed(1)}
                    sub="Units Different"
                  />
                </div>

                <div style={{ padding: '24px 32px', background: '#F8FAFC', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>

                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                        Scenario Context
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
                        {matchup.analysis.scenario_context}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <strong style={{ color: '#64748b' }}>Methodology:</strong> Re-exports and transit trade are factored into the Consumer Footprint score.
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

export default DiplomaticSandbox;
