// frontend/src/components/BilateralPolicySelector.jsx

import React, { useState } from 'react';
import './PolicyLab.css';

const SECTORS = ['Steel', 'Energy', 'Textiles', 'All'];

// Common countries for quick selection
const COMMON_COUNTRIES = [
    'USA', 'CHN', 'IND', 'DEU', 'GBR', 'FRA', 'JPN', 'CAN',
    'BRA', 'RUS', 'AUS', 'MEX', 'IDN', 'THA', 'VNM', 'BGD'
];

const BilateralPolicySelector = ({ onOptimize, isLoading }) => {
    const [srcCountry, setSrcCountry] = useState('IND');
    const [tgtCountry, setTgtCountry] = useState('USA');
    const [sector, setSector] = useState('All');
    const [maxGdpLoss, setMaxGdpLoss] = useState(0.15);
    const [elasticity, setElasticity] = useState(0.8);

    const handleOptimize = () => {
        if (!srcCountry || !tgtCountry) {
            alert('Please select both source and target countries');
            return;
        }

        if (srcCountry === tgtCountry) {
            alert('Source and target countries must be different');
            return;
        }

        onOptimize({
            src_iso: srcCountry,
            tgt_iso: tgtCountry,
            sector: sector === 'All' ? null : sector,
            max_gdp_loss_pct: maxGdpLoss,
            elasticity: elasticity
        });
    };

    return (
        <div className="bilateral-selector">
            <h4>Bilateral Policy Optimizer</h4>
            <p className="bilateral-description">
                Find the optimal policy between two countries that maximizes carbon reduction within economic constraints.
            </p>

            <div className="bilateral-grid">
                <div className="bilateral-input">
                    <label>Exporter (Source)</label>
                    <select
                        value={srcCountry}
                        onChange={(e) => setSrcCountry(e.target.value)}
                        className="control-select"
                    >
                        <option value="">Select Country</option>
                        {COMMON_COUNTRIES.map(iso => (
                            <option key={iso} value={iso}>{iso}</option>
                        ))}
                    </select>
                </div>

                <div className="bilateral-arrow">→</div>

                <div className="bilateral-input">
                    <label>Importer (Target)</label>
                    <select
                        value={tgtCountry}
                        onChange={(e) => setTgtCountry(e.target.value)}
                        className="control-select"
                    >
                        <option value="">Select Country</option>
                        {COMMON_COUNTRIES.map(iso => (
                            <option key={iso} value={iso}>{iso}</option>
                        ))}
                    </select>
                </div>

                <div className="bilateral-input">
                    <label>Sector</label>
                    <select
                        value={sector}
                        onChange={(e) => setSector(e.target.value)}
                        className="control-select"
                    >
                        {SECTORS.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bilateral-constraints">
                <div className="constraint-input">
                    <label>
                        Max GDP Loss: {(maxGdpLoss * 100).toFixed(0)}%
                    </label>
                    <input
                        type="range"
                        min="0.05"
                        max="0.30"
                        step="0.01"
                        value={maxGdpLoss}
                        onChange={(e) => setMaxGdpLoss(parseFloat(e.target.value))}
                        className="control-slider"
                    />
                    <span className="constraint-hint">Economic safety threshold</span>
                </div>

                <div className="constraint-input">
                    <label>
                        Price Elasticity: {elasticity.toFixed(2)}
                    </label>
                    <input
                        type="range"
                        min="0.3"
                        max="1.5"
                        step="0.1"
                        value={elasticity}
                        onChange={(e) => setElasticity(parseFloat(e.target.value))}
                        className="control-slider"
                    />
                    <span className="constraint-hint">Demand sensitivity to price</span>
                </div>
            </div>

            <button
                onClick={handleOptimize}
                disabled={isLoading}
                className="simulate-button"
                style={{ marginTop: '16px' }}
            >
                {isLoading ? 'Optimizing...' : 'Find Optimal Policy'}
            </button>
        </div>
    );
};

export default BilateralPolicySelector;
