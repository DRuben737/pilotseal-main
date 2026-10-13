"""Synthetic fixture tests for the offline airport coordinate compiler."""
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

class AirportCompilerTests(unittest.TestCase):
    def compile(self, description, coordinates):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source, metadata, output = base / 'airports.csv', base / 'metadata.json', base / 'output.json'
            with source.open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['ident', 'iata_code', 'name', 'type', 'coordinates', 'municipality'])
                writer.writeheader()
                writer.writerow(dict(ident='X001', iata_code='XXA', name='Synthetic Airport', type='small_airport', coordinates=coordinates, municipality='Test Town'))
            metadata.write_text(json.dumps({'resources': [{'schema': {'fields': [{'name': 'coordinates', 'description': description}]}}]}))
            result = subprocess.run([sys.executable, 'scripts/build-sky-art-airports.py', '--input', str(source), '--metadata', str(metadata), '--output', str(output)], capture_output=True, text=True)
            return result, json.loads(output.read_text()) if output.exists() else None
    def test_latitude_first(self):
        result, data = self.compile('latitude, longitude', '40, -75')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(data[0][3:5], [40, -75])
    def test_longitude_first(self):
        result, data = self.compile('longitude, latitude', '-75, 40')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(data[0][3:5], [40, -75])
    def test_unknown_schema_fails_closed(self):
        result, data = self.compile('two coordinates', '40, -75')
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(data)
    def test_invalid_coordinates(self):
        result, data = self.compile('latitude, longitude', '120, -75')
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(data)

if __name__ == '__main__':
    unittest.main()
