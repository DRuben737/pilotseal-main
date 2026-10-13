import type { RoutePlan, SavedProject } from "./types";
const escapeXml = (v: string) =>
  v.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const xml = (content: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${content}</Document></kml>`;
export function waypointKml(plan: RoutePlan, name = "Sky Art"): string {
  return xml(
    `<name>${escapeXml(name)}</name>` +
      plan.waypoints
        .map(
          (p) =>
            `<Placemark><name>${p.id}</name><Point><coordinates>${p.lon.toFixed(7)},${p.lat.toFixed(7)},0</coordinates></Point></Placemark>`,
        )
        .join(""),
  );
}
export function trackKml(plan: RoutePlan, name = "Sky Art"): string {
  return xml(
    `<name>${escapeXml(name)}</name><Style id="route"><LineStyle><color>ffb8d420</color><width>3</width></LineStyle></Style><Placemark><name>${escapeXml(name)}</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><coordinates>${plan.waypoints.map((p) => `${p.lon.toFixed(7)},${p.lat.toFixed(7)},0`).join(" ")}</coordinates></LineString></Placemark>`,
  );
}
export function routeGpx(plan: RoutePlan, name = "Sky Art"): string {
  // GPX's <rte> has the schema type rteType. A <trk> is a recorded track,
  // and cannot substitute for ForeFlight's planned-route import.
  const points = plan.waypoints
    .map((p) => {
      // GPX longitude is [-180, 180); rounding near the date line can reach 180.
      const rounded = Number(p.lon.toFixed(7));
      const lon = rounded >= 180 ? rounded - 360 : rounded;
      return `<rtept lat="${p.lat.toFixed(7)}" lon="${lon.toFixed(7)}"><name>${escapeXml(p.id)}</name></rtept>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="PilotSeal"><rte><name>${escapeXml(name)}</name>${points}</rte></gpx>`;
}
export function coordinateToken(lat: number, lon: number): string {
  // Decimal degrees preserve short tangent samples; whole-second DMS can collapse them.
  return `${Math.abs(lat).toFixed(7)}${lat < 0 ? "S" : "N"}/${Math.abs(lon).toFixed(7)}${lon < 0 ? "W" : "E"}`;
}
export function foreflightRoute(plan: RoutePlan): string {
  return plan.waypoints.map((p) => coordinateToken(p.lat, p.lon)).join(" ");
}
export function splitRoute(plan: RoutePlan, pointsPerPart: number): string[] {
  if (!Number.isInteger(pointsPerPart) || pointsPerPart < 2)
    throw new Error("Use at least two waypoints per part.");
  const out: string[] = [];
  for (let i = 0; i < plan.waypoints.length - 1; i += pointsPerPart - 1)
    out.push(
      plan.waypoints
        .slice(i, i + pointsPerPart)
        .map((p) => coordinateToken(p.lat, p.lon))
        .join(" "),
    );
  return out;
}
export function navlogCsv(plan: RoutePlan, speed?: number): string {
  const header = [
    "Leg",
    "From",
    "To",
    "From latitude",
    "From longitude",
    "To latitude",
    "To longitude",
    "True track (deg)",
    "Distance (NM)",
    "Cumulative (NM)",
    "Type",
    "Time (min)",
    "Cumulative time (min)",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...plan.legs.map((l) => [
        l.index,
        l.from.id,
        l.to.id,
        l.from.lat.toFixed(7),
        l.from.lon.toFixed(7),
        l.to.lat.toFixed(7),
        l.to.lon.toFixed(7),
        l.track.toFixed(1),
        l.distanceNm.toFixed(3),
        l.cumulativeNm.toFixed(3),
        l.kind,
        speed && speed > 0 ? ((l.distanceNm / speed) * 60).toFixed(2) : "",
        speed && speed > 0 ? ((l.cumulativeNm / speed) * 60).toFixed(2) : "",
      ]),
    ]
      .map((r) => r.join(","))
      .join("\r\n")
  );
}
export function download(contents: BlobPart, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function serialize(project: SavedProject): string {
  return JSON.stringify(project, null, 2);
}
export async function navlogPdf(
  plan: RoutePlan,
  speed?: number,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const columns = [34, 62, 120, 182, 240, 298, 357, 419, 481, 538];
  let page = doc.addPage([612, 792]),
    y = 740;
  const draw = (txt: string, x: number, yy: number, size = 9, strong = false) =>
    page.drawText(txt, {
      x,
      y: yy,
      size,
      font: strong ? bold : font,
      color: rgb(0.1, 0.16, 0.22),
    });
  const header = () => {
    draw("SKY ART / NAV LOG", 34, 752, 16, true);
    draw(
      `Planned track | ${plan.distanceNm.toFixed(1)} NM | ${plan.legs.length} legs | True tracks`,
      34,
      730,
    );
    [
      "Leg",
      "From",
      "To",
      "Track T",
      "NM",
      "Total NM",
      "Lat",
      "Lon",
      "Type",
      "Min",
    ].forEach((t, i) => draw(t, columns[i], 706, 8, true));
    y = 688;
  };
  header();
  for (const l of plan.legs) {
    if (y < 48) {
      page = doc.addPage([612, 792]);
      header();
    }
    const row = [
      `${l.index}`,
      l.from.id,
      l.to.id,
      `${l.track.toFixed(0)}`,
      l.distanceNm.toFixed(2),
      l.cumulativeNm.toFixed(1),
      l.to.lat.toFixed(3),
      l.to.lon.toFixed(3),
      l.kind === "connection"
        ? "Link"
        : l.kind === "airport"
          ? "Transit"
          : "Art",
      speed && speed > 0 ? ((l.distanceNm / speed) * 60).toFixed(1) : "-",
    ];
    row.forEach((t, i) => draw(t, columns[i], y, 8));
    y -= 15;
  }
  page = doc.addPage([612, 792]);
  draw("WAYPOINT COORDINATES", 34, 752, 16, true);
  y = 725;
  for (const p of plan.waypoints) {
    if (y < 48) {
      page = doc.addPage([612, 792]);
      y = 745;
    }
    draw(`${p.id}    ${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}`, 34, y, 10);
    y -= 15;
  }
  return doc.save();
}

export function foreflightUrl(plan: RoutePlan): string {
  return `foreflightmobile://maps/search?q=${encodeURIComponent(foreflightRoute(plan)).replace(/%20/g, "+")}`;
}
