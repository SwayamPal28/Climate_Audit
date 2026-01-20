import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './DiplomaticSandbox.css';
import LLMAnalystPanel from './LLMAnalystPanel';

const DiplomaticSandbox = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState({ player: 'USA', rival: 'CHN', sector: 'Energy' });
  const [gameData, setGameData] = useState(null);
  const [turnHistory, setTurnHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [equilibriumFound, setEquilibriumFound] = useState(false);

  // LLM Analysis state
  const [latestTurnForAnalysis, setLatestTurnForAnalysis] = useState(null);

  // Policy preferences
  const [playerPreference, setPlayerPreference] = useState(76); // 76% carbon priority
  const [rivalPreference, setRivalPreference] = useState(70); // 70% aggressiveness

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

  const initializeGame = React.useCallback(async (playerIso, rivalIso) => {
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/diplomacy/start', {
        player_iso: playerIso,
        rival_iso: rivalIso
      });
      setGameData(res.data);
      setTurnHistory([]);
      setEquilibriumFound(false);

      if (res.data.rival.vulnerabilities.length > 0) {
        setConfig(prev => ({ ...prev, sector: res.data.rival.vulnerabilities[0].sector }));
      }
    } catch (err) {
      alert("Failed to initialize: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    initializeGame(config.player, config.rival);
  }, [initializeGame, config.player, config.rival]);

  const playTurn = async () => {
    const severity = playerPreference / 100;
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/diplomacy/turn', {
        player_iso: config.player,
        rival_iso: config.rival,
        action_type: "TARIFF",
        sector: config.sector,
        severity: severity
      });

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

      setLatestTurnForAnalysis({
        player_iso: config.player,
        rival_iso: config.rival,
        turn_summary: res.data.round_summary,
        ai_persona: gameData?.rival?.persona || 'BALANCED'
      });

      if (res.data.round_summary.ai_reaction.action === "STABILIZE") {
        setEquilibriumFound(true);
      } else {
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

  const latestTurn = turnHistory.length > 0 ? turnHistory[turnHistory.length - 1] : null;

  return (
    <div className="diplomatic-container">
      {/* 1. LEFT SIDEBAR - COMMAND PANEL */}
      <aside className="diplomatic-sidebar">
        <div className="sidebar-header">
          <div className="lab-title">
            DIPLOMACY LAB
          </div>
          <button onClick={() => navigate('/')} className="back-link">
            &larr; Exit to Dashboard
          </button>
        </div>

        <div className="sidebar-controls">
          <div className="control-section-title">Negotiation Setup</div>

          <div className="config-card">
            <div className="input-group">
              <label>Initiator (You)</label>
              <select
                value={config.player}
                onChange={e => setConfig({ ...config, player: e.target.value })}
                className="control-select"
              >
                {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>

            <div className="vs-divider">VS</div>

            <div className="input-group">
              <label>Responder (AI)</label>
              <select
                value={config.rival}
                onChange={e => setConfig({ ...config, rival: e.target.value })}
                className="control-select"
              >
                {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Trade Sector</label>
            <select
              value={config.sector}
              onChange={e => setConfig({ ...config, sector: e.target.value })}
              className="control-select"
            >
              {sectors.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="control-section-title" style={{ marginTop: '24px' }}>Strategic Levers</div>

          <div className="slider-container">
            <div className="slider-header">
              <span>Proposed Tariff / Tax</span>
              <span className="slider-value">{playerPreference}%</span>
            </div>
            <input
              type="range"
              className="chunky-slider"
              min="0" max="100"
              value={playerPreference}
              onChange={e => setPlayerPreference(e.target.value)}
            />
          </div>

          <div className="slider-container">
            <div className="slider-header">
              <span>AI Aggressiveness</span>
              <span className="slider-value">{rivalPreference}%</span>
            </div>
            <input
              type="range"
              className="chunky-slider"
              min="0" max="100"
              value={rivalPreference}
              onChange={e => setRivalPreference(e.target.value)}
            />
          </div>

          <button className="run-btn" onClick={playTurn} disabled={loading}>
            {loading ? 'Simulating Round...' : 'Run Negotiation Round'}
          </button>

        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="diplomatic-workspace">
        <div className="workspace-header">
          <div className="header-title">Nash Equilibrium Finder</div>
          <div className="research-grade-badge">RESEARCH GRADE</div>
        </div>

        <div className="diplomatic-content">
          {/* Equilibrium Status Card */}
          <div className="equilibrium-status-card">
            {equilibriumFound ? (
              <div className="status-header found">STATUS: NASH EQUILIBRIUM ESTABLISHED</div>
            ) : (
              <div className="status-header searching">
                {turnHistory.length > 0 ? "STATUS: SEARCHING FOR STABILITY..." : "STATUS: READY TO NEGOTIATE"}
              </div>
            )}

            {latestTurn ? (
              <div className="eq-dashboard">
                <div className="stats-row">
                  <div className="eq-player-stats">
                    <div className="eq-country">{config.player}</div>
                    <div className="eq-big-metric">
                      <span className="metric-label">TARIFF</span>
                      <span className="metric-val">{latestTurn.playerTariff.toFixed(1)}%</span>
                    </div>
                    <div className="eq-damage-metric">
                      <span className="label">GDP IMPACT</span>
                      <span className="negative">-${(latestTurn.playerDamage / 1e6).toFixed(1)}M</span>
                    </div>
                  </div>

                  <div className="eq-center-interaction">
                    <div className="interaction-divider"></div>
                    <div className={`tension-pill ${latestTurn.tension || 'LOW'}`}>
                      {latestTurn.tension || 'LOW TENSION'}
                    </div>
                  </div>

                  <div className="eq-player-stats">
                    <div className="eq-country">{config.rival}</div>
                    <div className="eq-big-metric">
                      <span className="metric-label">RETALIATION</span>
                      <span className="metric-val">{latestTurn.aiTariff.toFixed(1)}%</span>
                    </div>
                    <div className="eq-damage-metric">
                      <span className="label">GDP IMPACT</span>
                      <span className="negative">-${(latestTurn.aiDamage / 1e6).toFixed(1)}M</span>
                    </div>
                  </div>
                </div>

                <div className="ai-rationale-box">
                  <strong>AI Strategy:</strong> {latestTurn.aiDescription}
                </div>
              </div>
            ) : (
              <div className="empty-state-message">
                Configure the negotiation parameters on the left and click "Run Negotiation Round" to begin the game theory simulation.
              </div>
            )}
          </div>

          {/* Timeline */}
          {turnHistory.length > 0 && (
            <div className="timeline-section">
              <h3>Negotiation History</h3>
              <div className="timeline-scroll">
                {turnHistory.map((turn, idx) => (
                  <div key={idx} className={`timeline-card ${turn.aiAction === 'RETALIATE' ? 'action-retaliate' : 'action-stabilize'}`}>
                    <div className="round-number">Rd {turn.round}</div>
                    <div className="timeline-metrics">
                      <div>{config.player}: {turn.playerTariff.toFixed(0)}%</div>
                      <div>{config.rival}: {turn.aiTariff.toFixed(0)}%</div>
                    </div>
                    <div className="timeline-action">{turn.aiAction}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LLM Panel attached at bottom of workspace */}
          {latestTurnForAnalysis && (
            <div className="diplomatic-llm-container">
              <LLMAnalystPanel
                analysisType="diplomatic"
                simulationData={latestTurnForAnalysis}
                autoTrigger={true}
                collapsed={false}
              />
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default DiplomaticSandbox;
