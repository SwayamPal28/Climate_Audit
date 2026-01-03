from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import numpy as np
from typing import Any, Union, Dict, List
from app.model_runner import GNNWrapper  # Assuming this is available
from app.shapley_runner import ShapleyEngine
from pydantic import BaseModel

class ShapleyRequest(BaseModel):
    target_country: str
    producer_ratio: float = 0.6  # fraction [0.0, 1.0] kept by producer (SELF)


# --- 1. DEFINITIVE JSON CLEANUP HELPER (CRITICAL FOR JSON) ---
def clean_df_for_json(df: pd.DataFrame) -> pd.DataFrame:
    """Replaces NaN/Inf with None and ensures native Python float types."""

    # 1. Replace NaN, None, and NaT with the JSON-safe None literal
    df = df.replace({np.nan: None, pd.NaT: None})

    # 2. Iterate over numeric columns to handle Inf and casting
    for col in df.select_dtypes(include=[np.number]).columns:
        # Replace Inf (which is not JSON compliant) with None
        df[col] = df[col].replace([np.inf, -np.inf], None)

        # Convert to native Python float type. This resolves the NumPy type crash.
        try:
            df[col] = df[col].astype(float)
        except:
            # Pass if column cannot be converted (e.g., already strings or None)
            pass

    return df


# --- 2. FASTAPI SETUP ---
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
gnn = GNNWrapper(device="cpu")  # load once


@app.get("/api/audit/anomalies")
def get_top_anomalies():
    try:
        # 1. Read Data
        nodes = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")

        # 2. Predict (GNNWrapper handles its own NaN cleaning internally)
        results = gnn.predict_anomaly_scores(nodes, None)

        # 3. Merge scores
        if "anomaly_score" in results.columns:
            nodes["anomaly_score"] = results["anomaly_score"]
        else:
            nodes["anomaly_score"] = results

        # 4. Sort and Clean (Applying the clean_df_for_json helper here is safest)
        nodes_cleaned = clean_df_for_json(nodes)

        top_pos_df = nodes_cleaned.sort_values("anomaly_score", ascending=False).head(5)
        top_neg_df = nodes_cleaned.sort_values("anomaly_score", ascending=True).head(5)

        # 5. Convert to Dict (The DataFrame is already clean)
        return {
            "top_positive": top_pos_df.to_dict(orient="records"),
            "top_negative": top_neg_df.to_dict(orient="records"),
        }
    except Exception as e:
        print(f"Error in anomalies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    target = payload.target_country

    # Load data
    nodes_df = pd.read_csv(DATA_DIR / "nodes_final_physics.csv")
    edges_df = pd.read_csv(DATA_DIR / "edges_ready_for_ai.csv")

    # Create Shapley engine (NOT on GNNWrapper)
    shapley_engine = ShapleyEngine(gnn, nodes_df, edges_df)

    # Pass producer_ratio through to the engine (validate bounds)
    pr = payload.producer_ratio if hasattr(payload, 'producer_ratio') else 0.6
    try:
        pr = float(pr)
    except Exception:
        pr = 0.6
    pr = max(0.0, min(1.0, pr))

    result = shapley_engine.run_shapley(target, producer_ratio=pr)

    # Ensure API always returns { allocations: {...}, meta: {...} }
    if isinstance(result, dict) and 'allocations' in result and 'meta' in result:
        return result
    else:
        # Backwards-compatible: if engine returned only allocations dict, wrap it
        return {"allocations": result, "meta": {}}



@app.get("/api/data/nodes")
def get_nodes_csv():
    path = DATA_DIR / "nodes_final_physics.csv"
    if not path.exists():
        raise HTTPException(status_code=404)
    # FileResponse is generally safe as it doesn't try to JSON encode the file content
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

        # Prepare structure for frontend
        graph_nodes = nodes_df.copy()
        graph_nodes["id"] = graph_nodes["iso3"].astype(str).str.strip()
        graph_nodes["label"] = graph_nodes["wb_code"].astype(str)

        # Keep all relevant columns + the new ones
        relevant_cols = ["id", "label", "gdp_usd", "co2_emissions_kt", "lat", "lon"]
        present_cols = [col for col in relevant_cols if col in graph_nodes.columns]
        graph_nodes = graph_nodes[present_cols]

        valid_ids = set(graph_nodes["id"])
        print(f" Loaded {len(graph_nodes)} nodes.")

        # --- 2. PROCESS EDGES (Vectorized) ---
        final_links = []

        if edges_path.exists():
            edges_df = pd.read_csv(edges_path, on_bad_lines="skip")
            edges_df.columns = [str(c).strip() for c in edges_df.columns]

            # Clean IDs
            edges_df["source"] = edges_df["source_iso3"].astype(str).str.strip()
            edges_df["target"] = edges_df["target_iso3"].astype(str).str.strip()

            # FILTER: Only keep edges where both Source and Target exist
            mask = edges_df["source"].isin(valid_ids) & edges_df["target"].isin(
                valid_ids
            )
            valid_edges = edges_df[mask].copy()

            # Select final link columns (including calculated features)
            edge_feature_cols = [
                "primaryValue",
                "netWgt",
                "distance_km",
                "transport_emissions_tCO2",
            ]
            final_link_cols = ["source", "target"] + [
                c for c in edge_feature_cols if c in valid_edges.columns
            ]

            # Convert to dictionary after cleaning
            final_links_df = valid_edges[final_link_cols]
            final_links = clean_df_for_json(final_links_df).to_dict(orient="records")

            print(f" Loaded {len(final_links)} edges.")
        else:
            print(" Edges file not found.")

        # Final Return (Apply comprehensive JSON cleaning universally)
        return {
            "nodes": clean_df_for_json(graph_nodes).to_dict(orient="records"),
            "links": final_links,
        }

    except Exception as e:
        error_msg = f" Error in get_graph_data: {str(e)}"
        print(error_msg)
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))




