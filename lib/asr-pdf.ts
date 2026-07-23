import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

import type { AsrExternalNotification, AsrReport } from "@/lib/asr-reports";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT = rgb(0.08, 0.11, 0.16);
const MUTED = rgb(0.38, 0.42, 0.48);
const LINE = rgb(0.76, 0.79, 0.83);
const SECTION = rgb(0.92, 0.95, 0.98);

type PdfContext = {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

function safe(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replace(/[^\x20-\x7E]/g, "?");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? safe(value)
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? safe(value)
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = safe(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawHeader(context: PdfContext, report: AsrReport, pageNumber: number) {
  const { page, bold, regular } = context;
  page.drawText("AVIATION SAFETY REPORT (ASR)", {
    x: MARGIN,
    y: PAGE_HEIGHT - 42,
    size: 15,
    font: bold,
    color: TEXT,
  });
  page.drawText(`Page ${pageNumber} of 2`, {
    x: PAGE_WIDTH - MARGIN - 54,
    y: PAGE_HEIGHT - 40,
    size: 8,
    font: regular,
    color: MUTED,
  });
  page.drawText(
    `Reference: ${safe(report.reference_number)}   Revision: ${report.revision_number}`,
    {
      x: MARGIN,
      y: PAGE_HEIGHT - 57,
      size: 8,
      font: regular,
      color: MUTED,
    }
  );
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - 65 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 65 },
    thickness: 1,
    color: LINE,
  });
  context.y = PAGE_HEIGHT - 80;
}

function drawSectionTitle(context: PdfContext, number: number, title: string) {
  context.page.drawRectangle({
    x: MARGIN,
    y: context.y - 16,
    width: CONTENT_WIDTH,
    height: 18,
    color: SECTION,
  });
  context.page.drawText(`${number}. ${safe(title)}`, {
    x: MARGIN + 6,
    y: context.y - 11,
    size: 9,
    font: context.bold,
    color: TEXT,
  });
  context.y -= 24;
}

function drawFields(
  context: PdfContext,
  fields: Array<[string, unknown]>,
  columns = 2
) {
  const columnWidth = CONTENT_WIDTH / columns;
  for (let index = 0; index < fields.length; index += columns) {
    const row = fields.slice(index, index + columns);
    row.forEach(([label, value], columnIndex) => {
      const x = MARGIN + columnIndex * columnWidth;
      context.page.drawText(safe(label).toUpperCase(), {
        x,
        y: context.y,
        size: 6.5,
        font: context.bold,
        color: MUTED,
      });
      const text = wrapText(safe(value), context.regular, 8, columnWidth - 10)[0] ?? "-";
      context.page.drawText(text, {
        x,
        y: context.y - 11,
        size: 8,
        font: context.regular,
        color: TEXT,
      });
    });
    context.y -= 28;
  }
}

function drawParagraph(
  context: PdfContext,
  label: string,
  value: unknown,
  maxLines = 8
) {
  context.page.drawText(safe(label).toUpperCase(), {
    x: MARGIN,
    y: context.y,
    size: 6.5,
    font: context.bold,
    color: MUTED,
  });
  context.y -= 12;
  const lines = wrapText(safe(value), context.regular, 8, CONTENT_WIDTH - 4).slice(
    0,
    maxLines
  );
  for (const line of lines) {
    context.page.drawText(line || " ", {
      x: MARGIN,
      y: context.y,
      size: 8,
      font: context.regular,
      color: TEXT,
    });
    context.y -= 10;
  }
  context.y -= 7;
}

function notificationSummary(item: AsrExternalNotification) {
  return `${item.agency} | ${formatDate(item.notified_on)} | ${
    item.contact_information || "No contact information"
  }`;
}

export function getAsrRiskBand(score: number | null) {
  if (score === null) return "Not rated";
  if (score <= 6) return "Low";
  if (score <= 12) return "Medium";
  return "High";
}

export async function buildAsrPdf(report: AsrReport): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`ASR ${report.reference_number ?? report.id}`);
  document.setSubject("Aviation Safety Report");
  document.setCreator("PilotSeal");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const data = report.report_data;

  const first: PdfContext = {
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    regular,
    bold,
    y: 0,
  };
  drawHeader(first, report, 1);
  drawSectionTitle(first, 1, "Occurrence");
  drawFields(first, [
    ["Occurrence date", formatDate(data.occurrence_date)],
    ["Local time", data.occurrence_local_time],
    ["Type of occurrence", data.type_of_occurrence],
    ["Nature of flight", data.nature_of_flight],
    ["Route", `${safe(data.route_from)} to ${safe(data.route_to)}`],
    ["Training area", data.training_area],
    ["Phase of flight", data.phase_of_flight],
    ["Maneuver", data.training_maneuver],
  ]);

  drawSectionTitle(first, 2, "Flight Crew / Occupants");
  drawFields(first, [
    ["Aircraft commander", data.aircraft_commander_name],
    ["PUT / SIC", data.put_sic_name],
    ["Other crew", data.other_crew],
    ["Passengers", data.passengers],
    ["Program", data.program],
    ["Reporter title", data.reporter_title],
  ]);

  drawSectionTitle(first, 3, "Environment");
  drawFields(first, [
    ["Wind", data.wind],
    ["Turbulence", data.turbulence],
    ["Day / Night", data.day_night],
    ["Visibility", data.visibility_sm ? `${data.visibility_sm} SM` : "-"],
    ["Conditions", data.flight_conditions],
    ["Precipitation", data.precipitation],
    ["OAT", data.oat_c ? `${data.oat_c} C` : "-"],
    ["Icing", data.icing],
  ]);

  drawSectionTitle(first, 4, "Aircraft");
  drawFields(first, [
    ["Registration", data.no_aircraft ? "No aircraft involved" : data.aircraft_registration],
    ["Aircraft type", data.aircraft_type],
    ["Fuel state", `${safe(data.fuel_state_value)} ${data.fuel_state_unit}`],
    ["Gross weight", `${safe(data.gross_weight_value)} ${data.gross_weight_unit}`],
    ["Speed", `${safe(data.speed_value)} ${data.speed_unit}`],
    ["Altitude", `${safe(data.altitude_value)} ${data.altitude_unit}`],
  ]);

  drawSectionTitle(first, 5, "Description and Reporter Certification");
  drawParagraph(first, "Description", data.description, 7);
  drawFields(first, [
    ["Reporter", report.reporter_signed_name ?? report.submitted_by_name],
    ["Signed", formatDateTime(report.reporter_signed_at)],
  ]);

  const second: PdfContext = {
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    regular,
    bold,
    y: 0,
  };
  drawHeader(second, report, 2);
  drawSectionTitle(second, 6, "Head of Training Review");
  drawParagraph(second, "Comments / Actions", report.training_comments, 4);
  drawFields(second, [
    ["Signed by", report.training_signed_name],
    [
      "Title / Date",
      `${safe(report.training_signed_title)} / ${formatDateTime(
        report.training_signed_at
      )}`,
    ],
  ]);

  drawSectionTitle(second, 7, "Director of Maintenance / Maintenance Review");
  drawParagraph(second, "Comments / Corrective Action", report.maintenance_comments, 6);
  drawFields(second, [
    ["Signed by", report.maintenance_signed_name],
    [
      "Title / Date",
      `${safe(report.maintenance_signed_title)} / ${formatDateTime(
        report.maintenance_signed_at
      )}`,
    ],
  ]);

  drawSectionTitle(second, 8, "Safety Manager Review");
  drawFields(second, [
    ["Risk score", report.risk_score ?? "Not rated"],
    ["Risk band", getAsrRiskBand(report.risk_score)],
    ["Rated by", report.risk_rated_name],
    ["Rated on", formatDateTime(report.risk_rated_at)],
    ["Hazard log reference", report.hazard_log_reference],
    ["Investigation reference", report.internal_investigation_reference],
  ]);
  drawParagraph(second, "Safety Comments / Actions", report.safety_comments, 6);
  drawFields(second, [
    ["Signed by", report.safety_signed_name],
    [
      "Title / Date",
      `${safe(report.safety_signed_title)} / ${formatDateTime(report.safety_signed_at)}`,
    ],
  ]);

  drawSectionTitle(second, 9, "External Notifications");
  if (report.external_notifications.length === 0) {
    drawParagraph(second, "Agencies notified", "None recorded", 2);
  } else {
    report.external_notifications.slice(0, 3).forEach((item, index) => {
      drawParagraph(second, `Notification ${index + 1}`, notificationSummary(item), 2);
    });
  }

  second.page.drawText(
    `Status: ${safe(report.status).toUpperCase()}   Submitted by: ${safe(
      report.submitted_by_name
    )}   Generated: ${formatDateTime(new Date().toISOString())}`,
    {
      x: MARGIN,
      y: 24,
      size: 7,
      font: regular,
      color: MUTED,
    }
  );

  return document.save();
}

export function downloadAsrPdf(report: AsrReport) {
  void buildAsrPdf(report).then((bytes) => {
    const blob = new Blob([new Uint8Array(bytes).buffer], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.reference_number ?? "ASR-draft"}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}
