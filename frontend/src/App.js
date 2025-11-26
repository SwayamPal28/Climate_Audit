import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import GraphVisualization from './components/GraphVisualization';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/visualization" element={<GraphVisualization />} />
    </Routes>
  );
}

export default App;