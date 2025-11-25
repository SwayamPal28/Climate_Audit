# python-service/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
import pandas as pd
import json, subprocess
from app.model_runner import GNNWrapper

app = FastAPI()
BASE = Path(__file__).resolve().parents[1]
DATA_DIR = BASE / "data"

gnn = GNNWrapper(device='cpu')  # load once

@app.get("/api/audit/anomalies")
def get_top_anomalies():
    nodes = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")
    # Provide either precomputed anomalies or compute live:
    anomalies = gnn.predict_anomaly_scores(nodes, None)   # implement
    top_pos = anomalies.sort_values("anomaly_score", ascending=False).head(5).to_dict(orient="records")
    top_neg = anomalies.sort_values("anomaly_score", ascending=True).head(5).to_dict(orient="records")
    return {"top_positive": top_pos, "top_negative": top_neg}

@app.post("/api/calculate/shapley")
async def calculate_shapley(payload: dict):
    # Option A: Run computation in-process (if quick)
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
