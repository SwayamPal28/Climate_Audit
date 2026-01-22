import sys
import os

# Add python-services to path
sys.path.append(os.path.join(os.getcwd(), 'python-services'))

from services.data_engine import DataEngine

def test_weighted_accountability():
    engine = DataEngine()
    player = "USA"
    rival = "CHN"
    
    print(f"\nTesting Shared Accountability: {player} vs {rival}")
    print(f"{'WEIGHT':<10} | {'PLAYER INTENSITY':<18} | {'GAP':<8} | {'FAIR TARIFF':<12}")
    print("-" * 60)

    # 1. Get Base Data
    p_node = engine.get_node(player)
    r_node = engine.get_node(rival)
    p_prod = float(p_node.get('energy_intensity', 0))
    r_prod = float(r_node.get('energy_intensity', 0))
    
    # Consumption
    p_cons, _, _ = engine.calculate_consumer_intensity(player)
    r_cons, _, _ = engine.calculate_consumer_intensity(rival)

    # Test Weights: 0.0, 0.5, 1.0
    weights = [0.0, 0.5, 1.0]

    for w in weights:
        w_cons = w
        w_prod = 1.0 - w_cons
        
        p_final = (p_prod * w_prod) + (p_cons * w_cons)
        r_final = (r_prod * w_prod) + (r_cons * w_cons)
        
        gap = r_final - p_final
        
        # Fair Tariff
        fair_tariff = 0.0
        if gap > 0:
            fair_tariff = (gap * 100.0 * 0.005) # Price $100
            fair_tariff = min(fair_tariff, 50.0)

        label = f"{int(w*100)}% (Cons)"
        print(f"{label:<10} | {p_final:>18.1f} | {gap:>8.1f} | {fair_tariff:>11.1f}%")

if __name__ == "__main__":
    test_weighted_accountability()
