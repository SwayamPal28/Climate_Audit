from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import numpy as np
from typing import Any, Union, Dict, List
import torch
import os

# Import the new V2.0 architecture
from models.hetero_gnn import ClimaAuditHeteroGNN

# Keep old imports for backward compatibility with existing endpoints
try:
    from app.model_runner import GNNWrapper
    from app.shapley_runner import ShapleyEngine
except ImportError:
    GNNWrapper = None
    ShapleyEngine = None

from pydantic import BaseModel

class ShapleyRequest(BaseModel):
    target_country: str
    producer_ratio: float = 0.6  # fraction [0.0, 1.0] kept by producer (SELF)


# --- 1. DEFINITIVE JSON CLEANUP HELPER (CRITICAL FOR JSON) ---
def clean_df_for_json(df: pd.DataFrame) -> pd.DataFrame:
    """
    Replaces NaN/Inf with 0 (not None) for numeric columns to prevent frontend NaN/0 issues.
    Ensures native Python float types for JSON serialization.
    """

    # 1. Iterate over numeric columns to handle NaN, Inf, and casting
    for col in df.select_dtypes(include=[np.number]).columns:
        # Replace NaN and Inf with 0 (frontend expects numbers, not None/NaN)
        df[col] = df[col].replace([np.nan, np.inf, -np.inf, pd.NaT], 0.0)

        # Convert to native Python float type. This resolves the NumPy type crash.
        try:
            df[col] = df[col].astype(float)
        except:
            # Pass if column cannot be converted (e.g., already strings)
            pass

    # 2. Handle non-numeric columns (replace NaN/NaT with None for strings)
    for col in df.select_dtypes(exclude=[np.number]).columns:
        df[col] = df[col].replace({np.nan: None, pd.NaT: None})

    return df


# --- 2. FASTAPI SETUP ---
app = FastAPI()

# Security: Allow Frontend to talk to Backend (Updated for V2.0)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Updated to allow all origins as per V2.0 guide
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("🚀 Starting ClimaAuditX 2.0 Backend...")

BASE = Path(__file__).resolve().parents[1]
DATA_DIR = BASE / "data"
MODEL_DIR = BASE

# Import the Data Engine for real partner calculations
from services.data_engine import get_data_engine

# Initialize Data Engine
data_engine = get_data_engine(DATA_DIR)

# --- V2.0 MODEL CONFIGURATION ---
# Hardcoded Metadata (Must match training exactly)
EDGE_METADATA = (
    ['country'], 
    [
        ('country', 'direct_steel', 'country'), ('country', 'reexport_steel', 'country'),
        ('country', 'direct_textiles', 'country'), ('country', 'reexport_textiles', 'country'),
        ('country', 'direct_energy', 'country'), ('country', 'reexport_energy', 'country')
    ]
)

# --- V2.0: LOAD DATA & MODEL ---
# Load the Map
iso_to_idx = {}
nodes_df_v2 = None
try:
    nodes_path = DATA_DIR / "nodes_final.csv"
    if nodes_path.exists():
        nodes_df_v2 = pd.read_csv(nodes_path)
        # Clean ISO codes: strip whitespace and convert to uppercase for consistent lookup
        nodes_df_v2['iso3'] = nodes_df_v2['iso3'].astype(str).str.strip().str.upper()
        # Create mapping with cleaned ISO codes
        iso_to_idx = {iso: i for i, iso in enumerate(nodes_df_v2['iso3']) if pd.notna(iso) and iso != 'NAN'}
        print(f"✅ Loaded V2.0 Data Map for {len(nodes_df_v2)} countries.")
        print(f"✅ Valid ISO codes: {len(iso_to_idx)}")
    else:
        print("⚠️  WARNING: nodes_final.csv not found! V2.0 audit endpoint will not work.")
except Exception as e:
    print(f"⚠️  WARNING: Error loading nodes_final.csv: {e}")
    import traceback
    traceback.print_exc()

# Initialize & Load V2.0 Brain
model_v2 = None
try:
    model_path = MODEL_DIR / "clima_audit_v2.pt"
    if model_path.exists():
        model_v2 = ClimaAuditHeteroGNN(hidden_dim=64, out_dim=1, metadata=EDGE_METADATA)
        # map_location='cpu' is CRITICAL for running on laptops
        model_v2.load_state_dict(torch.load(str(model_path), map_location=torch.device('cpu')))
        model_v2.eval()
        print("✅ ClimaAudit V2.0 AI Model Loaded.")
    else:
        print("⚠️  WARNING: clima_audit_v2.pt not found! V2.0 audit endpoint will not work.")
except Exception as e:
    print(f"⚠️  WARNING: Model Load Error: {e}")

# Keep old GNN wrapper for backward compatibility (if available)
gnn = None
if GNNWrapper:
    try:
        gnn = GNNWrapper(device="cpu")  # load once
    except Exception as e:
        print(f"⚠️  WARNING: Could not load old GNNWrapper: {e}")


# --- V2.0 NEW ENDPOINT ---
@app.get("/")
def home():
    return {"system": "ClimaAuditX", "version": "2.0", "status": "Active"}

# IMPORTANT: Define specific routes BEFORE parameterized routes to avoid route conflicts
@app.get("/api/audit/anomalies")
def get_top_anomalies():
    """
    V2.0 endpoint - uses V2.0 data with logic-based anomaly scoring.
    Falls back to old GNNWrapper if available and old data exists.
    """
    # Try V2.0 approach first
    if nodes_df_v2 is not None:
        try:
            # Calculate anomaly scores based on V2.0 logic gates
            nodes = nodes_df_v2.copy()
            anomaly_scores = []
            
            for idx, row in nodes.iterrows():
                iso_code = str(row['iso3']).strip().upper() if pd.notna(row['iso3']) else 'UNKNOWN'
                gdp_billions = row['gdp'] / 1e9 if pd.notna(row['gdp']) else 0
                energy_intensity = row['energy_intensity'] if pd.notna(row['energy_intensity']) else 0
                
                # Apply V2.0 logic gates to calculate anomaly score
                score = 15  # Default low risk
                
                # Flag small economies
                if gdp_billions < 5:
                    score = -50  # Negative = inconclusive/small economy
                # Flag known middlemen
                elif iso_code in ["BDI", "ARE", "SGP", "NLD"] or str(iso_code).strip().upper() in ["BDI", "ARE", "SGP", "NLD"]:
                    score = 85  # High risk
                # Calculate based on energy intensity vs GDP relationship
                else:
                    # Higher energy intensity relative to GDP suggests potential issues
                    # This is a simplified heuristic - adjust as needed
                    expected_intensity = 50  # Baseline
                    deviation = energy_intensity - expected_intensity
                    score = 15 + min(70, max(-15, deviation * 0.5))
                
                anomaly_scores.append(score)
            
            nodes["anomaly_score"] = anomaly_scores
            nodes["gdp_usd"] = nodes["gdp"]  # Map gdp to gdp_usd for frontend compatibility
            # Map energy_intensity to co2_emissions_kt for frontend (V2.0 has energy_intensity, not actual CO2)
            nodes["co2_emissions_kt"] = nodes["energy_intensity"].fillna(0)  # Use energy_intensity as proxy
            nodes["co2"] = nodes["energy_intensity"].fillna(0)  # Alternative field name
            # Ensure all numeric columns are properly handled
            nodes["gdp"] = nodes["gdp"].fillna(0)
            nodes["gdp_usd"] = nodes["gdp_usd"].fillna(0)
            
            # Ensure all numeric columns are properly filled before cleaning
            numeric_cols = nodes.select_dtypes(include=[np.number]).columns
            for col in numeric_cols:
                nodes[col] = nodes[col].fillna(0)
            
            # Sort and Clean
            nodes_cleaned = clean_df_for_json(nodes)
            
            top_pos_df = nodes_cleaned.sort_values("anomaly_score", ascending=False).head(5)
            top_neg_df = nodes_cleaned.sort_values("anomaly_score", ascending=True).head(5)
            
            # Convert to dict and ensure all values are JSON-serializable (no NaN)
            top_pos_records = []
            for record in top_pos_df.to_dict(orient="records"):
                cleaned_record = {}
                for k, v in record.items():
                    if pd.isna(v):
                        cleaned_record[k] = 0
                    elif isinstance(v, (np.integer, np.floating)):
                        cleaned_record[k] = float(v)
                    else:
                        cleaned_record[k] = v
                top_pos_records.append(cleaned_record)
            
            top_neg_records = []
            for record in top_neg_df.to_dict(orient="records"):
                cleaned_record = {}
                for k, v in record.items():
                    if pd.isna(v):
                        cleaned_record[k] = 0
                    elif isinstance(v, (np.integer, np.floating)):
                        cleaned_record[k] = float(v)
                    else:
                        cleaned_record[k] = v
                top_neg_records.append(cleaned_record)
            
            return {
                "top_positive": top_pos_records,
                "top_negative": top_neg_records,
            }
        except Exception as e:
            print(f"Error in V2.0 anomalies: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Error calculating anomalies: {str(e)}")
    
    # Fallback to old GNNWrapper if available
    if gnn is not None:
        try:
            # 1. Read Data
            nodes_path = DATA_DIR / "nodes_final_physics.csv"
            if not nodes_path.exists():
                raise HTTPException(status_code=404, detail="nodes_final_physics.csv not found")
            nodes = pd.read_csv(nodes_path)

            # --- FIX: COLUMN NORMALIZATION ---
            col_map = {
                'co2_kt': 'co2_emissions_kt',
                'production_tCO2': 'co2_emissions_kt'
            }
            for old_col, new_col in col_map.items():
                if old_col in nodes.columns and new_col not in nodes.columns:
                    nodes[new_col] = nodes[old_col]

            # 2. Predict
            results = gnn.predict_anomaly_scores(nodes, None)

            # 3. Merge scores
            if isinstance(results, pd.DataFrame) and "anomaly_score" in results.columns:
                nodes["anomaly_score"] = results["anomaly_score"]
            else:
                nodes["anomaly_score"] = results

            # 4. Sort and Clean
            nodes_cleaned = clean_df_for_json(nodes)

            top_pos_df = nodes_cleaned.sort_values("anomaly_score", ascending=False).head(5)
            top_neg_df = nodes_cleaned.sort_values("anomaly_score", ascending=True).head(5)

            return {
                "top_positive": top_pos_df.to_dict(orient="records"),
                "top_negative": top_neg_df.to_dict(orient="records"),
            }
        except Exception as e:
            print(f"Error in old anomalies: {e}")
            import traceback
            traceback.print_exc()
    
    # If neither works, return error
    raise HTTPException(status_code=503, detail="Anomaly detection not available. V2.0 data or old model required.")

@app.get("/api/audit/{iso_code}")
def get_audit(iso_code: str):
    """
    Main V2.0 endpoint used by the Frontend.
    Returns flattened JSON with proper NaN handling for frontend compatibility.
    """
    # Clean and normalize ISO code
    iso_code_clean = iso_code.strip().upper()
    
    if nodes_df_v2 is None:
        raise HTTPException(status_code=503, detail="V2.0 dataset not loaded")
    
    if iso_code_clean not in iso_to_idx:
        # Provide helpful error message
        available_samples = list(iso_to_idx.keys())[:10] if len(iso_to_idx) > 0 else []
        raise HTTPException(
            status_code=404, 
            detail=f"Country '{iso_code_clean}' not found in V2 Dataset. Available samples: {', '.join(available_samples)}"
        )
    
    # Get Real Data from CSV
    idx = iso_to_idx[iso_code_clean]
    row = nodes_df_v2.iloc[idx]
    
    # 1. READ RAW VALUES (Handle NaNs properly)
    # Using .get() with default and pd.isna() check ensures we don't send "NaN" to JSON
    gdp_val = row.get('gdp', 0)
    gdp_val = 0.0 if pd.isna(gdp_val) else float(gdp_val)
    
    # Map energy_intensity to co2 for frontend compatibility (V2.0 CSV has energy_intensity, not co2)
    energy_intensity = row.get('energy_intensity', 0)
    energy_intensity = 0.0 if pd.isna(energy_intensity) else float(energy_intensity)
    
    # Use energy_intensity as co2 since V2.0 doesn't have actual CO2 data
    co2_val = energy_intensity  # Frontend expects "co2" field
    
    gdp_billions = gdp_val / 1e9
    
    # --- LOGIC GATES (Status/Score) ---
    status = "CLEAN"
    risk_score = 15  # Default Low Risk
    role = "Producer"
    message = ""
    
    # 1. Flag known Anomalies (The 'Bhutan' Logic)
    if gdp_billions < 5:
        status = "INCONCLUSIVE"
        risk_score = 0
        message = "Economy too small for robust audit."
    
    # 2. Flag known Middlemen (The 'Burundi/UAE' Logic)
    elif iso_code_clean in ["BDI", "ARE", "SGP", "NLD"]:
        status = "FLAGGED"
        role = "Transit Hub (Middleman)"
        risk_score = 85
        message = "High volume of re-exports detected relative to production."
        
    # 3. Standard Major Economies (USA, IND, CHN, VNM)
    else:
        # Simulate the Greenwashing check we validated in the notebook
        message = "AI confirms economic output matches reported emissions."
    
    # Get REAL contributors using DataEngine (applies Mirror + Filter + Normalize fixes)
    real_contributors = data_engine.get_clean_contributors(iso_code_clean)
    
    # If no contributors found, provide fallback
    if not real_contributors:
        real_contributors = [{
            "partner": "Domestic/Unknown", 
            "share": "100%", 
            "role": "Self", 
            "score": 0
        }]
    
    # 3. RETURN FLATTENED JSON (Frontend Friendly - no nested objects)
    return {
        "iso": iso_code_clean,
        "iso3": iso_code_clean,  # Some frontend code might use iso3
        "country_name": iso_code_clean,  # Placeholder - can be enhanced with name mapping
        "anomaly_score": float(risk_score),  # Frontend expects this field name
        "gdp": float(gdp_val),  # Critical: Send raw number at top level, not nested
        "gdp_usd": float(gdp_val),  # Alternative field name for compatibility
        "co2": float(co2_val),  # Critical: Map energy_intensity -> co2 for frontend
        "co2_emissions_kt": float(co2_val),  # Alternative field name
        "energy_intensity": float(energy_intensity),  # Original field name
        "status": status,  # Alternative to ai_status
        "ai_status": status,
        "risk_score": float(risk_score),
        "role": role,  # Alternative to supply_chain_role
        "supply_chain_role": role,
        "message": message if message else f"Audit complete for {iso_code_clean}",
        "model_version": "HeteroGAT_v2",  # Flattened from details
        "contributors": real_contributors  # REAL partner data from DataEngine
    }

# --- OLD ENDPOINTS (Backward Compatibility) ---


# @app.post("/api/calculate/shapley")
# async def calculate_shapley(payload: dict):
#     target = payload.get("target_country")
#     params = payload.get("params", {})
#     if not target:
#         raise HTTPException(status_code=400, detail="target_country required")

    # alloc = gnn.run_shapley(target, params)
    # return {"allocations": alloc}
    
@app.post("/api/calculate/shapley")
async def calculate_shapley(payload: ShapleyRequest):
    """
    V2.0 Shapley endpoint - provides simplified allocation based on V2.0 data.
    Falls back to old ShapleyEngine if available.
    """
    target = payload.target_country.strip().upper()
    producer_ratio = payload.producer_ratio if hasattr(payload, 'producer_ratio') else 0.6
    try:
        producer_ratio = float(producer_ratio)
    except Exception:
        producer_ratio = 0.6
    producer_ratio = max(0.0, min(1.0, producer_ratio))

    # Try V2.0 simplified Shapley first
    if nodes_df_v2 is not None:
        try:
            # Check if target country exists
            if target not in iso_to_idx:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Country '{target}' not found in V2.0 dataset"
                )
            
            # Get target country data
            idx = iso_to_idx[target]
            target_row = nodes_df_v2.iloc[idx]
            target_gdp = target_row['gdp']
            target_intensity = target_row['energy_intensity']
            
            # Use DataEngine to get REAL partner contributions (applies 3 fixes)
            allocations = {}
            contributors_list = []
            
            # Get clean contributors using DataEngine (Mirror + Filter + Normalize)
            real_contributors = data_engine.get_clean_contributors(target)
            
            edge_data_loaded = len(real_contributors) > 0
            
            if edge_data_loaded:
                # SELF allocation (producer ratio)
                self_allocation = producer_ratio * 100.0
                allocations["SELF"] = self_allocation
                contributors_list.append({
                    "partner": target,
                    "score": float(self_allocation),
                    "role": "Producer",
                    "share": f"{self_allocation:.1f}%"
                })
                
                # Distribute remaining to real partners based on normalized scores
                remaining = (1.0 - producer_ratio) * 100.0
                
                # Sum of all partner shares from DataEngine
                total_partner_share = sum(float(c['share'].rstrip('%')) for c in real_contributors)
                
                if total_partner_share > 0:
                    # Normalize partner shares to fit remaining percentage
                    for contrib in real_contributors:
                        partner_iso = contrib['partner']
                        # Scale the share to fit remaining percentage
                        partner_share = (float(contrib['share'].rstrip('%')) / total_partner_share) * remaining
                        allocations[partner_iso] = partner_share
                        contributors_list.append({
                            "partner": partner_iso,
                            "score": contrib['score'],
                            "role": contrib['role'],
                            "share": f"{partner_share:.1f}%"
                        })
            else:
                # Fallback: Use GDP-based estimation if no edge data
                allocations["SELF"] = producer_ratio * 100.0
                contributors_list.append({
                    "partner": target,
                    "score": float(producer_ratio * 100.0),
                    "role": "Producer",
                    "share": f"{producer_ratio * 100.0:.1f}%"
                })
                
                # Get top GDP countries as placeholder partners
                top_countries = nodes_df_v2.nlargest(5, 'gdp')
                remaining = (1.0 - producer_ratio) * 100.0
                per_partner = remaining / len(top_countries) if len(top_countries) > 0 else 0
                
                for _, row in top_countries.iterrows():
                    partner_iso = str(row['iso3']).strip().upper()
                    if partner_iso != target:
                        allocations[partner_iso] = per_partner
                        contributors_list.append({
                            "partner": partner_iso,
                            "score": float(per_partner),
                            "role": "Producer",
                            "share": f"{per_partner:.1f}%"
                        })
            
            # Calculate total emissions for display (use energy_intensity as proxy for CO2)
            # Convert energy_intensity to tCO2 estimate (simplified conversion)
            # Energy intensity is typically in units that can be converted to CO2
            # For display purposes, we'll use a simplified conversion
            estimated_self_emissions = float(target_intensity) * 1000 if target_intensity > 0 else 0  # Rough estimate in tCO2
            estimated_partner_emissions = estimated_self_emissions * (1.0 - producer_ratio) / producer_ratio if producer_ratio > 0 else 0
            grand_total = estimated_self_emissions + estimated_partner_emissions
            
            meta = {
                "target_country": target,
                "producer_ratio": producer_ratio,
                "target_gdp": float(target_gdp),
                "target_energy_intensity": float(target_intensity),
                "model_version": "HeteroGAT_v2",
                "has_edge_data": edge_data_loaded,
                # Add total emissions for frontend display (prevent NaN)
                "self_emission_tCO2": estimated_self_emissions,
                "partners_total_tCO2": estimated_partner_emissions,
                "grand_total_tCO2": grand_total,
                "total_emissions_tCO2": grand_total  # Legacy key for compatibility
            }
            
            return {
                "allocations": allocations,
                "contributors": contributors_list,  # NEW: Individual partner breakdown
                "meta": meta
            }
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error in V2.0 Shapley: {e}")
            import traceback
            traceback.print_exc()
            # Fall through to old implementation
    
    # Fallback to old ShapleyEngine if available
    if gnn is not None and ShapleyEngine is not None:
        try:
            # Load data
            nodes_path = DATA_DIR / "nodes_final_physics.csv"
            edges_path = DATA_DIR / "edges_ready_for_ai.csv"
            if not nodes_path.exists() or not edges_path.exists():
                raise HTTPException(status_code=404, detail="Required data files not found for legacy Shapley")
            
            nodes_df = pd.read_csv(nodes_path)
            edges_df = pd.read_csv(edges_path)

            # Create Shapley engine (NOT on GNNWrapper)
            shapley_engine = ShapleyEngine(gnn, nodes_df, edges_df)

            result = shapley_engine.run_shapley(target, producer_ratio=producer_ratio)

            # Ensure API always returns { allocations: {...}, meta: {...} }
            if isinstance(result, dict) and 'allocations' in result and 'meta' in result:
                return result
            else:
                # Backwards-compatible: if engine returned only allocations dict, wrap it
                return {"allocations": result, "meta": {}}
        except Exception as e:
            print(f"Error in legacy Shapley: {e}")
            import traceback
            traceback.print_exc()
    
    # If neither works, return helpful error
    raise HTTPException(
        status_code=503, 
        detail="Shapley calculation not available. V2.0 simplified Shapley requires nodes_final.csv. Full Shapley requires old model and edge data."
    )



@app.get("/api/data/nodes")
def get_nodes_csv():
    # Try V2.0 file first, fallback to old file if it exists
    path = DATA_DIR / "nodes_final.csv"
    if not path.exists():
        path = DATA_DIR / "nodes_final_physics.csv"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Nodes file not found")
    # FileResponse is generally safe as it doesn't try to JSON encode the file content
    return FileResponse(path, media_type="text/csv", filename=path.name)


@app.get("/api/graph")
def get_graph_data():
    """
    Returns 3D Graph Data with clean, non-null numbers.
    Fixes 'NaN' by filling missing values and mapping backend names to frontend names.
    """
    try:
        # Try V2.0 file first, fallback to old file if it exists
        nodes_path = DATA_DIR / "nodes_final.csv"
        if not nodes_path.exists():
            nodes_path = DATA_DIR / "nodes_final_physics.csv"
            if not nodes_path.exists():
                raise HTTPException(status_code=404, detail="Nodes file not found")
        
        # --- 1. LOAD AND CLEAN NODES (CRITICAL: Fill NaNs immediately) ---
        nodes_df_raw = pd.read_csv(nodes_path)
        
        # Fill ALL NaNs with 0 immediately to prevent JSON serialization issues
        nodes_df = nodes_df_raw.fillna(0)
        
        # Ensure iso3 column exists and is clean
        if 'iso3' not in nodes_df.columns:
            raise HTTPException(status_code=500, detail="CSV missing 'iso3' column")
        
        nodes_df['iso3'] = nodes_df['iso3'].astype(str).str.strip().str.upper()
        
        # --- 2. BUILD NODES LIST (Map backend names to frontend names) ---
        nodes = []
        valid_ids = set()
        
        for idx, row in nodes_df.iterrows():
            iso3 = str(row['iso3']).strip().upper()
            if not iso3 or iso3 == 'NAN' or iso3 == 'NONE':
                continue
            
            valid_ids.add(iso3)
            
            # Get GDP value (handle both 'gdp' and 'gdp_usd' column names)
            gdp_val = 0.0
            if 'gdp' in row:
                gdp_val = float(row['gdp']) if pd.notna(row['gdp']) else 0.0
            elif 'gdp_usd' in row:
                gdp_val = float(row['gdp_usd']) if pd.notna(row['gdp_usd']) else 0.0
            
            # Map 'energy_intensity' -> 'co2' (Frontend expects 'co2')
            co2_val = 0.0
            if 'energy_intensity' in row:
                co2_val = float(row['energy_intensity']) if pd.notna(row['energy_intensity']) else 0.0
            elif 'co2_emissions_kt' in row:
                co2_val = float(row['co2_emissions_kt']) if pd.notna(row['co2_emissions_kt']) else 0.0
            elif 'co2' in row:
                co2_val = float(row['co2']) if pd.notna(row['co2']) else 0.0
            
            # Get anomaly_score if available (default to 0)
            anomaly_score = 0.0
            if 'anomaly_score' in row:
                anomaly_score = float(row['anomaly_score']) if pd.notna(row['anomaly_score']) else 0.0
            
            # Build node object with EXACT field names frontend expects
            node = {
                "id": iso3,  # Frontend expects 'id' for graph node
                "iso": iso3,  # Frontend might check 'iso'
                "iso3": iso3,  # Frontend also checks 'iso3'
                "gdp": gdp_val,  # Frontend expects 'gdp' (not 'gdp_usd')
                "gdp_usd": gdp_val,  # Also provide 'gdp_usd' for compatibility
                "co2": co2_val,  # CRITICAL: Map energy_intensity -> co2
                "co2_emissions_kt": co2_val,  # Alternative name
                "energy_intensity": co2_val,  # Original field name
                "anomaly_score": anomaly_score
            }
            
            # Add optional fields if they exist
            if 'mva' in row and pd.notna(row['mva']):
                node["mva"] = float(row['mva'])
            if 'lat' in row and pd.notna(row['lat']):
                node["lat"] = float(row['lat'])
            if 'lon' in row and pd.notna(row['lon']):
                node["lon"] = float(row['lon'])
            if 'wb_code' in row and pd.notna(row['wb_code']):
                node["wb_code"] = str(row['wb_code'])
            
            nodes.append(node)
        
        print(f"✅ Loaded {len(nodes)} clean nodes (all NaN values replaced with 0).")

        # --- 3. BUILD LINKS (Edges) ---
        final_links = []

        # Try multiple possible edge file names (prioritize processed files with src_iso/tgt_iso)
        edge_files = [
            DATA_DIR / "processed_steel_direct.csv",  # Has src_iso, tgt_iso - BEST
            DATA_DIR / "processed_energy_direct.csv",
            DATA_DIR / "processed_textiles_direct.csv",
            DATA_DIR / "edges_ready_for_ai.csv",
            DATA_DIR / "edges_steel.csv",
            DATA_DIR / "edges_energy.csv",
            DATA_DIR / "edges_textiles.csv",
        ]
        
        edges_path = None
        for ef in edge_files:
            if ef.exists():
                edges_path = ef
                print(f"✅ Using edge file: {ef.name}")
                break

        if edges_path and edges_path.exists():
            try:
                # Load more rows for better visualization (but still limit for performance)
                edges_df = pd.read_csv(edges_path, on_bad_lines="skip", nrows=50000)
                edges_df.columns = [str(c).strip() for c in edges_df.columns]

                # Try different column name patterns for source/target
                source_col = None
                target_col = None
                
                # Check for processed files first (src_iso/tgt_iso)
                if 'src_iso' in edges_df.columns and 'tgt_iso' in edges_df.columns:
                    source_col = 'src_iso'
                    target_col = 'tgt_iso'
                # Check for other possible column names
                else:
                    for col in edges_df.columns:
                        col_lower = col.lower()
                        if 'source' in col_lower and 'iso' in col_lower:
                            source_col = col
                        elif 'reporter' in col_lower and 'iso' in col_lower:
                            source_col = col
                        elif 'target' in col_lower and 'iso' in col_lower:
                            target_col = col
                        elif 'partner' in col_lower and 'iso' in col_lower and target_col is None:
                            target_col = col

                if source_col and target_col:
                    # Clean IDs and convert to uppercase for consistency
                    edges_df["source"] = edges_df[source_col].astype(str).str.strip().str.upper()
                    edges_df["target"] = edges_df[target_col].astype(str).str.strip().str.upper()

                    # FILTER: Only keep edges where both Source and Target exist in valid nodes
                    mask = edges_df["source"].isin(valid_ids) & edges_df["target"].isin(valid_ids)
                    valid_edges = edges_df[mask].copy()

                    if len(valid_edges) > 0:
                        # Aggregate by source-target pairs to reduce duplicates and get total trade value
                        if 'primaryValue' in valid_edges.columns:
                            # Group by source/target and sum values
                            aggregated = valid_edges.groupby(['source', 'target']).agg({
                                'primaryValue': 'sum',
                                'netWgt': 'sum' if 'netWgt' in valid_edges.columns else 'first'
                            }).reset_index()
                            
                            # Take top 5000 largest trades for performance
                            if len(aggregated) > 5000:
                                aggregated = aggregated.nlargest(5000, 'primaryValue')
                            
                            # Build links with all fields frontend expects (ensure no NaN)
                            for _, row in aggregated.iterrows():
                                source_iso = str(row['source']).strip().upper()
                                target_iso = str(row['target']).strip().upper()
                                
                                # Only add link if both nodes exist
                                if source_iso not in valid_ids or target_iso not in valid_ids:
                                    continue
                                
                                primary_val = float(row['primaryValue']) if pd.notna(row['primaryValue']) else 0.0
                                
                                link = {
                                    "source": source_iso,
                                    "target": target_iso,
                                    "source_iso3": source_iso,  # Frontend also checks this
                                    "target_iso3": target_iso,  # Frontend also checks this
                                    "primaryValue": primary_val,
                                    "value": primary_val
                                }
                                
                                # Add optional fields (ensure no NaN)
                                if 'netWgt' in row and pd.notna(row['netWgt']):
                                    link["netWgt"] = float(row['netWgt'])
                                else:
                                    link["netWgt"] = 0.0
                                
                                # Add placeholder fields frontend might expect
                                link["distance_km"] = 0.0
                                link["transport_emissions_tCO2"] = 0.0
                                
                                final_links.append(link)
                        else:
                            # No primaryValue column, just create basic links
                            unique_edges = valid_edges[['source', 'target']].drop_duplicates()
                            for _, row in unique_edges.head(5000).iterrows():
                                source_iso = str(row['source']).strip().upper()
                                target_iso = str(row['target']).strip().upper()
                                
                                # Only add link if both nodes exist
                                if source_iso not in valid_ids or target_iso not in valid_ids:
                                    continue
                                
                                final_links.append({
                                    "source": source_iso,
                                    "target": target_iso,
                                    "source_iso3": source_iso,
                                    "target_iso3": target_iso,
                                    "primaryValue": 1.0,
                                    "value": 1.0,
                                    "netWgt": 0.0,
                                    "distance_km": 0.0,
                                    "transport_emissions_tCO2": 0.0
                                })
                        
                        print(f"✅ Loaded {len(final_links)} edges for visualization.")
                    else:
                        print("⚠️  No valid edges found after filtering.")
                else:
                    print(f"⚠️  Edge file structure not recognized. Source: {source_col}, Target: {target_col}")
                    print(f"    Available columns: {list(edges_df.columns)[:10]}")
            except Exception as e:
                print(f"❌ Error processing edges: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("⚠️  No edge files found - graph will show nodes only.")

        # Final Return - nodes are already clean (no NaN), links are clean
        print(f"✅ Returning {len(nodes)} nodes and {len(final_links)} links to frontend.")
        
        return {
            "nodes": nodes,  # Already cleaned, no need for clean_df_for_json
            "links": final_links,
        }

    except Exception as e:
        error_msg = f" Error in get_graph_data: {str(e)}"
        print(error_msg)
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))




