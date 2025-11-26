import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3'; 
import './GraphVisualization.css';

// --- Helper Function to Fetch and Process ISO3 to Name Map ---
// NOTE: This assumes your CSV file 'iso3_to_name_map.csv' is accessible 
// and has columns 'iso3' and 'name'.
// --- Helper Function to Fetch and Process ISO3 to Name Map ---
// NOTE: This assumes your CSV file 'iso3_to_name_map.csv' is accessible 
// and has columns 'iso3' and 'Country Name'.
const fetchCountryNameMap = async () => {
  try {
    // This assumes the file is in the 'public' folder or accessible relative path
    const response = await fetch('/iso3_to_name_map.csv'); 
    if (!response.ok) {
      console.error('Could not find iso3_to_name_map.csv, falling back.');
      // Fallback: Use a small, hardcoded map if the file isn't found
      return { 'USA': 'United States', 'CHN': 'China', 'CAN': 'Canada', 'FRA': 'France', 'KWT': 'Kuwait' };
    }
    const csvText = await response.text();
    const data = d3.csvParse(csvText);
    const map = {};
    data.forEach(row => {
      // FIX: Use the 'name' variable defined on the previous line.
      // This reads 'Country Name' (CSV header) or 'Country_Name' (fallback) or 'name'.
      const countryName = row['Country Name'] || row['Country_Name'] || row['name'];
      
      if (row.iso3 && countryName) {
        map[row.iso3] = countryName;
      }
      // Note: The original 'name' variable in your previous code was causing the confusion.
      // This uses 'countryName' consistently and should compile.
    });
    return map;
  } catch (error) {
    console.error('Error fetching country map:', error);
    // Fallback in case of network or parsing error
    return { 'USA': 'United States', 'CHN': 'China', 'CAN': 'Canada', 'FRA': 'France', 'KWT': 'Kuwait' };
  }
};


const GraphVisualization = () => {
  const navigate = useNavigate();
  const fgRef = useRef();
  
  // State for the graph data to be rendered (will start with NO links)
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  // State to hold ALL links fetched from the API
  const [fullLinks, setFullLinks] = useState([]); 
  
  // State for tracking the node currently being hovered over (used for highlighting)
  const [hoverNode, setHoverNode] = useState(null); 
  
  // State for tracking the link currently being hovered over (used for displaying attributes)
  const [hoverLink, setHoverLink] = useState(null); 
  
  // State to track which links are currently displayed (default: empty array)
  const [visibleLinks, setVisibleLinks] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isoToNameMap, setIsoToNameMap] = useState({});

  // Function to get country name, falling back to iso3 code if not found
  const getCountryName = useCallback((iso3) => isoToNameMap[iso3] || iso3, [isoToNameMap]);

  // --- Load and Process Graph Data ---
// --- Load and Process Graph Data ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 0. Fetch the ISO3 to Name mapping first
        const nameMap = await fetchCountryNameMap();
        setIsoToNameMap(nameMap);

        const response = await fetch('http://localhost:8000/api/graph');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // 1. Process Nodes (Robustly assign ID and ISO3)
        const nodes = (data.nodes || []).map(node => {
          // Attempt to find the ISO code using multiple possible keys
          const iso3 = node.iso3 || node.wb_code || node.id; 
          
          return {
            ...node,
            // CRITICAL FIX: Ensure 'id' is a guaranteed string of the ISO code
            id: String(iso3), 
            iso3: String(iso3), // Explicitly set the ISO3 code
            label: nameMap[iso3] || iso3, // Map ISO3 to Country Name for label
            gdp_usd: Number(node.gdp_usd) || 0,
          }
        // Filter out any invalid or missing codes
        }).filter(node => node.iso3 && node.iso3 !== 'not found' && node.iso3 !== 'undefined'); 

        // 2. Process Links (Robustly map using all possible keys)
        const nodeMap = new Map(nodes.map(node => [node.id, node]));
        
        const links = (data.links || [])
          .map(link => {
            // MOST ROBUST FIX: Attempt to find the source/target ID using multiple keys 
            // from the backend (source_iso3, target_iso3, or source/target for legacy JSON)
            const sourceId = String(link.source_iso3 || link.source || '');
            const targetId = String(link.target_iso3 || link.target || '');

            const sourceObj = nodeMap.get(sourceId);
            const targetObj = nodeMap.get(targetId);
            
            // Only proceed if both nodes were successfully found in our filtered list
            if (!sourceObj || !targetObj) {
                return null;
            }
            
            return { 
              source: sourceObj, 
              target: targetObj, 
              // --- Include all trade/physics data for edge attributes ---
              primaryValue: Number(link.primaryValue) || 0,
              netWgt: Number(link.netWgt) || 0,
              distance_km: Number(link.distance_km) || 0,
              transport_emissions_tCO2: Number(link.transport_emissions_tCO2) || 0,
              // --------------------------------------------------------
              value: 1 
            };
          })
          .filter(Boolean);

        console.log(`Loaded ${nodes.length} nodes and ${links.length} total links`);
        
        // Store all links separately and initialize graph with NO links
        setFullLinks(links); 
        // Set the successfully processed nodes and empty links for visualization
        setGraphData({ nodes, links: [] }); 
        
      } catch (error) {
        console.error('Critical Error loading graph data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []); // Depend on nothing for a single fetch on mount
  // Set initial camera position
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      const timer = setTimeout(() => {
        // Position camera to look at the center of the graph
        fgRef.current.cameraPosition({ z: 800 }, null, 1000); 
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length]);

  // --- Node Click Handler to Load Edges ---
  const handleNodeClick = (node, event) => {
    if (!node) return;
    
    // Clear the link hover state when a node is clicked
    setHoverLink(null);

    // 1. Find all links connected to the clicked node
    const connectedLinks = fullLinks.filter(link => 
      link.source.id === node.id || link.target.id === node.id
    );

    // 2. Combine the new connected links with the already visible links
    const linksMap = new Map();

    // Add existing visible links
    visibleLinks.forEach(link => {
        // Use source and target IDs to ensure link uniqueness
        const linkId = `${link.source.id}-${link.target.id}`; 
        linksMap.set(linkId, link);
    });

    // Add new connected links
    connectedLinks.forEach(link => {
        const linkId = `${link.source.id}-${link.target.id}`;
        linksMap.set(linkId, link);
    });

    const newVisibleLinks = Array.from(linksMap.values());
    
    setVisibleLinks(newVisibleLinks);
    
    // 3. Update the main graphData state for rendering
    setGraphData(prevData => ({
      ...prevData,
      links: newVisibleLinks,
    }));
  };
  // ----------------------------------------------
  
  // --- Link Hover Handler to Show Edge Details ---
  const handleLinkHover = (link) => {
    setHoverLink(link || null);
    
    // Also set node hover if the link is hovered, for visual consistency
    if (link) {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      
      const sourceNode = graphData.nodes.find(n => n.id === sourceId);
      const targetNode = graphData.nodes.find(n => n.id === targetId);
      
      // We'll highlight both source and target nodes when hovering over a link
      setHoverNode({ id: link.source.id, source: sourceNode, target: targetNode, link: link });
    } else {
      setHoverNode(null);
    }
  };
  // ----------------------------------------------


  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading 3D visualization...</div>
      </div>
    );
  }

  // Helper function to format large numbers
  const formatNumber = (num, unit = '') => {
      // Return 0 for non-numeric or missing data
      if (typeof num !== 'number' || isNaN(num)) return 'N/A';
      
      if (Math.abs(num) >= 1.0e+12) {
         return (Math.abs(num) / 1.0e+12).toFixed(2) + " Trillion" + unit;
      }
      if (Math.abs(num) >= 1.0e+9) {
         return (Math.abs(num) / 1.0e+9).toFixed(2) + " Billion" + unit;
      }
      if (Math.abs(num) >= 1.0e+6) {
         return (Math.abs(num) / 1.0e+6).toFixed(2) + " Million" + unit;
      }
      if (Math.abs(num) >= 1.0e+3) {
         return (Math.abs(num) / 1.0e+3).toFixed(2) + "k" + unit;
      }
      return num.toLocaleString();
  }


  return (
    <div className="graph-container">
      <button 
        onClick={() => navigate('/')}
        className="back-button"
      >
        ← Back to Audit Table
      </button>
      
      {/* Button to clear all visible edges */}
      <button 
        onClick={() => {
            setVisibleLinks([]);
            setGraphData(prevData => ({ ...prevData, links: [] }));
            setHoverLink(null);
            setHoverNode(null);
        }}
        className="clear-button"
        style={{ position: 'absolute', top: 16, left: 200, zIndex: 1000, backgroundColor: '#f97316' }}
      >
        Clear Edges
      </button>


      <div className="info-panel">
        <div className="panel-title">🌐 Graph Stats</div>
        <div>🌍 <strong>Countries:</strong> {graphData.nodes?.length || 0}</div>
        <div>🔗 <strong>Total Connections:</strong> {fullLinks.length || 0}</div>
        <div>🔗 <strong>Visible Connections:</strong> {visibleLinks.length || 0}</div>
        <p style={{marginTop: '10px', fontWeight: 'bold'}}>
            💡 Click on a node to see its trade routes.
        </p>
        
        {/* Display Hovered Node Information (only if link is NOT hovered) */}
        {(hoverNode && !hoverLink) && (
            <div style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
                ⭐ <strong>Hovered Node:</strong> {hoverNode.label || 'Unknown'}
                <br/>
                💰 <strong>GDP:</strong> ${formatNumber(hoverNode.gdp_usd, ' USD')}
            </div>
        )}
        
        {/* Display Hovered Link Information */}
        {hoverLink && (
             <div style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
                 🔗 <strong>Route:</strong> {getCountryName(hoverLink.source.iso3)} → {getCountryName(hoverLink.target.iso3)}
                 <br/>
                 💰 <strong>Trade Value:</strong> ${formatNumber(hoverLink.primaryValue, ' USD')}
                 <br/>
                 ⚖️ <strong>Net Weight:</strong> {formatNumber(hoverLink.netWgt, ' kg')}
                 <br/>
                 🚢 <strong>Distance:</strong> {formatNumber(hoverLink.distance_km, ' km')}
                 <br/>
                 🔥 <strong>Est. CO2:</strong> {formatNumber(hoverLink.transport_emissions_tCO2, ' tCO2')}
             </div>
        )}
      </div>

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData} 
        
        onNodeClick={handleNodeClick}
        
        // --- Highlighting Logic for Nodes and Links ---
        onLinkHover={handleLinkHover}
        onNodeHover={node => { 
          // Only update hoverNode state if a link is NOT being hovered
          if (!hoverLink) {
            setHoverNode(node || null);
          }
        }}
        onNodeOut={() => {
          if (!hoverLink) {
            setHoverNode(null);
          }
        }}
        
        linkVisibility={true} 

        // Style the link based on hoverLink state
        linkColor={link => 
          link === hoverLink
            ? '#ff5733' // Link Hover Highlight Color
            : (link.source.id === hoverNode?.id || link.target.id === hoverNode?.id) 
              ? '#ff5733' // Node Hover Highlight Color
              : '#8b5cf6' // Default Color
        } 
        linkWidth={link => 
          link === hoverLink
            ? 3.5 
            : (link.source.id === hoverNode?.id || link.target.id === hoverNode?.id) 
              ? 2 
              : 0.1 // Thinnest default
        } 
        linkOpacity={link => 
          link === hoverLink
            ? 1.0 // Fully opaque on link hover
            : (link.source.id === hoverNode?.id || link.target.id === hoverNode?.id) 
              ? 0.7 
              : 0.2 // Low default opacity
        }
        
        // Style the node based on hoverNode and hoverLink states
        nodeColor={node => {
          // Check if node is part of the currently hovered link
          if (hoverLink && (node.id === hoverLink.source.id || node.id === hoverLink.target.id)) {
            return '#ff5733'; // Highlight for link hover
          }
          // Check if node is the currently hovered node (only simple hover)
          if (hoverNode && !hoverLink && node.id === hoverNode.id) {
            return '#ff5733'; // Highlight for node hover
          }
          
          // Original GDP-based color logic
          const gdp = node.gdp_usd || 0;
          if (gdp > 1e11) return '#10b981';
          if (gdp > 1e9) return '#3b82f6';
          return '#ef4444';
        }}
        
        // --- End Highlighting Logic ---
        
        nodeLabel={node => 
          `Name: ${node.label || 'Unknown'}<br/>` + 
          `ISO3: ${node.iso3 || 'N/A'}<br/>` + 
          `GDP: $${formatNumber(node.gdp_usd, ' USD')}`
        }
        
        nodeVal={0.1} 
        nodeResolution={6} 
        nodeOpacity={0.9}
        
        // --- Performance Optimizations ---
        forceEngine="d3-force-unstable" 
        warmupTicks={50}
        cooldownTicks={0} 
        // --------------------------------
        
        backgroundColor="#ffffff"
        showNavInfo={false}
      />
    </div>
  );
};

export default GraphVisualization;