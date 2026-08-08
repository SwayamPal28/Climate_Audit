# ClimaAuditX ML Deep Dive

## 1. Purpose

This document explains the machine learning and AI components used by the ClimaAuditX backend. It covers graph model architecture, data engineering, inference paths, attribution logic, simulation engines, and the LLM analyst.

This file is focused on the Python backend under `python-services/`.

---

## 2. ML Architecture Overview

### 2.1 Key ML/AI modules

- `python-services/models/hetero_gnn.py`
  - Defines the main graph neural network architecture.
- `python-services/app/main.py`
  - Bootstraps the backend, loads graph data and model, and exposes inference endpoints.
- `python-services/services/data_engine.py`
  - Loads and processes trade network data used for graph construction and simulation.
- `python-services/app/shared_responsibility.py`
  - Implements a heuristic shared-responsibility attribution engine.
- `python-services/app/policy_simulator.py`
  - Simulates policy scenarios (`CBAM`, `TECH_TRANSFER`, `FAIRNESS_DIAL`).
- `python-services/app/advanced_policy_engine.py`
  - Optimizes bilateral policies with Pareto analysis and upstream/downstream impact modeling.
- `python-services/app/llm_analyst.py`
  - Wraps Google Gemini LLM calls and provides rule-based fallback analysis.

### 2.2 System flow

1. `main.py` initializes `DataEngine`, loads graph data into PyTorch Geometric `HeteroData`, and loads the pretrained GNN from `models/climaaudit_model.pt`.
2. The GNN predicts country-level `energy_intensity` values from country features and heterogeneous trade edges.
3. Prediction outputs feed audit endpoints, anomaly detection, and shared-responsibility attribution.
4. `PolicySimulator` and `AdvancedPolicyEngine` support policy scenario modeling using rule-based/econometric logic, not learned neural policies.
5. `LLMAnalystEngine` enriches outputs with natural language insights from Gemini or fallback text when the API key is unavailable.

---

## 3. Graph Model Data Pipeline

### 3.1 Data sources

The model uses data from `python-services/data/`:

- `nodes_final.csv`
  - Country-level nodes.
  - Required fields include `iso3`, `gdp`, `mva`, and `energy_intensity`.
- `processed_{sector}_{flow}.csv` for sectors:
  - `agriculture`, `aircraft`, `cement`, `chemicals`, `electronics`, `energy`, `iron_articles`, `precious_metals`, `ships`, `steel`, `textiles`, `vehicles`, `wood`
  - Each sector includes both `direct` and `reexport` flows.

### 3.2 Graph construction in `main.py`

- `nodes_final.csv` is loaded into `nodes_df_v2`.
- Country ISO3 codes are normalized and mapped to node indices in `iso_to_idx`.
- Node features are built from:
  - `gdp`
  - `mva`
- Features are normalized by mean and standard deviation.
- The target output label is:
  - `energy_intensity`
- The graph uses PyTorch Geometric heterogeneous data:
  - Node type: `country`
  - Edge types: `country -> (sector_flow) -> country`
  - Example edge type names: `steel_direct`, `energy_reexport`

### 3.3 Edge loading logic

For each sector and flow combination, the backend:

- Loads `processed_{sector}_{flow}.csv`.
- Filters edges where both `src_iso` and `tgt_iso` exist in `iso_to_idx`.
- Converts source and target ISO codes to node indices.
- Stores edge indices as `torch.LongTensor([src, dst])` in `data['country', edge_type, 'country'].edge_index`.

This creates a heterogeneous graph where every trade relation is encoded as a distinct edge type.

---

## 4. GNN Model: `ClimaAuditGNN`

Location: `python-services/models/hetero_gnn.py`

### 4.1 Architecture

The model is a two-layer heterogeneous graph neural network with a final linear readout:

- `HeteroConv` layer #1
  - One `GATv2Conv` per edge type
  - Input channels: inferred from node features
  - Output channels: `hidden_dim`
  - `heads=2`
  - `aggr='sum'`
- ReLU activation after first convolution
- `HeteroConv` layer #2
  - One `GATv2Conv` per edge type
  - Input channels: `hidden_dim * 2` (because first layer outputs 2 heads)
  - Output channels: `hidden_dim`
  - `heads=1`
- ReLU activation after second convolution
- Final `Linear(hidden_dim, out_dim)` projection
  - Returns predictions for `x_dict['country']`

### 4.2 Input / output

- Input:
  - `x_dict`: dictionary with node feature tensors keyed by node type, here `country`.
  - `edge_index_dict`: dictionary of edge index tensors keyed by edge type tuples.
- Output:
  - A tensor of shape `[num_countries, out_dim]`
  - In this project, `out_dim=1` to predict energy intensity per country.

### 4.3 Model loading

- `main.py` instantiates the model using the graph metadata:
  - `ClimaAuditGNN(hidden_dim=64, out_dim=1, metadata=data.metadata())`
- Loads weights from `python-services/models/climaaudit_model.pt`
- Calls `model.eval()` for inference mode.

### 4.4 What is learned?

The model is trained to predict a country-level energy intensity value from:

- country macro features (`gdp`, `mva`)
- heterogeneous trade network structure across sectors and flow types

It implicitly learns how trade exposure correlates with likely energy intensity relative to reported values.

---

## 5. Inference and Audit Logic

### 5.1 `get_top_anomalies`

Location: `python-services/app/main.py`

- Runs model inference over all country nodes.
- Compares predicted `energy_intensity` with reported `energy_intensity`.
- Computes anomaly score as:
  - `predicted - reported`
- Positive score signals a country may appear cleaner than model expectations.
- Returns top positive and negative anomalies.

Fallback if model inference fails:

- Uses a heuristic comparison against `GLOBAL_AVG_EMISSION_INTENSITY`.
- The same endpoint stays compatible with the existing dashboard.

### 5.2 `get_audit`

- Accepts a single `country_code`.
- Uses the GNN to predict that country’s energy intensity.
- Compares reported vs predicted values.
- Computes deviation percentage and greenwashing-style audit status.

### 5.3 `get_shapley`

- Uses the model output to perform a leave-one-out-style attribution.
- Estimates how much each partner contributes to the target country’s prediction.
- This is a model-based attribution endpoint, not a full game-theoretic Shapley algorithm.
- It still requires the GNN and graph data.

### 5.4 Fallback behavior

If `model` or `data` are unavailable, the backend gracefully uses heuristic fallback rules for anomaly and audit reporting.

---

## 6. Attribution and Shared Responsibility

### 6.1 `SharedResponsibilityEngine`

File: `python-services/app/shared_responsibility.py`

This component defines a heuristic shared-responsibility attribution scheme:

- It is NOT a full Shapley value calculation.
- It uses a `producer_ratio` parameter to split emissions.
- Steps:
  1. Identify country self-production emissions from available CO2 columns.
  2. Retain `producer_ratio` of the producer’s emissions.
  3. Allocate the remaining emissions (`1 - producer_ratio`) to export partners by export volume.
  4. Add import transport emissions to the producer’s own responsibility.
  5. Compute percentage allocations and metadata totals.

### 6.2 Why this matters

This heuristic supports the project’s “fairness dial” concept and the policy scenario engine, while keeping the attribution calculation simple and transparent.

---

## 7. Policy Simulation Engines

The project includes two main policy simulation paths: rule-based policy damage modeling and advanced bilateral optimization.

### 7.1 `PolicySimulator`

File: `python-services/app/policy_simulator.py`

Supported simulation types:

- `CBAM`
  - Simulates Carbon Border Adjustment Mechanisms.
  - Reduces trade volume to EU countries for targeted sectors.
  - Uses an elasticity map to model demand sensitivity.
  - Includes iterative convergence to approximate second-order feedback effects.
- `TECH_TRANSFER`
  - Simulates emissions intensity reductions in developing nations.
  - Lowers target country intensities by a severity factor.
- `FAIRNESS_DIAL`
  - Adjusts carbon attribution mode between `producer`, `consumer`, or `shapley`.

Key points:

- It is mostly rule-based and descriptive, not a trained ML model.
- It uses data engine outputs and the original edge/node tables.
- It preserves the original data while simulating changes on copies.

### 7.2 `AdvancedPolicyEngine`

File: `python-services/app/advanced_policy_engine.py`

This engine is designed for bilateral policy optimization and impact analysis.

Capabilities:

- `generate_optimal_bilateral_policy`
  - Finds optimal tax/tariff rate for a specific source-target trade route.
  - Uses a simple price elasticity demand model.
  - Estimates carbon saved, economic loss, and trade retention.
  - Builds a Pareto-style curve across tested tax rates.
- `_calculate_upstream_shock`
  - Estimates how reduced trade volume affects upstream suppliers.
- `_calculate_downstream_effect`
  - Estimates how importers experience impact from policy changes.
- `simulate_custom_split`
  - Applies a flexible producer/consumer split to trade carbon responsibility.
  - Uses a fixed carbon price estimate of `$50/ton CO2` for cost changes.

Algorithmic assumptions:

- Baseline carbon is approximated by `primaryValue * 0.001` if no explicit carbon intensity exists.
- Elasticity values are used to model quantity response to price changes.
- Economic constraints are enforced by `max_gdp_loss_pct`.

### 7.3 What is not ML here?

- These engines are built with economic heuristics, not learned weights.
- They support policy experimentation and explainability alongside the GNN’s anomaly and audit predictions.

---

## 8. LLM Analysis and Explainability

File: `python-services/app/llm_analyst.py`

### 8.1 Purpose

Provides a natural-language analytical layer over simulation results and attribution data.

### 8.2 Gemini integration

- Uses `google.genai` to call Gemini models.
- Default model name: `models/gemini-2.0-flash`.
- Reads API key from `GEMINI_API_KEY` in environment variables.
- If the key is missing or invalid, the engine falls back to rule-based analysis.

### 8.3 Supported analysis types

- Policy simulation analysis (`analyze_policy_simulation`)
- Shapley attribution explanation (`analyze_shapley_attribution`)
- Diplomatic turn analysis (`analyze_diplomatic_turn`)
- Bilateral optimization explanation (`analyze_bilateral_optimization`)
- Graph anomaly analysis (`analyze_graph_anomalies`)
- Conversation-style chat (`chat`)

### 8.4 Prompt design

Each analysis method builds a structured prompt with:

- simulation context
- key metrics
- analysis objectives
- desired response sections such as Executive Summary, Key Findings, Tradeoffs, Recommendation

The engine then parses the returned text into structured fields when possible.

### 8.5 Fallback mode

When the Gemini API is unavailable, the engine returns a deterministic rule-based response that still provides:

- executive summary
- issue description
- explanation of limitations
- guidance to configure the API key

---

## 9. Backend API Connections to ML

The following endpoints in `main.py` connect the ML and AI pieces to the frontend:

- `GET /api/countries`
- `GET /api/audit/anomalies`
- `GET /api/audit/{country_code}`
- `GET /api/shapley/{country_code}`
- `POST /api/simulate/policy`
- `POST /api/optimize/bilateral-policy`
- `POST /api/simulate/custom-attribution`
- `POST /api/llm/analyze-policy`
- `POST /api/llm/analyze-shapley`
- `POST /api/llm/analyze-diplomatic`
- `POST /api/llm/analyze-bilateral`
- `POST /api/llm/analyze-anomalies`
- `POST /api/llm/chat`

These endpoints coordinate:

- graph inference from the GNN
- attribution logic from shared responsibility
- simulation logic from rule-based engines
- explanation logic from Gemini / fallback analysis

---

## 10. Practical Notes & Next Steps

### 10.1 What is missing from the ML story

- Training code is not present in this repository.
- The GNN is deployed only as a checkpoint at `python-services/models/climaaudit_model.pt`.
- There is no explicit model training pipeline or dataset split code visible.

### 10.2 Useful extension points

- Add a training pipeline for the GNN using `torch_geometric` and the same heterogenous graph schema.
- Improve the GNN input feature set with additional country macro variables and sector-level emissions features.
- Replace the shared-responsibility heuristic with a Monte Carlo or coalition-based Shapley approximation.
- Add a validation and explainability layer for GNN predictions (feature importance, edge attention amortization).
- Add a unit test suite for the model inference, graph building, and simulation outputs.

### 10.3 Recommended places to look next

- `python-services/models/hetero_gnn.py`
- `python-services/app/main.py`
- `python-services/services/data_engine.py`
- `python-services/app/shared_responsibility.py`
- `python-services/app/policy_simulator.py`
- `python-services/app/advanced_policy_engine.py`
- `python-services/app/llm_analyst.py`

---

## 11. Summary

The ML component of ClimaAuditX is centered on a heterogeneous graph neural network that predicts country energy intensity from trade network structure. It is paired with rule-based policy simulation, attribution heuristics, and an LLM-driven analysis layer, forming a hybrid system that blends data-driven anomaly detection with explainable policy experimentation.
