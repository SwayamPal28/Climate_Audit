import React, { useEffect, useState, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';

const GraphVisualization = () => {
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  
  // Color scale for nodes based on GDP
  const colorScale = (gdp) => {
    if (!gdp) return '#666666';
    const logGdp = Math.log10(gdp);
    if (logGdp < 10) return '#E74C3C';  // Red for lower GDP
    if (logGdp < 12) return '#3498DB';   // Blue for medium GDP
    return '#2ECC71';                   // Green for high GDP
  };

  // Color scale for edges based on connection strength
  const linkColor = (link) => {
    // Use a color that stands out against white background
    return link.value > 1000000 ? '#9B59B6' : '#E67E22';  // Purple for strong connections, Orange for weaker ones
  };

  // Handle node hover
  const handleNodeHover = useCallback((node) => {
    // Highlight connected nodes
    if (node) {
      const nodeNeighbors = new Set();
      const links = graphData.links || [];
      
      links.forEach(link => {
        if (link.source === node) nodeNeighbors.add(link.target);
        if (link.target === node) nodeNeighbors.add(link.source);
      });

      return nodeNeighbors;
    }
    return null;
  }, [graphData.links]);

  useEffect(() => {
    setIsLoading(true);
    fetch('http://localhost:8000/api/graph')
      .then(res => res.json())
      .then(data => {
        console.log('Graph data loaded:', data);
        
        // Process the graph data to ensure proper node references
        const processedData = {
          nodes: data.nodes || [],
          links: (data.links || []).map(link => ({
            ...link,
            // Ensure source and target are objects, not just IDs
            source: typeof link.source === 'string' 
              ? data.nodes.find(n => n.id === link.source) || link.source 
              : link.source,
            target: typeof link.target === 'string' 
              ? data.nodes.find(n => n.id === link.target) || link.target 
              : link.target,
            // Add default value if not present
            value: link.value || 1
          })).filter(link => link.source && link.target) // Filter out any invalid links
        };
        
        console.log('Processed graph data:', processedData);
        setGraphData(processedData);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error loading graph data:', err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-white">
        <div className="text-black text-xl">Loading 3D visualization...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-white">
      <button 
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 cursor-pointer"
        style={{ zIndex: 1000 }} 
      >
        ← Back to Audit Table
      </button>

      <div className="absolute top-4 right-4 z-50 bg-white border border-gray-300 text-black p-3 rounded text-sm shadow-lg w-64">
        <div className="font-bold mb-2">🌐 Graph Legend</div>
        <div className="mb-2">
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
            <span>Low GDP</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
            <span>Medium GDP</span>
          </div>
          <div className="flex items-center mb-2">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            <span>High GDP</span>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-2 mt-2">
          <div>🌍 <strong>Countries:</strong> {graphData.nodes?.length || 0}</div>
          <div>🔗 <strong>Connections:</strong> {graphData.links?.length || 0}</div>
          <div className="mt-2 text-xs text-gray-600">
            <p>• Hover over nodes to highlight connections</p>
            <p>• Click and drag to rotate view</p>
            <p>• Scroll to zoom in/out</p>
          </div>
        </div>
      </div>

      <ForceGraph3D
        graphData={graphData}
        nodeLabel={node => 
          `${node.label || 'Unknown'}\n` +
          `GDP: $${(node.gdp_usd || 0).toLocaleString()}\n` +
          `CO2: ${(node.co2_emissions_kt || 0).toLocaleString()} kt`
        }
        nodeVal={node => Math.pow(node.gdp_usd || 1000000000, 1/3) / 50}
        nodeColor={node => colorScale(node.gdp_usd)}
        nodeResolution={20}
        nodeRelSize={8}
        linkColor={linkColor}
        linkWidth={link => Math.min(4, 1 + Math.log10(link.value || 1))}
        linkDirectionalParticles={link => Math.min(5, Math.floor(Math.log10(link.value || 1) * 2))}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.01}
        linkDirectionalParticleColor={() => '#9B59B6'}
        linkDirectionalArrowLength={5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.15}
        linkHoverPrecision={10}
        backgroundColor="#FFFFFF"
        cooldownTicks={100}
        onEngineStop={() => console.log('Graph layout stabilized')}
        enableZoomPanRotate={true}
        showNavInfo={false}
        onNodeHover={handleNodeHover}
        onNodeClick={node => {
          // Center view on clicked node
          if (node) {
            // You can add additional interaction here
            console.log('Node clicked:', node);
          }
        }}
      />
    </div>
  );
};

export default GraphVisualization;