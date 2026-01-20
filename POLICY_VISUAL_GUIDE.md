# Policy Simulator - Visual Guide

## What the Colors & Changes Mean

The Policy Lab uses colors and visual changes to show the **real-world impact** of different policy scenarios. Here's what each color signifies:

---

## 🔴 CBAM Simulation (EU Carbon Border Tax)

### What It Simulates
The EU applying a carbon tax on steel imports, making carbon-intensive goods more expensive when entering Europe.

### Visual Changes You'll See

**In the Simulated Graph (Right Side):**

1. **RED Edges (#e74c3c)** = Trade routes affected by CBAM tax
   - These are steel exports flowing INTO EU countries (Germany, France, Italy, Spain, Netherlands, Belgium, etc.)
   - The redder the edge, the more that trade route is being taxed
   - Volume (thickness) of the edge decreases because taxes make trade more expensive

2. **ORANGE Nodes (#e67e22)** = Countries hit by the tax (affected exporters)
   - These are steel-producing countries that export to the EU (e.g., China, India, Turkey, Russia)
   - They lose export revenue when EU customers reduce purchases

3. **Thinner Edges** = Reduced trade volume
   - Trade volume drops by the tax rate (e.g., 20% tax = 20% less trade)
   - Visually shown by thinner lines connecting countries

### Metrics Explained

- **Trade Volume Change**: How much EU steel trade decreased in USD
- **Affected Trade Routes**: Number of export connections impacted
- **Affected Exporters**: Countries losing export revenue
- **Carbon Leakage Risk**:
  - 🟢 **Low** = Trade reduction is small, unlikely to shift elsewhere
  - 🟡 **Medium** = Moderate risk that production moves to non-EU markets
  - 🔴 **High** = High risk of "carbon leakage" (emissions just move to other regions instead of reducing)

### Real-World Meaning
- Red edges = "This trade route is being penalized by carbon taxes"
- Orange nodes = "This country's steel exports to EU are declining"
- Leakage risk = "Will this just push factories to other countries instead of reducing emissions?"

---

## 🟢 Technology Transfer Simulation (Green Grid)

### What It Simulates
Rich countries investing in green technology for developing nations (e.g., solar panels, efficient manufacturing for India, Vietnam, Bangladesh).

### Visual Changes You'll See

**In the Simulated Graph (Right Side):**

1. **GREEN Nodes (#27ae60)** = Countries that received green technology
   - These are developing nations: India (IND), Vietnam (VNM), Bangladesh (BGD), Pakistan (PAK), Philippines (PHL), Thailand (THA), Indonesia (IDN), China (CHN)
   - Their emission intensity drops (they become "greener")

2. **GREEN Edges (#27ae60)** = Trade routes involving greener countries
   - Any trade flowing to/from a technology-upgraded country
   - Shows how green technology spreads through supply chains

3. **Lower CO2 Values** = Reduced emission intensity
   - Node tooltips show lower CO2 intensity numbers
   - Country produces same goods with less pollution

### Metrics Explained

- **Emission Intensity Change**: How much cleaner production becomes (e.g., -30% = 30% less emissions per unit of output)
- **Affected Countries**: Number of developing nations upgraded
- **Global Impact**: Percentage of world GDP affected (shows economic importance)
- **Est. CO2 Reduction**: Total tonnes of CO2 saved globally (in kilotons)

### Real-World Meaning
- Green nodes = "This country got green technology and is now cleaner"
- Green edges = "Trade involving greener countries"
- CO2 reduction = "Actual environmental benefit from helping developing nations"

---

## 🔵 Fairness Dial (Attribution Frameworks)

### What It Simulates
Changes how we assign responsibility for carbon emissions based on different moral frameworks.

### Visual Changes You'll See

**Different colors for different frameworks:**

#### Producer Pays (Status Quo)
- 🔴 **RED Edges (#e74c3c)** = Trade from high-emission producers (>80 intensity)
- 🟠 **ORANGE Edges (#f39c12)** = Trade from medium-emission producers (50-80 intensity)
- ⚪ **GRAY Edges (#95a5a6)** = Trade from low-emission producers (<50 intensity)
- **Meaning**: Blames the country that *makes* the goods

#### Consumer Pays (Consumption-Based)
- 🔴 **RED Edges (#e74c3c)** = Trade flowing to rich countries (>$1 trillion GDP)
- 🟠 **ORANGE Edges (#f39c12)** = Trade to moderately rich countries ($100B-$1T GDP)
- ⚪ **GRAY Edges (#95a5a6)** = Trade to poorer countries (<$100B GDP)
- **Meaning**: Blames the country that *buys* the goods

#### Shapley (Fair/Balanced)
- 🔵 **BLUE Edges (#3498db)** = All trade routes (neutral color)
- **Meaning**: Fairly splits responsibility 60% producer / 40% consumers

### Metrics Explained

- **Framework**: Which attribution method is active
- **Description**: Explanation of how responsibility is calculated

### Real-World Meaning
This shows the political debate:
- **Producer Pays**: "China emits CO2 making steel" (standard accounting)
- **Consumer Pays**: "USA caused those emissions by buying Chinese steel" (consumption accounting)
- **Shapley**: "Let's split the responsibility fairly" (game theory solution)

---

## General Graph Legend

### Node Colors (When NOT Overridden by Policy)
- 🟣 **Purple (#6c5ce7)** = High-risk country (emission intensity > 80)
- 🔵 **Cyan (#00cec9)** = Low-risk country (emission intensity ≤ 80)

### Node Size
- Larger nodes = Higher GDP (economic power)
- Smaller nodes = Lower GDP

### Edge Thickness
- Thicker lines = Higher trade volume (in USD)
- Thinner lines = Lower trade volume

### Edge Colors (When NOT Overridden by Policy)
- Dark gray (#2c3e50) = Steel sector
- Light purple (#a29bfe) = Energy sector
- Light blue (#74b9ff) = Textiles sector

---

## How to Read the Split Screen

### Left Side: "Current Reality"
- Shows the actual state of global trade
- Based on real CSV data from your project
- No policy interventions applied

### Right Side: "Simulated Future"
- Shows what would happen IF the policy were implemented
- Color changes highlight the impact
- Thickness changes show volume effects

### Key Comparisons
1. **Count nodes with different colors** = How many countries are affected
2. **Look for new red edges** = Which trade routes are penalized/changed
3. **Compare edge thickness** = How much trade volume shifts
4. **Read the metrics** = Quantitative impact (dollars, tonnes CO2, countries affected)

---

## Practical Use Cases

### For Policy Makers
- **CBAM**: "Will this carbon tax reduce emissions or just shift production to other countries?"
- **Tech Transfer**: "How much CO2 can we save by investing in India's green grid?"
- **Fairness Dial**: "Should we blame producers or consumers for emissions?"

### For Researchers
- **CBAM**: Measure carbon leakage risk quantitatively
- **Tech Transfer**: Calculate ROI of green technology investments
- **Fairness Dial**: Compare accounting frameworks

### For Activists
- Visual proof of policy impacts
- Show trade-offs (e.g., leakage risk vs emission reduction)
- Demonstrate fairness of Shapley vs extreme models

---

## Summary Table

| Policy Type | Visual Signal | What It Means | Key Metric |
|-------------|---------------|---------------|------------|
| CBAM | 🔴 Red edges | Trade penalized by tax | Financial impact (USD) |
| CBAM | 🟠 Orange nodes | Countries losing exports | Leakage risk (Low/Med/High) |
| Tech Transfer | 🟢 Green nodes | Countries upgraded | CO2 reduction (kt) |
| Tech Transfer | 🟢 Green edges | Trade with greener nations | Global GDP impact (%) |
| Fairness Dial (Producer) | 🔴 Red edges | High-emitter producers | Producer ratio (100%) |
| Fairness Dial (Consumer) | 🔴 Red edges | Rich consumer nations | Producer ratio (0%) |
| Fairness Dial (Shapley) | 🔵 Blue edges | Balanced attribution | Producer ratio (60%) |
