# Sky Art implementation

Entry: `/tools/sky-art`. Compose on an SVG canvas, project a continuous track to a map, inspect/export the nav log. No account or database schema required. IndexedDB holds the current composition; JSON files allow explicit save/open.

## Route invariants

- The route is one ordered pen-down polyline. For every adjacent pair of segments, previous.to equals next.from. There are no hidden transfers or jumps.
- All transfers are included in the preview, playback, nav log, total distance and KML LineString.
- Default text is a Noto Sans CJK bold outline. Outer contours, holes and separate components are retained. Complete-contour mode preserves every contour; small-opening mode cuts explicit, small seams to improve joining. Removed seams are reflected in the actual route, never concealed in exports.
- Candidate entry seams and directions are evaluated against the whole composition, including counters and neighbouring characters. Text reading order is preserved; element order can be selected automatically or pinned at the first element.
- A multi-start greedy planner and two-opt select paths. Costs include tangent-continuous cubic connector geometry, length, crossings and counter intrusion. Collinear reversal is routed through a lateral loop rather than a cusp. Immediate reversals inside branched presets are also replaced with visible local loops. Sampling preserves endpoint tangent samples.
- Font/pattern corners are distinct from joins between paths. Optional physical-radius fillets show unrounded vertices when the requested radius does not fit; the radius is not silently shrunk. This is geometric planning, not a validated aircraft performance envelope.
- Local coordinates are mapped with WGS84 geodesic direct calculations. Leg distance and initial true track use geodesic inverse calculations. Tracks are not wind-corrected headings.
- Saved/imported computed routes are regenerated. The importer validates version, bounds and element IDs; stale geometry and computed leg fields are not trusted.

## Implementation

`lib/sky-art/` contains geometry, fonts, 30 presets, planner, tangent connections, projection, persistence and exports. A browser Worker generates the geometry and local route. Geographic transforms update the existing route without changing its visit order. Start-anchor transit and optional airport return are added as tangent-continuous paths before geographic projection; moving the artwork does not silently move the declared departure point. Airport anchor names persist in saved projects. The canvas offers explicit multi-selection for touch devices. Main-thread projection, MapLibre and the nav log share one RoutePlan. Revision IDs prevent obsolete Worker responses from being exported as a new composition.

The MapLibre 6 worker is served locally from public/sky-art; `npm run prepare:sky-art` copies the exact installed runtime before dev/build. Fonts and airport search data are also local resources. Airport metadata is only used for artwork anchoring, not navigation data. Regenerate it from locally supplied public CSV and datapackage metadata with `scripts/build-sky-art-airports.py`; the compiler verifies the source coordinate order rather than assuming longitude-first.

## Local verification

- `npm run test:sky-art`: contour/Chinese coverage, all 30 patterns, continuity, tangent joins, explicit reversal loops, geodesics, scale, anchors, return legs, exports, invalid imports and performance fixtures. No service connections.
- `node scripts/assert-local-targets.mjs` before starting a development service or build.
- `node scripts/test-sky-art-ui.mjs` against a running localhost server. Set SKY_ART_LOCAL_URL, SKY_ART_PLAYWRIGHT_MODULE and SKY_ART_CHROME_PATH when needed. Browser checks intercept non-local connections and use deterministic synthetic airport fixtures. Screenshots/downloads go to artifacts/sky-art-qa.
- TypeScript and targeted ESLint checks cover the new tool. GPX schema tests require `lxml` in the local Python runtime; set `SKY_ART_PYTHON` when it differs from the bundled desktop runtime.

## Map imagery

Localhost previews use bundled Natural Earth land, lakes and borders by default, so local testing never requests remote imagery. To view local imagery, set NEXT_PUBLIC_SKY_ART_TILE_URL to an explicitly local tile service. Outside localhost, the default is OpenStreetMap Standard with visible attribution, ordinary browser caching and no bulk download/prefetch. The env variable can select a production provider; verify its attribution and usage conditions before changing providers.

## ForeFlight acceptance still required

GPX 1.1 route files, KML waypoint and track-layer files, and ordered seven-decimal-degree route text are generated from the same sequence. ForeFlight 18.4 introduced direct GPX route import (https://www.foreflight.com/enhancements/gpx-route-support). The exporter uses `<rte>`/`<rtept>` with GPX schema type `rteType`, not recorded-track elements or a made-up `<rteType>` tag. Tests validate the GPX against the vendored official schema with XML network access disabled, preserving repeated visits and date-line coordinates. Coordinate order, repeated visits and split-part overlap are covered locally. These tests do not prove iOS/ForeFlight compatibility or capacity. On a target device running ForeFlight 18.4 or later, open the GPX in ForeFlight and check its FPL sequence. Also import the waypoint file and layer; for older versions, paste the ordered route text, check the repeated coordinates and verify a long route and numbered splits. Record ForeFlight version and observed limit before declaring device acceptance complete. No automatic-success or one-click-navigation claim is made.

## Remaining quality review

The heuristic route is a candidate, not a guarantee that every arbitrary Chinese phrase or overlapping composition has an attractive one-line solution. Evaluate full pen-down previews rather than isolated filled glyphs. User-selected layouts are preserved; crossings and added loops are visible. Flight performance and airspace judgement remain with the pilot.

### Navigation detail (algorithm 1.2)

Projection now reduces the ordered route before creating waypoints, nav log and exports. The default maximum local-plane deviation is 0.05 NM, capped at 1% of the artwork's smaller dimension. Fine (0.025 NM), fewer points (0.10 NM) and original resolution are available on the map. Reduction preserves sharp corners (45° or more), repeated visits, segment kind/element boundaries and samples next to those transitions. It never deduplicates separate visits. Airport transit participates in the same reduction. Saved projects without a tolerance use the balanced default; imported computed routes are regenerated.

The K5A1 Christmas tree + 2026 example reduced from 341 to 154 waypoints (110.67 to 110.28 NM). The original was verified by the user on iPad ForeFlight; the optimized file still requires device comparison. Schema checks cannot establish label readability in ForeFlight.

### Contour seams (algorithm 1.3)

Start candidates now include at least one candidate from every contour instead of allowing nearby outer-contour seams to exhaust the seeds. After ordering the strokes, a local improvement pass compares each contour's possible seams/directions against both adjacent paths. The Christmas 2026 regression retains every vertex in complete mode, respects the configured small openings in open mode, and reduces lettering-connector crossings from two to one. The refreshed demo has 157 navigation waypoints and is 113.54 NM: the selected cleaner connections increase travel versus the 154-point version (110.28 NM). Device readability still requires user feedback; source-route crossing counts do not include airport transit.

### Compound outlines and outward exits (algorithm 1.4)

In small-opening mode, each counter is inserted into its containing outer contour through two nearby bridges. The original contour points remain, apart from configured seam openings. External entry candidates are restricted to the original exterior vertices; the counter is not a character-to-character entry destination. Counter bridges are marked as real connection segments. Complete-contour mode retains the original separate-contour behavior.

When another character follows, candidates may continue in the same direction over an already drawn part of the contour to a port facing that character. This repeated flight is scored by its length and retained in every output. It trades some repeated contour travel for shorter, less intrusive visible connections. Navigation transition samples now keep meaningful separation instead of always keeping the first nearly coincident tangent sample.

The refreshed Christmas 2026 example has 201 waypoints and is 113.91 NM. Compared with v1.3, visible lettering-connection length dropped from 342.62 to 236.61 canvas units (31%); original-contour edge crossings dropped from one to zero, and the large 2-to-6 U detour was eliminated. These are source-geometry metrics and exclude airport transit. Unit regressions cover 0/6/8/9/B/日 counter inclusion and external ports, plus the 2026 connector envelope. The v1.4 GPX still requires an iPad display check.

The source segment budget is 12,000 after counter splicing/retracing, while the existing 30-character/8-element input limits remain. A regression verifies the full 30-character B8O outline plus a preset still generates and remains continuous. The local UI cancel check clicks as soon as Cancel appears, avoiding the stability-wait race with fast completed jobs.

### Global candidate routing (algorithm 1.5)

The v1.4 exit-retracing alternatives are removed. External seam candidates include extrema and mid-edge exterior ports. Complete character candidates are selected together with dynamic programming over the fixed character/element order. Single-contour character candidates are enumerated; multi-component characters use several internal planning candidates, so this is optimisation within a finite candidate set, not a proof of the unconstrained geometric global minimum.

Default clear routing penalises backward endpoint directions and contour crossings outside the small port-opening clearance. Shortest-distance mode uses actual curve lengths alone. Local curve handles are capped by the adjacent edge length and 12% of the chord rather than a mandatory 28% of the whole transition distance. Explicit tangent samples are retained, with near-coincident endpoint samples removed to preserve exact segment continuity.

For return-to-start placement (airport, start anchor, zero offsets), candidate selection includes the return curve. The worker generation key includes this flag, so changing between open and returning flight regenerates the route and invalidates stale exports. Offset/center placement remains independently projected; no claim of globally optimal airport transit is made for those placements.

The Christmas 2026 sample is 109.94 NM and 156 waypoints, versus 113.91 NM / 201 waypoints in v1.4. Added repeated artwork edges dropped from 28 to zero. Raw contour-edge intersections can still occur at the small contour portals; this version does not claim zero intersections everywhere. Regression fixtures for 202, 2026, 0123456789, LOVE, HAPPY and 平安2026 contain no added repeated contour edges. All 30 local tests passed. Device appearance still requires user comparison.

### Placement-aware entry and sectional maps (algorithm 1.6)

Placement planning now accounts for the anchor's position relative to the artwork. The nearest unpinned element is visited first; character flight order is compared in both directions within each element. The drawing reference is held independently of the selected entry, so moving or rotating artwork can change its first character/contour seam without shifting the artwork unexpectedly. An airport always has an explicit departure leg; optional return legs are included in planning and exports. The map labels a separate drawing entry with `1` when it differs from the airport/start marker.

Cross-element connections and airport transit can take short exterior corridors around closed outlines instead of crossing an unrelated pattern. Internal character planning retains the existing local connections. This routing is bounded candidate comparison, not a general airspace planner or a proof of a geometric global optimum. Font geometry and baseline plans are cached during placement changes.

Map layer selection includes the publicly published FAA VFR Sectional raster service (US): https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer . The provider uses EPSG:3857, 256px tiles, tile URLs in z/y/x order, and native display levels 8–12. Selection zooms to level 8 when needed. FAA attribution is displayed, and source errors have a recovery message. Local UI tests intercept this source with the deterministic synthetic `scripts/fixtures/sky-art-sectional.png`; no live chart tiles or user data are used as test fixtures.

### Direct ForeFlight handoff and independent block order (algorithm 1.7)

The map has a primary Open in ForeFlight link using the official `foreflightmobile://maps/search?q=` scheme. It supplies the full ordered coordinate route, retaining repeated visits. See https://foreflight.com/support/app-urls/ . Native app opening and acceptance still require an installed ForeFlight device; local tests validate the URL payload without launching an external app. GPX download and copying are fallback actions under More. Details/nav log are optional, while the main navigation has Design and Map. Coordinate, placement and routing options are collapsed. The map uses a magenta route with a white halo above sectional tiles.

Text blocks now choose flight direction independently. Up to four elements compare all remaining block orders after the selected first element; larger compositions retain the bounded spatial order. Candidate costs and transition matrices are reused. This permits heart → W → S → R → 生日快乐 in the synthetic regression layout without hard-coded character rules. This remains bounded candidate optimization, not a global shortest-path guarantee.
