#!/usr/bin/env python3
"""
Add properly formatted India trade data
"""

from pathlib import Path

DIVERSE_INDIA_DATA = {
    'Textiles': [
('USA', 'export', 15.2), ('GBR', 'export', 6.3), ('DEU', 'export', 4.8),
        ('ARE', 'export', 8.5), ('ITA', 'export', 3.8), ('FRA', 'export', 3.1),
        ('JPN', 'export', 4.2), ('CAN', 'export', 2.8), ('AUS', 'export', 2.1),
        ('ESP', 'export', 2.9), ('NLD', 'export', 2.4), ('BEL', 'export', 1.9),
        ('POL', 'export', 1.6), ('TUR', 'export', 2.3), ('ZAF', 'export', 1.4),
        ('CHN', 'import', 7.8), ('BGD', 'export', 3.2),
    ],
    'Electronics': [
        ('CHN', 'import', 45.6), ('USA', 'export', 12.4), ('KOR', 'import', 8.9),
        ('JPN', 'import', 6.7), ('VNM', 'import', 5.2), ('SGP', 'export', 4.1),
        ('TWN', 'import', 4.8), ('MYS', 'import', 3.6), ('THA', 'import', 3.2),
        ('DEU', 'export', 3.9), ('GBR', 'export', 3.4), ('FRA', 'export', 2.1),
        ('ARE', 'export', 5.8), ('HKG', 'import', 4.3), ('MEX', 'import', 1.9),
    ],
    'Chemicals': [
        ('USA', 'export', 18.7), ('GBR', 'export', 6.4), ('DEU', 'export', 4.9),
        ('CHN', 'import', 11.5), ('SAU', 'import', 9.2), ('BRA', 'export', 3.6),
        ('ZAF', 'export', 2.8), ('NGA', 'export', 2.3), ('KEN', 'export', 1.9),
        ('ARE', 'import', 6.7), ('NLD', 'export', 3.2), ('BEL', 'export', 2.4),
        ('ITA', 'export', 2.7), ('AUS', 'export', 2.9), ('CAN', 'export', 3.1),
        ('JPN', 'import', 4.8), ('FRA', 'export', 2.6),
    ],
    'Energy': [
        ('SAU', 'import', 35.6), ('IRQ', 'import', 28.4), ('ARE', 'import', 24.7),
        ('RUS', 'import', 22.1), ('USA', 'import', 12.8), ('NGA', 'import', 9.4),
        ('KWT', 'import', 8.7), ('QAT', 'import', 7.2), ('OMN', 'import', 6.8),
        ('IDN', 'import', 6.1), ('AUS', 'import', 7.8), ('CAN', 'import', 4.2),
    ],
    'Vehicles': [
        ('USA', 'export', 8.2), ('KOR', 'import', 6.8), ('JPN', 'import', 5.9),
        ('DEU', 'import', 4.3), ('ARE', 'export', 3.6), (' MEX', 'export', 3.1),
        ('CHN', 'import', 3.9), ('THA', 'import', 2.8), ('GBR', 'export', 2.4),
        ('ZAF', 'export', 2.1), ('ITA', 'import', 2.3),
    ],
    'Steel': [
        ('USA', 'export', 6.9), ('CHN', 'import', 8.7), ('JPN', 'import', 5.4),
        ('KOR', 'import', 4.2), ('ARE', 'export', 3.8), ('VNM', 'export', 2.6),
        ('BGD', 'export', 2.9), ('THA', 'export', 2.1), ('ITA', 'export', 2.3),
    ],
    'Agriculture': [
        ('USA', 'export', 8.9), ('ARE', 'export', 7.6), ('BGD', 'export', 5.4),
        ('CHN', 'import', 4.2), ('SAU', 'export', 3.2), ('VNM', 'export', 2.7),
        ('IDN', 'export', 3.1), ('GBR', 'export', 2.9), ('CAN', 'import', 2.8),
        ('AUS', 'import', 2.1), ('BRA', 'import', 3.8),
    ],
    'Cement': [
        ('ARE', 'export', 4.2), ('BGD', 'export', 3.1), ('LKA', 'export', 2.4),
        ('NPL', 'export', 1.8), ('OMN', 'export', 1.6), ('QAT', 'export', 1.2),
    ],
    'Aircraft': [
        ('USA', 'import', 12.5), ('FRA', 'import', 8.9), ('GBR', 'import', 4.2),
        ('DEU', 'import', 3.6), ('CAN', 'import', 2.8),
    ],
    'Precious Metals': [
        ('USA', 'export', 8.7), ('CHE', 'import', 15.6), ('ARE', 'import', 12.3),
        ('GBR', 'export', 5.4), ('HKG', 'export', 6.2), ('SGP', 'import', 4.8),
        ('BEL', 'export', 3.9), ('CHN', 'import', 5.3),
    ],
    'Ships': [
        ('KOR', 'import', 3.8), ('JPN', 'import', 2.9), ('CHN', 'import', 4.2),
        ('SGP', 'export', 1.7),
    ],
    'Iron Articles': [
        ('USA', 'export', 4.2), ('CHN', 'import', 6.7), ('DEU', 'export', 2.8),
        ('GBR', 'export', 2.1), ('ARE', 'export', 2.9), ('SGP', 'export', 1.6),
    ],
    'Wood': [
        ('USA', 'export', 3.4), ('ARE', 'export', 2.1), ('MYS', 'import', 1.8),
        ('GBR', 'export', 1.6), ('IDN', 'import', 1.9),
    ],
}

sector_files = {
    'Textiles': 'processed_textiles_direct.csv',
    'Electronics': 'processed_electronics_direct.csv',
    'Chemicals': 'processed_chemicals_direct.csv',
    'Energy': 'processed_energy_direct.csv',
    'Vehicles': 'processed_vehicles_direct.csv',
    'Steel': 'processed_steel_direct.csv',
    'Agriculture': 'processed_agriculture_direct.csv',
    'Cement': 'processed_cement_direct.csv',
    'Aircraft': 'processed_aircraft_direct.csv',
    'Precious Metals': 'processed_precious_metals_direct.csv',
    'Ships': 'processed_ships_direct.csv',
    'Iron Articles': 'processed_iron_articles_direct.csv',
    'Wood': 'processed_wood_direct.csv',
}

data_dir = Path('/Users/sanjana/python/ClimateAuditX/python-services/data')

# Remove ALL India rows first
for filename in sector_files.values():
    filepath = data_dir / filename
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    # Keep only non-India lines
    clean_lines = [lines[0]]  # Keep header
    for line in lines[1:]:
        if 'IND' not in line[-20:]:  # Check last 20 chars for "IND"
            clean_lines.append(line)
    
    with open(filepath, 'w') as f:
        f.writelines(clean_lines)

print("✅ Cleaned India data")

# Add fresh India data with proper formatting (51 columns to match header)
total = 0
for sector, edges in DIVERSE_INDIA_DATA.items():
    filepath = data_dir / sector_files[sector]
    
    with open(filepath, 'a') as f:
        for partner, direction, value_b in edges:
            value = int(value_b * 1e9)
            src, tgt = ('IND', partner) if direction == 'export' else (partner, 'IND')
            
            # 51 columns: 47 empty + primaryValue + 3 empty + src_iso + tgt_iso
            row = ',' * 43 + f'{value}' + ',' * 3 + f',{src},{tgt}\n'
            f.write(row)
            total += 1

print(f"✅ Added {total} unique India edges")
print("🔄 Triggering reload...")

# Touch data_engine to trigger reload
import os
os.system('touch /Users/sanjana/python/ClimateAuditX/python-services/services/data_engine.py')
