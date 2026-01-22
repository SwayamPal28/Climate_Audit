import React, { useState, useEffect, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PolicyLab.css';
import BilateralPolicySelector from './BilateralPolicySelector';
import DeltaComparisonCard from './DeltaComparisonCard';
import UpstreamImpactTable from './UpstreamImpactTable';
import LLMAnalystPanel from './LLMAnalystPanel';

const POLICY_SCENARIOS = [
  { value: 'CBAM', label: 'EU CBAM (Carbon Border Tax)' },
  { value: 'TECH_TRANSFER', label: 'Technology Transfer (Green Grid)' },
  { value: 'FAIRNESS_DIAL', label: 'Fairness Dial (Attribution)' }
];

const PolicyLab = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('global');
  const [scenario, setScenario] = useState('CBAM');
  const [severity, setSeverity] = useState(0.2);
  const [isRunning, setIsRunning] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Graph states
  const [originalGraph, setOriginalGraph] = useState({ nodes: [], links: [] });
  const [simulatedGraph, setSimulatedGraph] = useState({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const originalGraphRef = React.useRef();
  const simulatedGraphRef = React.useRef();

  // Fairness Dial State
  const [fairnessRatio, setFairnessRatio] = useState(0.5);
  const [isLoading, setIsLoading] = useState(true);
  const [bilateralResults, setBilateralResults] = useState(null);
  const [isBilateralLoading, setIsBilateralLoading] = useState(false);
  const [latestSimulation, setLatestSimulation] = useState(null);
  const [bilateralResultForAnalysis, setBilateralResultForAnalysis] = useState(null);

  // --- PHYSICS ENGINE TEXTURE ---
  useEffect(() => {
    const applyPhysics = (graphRef) => {
      if (!graphRef.current) return;
      const fg = graphRef.current;
      const d3Force = fg.d3Force;
      if (d3Force) {
        // Spacious tuning from GraphVisualization
        d3Force('charge').strength(-2000);
        d3Force('link').distance(200);
        fg.d3ReheatSimulation();
      }

      const controls = fg.controls();
      if (controls) {
        controls.minDistance = 0;
        controls.maxDistance = 10000;
        controls.zoomSpeed = 2.5;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
      }
    };
    setTimeout(() => {
      applyPhysics(originalGraphRef);
      applyPhysics(simulatedGraphRef);
    }, 500);
  }, [originalGraph, simulatedGraph]);

  // Load Initial Graph
  useEffect(() => {
    axios.get('/api/graph').then(res => {
      setOriginalGraph(res.data);
      setIsLoading(false);
    }).catch(err => {
      console.error(err);
      setIsLoading(false);
    });
  }, []);

  // Sync Cameras
  const syncCameras = () => {
    if (originalGraphRef.current && simulatedGraphRef.current) {
      const pos = originalGraphRef.current.cameraPosition();
      simulatedGraphRef.current.cameraPosition(pos, null, 0);
    }
  };

  const runSimulation = useCallback(async () => {
    setIsRunning(true);
    try {
      const payload = { policy_type: scenario, severity: severity };
      if (scenario === 'FAIRNESS_DIAL') {
        payload.producer_ratio = fairnessRatio;
      }

      const response = await axios.post('/api/simulate/policy', payload);

      if (response.data && response.data.simulated) {
        setSimulatedGraph(response.data.simulated);
        setMetrics(response.data.metrics || null);
        setLatestSimulation({
          policy_type: scenario, severity, metrics: response.data.metrics || {}, context: { producer_ratio: fairnessRatio }
        });
        setIsDrawerOpen(true); // Auto-open drawer for results
      }
    } catch (error) {
      alert('Simulation failed. check console.');
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  }, [scenario, severity, fairnessRatio]);

  /* ... Bilateral Logic Copied from original ... */
  /* ... Bilateral Logic Copied from original ... */
  const handleBilateralOptimize = async (params) => {
    setIsBilateralLoading(true);
    try {
      const response = await axios.post('/api/optimize/bilateral', params);

      // Safety Check: Backend might return validation error as normal JSON if not using strict status codes
      if (response.data.detail || Array.isArray(response.data.detail)) {
        console.error("Validation Error:", response.data);
        alert(`Simulation Error: ${JSON.stringify(response.data.detail)}`);
        return;
      }

      setBilateralResults(response.data);

      // Prepare data for LLM Analyst (fix payload structure)
      const analysisPayload = {
        ...response.data,
        ...params,
        source: params.src_iso, // Map specific fields for backend validation
        target: params.tgt_iso,
        sector: params.sector || "All"
      };

      // Optimization: The backend returns 'route_info' and 'upstream_impact'.
      // We can construct a focused subgraph here.
      const routeInfo = response.data.route_info;
      if (routeInfo) {
        const impactedIsoCodes = new Set([
          routeInfo.source,
          routeInfo.target,
          ...(response.data.upstream_impact?.map(u => u.supplier_country) || [])
        ]);

        // Filter Original & Simulated to strictly this subgraph
        const filterGraph = (g) => {
          const nodes = g.nodes.filter(n => impactedIsoCodes.has(n.iso3 || n.id));
          const links = g.links.filter(l => {
            const s = l.source.iso3 || l.source.id || l.source;
            const t = l.target.iso3 || l.target.id || l.target;
            return impactedIsoCodes.has(s) && impactedIsoCodes.has(t);
          });
          return { nodes, links };
        };

        // Override global graphs with focused views for this interaction
        setSimulatedGraph(filterGraph(originalGraph));
      }

      setBilateralResultForAnalysis(analysisPayload);
      setIsDrawerOpen(true);
    } catch (e) {
      console.error("Bilateral Optimization Failed:", e);
      if (e.response && e.response.data) {
        alert(`Error: ${JSON.stringify(e.response.data)}`);
      }
    }
    finally { setIsBilateralLoading(false); }
  };

  const getSectorColor = (sector) => {
    const s = String(sector || '').toLowerCase();
    if (s.includes('steel')) return '#7f8c8d'; // Grey
    if (s.includes('energy')) return '#f1c40f'; // Yellow
    if (s.includes('textile')) return '#ef4444'; // Red
    return '#b2bec3'; // Pewter Grey
  };

  // --- COLORING LOGIC ---

  // 1. ORIGINAL REALITY COLORS
  const getOriginalNodeColor = (node) => {
    return node.co2 > 80 ? '#ef4444' : '#3E6985'; // Red (Risk) vs Teal (Safe)
  };

  const getOriginalLinkColor = (link) => {
    if (selectedNode) {
      const isConnected = link.source.id === selectedNode.id || link.target.id === selectedNode.id;
      if (isConnected) return '#ef4444';
    }

    // SIMPLIFIED COLOR LOGIC (Red = Dirty, Blue-Grey = Clean)
    const s = String(link.sector || '').toLowerCase();
    if (s.includes('energy') || s.includes('steel') || s.includes('textile')) {
      return '#ef4444'; // Red (High Carbon Trade)
    }
    return '#94a3b8'; // Blue-Grey (Low Carbon/Service Trade)
  };

  // 2. SIMULATED FUTURE COLORS (The "Storytelling" Layer)
  const getFutureNodeColor = (node) => {
    if (scenario === 'FAIRNESS_DIAL') return getOriginalNodeColor(node); // Fairness handled by edges

    // CBAM: Highlight those who failed to adapt vs those who did
    if (scenario === 'CBAM') {
      // Hypoth: If CO2 still high > 80, they appear Dark Red (Stubborn). If they lowered, Teal.
      return node.co2 > 80 ? '#991b1b' : '#3E6985';
    }

    // TECH TRANSFER: Highlight Adopters
    if (scenario === 'TECH_TRANSFER') {
      // Hypoth: If they received tech, they turn Green.
      // For visual demo, we make low-risk nodes vibrant green
      return node.co2 < 40 ? '#10b981' : '#94a3b8'; // Green vs Grey
    }

    return getOriginalNodeColor(node);
  };

  const getFutureLinkColor = (link) => {
    // FAIRNESS: The Gradient
    if (scenario === 'FAIRNESS_DIAL') {
      const tension = Math.abs(fairnessRatio - 0.5) * 2;
      const r = Math.round(62 + (239 - 62) * tension);
      const g = Math.round(105 + (68 - 105) * tension);
      const b = Math.round(133 + (68 - 133) * tension);
      return `rgb(${r}, ${g}, ${b})`;
    }

    const src = link.source;
    const tgt = link.target;
    // Safety check: D3 replaces IDs with Objects, but check just in case
    const srcCO2 = src.co2 !== undefined ? src.co2 : (originalGraph.nodes.find(n => n.id === src)?.co2 || 0);
    const tgtCO2 = tgt.co2 !== undefined ? tgt.co2 : (originalGraph.nodes.find(n => n.id === tgt)?.co2 || 0);
    const sector = String(link.sector || '').toLowerCase();
    const isDirty = sector.includes('energy') || sector.includes('steel') || sector.includes('textile');

    // CBAM: Purple for Tariff, Orange for Leakage
    if (scenario === 'CBAM') {
      if (isDirty) {
        // Tariff: High Risk -> Low Risk (Regulated Entrance)
        if (srcCO2 > 80 && tgtCO2 <= 80) return '#7c3aed'; // Purple
        // Leakage: High Risk -> High Risk (Unregulated Club)
        if (srcCO2 > 80 && tgtCO2 > 80) return '#f97316'; // Orange
      }
      return '#cbd5e1'; // Muted
    }

    // TECH: Cyan for Tech Flows
    if (scenario === 'TECH_TRANSFER') {
      // Tech Flow: If either partner is Green (Adopter)
      const isGreen = srcCO2 < 40 || tgtCO2 < 40;
      if (isGreen) return '#06b6d4'; // Cyan
      return '#cbd5e1'; // Muted
    }

    return link.edge_color || getSectorColor(link.sector);
  };

  const handleNodeClick = useCallback((node) => {
    // Toggle selection
    setSelectedNode(prev => (prev && prev.id === node.id) ? null : node);

    // Focus camera
    if (node) {
      const focus = (graphRef) => {
        if (!graphRef.current) return;
        const distRatio = 1 + 300 / Math.hypot(node.x, node.y, node.z);
        graphRef.current.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          2000
        );
      };
      focus(originalGraphRef);
      focus(simulatedGraphRef);
    }
  }, []);

  if (isLoading) return <div style={{ color: 'white', padding: 40 }}>Loading Command Center...</div>;

  return (
    <div className="policy-lab-container">

      {/* 1. LEFT SIDEBAR - COMMAND PANEL */}
      <aside className="policy-sidebar">
        <div className="sidebar-header">
          <div className="lab-title">
            <span></span> POLICY LAB
          </div>
          <button onClick={() => navigate('/')} className="back-link">
            ← Exit to Dashboard
          </button>
        </div>

        <div className="sidebar-controls">
          {/* Mode Selection */}
          <div className="mode-switcher">
            <button className={`mode-btn ${mode === 'global' ? 'active' : ''}`} onClick={() => setMode('global')}>Global</button>
            <button className={`mode-btn ${mode === 'bilateral' ? 'active' : ''}`} onClick={() => setMode('bilateral')}>Bilateral</button>
          </div>

          <div className="control-section-title">Scenario Configurations</div>

          {mode === 'global' ? (
            <>
              <div className="input-group">
                <label>Select Policy Framework</label>
                <select className="scenario-select" value={scenario} onChange={e => setScenario(e.target.value)}>
                  {POLICY_SCENARIOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {scenario !== 'FAIRNESS_DIAL' ? (
                <div className="slider-container">
                  <div className="slider-header">
                    <span>Intensity / Rate</span>
                    <span className="slider-value">{Math.round(severity * 100)}%</span>
                  </div>
                  <input type="range" className="chunky-slider" min="0" max="0.5" step="0.05" value={severity} onChange={e => setSeverity(parseFloat(e.target.value))} />
                </div>
              ) : (
                <div className="slider-container">
                  <div className="slider-header" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8.5rem' }}>
                    <span style={{ color: '#3E6985', fontWeight: 700 }}>Consumer: {Math.round((1 - fairnessRatio) * 100)}%</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>Producer: {Math.round(fairnessRatio * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    className="chunky-slider"
                    min="0"
                    max="1"
                    step="0.01"
                    value={fairnessRatio}
                    onChange={e => setFairnessRatio(parseFloat(e.target.value))}
                    style={{
                      background: `linear-gradient(90deg, #3E6985 ${(1 - fairnessRatio) * 100}%, #ef4444 ${(1 - fairnessRatio) * 100}%)`
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px', textAlign: 'center', fontStyle: 'italic' }}>
                    {fairnessRatio > 0.6 ? 'Source-Based Burden' : fairnessRatio < 0.4 ? 'Consumption-Based Burden' : 'Shared Responsibility'}
                  </div>
                </div>
              )}

              <div className="run-btn-container">
                <button className="run-btn" onClick={runSimulation} disabled={isRunning}>
                  {isRunning ? 'Crunching Data...' : 'Run Simulation'}
                </button>
              </div>
            </>
          ) : (
            <BilateralPolicySelector onOptimize={handleBilateralOptimize} isLoading={isBilateralLoading} />
          )}


        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="policy-workspace">
        <div className="workspace-header">
          <div className="header-title">World Simulation View</div>
          <div className="view-controls">
            <button className="view-chip active">3D View</button>
            <button className="view-chip" onClick={() => navigate('/')}>Data Table</button>
          </div>
        </div>

        {/* 3. VISUALIZATION AREA */}
        <div className="visualization-area" onMouseMove={syncCameras}>
          {/* LEFT: REALITY */}
          <div className="viz-panel" style={{ position: 'relative' }}>
            <div className="panel-label">CURRENT REALITY</div>

            {/* Context Legend: Left */}
            <div style={{
              position: 'absolute', bottom: '20px', left: '20px',
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '16px', borderRadius: '12px',
              border: '1px solid #cbd5e1',
              pointerEvents: 'none', zIndex: 10,
              fontSize: '0.75rem', color: '#334155',
              width: '200px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
            }}>
              <strong style={{ display: 'block', marginBottom: '8px', textTransform: 'uppercase', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>Baseline Context</strong>

              <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem' }}>NODES (Economy Type)</div>
              <div style={{ marginBottom: '2px' }}><span style={{ color: '#ef4444' }}>●</span> High Risk <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Heavy Industry Base)</span></div>
              <div style={{ marginBottom: '8px' }}><span style={{ color: '#3E6985' }}>●</span> Low Risk <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Service/Tech Base)</span></div>

              <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem' }}>EDGES (Trade Intensity)</div>
              <div style={{ marginBottom: '2px' }}><span style={{ color: '#ef4444', fontWeight: 'bold' }}>━━</span> Dirty Flow <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(High Embodied Carbon)</span></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 'bold' }}>━━</span> Clean Flow <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Low Intensity)</span></div>
            </div>
            <ForceGraph3D
              ref={originalGraphRef}
              graphData={originalGraph}
              width={window.innerWidth / 2 - 170} // Sidebar offset
              height={window.innerHeight - 120} // Header/footer offset
              backgroundColor="#F0F4F8"

              // MATCHED STYLES
              nodeVal={node => Math.max(2.5, Math.sqrt(node.gdp_usd || 0) / 7000)}
              nodeColor={getOriginalNodeColor}
              nodeLabel={node => `${node.label || node.id || node.iso3}: Risk ${(node.co2 || 0).toFixed(1)}`}
              nodeResolution={24}
              nodeOpacity={0.9}

              linkColor={getOriginalLinkColor}
              linkWidth={link => {
                const val = link.primaryValue || link.value || 0;
                return Math.max(1.5, Math.sqrt(val) / 20000);
              }}

              // INTERACTION: Show edges on Hover OR Selection
              onNodeHover={node => setHoverNode(node || null)}
              onNodeClick={handleNodeClick}
              linkVisibility={link => {
                // 1. Hover
                if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return true;
                // 2. Selection (Persistent)
                if (selectedNode && (link.source.id === selectedNode.id || link.target.id === selectedNode.id)) return true;

                return false; // Hide by default
              }}

              showNavInfo={false}
            />
          </div>

          {/* RIGHT: FUTURE */}
          <div className="viz-panel" style={{ position: 'relative' }}>
            <div className="panel-label">SIMULATED FUTURE</div>

            {/* Context Legend: Right (Dynamic based on Policy) */}
            <div style={{
              position: 'absolute', bottom: '20px', right: '20px',
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '16px', borderRadius: '12px',
              border: '1px solid #cbd5e1',
              pointerEvents: 'none', zIndex: 10,
              fontSize: '0.75rem', color: '#334155',
              width: '240px',
              textAlign: 'left',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
            }}>
              <strong style={{ display: 'block', marginBottom: '8px', textTransform: 'uppercase', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', textAlign: 'right' }}>
                {scenario === 'CBAM' ? 'CBAM Impact' : scenario === 'TECH_TRANSFER' ? 'Green Tech Impact' : 'Fairness Attribution'}
              </strong>

              {scenario === 'CBAM' && (
                <>
                  <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem', textAlign: 'right' }}>NODES</div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}><span style={{ color: '#ef4444' }}>●</span> High Tariff <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Carbon Intensive)</span></div>
                  <div style={{ marginBottom: '8px', textAlign: 'right' }}><span style={{ color: '#3E6985' }}>●</span> Low Tariff <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Decarbonized)</span></div>

                  <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem', textAlign: 'right' }}>EDGES</div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}>Restricted <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>━━</span> <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Blocked by Cost)</span></div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}>Leakage <span style={{ color: '#f97316', fontWeight: 'bold' }}>━━</span> <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Avoids Regulation)</span></div>
                </>
              )}

              {scenario === 'TECH_TRANSFER' && (
                <>
                  <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem', textAlign: 'right' }}>NODES</div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}><span style={{ color: '#10b981' }}>●</span> Adopter <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Received Finance)</span></div>
                  <div style={{ marginBottom: '8px', textAlign: 'right' }}><span style={{ color: '#94a3b8' }}>●</span> Laggard <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(High Cost Base)</span></div>

                  <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem', textAlign: 'right' }}>EDGES</div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}>Tech Flow <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>━━</span> <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Clean Tech Transfer)</span></div>
                </>
              )}

              {scenario === 'FAIRNESS_DIAL' && (
                <>
                  <div style={{ marginBottom: '4px', fontWeight: '700', color: '#64748b', fontSize: '0.7rem', textAlign: 'right' }}>NODES & EDGES</div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}>Source Pays <span style={{ color: '#ef4444', fontWeight: 'bold' }}>━━</span> <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Producer Liability)</span></div>
                  <div style={{ marginBottom: '2px', textAlign: 'right' }}>Fair Agreement <span style={{ color: '#3E6985', fontWeight: 'bold' }}>━━</span> <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>(Shared Burden)</span></div>
                  <div style={{ marginBottom: '0px', textAlign: 'right', fontStyle: 'italic', opacity: 0.8, fontSize: '0.65rem' }}>Sink Pays (Consumer Liability)</div>
                </>
              )}
            </div>
            {simulatedGraph.nodes.length > 0 ? (
              <ForceGraph3D
                ref={simulatedGraphRef}
                graphData={simulatedGraph}
                width={window.innerWidth / 2 - 170}
                height={window.innerHeight - 120}
                backgroundColor="#F0F4F8"

                // MATCHED STYLES
                nodeVal={node => Math.max(2.5, Math.sqrt(node.gdp_usd || 0) / 7000)}
                nodeColor={getFutureNodeColor}
                nodeLabel={node => `${node.label || node.id || node.iso3}: Risk ${(node.co2 || 0).toFixed(1)}`}
                nodeResolution={24}
                nodeOpacity={0.9}

                linkColor={getFutureLinkColor}
                linkWidth={link => {
                  const val = link.primaryValue || link.value || 0;
                  return Math.max(1.5, Math.sqrt(val) / 20000);
                }}

                // INTERACTION: Show edges on Hover, Selection, OR Policy Highlight
                onNodeHover={node => setHoverNode(node || null)}
                onNodeClick={handleNodeClick}
                linkVisibility={link => {
                  // 1. Bilateral Mode: Show highlighted edges
                  if (mode === 'bilateral' && link.edge_color) return true;

                  // 2. Global Mode: STRICTLY HIDE unless interacting
                  // (The previous "always show if edge_color" was causing the hairball in Global mode)

                  // 3. Hover
                  if (hoverNode && (link.source.id === hoverNode.id || link.target.id === hoverNode.id)) return true;
                  // 4. Selection
                  if (selectedNode && (link.source.id === selectedNode.id || link.target.id === selectedNode.id)) return true;

                  return false;
                }}

                showNavInfo={false}
              />
            ) : (
              <div className="empty-simulation">
                <p>Run a simulation to generate a future scenario.</p>
              </div>
            )}
          </div>

          {/* CENTER: KEY INSIGHTS */}
          {/* CENTER: KEY INSIGHTS */}
          {metrics && (
            <div className="insights-overlay">
              {/* 1. TRADE VOLUME (CBAM / Generic) */}
              {metrics.volume_delta_pct !== undefined && (
                <div className="insight-metric">
                  <div className="insight-label">Trade Vol. Change</div>
                  <div className={`insight-value ${metrics.volume_delta_pct < 0 ? 'negative' : 'positive'}`}>
                    {(metrics.volume_delta_pct ?? 0).toFixed(1)}%
                  </div>
                </div>
              )}

              {/* 2. INTENSITY REDUCTION (Tech Transfer) */}
              {metrics.intensity_delta_pct !== undefined && (
                <div className="insight-metric">
                  <div className="insight-label">Carbon Intensity</div>
                  <div className="insight-value positive">
                    {(metrics.intensity_delta_pct ?? 0).toFixed(1)}%
                  </div>
                </div>
              )}

              {/* 3. COST & REBOUND (Tech Transfer) */}
              {metrics.implementation_cost_usd > 0 && (
                <div className="insight-metric">
                  <div className="insight-label">Est. Cost</div>
                  <div className="insight-value negative">
                    ${(metrics.implementation_cost_usd / 1e12).toFixed(1)}T
                  </div>
                </div>
              )}

              {metrics.gdp_rebound_pct > 0 && (
                <div className="insight-metric">
                  <div className="insight-label">GDP Rebound</div>
                  <div className="insight-value positive">
                    +{(metrics.gdp_rebound_pct).toFixed(1)}%
                  </div>
                </div>
              )}

              {/* 4. RIPPLE EFFECTS (CBAM) */}
              {/* 4. RIPPLE EFFECTS MOVED TO DRAWER */}

              {/* 5. FAIRNESS SPLIT (Fairness Dial) */}


              {/* 6. RISK SHIFT (All) */}
              {metrics.leakage_risk && (
                <div className="insight-metric">
                  <div className="insight-label">Risk Shift</div>
                  <div className="insight-value">{metrics.leakage_risk}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. BOTTOM DRAWER */}
        <div className={`bottom-drawer ${isDrawerOpen ? 'open' : ''}`}>
          <div className="drawer-toggle" onClick={() => setIsDrawerOpen(!isDrawerOpen)}>
            {isDrawerOpen ? '▼ Hide Detailed Analysis' : '▲ Show Detailed Analysis & AI Insights'}
          </div>
          {isDrawerOpen && (
            <div className="drawer-content">
              {/* GLOBAL: RIPPLE EFFECTS SECTION */}
              {metrics && mode === 'global' && metrics.ripple_effects && Object.keys(metrics.ripple_effects).length > 0 && (
                <div style={{ marginBottom: '24px', background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '12px', fontWeight: 700 }}>Global Supply Chain Ripple Effects</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {Object.entries(metrics.ripple_effects).map(([iso, val]) => (
                      <div key={iso} style={{ padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem', color: '#334155', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                        <strong style={{ color: '#0D273D' }}>{iso}</strong>: {val}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content for metrics + LLM Panel */}
              {metrics && mode === 'global' && <LLMAnalystPanel analysisType="policy" simulationData={latestSimulation} autoTrigger={true} />}
              {mode === 'bilateral' && bilateralResults && (
                <>
                  <DeltaComparisonCard policy={bilateralResults.policy} baseline={bilateralResults.baseline} />
                  <UpstreamImpactTable upstreamImpact={bilateralResults.upstream_impact} />
                  <LLMAnalystPanel analysisType="bilateral" simulationData={bilateralResultForAnalysis} autoTrigger={true} />
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PolicyLab;
