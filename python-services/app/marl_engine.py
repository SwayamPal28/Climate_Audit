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

    def choose_reaction(self, incoming_damage_usd, trade_profile, player_action):
        """
        Decides response based on Game Theory & Negotiation History.
        """
        # 1. Record the move
        self.history.append({
            "damage": incoming_damage_usd,
            "action": player_action
        })
        
        round_num = len(self.history)
        
        # 2. Check for Convergence (Nash Equilibrium Search)
        # If player keeps proposal consistent for 2 rounds, AI considers it a "Final Offer"
        if round_num > 1:
            prev_damage = self.history[-2]["damage"]
            damage_change = abs(incoming_damage_usd - prev_damage)
            
            # If damage hasn't changed much (< 1%), we are stabilizing
            if damage_change < (prev_damage * 0.01) and prev_damage > 0:
                # AI offers a "De-escalation" or "Acceptance"
                return self._negotiate_truce(incoming_damage_usd, trade_profile)

        # 3. Standard Reaction Logic (Tit-for-Tat with Persona Decay)
        
        # If damage is negligible
        if incoming_damage_usd < 50_000_000: 
            return {
                "action": "IGNORE", 
                "description": "Damage negligible. Monitoring situation.", 
                "tariff_rate": 0.0,
                "estimated_damage_to_opponent": 0
            }

        # Find Leverage (What we sell to them)
        if not trade_profile:
            return {
                "action": "PROTEST", 
                "description": "Diplomatic protest (No trade leverage).", 
                "tariff_rate": 0.0,
                "estimated_damage_to_opponent": 0
            }

        # Sort sectors by volume
        vulnerable_sectors = sorted(trade_profile, key=lambda x: x['value'], reverse=True)
        target_sector = vulnerable_sectors[0]

        # CALCULATE RETALIATION INTENSITY
        # Base reaction matches damage
        base_tariff = (incoming_damage_usd / target_sector['value'])
        
        # Apply Persona Multiplier using defined Utility Weights
        # (GDP focus increases retaliation, Stability focus decreases it)
        gdp_weight = self.weights.get("gdp", 1.0)
        stability_weight = self.weights.get("stability", 1.0)
        
        # Aggression factor: Higher GDP weight relative to Stability = More Aggressive
        aggression_score = gdp_weight / stability_weight if stability_weight > 0 else 2.0
        
        multiplier = aggression_score * (1.5 if round_num < self.patience else 0.8)
        
        # Cap multiplier to reasonable bounds [0.5, 2.0]
        multiplier = max(0.5, min(2.0, multiplier))
            
        final_tariff = min(0.50, base_tariff * multiplier)
        
        # Estimate damage back to opponent
        damage_back = target_sector['value'] * final_tariff * 0.9  # 0.9 Elasticity
        
        return {
            "action": "RETALIATE",
            "target_sector": target_sector['sector'],
            "tariff_rate": float(final_tariff),
            "description": f"Retaliatory tariff of {final_tariff*100:.1f}% on {target_sector['sector']}.",
            "estimated_damage_to_opponent": damage_back
        }

    def _negotiate_truce(self, incoming_damage, trade_profile):
        """Logic to accept a deal if it stabilizes"""
        # If we are Growth Focused, we accept if damage is 'manageable'
        acceptance_threshold = 500_000_000  # $500M tolerance
        
        if self.persona == "GROWTH_FOCUSED" and incoming_damage > acceptance_threshold:
            # Still fight if damage is too high
            return self.choose_reaction(incoming_damage, trade_profile, "Repeated Aggression")
             
        return {
            "action": "STABILIZE",
            "target_sector": "None",
            "tariff_rate": 0.0,
            "description": "Equilibrium reached. AI accepts current policy level to avoid further losses.",
            "estimated_damage_to_opponent": 0
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
            "rival": {"iso": rival_iso, "persona": persona, "vulnerabilities": imports_from_rival},
        }

    def process_turn(self, player_iso, rival_iso, action_type, sector, severity):
        player_iso = player_iso.strip().upper()
        
        # Retrieve Agent
        agent = self.sessions.get(player_iso)
        if not agent:
            # Re-initialize if lost (server restart)
            self.start_scenario(player_iso, rival_iso)
            agent = self.sessions[player_iso]
            
        # 1. Calculate Damage
        trade_vol = self.data_engine.get_sector_volume(rival_iso, player_iso, sector)
        damage_to_rival = trade_vol * severity * 0.85  # Elasticity
        
        # 2. Get AI Reaction
        # We need Player's exports to AI to calculate retaliation
        player_exports = self.data_engine.get_bilateral_trade(player_iso, rival_iso)
        
        ai_decision = agent.choose_reaction(damage_to_rival, player_exports, f"{action_type}_{severity}")
        
        tension = "STABLE"
        if ai_decision['action'] == "RETALIATE": 
            tension = "HIGH"
        elif ai_decision['action'] == "STABILIZE": 
            tension = "LOW"
        
        return {
            "round_summary": {
                "player_move": f"{action_type} on {sector} ({severity*100:.1f}%)",
                "damage_inflicted": damage_to_rival,
                "ai_reaction": ai_decision
            },
            "new_state": {"tension_level": tension}
        }
