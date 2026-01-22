import sys
import os

# Add python-services to path
sys.path.append(os.path.join(os.getcwd(), 'python-services'))

from services.data_engine import DataEngine

def test_fairness_logic():
    engine = DataEngine()
    
    scenarios = [
        ("USA", "CHN", 100.0, "The Industrial Giant"),
        ("CHN", "USA", 100.0, "Leakage Risk Test"), # USA is cleaner than China -> Negative Gap?
        ("DEU", "IND", 100.0, "Emerging Economy")
    ]
    
    print(f"{'SCENARIO':<25} | {'GAP':<6} | {'FAIR TARIFF':<12} | {'RISK':<10}")
    print("-" * 60)
    
    for player, rival, price, label in scenarios:
        # Mocking the calculation from main.py logic
        p_node = engine.get_node(player)
        r_node = engine.get_node(rival)
        
        p_int = float(p_node.get('energy_intensity', 0))
        r_int = float(r_node.get('energy_intensity', 0))
        
        gap = r_int - p_int
        
        # Scaling Factor from main.py
        SCALING_FACTOR = 0.005 
        
        fair_tariff = 0.0
        if gap > 0:
            fair_tariff = (gap * price * SCALING_FACTOR)
            fair_tariff = min(fair_tariff, 50.0)
            
        risk = "HIGH" if gap < 0 else "LOW"
        
        print(f"{label:<25} | {gap:>6.1f} | {fair_tariff:>11.1f}% | {risk:<10}")

if __name__ == "__main__":
    test_fairness_logic()
