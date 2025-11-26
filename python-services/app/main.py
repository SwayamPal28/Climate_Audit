from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import numpy as np
import json, subprocess
from app.model_runner import GNNWrapper

app = FastAPI()

# Security: Allow Frontend to talk to Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE = Path(__file__).resolve().parents[1]
DATA_DIR = BASE / "data"

gnn = GNNWrapper(device='cpu')  # load once

@app.get("/api/audit/anomalies")
def get_top_anomalies():
    try:
        # 1. Read the original CSV
        nodes = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")
        
        # 2. Get predictions
        results = gnn.predict_anomaly_scores(nodes, None)
        
        # 3. Merge scores
        if "anomaly_score" in results.columns:
            nodes["anomaly_score"] = results["anomaly_score"]
        else:
            nodes["anomaly_score"] = results

        # 4. Handle NaN values by replacing them with None
        nodes = nodes.replace({np.nan: None})
        
        # 5. Sort and get top anomalies, handling None values
        top_pos = nodes.sort_values("anomaly_score", ascending=False, na_position='last').head(5)
        top_neg = nodes.sort_values("anomaly_score", ascending=True, na_position='last').head(5)
        
        # 6. Convert to dictionary and ensure all values are JSON serializable
        def clean_dict(d):
            return {k: (None if (isinstance(v, float) and pd.isna(v)) else v) 
                   for k, v in d.items()}
        
        return {
            "top_positive": [clean_dict(rec) for rec in top_pos.to_dict(orient='records')],
            "top_negative": [clean_dict(rec) for rec in top_neg.to_dict(orient='records')]
        }
        
    except Exception as e:
        print(f"Error in get_top_anomalies: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/calculate/shapley")
async def calculate_shapley(payload: dict):
    target = payload.get("target_country")
    params = payload.get("params", {})
    if not target:
        raise HTTPException(status_code=400, detail="target_country required")
    alloc = gnn.run_shapley(target, params)
    return {"allocations": alloc}

@app.get("/api/data/nodes")
def get_nodes_csv():
    path = DATA_DIR / "nodes_final_physics.csv"
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="text/csv", filename="nodes_final_physics.csv")

@app.get("/api/graph")
def get_graph_data():
    # 1. Load Nodes
    nodes_path = DATA_DIR / "nodes_final_physics.csv"
    if not nodes_path.exists():
        raise HTTPException(status_code=404, detail="Nodes file not found")

    nodes_df = pd.read_csv(nodes_path)
    nodes = []
    node_ids = set()
    
    # Create Nodes List
    for _, row in nodes_df.iterrows():
        # Ensure ID is a string and stripped of whitespace
        node_id = str(row.get("iso3", "UNK")).strip()
        
        # Skip invalid IDs
        if node_id == "nan" or node_id == "UNK":
            continue

        nodes.append({
            "id": node_id,
            "label": str(row.get("wb_code", node_id)),
            "gdp_usd": row.get("gdp_usd", 0),
            "co2_emissions_kt": row.get("co2_emissions_kt", 0)
        })
        node_ids.add(node_id)

    print(f"✅ Loaded {len(nodes)} nodes. Sample IDs: {list(node_ids)[:5]}")

    # 2. Load Edges using Pandas directly (More robust than manual parsing)
    links = []
    edges_path = DATA_DIR / "edges_ready_for_ai.csv"
    
    if edges_path.exists():
        try:
            # Load CSV directly. on_bad_lines='skip' handles malformed rows
            edges_df = pd.read_csv(edges_path, on_bad_lines='skip')
            
            # Normalize column names just in case (strip whitespace)
            edges_df.columns = [c.strip() for c in edges_df.columns]
            
            print(f"📂 Edge columns found: {edges_df.columns.tolist()}")
            
            # Iterate and filter
            valid_edges_count = 0
            dropped_edges_count = 0
            
            for _, row in edges_df.iterrows():
                # Ensure source/target are strings and stripped
                s = str(row.get('source_iso3', '')).strip()
                t = str(row.get('target_iso3', '')).strip()
                
                # Logic: Only add edge if BOTH nodes exist in our node list
                if s in node_ids and t in node_ids:
                    links.append({
                        "source": s,
                        "target": t,
                        "value": float(row.get('primaryValue', 1))
                    })
                    valid_edges_count += 1
                else:
                    dropped_edges_count += 1
            
            print(f"✅ Successfully loaded {valid_edges_count} edges.")
            print(f"⚠️ Dropped {dropped_edges_count} edges (nodes missing from subset).")
            
        except Exception as e:
            print(f"❌ Error reading edges CSV: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"❌ Edges file not found at {edges_path}")

    return {"nodes": nodes, "links": links}