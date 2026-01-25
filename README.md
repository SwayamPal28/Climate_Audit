# ClimateAuditX: AI-Driven Carbon Attribution & Policy Simulation

ClimateAuditX is a cutting-edge analytical framework designed to close the "Carbon Loophole" in global trade. By leveraging Heterogeneous Graph Neural Networks (HGNN) and Shapley Value-based game theory, the system provides a transparent, data-driven methodology for assigning fair carbon emission responsibility across international supply chains.

## Key Features

### Mirror Trade Reconstruction
An algorithmic protocol that reconciles asymmetric exporter-importer data to repair reporting gaps in the "Silent South".

### Heterogeneous GNN Architecture
Utilizes a Heterogeneous GATv2 model to distinguish between complex trade relationships (Producer vs. Middleman) and trace multi-hop carbon flows.

### Fairness Engine (Shapley Value)
Implements cooperative game theory to allocate carbon responsibility based on a nation's marginal contribution to global emissions.

### Policy Lab & Simulators

- **EU CBAM Simulator**: Models the economic impact and trade contraction of Carbon Border Adjustment tariffs.
- **Technology Transfer Model**: Simulates industrial upgrades and green investment growth bonuses (SDG 17).
- **CATE Engine**: A Carbon-Adjusted Trade Equilibrium dashboard for real-time policy auditing and bilateral optimization.

## Tech Stack

- **Language**: Python 3.x
- **Deep Learning**: PyTorch Geometric (for HGNN/GATv2 implementation)
- **Data Science**: Pandas, NumPy, Scikit-learn
- **Economic Modeling**: World Bank Open Data API, MRIO (Multi-Regional Input-Output) Logic
- **Visualization**: Matplotlib, Seaborn, NetworkX
- **Backend**: Node.js (Express), Python (FastAPI)
- **Frontend**: React.js

## Project Structure

```
ClimateAuditX/
├── python-services/          # Python backend services (FastAPI)
│   ├── app/
│   │   ├── main.py           # Main FastAPI application
│   │   ├── advanced_policy_engine.py
│   │   ├── config.py
│   │   ├── llm_analyst.py
│   │   ├── marl_engine.py
│   │   ├── model_runner.py
│   │   ├── policy_simulator.py
│   │   ├── shared_responsibility.py
│   │   └── utils.py
│   ├── data/                 # Processed trade and emission data
│   ├── models/               # Trained ML models
│   ├── requirements.txt      # Python dependencies
│   └── *.py                  # Various data processing scripts
├── node-backend/             # Node.js backend services
│   ├── src/
│   │   ├── server.js
│   │   └── shapley_worker.js
│   └── package.json
├── frontend/                 # React frontend application
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.js
│   │   └── index.js
│   ├── build/                # Built frontend assets
│   └── package.json
├── *.ipynb                   # Jupyter notebooks for analysis
└── verify_*.py               # Verification scripts
```

## Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn
- Git

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ClimateAuditX
```

### 2. Python Services Setup

```bash
cd python-services
pip install -r requirements.txt
```

### 3. Node Backend Setup

```bash
cd ../node-backend
npm install
```

### 4. Frontend Setup

```bash
cd ../frontend
npm install
```

## Running the Application

ClimateAuditX requires three separate terminal sessions to run all components simultaneously.

### Terminal 1: Python Services (FastAPI)

```bash
cd python-services
uvicorn app.main:app --reload --port 8000
```

This starts the Python backend services on port 8000, including the HGNN models, Shapley value calculations, and policy simulators.

### Terminal 2: Frontend (React)

```bash
cd frontend
npm start
```

This starts the React frontend application, typically on port 3000. The frontend provides the user interface for interacting with the carbon attribution models and policy simulations.

### Terminal 3: Node Backend

```bash
cd node-backend
npm run dev
```

This starts the Node.js backend services, which handle additional processing tasks like Shapley value computations.

## API Endpoints

### Python Services (Port 8000)

- `GET /`: Health check
- `POST /analyze-trade`: Analyze trade data with HGNN
- `POST /calculate-shapley`: Calculate Shapley values for carbon attribution
- `POST /simulate-policy`: Run policy simulations (CBAM, Technology Transfer)
- `GET /data/{dataset}`: Retrieve processed datasets

### Node Backend

- `POST /shapley-worker`: Background Shapley value calculations
- `GET /status`: Service status

## Data Sources

The system processes trade data from:
- UN Comtrade Database
- World Bank Open Data
- National statistical offices
- Industry-specific emission factors

## Model Architecture

### Heterogeneous Graph Neural Network (HGNN)

The HGNN model uses GATv2 layers to process:
- **Node Types**: Countries, Products, Industries
- **Edge Types**: Direct trade, Re-export trade, Supply chain relationships
- **Features**: Trade volumes, emission intensities, GDP data


## Policy Simulators

### EU CBAM Simulator
Models the impact of Carbon Border Adjustment Mechanisms by:
1. Calculating carbon content of imported goods
2. Applying tariff rates based on emission differentials
3. Simulating trade flow adjustments

### Technology Transfer Model
Simulates SDG 17 objectives through:
1. Green investment scenarios
2. Industrial upgrade pathways
3. Capacity building effects on emission reductions

### CATE Engine
Provides real-time equilibrium analysis for:
1. Bilateral trade optimization
2. Carbon-adjusted pricing
3. Policy impact assessment


## Acknowledgments

- World Bank for open data APIs
- PyTorch Geometric community
- UN Comtrade for trade statistics
- Research institutions contributing to carbon accounting methodologies
