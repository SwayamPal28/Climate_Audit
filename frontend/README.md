```markdown
# ClimaAuditX: AI-Driven Carbon Attribution and Policy Simulation

**ClimaAuditX** is an advanced analytical framework designed to address the "Carbon Loophole" in global trade. The system utilizes Heterogeneous Graph Neural Networks (HGNN) and Shapley Value-based game theory to assign fair carbon emission responsibility across international supply chains.

---

##  Technical Overview

The framework consists of three primary technical pillars:

1. **Mirror Trade Reconstruction**: Reconciles asymmetric exporter-importer data to repair reporting gaps, particularly for developing nations.
2. **Heterogeneous GNN Architecture**: Implements a Heterogeneous GATv2 model to trace multi-hop carbon flows through complex trade relationships.
3. **Fairness Engine**: Uses Cooperative Game Theory (Shapley Values) to allocate responsibility based on a nation's marginal contribution to global emissions.


## Installation and Setup

### Prerequisites

Ensure you have the following installed on your system:

- **Python 3.8+** ([Download](https://www.python.org/downloads/))
- **Node.js 14+** and npm ([Download](https://nodejs.org/))
- **Virtualenv** (for Python environment management)
- **Git** ([Download](https://git-scm.com/))

### Clone the Repository

```bash
git clone https://github.com/yourusername/ClimaAuditX.git
cd ClimaAuditX
```

---

## Step-by-Step Execution

To run the full ClimaAuditX suite, you'll need to open **three separate terminals** and execute the following commands:

### Terminal 1: Python ML Services (FastAPI)

This terminal runs the core AI/ML backend.

```bash
# Navigate to the python-services directory
cd python-services

# Create a virtual environment (if not already created)
python -m venv venv

# Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

The ML services will be available at `http://localhost:8000`.

---

### Terminal 2: Frontend Dashboard (React/Tailwind)

This terminal runs the user interface.

```bash
# Navigate to the frontend directory
cd frontend

# Install Node.js dependencies (first time only)
npm install

# Start the development server
npm start
```

**Expected Output:**
```
Compiled successfully!

You can now view climaauditx in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000

Note that the development build is not optimized.
To create a production build, use npm run build.
```

The frontend will be available at `http://localhost:3000`.

---

### Terminal 3: Node.js Backend

This terminal runs the server-side API and data aggregation services.

```bash
# Navigate to the node-backend directory
cd node-backend

# Install Node.js dependencies (first time only)
npm install

# Start the development server
npm run dev
```

**Expected Output:**
```
[nodemon] starting `node src/app.js`
Node backend server running on port 5000
Connected to database
```

The backend API will be available at `http://localhost:5000`.

---

##  Features

### 1. **EU CBAM Simulator**
Predicts trade contraction and economic shifts based on Carbon Border Adjustment Mechanism (CBAM) policies.

- Analyzes impact on imports from developing nations
- Projects revenue redistribution
- Models compliance costs

### 2. **Bilateral Optimizer**
Identifies scientifically-targeted tariffs that balance decarbonization goals with GDP stability.

- Pareto-optimal policy recommendations
- Multi-objective optimization (emissions vs. economic impact)
- Country-specific calibration

### 3. **CATE Engine (Carbon-Adjusted Trade Equilibrium)**
Provides a real-time dashboard for policy auditing and carbon attribution.

- Interactive network visualization
- Shapley value-based responsibility allocation
- Multi-hop carbon tracing through supply chains

---

## Testing

### Run Python Tests
```bash
cd python-services
pytest tests/
```

### Run Node.js Tests
```bash
cd node-backend
npm test
```

### Run Frontend Tests
```bash
cd frontend
npm test
```

---

##  Data Sources

ClimaAuditX integrates data from multiple sources:

- **UN Comtrade**: Bilateral trade flows
- **EDGAR**: Country-level emissions data
- **World Bank**: GDP and economic indicators
- **IEA**: Energy and carbon intensity metrics


