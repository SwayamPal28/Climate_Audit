# ClimaAuditX ML Math and Statistics

This document explains the statistical and mathematical concepts used by the ClimaAuditX backend. It focuses on the formulas and logic behind:

- graph neural network inference
- feature normalization
- anomaly scoring
- attribution logic
- policy simulation math
- optimization heuristics

---

## 1. Feature Normalization

In `python-services/app/main.py`, node features are normalized before being passed to the GNN.

### Formula

For each feature column `x`:

- mean: `\mu = \frac{1}{N} \sum_{i=1}^{N} x_i`
- standard deviation: `\sigma = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (x_i - \mu)^2}`
- normalized value: `z_i = \frac{x_i - \mu}{\sigma + 1e-6}`

### Implementation notes

- `gdp` and `mva` are normalized together as a 2D feature tensor.
- A small epsilon `1e-6` avoids division by zero.
- Normalization centers features at zero and scales them to unit variance, which helps GNN training and inference stability.

---

## 2. Heterogeneous Graph Neural Network

File: `python-services/models/hetero_gnn.py`

### 2.1 Input and output

- Input node features: `x_dict['country']` of shape `[N, F]` where `N` is number of countries and `F=2`.
- Heterogeneous edge types: each trade sector-flow combination becomes a distinct message type.
- Output: predicted energy intensity per country, shape `[N, 1]`.

### 2.2 Layer math

The model has two heterogeneous graph convolution layers followed by a linear readout.

#### First heterogeneous convolution:

For each edge type `e`, the graph convolution is:

```
H_e^{(1)} = GATv2Conv(x^{(0)}, edge_index_e)
```

Then the hetero-aggregator sums across edge types:

```
x^{(1)} = \text{ReLU}\left( \sum_e H_e^{(1)} \right)
```

#### Second heterogeneous convolution:

The second layer consumes the first layer output:

```
H_e^{(2)} = GATv2Conv(x^{(1)}, edge_index_e)
```

The hetero-aggregator again sums:

```
x^{(2)} = \text{ReLU}\left( \sum_e H_e^{(2)} \right)
```

#### Final projection:

A linear layer maps the final node embedding to a scalar prediction:

```
y = W x^{(2)} + b
```

where `W` is a learnable matrix of shape `[1, hidden_dim]` and `b` is a bias.

### 2.3 Graph attention

`GATv2Conv` uses graph attention to weight messages from neighboring nodes.

In general, attention computes a coefficient `\alpha_{ij}` for each source-target pair:

```
\alpha_{ij} = \text{softmax}_j \left( \text{LeakyReLU}(a^T [W x_i \, || \, W x_j]) \right)
```

These coefficients let the model attend more strongly to important trading partners.

Because the model uses `heads=2` in the first layer, the first-layer output dimension is `hidden_dim * 2`.

---

## 3. Anomaly Scoring and Audit Metrics

### 3.1 Predicted vs reported energy intensity

The core anomaly metric is:

```
\text{anomaly_score}_i = \hat{y}_i - y_i
```

where:

- `\hat{y}_i` = model predicted energy intensity for country `i`
- `y_i` = reported energy intensity from data

A positive score means the model expects the country to be less efficient than reported.

### 3.2 Deviation percentage

For a single country audit, the backend computes:

```
\text{deviation_pct} = \frac{\hat{y} - y}{y} \times 100\%
```

If the reported value is zero, deviation is set to `0` to avoid divide-by-zero.

### 3.3 Heuristic fallback anomaly scoring

When the GNN is unavailable, the fallback uses a constant baseline:

```
\text{deviation} = y - \text{GLOBAL_AVG_EMISSION_INTENSITY}
\text{anomaly_score} = \text{deviation} \times \text{ANOMALY_SCORE_SCALAR}
```

where `GLOBAL_AVG_EMISSION_INTENSITY = 50.0` and `ANOMALY_SCORE_SCALAR = 0.5`.

This is a simple z-score-inspired measure against a global baseline.

---

## 4. Attribution Logic

### 4.1 Model-based leave-one-out attribution

The `get_shapley` endpoint approximates partner influence by comparing predictions with and without a specific partner’s edges.

Algorithm outline:

1. Compute baseline prediction for target country: `\hat{y}_\text{base}`.
2. For each partner, temporarily remove its edges and recompute prediction: `\hat{y}_{-p}`.
3. Attribution weight is:

```
\text{shapley_value}_p = \hat{y}_\text{base} - \hat{y}_{-p}
```

This is a leave-one-out sensitivity score, not a full Shapley coalition value.

### 4.2 Shared responsibility heuristic

File: `python-services/app/shared_responsibility.py`

The shared responsibility engine uses the following strategy:

- Convert self-reported emissions to a consistent tonnage basis.
- Keep `producer_ratio` of emissions with the producer.
- Allocate the remaining `1 - producer_ratio` to export partners proportional to export volume.

If exports are valued by `primaryValue`, each partner receives:

```
\text{allocation}_p = \text{exported_total} \times \frac{\text{primaryValue}_p}{\sum_q \text{primaryValue}_q}
```

Then percentages are computed as:

```
\text{pct}_p = \frac{\text{allocation}_p}{\text{total_emissions}} \times 100\%
```

This is analogous to a weighted average allocation.

---

## 5. Policy Simulation Maths

These modules are not learned models; they apply econometric and heuristic formulas.

### 5.1 CBAM policy math in `PolicySimulator`

`CBAM` simulates trade reductions to EU target countries by applying a price-elasticity-based volume change.

#### Elasticity reduction formula

For affected edges, the reduction factor is:

```
\text{reduction_factor} = \max(0, 1 - \text{severity} \times \text{elasticity})
```

Then the adjusted trade volume is:

```
\text{volume}_\text{new} = \text{volume}_\text{old} \times \text{reduction_factor}
```

Common elasticity values in the code:

- `Energy`: `0.4`
- `Steel`: `0.9`
- `Textiles`: `1.8`
- Default: `1.5`

#### Iterative convergence

The simulator applies multiple iterations to approximate second-order effects:

- loss in export volume leads to a smaller demand shock globally
- demand shock is modeled with a marginal propensity to import `MPI = 0.3`

The feedback shock is:

```
\text{feedback_shock} = \frac{\text{iter_loss}}{\text{current_total_volume}} \times MPI \times 0.5
```

Then all trade edges are scaled by `(1 - feedback_shock)`.

This is a heuristic approximation of equilibrium feedback.

### 5.2 Bilateral optimization in `AdvancedPolicyEngine`

The optimization loop tests tax rates from `1%` to `50%`.

For each tax rate:

- `volume_drop_pct = tax_rate * elasticity`
- `new_volume = baseline_vol \times (1 - volume_drop_pct)`
- `carbon_saved = baseline_carbon \times volume_drop_pct`
- `revenue_loss = baseline_vol - new_volume`

The objective is to maximize efficiency:

```
\text{efficiency_score} = \frac{\text{carbon_saved}}{\text{revenue_loss}}
```

If `revenue_loss` is zero, the code scales `carbon_saved * 1000` as a placeholder.

#### Economic constraint

A policy is only feasible if:

```
\frac{\text{revenue_loss}}{\text{baseline_vol}} \le \text{max_gdp_loss_pct}
```

This enforces a maximum acceptable economic loss.

### 5.3 Carbon estimation fallback

When direct carbon intensity is unavailable, carbon is estimated with:

```
\text{baseline_carbon} = \text{baseline_vol} \times 0.001
```

This is a fixed heuristic assuming roughly `1 ton CO2 per $1M` traded.

---

## 6. Optimization and Pareto Reasoning

### 6.1 Pareto frontier concept

The engine builds a simple Pareto curve across tested tax rates, where each point is:

- tax rate
- carbon saved
- revenue lost
- efficiency score

A Pareto-optimal policy maximizes carbon saved for minimal economic loss.

### 6.2 Upstream/downstream impact

The engine also computes:

- upstream impact: how supplier countries are affected by lost trade revenue
- downstream impact: how importer countries experience carbon and trade changes

These impacts are derived from the selected best policy, not trained from data.

---

## 7. Statistics in Data Engine

`python-services/services/data_engine.py` performs several data-driven calculations.

### 7.1 Trade volume aggregation

The engine aggregates exports and imports using sums over `primaryValue`.

### 7.2 Partner share calculation

For partner contributions in `get_clean_contributors`, the share is:

```
\text{share}_p = \frac{\text{total_vol}_p}{\sum_q \text{total_vol}_q}
```

This is a normalized weight used to rank partner importance.

### 7.3 Risk-weighted partner scoring

The code evaluates partner influence by multiplying partner intensity with trade volume:

```
\text{risk} = \text{energy_intensity}_p \times \text{trade_volume}_{p \to target}
```

This is analogous to an exposure-weighted risk score.

---

## 8. Statistical assumptions and limitations

### 8.1 GNN limitations

- The model only uses two input features (`gdp`, `mva`).
- The edge structure is defined by trade flows, but edge weights are not directly embedded into the GNN.
- Predictions are therefore based on topology and country summary features rather than explicit trade weights.

### 8.2 Attribution limitations

- `get_shapley` is a sensitivity-based approximation, not a formal Shapley game-theoretic calculation.
- `SharedResponsibilityEngine` is a heuristic volume-weighted split.

### 8.3 Policy simulation limitations

- Elasticity values are fixed heuristics, not estimated from data.
- Feedback shocks are proportional approximations, not calibrated equilibrium models.
- Carbon intensity fallback uses a fixed multiplier `0.001`.

---

## 9. Suggested mathematical extensions

To make the system more rigorous, the following could be added:

- edge-weighted heterogeneous graph convolution with both trade volume and sector embeddings
- full game-theoretic Shapley value approximation using Monte Carlo coalition sampling
- calibrated elasticity models using historical trade and emissions data
- formal loss function and training pipeline for the GNN
- uncertainty quantification for prediction deviations

---

## 10. Summary

The ClimaAuditX backend blends a heterogeneous graph neural network with rule-based economic math.

Key formulas:

- normalization: `z = (x-\mu)/(\sigma+\epsilon)`
- anomaly score: `predicted - reported`
- attribution share: `value/total`
- CBAM reduction: `volume_new = volume_old * (1 - severity * elasticity)`
- policy efficiency: `carbon_saved / revenue_loss`

This file explains the core statistical mechanics in a way that matches the code implementation.
