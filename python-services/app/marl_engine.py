# python-services/app/marl_engine.py

import pandas as pd
import numpy as np

class DiplomaticAgent:
    """
    AI Agent that remembers negotiation history and adapts strategy.
    
    NOTE: This uses heuristic decision rules based on Game Theory principles
    (Tit-for-Tat, Reciprocity) rather than deep Reinforcement Learning.
    The "learning" is simulated through history tracking and persona adaptation.
    """
    def __init__(self, iso, persona="BALANCED"):
        self.iso = iso
        self.persona = persona
        self.history = []  # Memory of past turns
        
        # Define Utility Weights based on Persona
        if persona == "GROWTH_FOCUSED":  # e.g., India, China
            self.weights = {"gdp": 2.0, "co2": 0.1, "stability": 0.5}
            self.patience = 3  # Will retaliate aggressively for 3 rounds
        elif persona == "CLIMATE_FOCUSED":  # e.g., EU
            self.weights = {"gdp": 0.5, "co2": 2.0, "stability": 0.8}
            self.patience = 5  # More diplomatic
        else:  # Balanced (USA, CAN)
            self.weights = {"gdp": 1.0, "co2": 1.0, "stability": 1.0}
            self.patience = 4

    def choose_reaction(self, incoming_damage_usd, trade_profile, player_action, rival_energy_intensity):
        """
        Decides response based on Game Theory, Negotiation History, and CARBON IMPACT.
        """
        # 1. Record the move
        self.history.append({
            "damage": incoming_damage_usd,
            "action": player_action
        })
        
        round_num = len(self.history)
        
        # Calculate Carbon Benefit (Proxy: Avoided emission from reduced trade)
        # 1. Intensity is kg CO2 / $1000 GDP.
        # 2. We assume trade reduction corresponds to emission reduction in the high-intensity country.
        # 3. Scale: Trade $ * Intensity / 1000 = kg CO2. / 1000 = Metric Tons (MT) -> / 1000 = KT
        # Simplification: Trade Volume * Severity * Elasticity = Lost Trade.
        # Lost Trade * Intensity = Avoided Emissions (roughly).
        
        lost_trade_value = incoming_damage_usd # Already includes elasticity (0.85)
        carbon_reduced_kt = (lost_trade_value / 1000.0) * rival_energy_intensity / 1000.0
        
        # 2. Check for Convergence (Nash Equilibrium Search)
        if round_num > 1:
            prev_damage = self.history[-2]["damage"]
            damage_change = abs(incoming_damage_usd - prev_damage)
            
            is_damage_stable = damage_change < (prev_damage * 0.01)
            is_damage_low = incoming_damage_usd < 5_000_000 
            
            if is_damage_stable and prev_damage > 0:
                 if is_damage_low:
                     return self._negotiate_truce(incoming_damage_usd, trade_profile, carbon_reduced_kt)
                 else:
                     pass # Fall through to standard logic (War Equilibrium)

        # 3. Standard Reaction Logic (Tit-for-Tat with Persona Decay)
        
        # If damage is negligible
        if incoming_damage_usd < 50_000_000: 
            return {
                "action": "IGNORE", 
                "description": "Damage negligible. Monitoring situation.", 
                "tariff_rate": 0.0,
                "estimated_damage_to_opponent": 0,
                "carbon_reduced_kt": carbon_reduced_kt
            }

        # Find Leverage
        if not trade_profile:
            return {
                "action": "PROTEST", 
                "description": "Diplomatic protest only. No trade leverage found to retaliate effectively.", 
                "tariff_rate": 0.0,
                "estimated_damage_to_opponent": 0,
                "carbon_reduced_kt": carbon_reduced_kt
            }

        vulnerable_sectors = sorted(trade_profile, key=lambda x: x['value'], reverse=True)
        target_sector = vulnerable_sectors[0]

        # CALCULATE RETALIATION INTENSITY
        base_tariff = (incoming_damage_usd / target_sector['value'])
        
        # Apply Persona Multiplier
        gdp_weight = self.weights.get("gdp", 1.0)
        co2_weight = self.weights.get("co2", 1.0)
        stability_weight = self.weights.get("stability", 1.0)
        
        # Aggression Score
        aggression_score = gdp_weight / stability_weight if stability_weight > 0 else 2.0
        
        # --- CLIMATE MODIFIER (New) ---
        # If agent is Climate Focused and Carbon Reduction is High, REDUCE aggresion.
        # High reduction threshold > 100 KT CO2
        climate_dampener = 1.0
        rationale_prefix = "Tit-for-Tat response: "
        
        if self.persona == "CLIMATE_FOCUSED" and carbon_reduced_kt > 50:
            climate_dampener = 0.5 # Retaliate 50% less because we like the carbon cut
            rationale_prefix = "Modified response (Climate Alignment): "
        elif self.persona == "GROWTH_FOCUSED" and carbon_reduced_kt > 50:
            climate_dampener = 1.2 # Retaliate MORE because we see this as unfair "Green Protectionism"
            rationale_prefix = "Aggressive response (Green Protectionism detected): "
            
        multiplier = aggression_score * (1.5 if round_num < self.patience else 0.8) * climate_dampener
        
        # Cap multiplier
        multiplier = max(0.5, min(2.0, multiplier))
            
        final_tariff = min(0.50, base_tariff * multiplier)
        
        damage_back = target_sector['value'] * final_tariff * 0.9 
        
        return {
            "action": "RETALIATE",
            "target_sector": target_sector['sector'],
            "tariff_rate": float(final_tariff),
            "description": f"{rationale_prefix}Retaliating with {final_tariff*100:.1f}% tariff on {target_sector['sector']}. Trade-off: GDP loss vs {carbon_reduced_kt:.1f}kt CO2 reduction.",
            "estimated_damage_to_opponent": damage_back,
            "carbon_reduced_kt": carbon_reduced_kt,
            "climate_dampener": climate_dampener
        }

    def _negotiate_truce(self, incoming_damage, trade_profile, carbon_reduced_kt):
        """Logic to accept a deal if it stabilizes"""
        acceptance_threshold = 500_000_000
        
        if self.persona == "GROWTH_FOCUSED" and incoming_damage > acceptance_threshold:
             # Pass carbon_reduced_kt = 0 here as we are fighting anyway, mostly legacy call support
             # But strictly, we should pass the real intensity. We'll simplify and just recurse with base params if needed
             # Actually, simpler to just return a hardcoded retaliation to avoid infinite recursion complexity on param mismatch
             return {
                "action": "RETALIATE",
                "target_sector": "General",
                "tariff_rate": 0.25,
                "description": "Repeated Aggression: Rejection of high-damage stability.",
                "estimated_damage_to_opponent": incoming_damage,
                "carbon_reduced_kt": carbon_reduced_kt
            }
             
        return {
            "action": "STABILIZE",
            "target_sector": "None",
            "tariff_rate": 0.0,
            "description": f"Equilibrium reached. AI accepts current policy. Net CO2 Reduction: {carbon_reduced_kt:.1f}kt",
            "estimated_damage_to_opponent": 0,
            "carbon_reduced_kt": carbon_reduced_kt
        }


class DiplomaticSandbox:
    """
    Orchestrates the game-theoretic simulation with state persistence.
    """
    def __init__(self, data_engine):
        self.data_engine = data_engine
        self.sessions = {}  # Store agents per session (keyed by player_iso)
    
    def start_scenario(self, player_iso, rival_iso):
        """Initializes game"""
        player_iso = player_iso.strip().upper()
        rival_iso = rival_iso.strip().upper()
        
        # Get Real Data
        exports_to_rival = self.data_engine.get_bilateral_trade(player_iso, rival_iso)
        imports_from_rival = self.data_engine.get_bilateral_trade(rival_iso, player_iso)
        rival_node = self.data_engine.get_node(rival_iso)
        
        # Determine Persona
        rival_intensity = rival_node.get('energy_intensity', 0)
        persona = "BALANCED"
        if rival_intensity > 250: 
            persona = "GROWTH_FOCUSED"
        elif rival_intensity < 120: 
            persona = "CLIMATE_FOCUSED"
        
        # Create and Store Agent
        self.sessions[player_iso] = DiplomaticAgent(rival_iso, persona)
        
        return {
            "status": "READY",
            "player": {"iso": player_iso, "leverage_points": exports_to_rival},
            "rival": {"iso": rival_iso, "persona": persona, "vulnerabilities": imports_from_rival, "energy_intensity": rival_intensity},
        }

    def process_turn(self, player_iso, rival_iso, action_type, sector, severity):
        player_iso = player_iso.strip().upper()
        
        agent = self.sessions.get(player_iso)
        if not agent:
            self.start_scenario(player_iso, rival_iso)
            agent = self.sessions[player_iso]
            
        # 1. SDG 13 Logic: Carbon Gap & Fair Tariff
        # Get Importer (Player) and Exporter (Rival) intensities
        rival_node = self.data_engine.get_node(rival_iso)
        player_node = self.data_engine.get_node(player_iso)
        
        rival_intensity = float(rival_node.get('energy_intensity', 150.0))
        player_intensity = float(player_node.get('energy_intensity', 150.0))
        
        # Carbon Gap: How much dirtier is the exporter? (Min 0)
        carbon_gap = max(0.0, rival_intensity - player_intensity)
        
        # Fair Tariff Formula: Gap * 0.002 (Scaling to percentage, e.g., 100 gap -> 20% tariff)
        # We add a small base of 5% for general trade protection
        fair_tariff = (carbon_gap * 0.002) + 0.05
        
        # AI Perception: Is this Protectionism or Climate Policy?
        # Cooperative if User Tariff is within 10% buffer of Fair Tariff
        is_cooperative = severity <= (fair_tariff + 0.10)
        
        # 2. Leakage Calculation
        leakage_risk = 0.0
        leakage_country = None
        leakage_intensity = 0.0
        
        if is_cooperative and severity > 0.10:
             # If we tax them, do we shift trade to someone dirtier?
             alternatives = self.data_engine.get_alternative_suppliers(player_iso, rival_iso, sector)
             
             for alt in alternatives:
                 # logic: If alternative is dirtier than rival, we have leakage risk
                 if alt['intensity'] > rival_intensity:
                     leakage_country = alt['iso']
                     leakage_intensity = alt['intensity']
                     
                     # Estimated shift: 30% of trade shifts to this guy
                     trade_vol = self.data_engine.get_sector_volume(rival_iso, player_iso, sector)
                     shifted_vol = trade_vol * 0.30
                     
                     # Leakage = Shifted Vol * (Alt Intensity - Rival Intensity) / 1000
                     leakage_risk = (shifted_vol / 1000.0) * (alt['intensity'] - rival_intensity) / 1000.0
                     break # Found the biggest dirtier alternative
        
        # 3. Calculate Damage & AI Reaction
        trade_vol = self.data_engine.get_sector_volume(rival_iso, player_iso, sector)
        damage_to_rival = trade_vol * severity * 0.85
        
        player_exports = self.data_engine.get_bilateral_trade(player_iso, rival_iso)
        
        # Modify AI logic based on Cooperative State
        if is_cooperative:
            # AI submits to the Climate Standard (Cooperative Persona Overrides)
            ai_decision = {
                "action": "REFORM", 
                "target_sector": "None",
                "tariff_rate": 0.0,
                "description": f"SDG 13 ALIGNMENT: {rival_iso} accepts your tariff as a valid CBAM adjusment. Implementing industry decarbonization reforms.",
                "estimated_damage_to_opponent": 0,
                "carbon_reduced_kt": (trade_vol * severity * 0.85 / 1000.0) * rival_intensity / 1000.0,
                "climate_dampener": 0.0
            }
        else:
            # Protectionism detected -> Standard Game Theory Retaliation
            ai_decision = agent.choose_reaction(damage_to_rival, player_exports, f"{action_type}_{severity}", rival_intensity)
            
        tension = "LOW" if is_cooperative else "HIGH"
        
        return {
            "round_summary": {
                "player_move": f"{action_type} on {sector} ({severity*100:.1f}%)", 
                "player_action": { 
                    "action_type": action_type,
                    "sector": sector,
                    "severity": severity,
                    "damage_inflicted": damage_to_rival,
                    "carbon_reduced_kt": ai_decision.get("carbon_reduced_kt", 0)
                },
                "damage_inflicted": damage_to_rival,
                "ai_reaction": ai_decision,
                "sdg_context": {
                    "player_intensity": player_intensity,
                    "rival_intensity": rival_intensity,
                    "carbon_gap": carbon_gap,
                    "fair_tariff": fair_tariff,
                    "leakage_kt": leakage_risk,
                    "leakage_country": leakage_country,
                    "is_fair": is_cooperative
                }
            },
            "new_state": {"tension_level": tension}
        }
