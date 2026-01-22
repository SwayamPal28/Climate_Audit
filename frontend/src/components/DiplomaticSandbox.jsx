import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './DiplomaticSandbox.css';
import GraphVisualization from './GraphVisualization';

// --- VISUALIZATION: FAIRNESS GAUGE ---
const FairnessGauge = ({ currentTariff, fairTariff, carbonGap, leakageRisk }) => {
  // 1. Calculate Scale
  // We want Fair Tariff to be exactly in the middle of the Green Zone (50%).
  // Currently Green is 33% to 66%. Center is 50%.
  // So scale maxRange such that (fairTariff / maxRange) = 0.5
  // => maxRange = fairTariff * 2.0

  // However, we want some buffer. Let's stick to the visual thirds.
  // Zone 1 (Subsidy): 0 - 33%
  // Zone 2 (Fair): 33% - 66%
  // Zone 3 (Prot): 66% - 100%

  // To place Fair Tariff (Ideal) at 50% (Center):
  let maxRange = fairTariff * 2.0;

  // Safety checks
  if (fairTariff <= 0) maxRange = 50;
  if (maxRange < 20) maxRange = 20;

  // 2. Calculate Needle Position
  let needlePct = (currentTariff / maxRange) * 100;
  needlePct = Math.min(Math.max(needlePct, 0), 100);

  // 3. Determine Status based on VISUAL POSITION (No Contradictions)
  let status = "ANALYZING";
  let statusColor = "text-gray";

  if (carbonGap <= 0) {
    // Negative Gap Logic
    if (currentTariff > 5) {
      status = "EXCESSIVE PROTECTIONISM";
      statusColor = "text-red";
    } else {
      status = "FREE TRADE (CLEANER PARTNER)";
      statusColor = "text-green";
    }
  } else {
    // Positive Gap Logic - Strictly based on visual zones
    if (needlePct < 33) {
      status = "SUBSIDY RISK (LEAKAGE)";
      statusColor = "text-yellow";
    } else if (needlePct > 66) {
      status = "EXCESSIVE (PROTECTIONISM)";
      statusColor = "text-red";
    } else {
      status = "FAIR CARBON PRICE";
      statusColor = "text-green";
    }
  }

  return (
    <div className="fairness-gauge-container">
      <div className="gauge-title">CBAM Fairness Gauge</div>

      <div className="gauge-track">
        <div className="gauge-zone zone-yellow" style={{ flex: 1 }} title="Tariff too low (Leakage Risk)">SUBSIDY</div>
        <div className="gauge-zone zone-green" style={{ flex: 1 }} title="Scientific Fair Price">FAIR</div>
        <div className="gauge-zone zone-red" style={{ flex: 1 }} title="Tariff too high (Trade War)">PROTECT</div>

        <div className="gauge-needle-container">
          <div className="gauge-needle" style={{ left: `${needlePct}%` }}>
            <div className="needle-label">{currentTariff}%</div>
          </div>
        </div>
      </div>

      <div className={`gauge-status-text ${statusColor}`}>
        {status}
      </div>
      <div className="status-desc">
        Scientific Target: {fairTariff.toFixed(1)}% (Based on Gap: {carbonGap.toFixed(0)} units)
      </div>

      {/* Leakage Warning logic matches 'Subsidy' status */}
      {status === "SUBSIDY RISK (LEAKAGE)" && (
        <div className="leakage-warning">
          <strong>LEAKAGE ALERT:</strong> Low tariff encourages industry to flee to {carbonGap > 0 ? "the dirtier rival" : "abroad"}.
        </div>
      )}
    </div>
  );
};

// --- CONTROL: SIDEBAR ---
const CBAMControls = ({ config, setConfig, carbonPrice, setCarbonPrice, currentTariff, setTariff, accountabilityWeight, setAccountabilityWeight, presets, selectedPreset, onPresetChange }) => {

  // High Risk Sectors Only
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
    <aside className="diplomatic-sidebar">
      <div className="sidebar-header">
        <div className="lab-title">CBAM POLICY LAB</div>
      </div>

      <div className="sidebar-controls">

        {/* 1. SCENARIO / PRESET */}
        <div className="cbam-input-group">
          <label className="cbam-label">Scenario Preset</label>
          <select
            className="control-select"
            value={selectedPreset}
            onChange={(e) => onPresetChange(e.target.value)}
          >
            {presets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
          </select>
        </div>

        {/* 2. SHARED ACCOUNTABILITY SLIDER */}
        <div className="control-group" style={{ marginBottom: '20px' }}>
          <label className="cbam-label">Accountability Distribution</label>
          <div className="slider-container">
            <input
              type="range"
              className="chunky-slider"
              min="0" max="100" step="10"
              value={accountabilityWeight * 100}
              onChange={(e) => setAccountabilityWeight(parseFloat(e.target.value) / 100)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
              <span>Producer (0%)</span>
              <span>Shared (50%)</span>
              <span>Consumer (100%)</span>
            </div>
          </div>
          <small className="hint-text" style={{ marginTop: '8px', display: 'block', lineHeight: '1.3' }}>
            <strong>Note:</strong> Adjusts from Territorial Production (Smokestack) to Consumption Footprint (Shopping). Middlemen re-exports are factored into the Consumer score.
          </small>
        </div>

        <hr className="divider" />

        {/* 3. SCIENTIFIC INPUTS */}
        <div className="cbam-input-group">
          <label className="cbam-label">Target Sector</label>
          <select className="control-select" value={config.sector} onChange={e => setConfig({ ...config, sector: e.target.value })}>
            {highRiskSectors.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="cbam-input-group">
          <label className="cbam-label">Carbon Price ($/tonne)</label>
          <input
            type="number"
            className="cbam-number-input"
            value={carbonPrice}
            onChange={(e) => setCarbonPrice(parseFloat(e.target.value) || 0)}
            min="0" max="500" step="10"
          />
        </div>

        {/* 4. TARIFF SLIDER */}
        <div className="slider-container" style={{ marginTop: '20px' }}>
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

        <div className="control-group">
          <label className="cbam-label">Importer (You)</label>
          <select className="control-select" value={config.player} onChange={e => setConfig({ ...config, player: e.target.value })}>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>

        <div className="control-group">
          <label className="cbam-label">Exporter (Rival)</label>
          <select className="control-select" value={config.rival} onChange={e => setConfig({ ...config, rival: e.target.value })}>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>

      </div>
    </aside>
  );
};

// --- MAIN CONTAINER ---
const DiplomaticSandbox = () => {
  const navigate = useNavigate();

  // State
  const [config, setConfig] = useState({ player: 'USA', rival: 'CHN', sector: 'Steel' });
  const [carbonPrice, setCarbonPrice] = useState(85); // EU ETS Default
  const [tariff, setTariff] = useState(15);
  const [accountabilityWeight, setAccountabilityWeight] = useState(0.0); // 0.0 = Production, 1.0 = Consumption
  const [loading, setLoading] = useState(false);
  const [matchup, setMatchup] = useState(null);
  const [scenarioPreset, setScenarioPreset] = useState("Custom");

  // Presets
  const presets = [
    { label: "Custom", p: "USA", r: "CHN" },
    { label: "The Industrial Giant (USA vs CHN)", p: "USA", r: "CHN" },
    { label: "The Green Pioneer (DEU vs USA)", p: "DEU", r: "USA" },
    { label: "Emerging Economy (DEU vs IND)", p: "DEU", r: "IND" },
    { label: "Reverse Leakage (USA vs CAN)", p: "USA", r: "CAN" },
  ];

  const handlePresetChange = (label) => {
    setScenarioPreset(label);
    const pre = presets.find(p => p.label === label);
    if (pre) {
      setConfig(prev => ({ ...prev, player: pre.p, rival: pre.r }));
    }
  };

  // Fetch Matchup Analysis
  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        // Using new 'accountability_weight' param
        const res = await axios.get(`http://localhost:8000/api/diplomacy/matchup?player=${config.player}&rival=${config.rival}&carbon_price=${carbonPrice}&accountability_weight=${accountabilityWeight}`);
        setMatchup(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAnalysis();
  }, [config.player, config.rival, carbonPrice, accountabilityWeight]);

  return (
    <div className="diplomatic-container">
      {/* Sidebar */}
      <CBAMControls
        config={config}
        setConfig={setConfig}
        carbonPrice={carbonPrice}
        setCarbonPrice={setCarbonPrice}
        currentTariff={tariff}
        setTariff={setTariff}
        accountabilityWeight={accountabilityWeight}
        setAccountabilityWeight={setAccountabilityWeight}
        presets={presets}
        selectedPreset={scenarioPreset}
        onPresetChange={handlePresetChange}
      />

      {/* Main Workspace */}
      <div className="diplomatic-workspace" style={{ padding: '40px' }}>
        <div className="workspace-header">
          <div className="header-title">
            {config.player} vs {config.rival}: {config.sector} Sector
          </div>
          {/* Badge for Sensitivity Mode */}
          <div className="research-grade-badge">
            Accountability: {(accountabilityWeight * 100).toFixed(0)}% Consumer
          </div>
        </div>

        <div className="diplomatic-content">
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

          {/* 2. EXPLANATION / IMPACT */}
          {matchup && (
            <div className="logic-explainer-card" key={matchup.analysis.carbon_gap + config.rival}>
              <div className="explainer-content" style={{ display: 'block' }}>
                <h4 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px', textTransform: 'uppercase', fontSize: '0.75rem', color: '#64748b' }}>
                  CATE Scientific Analysis
                </h4>
                <p>
                  Carbon Price defined at <strong>${carbonPrice}/tonne</strong>.
                  Intensity Gap is <strong>{matchup.analysis.carbon_gap.toFixed(1)}</strong> units.
                </p>
                <p style={{ marginBottom: '16px' }}>
                  A scientifically justified CATE tariff would be <strong>{matchup.analysis.fair_tariff_rate.toFixed(1)}%</strong>.
                  {matchup.analysis.fair_tariff_rate === 50 ? " (Capped at Max)" : ""}
                </p>

                <div className="context-box" style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', fontSize: '0.9rem', color: '#334155', borderLeft: '4px solid #94a3b8' }}>
                  <strong>Scenario Context:</strong> {matchup.analysis.scenario_context}
                </div>

                <p className="status-desc" style={{ marginTop: '16px', fontSize: '0.85rem', padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontStyle: 'normal', color: '#64748b' }}>
                  <strong>Middleman Logic:</strong> Re-exports and transit trade are factored into the Consumer Footprint score.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default DiplomaticSandbox;
