"""Compile a locally supplied public airport CSV, verifying its coordinate schema."""
import argparse
import csv
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--metadata', required=True, type=Path)
parser.add_argument('--output', default='public/sky-art/airports.json', type=Path)
args = parser.parse_args()
metadata = json.loads(args.metadata.read_text())
fields = [f for r in metadata['resources'] for f in r['schema']['fields'] if f['name'] == 'coordinates']
description = ' '.join(f.get('description', '') for f in fields).lower()
if 'latitude, longitude' in description:
    latitude_first = True
elif 'longitude, latitude' in description:
    latitude_first = False
else:
    raise SystemExit('Coordinate order is not verified by the source metadata.')
rows = []
with args.input.open(newline='') as stream:
    for row in csv.DictReader(stream):
        if row['type'] not in ('small_airport', 'medium_airport', 'large_airport'):
            continue
        first, second = map(float, row['coordinates'].split(','))
        lat, lon = (first, second) if latitude_first else (second, first)
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise SystemExit(f"Invalid coordinates for {row['ident']}")
        rows.append([row['ident'], row['iata_code'], row['name'], lat, lon, row['municipality']])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
print(f'Compiled {len(rows)} airports with metadata-verified latitude/longitude order.')
