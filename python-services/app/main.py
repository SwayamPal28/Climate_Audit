from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import numpy as np
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

# Load model
gnn = GNNWrapper(device='cpu')

@app.get("/api/audit/anomalies")
def get_top_anomalies():
    try:
        # 1. Read Data
        nodes = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")
        
        # 2. Predict
        results = gnn.predict_anomaly_scores(nodes, None)
        
        # 3. Merge scores
        if "anomaly_score" in results.columns:
            nodes["anomaly_score"] = results["anomaly_score"]
        else:
            nodes["anomaly_score"] = results

        # 4. Sort
        top_pos_df = nodes.sort_values("anomaly_score", ascending=False).head(5)
        top_neg_df = nodes.sort_values("anomaly_score", ascending=True).head(5)
        
        # 5. Clean and Convert to Dict
        # We use .replace to ensure any runtime NaNs become None (valid JSON)
        return {
            "top_positive": top_pos_df.replace({np.nan: None}).to_dict(orient="records"),
            "top_negative": top_neg_df.replace({np.nan: None}).to_dict(orient="records")
        }
    except Exception as e:
        print(f"Error in anomalies: {e}")
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
    try:
        nodes_path = DATA_DIR / "nodes_final_physics.csv"
        edges_path = DATA_DIR / "edges_ready_for_ai.csv"

        if not nodes_path.exists():
            raise HTTPException(status_code=404, detail="Nodes file not found")

        # --- 1. PROCESS NODES (Vectorized) ---
        nodes_df = pd.read_csv(nodes_path)
        
        # Prepare structure for frontend: id, label, ...
        # We use a copy to avoid SettingWithCopy warnings
        graph_nodes = nodes_df.copy()
        graph_nodes['id'] = graph_nodes['iso3'].astype(str).str.strip()
        graph_nodes['label'] = graph_nodes['wb_code'].astype(str)
        
        # Keep only what we need
        graph_nodes = graph_nodes[['id', 'label', 'gdp_usd', 'co2_emissions_kt']]
        
        # Get set of valid IDs for filtering edges later
        valid_ids = set(graph_nodes['id'])
        
        print(f"✅ Loaded {len(graph_nodes)} nodes.")

        # --- 2. PROCESS EDGES (Vectorized) ---
        final_links = []
        
        if edges_path.exists():
            # Read edges
            edges_df = pd.read_csv(edges_path, on_bad_lines='skip')
            edges_df.columns = [str(c).strip() for c in edges_df.columns]
            
            # Clean IDs
            edges_df['source'] = edges_df['source_iso3'].astype(str).str.strip()
            edges_df['target'] = edges_df['target_iso3'].astype(str).str.strip()
            
            # FILTER: Only keep edges where both Source and Target exist in our Node list
            # This is 100x faster than a for loop
            mask = edges_df['source'].isin(valid_ids) & edges_df['target'].isin(valid_ids)
            valid_edges = edges_df[mask].copy()
            
            # Rename value column
            valid_edges['value'] = valid_edges['primaryValue']
            
            # Select final columns
            final_links = valid_edges[['source', 'target', 'value']].to_dict(orient="records")
            
            print(f"✅ Loaded {len(final_links)} edges.")
        else:
            print("❌ Edges file not found.")

        # Final Return with Safety Replace
        return {
            "nodes": graph_nodes.replace({np.nan: None}).to_dict(orient="records"),
            "links": final_links
        }

    except Exception as e:
        print(f"🔥 Error in get_graph_data: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))