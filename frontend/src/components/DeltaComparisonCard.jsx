// frontend/src/components/DeltaComparisonCard.jsx

import React from 'react';
import './PolicyLab.css';

const DeltaComparisonCard = ({ policy, baseline, upstreamImpact, downstreamImpact }) => {
    if (!policy || !baseline) return null;

    const efficiencyColor =
        policy.efficiency_rating === 'Very High' ? '#10b981' :
            policy.efficiency_rating === 'High' ? '#22c55e' :
                policy.efficiency_rating === 'Medium' ? '#f59e0b' :
                    '#ef4444';

    return (
        <div className="delta-comparison-card">
            <div className="delta-header">
                <h3>Policy Impact Summary</h3>
                <span
                    className="efficiency-badge"
                    style={{ backgroundColor: efficiencyColor }}
                >
                    {policy.efficiency_rating} Efficiency
                </span>
            </div>

            <div className="delta-main-metric">
                <div className="delta-label">Optimal Tax Rate</div>
                <div className="delta-value-large">{(policy.optimal_tax_rate * 100).toFixed(1)}%</div>
            </div>

            <div className="delta-metrics-grid">
                <div className="delta-metric">
                    <span className="delta-metric-label">Carbon Saved</span>
                    <span className="delta-metric-value positive">
                        {policy.carbon_saved_tCO2.toLocaleString()} tCO2
                    </span>
                </div>

                <div className="delta-metric">
                    <span className="delta-metric-label">Revenue Lost</span>
                    <span className="delta-metric-value negative">
                        ${(policy.revenue_lost_usd / 1e6).toFixed(1)}M
                    </span>
                </div>

                <div className="delta-metric">
                    <span className="delta-metric-label">Trade Retention</span>
                    <span className="delta-metric-value">
                        {policy.trade_retention_pct.toFixed(1)}%
                    </span>
                </div>

                <div className="delta-metric">
                    <span className="delta-metric-label">Efficiency Score</span>
                    <span className="delta-metric-value">
                        {policy.efficiency_score.toFixed(2)} tCO2/$
                    </span>
                </div>
            </div>

            {upstreamImpact && upstreamImpact.length > 0 && (
                <div className="delta-section">
                    <h4>Upstream Impact (Suppliers)</h4>
                    <div className="upstream-preview">
                        <span>{upstreamImpact.length} suppliers affected</span>
                        <span className="impact-total">
                            ${upstreamImpact.reduce((sum, s) => sum + s.revenue_at_risk, 0).toLocaleString()} at risk
                        </span>
                    </div>
                </div>
            )}

            {downstreamImpact && (
                <div className="delta-section">
                    <h4>Consumer Impact</h4>
                    <div className="downstream-preview">
                        <span>Carbon burden reduced: {downstreamImpact.carbon_burden_reduced.toFixed(1)} tCO2</span>
                        <span className="price-impact">
                            Price increase: +${(downstreamImpact.consumer_price_increase_usd).toLocaleString()}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeltaComparisonCard;
