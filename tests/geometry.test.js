const { test } = require('node:test');
const assert = require('node:assert/strict');
const d3 = require('../vendor/d3.min.js');
const topojson = require('../vendor/topojson-client.min.js');
const world = require('../data/countries-110m.json');
const { relocateGeometry, clampLat, mercatorAreaInflation } = require('../geometry');
const countries = topojson.feature(world, world.objects.countries).features.filter(feature => feature.properties.name !== 'Antarctica');

test('all countries preserve their true spherical area at equatorial, polar, and seam destinations', () => {
  for (const feature of countries) {
    const source = d3.geoCentroid(feature);
    const area = d3.geoArea(feature);
    for (const target of [[0, 0], [0, 60], [179, 84], [-179, -80]]) {
      const moved = { type: 'Feature', geometry: relocateGeometry(feature.geometry, source, target) };
      const delta = Math.abs(d3.geoArea(moved) - area);
      assert.ok(delta < 1e-10, `${feature.properties.name}: area changed by ${delta}`);
      assert.ok(d3.geoDistance(d3.geoCentroid(moved), target) < 1e-8, `${feature.properties.name}: centroid moved incorrectly`);
    }
  }
});
test('rotation keeps ground distances and never mutates source geometry', () => {
  const geometry = { type: 'LineString', coordinates: [[170, 50], [-170, 60], [179, 70]] };
  const before = JSON.stringify(geometry);
  const moved = relocateGeometry(geometry, [180, 60], [0, -30]);
  assert.equal(JSON.stringify(geometry), before);
  for (let i = 1; i < 3; i++) {
    assert.ok(Math.abs(d3.geoDistance(geometry.coordinates[0], geometry.coordinates[i]) - d3.geoDistance(moved.coordinates[0], moved.coordinates[i])) < 1e-12);
  }
});
test('antimeridian and polar geometries render finite clipped paths', () => {
  const path = d3.geoPath(d3.geoMercator().scale(100));
  for (const name of ['Russia', 'Fiji', 'Greenland', 'Canada']) {
    const feature = countries.find(feature => feature.properties.name === name);
    for (const target of [[179, 30], [0, 84]]) {
      const geometry = relocateGeometry(feature.geometry, d3.geoCentroid(feature), target);
      const rendered = path({ type: 'Feature', geometry });
      assert.ok(rendered && !/NaN|Infinity/.test(rendered), name);
    }
  }
});
test('readout uses Mercator area scaling and anchors stay within latitude bounds', () => {
  assert.equal(mercatorAreaInflation(0), 1);
  assert.ok(Math.abs(mercatorAreaInflation(60) - 4) < 1e-12);
  assert.equal(clampLat(90), 84);
  assert.equal(clampLat(-90), -84);
  assert.equal(clampLat(30), 30);
});
