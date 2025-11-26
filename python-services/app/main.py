from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
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
    # 1. Read the original CSV (contains Country Names, GDP, etc.)
    nodes = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")
    
    # 2. Get just the math scores from the AI
    results = gnn.predict_anomaly_scores(nodes, None)
    
    # 3. CRITICAL FIX: Merge the scores back into the original 'nodes' dataframe
    # We assume 'results' has the same index/order as 'nodes'
    if "anomaly_score" in results.columns:
        nodes["anomaly_score"] = results["anomaly_score"]
    else:
        # If 'results' is just a Series or has a different name, we assign it directly
        nodes["anomaly_score"] = results

    # 4. Now 'nodes' has both Country Names AND Anomaly Scores.
    # We sort 'nodes' (not 'results') and convert to dictionary.
    top_pos = nodes.sort_values("anomaly_score", ascending=False).head(5).to_dict(orient="records")
    top_neg = nodes.sort_values("anomaly_score", ascending=True).head(5).to_dict(orient="records")
    
    return {"top_positive": top_pos, "top_negative": top_neg}

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
    nodes_df = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")
    nodes = []
    
    # Convert DataFrame to list of dicts for the graph
    for _, row in nodes_df.iterrows():
        nodes.append({
            "id": row.get("iso3", "UNK"),
            "label": row.get("wb_code", "Unknown"),
            "gdp_usd": row.get("gdp_usd", 0),
            "co2_emissions_kt": row.get("co2_emissions_kt", 0)
        })

    # 2. Load Edges (Try to find the file, return empty if missing)
    links = []
    edges_path = DATA_DIR / "edges_ready_for_ai.csv"
    
    if edges_path.exists():
        edges_df = pd.read_csv(edges_path)
        # We limit to 2000 edges so the browser doesn't crash
        edges_df = edges_df.head(2000) 
        
        for _, row in edges_df.iterrows():
            links.append({
                "source": row["source_iso3"],
                "target": row["target_iso3"],
                # Graph expects a numerical weight
                "value": row.get("primaryValue", 1) 
            })
            
    return {"nodes": nodes, "links": links}