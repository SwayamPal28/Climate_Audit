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

  const [attributionMode, setAttributionMode] = useState('shapley');
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
      if (scenario === 'FAIRNESS_DIAL') payload.attribution_mode = attributionMode;

      const response = await axios.post('/api/simulate/policy', payload);

      if (response.data && response.data.simulated) {
        setSimulatedGraph(response.data.simulated);
        setMetrics(response.data.metrics || null);
        setLatestSimulation({
          policy_type: scenario, severity, metrics: response.data.metrics || {}, context: { attribution_mode: attributionMode }
        });
        setIsDrawerOpen(true); // Auto-open drawer for results
      }
    } catch (error) {
      alert('Simulation failed. check console.');
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  }, [scenario, severity, attributionMode]);

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

  const getNodeColor = (node) => {
    return node.co2 > 80 ? '#ef4444' : '#3E6985'; // Red for Risk, Teal Blue for Safe
  };

  const getLinkColor = (link) => {
    // If selected, highlight its links
    if (selectedNode) {
      const isConnected = link.source.id === selectedNode.id || link.target.id === selectedNode.id;
      if (isConnected) return '#ef4444'; // Highlight connected
    }
    return getSectorColor(link.sector);
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
                <div className="input-group">
                  <label>Attribution Logic</label>
                  <select className="scenario-select" value={attributionMode} onChange={e => setAttributionMode(e.target.value)}>
                    <option value="shapley">Shared Responsibility (Cooperative)</option>
                    <option value="production">Production-Based (Territorial)</option>
                    <option value="consumption">Consumption-Based (Footprint)</option>
                  </select>
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

          <div className="sidebar-legend">
            <div className="control-section-title">Map Key</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: '#ef4444' }}></div> High Risk (&gt;80 CO2)</div>
            <div className="legend-item"><div className="legend-dot" style={{ background: '#3E6985' }}></div> Low Risk / Safe</div>
          </div>
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
          <div className="viz-panel">
            <div className="panel-label">CURRENT REALITY</div>
            <ForceGraph3D
              ref={originalGraphRef}
              graphData={originalGraph}
              width={window.innerWidth / 2 - 170} // Sidebar offset
              height={window.innerHeight - 120} // Header/footer offset
              backgroundColor="#F0F4F8"

              // MATCHED STYLES
              nodeVal={node => Math.max(2.5, Math.sqrt(node.gdp_usd || 0) / 7000)}
              nodeColor={getNodeColor}
              nodeLabel={node => `${node.label || node.id || node.iso3}: Risk ${(node.co2 || 0).toFixed(1)}`}
              nodeResolution={24}
              nodeOpacity={0.9}

              linkColor={getLinkColor}
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
          <div className="viz-panel">
            <div className="panel-label">SIMULATED FUTURE</div>
            {simulatedGraph.nodes.length > 0 ? (
              <ForceGraph3D
                ref={simulatedGraphRef}
                graphData={simulatedGraph}
                width={window.innerWidth / 2 - 170}
                height={window.innerHeight - 120}
                backgroundColor="#F0F4F8"

                // MATCHED STYLES
                nodeVal={node => Math.max(2.5, Math.sqrt(node.gdp_usd || 0) / 7000)}
                nodeColor={node => {
                  // Keep highlighting simple to match Dashboard
                  return node.node_color_override || getNodeColor(node);
                }}
                nodeLabel={node => `${node.label || node.id || node.iso3}: Risk ${(node.co2 || 0).toFixed(1)}`}
                nodeResolution={24}
                nodeOpacity={0.9}

                linkColor={link => link.edge_color || getLinkColor(link)}
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
              {metrics.ripple_effects && Object.keys(metrics.ripple_effects).length > 0 && (
                <div className="insight-metric">
                  <div className="insight-label">Ripple Impact</div>
                  <div className="insight-value negative" style={{ fontSize: '12px', lineHeight: '1.2' }}>
                    {Object.entries(metrics.ripple_effects).slice(0, 1).map(([iso, val]) => (
                      <div key={iso}>{iso}: {val}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. FAIRNESS SPLIT (Fairness Dial) */}
              {metrics.producer_ratio !== undefined && (
                <div className="insight-metric">
                  <div className="insight-label">Responsibility</div>
                  <div className="insight-value" style={{ fontSize: '13px' }}>
                    Prod: {Math.round(metrics.producer_ratio * 100)}%
                    <br />
                    Cons: {Math.round((1 - metrics.producer_ratio) * 100)}%
                  </div>
                </div>
              )}

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
