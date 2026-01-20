import pandas as pd
import os
from pathlib import Path

class DataEngine:
    def __init__(self, data_dir=None):
        print("⚙️ Initializing Volume-Weighted Data Engine...")
        
        # 1. Setup Paths
        if data_dir is None:
            # Resolves to: python-services/data
            base_dir = Path(__file__).resolve().parents[1]
            data_dir = base_dir / "data"
        self.data_dir = Path(data_dir)

        # 2. Load Nodes (The Map)
        nodes_path = self.data_dir / "nodes_final.csv"
        if nodes_path.exists():
            self.nodes_df = pd.read_csv(nodes_path)
            self.nodes_df.fillna(0, inplace=True)
            
            # Clean ISO codes standardisation
            self.nodes_df['iso3'] = self.nodes_df['iso3'].astype(str).str.strip().str.upper()
            self.iso_to_idx = {iso: i for i, iso in enumerate(self.nodes_df['iso3']) if iso != 'NAN'}
            self.idx_to_iso = {i: iso for iso, i in self.iso_to_idx.items()}
            print(f"   - Loaded {len(self.nodes_df)} countries.")
        else:
            print("❌ CRITICAL: nodes_final.csv not found!")
            self.nodes_df = pd.DataFrame()
            self.iso_to_idx = {}
            self.idx_to_iso = {}

        # 3. Load Edges into Memory
        self.edge_volumes = {} # {(src_idx, tgt_idx): dollars}
        self.edges = pd.DataFrame() # Store full edges for 'get_clean_contributors'

        edge_files = [
            (self.data_dir / "processed_steel_direct.csv", "Steel 🏗️"),
            (self.data_dir / "processed_energy_direct.csv", "Energy ⚡"),
            (self.data_dir / "processed_textiles_direct.csv", "Textiles 👕"),
        ]

        all_edges_list = []

        for fpath, sector_label in edge_files:
            if fpath.exists():
                try:
                    # FIX: low_memory=False prevents DtypeWarning
                    df = pd.read_csv(fpath, on_bad_lines="skip", low_memory=False)
                    
                    # Standardize Column Names
                    df.columns = [str(c).strip() for c in df.columns]
                    
                    # Clean ISOs
                    df['src_iso'] = df['src_iso'].astype(str).str.strip().str.upper()
                    df['tgt_iso'] = df['tgt_iso'].astype(str).str.strip().str.upper()
                    
                    # Add Sector Label
                    df['sector'] = sector_label

                    # Filter: Only keep rows where BOTH countries are in our node list
                    valid = df['src_iso'].isin(self.iso_to_idx) & df['tgt_iso'].isin(self.iso_to_idx)
                    df = df[valid]
                    
                    # Store for DataFrame aggregation (get_clean_contributors)
                    all_edges_list.append(df[['src_iso', 'tgt_iso', 'primaryValue', 'sector']])

                    # Process for Fast Lookup Dictionary (get_contributors)
                    for _, row in df.iterrows():
                        src = row['src_iso']
                        tgt = row['tgt_iso']
                        src_i = self.iso_to_idx[src]
                        tgt_i = self.iso_to_idx[tgt]
                        
                        try:
                            vol = float(row['primaryValue'])
                        except (ValueError, TypeError):
                            vol = 0.0
                            
                        # Add to total volume map
                        if (src_i, tgt_i) not in self.edge_volumes:
                            self.edge_volumes[(src_i, tgt_i)] = 0.0
                        self.edge_volumes[(src_i, tgt_i)] += vol
                        
                except Exception as e:
                    print(f"⚠️ Error loading {fpath.name}: {e}")

        # Combine all edges into one DataFrame (Required for get_clean_contributors)
        if all_edges_list:
            self.edges = pd.concat(all_edges_list, ignore_index=True)
            # Ensure numeric
            self.edges['primaryValue'] = pd.to_numeric(self.edges['primaryValue'], errors='coerce').fillna(0)
                        
        print(f"   ✅ Loaded trade volumes for {len(self.edge_volumes)} pairs.")
        
        # 4. Load Visualization Edges
        self.viz_edges = []
        steel_path = self.data_dir / "processed_steel_direct.csv"
        if steel_path.exists():
            try:
                df_viz = pd.read_csv(steel_path, low_memory=False)
                df_viz['primaryValue'] = pd.to_numeric(df_viz['primaryValue'], errors='coerce').fillna(0)
                df_viz = df_viz.nlargest(1500, 'primaryValue')
                
                for _, row in df_viz.iterrows():
                    s_iso = str(row['src_iso']).strip().upper()
                    t_iso = str(row['tgt_iso']).strip().upper()
                    
                    if s_iso in self.iso_to_idx and t_iso in self.iso_to_idx:
                        self.viz_edges.append({
                            "source": s_iso,
                            "target": t_iso,
                            "value": float(row['primaryValue'])
                        })
            except Exception as e:
                print(f"⚠️ Error processing viz edges: {e}")

    def get_graph_data(self):
        """Prepares clean JSON for the 3D Graph Frontend"""
        nodes = []
        for _, row in self.nodes_df.iterrows():
            nodes.append({
                "id": row['iso3'],
                "co2": float(row.get('energy_intensity', 0)),
                "gdp": float(row.get('gdp', 0)),
                "val": 1 
            })
        return {"nodes": nodes, "links": self.viz_edges}

    def get_clean_contributors(self, target_iso, weight_col='primaryValue'):
        """
        Unified Logic: 
        Combines BOTH Exports (Who buys from me) AND Imports (Who sells to me).
        weight_col: 'primaryValue' (Standard $) or 'weight_risk' (Monte Carlo Risk)
        """
        target_iso = str(target_iso).strip().upper()
        if target_iso not in self.iso_to_idx or self.edges.empty:
            return []

        # Check if the requested column exists (Fallback to primaryValue if missing)
        use_col = weight_col if weight_col in self.edges.columns else 'primaryValue'

        # Filter relevant edges
        exports = self.edges[self.edges['src_iso'] == target_iso].copy()
        exports['partner'] = exports['tgt_iso']
        exports['direction'] = 'export'
        
        imports = self.edges[self.edges['tgt_iso'] == target_iso].copy()
        imports['partner'] = imports['src_iso']
        imports['direction'] = 'import'
        
        combined = pd.concat([exports, imports], ignore_index=True)
        if combined.empty: return []

        # Filter Noise
        combined = combined[combined[use_col] > 1e6]

        # Aggregate by the specific weight column (Risk or Money)
        partner_stats = combined.groupby('partner').agg(
            total_vol=(use_col, 'sum')
        ).reset_index()
        
        total_trade_vol = partner_stats['total_vol'].sum()
        if total_trade_vol <= 0: return []

        results = []
        for _, row in partner_stats.iterrows():
            partner = str(row['partner']).strip().upper()
            if partner == target_iso: continue
            
            # Find Dominant Sector
            trades = combined[combined['partner'] == partner]
            if trades.empty: continue
            top_trade = trades.sort_values(use_col, ascending=False).iloc[0]
            
            sector_label = top_trade.get('sector', 'Unknown')
            direction_label = "Buyer" if top_trade['direction'] == 'export' else "Supplier"
            
            share = row['total_vol'] / total_trade_vol
            
            results.append({
                "partner": partner,
                "raw_score": share * 100, # This is the percentage share
                "volume": row['total_vol'],
                "role_desc": f"{direction_label} ({sector_label})" 
            })

        results.sort(key=lambda x: x['raw_score'], reverse=True)
        return results

    def get_contributors(self, target_iso):
        """
        Calculates Fair Share Partners (Volume Weighted)
        Logic: Risk = (Partner Intensity) * (Trade Volume $)
        """
        target_iso = str(target_iso).strip().upper()
        if target_iso not in self.iso_to_idx:
            return []
            
        target_idx = self.iso_to_idx[target_iso]
        partners = []
        total_risk_mass = 0.0
        
        for (src_i, tgt_i), usd_volume in self.edge_volumes.items():
            if tgt_i == target_idx:
                src_iso = self.idx_to_iso[src_i]
                partner_row = self.nodes_df.iloc[src_i]
                intensity = float(partner_row.get('energy_intensity', 50.0))
                risk = intensity * usd_volume
                
                partners.append({
                    "partner": src_iso,
                    "volume": usd_volume,
                    "intensity": intensity,
                    "risk": risk
                })
                total_risk_mass += risk

        partners.sort(key=lambda x: x['risk'], reverse=True)
        
        final_list = []
        remaining_share = 40.0 
        
        for p in partners[:10]:
            if total_risk_mass > 0:
                rel_share = (p['risk'] / total_risk_mass) * remaining_share
            else:
                rel_share = 0
            
            role = "Producer"
            if p['partner'] in ['ARE', 'SGP', 'NLD', 'HKG', 'BEL']:
                role = "Middleman 🚩"
            
            final_list.append({
                "partner": p['partner'],
                "share": f"{rel_share:.2f}%",
                "score": round(p['volume'] / 1e9, 2),
                "role": role,
                "details": f"Vol: ${p['volume']/1e9:.1f}B | Int: {p['intensity']:.0f}"
            })
            
        return final_list

    def get_bilateral_trade(self, src_iso, tgt_iso):
        """
        Returns list of sectors and volumes from Src to Tgt
        Used by MARL engine to identify leverage points
        """
        src_iso = str(src_iso).strip().upper()
        tgt_iso = str(tgt_iso).strip().upper()
        
        if self.edges.empty:
            return []
        
        # Filter edges from src to tgt
        mask = (self.edges['src_iso'] == src_iso) & (self.edges['tgt_iso'] == tgt_iso)
        trades = self.edges[mask]
        
        if trades.empty:
            return []
        
        # Aggregate by sector
        summary = trades.groupby('sector')['primaryValue'].sum().reset_index()
        
        result = []
        for _, row in summary.iterrows():
            result.append({
                "sector": row['sector'],
                "value": float(row['primaryValue'])
            })
        
        return result

    def get_sector_volume(self, src_iso, tgt_iso, sector):
        """
        Get specific trade volume for a single sector
        Used to calculate precise economic damage
        """
        sector_data = self.get_bilateral_trade(src_iso, tgt_iso)
        
        for s in sector_data:
            # Case-insensitive partial match
            if sector.lower() in s['sector'].lower():
                return s['value']
        
        return 0.0
    
    def get_node(self, iso):
        """
        Get node details for a specific country
        Used to assign AI persona based on economic profile
        """
        iso = str(iso).strip().upper()
        
        if iso in self.iso_to_idx:
            idx = self.iso_to_idx[iso]
            return self.nodes_df.iloc[idx].to_dict()
        
        return {}

# --- SINGLETON & FACTORY ---
_data_engine_instance = None

def get_data_engine(data_dir=None):
    """Factory function to get or create the data engine singleton"""
    global _data_engine_instance
    if _data_engine_instance is None:
        _data_engine_instance = DataEngine(data_dir)
    return _data_engine_instance