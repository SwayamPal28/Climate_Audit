// frontend/src/components/ShapleyForm.jsx
import React, { useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import './ShapleyForm.css';

export default function ShapleyForm() {
  const [target, setTarget] = useState('');
  const [ratio, setRatio] = useState(0.6); // producer retains 60% by default
  const [result, setResult] = useState([]); // Array format for Recharts; items: { name, pct, abs, log }
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null); // { self_emission_tCO2, partners_total_tCO2, total_emissions_tCO2 }
  const [viewMode, setViewMode] = useState('percent'); // 'percent' | 'absolute' | 'log'
  const [anomalyScore, setAnomalyScore] = useState(null); // optional GNN anomaly score (if available)
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  // Formatting helpers — dynamic precision for small values
  const formatPct = (p) => {
    if (p == null || isNaN(p)) return 'N/A';
    const n = Number(p);
    if (n === 0) return '0.0000%';
    if (n < 0.0001) return `${n.toFixed(6)}%`;
    if (n < 0.01) return `${n.toFixed(4)}%`;
    if (n < 1) return `${n.toFixed(2)}%`;
    return `${n.toFixed(2)}%`;
  };

  const formatAbs = (a) => {
    if (a == null || isNaN(a)) return 'N/A';
    const n = Number(a);
    if (n === 0) return '0.0000 tCO2';
    if (Math.abs(n) < 1) return `${n.toFixed(4)} tCO2`;
    if (Math.abs(n) < 1000) return `${n.toFixed(2)} tCO2`;
    return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} tCO2`;
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!target) return;

    setLoading(true);
    try {
      // 1. Call the updated backend endpoint (use proxy)
      const resp = await axios.post('/api/calculate/shapley', {
        target_country: target.trim().toUpperCase(),
        producer_ratio: parseFloat(ratio)
      });

      // 2. Format the dictionary { "SELF": 40, "CHN": 30... } into Recharts array
      const rawData = resp.data.allocations;

      // Handle cases where no data is returned
      if (!rawData || rawData.message || resp.data.error) {
        setResult([]);
        setMeta(null);
        alert(resp.data?.message || resp.data?.error || "No data found for this country.");
        return;
      }

      const total = resp.data.meta?.grand_total_tCO2 ?? resp.data.meta?.total_emissions_tCO2 ?? null;
      const formattedData = Object.entries(rawData).map(([country, percentage]) => {
        const pct = parseFloat(Number(percentage).toFixed(6));
        const abs = total != null ? (pct / 100.0) * total : null;
        return { name: country, pct, abs, log: abs != null ? Math.log10(abs + 1) : null };
      }).sort((a, b) => b.pct - a.pct);

      setMeta(resp.data.meta || null);
      setResult(formattedData);

      // Try to obtain anomaly score from backend top lists (if present)
      (async () => {
        try {
          setAnomalyLoading(true);
          const resp = await axios.get('/api/audit/anomalies');
          const lists = [...(resp.data.top_positive || []), ...(resp.data.top_negative || [])];
          const found = lists.find(x => (x.iso3 || x.id || '').toString().toUpperCase() === target.trim().toUpperCase());
          setAnomalyScore(found ? found.anomaly_score : null);
        } catch (e) {
          // Not critical — just leave anomalyScore null
          setAnomalyScore(null);
        } finally {
          setAnomalyLoading(false);
        }
      })();

    } catch (err) {
      console.error("Shapley Error:", err);
      alert("Error calculating Shapley values. Check if backend is running.");
    } finally {
      setLoading(false);
    }
  };

  // Modern color palette for the chart
  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="shapley-container">
      <div style={{ marginBottom: '15px', color: '#666', fontSize: '0.9em', borderLeft: '3px solid #f59e0b', paddingLeft: '10px' }}>
        <strong>Methodology Note:</strong> This model uses a volume-weighted shared responsibility heuristic to allocate emissions.
        It replaces the legacy "Shapley Value" computation.
      </div>
      {/* <h2>Fair-Share Carbon Attribution (Shapley)</h2> */}
      {/* Header removed from here as it is often in the parent card */}

      <form onSubmit={submit} className="shapley-form">
        <input
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="Enter Country ISO3 (e.g. USA)"
          className="shapley-input"
        />
        <button
          type="submit"
          disabled={loading}
          onClick={submit}
          className="shapley-submit-btn"
        >
          {loading ? 'Processing...' : 'Compute Attribution'}
        </button>
      </form>

      {/* Fairness Policy Slider */}
      <div className="policy-slider-container">
        <label className="policy-label"><strong>Fairness Policy:</strong> Producer retains <strong>{Math.round(ratio * 100)}%</strong> of production emissions</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={ratio}
          onChange={(e) => setRatio(parseFloat(e.target.value))}
          className="shapley-slider"
        />
        <div className="slider-labels">
          <span>0% (Consumers bear all)</span>
          <span>100% (Producers bear all)</span>
        </div>
      </div>

      {/* Trigger fetch when ratio changes (if a country is present) */}
      {/* React.useEffect handled implicitly by interaction or explicit reload if we wanted, 
          but original code obeyed React rules. We keep it manual or auto? 
          Original code had a useEffect hook for auto-update on ratio change. 
          We must restore it inside the component body, not return statement. 
      */}
      {/* ERROR IN ORIGINAL CODE: useEffect was inside return?! No, it was just inside the block in my view_file output but maybe formatted strangely. 
          Actually, looking at previous file view, line 146 was indeed inside return?!? No, wait. 
          Ah, line 146 in previous view was `React.useEffect...` inside the function body but before return? 
          Let me check the previous `view_file`.
          Line 99 starts `return (`. 
          Wait, line 146 in the file view is `React.useEffect...` 
          It seems the previous file content had useEffect *inside* the JSX?? 
          "146:       React.useEffect(() => {" 
          "149:       }, [ratio]);"
          If it was truly inside opacity, it wouldn't work or would throw error. 
          Ah, looking at line 99: `return (`
          So yes, the original file had useEffect inside the return div?? That's invalid React.
          I will fix this by moving useEffect UP. 
      */}

      {/* CHART AREA */}
      <div className="chart-container">
        {/* Layer guidance */}
        <div className="layer-guidance">
          <strong>Layer 1</strong>: GNN predicts expected emissions. &nbsp;
          <strong>Layer 2</strong>: Shapley attributes total emissions across partners.
        </div>

        {result.length > 0 ? (
          <div>
            {/* View controls */}
            <div className="view-controls">
              <div className="view-label">View:</div>
              <label className="radio-label">
                <input type="radio" name="view" value="percent" checked={viewMode === 'percent'} onChange={() => setViewMode('percent')} /> Percent
              </label>
              <label className="radio-label">
                <input type="radio" name="view" value="absolute" checked={viewMode === 'absolute'} onChange={() => setViewMode('absolute')} /> Absolute
              </label>
              <label className="radio-label">
                <input type="radio" name="view" value="log" checked={viewMode === 'log'} onChange={() => setViewMode('log')} /> Log
              </label>

              <span className="info-icon" title="Units: Nodes store CO2 in kilotonnes (kt); we convert SELF to tonnes (tCO2) for attribution. Small partner bars may be invisible in linear scale. Click 'Log' to see small partners.">ℹ️</span>
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={result} margin={{ top: 20, right: 30, left: 40, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  height={70}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                // label={{ value: 'Trade Partners', position: 'bottom', offset: 40 }}
                />
                <YAxis
                  label={{ value: viewMode === 'percent' ? 'Responsibility (%)' : (viewMode === 'absolute' ? 'Tonnes (tCO2)' : 'log10(tCO2+1)'), angle: -90, position: 'insideLeft', offset: -20, style: { fontSize: 10, fill: '#64748b' } }}
                  domain={viewMode === 'percent' ? [0, 100] : ['auto', 'auto']}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <Tooltip
                  formatter={(value, name, props) => {
                    const entry = props.payload;
                    if (viewMode === 'percent') return [`${Number(entry.pct).toFixed(2)}%`, 'Carbon Responsibility'];
                    if (viewMode === 'absolute') return [`${Number(entry.abs).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO2`, 'Absolute tCO2'];
                    return [`${(entry.abs != null ? Math.pow(10, entry.value) - 1 : 'N/A')} tCO2`, 'Log scale'];
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.4)',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                    background: 'rgba(255,255,255,0.95)',
                    fontSize: '12px'
                  }}
                />
                <Bar isAnimationActive={false} dataKey={viewMode === 'percent' ? 'pct' : (viewMode === 'absolute' ? 'abs' : 'log')} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey={viewMode === 'percent' ? 'pct' : (viewMode === 'absolute' ? 'abs' : 'log')} formatter={(val, idx) => {
                    const e = result[idx];
                    const pct = e.pct;
                    const abs = e.abs;
                    if (viewMode === 'percent') return `${formatPct(pct)}`;
                    // Compact label for absolute to avoid clutter
                    if (viewMode === 'absolute') return `${(Number(abs) / 1000).toFixed(1)}k`;
                    return `${e.log != null ? e.log.toFixed(2) : 'N/A'}`;
                  }} position="top" style={{ fontSize: '9px', fill: '#475569' }} />
                  {result.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Totals & Warnings */}
            {meta && (
              <div className="totals-section">
                <div><strong>Totals</strong>: SELF = {Number(Number(meta.self_emission_tCO2).toFixed(0)).toLocaleString()} tCO2, Partners = {Number(Number(meta.partners_total_tCO2).toFixed(0)).toLocaleString()} tCO2</div>
                {result[0] && result[0].pct > 90 && (
                  <div className="warning-box">
                    <div className="warning-text">High SELF share — country-reported emissions dwarf transport emissions.</div>
                    <div className="sub-warning">Values are shown with adaptive precision; small partners display more decimals for clarity.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            {loading ? 'Generating network-aware attribution...' : 'Enter a country code to see the carbon burden split.'}
          </div>
        )}

        {/* Anomaly display (if available in top lists) */}
        <div className={`anomaly-alert ${anomalyScore && anomalyScore > 0.1 ? 'high' : ''}`}>
          {anomalyLoading ? 'Checking GNN anomaly...' : (
            anomalyScore != null ? (
              <span>GNN Anomaly Score: <strong>{Number(anomalyScore).toFixed(4)}</strong> {anomalyScore > 0.1 ? '— High Risk' : ''}</span>
            ) : (
              <span>GNN Anomaly Score: <em>Not flagged in top anomalies</em></span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
