# python-services/services/data_engine.py
import pandas as pd
import os
from pathlib import Path

class DataEngine:
    def __init__(self, data_dir=None):
        """
        Initialize the Data Engine with nodes and edges data.
        Applies real-world data cleaning and normalization.
        """
        if data_dir is None:
            # Default to data directory relative to this file
            base_dir = Path(__file__).resolve().parents[1]
            data_dir = base_dir / "data"
        
        self.data_dir = Path(data_dir)
        
        # Load nodes
        nodes_path = self.data_dir / "nodes_final.csv"
        if not nodes_path.exists():
            nodes_path = self.data_dir / "nodes_final_physics.csv"
        
        if nodes_path.exists():
            self.nodes_df = pd.read_csv(nodes_path)
            # Clean ISO codes
            self.nodes_df['iso3'] = self.nodes_df['iso3'].astype(str).str.strip().str.upper()
            self.iso_to_idx = {iso: i for i, iso in enumerate(self.nodes_df['iso3']) if pd.notna(iso) and iso != 'NAN'}
        else:
            self.nodes_df = pd.DataFrame()
            self.iso_to_idx = {}
            print("⚠️ Warning: Nodes file not found. DataEngine will have limited functionality.")
        
        # Load Edges (We use Steel as the primary proxy, but can merge all sectors)
        # In production, load all 3 (Steel, Energy, Textile) and merge them
        self.edges = pd.DataFrame()
        edge_files = [
            self.data_dir / "processed_steel_direct.csv",
            self.data_dir / "processed_energy_direct.csv",
            self.data_dir / "processed_textiles_direct.csv",
        ]
        
        for edge_file in edge_files:
            if edge_file.exists():
                try:
                    edges_df = pd.read_csv(edge_file, on_bad_lines="skip", nrows=100000)
                    edges_df.columns = [str(c).strip() for c in edges_df.columns]
                    
                    # Check for src_iso/tgt_iso columns
                    if 'src_iso' in edges_df.columns and 'tgt_iso' in edges_df.columns:
                        if self.edges.empty:
                            self.edges = edges_df[['src_iso', 'tgt_iso', 'primaryValue']].copy()
                        else:
                            # Merge with existing edges (sum values for duplicate pairs)
                            new_edges = edges_df[['src_iso', 'tgt_iso', 'primaryValue']].copy()
                            combined = pd.concat([self.edges, new_edges])
                            self.edges = combined.groupby(['src_iso', 'tgt_iso'])['primaryValue'].sum().reset_index()
                        print(f"✅ Loaded edges from {edge_file.name}")
                except Exception as e:
                    print(f"⚠️ Error loading {edge_file.name}: {e}")
        
        if self.edges.empty:
            print("⚠️ Warning: Edge Data not found. Features will be limited.")
        else:
            # Clean ISO codes in edges
            self.edges['src_iso'] = self.edges['src_iso'].astype(str).str.strip().str.upper()
            self.edges['tgt_iso'] = self.edges['tgt_iso'].astype(str).str.strip().str.upper()
            # Ensure primaryValue is numeric
            self.edges['primaryValue'] = pd.to_numeric(self.edges['primaryValue'], errors='coerce').fillna(0)
            print(f"✅ DataEngine initialized with {len(self.edges)} edges")

    def get_clean_contributors(self, target_iso):
        """
        Returns the REAL top partners for a country, applying 3 Fixes:
        1. Mirroring (Look at what others sent TO target)
        2. Thresholding (Ignore tiny economies and small trades)
        3. Normalization (Don't let one huge commodity skew everything)
        
        Args:
            target_iso: ISO3 code of the target country (e.g., "IND", "CHN")
            
        Returns:
            List of contributor dictionaries with partner, score, share, role
        """
        target_iso = str(target_iso).strip().upper()
        
        if target_iso not in self.iso_to_idx:
            return []
        
        if self.edges.empty:
            return []
        
        # --- FIX 1: THE MIRROR LOGIC ---
        # Find rows where target is the DESTINATION (Imports)
        # This finds countries that exported TO the target country
        incoming_trade = self.edges[self.edges['tgt_iso'] == target_iso].copy()
        
        if incoming_trade.empty:
            # No imports found - country might be isolated or data incomplete
            return []
        
        # --- FIX 2: THE BHUTAN/NOISE FILTER ---
        # Filter 1: Trade must be > $1 Million (removes noise)
        incoming_trade = incoming_trade[incoming_trade['primaryValue'] > 1e6]
        
        if incoming_trade.empty:
            return []
        
        # Filter 2: Partner GDP must be > $5 Billion (Removes tiny islands/Bhutan)
        valid_partners = []
        results = []
        
        # Calculate total volume for normalization
        total_volume = incoming_trade['primaryValue'].sum()
        if total_volume <= 0:
            return []
        
        for _, row in incoming_trade.iterrows():
            partner_iso = str(row['src_iso']).strip().upper()
            
            # Skip if partner is the same as target
            if partner_iso == target_iso:
                continue
            
            # Lookup Partner GDP
            if partner_iso in self.iso_to_idx:
                p_idx = self.iso_to_idx[partner_iso]
                p_row = self.nodes_df.iloc[p_idx]
                p_gdp = float(p_row.get('gdp', 0)) if pd.notna(p_row.get('gdp', 0)) else 0
                
                # The "Bhutan Filter" - Skip tiny economies
                if p_gdp < 5e9: 
                    continue
                
                # Get partner energy intensity for carbon risk calculation
                p_intensity = float(p_row.get('energy_intensity', 50)) if pd.notna(p_row.get('energy_intensity', 50)) else 50
                
                # --- FIX 3: NORMALIZED SCORING ---
                # We blend Trade Volume (70%) with Carbon Intensity Risk (30%)
                # This prevents a clean but high-volume partner from looking too "dirty"
                # and prevents dirty but low-volume partners from being ignored
                
                trade_share = row['primaryValue'] / total_volume
                
                # Heuristic Score: Blend volume with carbon intensity
                # Higher intensity = higher carbon risk per dollar
                # Formula: (Volume Weight * Trade Share) + (Carbon Weight * Intensity Factor)
                volume_weight = 0.7
                carbon_weight = 0.3
                
                # Normalize intensity to 0-1 scale (assuming max intensity ~150)
                intensity_factor = min(p_intensity / 150.0, 1.0)
                
                # Combined impact score
                impact_score = (volume_weight * trade_share) + (carbon_weight * intensity_factor)
                
                results.append({
                    "partner": partner_iso,
                    "raw_score": impact_score,
                    "volume": float(row['primaryValue']),
                    "trade_share": trade_share,
                    "intensity": p_intensity
                })
        
        if not results:
            return []
        
        # Sort by Impact Score (Real Carbon Risk) not just Dollars
        results.sort(key=lambda x: x['raw_score'], reverse=True)
        
        # Normalize to percentages for the UI
        final_total = sum(r['raw_score'] for r in results)
        if final_total <= 0:
            return []
        
        formatted_contributors = []
        for r in results[:10]:  # Top 10 Only
            share_pct = (r['raw_score'] / final_total) * 100
            
            # Auto-Detect Role (Simplified)
            role = "Producer"
            if r['partner'] in ['SGP', 'ARE', 'NLD', 'HKG', 'BDI']:
                role = "Middleman 🚩"
            
            formatted_contributors.append({
                "partner": r['partner'],
                "score": round(r['raw_score'], 4),
                "share": f"{share_pct:.1f}%",
                "role": role,
                "volume": r['volume'],
                "intensity": r['intensity']
            })
        
        return formatted_contributors

# Initialize once (will be imported by main.py)
data_engine = None

def get_data_engine(data_dir=None):
    """Factory function to get or create the data engine singleton"""
    global data_engine
    if data_engine is None:
        data_engine = DataEngine(data_dir)
    return data_engine
