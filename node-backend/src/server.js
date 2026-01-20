require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PY_HOST = process.env.PY_HOST || "http://localhost:8000"; // Python service

// --- Health check ---
app.get('/health', (req, res) => {
  res.send("OK");
});

// --- Root route for sanity ---
app.get('/', (req, res) => {
  res.send("Node backend running. Visit /health for status.");
});

// --- Forward anomalies call to Python ---
app.get('/api/audit/anomalies', async (req, res) => {
  try {
    const resp = await axios.get(`${PY_HOST}/api/audit/anomalies`);
    res.json(resp.data);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({error: 'Python service error'});
  }
});

// --- CSV nodes endpoint ---
app.get('/api/data/nodes', async (req, res) => {
  try {
    const resp = await axios.get(`${PY_HOST}/api/data/nodes`, { responseType: 'stream' });
    res.setHeader('Content-Type', 'text/csv');
    resp.data.pipe(res);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("error");
  }
});

// --- Shapley calculation proxy ---
app.post('/api/calculate/shapley', async (req, res) => {
  try {
    const pythonResp = await axios.post(`${PY_HOST}/api/calculate/shapley`, req.body, { timeout: 120000 });
    res.json(pythonResp.data);
  } catch (err) {
    console.error('HTTP shapley error', err.message);
    res.status(500).json({error: 'Shapley calculation failed'});
  }
});

// --- Policy simulation proxy ---
app.post('/api/simulate/policy', async (req, res) => {
  try {
    const pythonResp = await axios.post(`${PY_HOST}/api/simulate/policy`, req.body, { timeout: 120000 });
    res.json(pythonResp.data);
  } catch (err) {
    console.error('HTTP policy simulation error', err.message);
    res.status(500).json({error: 'Policy simulation failed: ' + err.message});
  }
});

// --- Graph data proxy (for consistency) ---
app.get('/api/graph', async (req, res) => {
  try {
    const pythonResp = await axios.get(`${PY_HOST}/api/graph`);
    res.json(pythonResp.data);
  } catch (err) {
    console.error('HTTP graph error', err.message);
    res.status(500).json({error: 'Graph data fetch failed'});
  }
});

// --- Serve React in production (optional) ---
// Uncomment if you want Node to serve React build
/*
const buildPath = path.join(__dirname, '../../react-frontend/build');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});
*/

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Node API listening on ${PORT}`));
