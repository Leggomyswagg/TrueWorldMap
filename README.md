# True World Map

An interactive world map that reveals how the **Mercator projection** distorts
the true size of countries. Drag any country across the map and watch its
on-screen size change while its real ground size stays constant — the classic
"Greenland isn't actually the size of Africa" demonstration.

![True World Map](https://img.shields.io/badge/projection-mercator-5b8cff)

## Features

- 🗺️ World countries rendered on a live Mercator projection (D3 + TopoJSON)
- ✋ **Drag any country** to slide it across latitudes; it keeps its true ground
  size, so it visibly grows toward the poles and shrinks toward the equator
- 🔎 Search for a country to drop a draggable copy at the map center
- 📐 Live readout of the Mercator size inflation at the current latitude
- 🌐 Toggleable graticule (grid lines), reset, fully responsive

Double-click a dragged country to remove it; **Reset all** clears everything.

## How it works

Each country's vertices are rotated together on the sphere, moving its centroid
to the drop location. This rigid rotation preserves ground distances and
spherical area, even for large countries and shapes crossing the antimeridian.
D3 clips the rotated geometry at the map seam before drawing it. The Mercator
canvas still stretches its visible size: local area inflation is
`1 / cos(latitude)^2` (4× at 60°). Latitude of the drag anchor is limited to ±84°
to keep controls usable near the poles.

Draggable copies retain their geographic positions when the window is resized.
Search results work with keyboard focus and Enter; clearing the search also
clears its selection.

## Run locally

It's a static site — no build step. Serve the folder with any static server:

```bash
npm run dev        # python3 -m http.server 5173
# then open http://localhost:5173
```

Run geometry and area-preservation regression tests with `npm test` (Node 18+;
no package installation needed). The tests use the bundled country data.

## Deploy to Vercel

The repo is a zero-config static site. Import it into Vercel (or run
`vercel`) and it deploys as-is — see `vercel.json` for caching/clean-URL config.

## Data

Country geometry is bundled at `data/countries-110m.json`
([world-atlas](https://github.com/topojson/world-atlas), 1:110m), so there is no
runtime dependency on an external data CDN.

## License

MIT
