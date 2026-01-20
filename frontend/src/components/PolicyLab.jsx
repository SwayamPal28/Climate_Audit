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

  // Mode selection: 'global' or 'bilateral'
  const [mode, setMode] = useState('global');

  // Global simulation states
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

  // Bilateral analysis states
  const [bilateralResults, setBilateralResults] = useState(null);
  const [isBilateralLoading, setIsBilateralLoading] = useState(false);

  // LLM Analysis state
  const [latestSimulation, setLatestSimulation] = useState(null);
  const [bilateralResultForAnalysis, setBilateralResultForAnalysis] = useState(null);

  // Physics tuning for MAXIMUM node spacing - EXTREME SETTINGS
  useEffect(() => {
    const applyPhysics = (graphRef) => {
      if (!graphRef.current) return;

      const fg = graphRef.current;
      const d3Force = fg.d3Force;

      if (d3Force) {
        // EXTREME REPULSION: Massive force to spread nodes apart
        d3Force('charge').strength(-15000).distanceMax(5000);

        // VERY LONG EDGES: Make connections extremely long
        d3Force('link').distance(1000).strength(0.1);

        // NO CENTER GRAVITY: Let nodes spread freely
        d3Force('center').strength(0.01);

        // Reheat the simulation to apply changes
        fg.d3ReheatSimulation();
      }

      // Camera controls - start very far back
      const controls = fg.controls();
      if (controls) {
        controls.minDistance = 500;
        controls.maxDistance = 30000;
        controls.zoomSpeed = 2.5;
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

        // Store for LLM analysis
        setLatestSimulation({
          policy_type: scenario,
          severity: severity,
          metrics: response.data.metrics || {},
          context: { attribution_mode: attributionMode }
        });

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

  // Handle bilateral policy optimization
  const handleBilateralOptimize = useCallback(async (params) => {
    setIsBilateralLoading(true);
    try {
      const response = await axios.post('/api/optimize/bilateral', params);
      setBilateralResults(response.data);

      // Create focused graph with only affected nodes
      if (response.data && response.data.route_info) {
        const { source, target } = response.data.route_info;
        const upstreamCountries = response.data.upstream_impact?.map(u => u.supplier_country) || [];

        // Affected nodes: source, target, and all suppliers
        const affectedNodes = new Set([source, target, ...upstreamCountries]);

        // Filter original graph to show only affected nodes
        const filteredNodes = originalGraph.nodes.filter(node => affectedNodes.has(node.iso3));

        // Filter links - ensure both source and target are in affected nodes
        const filteredLinks = originalGraph.links.filter(link => {
          const src = link.source_iso3 || link.source?.iso3 || link.source;
          const tgt = link.target_iso3 || link.target?.iso3 || link.target;
          return affectedNodes.has(src) && affectedNodes.has(tgt);
        });

        // Add color highlighting to nodes for simulated graph
        const highlightedNodes = filteredNodes.map(node => ({
          ...node,
          node_color_override:
            node.iso3 === source ? '#ef4444' : // Red for source (exporter)
              node.iso3 === target ? '#3b82f6' : // Blue for target (importer)
                upstreamCountries.includes(node.iso3) ? '#f59e0b' : // Orange for suppliers
                  null
        }));

        // Add color highlighting to edges for simulated graph
        const highlightedLinks = filteredLinks.map(link => {
          const src = link.source_iso3 || link.source?.iso3 || link.source;
          const tgt = link.target_iso3 || link.target?.iso3 || link.target;

          return {
            ...link,
            source: src,
            target: tgt,
            edge_color:
              src === source && tgt === target ? '#8b5cf6' : // Purple for main route
                upstreamCountries.includes(src) && tgt === source ? '#f59e0b' : // Orange for supplier routes
                  '#94a3b8' // Gray for others
          };
        });

        // Update simulated graph with focused, highlighted view
        setSimulatedGraph({
          nodes: highlightedNodes,
          links: highlightedLinks
        });

        // Update original graph to show the same filtered view (no colors)
        setOriginalGraph({
          nodes: filteredNodes,
          links: filteredLinks.map(l => {
            const src = l.source_iso3 || l.source?.iso3 || l.source;
            const tgt = l.target_iso3 || l.target?.iso3 || l.target;
            return {
              ...l,
              source: src,
              target: tgt,
              edge_color: '#b2bec3'
            };
          })
        });
      }

      // Prepare for LLM analysis
      setBilateralResultForAnalysis({
        source: response.data.route_info?.source || params.src_iso,
        target: response.data.route_info?.target || params.tgt_iso,
        sector: params.sector || 'All',
        policy: response.data.policy || {},
        upstream_impact: response.data.upstream_impact || []
      });

    } catch (error) {
      console.error('Error in bilateral optimization:', error);
      const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message;
      alert('Bilateral optimization failed: ' + errorMessage);
    } finally {
      setIsBilateralLoading(false);
    }
  }, [originalGraph]);

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
    // Filter to show only significant trade routes to reduce congestion
    const value = link.value || link.primaryValue || 0;
    // Show only links with trade value > 100M USD
    return value > 100000000;
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

        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            className={mode === 'global' ? 'active' : ''}
            onClick={() => setMode('global')}
          >
            Global Simulation
          </button>
          <button
            className={mode === 'bilateral' ? 'active' : ''}
            onClick={() => setMode('bilateral')}
          >
            Bilateral Analysis
          </button>
        </div>
      </div>

      {/* Control Panel - Conditional based on mode */}
      {mode === 'global' ? (
        <div className="policy-lab-controls">
          <h3>Global Policy Simulation</h3>

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
                  <div className="metrics-info">
                    <strong>How to interpret these results:</strong>
                    This simulation shows the economic and environmental impact of implementing a Carbon Border Adjustment Mechanism (CBAM). Negative trade volume changes indicate reduced imports from high-emission countries, while carbon leakage risk shows how likely production will shift to unregulated regions.
                  </div>

                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Trade Volume Change</span>
                        <span className={`metric-value ${metrics.volume_delta_pct < 0 ? 'negative' : 'positive'}`}>
                          {metrics.volume_delta_pct.toFixed(2)}% ({formatNumber(metrics.volume_delta_usd)})
                        </span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Affected Trade Routes</span>
                        <span className="metric-value">{metrics.affected_edges}</span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Affected Exporters</span>
                        <span className="metric-value">{metrics.num_affected_exporters} countries</span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Carbon Leakage Risk</span>
                        <span className={`metric-value risk-${metrics.leakage_risk.toLowerCase()}`}>
                          {metrics.leakage_risk}
                        </span>
                      </div>
                    </div>
                  </div>

                  {metrics.affected_exporters && metrics.affected_exporters.length > 0 && (
                    <div className="metric-list-card">
                      <span className="metric-list-label">Key Affected Exporters:</span>
                      <span className="metric-list-value">
                        {metrics.affected_exporters.slice(0, 8).join(', ')}
                      </span>
                    </div>
                  )}
                </>
              )}
              {scenario === 'TECH_TRANSFER' && (
                <>
                  <div className="metrics-info">
                    <strong>How to interpret these results:</strong>
                    This simulation demonstrates the impact of providing green technology and infrastructure support to developing countries. Lower emission intensity means cleaner energy production, while global impact shows the reach of the technology transfer program.
                  </div>

                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Emission Intensity Change</span>
                        <span className={`metric-value ${metrics.intensity_delta_pct < 0 ? 'positive' : 'negative'}`}>
                          {metrics.intensity_delta_pct.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Affected Countries</span>
                        <span className="metric-value">{metrics.affected_countries}</span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Global Impact</span>
                        <span className="metric-value">
                          {metrics.global_impact_weight_pct ? metrics.global_impact_weight_pct.toFixed(1) : '0'}% of global GDP
                        </span>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-item">
                        <span className="metric-label">Est. CO2 Reduction</span>
                        <span className="metric-value positive">
                          {formatNumber(metrics.estimated_co2_reduction_kt)} kt CO2
                        </span>
                      </div>
                    </div>
                  </div>

                  {metrics.affected_country_list && metrics.affected_country_list.length > 0 && (
                    <div className="metric-list-card">
                      <span className="metric-list-label">Target Countries:</span>
                      <span className="metric-list-value">
                        {metrics.affected_country_list.join(', ')}
                      </span>
                    </div>
                  )}
                </>
              )}
              {scenario === 'FAIRNESS_DIAL' && (
                <>
                  <div className="metrics-info">
                    <strong>How to interpret these results:</strong>
                    This simulation visualizes different attribution frameworks for climate responsibility. Each framework assigns different weights to producers versus consumers of carbon-intensive goods, helping policymakers understand how responsibility sharing affects global equity.
                  </div>

                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                        <span className="metric-label">Framework</span>
                        <span className="metric-value">{metrics.framework}</span>
                      </div>
                    </div>
                  </div>

                  <div className="metric-list-card">
                    <span className="metric-list-label">Description:</span>
                    <span className="metric-list-value">
                      {metrics.description}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* LLM Analysis Panel */}
          {latestSimulation && (
            <LLMAnalystPanel
              analysisType="policy"
              simulationData={latestSimulation}
              autoTrigger={true}
              collapsed={false}
            />
          )}
        </div>
      ) : (
        <>
          {/* Bilateral Mode Controls */}
          <BilateralPolicySelector
            onOptimize={handleBilateralOptimize}
            isLoading={isBilateralLoading}
          />

          {/* Display Bilateral Results */}
          {bilateralResults && bilateralResults.policy && (
            <>
              <DeltaComparisonCard
                policy={bilateralResults.policy}
                baseline={bilateralResults.baseline}
                upstreamImpact={bilateralResults.upstream_impact}
                downstreamImpact={bilateralResults.downstream_impact}
              />

              {bilateralResults.upstream_impact && bilateralResults.upstream_impact.length > 0 && (
                <UpstreamImpactTable
                  upstreamImpact={bilateralResults.upstream_impact}
                />
              )}
            </>
          )}

          {/* LLM Analysis Panel for Bilateral */}
          {bilateralResultForAnalysis && (
            <LLMAnalystPanel
              analysisType="bilateral"
              simulationData={bilateralResultForAnalysis}
              autoTrigger={true}
              collapsed={false}
            />
          )}
        </>
      )}

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
          <div className="graph-explanation">
            {mode === 'bilateral' && bilateralResults ? (
              <p><strong>Focused View:</strong> Showing only affected entities. <strong style={{ color: '#ef4444' }}>Red = Exporter</strong>, <strong style={{ color: '#3b82f6' }}>Blue = Importer</strong>, <strong style={{ color: '#f59e0b' }}>Orange = Suppliers</strong>. Purple edges show the main trade route affected by the policy.</p>
            ) : (
              <p><strong>What you're seeing:</strong> This 3D network shows global trade relationships and carbon risk. Each <strong>sphere (node)</strong> represents a country, sized by GDP. <strong>Lines (edges)</strong> show trade flows between countries, colored by industry sector. <strong>Purple/violet nodes</strong> indicate high carbon risk (&gt;80), while <strong>cyan/teal nodes</strong> are lower risk.</p>
            )}
          </div>
          <div className="graph-view">
            <ForceGraph3D
              ref={originalGraphRef}
              graphData={originalGraph}
              backgroundColor="rgba(0,0,0,0)"
              width={window.innerWidth / 2 - 60}
              height={window.innerHeight - 300}

              // Node sizing - MUCH LARGER for bilateral mode
              nodeVal={node => mode === 'bilateral' ? 25 : Math.max(1.5, Math.min(5, Math.sqrt(node.gdp_usd || 0) / 20000))}
              nodeColor={node => node.node_color_override || (node.co2 > 80 ? '#8b5cf6' : '#14b8a6')}
              nodeLabel={node => mode === 'bilateral' ? `${node.iso3 || node.label}` : `${node.label || node.id}: Risk ${(node.co2 || 0).toFixed(1)}`}
              nodeOpacity={mode === 'bilateral' ? 1.0 : 0.8}
              nodeResolution={16}

              // Link styling - MUCH THICKER for bilateral mode
              linkVisibility={mode === 'bilateral' ? true : isLinkVisible}
              linkColor={link => link.edge_color || getSectorColor(link.sector)}
              linkWidth={link => {
                if (mode === 'bilateral') return 3; // Much thicker
                const val = link.value || link.primaryValue || 0;
                return Math.max(0.2, Math.sqrt(val) / 80000);
              }}
              linkOpacity={mode === 'bilateral' ? 0.6 : 0.15}
              linkDirectionalParticles={0}

              // Physics - extensive warmup for maximum spacing
              showNavInfo={false}
              forceEngine="d3"
              warmupTicks={800}
              cooldownTicks={0}
              onEngineStop={() => {
                if (originalGraphRef.current) {
                  originalGraphRef.current.cameraPosition({ z: 3500 }, null, 1000);
                }
              }}
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
          <div className="graph-explanation">
            {mode === 'bilateral' && bilateralResults ? (
              <p><strong>After Policy:</strong> Colored nodes show impact. <strong style={{ color: '#ef4444' }}>Red (Exporter)</strong> faces reduced export revenue. <strong style={{ color: '#f59e0b' }}>Orange (Suppliers)</strong> experience collateral damage. <strong style={{ color: '#8b5cf6' }}>Purple edge</strong> shows the main trade  route with reduced volume.</p>
            ) : (
              <p><strong>What changed:</strong> After applying the policy, observe changes in <strong>node colors</strong> (risk levels), <strong>node sizes</strong> (economic impact), and <strong>edge colors/thickness</strong> (trade flow changes). Orange/red highlights indicate regions most affected by the policy intervention.</p>
            )}
          </div>
          <div className="graph-view">
            {simulatedGraph.nodes.length > 0 ? (
              <ForceGraph3D
                ref={simulatedGraphRef}
                graphData={simulatedGraph}
                backgroundColor="rgba(0,0,0,0)"
                width={window.innerWidth / 2 - 60}
                height={window.innerHeight - 300}

                // Node sizing - MUCH LARGER for bilateral mode
                nodeVal={node => mode === 'bilateral' ? 25 : Math.max(1.5, Math.min(5, Math.sqrt(node.gdp_usd || 0) / 20000))}
                nodeColor={node => {
                  // Priority: explicit color override from simulation, then normal coloring
                  if (node.node_color_override) return node.node_color_override;
                  return node.co2 > 80 ? '#8b5cf6' : '#14b8a6';
                }}
                nodeLabel={node => mode === 'bilateral' ? `${node.iso3 || node.label}` : `${node.label || node.id}: Risk ${(node.co2 || 0).toFixed(1)}`}
                nodeOpacity={mode === 'bilateral' ? 1.0 : 0.8}
                nodeResolution={16}

                // Link styling - MUCH THICKER for bilateral mode
                linkVisibility={mode === 'bilateral' ? true : isLinkVisible}
                linkColor={link => {
                  // Priority: explicit edge color from simulation, then sector color
                  if (link.edge_color) return link.edge_color;
                  return getSectorColor(link.sector);
                }}
                linkWidth={link => {
                  if (mode === 'bilateral') return 3; // Much thicker
                  const val = link.value || link.primaryValue || 0;
                  return Math.max(0.2, Math.sqrt(val) / 80000);
                }}
                linkOpacity={mode === 'bilateral' ? 0.6 : 0.15}
                linkDirectionalParticles={0}

                // Physics - extensive warmup for maximum spacing
                showNavInfo={false}
                forceEngine="d3"
                warmupTicks={800}
                cooldownTicks={0}
                onEngineStop={() => {
                  if (simulatedGraphRef.current) {
                    simulatedGraphRef.current.cameraPosition({ z: 3500 }, null, 1000);
                  }
                }}
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
