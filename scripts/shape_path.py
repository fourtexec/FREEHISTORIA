"""Encode GeoJSON polygons in the atlas canvas coordinate system."""
import math


def outline(geometry):
    if not geometry:
        return ''
    polygons = geometry['coordinates']
    if geometry['type'] == 'Polygon':
        polygons = [polygons]
    if geometry['type'] not in ('Polygon', 'MultiPolygon'):
        return ''
    path = []
    for polygon in polygons:
        for ring in polygon:
            kept = [ring[0]]
            for point in ring[1:-1]:
                if math.dist(point[:2], kept[-1][:2]) >= 0.24:
                    kept.append(point)
            if len(kept) < 3:
                kept = [ring[0], ring[len(ring)//3], ring[2*len(ring)//3]]
            path.append('M'+' '.join('%g,%g' % (round(x+180,2),round(90-y,2)) for x,y,*_ in kept)+'Z')
    return ''.join(path)
