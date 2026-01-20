import React, { useState, useEffect, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PolicyLab.css';

const POLICY_SCENARIOS = [
  { value: 'CBAM', label: 'EU CBAM (Carbon Border Tax)' },
  { value: 'TECH_TRANSFER', label: 'Technology Transfer (Green Grid)' },
  { value: 'FAIRNESS_DIAL', label: 'Fairness Dial (Attribution)' }
];

const PolicyLab = () => {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState('CBAM');
  const [severity, setSeverity] = useState(0.2);
  const [isRunning, setIsRunning] = useState(false);

  // Graph data states
  const [originalGraph, setOriginalGraph] = useState({ nodes: [], links: [] });
  const [simulatedGraph, setSimulatedGraph] = useState({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState(null);

  // Graph refs
  const originalGraphRef = React.useRef();
  const simulatedGraphRef = React.useRef();

  // Attribution mode for FAIRNESS_DIAL
  const [attributionMode, setAttributionMode] = useState('shapley');

  // Loading states
  const [isLoading, setIsLoading] = useState(true);

  // Physics tuning for better node spacing
  useEffect(() => {
    const applyPhysics = (graphRef) => {
      if (!graphRef.current) return;

      const fg = graphRef.current;
      const d3Force = fg.d3Force;

      if (d3Force) {
        // STRONG REPULSION: Push nodes far apart
        d3Force('charge').strength(-3000).distanceMax(1000);

        // LONG EDGES: Make connections longer and clearer
        d3Force('link').distance(300).strength(0.3);

        // CENTER GRAVITY: Keep the graph centered but not too tight
        d3Force('center').strength(0.05);

        // Reheat the simulation to apply changes
        fg.d3ReheatSimulation();
      }

      // Camera controls for better zoom
      const controls = fg.controls();
      if (controls) {
        controls.minDistance = 50;
        controls.maxDistance = 15000;
        controls.zoomSpeed = 2.0;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
      }
    };

    // Apply to both graphs after a small delay
    const timer = setTimeout(() => {
      applyPhysics(originalGraphRef);
      applyPhysics(simulatedGraphRef);
    }, 300);

    return () => clearTimeout(timer);
  }, [originalGraph, simulatedGraph]);

  // Load original graph data
  useEffect(() => {
    const fetchOriginalGraph = async () => {
      try {
        const response = await axios.get('/api/graph');
        setOriginalGraph(response.data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading graph:', error);
        setIsLoading(false);
      }
    };
    fetchOriginalGraph();
  }, []);

  // Run simulation
  const runSimulation = useCallback(async () => {
    setIsRunning(true);
    try {
      const payload = {
        policy_type: scenario,
        severity: severity
      };

      // Only add attribution_mode for FAIRNESS_DIAL
      if (scenario === 'FAIRNESS_DIAL') {
        payload.attribution_mode = attributionMode;
      }

      const response = await axios.post('/api/simulate/policy', payload);

      if (response.data && response.data.simulated) {
        setSimulatedGraph(response.data.simulated);
        setMetrics(response.data.metrics || null);

        // Reset graph view
        setTimeout(() => {
          if (simulatedGraphRef.current) {
            simulatedGraphRef.current.cameraPosition({ z: 1200 }, null, 1000);
          }
        }, 500);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error running simulation:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || 'Unknown error';
      alert('Simulation failed: ' + errorMessage);
    } finally {
      setIsRunning(false);
    }
  }, [scenario, severity, attributionMode]);

  // Helper functions
  const formatNumber = (num) => {
    if (num == null || isNaN(num)) return 'N/A';
    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const getSectorColor = (sector) => {
    if (!sector) return '#b2bec3';
    const s = String(sector).toLowerCase();
    if (s.includes('steel')) return '#2c3e50';
    if (s.includes('energy')) return '#a29bfe';
    if (s.includes('textile')) return '#74b9ff';
    return '#b2bec3';
  };

  const isLinkVisible = (link) => {
    // Always show all links in policy lab
    return true;
  };

  if (isLoading) {
    return <div className="policy-lab-loading">Loading Policy Lab...</div>;
  }

  return (
    <div className="policy-lab-container">
      {/* Top Navigation */}
      <div className="policy-lab-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Dashboard
        </button>
        <h2>Policy Lab - What-If Scenarios</h2>
      </div>

      {/* Control Panel */}
      <div className="policy-lab-controls">
        <h3>Policy Lab Controls</h3>

        <div className="control-group">
          <label>Scenario</label>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="control-select"
          >
            {POLICY_SCENARIOS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {scenario === 'FAIRNESS_DIAL' ? (
          <div className="control-group">
            <label>Attribution Framework</label>
            <div className="fairness-toggle">
              <button
                className={attributionMode === 'producer' ? 'active' : ''}
                onClick={() => setAttributionMode('producer')}
              >
                Producer Pays
              </button>
              <button
                className={attributionMode === 'consumer' ? 'active' : ''}
                onClick={() => setAttributionMode('consumer')}
              >
                Consumer Pays
              </button>
              <button
                className={attributionMode === 'shapley' ? 'active' : ''}
                onClick={() => setAttributionMode('shapley')}
              >
                Shapley (Fair)
              </button>
            </div>
          </div>
        ) : (
          <div className="control-group">
            <label>
              {scenario === 'CBAM' ? 'Tax Rate' : 'Efficiency Gain'}: {Math.round(severity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.05"
              value={severity}
              onChange={(e) => setSeverity(parseFloat(e.target.value))}
              className="control-slider"
            />
          </div>
        )}

        <button
          onClick={runSimulation}
          disabled={isRunning}
          className="simulate-button"
        >
          {isRunning ? 'Running Simulation...' : 'Run Simulation'}
        </button>

        {/* Metrics Display */}
        {metrics && (
          <div className="metrics-display">
            <h4>Simulation Results</h4>
            {scenario === 'CBAM' && (
              <>
                <div className="metric-item">
                  <span className="metric-label">Trade Volume Change:</span>
                  <span className={`metric-value ${metrics.volume_delta_pct < 0 ? 'negative' : 'positive'}`}>
                    {metrics.volume_delta_pct.toFixed(2)}% ({formatNumber(metrics.volume_delta_usd)})
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Affected Trade Routes:</span>
                  <span className="metric-value">{metrics.affected_edges}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Affected Exporters:</span>
                  <span className="metric-value">{metrics.num_affected_exporters} countries</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Carbon Leakage Risk:</span>
                  <span className={`metric-value risk-${metrics.leakage_risk.toLowerCase()}`}>
                    {metrics.leakage_risk}
                  </span>
                </div>
                {metrics.affected_exporters && metrics.affected_exporters.length > 0 && (
                  <div className="metric-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span className="metric-label">Key Exporters:</span>
                    <span className="metric-value" style={{ fontSize: '12px', marginTop: '5px' }}>
                      {metrics.affected_exporters.slice(0, 8).join(', ')}
                    </span>
                  </div>
                )}
              </>
            )}
            {scenario === 'TECH_TRANSFER' && (
              <>
                <div className="metric-item">
                  <span className="metric-label">Emission Intensity Change:</span>
                  <span className={`metric-value ${metrics.intensity_delta_pct < 0 ? 'positive' : 'negative'}`}>
                    {metrics.intensity_delta_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Affected Countries:</span>
                  <span className="metric-value">{metrics.affected_countries}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Global Impact:</span>
                  <span className="metric-value">
                    {metrics.global_impact_weight_pct ? metrics.global_impact_weight_pct.toFixed(1) : '0'}% of global GDP
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Est. CO2 Reduction:</span>
                  <span className="metric-value positive">
                    {formatNumber(metrics.estimated_co2_reduction_kt)} kt CO2
                  </span>
                </div>
                {metrics.affected_country_list && metrics.affected_country_list.length > 0 && (
                  <div className="metric-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span className="metric-label">Target Countries:</span>
                    <span className="metric-value" style={{ fontSize: '12px', marginTop: '5px' }}>
                      {metrics.affected_country_list.join(', ')}
                    </span>
                  </div>
                )}
              </>
            )}
            {scenario === 'FAIRNESS_DIAL' && (
              <>
                <div className="metric-item">
                  <span className="metric-label">Framework:</span>
                  <span className="metric-value">{metrics.framework}</span>
                </div>
                <div className="metric-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span className="metric-label">Description:</span>
                  <span style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>
                    {metrics.description}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Split Screen View */}
      <div className="split-screen-container">
        {/* Left: Current Reality */}
        <div className="graph-panel">
          <div className="graph-header">
            <h3>Current Reality</h3>
            <span className="graph-stats">
              {originalGraph.nodes.length} Nodes • {originalGraph.links.length} Links
            </span>
          </div>
          <div className="graph-view">
            <ForceGraph3D
              ref={originalGraphRef}
              graphData={originalGraph}
              backgroundColor="rgba(0,0,0,0)"
              width={window.innerWidth / 2 - 60}
              height={window.innerHeight - 200}

              // Node sizing - keep reasonable to avoid overlap
              nodeVal={node => Math.max(3, Math.min(12, Math.sqrt(node.gdp_usd || 0) / 10000))}
              nodeColor={node => node.node_color_override || (node.co2 > 80 ? '#6c5ce7' : '#00cec9')}
              nodeLabel={node => `${node.label || node.id}: Risk ${(node.co2 || 0).toFixed(1)}`}
              nodeOpacity={0.9}
              nodeResolution={16}

              // Link styling - subtle but visible
              linkVisibility={isLinkVisible}
              linkColor={link => link.edge_color || getSectorColor(link.sector)}
              linkWidth={link => {
                const val = link.value || link.primaryValue || 0;
                return Math.max(0.5, Math.sqrt(val) / 30000);
              }}
              linkOpacity={0.3}
              linkDirectionalParticles={0}

              // Physics
              showNavInfo={false}
              forceEngine="d3"
              warmupTicks={300}
              cooldownTicks={0}
            />
          </div>
        </div>

        {/* Right: Simulated Future */}
        <div className="graph-panel">
          <div className="graph-header">
            <h3>Simulated Future</h3>
            <span className="graph-stats">
              {simulatedGraph.nodes.length} Nodes • {simulatedGraph.links.length} Links
            </span>
          </div>
          <div className="graph-view">
            {simulatedGraph.nodes.length > 0 ? (
              <ForceGraph3D
                ref={simulatedGraphRef}
                graphData={simulatedGraph}
                backgroundColor="rgba(0,0,0,0)"
                width={window.innerWidth / 2 - 60}
                height={window.innerHeight - 200}

                // Node sizing - keep reasonable to avoid overlap
                nodeVal={node => Math.max(3, Math.min(12, Math.sqrt(node.gdp_usd || 0) / 10000))}
                nodeColor={node => {
                  // Priority: explicit color override from simulation, then normal coloring
                  if (node.node_color_override) return node.node_color_override;
                  return node.co2 > 80 ? '#6c5ce7' : '#00cec9';
                }}
                nodeLabel={node => `${node.label || node.id}: Risk ${(node.co2 || 0).toFixed(1)}`}
                nodeOpacity={0.9}
                nodeResolution={16}

                // Link styling - subtle but visible
                linkVisibility={isLinkVisible}
                linkColor={link => {
                  // Priority: explicit edge color from simulation, then sector color
                  if (link.edge_color) return link.edge_color;
                  return getSectorColor(link.sector);
                }}
                linkWidth={link => {
                  const val = link.value || link.primaryValue || 0;
                  return Math.max(0.5, Math.sqrt(val) / 30000);
                }}
                linkOpacity={0.3}
                linkDirectionalParticles={0}

                // Physics
                showNavInfo={false}
                forceEngine="d3"
                warmupTicks={300}
                cooldownTicks={0}
              />
            ) : (
              <div className="empty-simulation">
                <p>Run a simulation to see results</p>
                <p className="hint">Select a scenario and click "Run Simulation"</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PolicyLab;
