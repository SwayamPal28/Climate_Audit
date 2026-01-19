import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3'; 
import './GraphVisualization.css';

// --- Helper: Fetch Country Names ---
const fetchCountryNameMap = async () => {
  try {
    const response = await fetch('/iso3_to_name_map.csv'); 
    if (!response.ok) return { 'USA': 'United States', 'CHN': 'China', 'IND': 'India' };
    const csvText = await response.text();
    const data = d3.csvParse(csvText);
    const map = {};
    data.forEach(row => {
      const countryName = row['Country Name'] || row['Country_Name'] || row['name'];
      if (row.iso3 && countryName) map[row.iso3] = countryName;
    });
    return map;
  } catch (error) {
    return { 'USA': 'United States', 'CHN': 'China', 'IND': 'India' };
  }
};

// --- HELPER: Clean Supply Chain Table (FIXED CIRCULAR LOGIC) ---
const SidebarRoleTable = ({ targetNode, links, allLinks, getCountryName }) => {
  if (!targetNode || !links) return null;

  const tradePartners = links.map(link => {
    const isImporting = link.target.id === targetNode.id; 
    const partner = isImporting ? link.source : link.target;
    
    let chainInfo = null;
    let type = isImporting ? 'DIRECT_SUPPLY' : 'DIRECT_BUY';

    // MIDDLEMAN LOGIC (With Loop Prevention)
    if (isImporting) {
        // If partner sells to us, do they buy the SAME sector from someone else?
        const upstreamSource = allLinks
            .filter(l => l.target.id === partner.id && l.sector === link.sector)
            .sort((a,b) => b.primaryValue - a.primaryValue)[0];

        if (upstreamSource && upstreamSource.source.id !== targetNode.id) {
            type = 'MIDDLEMAN_SUPPLY';
            chainInfo = {
                origin: getCountryName(upstreamSource.source.iso3),
                middle: getCountryName(partner.iso3),
                destination: getCountryName(targetNode.iso3)
            };
        }
    } else {
        const downstreamDest = allLinks
            .filter(l => l.source.id === partner.id && l.sector === link.sector)
            .sort((a,b) => b.primaryValue - a.primaryValue)[0];

        if (downstreamDest && downstreamDest.target.id !== targetNode.id) {
            type = 'MIDDLEMAN_BUY';
            chainInfo = {
                origin: getCountryName(targetNode.iso3),
                middle: getCountryName(partner.iso3),
                destination: getCountryName(downstreamDest.target.iso3)
            };
        }
    }

    return {
      id: partner.id,
      name: getCountryName(partner.iso3),
      type: type,
      chain: chainInfo,
      sector: link.sector,
      value: link.primaryValue,
      isRisk: partner.co2 > 80
    };
  });

  const sortedPartners = tradePartners.sort((a, b) => b.value - a.value).slice(0, 15);

  return (
    <div className="role-table-container" style={{ marginTop: '16px', borderTop: '1px solid #dae1e7', paddingTop: '12px' }}>
      <div style={{fontSize: '11px', fontWeight: '700', color: '#7f8c8d', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
        Trade Flow Analysis
      </div>
      
      <div className="role-list" style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        {sortedPartners.map((p, i) => (
          <div key={i} className="role-card" style={{ background: 'white', border: '1px solid #f0f3f8', borderRadius: '6px', padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            
            {/* ROW 1: THE VISUAL PATH */}
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: '500', color: '#2c3e50', marginBottom: '6px' }}>
                
                {/* Scenario A: Middleman Chain */}
                {(p.type === 'MIDDLEMAN_SUPPLY' || p.type === 'MIDDLEMAN_BUY') && p.chain ? (
                    <>
                        <span style={{color: '#95a5a6'}}>{p.chain.origin}</span>
                        <span style={{margin: '0 6px', color: '#b2bec3', fontSize: '10px'}}>▶</span>
                        <span style={{color: '#e67e22', fontWeight: '700'}}>{p.chain.middle}</span> 
                        <span style={{margin: '0 6px', color: '#b2bec3', fontSize: '10px'}}>▶</span>
                        <span style={{color: '#2c3e50'}}>{p.chain.destination}</span>
                    </>
                ) : p.type === 'DIRECT_SUPPLY' ? (
                /* Scenario B: Direct Supply */
                    <>
                        <span style={{color: '#2c3e50', fontWeight: '600'}}>{p.name}</span>
                        <span style={{margin: '0 6px', color: '#27ae60', fontSize: '10px'}}>▶</span> {/* Green Arrow */}
                        <span style={{color: '#7f8c8d'}}>{targetNode.label}</span>
                    </>
                ) : (
                /* Scenario C: Direct Buy */
                    <>
                        <span style={{color: '#7f8c8d'}}>{targetNode.label}</span>
                        <span style={{margin: '0 6px', color: '#2980b9', fontSize: '10px'}}>▶</span> {/* Blue Arrow */}
                        <span style={{color: '#2c3e50', fontWeight: '600'}}>{p.name}</span>
                    </>
                )}
            </div>

            {/* ROW 2: DATA */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f9f9f9', paddingTop: '6px' }}>
                <div style={{ fontSize: '11px', color: '#95a5a6', display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '6px' }}>{p.sector}</span>
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '600', color: '#34495e' }}>
                    ${(p.value / 1e9).toFixed(1)}B
                    {p.isRisk && <span title="High Carbon Risk" style={{marginLeft: '4px', fontSize: '10px'}}>⚠️</span>}
                </div>
            </div>

          </div>
        ))}
        {sortedPartners.length === 0 && <div style={{fontStyle:'italic', color:'#b2bec3', fontSize:'12px', textAlign:'center', padding:'10px'}}>No trade routes active.</div>}
      </div>
    </div>
  );
};

const GraphVisualization = () => {
  const navigate = useNavigate();
  const fgRef = useRef();
  
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [fullLinks, setFullLinks] = useState([]); 
  const [visibleLinks, setVisibleLinks] = useState([]);
  
  const [hoverNode, setHoverNode] = useState(null); 
  const [hoverLink, setHoverLink] = useState(null); 
  
  const [activeSectors, setActiveSectors] = useState({
    steel: true,
    energy: true,
    textiles: true
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isoToNameMap, setIsoToNameMap] = useState({});

  const [selectedNode, setSelectedNode] = useState(null); 
  const [producerRatio, setProducerRatio] = useState(0.6); 
  const [shapleyData, setShapleyData] = useState([]); 
  const [shapleyMeta, setShapleyMeta] = useState(null);
  const [shapleyLoading, setShapleyLoading] = useState(false);
  const [shapleyError, setShapleyError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMessage, setSearchMessage] = useState(null);

  const getCountryName = useCallback((iso3) => isoToNameMap[iso3] || iso3, [isoToNameMap]);

  // --- DATA LOADING ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const nameMap = await fetchCountryNameMap();
        setIsoToNameMap(nameMap);

        const response = await fetch('/api/graph');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        const cleanNodes = (data.nodes || []).map(node => {
          const iso3 = node.iso3 || node.id; 
          return {
            ...node,
            id: String(iso3), 
            iso3: String(iso3), 
            label: nameMap[iso3] || iso3,
            gdp_usd: Number(node.gdp_usd) || 0,
            co2: Number(node.co2) || 0,
            anomaly_score: Number(node.anomaly_score) || 0
          };
        }).filter(node => node.iso3 && node.iso3 !== 'NAN');
        
        const nodeMap = new Map(cleanNodes.map(node => [node.id, node]));
        const links = (data.links || [])
          .map(link => {
            const sourceId = String(link.source_iso3 || link.source || '');
            const targetId = String(link.target_iso3 || link.target || '');
            const sourceObj = nodeMap.get(sourceId);
            const targetObj = nodeMap.get(targetId);
            
            if (!sourceObj || !targetObj) return null;
            const rawValue = Number(link.value) || 0; 

            return { 
              source: sourceObj, 
              target: targetObj, 
              primaryValue: rawValue,
              sector: link.sector || 'General', 
              value: 1
            };
          }).filter(link => link && link.primaryValue > 0); 

        setFullLinks(links); 
        setGraphData({ nodes: cleanNodes, links: [] }); 
        
      } catch (error) {
        console.error('Error loading graph:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- PHYSICS & ZOOM FIX (SPACIOUS LAYOUT) ---
  useEffect(() => {
    const timer = setTimeout(() => {
        if (fgRef.current) {
            const controls = fgRef.current.controls();
            const d3Force = fgRef.current.d3Force;

            // --- SPACIOUS TUNING ---
            // Charge: -2000 pushes nodes far apart (Prevent clumping)
            // Distance: 200 makes edges longer and cleaner
            if (d3Force) {
                d3Force('charge').strength(-2000); 
                d3Force('link').distance(200);    
                fgRef.current.d3ReheatSimulation(); // Force re-sim
            }

            if (controls) {
                controls.minDistance = 0; 
                controls.maxDistance = 10000;
                controls.zoomSpeed = 2.5; 
                controls.enableDamping = true;
                controls.dampingFactor = 0.1;
            }
        }
    }, 200);
    return () => clearTimeout(timer);
  }, [graphData]); 

  // Initial Camera
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      setTimeout(() => { fgRef.current.cameraPosition({ z: 1200 }, null, 1000); }, 500);
    }
  }, [graphData.nodes.length]);

  // --- Helpers ---
  const isLinkVisible = (link) => {
      const s = (link.sector || '').toLowerCase();
      if (s.includes('steel') && !activeSectors.steel) return false;
      if (s.includes('energy') && !activeSectors.energy) return false;
      if (s.includes('textile') && !activeSectors.textiles) return false;
      return true;
  };

  const formatNumber = (num, unit = '') => {
      if (typeof num !== 'number' || isNaN(num) || num === 0) return 'Trace'; 
      if (Math.abs(num) >= 1.0e+9) return (Math.abs(num) / 1.0e+9).toFixed(2) + "B" + unit;
      if (Math.abs(num) >= 1.0e+6) return (Math.abs(num) / 1.0e+6).toFixed(2) + "M" + unit;
      return num.toLocaleString(undefined, { maximumFractionDigits: 0 }) + unit;
  }

  const getSectorColor = (sector) => {
      const s = String(sector || '').toLowerCase();
      if (s.includes('steel')) return '#334155';
      if (s.includes('energy')) return '#f43f5e';
      if (s.includes('textile')) return '#3b82f6';
      return '#64748b';
  };

  // --- Backend Logic ---
  const fetchShapley = useCallback(async (node, ratio) => {
    if (!node) return;
    setShapleyLoading(true);
    setShapleyError(null);
    try {
        const resp = await fetch('/api/calculate/shapley', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_country: String(node.id).toUpperCase(), producer_ratio: Number(ratio) })
        });
        if (!resp.ok) throw new Error("API Error");
        const data = await resp.json();
        
        const alloc = data?.allocations || {};
        const meta = data?.meta || null;
        
        const arr = Object.entries(alloc).map(([k, v]) => ({
            name: k, pct: Number(v), abs: meta?.total_emissions_tCO2 ? (Number(v)/100)*meta.total_emissions_tCO2 : null
        })).sort((a,b) => b.pct - a.pct);

        setShapleyData(arr);
        setShapleyMeta(meta);
    } catch (err) {
        setShapleyError('Data unavailable.');
    } finally {
        setShapleyLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedNode) fetchShapley(selectedNode, producerRatio); }, [selectedNode, producerRatio, fetchShapley]);

  const handleLinkHover = (link) => {
    setHoverLink(link || null);
    if (link) setHoverNode({ id: link.source.id, source: link.source, target: link.target, link: link });
    else setHoverNode(null);
  };

  const handleNodeClick = (node) => {
    if (!node) return;
    setHoverLink(null);

    const connectedLinks = fullLinks.filter(link => 
      link.source.id === node.id || link.target.id === node.id
    );

    const combinedLinks = [...visibleLinks, ...connectedLinks];
    const uniqueLinks = Array.from(new Map(combinedLinks.map(link => [link.source.id + "-" + link.target.id, link])).values());
    
    setVisibleLinks(uniqueLinks);
    setGraphData(prev => ({ ...prev, links: uniqueLinks }));
    setSelectedNode(node);
    
    if (fgRef.current) {
        const distRatio = 1 + 300/Math.hypot(node.x, node.y, node.z);
        fgRef.current.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          2000
        );
    }
  };

  const handleSearch = () => {
    setSearchMessage(null);
    const q = searchQuery.trim().toUpperCase();
    if(!q) return;
    let node = graphData.nodes.find(n => n.id === q || n.iso3 === q);
    if (!node) node = graphData.nodes.find(n => n.label.toUpperCase().includes(q));
    
    if (node) {
      setHoverNode(node);
      handleNodeClick(node);
      setSearchMessage(`Found: ${node.label}`);
    } else {
        setSearchMessage("Not Found");
    }
  };

  if (isLoading) return <div className="loading-container">Loading ClimaAuditX...</div>;

  return (
    <div className="graph-container">

      {/* Top Left: Navigation */}
      <div className="floating-actions">
        <button onClick={() => navigate('/')} className="action-btn back-btn">
          <span>←</span> Back to Dashboard
        </button>
        <button
          onClick={() => {
            setVisibleLinks([]);
            setGraphData(prev => ({ ...prev, links: [] }));
            setHoverLink(null);
            setHoverNode(null);
            setSelectedNode(null);
            setShapleyData([]);
            setSearchQuery('');
            setSearchMessage(null);
          }}
          className="action-btn clear-btn"
        >
          <span>✕</span> Reset View
        </button>
      </div>

      {/* Top Center: Search */}
      <div className="search-bar-container">
        <input
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          placeholder="Search countries by name or ISO..."
        />
        <button onClick={handleSearch} className="search-btn">SEARCH</button>
      </div>

      {/* Right Sidebar: Controls & Analysis */}
      <div className="info-panel">
        <div className="panel-title">Audit Controls</div>

        <div className="sector-filters">
          {['steel', 'energy', 'textiles'].map(sector => (
            <button
              key={sector}
              className="sector-btn"
              onClick={() => setActiveSectors(p => ({ ...p, [sector]: !p[sector] }))}
              style={{
                backgroundColor: activeSectors[sector] ? getSectorColor(sector) : '#fff',
                color: activeSectors[sector] ? 'white' : '#64748b',
                borderColor: activeSectors[sector] ? getSectorColor(sector) : '#e2e8f0'
              }}
            >
              {sector}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 15, display: 'flex', justifyContent: 'space-between' }}>
          <span>LIVE NETWORK</span>
          <span>{graphData.nodes.length} Nodes • {visibleLinks.filter(isLinkVisible).length} Links</span>
        </div>

        {selectedNode ? (
          <div className="selection-area">
            <div className="data-card" style={{ borderLeft: `4px solid ${selectedNode.co2 > 80 ? '#6366f1' : '#10b981'}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Selected Entity</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{selectedNode.label}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
                Risk Index: <strong style={{ color: '#1e293b' }}>{selectedNode.co2.toFixed(1)}</strong>
              </div>
            </div>

            <div className="data-card">
              <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '12px' }}>Responsibility Allocation</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '8px' }}>
                <span>CONSUMER</span>
                <span>PRODUCER: {Math.round(producerRatio * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.1"
                value={producerRatio}
                onChange={(e) => setProducerRatio(e.target.value)}
                style={{ width: '100%', accentColor: '#6366f1' }}
              />
            </div>

            <div className="data-card">
              {shapleyLoading && <div style={{ fontSize: 12, fontStyle: 'italic', color: '#64748b' }}>Calculating...</div>}
              {shapleyError && <div style={{ color: '#dc2626', fontSize: 12 }}>Error: {shapleyError}</div>}
              {!shapleyLoading && !shapleyError && shapleyData.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748b' }}>Allocation data will appear here after selection.</div>
              )}
              {!shapleyLoading && shapleyData.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10 }}>Shapley Allocation</div>
                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                    {shapleyData.map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#1e293b' }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span style={{ fontFamily: 'monospace' }}>{s.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  {shapleyMeta && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 10 }}>
                      Total Est: {formatNumber(shapleyMeta.grand_total_tCO2)} tCO2
                    </div>
                  )}
                </>
              )}
            </div>

            <SidebarRoleTable
              targetNode={selectedNode}
              links={visibleLinks.filter(l => l.source.id === selectedNode.id || l.target.id === selectedNode.id)}
              allLinks={fullLinks}
              getCountryName={getCountryName}
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: '14px', border: '2px dashed #e2e8f0', borderRadius: '14px' }}>
            Select a node on the graph to begin deep-audit analysis.
          </div>
        )}
      </div>

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData} 
        onNodeClick={handleNodeClick}

        backgroundColor="rgba(0,0,0,0)" 
        
        width={window.innerWidth}
        height={window.innerHeight}
        
        // --- THIS IS THE FIX: SIZE 2.5 (Goldilocks Zone) ---
        nodeVal={node => Math.max(2.5, Math.sqrt(node.gdp_usd) / 7000)} 
        
        nodeColor={node => {
          if (hoverNode && node.id === hoverNode.id) return '#00cec9'; 
          return node.co2 > 80 ? '#6c5ce7' : '#00cec9'; 
        }}
        
        nodeLabel={node => `${node.label}: Risk ${node.co2.toFixed(1)}`}
        nodeResolution={24} 
        nodeOpacity={0.9}

        linkVisibility={link => isLinkVisible(link)}
        
        linkColor={link => {
          if (link === hoverLink) return '#00cec9';
          const s = (link.sector || '').toLowerCase();
          if (s.includes('steel')) return '#2c3e50';   
          if (s.includes('energy')) return '#a29bfe';  
          if (s.includes('textile')) return '#74b9ff'; 
          return '#b2bec3'; 
        }} 
        
        linkWidth={link => {
            if (link === hoverLink) return 3;
            const val = link.primaryValue || 0;
            return Math.max(1.5, Math.sqrt(val) / 20000); 
        }}
        
        onLinkHover={handleLinkHover}
        onNodeHover={node => !hoverLink && setHoverNode(node || null)}
        showNavInfo={false}
        forceEngine="d3"
        warmupTicks={200} // Increased warmup for better spacing
        cooldownTicks={0}
      />
    </div>
  );
};

export default GraphVisualization;