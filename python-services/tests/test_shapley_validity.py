import pandas as pd
import numpy as np
from app.shapley_runner import ShapleyEngine

def run_validity_test():
    # 1. SETUP MOCK DATA
    # Scenario: Country 'AAA' reports 10 kt CO2. 
    # It has trade with 'BBB' causing 5,000 t CO2 in transport.
    nodes_mock = pd.DataFrame({
        "iso3": ["AAA", "BBB"],
        "co2_emissions_kt": [10.0, 5.0]  # 10 kt = 10,000 t
    })

    edges_mock = pd.DataFrame({
        "source_iso3": ["AAA"],
        "target_iso3": ["BBB"],
        "transport_emissions_tCO2": [5000.0] # 5,000 t
    })

    # 2. INITIALIZE ENGINE
    engine = ShapleyEngine(None, nodes_mock, edges_mock)
    
    print("--- Starting Shapley Validity Audit ---")
    raw = engine.run_shapley("AAA")

    # Engine now returns { allocations: {...}, meta: {...} }
    if isinstance(raw, dict) and 'allocations' in raw and 'meta' in raw:
        results = raw['allocations']
        meta = raw['meta']
    else:
        results = raw
        meta = {}

    if "error" in results:
        print(f"Test Failed: {results['error']}")
        return

    # 3. TEST 1: Efficiency (Sum to 100%)
    total_percentage = sum(results.values())
    is_efficient = np.isclose(total_percentage, 100.0)
    print(f"Test 1 - Efficiency (Sum = 100%): {'PASS' if is_efficient else 'FAIL'} ({total_percentage}%)")

    # 4. TEST 2: Unit Consistency (kt vs t)
    self_val = results.get("SELF", 0)
    is_unit_correct = np.isclose(self_val, 66.666, atol=0.1)
    
    print(f"Test 2 - Unit Consistency (10kt vs 5000t): {'PASS' if is_unit_correct else 'FAIL'}")
    print(f"   -> Calculated SELF: {self_val:.2f}%")
    # Print meta absolute numbers too
    if meta:
        print(f"   -> SELF absolute: {meta.get('self_emission_tCO2'):.2f} tCO2")
        print(f"   -> Partners total: {meta.get('partners_total_tCO2'):.2f} tCO2")

    if not is_unit_correct:
        print("   -> ALERT: If SELF is ~99%, you are adding 10 (kt) + 5000 (t) without conversion!")

    # 5. TEST 3: Symmetry/Partner Inclusion
    has_partner = "BBB" in results
    print(f"Test 3 - Partner Attribution: {'PASS' if has_partner else 'FAIL'}")

    print("\nFinal Results:", results)
    if meta:
        print("Meta:", meta)

if __name__ == "__main__":
    run_validity_test()
