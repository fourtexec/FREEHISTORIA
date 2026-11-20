"""Build the 2025 and 2026 atlas. Pass a cache directory for pinned source files."""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.request import urlopen

from shape_path import outline

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(sys.argv[1])
CACHE.mkdir(parents=True, exist_ok=True)
GEOMETRY = {
    2025: ('datasets/geo-countries', 'b0b7794e15e7ec4374bf183dd73cce5b92e1c0ae', 'data/countries.geojson', '2025-04-10', 'Natural Earth / geo-countries'),
    2026: ('skudnfroodie/country-boundary-map', 'd9d36d105057bdf5dbf2a3e21cd417aa53cda9f9', 'release/country_polygons_reality.geojson', '2026-07-23', 'Country Boundary Map · Reality'),
}
DIRECTORIES = {
    2025: ('2f33b1b1ddcdb426da9953371f25e7b162c8366d', '2025-12-21'),
    2026: ('131ba72c0d81565354a755e0d900053259bc250e', '2026-11-19'),
}
def read(repo, revision, path):
    url = f'https://raw.githubusercontent.com/{repo}/{revision}/{path}'
    local = CACHE / (revision+'-'+Path(path).name)
    if not local.exists():
        with urlopen(url, timeout=120) as response:
            data = response.read()
        json.loads(data)  # Only cache complete downloads.
        local.write_bytes(data)
    return json.loads(local.read_bytes())

def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')

def import_year(year):
    repo, revision, filename, map_date, label = GEOMETRY[year]
    features = read(repo, revision, filename)['features']
    directory_revision, directory_date = DIRECTORIES[year]
    directory_repo = 'dr5hn/countries-states-cities-database'
    countries = read(directory_repo, directory_revision, 'json/countries.json')
    subdivisions = read(directory_repo, directory_revision, 'json/states.json')
    by_iso = {c['iso3']: c for c in countries}
    by_name = {c['name']: c for c in countries}
    regions = defaultdict(list)
    for r in subdivisions:
        regions[r['country_id']].append((r.get('translations') or {}).get('ru') or r['name'])
    iso_counts = Counter(f['properties'].get('iso_a3') for f in features if f['properties'].get('feature_role')=='countable')
    records, shapes = {}, []
    for feature in features:
        p = feature['properties']
        path = outline(feature['geometry'])
        if not path:
            raise ValueError('Empty country outline')
        if p.get('feature_role')=='render_only':
            shapes.append(['', path])
            continue
        name = p.get('name_en') or p['name']
        code = p.get('iso_a3') or p.get('ISO3166-1-Alpha-3')
        country = by_iso.get(code) if iso_counts[code] <= 1 else None
        country = country or by_name.get(name) or {}
        nation = country.get('name', name)
        if nation in records:
            raise ValueError('Duplicate entity: '+nation)
        records[nation] = dict(nation=nation, qid=country.get('wikiDataId') or '', parent=p.get('administering_state_name') or '',
                               area=country.get('area_sq_km'), capital=country.get('capital'), currency=country.get('currency'),
                               regions=sorted(set(regions.get(country.get('id'), []))))
        shapes.append([nation, path])
    save(ROOT/'web/maps'/f'{year}.json', shapes)
    print(year, len(records), 'mapped entities;', sum(len(r['regions']) for r in records.values()), 'regional names')
    return dict(mapLabel=label,mapDate=map_date,directoryDate=directory_date,
                geometryUrl=f'https://github.com/{repo}/tree/{revision}',directoryUrl=f'https://github.com/{directory_repo}/tree/{directory_revision}',
                records=sorted(records.values(),key=lambda r:r['nation']))
save(ROOT/'shared/modern.json',{year:import_year(year) for year in GEOMETRY})
