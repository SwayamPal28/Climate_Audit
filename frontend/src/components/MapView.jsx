// frontend/src/components/MapView.jsx
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';
import axios from 'axios';

export default function MapView() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  useEffect(() => {
    async function loadNodes() {
      // fetch CSV from your Node backend proxy endpoint
      const resp = await axios.get('/api/data/nodes'); // proxy in dev
      const csv = resp.data;
      Papa.parse(csv, {
        header: true,
        dynamicTyping: true,
        complete: results => {
          setNodes(results.data.filter(d => d.latitude && d.longitude));
        }
      });
    }

    async function loadEdges() {
      // fetch edges (similar)
      try {
        const resp = await axios.get('/python-service/data/edges_ready_for_ai.csv'); // if direct
        Papa.parse(resp.data, {
          header: true,
          dynamicTyping: true,
          complete: results => {
            // convert to array of [ [lat,lng], [lat,lng] ]
            const polylines = results.data.map(e => {
              return [
                [parseFloat(e.src_lat), parseFloat(e.src_lon)],
                [parseFloat(e.dst_lat), parseFloat(e.dst_lon)]
              ];
            });
            setEdges(polylines);
          }
        });
      } catch (err) {
        console.warn("edge fetch error", err);
      }
    }

    loadNodes();
    loadEdges();
  }, []);

  // a simple colormap for anomaly: positive (red) negative (blue)
  const getColor = (score) => score > 0 ? 'red' : 'blue';

  return (
    <MapContainer center={[20, 0]} zoom={2} style={{height: '80vh', width: '100%'}}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
      />
      {nodes.map((n, i) => (
        <CircleMarker
          key={i}
          center={[n.latitude, n.longitude]}
          radius={3 + Math.min(Math.abs(n.anomaly_score || 0), 10)}
          pathOptions={{ color: getColor(n.anomaly_score || 0), fillOpacity: 0.6 }}
        >
          <Popup>
            <div>
              <strong>{n.country}</strong><br/>
              GDP: {n.gdp}<br/>
              Anomaly: {n.anomaly_score}
            </div>
          </Popup>
        </CircleMarker>
      ))}
      {edges.map((line, idx) => (
        <Polyline key={idx} positions={line} weight={0.5} opacity={0.2}/>
      ))}
    </MapContainer>
  );
}
