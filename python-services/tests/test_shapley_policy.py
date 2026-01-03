import pytest
import pandas as pd
from app.shapley_runner import ShapleyEngine


def load_data():
    nodes = pd.read_csv('data/nodes_final_physics.csv')
    edges = pd.read_csv('data/edges_ready_for_ai.csv', on_bad_lines='skip')
    return nodes, edges


def test_producer_ratio_changes_self_share():
    nodes, edges = load_data()
    engine = ShapleyEngine(None, nodes, edges)

    r1 = engine.run_shapley('IND', producer_ratio=1.0)
    r06 = engine.run_shapley('IND', producer_ratio=0.6)
    r0 = engine.run_shapley('IND', producer_ratio=0.0)

    assert 'allocations' in r1 and 'allocations' in r06 and 'allocations' in r0

    s1 = r1['allocations'].get('SELF', 0.0)
    s06 = r06['allocations'].get('SELF', 0.0)
    s0 = r0['allocations'].get('SELF', 0.0)

    # SELF share should decrease as producer_ratio decreases
    assert s1 >= s06 >= s0

    # Efficiency: sums to ~100
    for res in (r1, r06, r0):
        total_pct = sum(res['allocations'].values())
        assert pytest.approx(100.0, rel=1e-3) == total_pct


def test_meta_consistency():
    nodes, edges = load_data()
    engine = ShapleyEngine(None, nodes, edges)

    r = engine.run_shapley('USA', producer_ratio=0.6)
    assert 'meta' in r
    meta = r['meta']
    allocs_t = meta.get('allocations_t', {})
    grand = meta.get('grand_total_tCO2')

    assert pytest.approx(sum(allocs_t.values()), rel=1e-6) == grand
    assert 0.0 <= meta.get('producer_ratio', 0.0) <= 1.0
