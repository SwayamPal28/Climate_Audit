// frontend/src/components/UpstreamImpactTable.jsx

import React from 'react';
import './PolicyLab.css';

const UpstreamImpactTable = ({ upstreamImpact }) => {
    if (!upstreamImpact || upstreamImpact.length === 0) {
        return (
            <div className="upstream-table-empty">
                <p>No significant upstream impacts detected</p>
            </div>
        );
    }

    const getStatusColor = (status) => {
        if (status === 'High Risk') return '#ef4444';
        if (status === 'Moderate Risk') return '#f59e0b';
        return '#22c55e';
    };

    return (
        <div className="upstream-impact-table">
            <h4>Upstream Supplier Impact Analysis</h4>
            <p className="table-description">
                Shows how the policy affects countries that supply goods to the exporter (collateral damage).
            </p>

            <table className="impact-table">
                <thead>
                    <tr>
                        <th>Supplier Country</th>
                        <th>Current Trade Volume</th>
                        <th>Revenue at Risk</th>
                        <th>Impact %</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {upstreamImpact.map((supplier, idx) => (
                        <tr key={idx} className={supplier.status.includes('High') ? 'high-risk' : ''}>
                            <td className="country-cell">{supplier.supplier_country}</td>
                            <td className="value-cell">
                                ${(supplier.current_trade_volume / 1e6).toFixed(1)}M
                            </td>
                            <td className="value-cell negative">
                                ${(supplier.revenue_at_risk / 1e6).toFixed(1)}M
                            </td>
                            <td className="percent-cell">
                                <span className={supplier.impact_pct > 10 ? 'high-impact' : 'moderate-impact'}>
                                    {supplier.impact_pct.toFixed(1)}%
                                </span>
                            </td>
                            <td>
                                <span
                                    className="status-badge"
                                    style={{ backgroundColor: getStatusColor(supplier.status) }}
                                >
                                    {supplier.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="table-footer">
                <span>
                    Total suppliers analyzed: {upstreamImpact.length}
                </span>
                <span>
                    Total revenue at risk: ${(upstreamImpact.reduce((sum, s) => sum + s.revenue_at_risk, 0) / 1e6).toFixed(1)}M
                </span>
            </div>
        </div>
    );
};

export default UpstreamImpactTable;
