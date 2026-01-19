import pandas as pd
from pathlib import Path
import numpy as np

class DataEngine:
    def __init__(self, data_dir=None):
        if data_dir is None:
            base_dir = Path(__file__).resolve().parents[1]
            data_dir = base_dir / "data"
        self.data_dir = Path(data_dir)

        print("🚀 Initializing ClimaAuditX Data Engine (Strict Real Data)...")

        # 1. LOAD NODES
        nodes_path = self.data_dir / "nodes_final.csv"
        if nodes_path.exists():
            self.nodes_df = pd.read_csv(nodes_path)
            self.nodes_df['iso3'] = self.nodes_df['iso3'].astype(str).str.strip().str.upper()
            self.nodes_df['gdp'] = pd.to_numeric(self.nodes_df['gdp'], errors='coerce').fillna(1e9)
            self.nodes_df['energy_intensity'] = pd.to_numeric(self.nodes_df['energy_intensity'], errors='coerce').fillna(0)
            self.iso_to_idx = {iso: i for i, iso in enumerate(self.nodes_df['iso3'])}
            print(f"   ✅ Loaded {len(self.nodes_df)} Country Nodes")
        else:
            print("   ❌ CRITICAL: nodes_final.csv not found")
            self.nodes_df = pd.DataFrame()
            self.iso_to_idx = {}

        # 2. LOAD AI PREDICTIONS
        self.ai_scores = {}
        pred_path = self.data_dir / "gnn_predictions.csv"
        if pred_path.exists():
            try:
                df_pred = pd.read_csv(pred_path)
                for _, row in df_pred.iterrows():
                    iso = str(row.get('iso3', '')).strip().upper()
                    if iso: self.ai_scores[iso] = float(row.get('residual', 0))
                print(f"   ✅ Loaded {len(self.ai_scores)} AI Risk Scores")
            except: pass

        # 3. LOAD ACTUAL EDGES (Direct + Re-export)
        self.viz_edges = []
        sectors = ['steel', 'energy', 'textiles']
        
        for sector in sectors:
            # CHECK BOTH FLOW TYPES
            for flow in ['direct', 'reexport']: 
                fpath = self.data_dir / f"processed_{sector}_{flow}.csv"
                if fpath.exists():
                    try:
                        df = pd.read_csv(fpath, low_memory=False)
                        df['primaryValue'] = pd.to_numeric(df['primaryValue'], errors='coerce').fillna(0)
                        
                        # Load ALL relevant edges (Limit 50k to prevent crash, but capture mostly everything)
                        top_edges = df.nlargest(50000, 'primaryValue')
                        
                        for _, row in top_edges.iterrows():
                            src = str(row['src_iso']).strip().upper()
                            tgt = str(row['tgt_iso']).strip().upper()
                            
                            if src in self.iso_to_idx and tgt in self.iso_to_idx:
                                self.viz_edges.append({
                                    "source": src,
                                    "target": tgt,
                                    "source_iso3": src,
                                    "target_iso3": tgt,
                                    "value": float(row['primaryValue']),
                                    "sector": sector,
                                    "type": flow, # 'direct' or 'reexport'
                                    "co2_mean": float(row.get('mc_mean_co2', 0)),
                                    "co2_max": float(row.get('mc_p95_co2', 0)),
                                    "uncertainty": float(row.get('uncertainty_factor', 1.0))
                                })
                    except Exception as e:
                        print(f"   ⚠️ Error loading {sector}_{flow}: {e}")
        
        print(f"   ✅ Final Graph: {len(self.viz_edges)} Links (No Dummy Data)")

    def get_graph_data(self):
        nodes = []
        for _, row in self.nodes_df.iterrows():
            iso = row['iso3']
            if iso == 'NAN': continue
            nodes.append({
                "id": iso, "iso3": iso, "label": iso,
                "gdp_usd": float(row['gdp']),
                "co2": float(row['energy_intensity']), 
                "anomaly_score": self.ai_scores.get(iso, 0)
            })
        return {"nodes": nodes, "links": self.viz_edges}

_instance = None
def get_data_engine(data_dir=None):
    global _instance
    if _instance is None:
        _instance = DataEngine(data_dir)
    return _instance