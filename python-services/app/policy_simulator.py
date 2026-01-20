# python-services/app/policy_simulator.py

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
import copy

# EU Countries (ISO3 codes)
EU_COUNTRIES = [
    'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
    'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
    'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'
]

# Developing Nations (Common examples for Technology Transfer scenario)
DEVELOPING_NATIONS = ['IND', 'VNM', 'BGD', 'PAK', 'PHL', 'THA', 'IDN', 'CHN']

class PolicySimulator:
    """
    Policy Simulator for 'What-If' Scenarios
    
    Implements three main simulation types:
    1. CBAM (Carbon Border Adjustment Mechanism) - Reduces trade volume to EU
    2. Technology Transfer - Reduces emission intensity in developing nations
    3. Fairness Dial - Changes attribution framework (Producer/Consumer/Shapley)
    """
    
    def __init__(self, data_engine, nodes_df, edges_df, iso_to_idx):
        self.data_engine = data_engine
        self.original_nodes_df = nodes_df.copy()
        self.original_edges_df = edges_df.copy()
        self.iso_to_idx = iso_to_idx
        self.idx_to_iso = {v: k for k, v in iso_to_idx.items()}
    
    def simulate_policy(
        self,
        policy_type: str,
        severity: float = 0.2,
        target_countries: Optional[List[str]] = None,
        attribution_mode: str = "shapley"
    ) -> Dict:
        """
        Main simulation function
        
        Args:
            policy_type: "CBAM", "TECH_TRANSFER", or "FAIRNESS_DIAL"
            severity: Adjustment factor (0.0 to 1.0)
                - For CBAM: volume reduction factor (0.2 = 20% reduction)
                - For TECH_TRANSFER: intensity reduction factor (0.3 = 30% reduction)
            target_countries: List of ISO3 codes (optional)
            attribution_mode: "producer", "consumer", or "shapley"
        
        Returns:
            Dictionary with simulated data and delta metrics
        """
        # Clone data to avoid modifying original
        sim_nodes_df = self.original_nodes_df.copy()
        sim_edges_df = self.original_edges_df.copy()
        
        if policy_type == "CBAM":
            return self._simulate_cbam(sim_nodes_df, sim_edges_df, severity, target_countries)
        elif policy_type == "TECH_TRANSFER":
            return self._simulate_tech_transfer(sim_nodes_df, sim_edges_df, severity, target_countries)
        elif policy_type == "FAIRNESS_DIAL":
            return self._simulate_fairness_dial(sim_nodes_df, sim_edges_df, attribution_mode)
        else:
            raise ValueError(f"Unknown policy type: {policy_type}")
    
    def _simulate_cbam(
        self,
        nodes_df: pd.DataFrame,
        edges_df: pd.DataFrame,
        severity: float,
        target_countries: Optional[List[str]]
    ) -> Dict:
        """
        Simulates EU CBAM - Reduces trade volume to EU countries
        
        Args:
            severity: Volume reduction factor (0.2 = 20% reduction)
        """
        # Default to all EU countries if not specified
        if target_countries is None:
            target_countries = EU_COUNTRIES
        
        # Make a copy first to avoid modifying original
        edges_df = edges_df.copy()
        
        # Ensure primaryValue column exists
        if 'primaryValue' not in edges_df.columns:
            if 'value' in edges_df.columns:
                edges_df['primaryValue'] = edges_df['value']
            else:
                raise ValueError("No volume column found in edges data")
        
        # Filter edges pointing to EU countries in Steel sector
        eu_iso_set = set(c.upper() for c in target_countries)
        
        # Check if sector column exists and contains 'Steel'
        if 'sector' in edges_df.columns:
            steel_mask = edges_df['sector'].astype(str).str.contains('Steel', case=False, na=False)
        else:
            # If no sector column, assume all edges
            steel_mask = pd.Series([True] * len(edges_df), index=edges_df.index)
        
        # Ensure tgt_iso column exists
        if 'tgt_iso' not in edges_df.columns:
            # Try alternative column names
            if 'target_iso3' in edges_df.columns:
                eu_target_mask = edges_df['target_iso3'].astype(str).str.strip().str.upper().isin(eu_iso_set)
            elif 'target' in edges_df.columns:
                eu_target_mask = edges_df['target'].astype(str).str.strip().str.upper().isin(eu_iso_set)
            else:
                eu_target_mask = pd.Series([False] * len(edges_df), index=edges_df.index)
        else:
            eu_target_mask = edges_df['tgt_iso'].astype(str).str.strip().str.upper().isin(eu_iso_set)
        
        # Apply volume reduction
        affected_edges = steel_mask & eu_target_mask
        volume_reduction = 1.0 - severity  # severity=0.2 means 80% of original volume
        
        original_volumes = edges_df.loc[affected_edges, 'primaryValue'].copy()
        edges_df.loc[affected_edges, 'primaryValue'] = edges_df.loc[affected_edges, 'primaryValue'] * volume_reduction
        
        # Calculate deltas
        total_original_volume = original_volumes.sum()
        total_new_volume = edges_df.loc[affected_edges, 'primaryValue'].sum()
        volume_delta = total_new_volume - total_original_volume
        volume_delta_pct = (volume_delta / total_original_volume * 100) if total_original_volume > 0 else 0
        
        # Check for carbon leakage (trade shifts to other regions)
        num_affected_edges = affected_edges.sum()
        
        # Get affected source countries (exporters to EU)
        src_col = 'src_iso' if 'src_iso' in edges_df.columns else ('source_iso3' if 'source_iso3' in edges_df.columns else 'source')
        if src_col in edges_df.columns:
            affected_sources = edges_df.loc[affected_edges, src_col].astype(str).str.strip().str.upper().unique().tolist()
        else:
            affected_sources = []
        
        # Calculate carbon leakage risk
        # High risk if large volume reduction (may shift to non-EU markets)
        if abs(volume_delta_pct) > 25:
            leakage_risk = "High"
        elif abs(volume_delta_pct) > 15:
            leakage_risk = "Medium"
        else:
            leakage_risk = "Low"
        
        # Calculate financial impact (volume lost in USD)
        financial_impact = abs(volume_delta)
        
        # Add visual properties for affected edges (make them RED)
        edges_df['edge_color'] = '#b2bec3'  # Default gray
        edges_df.loc[affected_edges, 'edge_color'] = '#e74c3c'  # Red for CBAM-affected
        
        # Add visual properties to nodes (affected exporters get orange border)
        nodes_df['node_color_override'] = None
        if src_col in edges_df.columns:
            affected_source_set = set(affected_sources)
            nodes_df['node_color_override'] = nodes_df.apply(
                lambda row: '#e67e22' if row['iso3'] in affected_source_set else None,
                axis=1
            )
        
        return {
            "simulated_nodes": nodes_df.to_dict(orient='records'),
            "simulated_edges": edges_df.to_dict(orient='records'),
            "policy_type": "CBAM",
            "metrics": {
                "original_volume_usd": float(total_original_volume),
                "new_volume_usd": float(total_new_volume),
                "volume_delta_usd": float(volume_delta),
                "volume_delta_pct": float(volume_delta_pct),
                "affected_edges": int(num_affected_edges),
                "affected_exporters": affected_sources,
                "num_affected_exporters": len(affected_sources),
                "leakage_risk": leakage_risk,
                "financial_impact_usd": float(financial_impact),
                "severity_applied": float(severity)
            }
        }
    
    def _simulate_tech_transfer(
        self,
        nodes_df: pd.DataFrame,
        edges_df: pd.DataFrame,
        severity: float,
        target_countries: Optional[List[str]]
    ) -> Dict:
        """
        Simulates Technology Transfer - Reduces emission intensity in developing nations
        
        Args:
            severity: Intensity reduction factor (0.3 = 30% reduction)
        """
        # Default to developing nations if not specified
        if target_countries is None:
            target_countries = DEVELOPING_NATIONS
        
        # Make a copy first
        nodes_df = nodes_df.copy()
        
        # Find intensity column
        intensity_cols = ['energy_intensity', 'emission_intensity', 'co2_intensity']
        intensity_col = next((c for c in intensity_cols if c in nodes_df.columns), None)
        
        if intensity_col is None:
            raise ValueError("No intensity column found in nodes data")
        
        target_iso_set = set(c.upper() for c in target_countries)
        target_mask = nodes_df['iso3'].astype(str).str.strip().str.upper().isin(target_iso_set)
        
        # Apply intensity reduction
        original_intensities = nodes_df.loc[target_mask, intensity_col].copy()
        intensity_reduction = 1.0 - severity  # severity=0.3 means 70% of original intensity
        
        nodes_df.loc[target_mask, intensity_col] = nodes_df.loc[target_mask, intensity_col] * intensity_reduction
        
        # Calculate deltas
        total_original_intensity = original_intensities.sum()
        total_new_intensity = nodes_df.loc[target_mask, intensity_col].sum()
        intensity_delta = total_new_intensity - total_original_intensity
        intensity_delta_pct = (intensity_delta / total_original_intensity * 100) if total_original_intensity > 0 else 0
        
        # Count affected countries
        num_affected_countries = target_mask.sum()
        affected_country_list = nodes_df.loc[target_mask, 'iso3'].astype(str).str.strip().str.upper().tolist()
        
        # Calculate global emissions reduction (average intensity reduction weighted by GDP)
        if 'gdp' in nodes_df.columns:
            affected_gdp = nodes_df.loc[target_mask, 'gdp'].sum()
            total_gdp = nodes_df['gdp'].sum()
            global_impact_weight = (affected_gdp / total_gdp * 100) if total_gdp > 0 else 0
        else:
            global_impact_weight = 0
        
        # Estimate global CO2 reduction (simplified)
        global_co2_reduction_estimate = abs(intensity_delta) * 1000  # Convert to kt CO2
        
        # Add visual properties for affected nodes (turn them GREEN to show improvement)
        nodes_df['node_color_override'] = None
        nodes_df.loc[target_mask, 'node_color_override'] = '#27ae60'  # Green for greener countries
        
        # Add visual property to edges (highlight trade with greener countries)
        edges_df['edge_color'] = None
        if 'src_iso' in edges_df.columns and 'tgt_iso' in edges_df.columns:
            # Mark edges from/to affected countries in green
            affected_trade_mask = (
                edges_df['src_iso'].isin(target_iso_set) | 
                edges_df['tgt_iso'].isin(target_iso_set)
            )
            edges_df['edge_color'] = '#b2bec3'  # Default
            edges_df.loc[affected_trade_mask, 'edge_color'] = '#27ae60'  # Green for tech transfer routes
        
        return {
            "simulated_nodes": nodes_df.to_dict(orient='records'),
            "simulated_edges": edges_df.to_dict(orient='records'),
            "policy_type": "TECH_TRANSFER",
            "metrics": {
                "original_intensity_sum": float(total_original_intensity),
                "new_intensity_sum": float(total_new_intensity),
                "intensity_delta": float(intensity_delta),
                "intensity_delta_pct": float(intensity_delta_pct),
                "affected_countries": int(num_affected_countries),
                "affected_country_list": affected_country_list,
                "target_countries": list(target_iso_set),
                "global_impact_weight_pct": float(global_impact_weight),
                "estimated_co2_reduction_kt": float(global_co2_reduction_estimate),
                "severity_applied": float(severity)
            }
        }
    
    def _simulate_fairness_dial(
        self,
        nodes_df: pd.DataFrame,
        edges_df: pd.DataFrame,
        attribution_mode: str
    ) -> Dict:
        """
        Simulates different attribution frameworks
        
        Note: This doesn't modify the graph structure, but changes how
        responsibility is calculated. The actual recalculation happens
        in the Shapley engine with different producer_ratio values.
        
        Args:
            attribution_mode: "producer", "consumer", or "shapley"
        """
        # Producer Pays: producer_ratio = 1.0 (100% to producer)
        # Consumer Pays: producer_ratio = 0.0 (0% to producer, all to consumers)
        # Shapley: producer_ratio = 0.6 (default fair split)
        
        ratio_map = {
            "producer": 1.0,
            "consumer": 0.0,
            "shapley": 0.6
        }
        
        producer_ratio = ratio_map.get(attribution_mode.lower(), 0.6)
        
        # Add visual properties based on attribution mode
        edges_df['edge_color'] = None
        
        if attribution_mode.lower() == 'producer':
            # Producer Pays: Color edges by source node intensity (high intensity = red)
            if 'src_iso' in edges_df.columns:
                for idx, edge in edges_df.iterrows():
                    src_iso = edge['src_iso']
                    src_node = nodes_df[nodes_df['iso3'] == src_iso]
                    if not src_node.empty:
                        intensity = src_node.iloc[0].get('energy_intensity', 50)
                        if intensity > 80:
                            edges_df.at[idx, 'edge_color'] = '#e74c3c'  # Red - high emitter
                        elif intensity > 50:
                            edges_df.at[idx, 'edge_color'] = '#f39c12'  # Orange - medium
                        else:
                            edges_df.at[idx, 'edge_color'] = '#95a5a6'  # Gray - low
        
        elif attribution_mode.lower() == 'consumer':
            # Consumer Pays: Color edges by target node GDP (high GDP = red - more responsibility)
            if 'tgt_iso' in edges_df.columns:
                for idx, edge in edges_df.iterrows():
                    tgt_iso = edge['tgt_iso']
                    tgt_node = nodes_df[nodes_df['iso3'] == tgt_iso]
                    if not tgt_node.empty:
                        gdp = tgt_node.iloc[0].get('gdp', 0)
                        if gdp > 1e12:  # Trillion+ economies
                            edges_df.at[idx, 'edge_color'] = '#e74c3c'  # Red - rich consumer
                        elif gdp > 1e11:  # 100B+
                            edges_df.at[idx, 'edge_color'] = '#f39c12'  # Orange
                        else:
                            edges_df.at[idx, 'edge_color'] = '#95a5a6'  # Gray
        
        else:  # Shapley - balanced view
            edges_df['edge_color'] = '#3498db'  # Blue for fair/balanced attribution
        
        return {
            "simulated_nodes": nodes_df.to_dict(orient='records'),
            "simulated_edges": edges_df.to_dict(orient='records'),
            "policy_type": "FAIRNESS_DIAL",
            "attribution_mode": attribution_mode,
            "producer_ratio": producer_ratio,
            "metrics": {
                "framework": attribution_mode,
                "producer_ratio": producer_ratio,
                "description": self._get_framework_description(attribution_mode)
            }
        }
    
    def _get_framework_description(self, mode: str) -> str:
        """Returns description of attribution framework"""
        descriptions = {
            "producer": "100% of emissions assigned to producer (status quo)",
            "consumer": "100% of emissions assigned to consumer (consumption-based)",
            "shapley": "Fair split using Shapley value (default: 60% producer, 40% consumers)"
        }
        return descriptions.get(mode.lower(), "Unknown framework")
    
    def calculate_delta_metrics(
        self,
        original_data: Dict,
        simulated_data: Dict
    ) -> Dict:
        """
        Calculates delta metrics between original and simulated data
        
        Returns metrics like:
        - Global risk reduction
        - Carbon leakage indicators
        - Regional shifts
        """
        # This would calculate comprehensive deltas
        # For now, return basic structure
        return {
            "global_risk_change": 0.0,  # To be calculated based on model predictions
            "carbon_leakage": "Low",
            "regional_shifts": {}
        }
