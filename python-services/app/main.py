# python-services/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import numpy as np
from typing import Any, Union, Dict, List, Optional
import torch
import os
import uuid
import asyncio

# Import the new V2.0 architecture
# UPDATED: Importing ClimaAuditGNN to match the prompt's architecture
from models.hetero_gnn import ClimaAuditGNN 
from app.config import (
    DATA_DIR, MODEL_DIR, GNN_MODEL_PATH, 
    GLOBAL_AVG_EMISSION_INTENSITY, ANOMALY_SCORE_BASE, 
    ANOMALY_SCORE_SCALAR, MAX_ANOMALY_SCORE, MIN_ANOMALY_SCORE
)

# Import Services & Engines
from services.data_engine import get_data_engine
from app.policy_simulator import PolicySimulator
from app.advanced_policy_engine import AdvancedPolicyEngine
from app.marl_engine import DiplomaticSandbox
from app.llm_analyst import LLMAnalystEngine

from pydantic import BaseModel
# Re-import specific types needed for PyTorch Geometric
try:
    from torch_geometric.data import HeteroData
except ImportError:
    print("WARNING: torch_geometric not installed. GNN features will fail.")

# --- DATA MODELS ---

class ShapleyRequest(BaseModel):
    target_country: str
    producer_ratio: float = 0.6

class TariffScenario(BaseModel):
    source: str
    target: str
    tariff_rate: float
    sector: str         

class PolicySimulationRequest(BaseModel):
    policy_type: str  # "CBAM", "TECH_TRANSFER", or "FAIRNESS_DIAL"
    severity: float = 0.2  # 0.0 to 1.0
    target_countries: Optional[List[str]] = None
    attribution_mode: str = "shapley"  # For FAIRNESS_DIAL: "producer", "consumer", or "shapley"

class BilateralOptimizationRequest(BaseModel):
    src_iso: str
    tgt_iso: str
    sector: Optional[str] = None
    max_gdp_loss_pct: float = 0.15
    elasticity: float = 0.8

class CustomAttributionRequest(BaseModel):
    target_country: str
    split_ratio: float = 0.6  # 0.0 to 1.0 (0.6 = 60% producer, 40% consumer)
    sector: Optional[str] = None

class DiplomacyStartRequest(BaseModel):
    player_iso: str
    rival_iso: str

class DiplomacyTurnRequest(BaseModel):
    player_iso: str
    rival_iso: str
    action_type: str  # "TARIFF", "SANCTION"
    sector: str
    severity: float  # 0.0 to 1.0

# LLM Analysis Request Models
class PolicyAnalysisRequest(BaseModel):
    policy_type: str
    severity: float
    metrics: Dict
    context: Optional[Dict] = None

class ShapleyAnalysisRequest(BaseModel):
    target_country: str
    allocations: Dict
    contributors: List
    total_co2_kt: float

class DiplomaticAnalysisRequest(BaseModel):
    player_iso: str
    rival_iso: str
    turn_summary: Dict
    ai_persona: str

class BilateralAnalysisRequest(BaseModel):
    source: str
    target: str
    sector: str
    policy: Dict
    upstream_impact: List

class AnomalyAnalysisRequest(BaseModel):
    anomalies: List[Dict]

class ChatRequest(BaseModel):
    conversation_history: List
    user_question: str
    context_data: Dict

# --- HELPER FUNCTIONS ---

def clean_df_for_json(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].replace([np.nan, np.inf, -np.inf, pd.NaT], 0.0)
        try:
            df[col] = df[col].astype(float)
        except:
            pass
    for col in df.select_dtypes(exclude=[np.number]).columns:
        df[col] = df[col].replace({np.nan: None, pd.NaT: None})
    return df

# --- APP INITIALIZATION ---

app = FastAPI(title="ClimaAuditX API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GLOBAL STATE ---
model = None
data = None
iso_to_idx = {}
nodes_df_v2 = None
data_engine = None
advanced_engine = None
sandbox_engine = None
llm_analyst = None

# --- STARTUP EVENT ---

@app.on_event("startup")
async def load_resources():
    global model, data, iso_to_idx, nodes_df_v2, data_engine, advanced_engine, sandbox_engine, llm_analyst
    
    print("🚀 Starting ClimaAuditX 2.0 Backend...")
    
    # 1. Load Data Engine
    try:
        data_engine = get_data_engine(DATA_DIR)
        print("✅ Data Engine Initialized")
    except Exception as e:
        print(f"⚠️  WARNING: Data Engine initialization failed: {e}")

    # 2. Load Graph Data & Model
    print("Loading graph data...")
    try:
        data = HeteroData()
        nodes_path = DATA_DIR / "nodes_final.csv"
        
        if nodes_path.exists():
            nodes_df_v2 = pd.read_csv(nodes_path)
            # Normalize ISO codes
            nodes_df_v2['iso3'] = nodes_df_v2['iso3'].astype(str).str.strip().str.upper()
            iso_to_idx = {iso: i for i, iso in enumerate(nodes_df_v2['iso3']) if pd.notna(iso) and iso != 'NAN'}
            
            # Load features
            features = torch.tensor(nodes_df_v2[['gdp', 'mva']].values, dtype=torch.float)
            if features.shape[0] > 1:
                features = (features - features.mean(dim=0)) / (features.std(dim=0) + 1e-6)
            else:
                features = features # Avoid div by zero if only 1 node

            data['country'].x = features
            data['country'].y = torch.tensor(nodes_df_v2['energy_intensity'].values).view(-1, 1)
            
            print(f"✅ Loaded {len(iso_to_idx)} countries nodes")
        else:
            print("⚠️  WARNING: nodes_final.csv not found!")

        # Load edges
        sectors = [
            'agriculture', 'aircraft', 'cement', 'chemicals', 'electronics', 
            'energy', 'iron_articles', 'precious_metals', 'ships', 'steel', 
            'textiles', 'vehicles', 'wood'
        ]
        edge_count = 0
        for sector in sectors:
            for flow in ['direct', 'reexport']:
                fpath = DATA_DIR / f'processed_{sector}_{flow}.csv'
                if fpath.exists():
                    try:
                        df = pd.read_csv(fpath, low_memory=False)
                        # Filter valid edges
                        valid = df['src_iso'].isin(iso_to_idx) & df['tgt_iso'].isin(iso_to_idx)
                        df = df[valid]
                        
                        src = [iso_to_idx[c] for c in df['src_iso']]
                        dst = [iso_to_idx[c] for c in df['tgt_iso']]
                        
                        if src:
                            edge_type = f'{sector}_{flow}'
                            data['country', edge_type, 'country'].edge_index = \
                                torch.tensor([src, dst], dtype=torch.long)
                            edge_count += len(src)
                    except Exception as ex:
                        print(f"Failed loading {fpath.name}: {ex}")
        print(f"✅ Loaded {edge_count} edges into HeteroData")
        
        # Load Model (After data so we have metadata)
        print("Loading model...")
        try:
            if data is not None:
                # Instantiate model architecture first
                model = ClimaAuditGNN(hidden_dim=64, out_dim=1, metadata=data.metadata())
                state_dict = torch.load(GNN_MODEL_PATH, map_location='cpu')
                model.load_state_dict(state_dict)
                model.eval()
                print("✅ Model CLIMAAUDIT_V2 Loaded (State Dict)")
            else:
                 print("⚠️  Data not loaded, skipping model load.")
        except Exception as e:
            print(f"⚠️  WARNING: Failed to load model {GNN_MODEL_PATH}: {e}")
            model = None

    except Exception as e:
        print(f"⚠️  WARNING: Error constructing V2 Graph Data: {e}")

    # 3. Initialize Advanced Policy Engine
    try:
        if nodes_df_v2 is not None and not data_engine.edges.empty:
             edges_for_engine = data_engine.edges.copy()
             # Standardize column names
             if 'source_iso3' in edges_for_engine.columns: edges_for_engine['src_iso'] = edges_for_engine['source_iso3']
             if 'target_iso3' in edges_for_engine.columns: edges_for_engine['tgt_iso'] = edges_for_engine['target_iso3']
             if 'value' in edges_for_engine.columns: edges_for_engine['primaryValue'] = edges_for_engine['value']
             
             advanced_engine = AdvancedPolicyEngine(
                nodes_df=nodes_df_v2.copy(),
                edges_df=edges_for_engine
             )
             print("✅ Advanced Policy Engine Initialized")
    except Exception as e:
        print(f"⚠️  WARNING: Advanced Policy Engine init failed: {e}")

    # 4. Initialize Diplomatic Sandbox
    try:
        if data_engine is not None:
            sandbox_engine = DiplomaticSandbox(data_engine)
            print("✅ Diplomatic Sandbox Initialized")
    except Exception as e:
        print(f"⚠️  WARNING: Diplomatic Sandbox init failed: {e}")

    # 5. Initialize LLM Analyst
    try:
        llm_analyst = LLMAnalystEngine()
        print("✅ LLM Analyst Engine Initialized")
    except Exception as e:
        print(f"⚠️  WARNING: LLM Analyst Engine init failed: {e}")


# --- API ENDPOINTS ---

@app.get("/")
def root():
    return {"message": "ClimaAuditX API v2.0", "status": "operational"}

@app.get("/api/countries")
def get_countries():
    """List all available countries"""
    return {
        "countries": list(iso_to_idx.keys()) if iso_to_idx else [],
        "count": len(iso_to_idx)
    }

@app.get("/api/audit/anomalies")
def get_top_anomalies():
    """
    Returns top anomalies. Uses Model prediction if available, else Heuristic.
    Keeps compatibility with existing Dashboard.
    """
    if nodes_df_v2 is not None:
        try:
            nodes = nodes_df_v2.copy()
            anomaly_scores = []
            
            # Try using GNN Model Prediction
            if model is not None and data is not None:
                try:
                    with torch.no_grad():
                        # Get predictions (Predicted Energy Intensity)
                        pred = model(data.x_dict, data.edge_index_dict).cpu().numpy().flatten()
                        
                    # Calculate deviation from Reported
                    reported = nodes['energy_intensity'].fillna(0).values
                    # Score = Deviation. Positive = Under-reporting (Predicted > Reported)
                    # We want to flag those who say they are clean but are not.
                    raw_scores = (pred - reported)
                    
                    # Normalize for display
                    anomaly_scores = raw_scores.tolist()
                except Exception as e:
                    print(f"Model inference failed for anomalies, falling back to heuristic: {e}")
                    # Fallback Logic
                    for idx, row in nodes.iterrows():
                         ei = row.get('energy_intensity', 0)
                         deviation = ei - GLOBAL_AVG_EMISSION_INTENSITY
                         anomaly_scores.append(deviation * ANOMALY_SCORE_SCALAR)
            else:
                 # Standard Heuristic Fallback
                 for idx, row in nodes.iterrows():
                     ei = row.get('energy_intensity', 0)
                     deviation = ei - GLOBAL_AVG_EMISSION_INTENSITY
                     anomaly_scores.append(deviation * ANOMALY_SCORE_SCALAR)
            
            nodes["anomaly_score"] = anomaly_scores
            nodes["gdp_usd"] = nodes["gdp"].fillna(0)
            nodes["co2_emissions_kt"] = nodes["energy_intensity"].fillna(0)
            
            nodes_cleaned = clean_df_for_json(nodes)
            
            top_pos_df = nodes_cleaned.sort_values("anomaly_score", ascending=False).head(5)
            # "Negative" means Over-reporting (Reported > Predicted) or clean
            top_neg_df = nodes_cleaned.sort_values("anomaly_score", ascending=True).head(5)
            
            return {
                "top_positive": top_pos_df.to_dict(orient="records"),
                "top_negative": top_neg_df.to_dict(orient="records"),
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=503, detail="V2 Data not loaded")


@app.get("/api/audit/{country_code}")
def get_audit(country_code: str):
    """Get greenwashing audit for a country using AI Model"""
    country_code = country_code.strip().upper()
    
    if country_code not in iso_to_idx:
        raise HTTPException(status_code=404, detail=f"Country {country_code} not found")
    
    idx = iso_to_idx[country_code]
    row = nodes_df_v2.iloc[idx]
    
    # Get reported value
    reported = float(data['country'].y[idx].item()) if data else float(row.get('energy_intensity', 0))
    
    predicted = reported # Default if model fails
    status = "UNKNOWN"
    deviation = 0.0

    if model is not None and data is not None:
        try:
            with torch.no_grad():
                predicted = float(model(data.x_dict, data.edge_index_dict)[idx].item())
            
            # Calculate deviation
            if reported != 0:
                deviation = ((predicted - reported) / reported) * 100
            else:
                deviation = 0.0
            
            # Determine status
            if abs(deviation) < 5:
                status = "CONSISTENT"
            elif deviation > 20:
                status = "POTENTIAL UNDER-REPORTING"
            elif deviation < -20:
                status = "POSSIBLE OVER-REPORTING"
            else:
                status = "MINOR DEVIATION"
        except Exception as e:
            print(f"Prediction failed: {e}")
    
    # Get standard contributors for display
    real_contributors = data_engine.get_clean_contributors(country_code)
    if not real_contributors:
         real_contributors = [{"partner": "Domestic", "share": "100%", "role": "Producer", "score": 0}]

    return {
        "iso": country_code,
        "iso3": country_code,
        "country_name": country_code,
        "reported_intensity": round(reported, 2),
        "predicted_intensity": round(predicted, 2),
        "deviation": round(deviation, 2),
        "status": status,
        "risk_score": float(predicted), # Use predicted as risk score
        "supply_chain_role": "analyzed",
        "contributors": real_contributors,
        # Legacy fields for frontend compatibility
        "gdp": float(row.get('gdp', 0)),
        "co2": reported,
        "anomaly_score": float(deviation)
    }

@app.get("/api/shapley/{country_code}")
def get_shapley(country_code: str, top_n: int = 10):
    """Calculate Shapley values for carbon attribution using Leave-One-Out approximation"""
    country_code = country_code.strip().upper()
    
    if country_code not in iso_to_idx:
        raise HTTPException(status_code=404, detail=f"Country {country_code} not found")
        
    if model is None or data is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    target_idx = iso_to_idx[country_code]

    # Find all partners
    partners = {}
    for edge_type in data.edge_types:
        src, dst = data[edge_type].edge_index
        # Find edges pointing to target_idx
        sender_indices = src[dst == target_idx].tolist()
        
        sector_name = edge_type[1].split('_')[0]
        role = "Middleman" if "reexport" in edge_type[1] else "Producer"
        
        for p_idx in sender_indices:
            if p_idx not in partners:
                partners[p_idx] = {'role': role, 'sector': sector_name}

    # Calculate baseline
    with torch.no_grad():
        baseline = model(data.x_dict, data.edge_index_dict)[target_idx].item()

    # Leave-one-out
    shapley_scores = []
    idx_to_iso = {v: k for k, v in iso_to_idx.items()}

    # If too many partners, sample top 20 for performance?
    # For now, do all, but it might be slow.
    partner_indices = list(partners.keys())
    if len(partner_indices) > 30:
        # Optimization: Just take first 30 (random-ish due to dict)
        # Real solution would be to pick highest trade volume partners first
        partner_indices = partner_indices[:30]

    for p_idx in partner_indices:
        info = partners[p_idx]
        
        # Backup edges
        original_edges = {}
        for et in data.edge_types:
            original_edges[et] = data[et].edge_index.clone()
            src, dst = data[et].edge_index
            # Mask out edges from this partner to target
            mask = ~((src == p_idx) & (dst == target_idx))
            data[et].edge_index = data[et].edge_index[:, mask]
        
        # Predict without partner
        try:
            with torch.no_grad():
                new_pred = model(data.x_dict, data.edge_index_dict)[target_idx].item()
        except:
            new_pred = baseline # Fail safe
            
        impact = max(0, baseline - new_pred)
        
        shapley_scores.append({
            "partner": idx_to_iso.get(p_idx, "UNKNOWN"),
            "value": round(impact, 4),
            "role": info['role'],
            "sector": info['sector']
        })
        
        # Restore edges
        for et in data.edge_types:
            data[et].edge_index = original_edges[et]

    # Sort and return top N
    shapley_scores.sort(key=lambda x: x['value'], reverse=True)

    return {
        "country": country_code,
        "baseline_intensity": round(baseline, 2),
        "partners": shapley_scores[:top_n]
    }

@app.post("/api/simulate")
def simulate_tariff(scenario: TariffScenario):
    """Simulate tariff impact on emissions"""
    source = scenario.source.upper()
    target = scenario.target.upper()
    # Simple simulation: Remove X% of trade volume
    reduction_factor = scenario.tariff_rate * 0.5  # Assume 50% pass-through

    # Find trade volume
    sector_file = DATA_DIR / f'processed_{scenario.sector}_direct.csv'
    if not sector_file.exists():
         raise HTTPException(status_code=404, detail=f"Sector data {scenario.sector} not found")
         
    df = pd.read_csv(sector_file)

    trade_flow = df[(df['src_iso'] == source) & (df['tgt_iso'] == target)]

    if trade_flow.empty:
        raise HTTPException(status_code=404, detail="No trade relationship found")

    original_value = float(trade_flow['primaryValue'].sum())
    carbon_intensity = 0.5  # kg CO2 per USD (simplified heuristic)

    direct_impact = original_value * reduction_factor
    carbon_reduction = direct_impact * carbon_intensity / 1e6  # Convert to kt

    return {
        "scenario": {
            "source": source,
            "target": target,
            "tariff_rate": f"{scenario.tariff_rate*100}%",
            "sector": scenario.sector
        },
        "impact": {
            "trade_reduction_usd": round(direct_impact / 1e6, 2),  # Millions
            "carbon_reduction_kt": round(carbon_reduction, 2),
            "economic_cost": round(direct_impact / 1e6 * 1.2, 2)  # Include ripple
        }
    }

@app.get("/api/network")
def get_network():
    """Get full network graph for visualization (Lightweight version)"""
    nodes = []
    edges = []
    
    if iso_to_idx and data:
         # Build nodes
         for iso, idx in iso_to_idx.items():
             try:
                intensity = float(data['country'].y[idx].item())
                gdp = 0
                if nodes_df_v2 is not None:
                     gdp_rows = nodes_df_v2.loc[nodes_df_v2['iso3'] == iso, 'gdp']
                     if not gdp_rows.empty:
                         gdp = float(gdp_rows.values[0])
                
                nodes.append({
                    "id": iso,
                    "intensity": round(intensity, 2),
                    "gdp": gdp
                })
             except:
                 continue

         # Build edges (sample for performance)
         for edge_type in data.edge_types:
             src, dst = data[edge_type].edge_index
             sector = edge_type[1].split('_')[0]
             
             # Sample 100 edges per type for visualization speed
             indices = np.random.choice(len(src), min(100, len(src)), replace=False)
             
             idx_to_iso = {v: k for k, v in iso_to_idx.items()}
             
             for i in indices:
                 s_idx = int(src[i].item())
                 d_idx = int(dst[i].item())
                 if s_idx in idx_to_iso and d_idx in idx_to_iso:
                     edges.append({
                         "source": idx_to_iso[s_idx],
                         "target": idx_to_iso[d_idx],
                         "sector": sector
                     })
    return {
        "nodes": nodes,
        "edges": edges
    }

# --- PREVIOUS ENDPOINTS (Maintained for UI Compatibility) ---

@app.post("/api/calculate/shapley")
async def calculate_shapley_legacy(payload: ShapleyRequest):
    # Map old endpoint to new logic if possible, or keep old volume-weighted logic
    # The prompt actually replaced the shapley logic in its explanation, but the UI might still use this path.
    # We will maintain the old volume-weighted logic here as it's what the UI likely expects for the "Standard Breakdown"
    # while the new endpoint /api/shapley/{country} provides the Model-Based Attribution.
    
    target = payload.target_country.strip().upper()
    if target not in iso_to_idx:
        raise HTTPException(status_code=404, detail="Country not found")
    
    # Use DataEngine for classic volume-based stats
    std_contributors = data_engine.get_clean_contributors(target, weight_col='primaryValue')
    
    allocations = {}
    contributors_list = []
    producer_ratio = payload.producer_ratio
    allocations["SELF"] = producer_ratio * 100.0
    remaining = (1.0 - producer_ratio) * 100.0
    
    if std_contributors:
        total_std = sum(c['raw_score'] for c in std_contributors)
        for c in std_contributors[:20]:
            partner = c['partner']
            std_pct = c['raw_score']
            final_std_share = (std_pct / total_std) * remaining if total_std > 0 else 0
            allocations[partner] = final_std_share
            contributors_list.append({
                "partner": partner,
                "role": c['role_desc'],
                "share": f"{final_std_share:.1f}%",
                "mc_share": "0%",
                "risk_diff": 0,
                "score": c['volume']
            })
            
    return {
        "allocations": allocations,
        "contributors": contributors_list,
        "meta": {"target_country": target}
    }

@app.get("/api/graph")
def get_graph_data():
    """Returns 3D Graph Data using the central DataEngine (REAL CSV DATA)."""
    try:
        # Delegate to Data Engine to ensure consistency with loaded sectors
        return data_engine.get_graph_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/simulate/policy")
async def simulate_policy(payload: PolicySimulationRequest):
    try:
        if data_engine.edges.empty: raise HTTPException(status_code=503, detail="Edge data not loaded")
        simulator = PolicySimulator(
            data_engine=data_engine,
            nodes_df=nodes_df_v2.copy(),
            edges_df=data_engine.edges.copy(),
            iso_to_idx=iso_to_idx
        )
        result = simulator.simulate_policy(
            policy_type=payload.policy_type,
            severity=payload.severity,
            target_countries=payload.target_countries,
            attribution_mode=payload.attribution_mode
        )
        
        # Convert result back to graph format (省略 impl detail, relying on logic similar to original)
        # For brevity, returning result directly as frontend likely handles it
        # Actually frontend handles specific graph format, so we need to rebuild graph response
        # Using simplified response for now to ensure endpoint works
        return {
             "original": get_graph_data(), # Re-use current graph
             "simulated": { 
                 "nodes": [
                     {
                         "id": str(n.get('iso3','')).strip().upper(),
                         "iso3": str(n.get('iso3','')).strip().upper(),
                         "label": str(n.get('iso3','')).strip().upper(),
                         "gdp_usd": float(n.get('gdp', 0)),
                         "co2": float(n.get('energy_intensity', 0)),
                         "node_color_override": n.get('node_color_override')
                     }
                     for n in result.get("simulated_nodes", [])
                     if str(n.get('iso3','')).strip().upper()
                 ],
                 "links": [
                     {
                         "source": str(e.get('src_iso') or e.get('source_iso3') or e.get('source', '')).strip().upper(),
                         "target": str(e.get('tgt_iso') or e.get('target_iso3') or e.get('target', '')).strip().upper(),
                         "value": float(e.get('primaryValue') or e.get('value', 0)),
                         "primaryValue": float(e.get('primaryValue') or e.get('value', 0)),
                         "sector": e.get('sector', 'General'),
                         "edge_color": e.get('edge_color')
                     }
                     for e in result.get("simulated_edges", [])
                     if (e.get('src_iso') or e.get('source_iso3') or e.get('source')) and 
                        (e.get('tgt_iso') or e.get('target_iso3') or e.get('target'))
                 ]
             },
             "policy_type": result["policy_type"],
             "metrics": result["metrics"],
             "severity": payload.severity
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/optimize/bilateral")
async def optimize_bilateral_policy(payload: BilateralOptimizationRequest):
    if advanced_engine is None: raise HTTPException(status_code=503, detail="Advanced Policy Engine not available")
    return advanced_engine.generate_optimal_bilateral_policy(
        src_iso=payload.src_iso.strip().upper(),
        tgt_iso=payload.tgt_iso.strip().upper(),
        sector=payload.sector,
        max_gdp_loss_pct=payload.max_gdp_loss_pct,
        elasticity=payload.elasticity
    )

@app.post("/api/simulate/custom-attribution")
async def simulate_custom_attribution(payload: CustomAttributionRequest):
    if advanced_engine is None: raise HTTPException(status_code=503, detail="Advanced Policy Engine not available")
    return advanced_engine.simulate_custom_split(
        target_country=payload.target_country.strip().upper(),
        split_ratio=payload.split_ratio,
        sector=payload.sector
    )

@app.post("/api/diplomacy/start")
def start_diplomacy(payload: DiplomacyStartRequest):
    if sandbox_engine is None: raise HTTPException(status_code=503, detail="Diplomatic Sandbox not available")
    return sandbox_engine.start_scenario(payload.player_iso.upper(), payload.rival_iso.upper())

@app.post("/api/diplomacy/turn")
def play_turn(payload: DiplomacyTurnRequest):
    if sandbox_engine is None: raise HTTPException(status_code=503, detail="Diplomatic Sandbox not available")
    return sandbox_engine.process_turn(
        payload.player_iso.upper(), payload.rival_iso.upper(),
        payload.action_type, payload.sector, payload.severity
    )

@app.get("/api/diplomacy/matchup")
@app.get("/api/diplomacy/matchup")
def get_matchup_context(player: str, rival: str, carbon_price: float = 85.0, accountability_weight: float = 0.0):
    """
    Returns CBAM Fairness Analysis with Shared Accountability.
    accountability_weight: 0.0 (Pure Production) -> 1.0 (Pure Consumption).
    """
    if data_engine is None:
        raise HTTPException(status_code=503, detail="Data Engine not initialized")
        
    player = player.upper().strip()
    rival = rival.upper().strip()
    
    try:
        # 1. Get Base Data
        p_node = data_engine.get_node(player)
        r_node = data_engine.get_node(rival)
        
        # Production Intensities (Base)
        p_prod = float(p_node.get('energy_intensity', 0))
        r_prod = float(r_node.get('energy_intensity', 0))
        
        # Consumption Intensities (Calculated)
        p_cons, p_imp, p_exp = data_engine.calculate_consumer_intensity(player)
        r_cons, r_imp, r_exp = data_engine.calculate_consumer_intensity(rival)
        
        # 2. Apply Accountability Weight
        # Weight is 0.0 to 1.0.
        # If w=0, outcome = p_prod.
        # If w=1, outcome = p_cons.
        # If w=0.5, outcome = Average.
        
        w_cons = max(0.0, min(1.0, accountability_weight)) # Clamp
        w_prod = 1.0 - w_cons
        
        p_final = (p_prod * w_prod) + (p_cons * w_cons)
        r_final = (r_prod * w_prod) + (r_cons * w_cons)

        # 3. Calculate Carbon Gap (Rival - Player)
        carbon_gap = r_final - p_final
        
        # 4. Calculate Fair Tariff
        # Logic: Gap (T/$M GDP) * Price ($/T) = Cost
        SCALING_FACTOR = 0.005 
        
        fair_tariff = 0.0
        if carbon_gap > 0:
            fair_tariff = (carbon_gap * carbon_price * SCALING_FACTOR)
            fair_tariff = min(fair_tariff, 50.0) # Cap at 50%
        
        # 5. Scenario Context (Dynamic Text)
        scenario_context = "Standard bilateral trade comparison."
        if carbon_gap > 30:
            scenario_context = "Significant Carbon Intensity Gap. High risk of carbon leakage if tariffs are not applied to equalize costs."
        elif carbon_gap > 10:
            scenario_context = "Moderate Carbon Intensity Gap. A calibrated tariff is recommended to maintain competitiveness."
        elif carbon_gap > -10:
            scenario_context = "Emissions intensities are comparable. Minimal intervention required; focus on technical standards."
        else:
            scenario_context = "Partner is cleaner than domestic production. Import tariffs would likely be challenged as protectionist."

        # 6. Leakage Risk
        return {
            "player": {
                "iso": player, 
                "intensity": p_final,
                "raw_production": p_prod,
                "raw_consumption": p_cons
            },
            "rival": {
                "iso": rival, 
                "intensity": r_final,
                 "raw_production": r_prod,
                "raw_consumption": r_cons
            },
            "analysis": {
                "carbon_gap": carbon_gap,
                "fair_tariff_rate": fair_tariff,
                "carbon_price_used": carbon_price,
                "accountability_weight": w_cons,
                "leakage_risk": "HIGH" if carbon_gap < 0 else "LOW",
                "scenario_context": scenario_context
            }
        }
    except Exception as e:
        print(f"Matchup Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    except Exception as e:
        print(f"Matchup error: {e}")
        # Return safe defaults if lookup fails
        return {
             "player": {"iso": player, "intensity": 100},
             "rival": {"iso": rival, "intensity": 100},
             "analysis": {
                 "carbon_gap": 0, 
                 "recommended_tariff": 0, 
                 "scenario_type": "Unknown",
                 "is_compliant": True
             }
        }

# --- LLM ENDPOINTS ---

@app.post("/api/llm/analyze-policy")
async def analyze_policy(request: PolicyAnalysisRequest):
    if llm_analyst is None: raise HTTPException(status_code=503, detail="LLM Analyst not available")
    return {"status": "success", "analysis": llm_analyst.analyze_policy_simulation(request.dict())}

@app.post("/api/llm/analyze-shapley")
async def analyze_shapley(request: ShapleyAnalysisRequest):
    if llm_analyst is None: raise HTTPException(status_code=503, detail="LLM Analyst not available")
    return {"status": "success", "analysis": llm_analyst.analyze_shapley_attribution(request.dict())}

@app.post("/api/llm/analyze-diplomatic")
async def analyze_diplomatic(request: DiplomaticAnalysisRequest):
    if llm_analyst is None: raise HTTPException(status_code=503, detail="LLM Analyst not available")
    return {"status": "success", "analysis": llm_analyst.analyze_diplomatic_turn(request.dict())}

@app.post("/api/llm/analyze-bilateral")
async def analyze_bilateral(request: BilateralAnalysisRequest):
    if llm_analyst is None: raise HTTPException(status_code=503, detail="LLM Analyst not available")
    return {"status": "success", "analysis": llm_analyst.analyze_bilateral_optimization(request.dict())}

@app.post("/api/llm/analyze-anomalies")
async def analyze_anomalies(request: AnomalyAnalysisRequest):
    if llm_analyst is None: raise HTTPException(status_code=503, detail="LLM Analyst not available")
    return {"status": "success", "analysis": llm_analyst.analyze_graph_anomalies(request.dict())}

@app.post("/api/llm/chat")
async def llm_chat(request: ChatRequest):
    if llm_analyst is None: raise HTTPException(status_code=503, detail="LLM Analyst not available")
    return {"status": "success", "analysis": llm_analyst.chat(request.conversation_history, request.user_question, request.context_data)}
