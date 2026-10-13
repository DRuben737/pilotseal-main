# Sky Art geographic data and map runtime

Airport directory: https://github.com/datasets/airport-codes, derived from https://ourairports.com/data/. Public airport location metadata, used only to locate the artwork anchor; not navigation data or test fixtures. Snapshot fetched 2026-10-12. License: https://github.com/datasets/airport-codes/blob/main/datapackage.json (ODC PDDL).

MapLibre GL JS 6.14.0: https://github.com/maplibre/maplibre-gl-js, BSD-3-Clause. The separately served maplibre-worker.mjs is copied from the exact installed version; license retained in maplibre-LICENSE.txt.

Production default tiles: OpenStreetMap Standard, with attribution rendered on the map. NEXT_PUBLIC_SKY_ART_TILE_URL can select another provider. Local previews use bundled Natural Earth 1:50m land, lakes and boundary GeoJSON (public domain; https://www.naturalearthdata.com/about/terms-of-use/, https://github.com/nvkelso/natural-earth-vector). They do not contact external tile services; an explicitly local tile source may be configured for more detailed local imagery. Automated browser tests reject external connections.
