/* Geometry shared by the static map and the Node regression tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/d3.min.js'));
  else root.TrueWorldGeometry = factory(root.d3);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (d3) {
  const MAX_LAT = 84;
  function clampLat(lat) { return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)); }

  function mapGeometryCoords(geometry, fn) {
    const depths = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    const depth = depths[geometry.type];
    if (depth === undefined) throw new Error('Unsupported geometry type: ' + geometry.type);
    const walk = (coords, remaining) => remaining === 0 ? fn(coords) : coords.map(coord => walk(coord, remaining - 1));
    return { type: geometry.type, coordinates: walk(geometry.coordinates, depth) };
  }

  // Rotate on the sphere rather than scaling longitude by a centroid cosine.
  // A rigid rotation preserves every ground distance, angle, and spherical
  // polygon area, including large countries and antimeridian-crossing islands.
  function relocateGeometry(geometry, srcCentroid, dstCentroid) {
    const toOrigin = d3.geoRotation([-srcCentroid[0], -srcCentroid[1], 0]);
    const fromOrigin = d3.geoRotation([-dstCentroid[0], -dstCentroid[1], 0]).invert;
    return mapGeometryCoords(geometry, point => fromOrigin(toOrigin(point)));
  }

  function mercatorAreaInflation(lat) {
    const cosine = Math.cos(lat * Math.PI / 180);
    return 1 / (cosine * cosine);
  }
  return { clampLat, relocateGeometry, mercatorAreaInflation };
});
