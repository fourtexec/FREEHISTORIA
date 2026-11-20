"""Import the pinned Cliopatria GeoJSON zip. Run from the project root."""
import json
from shape_path import outline
import sys
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
index = []
chunks = {}
with ZipFile(sys.argv[1]) as archive, archive.open(next(p for p in archive.namelist() if p.endswith('.geojson'))) as stream:
    for line in stream:
        if not line.lstrip().startswith(b'{ "type": "Feature",'):
            continue
        feature = json.loads(line.strip().rstrip(b','))
        p = feature['properties']
        # Group by entity: a year's map reads only shards containing active polities.
        block = len(index)//360
        chunk = chunks.setdefault(block, [])
        index.append([p['Name'],p['FromYear'],p['ToYear'],p.get('Wikidata') or '',p.get('MemberOf') or '',
                      p.get('Components') or '',p.get('Wikipedia') or '',round(p.get('Area') or 0),block,len(chunk)])
        chunk.append(outline(feature['geometry']))
if not index:
    raise ValueError('No features imported')
def save(file, data):
    file.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
save(root/'shared/periods.json',index)
for block, paths in chunks.items():
    save(root/'web/history'/f'{block}.json',paths)
print(len(index),'records',len(set(r[0] for r in index)),'entities',min(r[1] for r in index),max(r[2] for r in index))
for year in [-52,1453,1804]:
    print(year,[(r[0],r[3:6]) for r in index if r[1]<=year<=r[2] and any(x in r[0].lower() for x in ('roman','franc','ottoman','portug','napol'))][:15])
