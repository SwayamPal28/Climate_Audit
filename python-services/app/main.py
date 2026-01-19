from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from services.data_engine import get_data_engine

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE = Path(__file__).resolve().parents[1]
DATA_DIR = BASE / "data"

@app.get("/")
def home():
    return {"status": "ClimaAuditX V2.0 Online"}

@app.get("/api/graph")
def get_graph_endpoint():
    try:
        engine = get_data_engine(DATA_DIR)
        return engine.get_graph_data()
    except Exception as e:
        print(f"Graph Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))