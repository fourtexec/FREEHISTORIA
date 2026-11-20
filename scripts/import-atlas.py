"""Convert the Historical Basemaps geojson directory into the compact game atlas."""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = {}
for file in sorted(Path(sys.argv[1]).glob('world_*.geojson')):
    year = int(file.stem.removeprefix('world_').replace('bc', '-'))
    shapes = defaultdict(list)
    names = set()
    for feature in json.loads(file.read_text())['features']:
        geometry = feature['geometry']
        if not geometry:
            continue
        name = (feature['properties'].get('NAME') or '').strip()
        if name:
            names.add(name)
        polygons = geometry['coordinates']
        if geometry['type'] == 'Polygon':
            polygons = [polygons]
        for polygon in polygons:
            path = ''
            for ring in polygon:
                kept = [ring[0]]
                for point in ring[1:-1]:
                    if math.dist(point[:2], kept[-1][:2]) >= 0.42:
                        kept.append(point)
                if len(kept) < 3:
                    if len(ring) < 4:
                        continue
                    kept = [ring[0], ring[len(ring)//3], ring[2*len(ring)//3]]
                coords = ['%g,%g' % (round(x+180, 2), round(90-y, 2)) for x, y, *_ in kept]
                path += 'M' + ' '.join(coords) + 'Z'
            if path:
                shapes[name].append(path)
    (root / 'web/maps' / f'{year}.json').write_text(json.dumps(
        [[name, ''.join(paths)] for name, paths in shapes.items()], ensure_ascii=False, separators=(',', ':')))
    index[year] = sorted(names, key=str.casefold)
(root / 'shared' / 'catalog.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
