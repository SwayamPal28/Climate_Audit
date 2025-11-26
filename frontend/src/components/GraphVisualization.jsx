import React, { useEffect, useState, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import './GraphVisualization.css';

const GraphVisualization = () => {
  const navigate = useNavigate();
  const fgRef = useRef();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);

  // Load graph data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/graph');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Process nodes
        const nodes = (data.nodes || []).map(node => ({
          ...node,
          id: String(node.id || node.iso3 || node.wb_code || Math.random().toString(36).substr(2, 9)),
          gdp_usd: Number(node.gdp_usd) || 0,
        }));

        // Process links
        const nodeMap = new Map(nodes.map(node => [node.id, node]));
        const links = (data.links || [])
          .map(link => {
            const source = typeof link.source === 'string' ? nodeMap.get(link.source) : link.source;
            const target = typeof link.target === 'string' ? nodeMap.get(link.target) : link.target;
            return source && target ? { 
              source: source.id, 
              target: target.id, 
              value: 1 
            } : null;
          })
          .filter(Boolean);

        console.log(`Loaded ${nodes.length} nodes and ${links.length} links`);
        setGraphData({ nodes, links });
      } catch (error) {
        console.error('Error loading graph data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Set initial camera position
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      const timer = setTimeout(() => {
        fgRef.current.zoomToFit(1000, 50);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading 3D visualization...</div>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <button 
        onClick={() => navigate('/')}
        className="back-button"
      >
        ← Back to Audit Table
      </button>

      <div className="info-panel">
        <div className="panel-title">🌐 Graph Stats</div>
        <div>🌍 <strong>Countries:</strong> {graphData.nodes?.length || 0}</div>
        <div>🔗 <strong>Connections:</strong> {graphData.links?.length || 0}</div>
      </div>

      <div className="debug-info">
        <div>Nodes: {graphData.nodes?.length || 0}</div>
        <div>Links: {graphData.links?.length || 0}</div>
      </div>

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeLabel={node => node.label || 'Unknown'}
        nodeColor={node => {
          const gdp = node.gdp_usd || 0;
          if (gdp > 1e11) return '#10b981';  // Green for high GDP
          if (gdp > 1e9) return '#3b82f6';   // Blue for medium GDP
          return '#ef4444';                  // Red for low GDP
        }}
        nodeVal={1}
        nodeResolution={8}
        nodeOpacity={0.9}
        linkColor={'#8b5cf6'}
        linkWidth={0.5}
        linkOpacity={0.3}
        linkCurvature={0.1}
        backgroundColor="#ffffff"
        showNavInfo={false}
        warmupTicks={100}
        cooldownTicks={0}
      />
    </div>
  );
};

export default GraphVisualization;