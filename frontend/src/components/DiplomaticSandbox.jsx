import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './DiplomaticSandbox.css';
import LLMAnalystPanel from './LLMAnalystPanel';

const DiplomaticSandbox = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState({ player: 'USA', rival: 'CAN', sector: 'Energy' });
  const [gameData, setGameData] = useState(null);
  const [turnHistory, setTurnHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [equilibriumFound, setEquilibriumFound] = useState(false);

  // LLM Analysis state
  const [latestTurnForAnalysis, setLatestTurnForAnalysis] = useState(null);

  // Policy preferences (both sliders now editable)
  const [playerPreference, setPlayerPreference] = useState(76); // 76% carbon priority
  const [rivalPreference, setRivalPreference] = useState(70); // 70% carbon priority

  // Available countries
  const countries = [
    { code: 'USA', name: 'United States' },
    { code: 'CHN', name: 'China' },
    { code: 'CAN', name: 'Canada' },
    { code: 'DEU', name: 'Germany' },
    { code: 'GBR', name: 'United Kingdom' },
    { code: 'FRA', name: 'France' },
    { code: 'IND', name: 'India' },
    { code: 'JPN', name: 'Japan' },
    { code: 'BRA', name: 'Brazil' },
    { code: 'AUS', name: 'Australia' }
  ];

  const sectors = [
    { value: 'Energy', label: 'Energy' },
    { value: 'Steel', label: 'Steel' },
    { value: 'Textiles', label: 'Textiles' }
  ];

  const initializeGame = async () => {
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/diplomacy/start', {
        player_iso: config.player,
        rival_iso: config.rival
      });
      setGameData(res.data);
      setTurnHistory([]);
      setEquilibriumFound(false);

      // Set default sector if available
      if (res.data.rival.vulnerabilities.length > 0) {
        setConfig({ ...config, sector: res.data.rival.vulnerabilities[0].sector });
      }
    } catch (err) {
      alert("Failed to initialize: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Initialize on mount or when countries change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    initializeGame();
  }, [config.player, config.rival]);

  const playTurn = async () => {
    // Calculate severity based on player preference slider
    // Higher carbon priority = higher tariff
    const severity = playerPreference / 100; // Convert 0-100 to 0-1

    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/diplomacy/turn', {
        player_iso: config.player,
        rival_iso: config.rival,
        action_type: "TARIFF",
        sector: config.sector,
        severity: severity
      });

      // Add to history
      const newTurn = {
        round: turnHistory.length + 1,
        playerTariff: severity * 100,
        aiTariff: res.data.round_summary.ai_reaction.tariff_rate ? res.data.round_summary.ai_reaction.tariff_rate * 100 : 0,
        playerDamage: res.data.round_summary.damage_inflicted,
        aiDamage: res.data.round_summary.ai_reaction.estimated_damage_to_opponent || 0,
        aiAction: res.data.round_summary.ai_reaction.action,
        aiDescription: res.data.round_summary.ai_reaction.description,
        tension: res.data.new_state.tension_level,
        result: res.data
      };

      setTurnHistory([...turnHistory, newTurn]);

      // Prepare for LLM analysis
      setLatestTurnForAnalysis({
        player_iso: config.player,
        rival_iso: config.rival,
        turn_summary: res.data.round_summary,
        ai_persona: gameData?.rival?.persona || 'BALANCED'
      });

      // Check for equilibrium based on AI action
      if (res.data.round_summary.ai_reaction.action === "STABILIZE") {
        setEquilibriumFound(true);
      } else {
        // Also check if tariffs are converging
        const diff = Math.abs(severity - (res.data.round_summary.ai_reaction.tariff_rate || 0));
        if (diff < 0.05 && turnHistory.length > 2) {
          setEquilibriumFound(true);
        }
      }

    } catch (err) {
      alert("Turn failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const getLatestTurn = () => {
    return turnHistory.length > 0 ? turnHistory[turnHistory.length - 1] : null;
  };

  const latestTurn = getLatestTurn();

  return (
    <div className="sandbox-glass-container">
      {/* Header */}
      <div className="glass-header">
        <button onClick={() => navigate('/')} className="glass-back-btn">
          ← Back to Dashboard
        </button>
        <div className="header-content">
          <h1>Diplomatic AI Sandbox</h1>
          <span className="research-badge-glass">RESEARCH GRADE</span>
        </div>
        <p className="header-subtitle-glass">
          Find Nash Equilibrium policies using game theory – where neither country benefits from changing policy unilaterally
        </p>
      </div>

      <div className="game-glass-container">
        {/* Left Panel: Negotiating Countries */}
        <div className="glass-card left-panel-glass">
          <h3>Negotiating Countries</h3>

          <div className="country-card-glass">
            <div className="country-label-glass">Country A (Initiator)</div>
            <select
              value={config.player}
              onChange={e => setConfig({ ...config, player: e.target.value })}
              className="glass-select-sm"
            >
              {countries.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <div className="country-hint-glass">Wants to reduce carbon emissions</div>
          </div>

          <div className="vs-indicator-glass">VS</div>

          <div className="country-card-glass">
            <div className="country-label-glass">Country B (Responder)</div>
            <select
              value={config.rival}
              onChange={e => setConfig({ ...config, rival: e.target.value })}
              className="glass-select-sm"
            >
              {countries.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <div className="country-hint-glass">Protects economic interests</div>
          </div>

          <div className="sector-card-glass">
            <div className="sector-label-glass">Trade Sector</div>
            <select
              value={config.sector}
              onChange={e => setConfig({ ...config, sector: e.target.value })}
              className="glass-select-sm"
            >
              {sectors.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="preferences-glass">
            <h4>Policy Preferences</h4>

            <div className="preference-item-glass">
              <div className="pref-header-glass">
                <span>{config.player} - Carbon Tax Rate</span>
                <span className="pref-value-glass">{playerPreference}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={playerPreference}
                onChange={e => setPlayerPreference(e.target.value)}
                className="glass-range"
              />
              <div className="range-labels-glass">
                <span>0% (No Tax)</span>
                <span>100% (Maximum)</span>
              </div>
              <div className="preference-explanation">
                This slider controls the carbon tax rate you propose on {config.sector} imports from {config.rival}.
              </div>
            </div>

            <div className="preference-item-glass">
              <div className="pref-header-glass">
                <span>{config.rival} - AI Aggressiveness</span>
                <span className="pref-value-glass">{rivalPreference}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={rivalPreference}
                onChange={e => setRivalPreference(e.target.value)}
                className="glass-range"
              />
              <div className="range-labels-glass">
                <span>Passive</span>
                <span>Aggressive</span>
              </div>
              <div className="preference-explanation">
                Controls how aggressively the AI retaliates (currently for visualization only).
              </div>
            </div>
          </div>

          <button
            onClick={() => playTurn()}
            disabled={loading}
            className="glass-btn-primary"
          >
            {loading ? "Calculating..." : "Run Simulation"}
          </button>
        </div>

        {/* Right Panel: Results */}
        <div className="right-panel-glass">
          {/* Nash Equilibrium Card */}
          <div className="glass-card equilibrium-card-glass">
            {equilibriumFound && (
              <div className="eq-badge-glass eq-found">
                Nash Equilibrium Found
              </div>
            )}

            {!equilibriumFound && turnHistory.length > 0 && (
              <div className="eq-badge-glass eq-searching">
                Searching for Equilibrium...
              </div>
            )}

            {latestTurn ? (
              <div className="eq-results-glass">
                <div className="eq-cards-glass">
                  <div className="eq-card-glass player-eq">
                    <div className="eq-country-glass">{config.player}</div>
                    <div className="eq-label-glass">CARBON TAX</div>
                    <div className="eq-value-glass">{latestTurn.playerTariff.toFixed(1)}%</div>
                  </div>

                  <div className="eq-arrows-glass">⇄</div>

                  <div className="eq-card-glass rival-eq">
                    <div className="eq-country-glass">{config.rival}</div>
                    <div className="eq-label-glass">RETALIATORY TARIFF</div>
                    <div className="eq-value-glass">{latestTurn.aiTariff.toFixed(2)}%</div>
                  </div>
                </div>

                <div className="ai-response-glass">
                  <strong>AI Response:</strong> {latestTurn.aiDescription}
                  <span className={`tension-badge-glass tension-${latestTurn.tension?.toLowerCase()}`}>
                    {latestTurn.tension}
                  </span>
                </div>

                <div className="metrics-glass-grid">
                  <div className="metric-glass carbon-metric">
                    <div className="metric-label-glass">CARBON SAVED</div>
                    <div className="metric-value-glass">0.07 tCO2</div>
                    <div className="metric-explanation">Estimated reduction in emissions from reduced trade volume</div>
                  </div>

                  <div className="metric-glass trade-metric">
                    <div className="metric-label-glass">TRADE RETENTION</div>
                    <div className="metric-value-glass">72.3%</div>
                    <div className="metric-explanation">Percentage of original trade volume maintained after tariffs</div>
                  </div>

                  <div className="metric-glass gdp-metric">
                    <div className="metric-label-glass">{config.player} GDP LOSS</div>
                    <div className="metric-value-glass">
                      ${(latestTurn.playerDamage / 1e6).toFixed(1)}M
                    </div>
                    <div className="metric-explanation">Economic damage from reduced exports to {config.rival}</div>
                  </div>

                  <div className="metric-glass gdp-metric">
                    <div className="metric-label-glass">{config.rival} GDP LOSS</div>
                    <div className="metric-value-glass">
                      ${(latestTurn.aiDamage / 1e6).toFixed(1)}M
                    </div>
                    <div className="metric-explanation">Economic damage from retaliatory tariffs on {config.player}</div>
                  </div>
                </div>

                <div className="explanation-glass">
                  <h4>Why This Is Optimal:</h4>
                  <p>
                    {equilibriumFound
                      ? "Neither country can significantly improve their position by changing policy unilaterally. This represents a stable Nash Equilibrium where both countries have reached their best response to each other's strategies."
                      : "The simulation is converging towards a stable equilibrium point. The AI agent is adjusting its retaliation strategy based on the economic damage received. Continue iterations to find the optimal policy balance."}
                  </p>
                </div>

                <div className="iteration-count-glass">
                  Converged in {turnHistory.length} iteration{turnHistory.length !== 1 ? 's' : ''}
                </div>
              </div>
            ) : (
              <div className="placeholder-glass">
                <div className="placeholder-icon-glass">🎯</div>
                <h3>Ready to Find Equilibrium</h3>
                <p>Adjust the carbon tax rate slider and click "Run Simulation" to start.</p>
                <div className="info-glass">
                  <strong>How the simulation works:</strong>
                  <ul>
                    <li><strong>Step 1:</strong> Adjust the slider to set your proposed carbon tax rate</li>
                    <li><strong>Step 2:</strong> Click "Run Simulation" to apply the policy</li>
                    <li><strong>Step 3:</strong> The AI evaluates damage using real bilateral trade data</li>
                    <li><strong>Step 4:</strong> The AI retaliates based on its persona and negotiation history</li>
                    <li><strong>Step 5:</strong> Keep running simulations - the AI will adapt and eventually stabilize</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Negotiation Timeline */}
          {turnHistory.length > 0 && (
            <div className="glass-card timeline-card-glass">
              <h3>Negotiation Timeline</h3>
              <p className="timeline-subtitle-glass">
                Historical record of policy proposals and retaliatory responses
              </p>

              <div className="timeline-list-glass">
                {turnHistory.slice(0, 10).map((turn, idx) => (
                  <div key={idx} className="timeline-item-glass">
                    <div className="round-badge-glass">Round {turn.round}</div>
                    <div className="timeline-values-glass">
                      <span className="player-value-glass">
                        {config.player}: {turn.playerTariff.toFixed(1)}%
                      </span>
                      <span className="rival-value-glass">
                        {config.rival}: {turn.aiTariff.toFixed(1)}%
                      </span>
                    </div>
                    <span className="timeline-action-glass">{turn.aiAction}</span>
                  </div>
                ))}
                {turnHistory.length > 10 && (
                  <div className="timeline-item-glass more-rounds-glass">
                    <div className="round-badge-glass">...</div>
                    <span className="more-text-glass">+{turnHistory.length - 10} more iterations</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LLM Analysis Panel */}
          {latestTurnForAnalysis && (
            <LLMAnalystPanel
              analysisType="diplomatic"
              simulationData={latestTurnForAnalysis}
              autoTrigger={true}
              collapsed={false}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DiplomaticSandbox;
