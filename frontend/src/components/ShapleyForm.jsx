// frontend/src/components/ShapleyForm.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  CartesianGrid, ResponsiveContainer, Cell, LabelList
} from 'recharts';

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
      }).sort((a,b)=>b.pct-a.pct);

      setMeta(resp.data.meta || null);
      setResult(formattedData);

      // Try to obtain anomaly score from backend top lists (if present)
      (async () => {
        try {
          setAnomalyLoading(true);
          const resp = await axios.get('/api/audit/anomalies');
          const lists = [ ...(resp.data.top_positive || []), ...(resp.data.top_negative || []) ];
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
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Fair-Share Carbon Attribution (Shapley)</h2>
      
      <form onSubmit={submit} style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input 
          value={target} 
          onChange={e => setTarget(e.target.value)} 
          placeholder="Enter Country ISO3 (e.g. USA)" 
          style={{ padding: '10px', flex: 1, borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button 
          type="submit" 
          disabled={loading}
          onClick={submit}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#4CAF50', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Processing...' : 'Compute Attribution'}
        </button>
      </form>

      {/* Fairness Policy Slider */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{ fontSize: 13, color: '#374151' }}><strong>Fairness Policy:</strong> Producer retains <strong>{Math.round(ratio * 100)}%</strong> of production emissions</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={ratio}
          onChange={(e) => setRatio(parseFloat(e.target.value))}
          style={{ width: '100%', marginTop: 8, cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280' }}>
          <span>0% (Consumers bear all)</span>
          <span>100% (Producers bear all)</span>
        </div>
      </div>

      {/* Trigger fetch when ratio changes (if a country is present) */}
      React.useEffect(() => {
        if (target) submit();
      }, [ratio]);

      {/* CHART AREA */}
      <div style={{ width: '100%', height: '400px', background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        {/* Layer guidance: GNN (prediction) vs Shapley (attribution) */}
        <div style={{ marginBottom: 8, color: '#4b5563', fontSize: 13 }}>
          <strong>Layer 1</strong>: GNN predicts expected emissions (anomaly score may indicate under-reporting). &nbsp; 
          <strong>Layer 2</strong>: Shapley attributes total emissions across partners (displayed below).
        </div>

        {result.length > 0 ? (
          <div>
            {/* View controls */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#374151' }}>View:</div>
              <label style={{ cursor: 'pointer' }}>
                <input type="radio" name="view" value="percent" checked={viewMode==='percent'} onChange={() => setViewMode('percent')} /> Percent
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input type="radio" name="view" value="absolute" checked={viewMode==='absolute'} onChange={() => setViewMode('absolute')} /> Absolute
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input type="radio" name="view" value="log" checked={viewMode==='log'} onChange={() => setViewMode('log')} /> Log
              </label>

              <span title="Units: Nodes store CO2 in kilotonnes (kt); we convert SELF to tonnes (tCO2) for attribution. Small partner bars may be invisible in linear scale. Click 'Log' to see small partners.
" style={{ marginLeft: 12, fontSize: 12, color: '#6b7280', cursor: 'help' }}>ℹ️</span>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={result} margin={{ top: 20, right: 30, left: 40, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  interval={0} 
                  height={70}
                  label={{ value: 'Trade Partners', position: 'bottom', offset: 40 }}
                />
                <YAxis 
                  label={{ value: viewMode === 'percent' ? 'Responsibility (%)' : (viewMode==='absolute' ? 'Tonnes (tCO2)' : 'log10(tCO2+1)'), angle: -90, position: 'insideLeft', offset: -30 }} 
                  domain={viewMode === 'percent' ? [0, 100] : ['auto', 'auto']}
                />
                <Tooltip 
                  formatter={(value, name, props) => {
                    const entry = props.payload;
                    if (viewMode === 'percent') return [`${Number(entry.pct).toFixed(2)}%`, 'Carbon Responsibility'];
                    if (viewMode === 'absolute') return [ `${Number(entry.abs).toLocaleString(undefined, {maximumFractionDigits:2})} tCO2`, 'Absolute tCO2' ];
                    return [ `${(entry.abs!=null? Math.pow(10, entry.value)-1 : 'N/A')} tCO2`, 'Log scale' ];
                  }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
                />
                <Bar isAnimationActive={false} dataKey={viewMode === 'percent' ? 'pct' : (viewMode === 'absolute' ? 'abs' : 'log')} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey={viewMode === 'percent' ? 'pct' : (viewMode === 'absolute' ? 'abs' : 'log')} formatter={(val, idx) => {
                    const e = result[idx];
                    const pct = e.pct;
                    const abs = e.abs;
                    if (viewMode === 'percent') return `${formatPct(pct)} — ${formatAbs(abs)}`;
                    if (viewMode === 'absolute') return `${formatAbs(abs)} — ${formatPct(pct)}`;
                    return `${e.log != null ? e.log.toFixed(4) : 'N/A'} (log)`;
                  }} position="top" />
                  {result.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Totals & Warnings */}
            {meta && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
                <div><strong>Totals</strong>: SELF = {Number(meta.self_emission_tCO2).toLocaleString()} tCO2, Partners = {Number(meta.partners_total_tCO2).toLocaleString()} tCO2, Grand total = {Number(meta.total_emissions_tCO2).toLocaleString()} tCO2</div>
                {result[0] && result[0].pct > 90 && (
                  <div>
                    <div style={{ marginTop: 6, color: '#b91c1c' }}><strong>High SELF share</strong> — country-reported emissions dwarf transport emissions.</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>Values are shown with adaptive precision; small partners display more decimals for clarity.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
            {loading ? 'Generating network-aware attribution...' : 'Enter a country code to see the carbon burden split.'}
          </div>
        )}

        {/* Anomaly display (if available in top lists) */}
        <div style={{ marginTop: 12, color: anomalyScore && anomalyScore > 0.1 ? '#b91c1c' : '#374151', fontSize: 13 }}>
          {anomalyLoading ? 'Checking GNN anomaly...' : (
            anomalyScore != null ? (
              <span>GNN Anomaly Score: <strong>{Number(anomalyScore).toFixed(4)}</strong> {anomalyScore > 0.1 ? '— High (possible under-reporting)' : ''}</span>
            ) : (
              <span>GNN Anomaly Score: <em>Not in top lists</em></span>
            )
          )}
        </div>
      </div>
    </div>
  );
}