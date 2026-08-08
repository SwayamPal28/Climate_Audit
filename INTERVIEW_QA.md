# ClimateAuditX — Interview Q&A Cheat Sheet

Files to reference
- `python-services/app/main.py` — FastAPI app & endpoints
- `python-services/models/hetero_gnn.py` — GNN architecture
- `python-services/services/data_engine.py` — data loading & trade flows
- `python-services/app/shared_responsibility.py` — Shapley approximation
- `python-services/app/policy_simulator.py` — CBAM / Tech Transfer / Fairness Dial simulator
- `python-services/app/marl_engine.py` — Diplomatic sandbox agent logic
- `python-services/app/llm_analyst.py` — LLM fallback and prompts

---

## Quick answers to likely interview questions

### Why FastAPI + Uvicorn? How used?
- FastAPI: async-first framework, Pydantic request/response models, automatic OpenAPI docs, high throughput.
- Uvicorn: ASGI server to run FastAPI for production-like async performance.
- Usage: `main.py` defines startup hooks (loads DataEngine, GNN, simulators, LLM client) and typed endpoints such as `/api/audit/anomalies`, `/api/simulate/policy`. Async endpoints and non-blocking I/O improve responsiveness for heavy tasks (file reads, external LLM calls).

### What is a heterogeneous GNN, how built, why PyTorch Geometric?
- Heterogeneous GNN: handles graphs with multiple node/edge types. Here we have `country` nodes and many sector-specific edge types (e.g., `steel_direct`, `steel_reexport`).
- Architecture (see `hetero_gnn.py`): HeteroConv layers composed of `GATv2Conv` blocks, ReLU activations, final Linear to scalar per country. Input features include `gdp` and `mva` (Manufacturing Value Added).
- PyTorch Geometric: provides ready heterogeneous graph abstractions, GPU support, and GATv2 implementations—reduces boilerplate for learning sector-specific attention.

### What is `emission intensity` and `MVA`?
- `energy_intensity` (emission intensity): dataset-provided country-level metric (target for model). Typically CO2 per unit GDP or per unit output; used as `data['country'].y`.
- `MVA`: Manufacturing Value Added; captures industrial structure, helps the model associate sectoral activity with emissions.

### How are anomalies detected? Formula?
- Model path: `anomaly_score = predicted_intensity - reported_intensity`. Positive means model predicts the country is dirtier than reported → potential under-reporting.
- Fallback heuristic: `anomaly_score = (reported_energy_intensity - GLOBAL_AVG_EMISSION_INTENSITY) * ANOMALY_SCORE_SCALAR` when model unavailable.
- Implemented in `/api/audit/anomalies` in `main.py`.

### How is the risk score calculated?
- `risk_score` in the API is the model-predicted intensity (a numeric proxy). Higher predicted intensity → higher audit risk. See `get_audit` in `main.py`.

### How is Shapley calculated exactly?
- Two implementations:
  1. **Volume-weighted approximation** (`shared_responsibility.py`):
     - Total emissions T.
     - `SELF = producer_ratio * T`.
     - Export pool = `(1 - producer_ratio) * T`.
     - Allocate export pool to partners proportional to their export `primaryValue` share.
     - Pros: fast, interpretable. Cons: not true Shapley.
  2. **Model-based leave-one-out** (`/api/shapley/{country}` in `main.py`):
     - Baseline = model prediction for target.
     - For each partner p: remove p→target edges, recompute model prediction, `impact = baseline - new_pred`.
     - Contribution = impact. Sort partners by marginal effect.
     - Pros: captures learned structural influence. Cons: ignores coalition interactions and is costlier.
- Notes: full Shapley requires Monte Carlo sampling over coalitions (2^N) and can be added for higher fidelity.

### What does trade flow analysis do?
- `DataEngine` (`services/data_engine.py`) responsibilities:
  - Loads `nodes_final.csv` and many `processed_{sector}_{flow}.csv` files.
  - Standardizes ISO3 codes and filters rows to known nodes.
  - Aggregates `primaryValue` into `edge_volumes` lookup and stores `edges` DataFrame.
  - Builds `HeteroData` edge_index structures for the GNN (constructed in `main.py` startup).
  - Exposes helpers: `get_contributors`, `get_node`, `calculate_consumer_intensity` (production + imports − exports).

### Policy simulators: CBAM, Technology Transfer, Fairness Dial — what happens and are results verified?
- **CBAM (Carbon Border Adjustment Mechanism):**
  - Identify edges to target countries (usually EU) and sector(s).
  - Use sector elasticities (e.g., Energy 0.4, Steel 0.9, Textiles 1.8) to compute `reduction_factor = max(0, 1 - severity * elasticity)`.
  - Apply direct reduction on `primaryValue` for affected edges.
  - Compute second-order effects via iterative solver:
    - Lost exports → GDP loss → reduced import demand via MPI (~0.3).
    - Iterate (default up to 5) until convergence (<1% change).
  - Output: simulated edges/nodes, trade reduction, carbon reduction, GDP impacts.
  - Verification: heuristic; should be calibrated against empirical elasticities and historical events; primarily a decision-support tool.

- **Technology Transfer:**
  - Reduce `energy_intensity` of targeted developing nations by `severity` fraction (e.g., 30% reduction).
  - Recompute emissions = GDP × new intensity; report carbon savings and estimated cost.
  - Verification: scenario-based; validate with adoption rates and sensitivity analysis.

- **Fairness Dial:**
  - Moves attribution between producer and consumer via `producer_ratio` or modes (`producer`, `consumer`, `shapley`).
  - Reallocate emissions using shared responsibility logic and update visuals.
  - Verification: compare with full Shapley Monte Carlo to test approximation quality.

- UI mapping (from your screenshots): Slider for severity/ratio on left, center shows Current vs Simulated Future, summary cards show `Trade Vol. Change`, `Carbon Intensity` change, `Estimated Cost`, and legends for `CBAM Impact` / `Green Tech Impact` / `Fairness Attribution`.

### Diplomatic Sandbox — simple then detailed
- Simple: Turn-based negotiation simulator where AI agents (countries) react to player actions (tariffs/sanctions) using persona-weighted heuristics (growth/climate/balanced).

- Detailed (see `marl_engine.py`):
  - `DiplomaticAgent` has `persona` influencing `weights = {gdp, co2, stability}` and `patience`.
  - On `choose_reaction(incoming_damage_usd, trade_profile, player_action, rival_energy_intensity)`:
    1. Record move in `history`.
    2. Compute `carbon_reduced_kt` as proxy: `(lost_trade_value / 1000) * rival_energy_intensity / 1000`.
    3. If damage is stable & low, negotiate truce.
    4. Else compute `base_tariff = incoming_damage_usd / target_sector['value']`.
    5. Compute `aggression_score` from persona, apply `patience` multiplier and `climate_dampener` (if climate-focused and carbon reduction high, reduce aggression).
    6. `final_tariff = min(0.50, base_tariff * multiplier)`; `damage_back = target_sector['value'] * final_tariff * 0.9`.
    7. Return action object containing `tariff_rate`, `estimated_damage_to_opponent`, `carbon_reduced_kt`, and narrative.
  - Purpose: model retaliation chains, climate co-benefits, and negotiation outcomes. Limitation: heuristic; can be extended to RL-based agents.

---

## Short talking points (one-liners you can use)
- "FastAPI + Uvicorn for async endpoints, typed inputs, and docs; startup loads model and data."  
- "Heterogeneous GNN with GATv2 lets the model learn sector-specific attention weights across trade edges."  
- "Anomaly = model_pred − reported; positive => potential under-reporting."  
- "Shapley: we use a pragmatic volume-weighted split and a model-based leave-one-out marginal approach; full Shapley requires Monte Carlo."  
- "Policy simulators are calibrated scenario tools—useful for policy design and sensitivity testing, not causal proof without validation."  
- "Diplomatic sandbox models tit-for-tat with persona-weighted utilities and climate dampening for co-benefits."

---

## Next steps I can do for you
- Create a 1-page printable cheat sheet (PDF or short MD).  
- Add exact line references to code snippets in this file if you want to cite during interview.  
- Provide a short demo script (curl) to hit three endpoints: `/api/audit/anomalies`, `/api/calculate/shapley`, `/api/simulate/policy`.

Tell me which next step you'd like and I'll add it.
