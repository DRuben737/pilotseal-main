"""Validate route GPX locally against GPX 1.1 and the exported waypoint sequence."""
import argparse
import json
from pathlib import Path
from lxml import etree

parser = argparse.ArgumentParser()
parser.add_argument('gpx', type=Path)
parser.add_argument('--expected', type=Path)
args = parser.parse_args()
xml_parser = etree.XMLParser(resolve_entities=False, no_network=True)
schema_path = Path(__file__).parent / 'fixtures' / 'gpx-1.1.xsd'
schema = etree.XMLSchema(etree.parse(str(schema_path), xml_parser))
document = etree.parse(str(args.gpx), xml_parser)
schema.assertValid(document)
ns = {'g': 'http://www.topografix.com/GPX/1/1'}
routes = document.findall('g:rte', ns)
if len(routes) != 1:
    raise ValueError('Export must contain exactly one ordered route.')
points = routes[0].findall('g:rtept', ns)
if len(points) < 2:
    raise ValueError('Route requires at least two points.')
if document.findall('g:trk', ns):
    raise ValueError('A planned route must not be exported as a recorded track.')
if args.expected:
    expected = json.loads(args.expected.read_text())
    waypoints = expected['waypoints']
    if len(points) != len(waypoints):
        raise ValueError('Waypoint count changed.')
    if routes[0].findtext('g:name', namespaces=ns) != expected['name']:
        raise ValueError('Route name did not round-trip through XML.')
    for index, (point, waypoint) in enumerate(zip(points, waypoints)):
        lon_error = abs((float(point.attrib['lon']) - waypoint['lon'] + 180) % 360 - 180)
        if abs(float(point.attrib['lat']) - waypoint['lat']) > 0.000000051 or lon_error > 0.000000051:
            raise ValueError(f'Coordinate precision changed at point {index}.')
        if point.findtext('g:name', namespaces=ns) != waypoint['id']:
            raise ValueError(f'Waypoint order/name changed at point {index}.')
print(f'GPX 1.1 validated: one route, {len(points)} ordered waypoints.')
