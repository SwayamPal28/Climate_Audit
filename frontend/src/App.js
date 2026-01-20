import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import GraphVisualization from './components/GraphVisualization';
import PolicyLab from './components/PolicyLab';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/visualization" element={<GraphVisualization />} />
      <Route path="/policy-lab" element={<PolicyLab />} />
    </Routes>
  );
}

export default App;