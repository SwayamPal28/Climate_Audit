# python-services/app/config.py

import os
from pathlib import Path

# --- DIRECTORY PATHS ---
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"

# --- APPLICATION SETTINGS ---
APP_NAME = "ClimaAuditX"
APP_VERSION = "2.0.1"

# --- MODEL SETTINGS ---
# Using Google Gemini 2.0 Flash as the default analyst model
LLM_MODEL_NAME = "models/gemini-2.0-flash" 
# Path to the GNN model file (if present)
GNN_MODEL_PATH = MODEL_DIR / "climaaudit_model.pt"

# --- POLICY SIMULATION CONSTANTS ---

# EU Countries (ISO3 codes)
EU_COUNTRIES = [
    'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
    'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
    'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'
]

# Developing Nations (for Technology Transfer scenarios)
DEVELOPING_NATIONS = [
    'IND', 'VNM', 'BGD', 'PAK', 'PHL', 'THA', 'IDN', 'CHN', 'NGA', 'EGY', 
    'KEN', 'ZAF', 'BRA', 'MEX', 'TUR'
]

# --- CONSTANTS ---
GLOBAL_AVG_EMISSION_INTENSITY = 50.0  # Baseline for heuristic scoring
ANOMALY_SCORE_BASE = 15.0
ANOMALY_SCORE_SCALAR = 0.5
MAX_ANOMALY_SCORE = 70.0
MIN_ANOMALY_SCORE = -15.0

# --- API CONSTANTS ---
DEFAULT_TIMEOUT_MS = 120000 
