# GPX export validation schema

`gpx-1.1.xsd` is the unmodified Topografix GPX 1.1 XML schema, obtained from https://www.topografix.com/GPX/1/1/gpx.xsd on 2026-10-12. Tests use the local copy with XML network/entity resolution disabled. Source schema documentation: https://www.topografix.com/GPX/1/1/ .

ForeFlight 18.4 introduced GPX route import: https://www.foreflight.com/enhancements/gpx-route-support . The schema's `rteType` is the type of `<rte>`; it is not a literal `<rteType>` XML element. The exporter writes a planned route (`rte/rtept`), not a recorded track (`trk/trkseg`). Schema acceptance is distinct from actual device acceptance.
