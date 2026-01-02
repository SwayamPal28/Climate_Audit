# python-services/app/shapley_runner.py

import pandas as pd
import numpy as np


class ShapleyEngine:
    """
    True fair-share (Shapley) attribution using additive emissions.
    Players = target country + trade partners
    """

    def __init__(self, gnn_wrapper, nodes_df, edges_df):
        self.gnn = gnn_wrapper  # kept for architecture consistency
        self.nodes = nodes_df
        self.edges = edges_df

    def run_shapley(self, target_iso3: str):
        """
        Returns fair-share emission distribution (%)
        including the target country itself.
        """

        # -----------------------------
        # 0. Validate target
        # -----------------------------
        if target_iso3 not in self.nodes["iso3"].values:
            return {"error": "Target country not found"}

        # -----------------------------
        # STEP A: SELF EMISSIONS
        # -----------------------------
        self_emission = self.nodes.loc[
            self.nodes["iso3"] == target_iso3, "co2_emissions_kt"
        ].values[0]

        try:
            self_emission = float(self_emission)
        except:
            self_emission = 0.0

        if np.isnan(self_emission) or np.isinf(self_emission):
            self_emission = 0.0

        # -----------------------------
        # STEP B: PARTNER EDGES
        # -----------------------------
        partner_edges = self.edges[
            (self.edges["target_iso3"] == target_iso3)
            | (self.edges["source_iso3"] == target_iso3)
        ]

        # -----------------------------
        # STEP C: PARTNER EMISSIONS
        # -----------------------------
        partner_emissions = {}

        for _, edge in partner_edges.iterrows():
            if edge["source_iso3"] == target_iso3:
                partner = edge["target_iso3"]
            else:
                partner = edge["source_iso3"]

            val = edge.get("transport_emissions_tCO2", 0.0)

            try:
                val = float(val)
            except:
                val = 0.0

            if np.isnan(val) or np.isinf(val):
                val = 0.0

            partner_emissions[partner] = partner_emissions.get(partner, 0.0) + val

        # -----------------------------
        # STEP D: TRUE SHAPLEY NORMALIZATION
        # -----------------------------
        total_emissions = self_emission + sum(partner_emissions.values())

        if total_emissions == 0:
            return {"message": "No emissions available for attribution"}

        allocations = {"SELF": (self_emission / total_emissions) * 100}

        for partner, val in partner_emissions.items():
            allocations[partner] = (val / total_emissions) * 100

        # Optional: sort by contribution
        allocations = dict(
            sorted(allocations.items(), key=lambda x: x[1], reverse=True)
        )

        return allocations
