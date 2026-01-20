"""
Advanced Policy Engine with Multi-Regional Input-Output (MRIO) Framework

This module implements sophisticated policy simulation with:
1. Bilateral optimization (Pareto frontier analysis)
2. Upstream shock propagation (middleman effects)
3. Custom attribution models (flexible blame splitting)
4. Economic constraint handling
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
import copy


class AdvancedPolicyEngine:
    """
    Advanced MRIO-based policy simulator
    
    Features:
    - Bilateral policy optimization between country pairs
    - Upstream supplier impact calculation
    - Flexible carbon attribution (custom split ratios)
    - Pareto frontier analysis (max carbon reduction within GDP constraints)
    """
    
    def __init__(self, nodes_df: pd.DataFrame, edges_df: pd.DataFrame):
        """
        Initialize the engine with trade network data
        
        Args:
            nodes_df: DataFrame with country-level data (GDP, emissions, etc.)
            edges_df: DataFrame with trade routes (bilateral flows)
        """
        self.nodes = nodes_df.copy()
        self.edges = edges_df.copy()
        
        # Pre-compute adjacency maps for fast lookups
        self._build_network_maps()
    
    def _build_network_maps(self):
        """Pre-compute network structure for efficient queries"""
        # Suppliers map: For each country, who are its suppliers?
        # Target -> List of Sources
        self.suppliers_map = self.edges.groupby('tgt_iso')['src_iso'].apply(list).to_dict()
        
        # Buyers map: For each country, who are its buyers?
        # Source -> List of Targets
        self.buyers_map = self.edges.groupby('src_iso')['tgt_iso'].apply(list).to_dict()
        
        # Total imports per country (for calculating input coefficients)
        self.total_imports = self.edges.groupby('tgt_iso')['primaryValue'].sum().to_dict()
        
        # Total exports per country
        self.total_exports = self.edges.groupby('src_iso')['primaryValue'].sum().to_dict()
    
    def generate_optimal_bilateral_policy(
        self,
        src_iso: str,
        tgt_iso: str,
        sector: str = None,
        max_gdp_loss_pct: float = 0.15,
        elasticity: float = 0.8
    ) -> Dict:
        """
        Find the optimal policy (tax/tariff) for a specific trade route
        
        Uses Pareto frontier analysis to maximize carbon reduction while
        keeping economic loss below the threshold.
        
        Args:
            src_iso: Source country (exporter) ISO3 code
            tgt_iso: Target country (importer) ISO3 code
            sector: Trade sector (e.g., 'Steel', 'Energy'), None for all
            max_gdp_loss_pct: Maximum acceptable GDP loss (0.15 = 15%)
            elasticity: Price elasticity of demand (default 0.8)
        
        Returns:
            Dictionary with optimal policy, impacts, and upstream effects
        """
        # 1. Find the specific trade route(s)
        route_mask = (self.edges['src_iso'] == src_iso) & (self.edges['tgt_iso'] == tgt_iso)
        
        if sector:
            if 'sector' in self.edges.columns:
                route_mask &= self.edges['sector'].str.contains(sector, case=False, na=False)
        
        if not route_mask.any():
            return {
                "error": f"No trade route found between {src_iso} and {tgt_iso}" + 
                         (f" in sector {sector}" if sector else "")
            }
        
        routes = self.edges[route_mask]
        
        # 2. Calculate baseline metrics
        baseline_vol = routes['primaryValue'].sum()
        
        # Estimate carbon intensity (if not in data, use approximation)
        if 'carbon_intensity' in routes.columns:
            baseline_carbon = (routes['primaryValue'] * routes['carbon_intensity']).sum()
        elif 'transport_emissions_tCO2' in routes.columns:
            baseline_carbon = routes['transport_emissions_tCO2'].sum()
        else:
            # Fallback: estimate based on sector and volume
            baseline_carbon = baseline_vol * 0.001  # 1 ton CO2 per $1M trade (rough estimate)
        
        # 3. OPTIMIZATION LOOP - Find Pareto Frontier
        best_policy = None
        best_score = -float('inf')
        pareto_curve = []  # For visualization
        
        # Test tax rates from 1% to 50%
        for tax_rate in np.linspace(0.01, 0.50, 25):
            # Economic Physics: Price Elasticity Model
            # Assumption: Q_new = Q_old * (1 - tax_rate * elasticity)
            # Higher elasticity = more sensitive to price changes
            volume_drop_pct = tax_rate * elasticity
            
            new_vol = baseline_vol * (1 - volume_drop_pct)
            carbon_saved = baseline_carbon * volume_drop_pct
            revenue_loss = baseline_vol - new_vol
            
            # CONSTRAINT: Economic Safety Threshold
            # Don't destroy the economy - keep loss below max_gdp_loss_pct
            if (revenue_loss / baseline_vol) > max_gdp_loss_pct:
                continue  # Policy too aggressive, skip
            
            # EFFICIENCY SCORE: Carbon saved per dollar lost
            # Higher is better (more environmental benefit per economic cost)
            if revenue_loss > 0:
                efficiency_score = carbon_saved / revenue_loss
            else:
                efficiency_score = carbon_saved * 1000  # Avoid division by zero
            
            pareto_curve.append({
                "tax_rate": round(tax_rate, 3),
                "carbon_saved": round(carbon_saved, 2),
                "revenue_lost": round(revenue_loss, 2),
                "efficiency": round(efficiency_score, 4)
            })
            
            if efficiency_score > best_score:
                best_score = efficiency_score
                best_policy = {
                    "optimal_tax_rate": round(tax_rate, 3),
                    "carbon_saved_tCO2": round(carbon_saved, 2),
                    "revenue_lost_usd": round(revenue_loss, 2),
                    "new_trade_volume": round(new_vol, 2),
                    "trade_retention_pct": round((new_vol / baseline_vol) * 100, 2),
                    "efficiency_score": round(efficiency_score, 4),
                    "efficiency_rating": self._get_efficiency_rating(efficiency_score)
                }
        
        if best_policy is None:
            return {
                "error": "No feasible policy found within economic constraints",
                "suggestion": f"Try increasing max_gdp_loss_pct (current: {max_gdp_loss_pct})"
            }
        
        # 4. CALCULATE MIDDLEMAN EFFECTS (Upstream Shock)
        upstream_impact = self._calculate_upstream_shock(
            src_iso, 
            best_policy['revenue_lost_usd']
        )
        
        # 5. CALCULATE DOWNSTREAM EFFECTS (Consumer Impact)
        downstream_impact = self._calculate_downstream_effect(
            tgt_iso, 
            best_policy['carbon_saved_tCO2'],
            best_policy['optimal_tax_rate']
        )
        
        return {
            "policy": best_policy,
            "baseline": {
                "trade_volume_usd": round(baseline_vol, 2),
                "carbon_footprint_tCO2": round(baseline_carbon, 2)
            },
            "upstream_impact": upstream_impact,
            "downstream_impact": downstream_impact,
            "pareto_curve": pareto_curve,
            "route_info": {
                "source": src_iso,
                "target": tgt_iso,
                "sector": sector or "All"
            }
        }
    
    def simulate_custom_split(
        self,
        target_country: str,
        split_ratio: float = 0.6,
        sector: str = None
    ) -> Dict:
        """
        Custom attribution model - flexible blame splitting
        
        Example: If split_ratio = 0.6, India takes 60% blame for its exports,
                 and importing countries split the remaining 40%
        
        Args:
            target_country: Country to analyze (e.g., 'IND')
            split_ratio: Percentage of blame assigned to producer (0.0 to 1.0)
            sector: Limit to specific sector (optional)
        
        Returns:
            Dictionary with risk redistribution across all trading partners
        """
        # Find all exports from target country
        exports_mask = self.edges['src_iso'] == target_country
        
        if sector and 'sector' in self.edges.columns:
            exports_mask &= self.edges['sector'].str.contains(sector, case=False, na=False)
        
        affected_trades = self.edges[exports_mask].copy()
        
        if affected_trades.empty:
            return {
                "error": f"No exports found for country {target_country}" +
                         (f" in sector {sector}" if sector else "")
            }
        
        # Calculate carbon redistribution
        results = []
        total_carbon_shifted = 0
        
        for _, trade in affected_trades.iterrows():
            # Estimate carbon footprint of this trade
            if 'transport_emissions_tCO2' in trade:
                total_carbon = trade['transport_emissions_tCO2']
            elif 'carbon_intensity' in trade and 'primaryValue' in trade:
                total_carbon = trade['primaryValue'] * trade['carbon_intensity']
            else:
                # Fallback estimate
                total_carbon = trade.get('primaryValue', 0) * 0.001
            
            buyer = trade['tgt_iso']
            trade_value = trade.get('primaryValue', 0)
            
            # OLD LOGIC (Producer Pays 100%)
            old_producer_liability = total_carbon
            old_consumer_liability = 0
            
            # NEW LOGIC (Custom Split)
            new_producer_liability = total_carbon * split_ratio
            new_consumer_liability = total_carbon * (1 - split_ratio)
            
            # Calculate financial implications (assuming $50/ton carbon price)
            carbon_price = 50  # USD per ton CO2
            
            producer_cost_change = (new_producer_liability - old_producer_liability) * carbon_price
            consumer_cost_change = (new_consumer_liability - old_consumer_liability) * carbon_price
            
            total_carbon_shifted += (old_producer_liability - new_producer_liability)
            
            results.append({
                "buyer_country": buyer,
                "trade_volume_usd": round(trade_value, 2),
                "total_carbon_tCO2": round(total_carbon, 2),
                "producer_liability_before": round(old_producer_liability, 2),
                "producer_liability_after": round(new_producer_liability, 2),
                "consumer_liability_before": round(old_consumer_liability, 2),
                "consumer_liability_after": round(new_consumer_liability, 2),
                "producer_cost_change_usd": round(producer_cost_change, 2),
                "consumer_cost_change_usd": round(consumer_cost_change, 2),
                "producer_savings": producer_cost_change < 0
            })
        
        # Summary statistics
        total_trade_value = affected_trades['primaryValue'].sum()
        num_partners = len(results)
        
        # Calculate producer's total savings/cost
        producer_total_change = sum(r['producer_cost_change_usd'] for r in results)
        
        return {
            "policy_type": "CUSTOM_ATTRIBUTION",
            "target_country": target_country,
            "split_ratio": split_ratio,
            "sector": sector or "All",
            "summary": {
                "total_carbon_shifted_tCO2": round(total_carbon_shifted, 2),
                "producer_financial_impact_usd": round(producer_total_change, 2),
                "producer_savings": producer_total_change < 0,
                "num_trading_partners": num_partners,
                "total_trade_volume_usd": round(total_trade_value, 2)
            },
            "partner_impacts": results
        }
    
    def _calculate_upstream_shock(
        self,
        country: str,
        revenue_lost: float
    ) -> List[Dict]:
        """
        Calculate how a country's export loss affects its suppliers
        
        Uses Input-Output logic: If country loses $X in exports,
        it reduces imports by ~20% of X (based on typical I/O coefficients)
        
        Args:
            country: ISO3 code of affected country
            revenue_lost: Export revenue loss (USD)
        
        Returns:
            List of supplier impacts
        """
        suppliers = self.suppliers_map.get(country, [])
        
        if not suppliers or revenue_lost <= 0:
            return []
        
        # Simplified I/O model: Import reduction = 0.2 * Export loss
        # (In reality, this varies by sector and country)
        import_cut = revenue_lost * 0.2
        
        impacts = []
        
        # Distribute pain across suppliers proportionally
        # Get supplier trade volumes
        supplier_trades = self.edges[
            (self.edges['tgt_iso'] == country) & 
            (self.edges['src_iso'].isin(suppliers))
        ]
        
        total_supplier_volume = supplier_trades['primaryValue'].sum()
        
        for supplier in suppliers[:10]:  # Top 10 suppliers
            supplier_volume = supplier_trades[
                supplier_trades['src_iso'] == supplier
            ]['primaryValue'].sum()
            
            # Proportional impact
            if total_supplier_volume > 0:
                supplier_loss = import_cut * (supplier_volume / total_supplier_volume)
                loss_pct = (supplier_loss / supplier_volume * 100) if supplier_volume > 0 else 0
                
                impacts.append({
                    "supplier_country": supplier,
                    "current_trade_volume": round(supplier_volume, 2),
                    "revenue_at_risk": round(supplier_loss, 2),
                    "impact_pct": round(loss_pct, 2),
                    "status": "High Risk" if loss_pct > 10 else "Moderate Risk" if loss_pct > 5 else "Low Risk"
                })
        
        # Sort by impact (highest first)
        impacts.sort(key=lambda x: x['revenue_at_risk'], reverse=True)
        
        return impacts
    
    def _calculate_downstream_effect(
        self,
        country: str,
        carbon_saved: float,
        tax_rate: float
    ) -> Dict:
        """
        Calculate consumer-side impact
        
        Args:
            country: Importing country
            carbon_saved: Carbon reduction achieved
            tax_rate: Tax rate applied
        
        Returns:
            Consumer impact metrics
        """
        # Calculate cost increase for consumers
        # Tax gets passed through to consumers (price increase)
        consumer_cost_increase = carbon_saved * 50 * tax_rate  # Rough estimate
        
        return {
            "importing_country": country,
            "carbon_burden_reduced": round(carbon_saved, 2),
            "consumer_price_increase_usd": round(consumer_cost_increase, 2),
            "impact_type": "Price increase due to carbon tax"
        }
    
    def _get_efficiency_rating(self, score: float) -> str:
        """Convert efficiency score to rating"""
        if score > 5.0:
            return "Very High"
        elif score > 2.0:
            return "High"
        elif score > 1.0:
            return "Medium"
        elif score > 0.5:
            return "Low"
        else:
            return "Very Low"
