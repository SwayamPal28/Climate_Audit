# ClimaAuditX Project Overview

## Project Summary
ClimaAuditX is an AI-driven carbon audit framework designed to close reporting gaps in global trade emissions. It combines heterogeneous graph learning, fairness attribution, economic policy simulation, and natural-language summarization to identify carbon responsibility, detect anomalies, and make policy outcomes interpretable for non-technical stakeholders.

## Core ML and Data Components

### Heterogeneous Graph Neural Network (HGNN)
- Implemented in `python-services/models/hetero_gnn.py`
- Uses PyTorch Geometric with `HeteroConv` and `GATv2Conv`
- Processes a heterogeneous trade graph where nodes represent countries and edges represent sector-specific trade flows
- Learns embeddings from node attributes such as GDP, MVA, and energy intensity
- Predicts carbon-related target values per country
- Model is loaded from `python-services/models/climaaudit_model.pt` and constructed in `python-services/app/main.py`

### Graph Construction and Data Engineering
- Data is loaded from `python-services/app/main.py` during backend startup
- Node features are read from `python-services/data/nodes_final.csv`
- Sector-specific trade edges are loaded from processed CSVs such as:
  - `processed_agriculture_direct.csv`
  - `processed_agriculture_reexport.csv`
  - `processed_energy_direct.csv`
  - `processed_steel_reexport.csv`
- Edges are grouped by sectors and trade flow types (`direct`, `reexport`)
- Node features are normalized before model inference

### Fairness and Attribution Engine
- Implemented in `python-services/app/advanced_policy_engine.py`
- Uses Multi-Regional Input-Output (MRIO) concepts and bilateral trade analysis
- Supports:
  - Custom carbon attribution splits between producers and consumers
  - Optimal bilateral tariff/policy design under GDP-loss constraints
  - Pareto frontier search for efficiency between carbon savings and economic impact
  - Upstream shock propagation to measure middleman effects
- Supports flexible attribution modes such as producer-only, consumer-only, and Shapley-based allocation

### Shapley Value Fairness Engine
- A core project concept described in the repo README and API architecture
- Allocates carbon responsibility across supply chain contributors using cooperative game theory
- Supports fair, marginal-contribution-based carbon accountability across trading partners
- Works together with both Python backend and Node.js worker processes for compute-intensive calculations

### Policy Simulation
- Implemented in the FastAPI backend and supported by multiple engines
- Includes:
  - `PolicySimulator` for policy-type scenarios like CBAM and technology transfer
  - `AdvancedPolicyEngine` for bilateral optimization and carbon-adjusted trade equilibrium
  - `DiplomaticSandbox` for multi-agent negotiation and MARL-style diplomatic simulations
- Simulates real-world climate policy mechanisms:
  - EU Carbon Border Adjustment Mechanism (CBAM)
  - Technology transfer and green investment growth
  - Bilateral trade tariffs and sector-specific impact analysis

### AI Analyst / Natural Language Interface
- Implemented in `python-services/app/llm_analyst.py`
- Uses Google Gemini API via `google.genai`
- Converts complex simulation results into executive summaries, policy recommendations, and strategic insights
- Provides fallback rule-based analysis if Gemini credentials are missing
- Supports multiple explanation modes:
  - policy simulations
  - Shapley attribution
  - diplomatic game turns
  - bilateral optimization
  - anomaly detection

## Backend Architecture

### Python Backend
- Main service entrypoint: `python-services/app/main.py`
- Built using FastAPI
- Exposes endpoints for:
  - graph analysis and anomaly detection
  - Shapley value attribution
  - policy simulation
  - dual engine coordination (`data_engine`, `advanced_policy_engine`, `marl_engine`, `llm_analyst`)
- Loads graph data, model weights, and trade data at startup
- Uses Pandas, NumPy, and PyTorch to process large tabular datasets and graph inputs

### Node.js Backend
- Located in `node-backend/`
- Provides auxiliary processing and Shapley worker support
- Typical structure includes `server.js` and `shapley_worker.js`

### Frontend
- Implemented in React under `frontend/`
- Provides visualization and UI components for:
  - audit dashboards
  - bilateral policy selectors
  - graph visualizations
  - LLM analyst panels
- Uses standard React tooling with `package.json`, `index.js`, and component-level structure

## Data Sources and Dataset Engineering
- Key data sources include UN Comtrade trade records, World Bank indicators, and national emission factors
- The project stores processed data in `python-services/data/`
- CSV sources show preprocessed bilateral flows across sectors and trade modalities
- Node and edge tables are used to create the heterogeneous graph for the HGNN

## Technologies Used
- Python 3.x
- FastAPI
- PyTorch
- PyTorch Geometric
- Pandas, NumPy
- Google Gemini API
- React.js
- Node.js
- JavaScript
- CSV data engineering
- Cooperative game theory (Shapley value)
- Economic modeling and MRIO logic

## ML-Focused Highlights for Interviews
1. Heterogeneous Graph Neural Network Architecture
   - Designed a heterogeneous graph model to represent countries and sector-specific trade relationships
   - Used GATv2 attention layers to learn from multi-relational edge types
   - Applied feature normalization and graph-specific training/inference logic

2. Fairness & Carbon Attribution
   - Implemented Shapley value attribution to assign carbon responsibility fairly
   - Built a custom split-ratio mechanism to compare producer vs consumer accountability
   - Designed a policy engine to evaluate carbon costs under economic constraints

3. Policy Simulation and Optimization
   - Created an MRIO-based engine for bilateral policy optimization
   - Simulated tariff and trade response using price elasticity and Pareto frontier analysis
   - Integrated upstream/downstream impact assessments to quantify supply chain effects

4. Explainable AI + LLM Integration
   - Added a Gemini-powered analyst layer to translate model output into actionable insights
   - Ensured fallback rule-based explanations when API keys are absent
   - Produced natural language summaries for policy makers and auditors

## Suggested Interview Talking Points
- “I built a digital twin of the global economy using a heterogeneous GNN and trade-edge reconstruction across 173,000+ connections.”
- “The model uses GATv2 layers to differentiate direct trade and re-export, enabling more accurate carbon flow attribution.”
- “I integrated a Shapley value fairness engine to distribute emissions responsibility across producer and consumer countries.”
- “The policy simulation engine evaluates CBAM-style tariffs and technology transfer scenarios under GDP impact constraints.”
- “I added an LLM analyst layer using Google Gemini to make results accessible to non-technical stakeholders.”

## Revised Resume Bullets
- Engineered a digital twin of the global economy by reconstructing 173,000+ trade edges from UN Comtrade data and resolving reporting gaps with a mirror reconstruction protocol.
- Developed a Heterogeneous GATv2 graph neural network to identify greenwashing anomalies and learn distinct embeddings for direct trade versus re-export activities.
- Implemented a Shapley value fairness engine to attribute carbon liability across supply chains and simulated global tariff shock impacts in under 2 seconds.
- Integrated Google Gemini API to convert complex simulation outputs into natural-language policy briefings for stakeholders.

## File Locations for Key Components
- `python-services/app/main.py` — FastAPI app and graph/model loading
- `python-services/models/hetero_gnn.py` — HGNN model architecture
- `python-services/app/advanced_policy_engine.py` — MRIO and policy optimization logic
- `python-services/app/llm_analyst.py` — Gemini-based natural language analyst
- `python-services/data/` — processed node and sector trade CSVs
- `frontend/` — React UI for dashboards and analyst panels
- `node-backend/` — Node.js worker backend for computation tasks

## Interview Preparation Tips
- Emphasize the hybrid nature of the solution: machine learning, economics, and NLP.
- Clarify how heterogeneous graph structure was necessary to model multi-sector trade relationships.
- Explain the reason for using Shapley values: fair allocation of shared carbon responsibility.
- Mention the fallback design in the LLM analyst for reliability when API credentials are unavailable.
- Use the root-level README as a reference for system architecture and deployment steps.
