import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'python-services'))
from services.data_engine import DataEngine

def test_context():
    engine = DataEngine()
    
    # Mock Logic from main.py
    scenarios = [
        ("USA", "CHN", 40),  # > 30 Gap
        ("DEU", "IND", 15),  # > 10 Gap
        ("USA", "CAN", -5),  # -10 to 10 Gap
        ("CHN", "FRA", -50)  # Cleaner
    ]
    
    print(f"\n{'GAP':<6} | {'CONTEXT'}")
    print("-" * 80)
    
    for _, _, gap in scenarios:
        scenario_context = "Standard"
        if gap > 30:
            scenario_context = "Significant Carbon Intensity Gap. High risk of leakage."
        elif gap > 10:
            scenario_context = "Moderate Carbon Intensity Gap. Calibrated tariff recommended."
        elif gap > -10:
            scenario_context = "Comparable intensities. Minimal intervention."
        else:
            scenario_context = "Partner is cleaner. Tariffs look protectionist."
            
        print(f"{gap:<6} | {scenario_context}")

if __name__ == "__main__":
    test_context()
