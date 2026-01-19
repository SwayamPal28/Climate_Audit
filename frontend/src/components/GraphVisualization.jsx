import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import './GraphVisualization.css';

// --- Helper: Data Fetching ---
const fetchCountryNameMap = async () => {
  try {
    const response = await fetch('/iso3_to_name_map.csv');
    if (!response.ok) return { 'USA': 'United States', 'CHN': 'China' };
    const csvText = await response.text();
    const data = d3.csvParse(csvText);
    const map = {};
    data.forEach(row => {
      const countryName = row['Country Name'] || row['name'];
      if (row.iso3 && countryName) map[row.iso3] = countryName;
    });
    return map;
  } catch (error) {
    return { 'USA': 'United States', 'CHN': 'China' };
  }
};

const ArrowIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

// --- Sub-Component: Integrated Audit Table ---
const SidebarRoleTable = ({ targetNode, links, allLinks, getCountryName, producerRatio }) => {
  if (!targetNode || !links || links.length === 0) return null;

  const tradePartners = links.map(link => {
    const sId = typeof link.source === 'object' ? link.source.id : link.source;
    const tId = typeof link.target === 'object' ? link.target.id : link.target;
    const isImporting = tId === targetNode.id;
    const partnerId = isImporting ? sId : tId;
    
    // Middleman Logic
    let chainInfo = null;
    let type = isImporting ? 'DIRECT_SUPPLY' : 'DIRECT_BUY';

    if (isImporting) {
        // Find if the partner is getting this from someone else
        const upstream = allLinks.find(l => (l.target.id || l.target) === partnerId && l.sector === link.sector);
        if (upstream && (upstream.source.id || upstream.source) !== targetNode.id) {
            type = 'MIDDLEMAN';
            chainInfo = {
                origin: getCountryName(upstream.source.id || upstream.source),
                middle: getCountryName(partnerId),
                dest: targetNode.label
            };
        }
    }

    const assignedBurden = isImporting 
        ? (link.primaryValue * (1 - (producerRatio / 100))) 
        : (link.primaryValue * (producerRatio / 100));

    return { id: partnerId, name: getCountryName(partnerId), type, chain: chainInfo, sector: link.sector, value: link.primaryValue, burden: assignedBurden };
  });

  return (
    <div className="role-table-container">
      <div className="role-table-header">Shapley Allocation & Supply Chain</div>
      <div className="role-list">
        {tradePartners.sort((a, b) => b.burden - a.burden).map((p, i) => (
          <div key={i} className="role-card">
            <div className="role-card-path">
                {p.type === 'MIDDLEMAN' ? (
                    <><span className="origin-text">{p.chain.origin}</span><ArrowIcon /><span className="middleman-text">{p.chain.middle}</span><ArrowIcon /><span>{p.chain.dest}</span></>
                ) : (
                    <><span>{p.type === 'DIRECT_SUPPLY' ? p.name : targetNode.label}</span><span className={`arrow ${p.type === 'DIRECT_SUPPLY' ? 'supply' : 'buy'}`}><ArrowIcon /></span><span>{p.type === 'DIRECT_SUPPLY' ? targetNode.label : p.name}</span></>
                )}
            </div>
            <div className="role-card-data">
              <span className={`sector-badge ${p.sector.toLowerCase()}`}>{p.sector}</span>
              <div className="burden-display">
                <span className="value">${(p.value / 1e9).toFixed(2)}B</span>
                <span className="assigned-label">Assigned: ${(p.burden / 1e9).toFixed(2)}B</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ShapleyPane = ({ node, links, allLinks, getCountryName, producerRatio, setProducerRatio }) => {
  const totalAssigned = useMemo(() => {
    if (!links) return 0;
    return links.reduce((acc, link) => {
        const isProd = (link.source.id || link.source) === node.id;
        return acc + (isProd ? (link.primaryValue * (producerRatio/100)) : (link.primaryValue * (1 - producerRatio/100)));
    }, 0);
  }, [links, node.id, producerRatio]);

  return (
    <div className="data-card">
      <div className="shapley-summary-header">
        <h4>{node.label} Audit</h4>
        <div className="total-burden-badge">Total Assigned: ${(totalAssigned / 1e9).toFixed(2)}B</div>
      </div>
      <div className="slider-container">
        <label>Producer Responsibility Index</label>
        <input type="range" min="0" max="100" value={producerRatio} onChange={(e) => setProducerRatio(e.target.value)} />
        <div className="slider-labels"><span>Consumer Pay</span><strong>{producerRatio}% Producer Burden</strong></div>
      </div>
      <SidebarRoleTable targetNode={node} links={links} allLinks={allLinks} getCountryName={getCountryName} producerRatio={producerRatio} />
    </div>
  );
};

// --- Main Visualization Component ---
const GraphVisualization = () => {
  const navigate = useNavigate();
  const fgRef = useRef();

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [fullLinks, setFullLinks] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [viewMode, setViewMode] = useState('responsibility'); 
  const [producerRatio, setProducerRatio] = useState(60);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isoToNameMap, setIsoToNameMap] = useState({});

  const getCountryName = useCallback((iso3) => isoToNameMap[iso3] || iso3, [isoToNameMap]);

  const visibleLinks = useMemo(() => {
    if (!selectedNode) return [];
    return fullLinks.filter(l => (l.source.id || l.source) === selectedNode.id || (l.target.id || l.target) === selectedNode.id);
  }, [selectedNode, fullLinks]);

  // Physics stabilization
  useEffect(() => {
    if (fgRef.current && !isLoading) {
      fgRef.current.d3Force('charge').strength(-150);
      fgRef.current.d3Force('link').distance(150);
    }
  }, [isLoading]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const nameMap = await fetchCountryNameMap();
        setIsoToNameMap(nameMap);
        const response = await fetch('http://localhost:8000/api/graph');
        const data = await response.json();
        const cleanNodes = (data.nodes || []).map(node => ({
          ...node, id: String(node.iso3 || node.id),
          label: nameMap[node.iso3 || node.id] || node.iso3,
          gdp_usd: Number(node.gdp_usd) || 0,
        })).filter(n => n.id && n.id !== 'NAN');
        const links = (data.links || []).map(link => ({
          source: String(link.source_iso3 || link.source),
          target: String(link.target_iso3 || link.target),
          primaryValue: Number(link.value) || 0, sector: link.sector || 'General'
        }));
        setFullLinks(links);
        setGraphData({ nodes: cleanNodes, links: [] });
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    fetchData();
  }, []);

  const handleNodeClick = useCallback((node) => {
    if (!node) return;
    setSelectedNode(node);
    if (fgRef.current) {
        const distRatio = 1 + 200 / Math.hypot(node.x, node.y, node.z);
        fgRef.current.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, node, 1000);
    }
  }, []);

  // Intensity Logic: Define node size based on viewMode
  const getNodeVal = useCallback((node) => {
    if (viewMode === 'intensity' && selectedNode) {
        const conn = visibleLinks.find(l => (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id);
        if (conn) {
            const isProd = (conn.source.id || conn.source) === node.id;
            const burden = isProd ? (conn.primaryValue * (producerRatio / 100)) : (conn.primaryValue * (1 - (producerRatio / 100)));
            return Math.max(8, Math.sqrt(burden) / 1500); // Visual amplification for Intensity mode
        }
    }
    return Math.max(3, Math.sqrt(node.gdp_usd || 0) / 5000);
  }, [viewMode, selectedNode, visibleLinks, producerRatio]);

  if (isLoading) return <div className="loading-container">Loading ClimaAuditX...</div>;

  return (
    <div className="graph-container">
      <div className="search-bar-container">
        <input className="search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search ISO (e.g. USA)..." />
        <button onClick={() => handleNodeClick(graphData.nodes.find(n => n.id === searchQuery.toUpperCase()))} className="search-btn">SEARCH</button>
      </div>

      <div className="action-buttons-container">
        <button onClick={() => navigate('/')} className="action-btn">Back</button>
        <button onClick={() => setSelectedNode(null)} className="action-btn">Clear View</button>
      </div>

      <div className="info-panel glass-morphism">
        <div className="audit-lens-toggle">
          <button className={`toggle-btn ${viewMode === 'responsibility' ? 'active' : ''}`} onClick={() => setViewMode('responsibility')}>Responsibility</button>
          <button className={`toggle-btn ${viewMode === 'intensity' ? 'active' : ''}`} onClick={() => setViewMode('intensity')}>Intensity</button>
        </div>
        {selectedNode && <ShapleyPane node={selectedNode} links={visibleLinks} allLinks={fullLinks} getCountryName={getCountryName} producerRatio={producerRatio} setProducerRatio={setProducerRatio} />}
      </div>

      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes: graphData.nodes, links: visibleLinks }}
        backgroundColor="#f0f3f8"
        nodeColor={(node) => {
          if (!selectedNode) return '#00cec9';
          return node.id === selectedNode.id ? '#e67e22' : (visibleLinks.some(l => (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id) ? '#6c5ce7' : 'rgba(200, 200, 200, 0.1)');
        }}
        nodeVal={getNodeVal}
        linkWidth={1.5}
        linkDirectionalParticles={selectedNode ? 4 : 0}
        cooldownTicks={100}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
};

export default GraphVisualization;