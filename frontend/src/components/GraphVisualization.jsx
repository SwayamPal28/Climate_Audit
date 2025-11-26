import React, { useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';

const GraphVisualization = () => {
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  useEffect(() => {
    fetch('http://localhost:8000/api/graph')
      .then(res => res.json())
      .then(data => setGraphData(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="relative w-full h-screen bg-black">
      <button 
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 z-50 bg-white text-black px-4 py-2 rounded shadow hover:bg-gray-200 cursor-pointer"
        style={{ zIndex: 1000 }} 
      >
        ← Back to Audit Table
      </button>

      <ForceGraph3D
        graphData={graphData}
        nodeLabel="label"
        // Size nodes by cube root of GDP so they don't get too massive
        nodeVal={node => Math.pow(node.gdp_usd || 0, 1/3) / 50} 
        nodeAutoColorBy="gdp_usd"
        linkColor={() => 'rgba(255,255,255,0.2)'}
        linkWidth={0.5}
        backgroundColor="#000011"
        // Add a small delay to ensure graph stabilizes
        warmupTicks={50}
        cooldownTicks={0}
      />
    </div>
  );
};

export default GraphVisualization;