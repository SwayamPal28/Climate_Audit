# ClimateAuditX - Complete Program Architecture & Explanation

## Table of Contents
1. [Overview](#overview)
2. [Core Problem & Mission](#core-problem--mission)
3. [Architecture Overview](#architecture-overview)
4. [Data Flow](#data-flow)
5. [Technical Components](#technical-components)
6. [Key Algorithms & Engines](#key-algorithms--engines)
7. [Frontend Components](#frontend-components)
8. [API Endpoints](#api-endpoints)
9. [File Structure & Purpose](#file-structure--purpose)

---

## Overview

**ClimateAuditX** is an AI-driven platform designed to solve the "Carbon Loophole" in global trade. It uses advanced machine learning (Heterogeneous Graph Neural Networks), game theory (Shapley Values), and policy simulation engines to:

1. **Detect carbon underreporting** in countries' climate emissions
2. **Attribute responsibility** fairly across international supply chains
3. **Simulate policy impacts** (CBAM, technology transfer, etc.)
4. **Enable diplomatic negotiations** through a game-theory sandbox

The system combines data science, economics, and AI to help policymakers understand and address carbon accountability in global trade.

---

## Core Problem & Mission

### The Problem
Countries report CO2 emissions based on **production-based accounting** (Scope 1: direct emissions from production). However, they don't fully account for:
- **Consumption-based emissions**: CO2 embedded in imported goods
- **Supply chain complexity**: Multiple countries in a single product's journey
- **Carbon arbitrage**: Shifting dirty production to other countries

This creates:
- **Carbon loophole**: Countries appear cleaner than they are
- **Unfair trade**: Clean countries compete against high-carbon producers
- **Insufficient climate action**: Real global emissions are masked

### The Solution
ClimateAuditX uses:
1. **Heterogeneous GNN**: Learn actual carbon flows in supply chains
2. **Shapley Attribution**: Distribute responsibility fairly using game theory
3. **Policy Simulators**: Model what-if scenarios for carbon tariffs
4. **Diplomatic Sandbox**: AI agents negotiate bilateral climate agreements

---

## Architecture Overview

The system has **3 main layers**:

```
┌─────────────────────────────────────────────────────┐
│           FRONTEND (React)                          │
│  - Dashboard with network visualization             │
│  - Shapley attribution breakdown                    │
│  - Policy simulation interface                      │
│  - Diplomatic negotiation game                      │
└────────────────────┬────────────────────────────────┘
                     │
                     │ (HTTP/JSON)
                     │
┌────────────────────▼────────────────────────────────┐
│      NODE.JS BACKEND (Express)                      │
│  - CORS proxy to Python services                    │
│  - Forwards API requests                           │
│  - Optional React static serving                    │
└────────────────────┬────────────────────────────────┘
                     │
                     │ (HTTP/JSON)
                     │
┌────────────────────▼────────────────────────────────┐
│   PYTHON BACKEND (FastAPI on uvicorn)              │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Data Engine (Pandas)                        │  │
│  │  - Loads 13 trade sectors (CSV files)        │  │
│  │  - Builds node/edge graph                    │  │
│  │  - Computes contributor paths                │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Heterogeneous GNN (PyTorch Geometric)      │  │
│  │  - Predicts emission intensity from flows    │  │
│  │  - Detects anomalies/underreporting          │  │
│  │  - Provides risk scores                      │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Shapley Attribution Engine                  │  │
│  │  - Calculates fair carbon responsibility     │  │
│  │  - Volume-weighted trade attribution         │  │
│  │  - Producer vs Consumer split                │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Policy Simulators                           │  │
│  │  - CBAM (Carbon Border Adjustment)           │  │
│  │  - Technology Transfer                       │  │
│  │  - Fairness Dial (attribution modes)         │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Diplomatic Sandbox (MARL)                   │  │
│  │  - AI agents with personas                   │  │
│  │  - Game-theoretic negotiations               │  │
│  │  - Carbon-aware retaliation logic             │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  LLM Analyst (Google Gemini API)             │  │
│  │  - Natural language explanations              │  │
│  │  - Policy recommendations                    │  │
│  │  - Falls back to rule-based analysis          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

---

## Data Flow

### Startup Sequence

```
1. Frontend loads React app
   ↓
2. Frontend makes HTTP request to Node backend
   ↓
3. Node backend proxies to Python FastAPI
   ↓
4. Python FastAPI startup event:
   a) DataEngine loads 13 CSV sector files
   b) Creates nodes_df (countries) & edges_df (trade flows)
   c) Loads pre-trained GNN model
   d) Initializes PolicySimulator, DiplomaticSandbox, LLMAnalyst
   ↓
5. Backend ready, frontend receives data
   ↓
6. User interacts with dashboard
```

### User Interaction - Example: Shapley Attribution

```
User selects country "IND" and clicks "Calculate Shapley"
     ↓
Frontend sends POST /api/calculate/shapley with {"target_country": "IND"}
     ↓
Node backend proxies to Python /api/calculate/shapley
     ↓
Python backend:
  1. Validates IND in nodes_df
  2. Gets IND's CO2 emissions from data
  3. Gets all trade partners (exports/imports)
  4. Splits responsibility:
     - producer_ratio * emissions = responsibility kept by IND (SELF)
     - (1 - producer_ratio) * emissions = allocated to trade partners by volume
  5. Returns {allocations: {SELF: 60%, USA: 15%, CHN: 25%, ...}}
     ↓
Frontend receives allocations and displays in pie chart
```

---

## Technical Components

### 1. Data Engine (`services/data_engine.py`)

**Purpose**: Central data manager that loads and indexes all trade & emissions data

**Key Responsibilities**:
- Loads 13 trade sector CSV files (agriculture, steel, chemicals, etc.)
- Builds bidirectional graph of trade flows between countries
- Maintains lookup tables: ISO3 code ↔ node index
- Computes "contributors" (trading partners) for any country
- Calculates consumer vs producer intensity

**Key Classes/Methods**:
```python
class DataEngine:
    def __init__(data_dir):
        # Loads nodes_final.csv (countries with GDP, CO2, energy intensity)
        # Loads all processed_*.csv files (trade flows with primaryValue)
        # Builds iso_to_idx, idx_to_iso lookup dicts
    
    def get_contributors(country_iso, weight_col='primaryValue'):
        # Returns list of trading partners with trade volumes
        # Used for upstream supply chain analysis
    
    def get_node(country_iso):
        # Returns country's metadata: GDP, CO2, energy intensity
    
    def calculate_consumer_intensity(country_iso):
        # Computes total consumption-based emissions
        # = production + imports - exports
```

**Data Files**:
- `nodes_final.csv`: Countries (iso3, gdp, energy_intensity, co2_emissions_kt)
- `processed_*.csv` (13 sectors): Trade flows with columns:
  - src_iso, tgt_iso, primaryValue (trade volume in USD)
  - Also direct & reexport variants

---

### 2. Heterogeneous GNN (`models/hetero_gnn.py`)

**Purpose**: Deep learning model to predict actual carbon intensity from trade patterns

**Architecture**:
```python
class ClimaAuditGNN(torch.nn.Module):
    - Input: Heterogeneous graph with country nodes and sector-specific edges
    - Layer 1: HeteroConv with GATv2Conv (multi-head attention)
    - Layer 2: Another HeteroConv layer
    - Output: Predicted energy intensity for each country
```

**How It Works**:
1. **Input Features**: Country nodes have features [GDP, MVA (Manufacturing Value Added)]
2. **Edge Types**: Each sector (agriculture, steel, etc.) is an edge type with different weights
3. **Forward Pass**: 
   - Multi-head attention aggregates information from trading partners
   - Distinguishes between "producer" (direct) and "middleman" (reexport) relationships
   - Updates node embeddings based on carbon flow patterns
4. **Output**: Predicted energy intensity = actual carbon footprint per unit GDP

**Why It Works**:
- Countries with high-carbon trade partners should have higher predicted intensity
- If reported intensity << predicted, they're likely underreporting
- Multi-hop flows (A→B→C) are captured through graph convolutions

**Model Loading** (in main.py startup):
```python
model = ClimaAuditGNN(hidden_dim=64, out_dim=1, metadata=data.metadata())
model.load_state_dict(torch.load(GNN_MODEL_PATH))  # Pre-trained weights
model.eval()
```

---

### 3. Shared Responsibility Engine (`app/shared_responsibility.py`)

**Purpose**: Implements Shapley Value-based fair carbon attribution

**Algorithm** (Heuristic Approximation, NOT full game theory):

```
For a target country, allocate its total CO2 across:
  1. SELF (domestic production kept): producer_ratio * total_co2
  2. Trading partners: Distributed by export value proportion

Example:
  IND total CO2 = 2000 tCO2
  producer_ratio = 0.6 (60%)
  
  SELF (IND) = 0.6 * 2000 = 1200 tCO2
  Exports = 0.4 * 2000 = 800 tCO2
  
  If IND exports to: USA ($500M), CHN ($300M), others ($200M)
    Total export value = $1000M
    USA gets: 800 * (500/1000) = 400 tCO2
    CHN gets: 800 * (300/1000) = 240 tCO2
    Others: 800 * (200/1000) = 160 tCO2
  
  Result: {SELF: 60%, USA: 20%, CHN: 12%, ...}
```

**Why This Approach**:
- True Shapley Value would require exponential coalitions (2^N)
- This is a practical approximation using marginal contribution by trade volume
- More intuitive: exporters are responsible proportionally to what they export

**Key Code**:
```python
class SharedResponsibilityEngine:
    def run_shapley(target_iso3, producer_ratio):
        1. Get target's total CO2 emissions
        2. Find all export partners and their trade values
        3. Calculate producer responsibility = producer_ratio * total
        4. Allocate exported = (1-producer_ratio) * total, by partner value
        5. Return percentage allocations for all partners
```

---

### 4. Policy Simulator (`app/policy_simulator.py`)

**Purpose**: Simulate what-if scenarios for climate policies

**Three Policy Types**:

#### a) CBAM (Carbon Border Adjustment Mechanism)
```
Simulates: EU imposing tariffs on high-carbon imports

Logic:
1. Identify trade flows to EU countries in target sector
2. Reduce trade volume by: severity * elasticity * original_volume
   - Elasticity varies by sector:
     * Energy = 0.4 (inelastic, people still need fuel)
     * Steel = 0.9 (moderate elasticity)
     * Textiles = 1.8 (elastic, easy to substitute)
3. Cascade effects:
   - Lost exports → GDP loss in exporting country
   - GDP loss → Reduced import demand (MPI = 0.3)
   - This creates second-order trade reductions
4. Iterate ~5 times until convergence

Outputs:
- Simulated nodes & edges with reduced volumes
- Metrics: trade reduction, carbon reduction, GDP impact
```

#### b) Technology Transfer
```
Simulates: Rich countries subsidizing green tech in developing nations

Logic:
1. Identify target countries (developing nations by config)
2. Reduce energy_intensity by: (1 - severity) * original_intensity
   - severity = 0.3 means 30% reduction (70% remains)
3. Recalculate emissions with new intensity
4. Calculate net CO2 reduction

Outputs:
- New energy intensities for target countries
- Total carbon savings
- Cost implications
```

#### c) Fairness Dial
```
Simulates: Changing attribution mode (Producer/Consumer/Shapley)

Logic:
1. Producer Mode: Country responsible for what it produces (Scope 1)
2. Consumer Mode: Country responsible for what it consumes (embedded in imports)
3. Shapley Mode: Fair split based on value-added in supply chain

This is NOT actually implemented in code shown, but the framework is ready.
```

**Iterative Solver** (CBAM-specific):
```python
for iteration in range(max_iterations):
    1. Apply direct tariff reduction
    2. Calculate GDP loss from lost exports
    3. Calculate secondary import reduction (MPI effect)
    4. Check convergence: |new_volume - prev_volume| < 1%
    5. If converged, stop; else continue
    
Returns: Converged trade network reflecting policy cascade
```

---

### 5. Diplomatic Sandbox (MARL Engine) (`app/marl_engine.py`)

**Purpose**: Game-theoretic negotiation simulation between two countries

**Model**: Multi-Agent Reinforcement Learning (MARL) - Simplified with heuristics

**DiplomaticAgent Class**:
```python
class DiplomaticAgent:
    def __init__(iso, persona):
        # persona: "GROWTH_FOCUSED" (India, China)
        #         "CLIMATE_FOCUSED" (EU)
        #         "BALANCED" (USA, Canada)
        
        # Persona determines utility weights:
        # GROWTH: {gdp: 2.0, co2: 0.1, stability: 0.5}
        # CLIMATE: {gdp: 0.5, co2: 2.0, stability: 0.8}
        # BALANCED: {gdp: 1.0, co2: 1.0, stability: 1.0}
    
    def choose_reaction(incoming_damage_usd, trade_profile, player_action):
        # Implements Tit-for-Tat with Persona decay
        # 1. Record history of past moves
        # 2. Check for Nash Equilibrium (convergence to stable damage level)
        # 3. If stable & low damage, negotiate truce
        # 4. Else, retaliate with tariff on opponent's vulnerable sector
        # 5. Calculate retaliation intensity based on:
        #    - Base tariff = (damage / sector_value)
        #    - Multiplier = aggression_score * patience_decay * climate_dampener
        # 6. Return action with estimated counter-damage
```

**Climate Modifier** (NEW):
```
If carbon reduction from opponent's tariff is HIGH (>50 kt CO2):
  - CLIMATE_FOCUSED agent: reduce retaliation by 50% (they like green action)
  - GROWTH_FOCUSED agent: increase retaliation by 20% (unfair "green protectionism")

This allows agents to negotiate on climate grounds, not just GDP impact.
```

**Example Game Flow**:
```
1. Player (USA): Tariff on steel from CHN for $100M damage
2. Rival (CHN): 
   - Calculates lost trade × energy_intensity = CO2 reduction
   - If CLIMATE agent & high reduction: Accept or negotiate
   - If GROWTH agent: Retaliate hard on agriculture (USA vulnerable sector)
3. Player receives counter-tariff, sees carbon benefit, may accept truce
4. Negotiation converges or escalates (trade war)
```

---

### 6. LLM Analyst Engine (`app/llm_analyst.py`)

**Purpose**: Natural language explanations of complex data using Google Gemini API

**Key Features**:
1. **Fallback Mode**: If API key invalid, uses rule-based explanations
2. **Multiple Analysis Types**:
   - Policy simulation → Executive summary, key findings, tradeoffs
   - Shapley attribution → Explanation of fair-share calculation
   - Diplomatic turn → Context and implications of negotiations
   - Bilateral optimization → Trade-off analysis

**Implementation**:
```python
class LLMAnalystEngine:
    def analyze_policy_simulation(policy_data):
        # Uses Gemini API to analyze policy impacts
        # Returns structured JSON with:
        # {executive_summary, key_findings, tradeoffs, recommendation}
        
    def analyze_shapley_attribution(shapley_data):
        # Explains who contributed what to carbon footprint
        
    def analyze_diplomatic_turn(turn_data):
        # Narrates game-theoretic negotiation outcomes
```

**Fallback (No API Key)**:
```python
If GEMINI_API_KEY missing or invalid:
    # Return rule-based, deterministic explanations
    # E.g., "CBAM policy at 20% severity reduces trade by X%, carbon by Y%"
    # This ensures frontend never breaks due to LLM unavailability
```

---

## Key Algorithms & Engines

### Anomaly Detection Algorithm

**Endpoint**: `GET /api/audit/anomalies`

**Method**:
```
For each country:
  1. Get reported energy intensity (self-reported CO2 / GDP)
  2. Get predicted intensity from GNN model
  3. Anomaly score = predicted - reported
  
  If anomaly_score > 0 (high positive):
    → Country claims to be cleaner than actual
    → RED FLAG: Potential underreporting
  
  If anomaly_score < 0 (high negative):
    → Country is cleaner than expected
    → GREEN FLAG: Efficiency leader

Return: Top 5 positive (underreporting suspects) + Top 5 negative (clean leaders)
```

**Example**:
```
China reported: 300 tCO2/GDP
GNN predicted: 350 tCO2/GDP
Anomaly score = +50
→ Flagged as potential underreporter
```

---

### Carbon Attribution (Shapley Approximation)

**Endpoint**: `POST /api/calculate/shapley`

**Input**: `{target_country: "IND", producer_ratio: 0.6}`

**Process**:
```
1. target_iso3 = "IND"
2. Get all countries India exports to (from edges_df)
3. Get all trade values (primaryValue column)
4. Total CO2 = nodes_df[IND][co2_emissions_kt]
5. 
   SELF allocation = 0.6 * total_CO2
   Export pool = 0.4 * total_CO2
   
   For each export partner P:
     partner_allocation = export_pool * (partner_trade_value / total_export_value)
6. Return allocations as percentages
```

**Interpretation**:
- `producer_ratio = 0.6`: India keeps 60% of its CO2 (producer responsibility)
- `producer_ratio = 0.4`: India only keeps 40% (consumer responsibility for imports)
- Varying this slider shows how responsibility shifts based on attribution method

---

### Bilateral Optimization

**Endpoint**: `POST /api/optimize/bilateral`

**Goal**: Find fair tariff between two countries that:
- Minimizes GDP loss
- Accounts for carbon intensity gap
- Respects maximum GDP loss constraint

**Algorithm** (in `advanced_policy_engine.py`):
```
1. Get emissions intensities: player & rival
2. Calculate carbon gap = rival_intensity - player_intensity
3. Fair tariff = gap * carbon_price * scaling_factor
4. Cap at 50% maximum tariff
5. Calculate secondary effects:
   - Trade reduction from tariff
   - GDP loss from reduced trade
   - Carbon reduction from lower volumes
6. Return optimized policy with metrics
```

---

## Frontend Components

### Main Components (`frontend/src/components/`)

#### 1. **GraphVisualization.jsx**
- **Purpose**: 3D network visualization of trade flows
- **Technology**: `react-force-graph-3d` (D3.js based)
- **Shows**:
  - Countries as nodes (size = GDP, color = intensity)
  - Trade flows as edges (thickness = trade volume)
  - Interactive: hover for details, drag to rotate
- **Data Source**: `GET /api/graph` from backend

#### 2. **ShapleyForm.jsx**
- **Purpose**: Calculate and display carbon attribution
- **Features**:
  - Dropdown to select target country
  - Slider for producer_ratio (0-100%)
  - Submit to `POST /api/calculate/shapley`
  - Displays pie chart of allocations
- **Shows**: Who is responsible for each country's carbon

#### 3. **PolicyLab.jsx**
- **Purpose**: Simulate policy scenarios
- **Features**:
  - Policy type selector (CBAM, Tech Transfer, Fairness Dial)
  - Severity slider (0.0-1.0)
  - Target country selector
  - Submit to `POST /api/simulate/policy`
- **Shows**: 
  - Before/after graphs
  - Metrics: trade reduction, carbon reduction, GDP impact
  - Delta comparison cards

#### 4. **DiplomaticSandbox.jsx**
- **Purpose**: Game-theoretic negotiation game
- **Features**:
  - Select 2 countries (player vs rival)
  - Turn-based interaction
  - Choose action (TARIFF, SANCTION)
  - Select sector and severity
  - AI opponent reacts based on persona
- **Shows**:
  - Trade war escalation metrics
  - CO2 reduction from tariffs
  - Negotiation history
  - Option to accept truce

#### 5. **AuditDashboard.jsx**
- **Purpose**: Main landing page showing anomalies
- **Features**:
  - Top anomalies table (suspects & clean performers)
  - Fetches from `GET /api/audit/anomalies`
  - Color-coded: red (under-reporting), green (efficient)

#### 6. **BilateralPolicySelector.jsx**
- **Purpose**: Bilateral trade optimization
- **Features**:
  - Select source & target countries
  - Sector selection
  - Max GDP loss constraint
  - Submit to `POST /api/optimize/bilateral`

#### 7. **LLMAnalystPanel.jsx**
- **Purpose**: AI-generated explanations
- **Features**:
  - Displays natural language analysis
  - Fallback to rule-based if LLM unavailable
  - Provides policy recommendations

---

## API Endpoints

### Data Endpoints

| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| GET | `/api/countries` | List all countries | List of ISO3 codes |
| GET | `/api/audit/anomalies` | Get top anomalies | Top positive/negative anomalies |
| GET | `/api/audit/{country_code}` | Detailed audit for one country | Reported vs predicted intensity, status |
| GET | `/api/graph` | Network graph data | Nodes (countries) & edges (trade) for visualization |
| GET | `/api/network` | Network for D3 visualization | Simplified graph format |
| GET | `/api/shapley/{country_code}` | Model-based Shapley values | Leave-one-out contribution scores |

### Calculation Endpoints

| Method | Endpoint | Purpose | Input | Returns |
|--------|----------|---------|-------|---------|
| POST | `/api/calculate/shapley` | Volume-weighted attribution | `{target_country, producer_ratio}` | `{allocations: {partner: %}}` |
| POST | `/api/simulate/policy` | Policy scenario simulation | `{policy_type, severity, targets}` | Before/after graphs & metrics |
| POST | `/api/simulate` | Single tariff simulation | `{source, target, tariff_rate, sector}` | Trade & carbon impact |
| POST | `/api/optimize/bilateral` | Fair bilateral tariff | `{src, tgt, sector, max_gdp_loss}` | Recommended tariff & metrics |
| POST | `/api/simulate/custom-attribution` | Custom responsibility split | `{target, split_ratio, sector}` | Simulated allocations |

### Negotiation Endpoints

| Method | Endpoint | Purpose | Input | Returns |
|--------|----------|---------|-------|---------|
| POST | `/api/diplomacy/start` | Start negotiation game | `{player_iso, rival_iso}` | Initial game state |
| POST | `/api/diplomacy/turn` | Play one turn | `{player_iso, rival, action, sector, severity}` | Opponent reaction & state |
| GET | `/api/diplomacy/matchup` | Fairness analysis | `?player=XX&rival=YY` | Carbon gap & fair tariff |

### LLM Analysis Endpoints

| Method | Endpoint | Purpose | Input | Returns |
|--------|----------|---------|-------|---------|
| POST | `/api/llm/analyze-policy` | Explain policy impact | Policy simulation data | Natural language analysis |
| POST | `/api/llm/analyze-shapley` | Explain attribution | Shapley allocation data | Explanation of fair share |
| POST | `/api/llm/analyze-diplomatic` | Narrate negotiation | Diplomatic turn data | Turn summary & implications |
| POST | `/api/llm/analyze-bilateral` | Bilateral analysis | Bilateral optimization data | Trade-off explanation |

---

## File Structure & Purpose

```
ClimateAuditX/
│
├── README.md                          # Project overview
├── PROGRAM_EXPLANATION.md             # This file
├── data_verification.csv              # Verification dataset
│
├── frontend/                          # React frontend (npm start → port 3000)
│   ├── package.json                   # Dependencies: React, D3, Recharts, Leaflet
│   ├── public/
│   │   ├── index.html                 # Entry point
│   │   └── iso3_to_name_map.csv       # Country code lookup
│   └── src/
│       ├── App.jsx                    # Main app component, routing
│       ├── index.js                   # React DOM render
│       └── components/
│           ├── AuditDashboard.jsx     # Anomaly detection display
│           ├── GraphVisualization.jsx # 3D network graph
│           ├── ShapleyForm.jsx        # Attribution calculator
│           ├── PolicyLab.jsx          # Policy simulator UI
│           ├── DiplomaticSandbox.jsx  # Negotiation game
│           ├── BilateralPolicySelector.jsx  # Bilateral optimization
│           ├── LLMAnalystPanel.jsx    # AI explanations
│           ├── MapView.jsx            # Geographical visualization
│           ├── DeltaComparisonCard.jsx # Before/after comparison
│           ├── UpstreamImpactTable.jsx # Supply chain impact
│           └── *.css                  # Styling
│
├── node-backend/                      # Express proxy server (npm start → port 4000)
│   ├── package.json                   # Dependencies: Express, Axios, CORS
│   └── src/
│       ├── server.js                  # Main server, proxies to Python
│       └── shapley_worker.js          # (Optional) Worker for heavy computation
│
├── python-services/                   # FastAPI backend (uvicorn → port 8000)
│   ├── requirements.txt                # Python dependencies
│   ├── fix_india_final.py             # Data processing script
│   │
│   ├── app/
│   │   ├── main.py                    # FastAPI application (858 lines)
│   │   │                              # Defines all API endpoints
│   │   │                              # Startup event loads models
│   │   ├── config.py                  # Constants: EU_COUNTRIES, DEVELOPING_NATIONS, etc.
│   │   ├── shared_responsibility.py   # Shapley attribution engine
│   │   ├── policy_simulator.py        # CBAM, Tech Transfer simulation (539 lines)
│   │   ├── marl_engine.py             # Diplomatic agents & game theory (294 lines)
│   │   ├── llm_analyst.py             # Google Gemini integration (580 lines)
│   │   ├── advanced_policy_engine.py  # Bilateral optimization
│   │   ├── utils.py                   # Helper functions
│   │   └── __init__.py
│   │
│   ├── services/
│   │   ├── data_engine.py             # Central data manager (452 lines)
│   │   │                              # Loads CSVs, manages trade graph
│   │   └── __init__.py
│   │
│   ├── models/
│   │   ├── hetero_gnn.py              # Heterogeneous GNN architecture
│   │   ├── climaaudit_model.pt        # Pre-trained model weights
│   │   └── __init__.py
│   │
│   └── data/
│       ├── nodes_final.csv            # Countries: iso3, gdp, co2, energy_intensity
│       ├── processed_agriculture_direct.csv    # Trade flows
│       ├── processed_agriculture_reexport.csv  # Re-export flows
│       ├── processed_aircraft_direct.csv
│       ├── processed_aircraft_reexport.csv
│       │ ... (13 sectors × 2 variants = 26 files)
│       ├── processed_wood_direct.csv
│       └── metadata.json              # Schema documentation
│
└── shapley_results/                   # Pre-computed Shapley results
    ├── shapley_BRA.csv                # Brazil's contribution breakdown
    ├── shapley_CHN.csv                # China's
    ├── shapley_DEU.csv                # Germany's
    ├── shapley_IND.csv                # India's
    └── shapley_USA.csv                # USA's
```

---

## Key Dependencies & Technologies

### Frontend
- **React 19**: UI framework
- **D3.js / react-force-graph-3d**: 3D network visualization
- **Recharts**: Business charts & data visualization
- **Leaflet / react-leaflet**: Geographical maps
- **Axios**: HTTP client for API calls

### Node.js Backend
- **Express**: Web framework
- **Axios**: HTTP client (forward to Python)
- **CORS**: Cross-origin support

### Python Backend
- **FastAPI**: Web framework (async, auto-docs)
- **Uvicorn**: ASGI server
- **PyTorch**: Deep learning
- **PyTorch Geometric**: Graph neural networks
- **Pandas/NumPy**: Data manipulation
- **Scikit-learn**: ML utilities
- **Google GenAI**: LLM integration (Gemini)
- **NetworkX**: Graph algorithms
- **Tenacity**: Retry logic with exponential backoff

---

## Environment Configuration

### Required Environment Variables

**`.env` file** (in python-services):
```
# Google Gemini API
GEMINI_API_KEY=your_actual_api_key_here

# Optional: Override model or parameters
GEMINI_MODEL=models/gemini-2.0-flash
GEMINI_MAX_TOKENS=2048
GEMINI_TEMPERATURE=0.3
```

### Data Requirements

All CSV files must have columns:
- **nodes_final.csv**: iso3, gdp, energy_intensity, co2_emissions_kt, mva
- **processed_*.csv**: src_iso, tgt_iso, primaryValue (USD), sector (added by engine)

---

## Workflow Examples

### Example 1: Detect Carbon Underreporting

```
1. User visits dashboard
2. Frontend calls GET /api/audit/anomalies
3. Python backend:
   - Loads all countries
   - For each, calculates GNN prediction vs reported intensity
   - Sorts by anomaly_score
4. Returns top 5 under-reporters (RED) + top 5 clean (GREEN)
5. Frontend displays as table with risk colors
6. User clicks country for detailed audit
```

### Example 2: Calculate Fair Responsibility

```
1. User selects "India" and sets producer_ratio = 0.7
2. Frontend sends POST /api/calculate/shapley
3. Python backend:
   - Gets India's total CO2: 2000 tCO2
   - Keeps 70% = 1400 tCO2 (producer responsibility)
   - Exports 30% = 600 tCO2 (consumer countries' responsibility)
   - Finds India's export partners: USA ($500M), CHN ($300M), others
   - Allocates export pool by partner value
   - Returns: {SELF: 70%, USA: 15%, CHN: 9%, others: 6%}
4. Frontend displays pie chart
```

### Example 3: Simulate CBAM Policy

```
1. User selects CBAM, severity=0.3 (30% trade reduction)
2. Frontend sends POST /api/simulate/policy
3. Python backend:
   - Identifies EU-bound steel trade
   - Reduces volumes: new_vol = old_vol * (1 - 0.3 * elasticity)
   - Calculates GDP loss in exporting countries
   - Second-order: lost exports → GDP loss → less import demand
   - Iterates until volumes stabilize
   - Returns original + simulated graphs
4. Frontend shows before/after with metrics
   - Trade reduction: 25% (example)
   - Carbon reduction: 150 ktCO2 (example)
   - GDP loss: $5B (example)
```

### Example 4: Negotiate Trade Deal

```
1. User selects Player=USA, Rival=CHN
2. Clicks "Start Negotiation" → POST /api/diplomacy/start
3. Game state initialized with both countries' trade profiles
4. User plays turn: "TARIFF on Steel with 0.3 severity"
5. Frontend sends POST /api/diplomacy/turn
6. Python DiplomaticAgent (China):
   - Calculates damage: $100M
   - Checks climate benefit from lower trade volume
   - If GROWTH persona, retaliates hard
   - If CLIMATE persona, negotiates truce
   - Returns retaliation action
7. Frontend shows:
   - Opponent's tariff on Agriculture
   - Estimated counter-damage
   - CO2 reduction from both tariffs
   - Option to accept truce
8. User can continue escalating or negotiate
```

---

## Performance & Scalability Considerations

### Data Loading
- **13 sectors × 2 variants = 26 CSV files** loaded on startup
- **Typical graph size**: ~200 countries, ~5,000+ edges
- **Memory usage**: ~1-2 GB (Pandas DataFrames + PyTorch tensors)

### Model Inference
- **GNN prediction**: ~100ms for all countries (batch inference)
- **Shapley Leave-One-Out**: ~30 countries × 20ms = ~600ms (capped at 30 partners)
- **Policy simulation**: 5-10 iterations of convergence solver = ~2-5 seconds

### Frontend Rendering
- **3D graph**: Performance degrades with >1000 edges
  - Solution: Sample 100 edges per sector type for visualization
- **Table rendering**: Optimized for <100 rows

### Optimization Opportunities
1. **Cache GNN predictions** instead of recomputing per request
2. **Pre-compute Shapley values** for major countries
3. **Use database** (PostgreSQL) for trade data instead of Pandas in-memory
4. **Implement Redis caching** for frequently accessed endpoints
5. **Batch LLM requests** to reduce API costs

---

## Testing & Verification

### Data Verification
- **File**: `data_verification.csv`
- Contains: Sample of verified trade flows and emissions
- Used to validate data engine's data cleaning

### Model Validation
- Pre-trained model: `models/climaaudit_model.pt`
- Trained on historical emissions + trade data
- Evaluated on held-out test set

### API Testing
- FastAPI auto-generates `/docs` (Swagger UI)
- Visit `http://localhost:8000/docs` to test endpoints interactively

---

## Limitations & Future Enhancements

### Current Limitations
1. **Shapley Approximation**: Uses volume-weighted heuristic, not full game-theoretic Shapley
2. **Single Model**: All predictions based on one GNN
3. **Historical Data**: No forward-looking predictions (only retrospective analysis)
4. **Simplified MARL**: Uses heuristic rules, not trained RL agents
5. **No Database**: All data in-memory, not scalable to millions of records

### Future Enhancements
1. **Implement Full Shapley Values** with Monte Carlo approximation
2. **Train Custom Reinforcement Learning** agents for more realistic negotiations
3. **Add Temporal Dynamics**: Track policy impact over time
4. **Machine Learning Pipeline**: Auto-retrain GNN with new data
5. **Real-time Data Integration**: Pull trade data from WTO/UN databases
6. **Scenario Export**: Save & reload negotiation games
7. **Explainability**: SHAP values to explain GNN predictions
8. **Multi-country Coalitions**: Extend diplomacy to N-player games

---

## Summary

**ClimateAuditX** is a sophisticated platform combining:
- **Data Science** (Pandas, PyTorch) for carbon flow analysis
- **Deep Learning** (GNN) for anomaly detection
- **Game Theory** (Shapley, Diplomacy agents) for fair allocation
- **Economic Modeling** (Policy simulators) for what-if scenarios
- **Natural Language AI** (Gemini) for explainability

The system enables policymakers to understand carbon responsibility in global trade and negotiate fair climate agreements based on data-driven insights.

---

## Need More Details On?

Specific areas you might want me to elaborate:
- **Data schema**: Exact CSV columns and their meanings
- **Model training**: How the GNN was trained
- **Mathematical formulation**: Detailed equations for each algorithm
- **Deployment**: How to run this in production
- **Integration**: How to add new data sources or policy types
- **Frontend-Backend communication**: Detailed API contracts

Let me know!
