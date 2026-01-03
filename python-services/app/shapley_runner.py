# python-services/app/shapley_runner.py

import pandas as pd
import numpy as np

class ShapleyEngine:
    def __init__(self, gnn_wrapper, nodes_df, edges_df):
        self.gnn = gnn_wrapper
        self.nodes = nodes_df
        self.edges = edges_df

    def run_shapley(self, target_iso3: str, producer_ratio: float = 0.6):
        """
        Implements a Shared Responsibility policy.

        producer_ratio: fraction [0.0, 1.0] kept by the producer (SELF). The remainder is
        considered exported (assigned to trade partners proportionally to export value).

        Returns: { allocations: {ISO: pct, ...}, meta: {allocations_t: {ISO: tCO2}, totals...} }
        """

        # -----------------------------
        # 0. Validate target
        # -----------------------------
        if target_iso3 not in self.nodes["iso3"].values:
            return {"error": "Target country not found"}

        # -----------------------------
        # STEP A: SELF PRODUCTION EMISSIONS (unit-safe)
        # -----------------------------
        co2_candidates = [
            "co2_emissions_kt",
            "co2_kt",
            "co2_emissions",
            "co2",
        ]
        co2_col = next((c for c in co2_candidates if c in self.nodes.columns), None)

        if co2_col is None:
            return {"error": "Nodes data missing CO2 column. Found columns: " + ", ".join(self.nodes.columns)}

        node_row = self.nodes.loc[self.nodes["iso3"] == target_iso3]
        if node_row.empty:
            return {"error": "Target country not found in nodes"}

        prod_val = node_row.iloc[0][co2_col]
        try:
            prod_t = float(prod_val) * (1000.0 if "kt" in co2_col else 1.0)
        except Exception:
            prod_t = 0.0
        if np.isnan(prod_t) or np.isinf(prod_t):
            prod_t = 0.0

        # Apply policy split
        producer_ratio = max(0.0, min(1.0, float(producer_ratio)))
        retained = prod_t * producer_ratio
        exported_total = prod_t * (1.0 - producer_ratio)

        # -----------------------------
        # STEP B: Gather trade links (exports and imports)
        # -----------------------------
        exports = self.edges[self.edges.get("source_iso3") == target_iso3] if "source_iso3" in self.edges.columns else self.edges[self.edges.get("source") == target_iso3]
        imports = self.edges[self.edges.get("target_iso3") == target_iso3] if "target_iso3" in self.edges.columns else self.edges[self.edges.get("target") == target_iso3]

        # Total export value (primaryValue) used to allocate exported production
        total_export_val = 0.0
        if not exports.empty and "primaryValue" in exports.columns:
            try:
                pv = pd.to_numeric(exports["primaryValue"], errors="coerce").fillna(0.0)
                total_export_val = float(pv.sum())
            except Exception:
                total_export_val = 0.0

        allocations_t = {}
        allocations_t["SELF"] = retained

        # Allocate exported production to partners by export value share
        if exported_total > 0 and total_export_val > 0:
            for _, e in exports.iterrows():
                partner = e.get("target_iso3") or e.get("target")
                try:
                    val = float(e.get("primaryValue", 0.0))
                    if np.isnan(val) or np.isinf(val):
                        val = 0.0
                except Exception:
                    val = 0.0
                if val <= 0 or total_export_val <= 0:
                    continue
                share = exported_total * (val / total_export_val)
                allocations_t[partner] = allocations_t.get(partner, 0.0) + float(share)
        else:
            # If no export values are available, keep exported_total with SELF (fallback)
            allocations_t["SELF"] += exported_total

        # Import transport emissions and other incoming transport emissions stay with consumer (SELF)
        if not imports.empty:
            for _, e in imports.iterrows():
                try:
                    t = float(e.get("transport_emissions_tCO2", 0.0))
                    if np.isnan(t) or np.isinf(t):
                        t = 0.0
                except Exception:
                    t = 0.0
                allocations_t["SELF"] += float(t)

        # Also include any transport emissions on outgoing edges if we want to attribute them to partners
        # We'll assume transport fuel is part of partners' responsibility (they already get exported allocation above)

        # -----------------------------
        # STEP C: Prepare percentages and metadata
        # -----------------------------
        grand_total_t = sum(allocations_t.values())
        if grand_total_t == 0:
            return {"message": "No emissions available for attribution"}

        allocations_pct = {k: (v / grand_total_t) * 100.0 for k, v in allocations_t.items()}
        allocations_pct = dict(sorted(allocations_pct.items(), key=lambda x: x[1], reverse=True))

        meta = {
            "allocations_t": {k: float(v) for k, v in allocations_t.items()},
            "self_emission_tCO2": float(prod_t),
            "total_exported_tCO2": float(exported_total),
            "grand_total_tCO2": float(grand_total_t),
            "producer_ratio": float(producer_ratio),
            # Backwards-compatible keys
            "partners_total_tCO2": float(sum([v for k,v in allocations_t.items() if k != 'SELF'])),
            "total_emissions_tCO2": float(grand_total_t),
        }

        return {"allocations": allocations_pct, "meta": meta}