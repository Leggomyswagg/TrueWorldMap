/* True World Map
 * ----------------------------------------------------------------------------
 * Renders world countries on a Mercator projection. Any country can be dragged
 * across the map; as it moves toward the poles or the equator its on-screen size
 * changes, while its TRUE ground size stays constant. This reveals how Mercator
 * exaggerates landmasses far from the equator (Greenland, Russia, Canada...).
 */

const DATA_URL = "./data/countries-110m.json";
const DEG = Math.PI / 180;

const svg = d3.select("#map");
const mapEl = document.getElementById("map");
const readoutEl = document.getElementById("readout");
const searchInput = document.getElementById("country-search");
const resultsEl = document.getElementById("search-results");
const resetBtn = document.getElementById("reset-btn");
const graticuleToggle = document.getElementById("graticule-toggle");

let width = 0;
let height = 0;
let projection;
let path;
let countriesFeatures = [];

const gBase = svg.append("g").attr("class", "base-layer");
const gGrid = gBase.append("g").attr("class", "grid-layer");
const gCountries = gBase.append("g").attr("class", "country-layer");
const gGhosts = svg.append("g").attr("class", "ghost-layer");

const graticule = d3.geoGraticule10();

/* --- Geometry helpers ----------------------------------------------------- */

// Spherical centroid of a feature, in [lng, lat] degrees.
function featureCentroid(feature) {
  return d3.geoCentroid(feature);
}

// Translate a feature so its centroid lands on [targetLng, targetLat] while
// preserving true ground size. We express every vertex as a metric offset from
// the source centroid (latitude in degrees, longitude scaled by cos(lat) so a
// degree of longitude shrinks toward the poles), then re-apply that offset at
// the destination latitude. This is the same approximation thetruesize.com uses.
function relocateGeometry(geometry, srcCentroid, dstCentroid) {
  const [srcLng, srcLat] = srcCentroid;
  const [dstLng, dstLat] = dstCentroid;
  const srcCos = Math.max(Math.cos(srcLat * DEG), 1e-6);
  const dstCos = Math.max(Math.cos(dstLat * DEG), 1e-6);

  const mapPoint = ([lng, lat]) => {
    const dLat = lat - srcLat;
    const dLng = (lng - srcLng) * srcCos; // ground-distance preserving
    const newLat = clampLat(dstLat + dLat);
    const newLng = dstLng + dLng / dstCos;
    return [newLng, newLat];
  };

  return mapGeometryCoords(geometry, mapPoint);
}

function clampLat(lat) {
  return Math.max(-89.9, Math.min(89.9, lat));
}

// Recursively map every coordinate pair in a GeoJSON geometry.
function mapGeometryCoords(geometry, fn) {
  const walk = (coords, depth) =>
    depth === 0 ? fn(coords) : coords.map((c) => walk(c, depth - 1));

  const depthFor = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  };

  const depth = depthFor[geometry.type];
  return {
    type: geometry.type,
    coordinates: walk(geometry.coordinates, depth),
  };
}

/* --- Projection / sizing -------------------------------------------------- */

function setupProjection() {
  const rect = mapEl.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Mercator clipped to a comfortable latitude range; scaled to fill width.
  projection = d3
    .geoMercator()
    .scale(width / (2 * Math.PI))
    .center([0, 30])
    .translate([width / 2, height / 2]);

  path = d3.geoPath(projection);
}

/* --- Rendering ------------------------------------------------------------ */

function renderBase() {
  gGrid.selectAll("path.graticule").remove();
  gGrid
    .append("path")
    .attr("class", "graticule")
    .datum(graticule)
    .attr("d", path);

  const sel = gCountries.selectAll("path.country").data(countriesFeatures, (d) => d.id);
  sel.exit().remove();
  sel
    .enter()
    .append("path")
    .attr("class", "country")
    .attr("d", path)
    .each(function (d) {
      d3.select(this).append("title").text(d.properties.name);
    })
    .merge(sel)
    .attr("d", path);

  attachCountryDrag();
  applyGraticuleVisibility();
}

function applyGraticuleVisibility() {
  gGrid.attr("display", graticuleToggle.checked ? null : "none");
}

/* --- Dragging a clone (the "ghost") --------------------------------------- */

// State of an active drag: the feature being moved + a live ghost geometry.
function makeGhost(feature, startCentroid) {
  const node = gGhosts
    .append("path")
    .datum({ feature, geometry: feature.geometry, centroid: startCentroid })
    .attr("class", "ghost")
    .attr("d", path(feature.geometry));
  return node;
}

function updateReadout(name, dstLat) {
  // On-screen area scale relative to the country's home latitude is dominated
  // by sec(lat). Report how inflated the country LOOKS at this latitude.
  const inflate = 1 / Math.max(Math.cos(dstLat * DEG), 1e-6);
  readoutEl.hidden = false;
  readoutEl.querySelector(".readout-name").textContent = name;
  readoutEl.querySelector(".readout-scale").textContent =
    `Mercator inflation here: ~${inflate.toFixed(1)}×`;
}

function hideReadout() {
  readoutEl.hidden = true;
}

let activeGhost = null;

function beginGhostDrag(feature) {
  const srcCentroid = featureCentroid(feature);
  const node = makeGhost(feature, srcCentroid);
  node.classed("flash", true);
  setTimeout(() => node.classed("flash", false), 220);
  attachGhostDrag(node, feature, srcCentroid);
  return node;
}

function attachGhostDrag(node, feature, srcCentroid) {
  const drag = d3
    .drag()
    .on("start", function () {
      d3.select(this).raise().classed("dragging", true);
      mapEl.classList.add("dragging");
    })
    .on("drag", function (event) {
      const dst = projection.invert([event.x, event.y]);
      if (!dst || isNaN(dst[0])) return;
      const dstCentroid = [dst[0], clampLat(dst[1])];
      const moved = relocateGeometry(feature.geometry, srcCentroid, dstCentroid);
      d3.select(this).attr("d", path(moved)).datum({ feature, geometry: moved, centroid: dstCentroid });
      updateReadout(feature.properties.name, dstCentroid[1]);
    })
    .on("end", function () {
      d3.select(this).classed("dragging", false);
      mapEl.classList.remove("dragging");
    });

  node.call(drag);
  // Double-click a ghost to remove it.
  node.on("dblclick", function () {
    d3.select(this).remove();
    hideReadout();
  });
}

// Dragging a base-map country spawns a ghost and immediately drags it.
function attachCountryDrag() {
  const drag = d3
    .drag()
    .on("start", function (event, d) {
      const ghost = beginGhostDrag(d);
      activeGhost = { node: ghost, feature: d, srcCentroid: featureCentroid(d) };
      mapEl.classList.add("dragging");
    })
    .on("drag", function (event) {
      if (!activeGhost) return;
      const dst = projection.invert([event.x, event.y]);
      if (!dst || isNaN(dst[0])) return;
      const dstCentroid = [dst[0], clampLat(dst[1])];
      const moved = relocateGeometry(
        activeGhost.feature.geometry,
        activeGhost.srcCentroid,
        dstCentroid
      );
      activeGhost.node
        .attr("d", path(moved))
        .datum({ feature: activeGhost.feature, geometry: moved, centroid: dstCentroid });
      updateReadout(activeGhost.feature.properties.name, dstCentroid[1]);
    })
    .on("end", function () {
      mapEl.classList.remove("dragging");
      activeGhost = null;
    });

  gCountries.selectAll("path.country").call(drag);
}

/* --- Search --------------------------------------------------------------- */

function buildSearch() {
  let current = [];

  const render = (list) => {
    resultsEl.innerHTML = "";
    list.slice(0, 8).forEach((feature) => {
      const li = document.createElement("li");
      li.textContent = feature.properties.name;
      li.addEventListener("click", () => {
        spawnGhostAtCenter(feature);
        searchInput.value = "";
        resultsEl.innerHTML = "";
      });
      resultsEl.appendChild(li);
    });
  };

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = "";
      return;
    }
    current = countriesFeatures
      .filter((f) => f.properties.name.toLowerCase().includes(q))
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name));
    render(current);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && current.length) {
      spawnGhostAtCenter(current[0]);
      searchInput.value = "";
      resultsEl.innerHTML = "";
    }
  });
}

// Drop a draggable ghost at the map center so it can be compared anywhere.
function spawnGhostAtCenter(feature) {
  const srcCentroid = featureCentroid(feature);
  const center = projection.invert([width / 2, height / 2]);
  const dstCentroid = [center[0], clampLat(center[1])];
  const moved = relocateGeometry(feature.geometry, srcCentroid, dstCentroid);
  const node = gGhosts
    .append("path")
    .datum({ feature, geometry: moved, centroid: dstCentroid })
    .attr("class", "ghost flash")
    .attr("d", path(moved));
  setTimeout(() => node.classed("flash", false), 220);
  attachGhostDrag(node, feature, srcCentroid);
  updateReadout(feature.properties.name, dstCentroid[1]);
}

/* --- Wiring --------------------------------------------------------------- */

resetBtn.addEventListener("click", () => {
  gGhosts.selectAll("*").remove();
  hideReadout();
});

graticuleToggle.addEventListener("change", applyGraticuleVisibility);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    gGhosts.selectAll("*").remove();
    hideReadout();
    setupProjection();
    renderBase();
  }, 150);
});

/* --- Boot ----------------------------------------------------------------- */

async function init() {
  try {
    const topo = await d3.json(DATA_URL);
    const geo = topojson.feature(topo, topo.objects.countries);
    countriesFeatures = geo.features
      .filter((f) => f.properties && f.properties.name && f.properties.name !== "Antarctica")
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

    setupProjection();
    renderBase();
    buildSearch();
  } catch (err) {
    console.error("Failed to load map data:", err);
    const msg = svg
      .append("text")
      .attr("x", 24)
      .attr("y", 40)
      .attr("fill", "#ffd166")
      .attr("font-size", "16px")
      .text("Could not load map data. Check ./data/countries-110m.json");
  }
}

init();
