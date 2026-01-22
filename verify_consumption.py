import sys
import os

# Ensure we can import from app
sys.path.append(os.path.join(os.getcwd(), "python-services"))

from services.data_engine import DataEngine

def test_consumption_logic():
    print("Initializing Data Engine...")
    de = DataEngine()
    
    # Test Case 1: USA (High Consumption Expected)
    print("\n--- Testing USA ---")
    usa_prod, usa_imp, usa_exp = de.calculate_consumer_intensity("USA")
    
    print(f"Production Intensity: {usa_prod:.2f}")
    print(f"Import Adder:         +{usa_imp:.2f}")
    print(f"Export Subtractor:    -{usa_exp:.2f}")
    
    usa_cons = usa_prod + usa_imp - usa_exp
    print(f"Final Consumer Int:   {usa_cons:.2f}")
    
    if usa_cons > usa_prod:
        print("✅ PASS: USA has higher consumption intensity (Net Importer of Carbon)")
    else:
        print("⚠️ NOTE: USA consumption intensity is lower/equal. Check if trade data is loaded.")

    # Test Case 2: China (High Production Expected)
    print("\n--- Testing China (CHN) ---")
    chn_prod, chn_imp, chn_exp = de.calculate_consumer_intensity("CHN")
    
    print(f"Production Intensity: {chn_prod:.2f}")
    print(f"Import Adder:         +{chn_imp:.2f}")
    print(f"Export Subtractor:    -{chn_exp:.2f}")
    
    chn_cons = chn_prod + chn_imp - chn_exp
    print(f"Final Consumer Int:   {chn_cons:.2f}")
    
    if chn_cons < chn_prod:
        print("✅ PASS: China has lower consumption intensity (Net Exporter of Carbon)")
    else:
        print("⚠️ NOTE: China consumption intensity is higher. This might be valid if they import very dirty inputs.")

    # Test Case 3: Matchup API Logic Simulation
    print("\n--- Simulating Matchup (USA vs CHN) ---")
    # Production Mode
    gap_prod = chn_prod - usa_prod
    print(f"[Production] Gap: {gap_prod:.2f} (China is dirtier)")
    
    # Consumption Mode
    gap_cons = chn_cons - usa_cons
    print(f"[Consumption] Gap: {gap_cons:.2f}")
    
    if gap_cons < gap_prod:
        print("✅ PASS: Gap shrinks in Consumption Mode (Responsibility shifts to USA)")
    else:
        print("⚠️ NOTE: Gap did not shrink. Check math.")

if __name__ == "__main__":
    test_consumption_logic()
