import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ForceGraph3D to avoid SSR issues
const ForceGraph3D = dynamic(
  () => import('react-force-graph-3d').then((mod) => mod.default),
  { ssr: false }
);

const GraphVisualization = () => {
  const containerRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    // Update dimensions on window resize
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: Math.max(600, window.innerHeight - 200)
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    // Fetch graph data
    const fetchGraphData = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/graph');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setGraphData(data);
      } catch (err) {
        console.error("Error fetching graph data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchGraphData();

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  if (loading) {
    return <div className="p-4 text-center">Loading graph data...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error loading graph: {error}
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: '80vh' }} ref={containerRef}>
      {typeof window !== 'undefined' && (
        <ForceGraph3D
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel={node => `
            <div style="background: white; padding: 8px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <strong>${node.label || `Node ${node.id}`}</strong><br/>
              GDP: $${node.gdp_usd?.toLocaleString() || 'N/A'}<br/>
              CO2: ${node.co2_emissions_kt?.toLocaleString() || 'N/A'} kt
            </div>
          `}
          nodeAutoColorBy="gdp_usd"
          nodeVal={node => Math.cbrt(node.gdp_usd || 1) / 20}
          linkColor={() => 'rgba(200, 200, 200, 0.4)'}
          linkWidth={0.5}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.005}
          onNodeClick={node => {
            // Handle node click
            console.log('Node clicked:', node);
          }}
          enableNodeDrag={true}
          enableZoomPanRotate={true}
          showNavInfo={true}
          warmupTicks={100}
          cooldownTicks={0}
        />
      )}
    </div>
  );
};

export default GraphVisualization;