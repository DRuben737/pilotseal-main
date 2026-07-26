import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";

import type { AircraftModelRecord, AircraftRecord } from "@/lib/aircraft";
import type { AircraftInspectionAssignment } from "@/lib/preflight";

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 18;
const BOTTOM = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT = rgb(0.06, 0.09, 0.14);
const MUTED = rgb(0.3, 0.35, 0.42);
const LINE = rgb(0.12, 0.15, 0.2);
const HEADER = rgb(0.84, 0.86, 0.89);
const WHITE = rgb(1, 1, 1);
const RED = rgb(1, 0.5, 0.5);
const RED_STRONG = rgb(0.92, 0.08, 0.08);
const YELLOW = rgb(1, 0.77, 0.08);
const PALE_YELLOW = rgb(1, 0.9, 0.55);

const GROUP_COLORS = [
  rgb(0.69, 0.78, 0.91),
  rgb(0.72, 0.86, 0.66),
  rgb(1, 0.89, 0.57),
  rgb(0.97, 0.77, 0.64),
  rgb(0.79, 0.73, 0.9),
];

type FleetReportInput = {
  organizationName: string;
  aircraft: AircraftRecord[];
  models: AircraftModelRecord[];
  generatedAt?: Date;
};

export type InspectionFleetReportInput = FleetReportInput & {
  assignments: AircraftInspectionAssignment[];
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type PageContext = PdfFonts & {
  page: PDFPage;
  y: number;
};

type TableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};

type CellValue = {
  text: string;
  background?: RGB;
  color?: RGB;
  bold?: boolean;
};

type InspectionRow = {
  tail: CellValue;
  hundredHour: CellValue;
  annual: CellValue;
  static: CellValue;
  transponder: CellValue;
  equipment: CellValue;
  otherType: CellValue;
  otherDue: CellValue;
  otherRemaining: CellValue;
  hobbs: CellValue;
  toHundred: CellValue;
  status: CellValue;
};

const INSPECTION_COLUMNS: TableColumn[] = [
  { key: "tail", label: "Tail #", width: 54 },
  { key: "hundredHour", label: "100 hr", width: 50 },
  { key: "annual", label: "Annual", width: 55 },
  { key: "static", label: "91.411", width: 55 },
  { key: "transponder", label: "91.413", width: 55 },
  { key: "equipment", label: "ADS-B / ELT", width: 72 },
  { key: "otherType", label: "Other inspection", width: 92 },
  { key: "otherDue", label: "Due at", width: 58 },
  { key: "otherRemaining", label: "Remaining", width: 48 },
  { key: "hobbs", label: "Hobbs", width: 48 },
  { key: "toHundred", label: "To 100 hr", width: 52 },
  { key: "status", label: "Status / down for", width: 117 },
];

const WEIGHT_BALANCE_COLUMNS: TableColumn[] = [
  { key: "tail", label: "Tail #", width: 68 },
  { key: "model", label: "Aircraft type", width: 96 },
  { key: "emptyWeight", label: "BEW", width: 68, align: "right" },
  { key: "longArm", label: "Long arm", width: 68, align: "right" },
  { key: "longMoment", label: "Long moment", width: 92, align: "right" },
  { key: "latArm", label: "Lat arm", width: 68, align: "right" },
  { key: "latMoment", label: "Lat moment", width: 92, align: "right" },
  { key: "updated", label: "Last updated", width: 96 },
  { key: "expires", label: "Registration", width: 108 },
];

function safe(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(/[^\x20-\x7E]/g, "?");
}

function fitText(text: string, font: PDFFont, size: number, width: number) {
  const normalized = safe(text);
  if (font.widthOfTextAtSize(normalized, size) <= width) return normalized;
  let shortened = normalized;
  while (
    shortened.length > 1 &&
    font.widthOfTextAtSize(`${shortened}...`, size) > width
  ) {
    shortened = shortened.slice(0, -1);
  }
  return shortened ? `${shortened}...` : "";
}

function formatDate(value?: string | null, includeYear = true) {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return safe(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: includeYear ? "numeric" : undefined,
    year: "2-digit",
  }).format(date);
}

function formatPrintedDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(value);
}

function formatNumber(value?: number | null, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toneForDate(
  value: string | null | undefined,
  generatedAt: Date
): RGB | undefined {
  if (!value) return undefined;
  const due = new Date(`${value.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(due.getTime())) return undefined;
  const today = new Date(generatedAt);
  today.setHours(0, 0, 0, 0);
  const remainingDays = (due.getTime() - today.getTime()) / 86_400_000;
  if (remainingDays < 0) return RED;
  if (remainingDays <= 30) return PALE_YELLOW;
  return undefined;
}

function toneForHours(value: number | null | undefined): RGB | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  if (value < 0) return RED;
  if (value <= 5) return PALE_YELLOW;
  return undefined;
}

function strongerTone(first?: RGB, second?: RGB) {
  if (first === RED || second === RED) return RED;
  return first ?? second;
}

function drawReportHeader(
  context: PageContext,
  title: string,
  organizationName: string,
  generatedAt: Date
) {
  context.page.drawRectangle({
    x: MARGIN,
    y: PAGE_HEIGHT - 52,
    width: CONTENT_WIDTH,
    height: 29,
    color: HEADER,
    borderColor: LINE,
    borderWidth: 1,
  });
  const titleText = fitText(title, context.bold, 19, CONTENT_WIDTH - 20);
  context.page.drawText(titleText, {
    x: MARGIN + (CONTENT_WIDTH - context.bold.widthOfTextAtSize(titleText, 19)) / 2,
    y: PAGE_HEIGHT - 44,
    size: 19,
    font: context.bold,
    color: TEXT,
  });
  context.page.drawText(
    fitText(safe(organizationName), context.bold, 8, CONTENT_WIDTH - 140),
    {
      x: MARGIN + 4,
      y: PAGE_HEIGHT - 66,
      size: 8,
      font: context.bold,
      color: TEXT,
    }
  );
  const printed = `Printed: ${formatPrintedDate(generatedAt)}`;
  context.page.drawText(printed, {
    x: PAGE_WIDTH - MARGIN - context.regular.widthOfTextAtSize(printed, 8) - 4,
    y: PAGE_HEIGHT - 66,
    size: 8,
    font: context.regular,
    color: TEXT,
  });
  context.y = PAGE_HEIGHT - 78;
}

function drawGroupHeader(
  context: PageContext,
  title: string,
  color: RGB,
  continued = false
) {
  const label = continued ? `${title} (continued)` : title;
  context.page.drawRectangle({
    x: MARGIN,
    y: context.y - 19,
    width: CONTENT_WIDTH,
    height: 20,
    color,
    borderColor: LINE,
    borderWidth: 1,
  });
  const text = fitText(label, context.bold, 12, CONTENT_WIDTH - 12);
  context.page.drawText(text, {
    x: MARGIN + (CONTENT_WIDTH - context.bold.widthOfTextAtSize(text, 12)) / 2,
    y: context.y - 13,
    size: 12,
    font: context.bold,
    color: TEXT,
  });
  context.y -= 20;
}

function drawTableHeader(context: PageContext, columns: TableColumn[]) {
  const height = 22;
  let x = MARGIN;
  for (const column of columns) {
    drawCell(context, x, context.y, column.width, height, {
      text: column.label,
      background: HEADER,
      bold: true,
    }, column.align ?? "center", 6.5);
    x += column.width;
  }
  context.y -= height;
}

function drawCell(
  context: PageContext,
  x: number,
  top: number,
  width: number,
  height: number,
  value: CellValue,
  align: "left" | "center" | "right" = "center",
  fontSize = 6.8
) {
  context.page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    color: value.background ?? WHITE,
    borderColor: LINE,
    borderWidth: 0.55,
  });
  const font = value.bold ? context.bold : context.regular;
  const text = fitText(value.text, font, fontSize, width - 6);
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textX =
    align === "left"
      ? x + 3
      : align === "right"
        ? x + width - textWidth - 3
        : x + (width - textWidth) / 2;
  context.page.drawText(text, {
    x: textX,
    y: top - height + (height - fontSize) / 2 - 0.5,
    size: fontSize,
    font,
    color: value.color ?? TEXT,
  });
}

function drawTableRow(
  context: PageContext,
  columns: TableColumn[],
  row: Record<string, CellValue>,
  height = 20
) {
  let x = MARGIN;
  for (const column of columns) {
    drawCell(
      context,
      x,
      context.y,
      column.width,
      height,
      row[column.key] ?? { text: "" },
      column.align ?? "center"
    );
    x += column.width;
  }
  context.y -= height;
}

function createPage(
  document: PDFDocument,
  fonts: PdfFonts,
  title: string,
  organizationName: string,
  generatedAt: Date
) {
  const context: PageContext = {
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    regular: fonts.regular,
    bold: fonts.bold,
    y: 0,
  };
  drawReportHeader(context, title, organizationName, generatedAt);
  return context;
}

function getModelName(
  aircraft: AircraftRecord,
  modelNames: Map<string, string>
) {
  return (
    modelNames.get(aircraft.model_id ?? "") ??
    aircraft.model?.name ??
    aircraft.category ??
    "Unassigned model"
  );
}

function groupAircraft(input: FleetReportInput) {
  const modelNames = new Map(input.models.map((model) => [model.id, model.name]));
  const groups = new Map<string, AircraftRecord[]>();
  for (const item of input.aircraft) {
    const modelName = getModelName(item, modelNames);
    const current = groups.get(modelName) ?? [];
    current.push(item);
    groups.set(modelName, current);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modelName, aircraft]) => ({
      modelName,
      aircraft: aircraft.sort((left, right) =>
        left.tail_number.localeCompare(right.tail_number)
      ),
    }));
}

function inspectionRowsForAircraft(
  aircraft: AircraftRecord,
  assignments: AircraftInspectionAssignment[],
  generatedAt: Date
): InspectionRow[] {
  const relevantAssignments = assignments
    .filter(
      (assignment) =>
        assignment.aircraft_id === aircraft.id &&
        assignment.is_active &&
        assignment.definition?.is_active !== false
    )
    .sort((left, right) =>
      (left.definition?.name ?? "").localeCompare(right.definition?.name ?? "")
    );
  const items = relevantAssignments.length > 0 ? relevantAssignments : [null];
  const meter = aircraft.current_meter_value ?? null;
  const hundredRemaining =
    aircraft.hundred_hour_due_hours != null && meter != null
      ? aircraft.hundred_hour_due_hours - meter
      : null;
  const status = aircraft.operational_status ?? "available";
  const statusText =
    status === "grounded"
      ? `GROUNDED: ${aircraft.operational_status_note ?? "Do not dispatch"}`
      : status === "in_maintenance"
        ? `IN MX: ${aircraft.operational_status_note ?? "Maintenance"}`
        : status === "away"
          ? `AWAY: ${aircraft.operational_status_note ?? "Unavailable"}`
          : "Available";
  const statusBackground =
    status === "grounded"
      ? RED_STRONG
      : status === "available"
        ? undefined
        : YELLOW;
  const statusColor = status === "grounded" ? WHITE : TEXT;
  const equipmentTone = strongerTone(
    toneForDate(aircraft.adsb_due_date, generatedAt),
    toneForDate(aircraft.elt_due_date, generatedAt)
  );

  return items.map((assignment) => {
    const dueDate = assignment?.due_date ?? null;
    const dueMeter = assignment?.due_meter ?? null;
    const dateRemaining = dueDate
      ? Math.ceil(
          (new Date(`${dueDate}T23:59:59`).getTime() -
            new Date(generatedAt).setHours(0, 0, 0, 0)) /
            86_400_000
        )
      : null;
    const meterRemaining =
      dueMeter != null && meter != null ? dueMeter - meter : null;
    const otherTone = strongerTone(
      toneForDate(dueDate, generatedAt),
      toneForHours(meterRemaining)
    );
    const dueText = [
      dueDate ? formatDate(dueDate) : "",
      dueMeter != null ? formatNumber(dueMeter) : "",
    ]
      .filter(Boolean)
      .join(" / ");
    const remainingText = [
      dateRemaining != null ? `${dateRemaining}d` : "",
      meterRemaining != null ? `${formatNumber(meterRemaining)}h` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      tail: {
        text: aircraft.tail_number,
        background:
          status === "grounded" || status === "in_maintenance"
            ? RED_STRONG
            : undefined,
        color:
          status === "grounded" || status === "in_maintenance" ? WHITE : TEXT,
        bold: true,
      },
      hundredHour: {
        text: formatNumber(aircraft.hundred_hour_due_hours),
        background: toneForHours(hundredRemaining),
      },
      annual: {
        text: formatDate(aircraft.annual_due_date),
        background: toneForDate(aircraft.annual_due_date, generatedAt),
      },
      static: {
        text: formatDate(aircraft.static_due_date),
        background: toneForDate(aircraft.static_due_date, generatedAt),
      },
      transponder: {
        text: formatDate(aircraft.transponder_due_date),
        background: toneForDate(aircraft.transponder_due_date, generatedAt),
      },
      equipment: {
        text: [
          aircraft.adsb_due_date ? `A ${formatDate(aircraft.adsb_due_date)}` : "",
          aircraft.elt_due_date ? `E ${formatDate(aircraft.elt_due_date)}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        background: equipmentTone,
      },
      otherType: {
        text: assignment?.definition?.name ?? "",
        background: otherTone,
      },
      otherDue: { text: dueText, background: otherTone },
      otherRemaining: { text: remainingText, background: otherTone },
      hobbs: { text: formatNumber(meter) },
      toHundred: {
        text: formatNumber(hundredRemaining),
        background: toneForHours(hundredRemaining),
      },
      status: {
        text: statusText,
        background: statusBackground,
        color: statusColor,
        bold: status !== "available",
      },
    };
  });
}

function addPageNumbers(
  document: PDFDocument,
  fonts: PdfFonts,
  footerNote = ""
) {
  const pages = document.getPages();
  pages.forEach((page, index) => {
    if (footerNote) {
      page.drawText(
        fitText(footerNote, fonts.regular, 6.5, CONTENT_WIDTH - 70),
        {
          x: MARGIN,
          y: 12,
          size: 6.5,
          font: fonts.regular,
          color: MUTED,
        }
      );
    }
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(label, 7),
      y: 12,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    });
  });
}

async function createDocument(title: string) {
  const document = await PDFDocument.create();
  document.setTitle(title);
  document.setCreator("PilotSeal");
  const fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };
  return { document, fonts };
}

export async function buildInspectionFleetPdf(
  input: InspectionFleetReportInput
): Promise<Uint8Array> {
  const generatedAt = input.generatedAt ?? new Date();
  const { document, fonts } = await createDocument("MX - Next Inspections");
  let context = createPage(
    document,
    fonts,
    "MX - NEXT INSPECTIONS",
    input.organizationName,
    generatedAt
  );
  const groups = groupAircraft(input);

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const rows = group.aircraft.flatMap((aircraft) =>
      inspectionRowsForAircraft(aircraft, input.assignments, generatedAt)
    );
    const fullHeight = 20 + 22 + rows.length * 20 + 10;
    if (context.y - fullHeight < BOTTOM && context.y < PAGE_HEIGHT - 82) {
      context = createPage(
        document,
        fonts,
        "MX - NEXT INSPECTIONS",
        input.organizationName,
        generatedAt
      );
    }

    let rowIndex = 0;
    let continued = false;
    while (rowIndex < rows.length) {
      const availableRows = Math.max(
        1,
        Math.floor((context.y - BOTTOM - 20 - 22) / 20)
      );
      if (availableRows < 1 || context.y - 62 < BOTTOM) {
        context = createPage(
          document,
          fonts,
          "MX - NEXT INSPECTIONS",
          input.organizationName,
          generatedAt
        );
        continued = true;
        continue;
      }
      drawGroupHeader(
        context,
        group.modelName,
        GROUP_COLORS[groupIndex % GROUP_COLORS.length],
        continued
      );
      drawTableHeader(context, INSPECTION_COLUMNS);
      const chunk = rows.slice(rowIndex, rowIndex + availableRows);
      for (const row of chunk) {
        drawTableRow(
          context,
          INSPECTION_COLUMNS,
          row as unknown as Record<string, CellValue>
        );
      }
      rowIndex += chunk.length;
      context.y -= 10;
      if (rowIndex < rows.length) {
        context = createPage(
          document,
          fonts,
          "MX - NEXT INSPECTIONS",
          input.organizationName,
          generatedAt
        );
        continued = true;
      }
    }
  }

  if (groups.length === 0) {
    context.page.drawText("No aircraft records are available.", {
      x: MARGIN,
      y: context.y - 12,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
  }
  addPageNumbers(
    document,
    fonts,
    "Red: overdue or grounded. Yellow: due within 30 days or 5 hours. Status text remains authoritative."
  );
  return document.save();
}

export async function buildWeightBalanceFleetPdf(
  input: FleetReportInput
): Promise<Uint8Array> {
  const generatedAt = input.generatedAt ?? new Date();
  const { document, fonts } = await createDocument("Weight & Balance Records");
  let context = createPage(
    document,
    fonts,
    "WEIGHT & BALANCE RECORDS",
    input.organizationName,
    generatedAt
  );
  const groups = groupAircraft(input);

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const rows = group.aircraft.map((aircraft) => {
      const longMoment =
        aircraft.empty_weight != null && aircraft.empty_arm != null
          ? aircraft.empty_weight * aircraft.empty_arm
          : null;
      const latMoment =
        aircraft.empty_weight != null && aircraft.empty_lat_arm != null
          ? aircraft.empty_weight * aircraft.empty_lat_arm
          : null;
      return {
        tail: { text: aircraft.tail_number, bold: true },
        model: { text: group.modelName },
        emptyWeight: { text: formatNumber(aircraft.empty_weight, 2) },
        longArm: { text: formatNumber(aircraft.empty_arm, 2) },
        longMoment: { text: formatNumber(longMoment, 2) },
        latArm: { text: formatNumber(aircraft.empty_lat_arm, 2) },
        latMoment: { text: formatNumber(latMoment, 2) },
        updated: { text: formatDate(aircraft.updated_at) },
        expires: {
          text: formatDate(aircraft.registration_due_date),
          background: toneForDate(aircraft.registration_due_date, generatedAt),
        },
      } satisfies Record<string, CellValue>;
    });
    const fullHeight = 20 + 22 + rows.length * 22 + 10;
    if (context.y - fullHeight < BOTTOM && context.y < PAGE_HEIGHT - 82) {
      context = createPage(
        document,
        fonts,
        "WEIGHT & BALANCE RECORDS",
        input.organizationName,
        generatedAt
      );
    }

    let rowIndex = 0;
    let continued = false;
    while (rowIndex < rows.length) {
      const availableRows = Math.max(
        1,
        Math.floor((context.y - BOTTOM - 20 - 22) / 22)
      );
      drawGroupHeader(
        context,
        group.modelName,
        GROUP_COLORS[groupIndex % GROUP_COLORS.length],
        continued
      );
      drawTableHeader(context, WEIGHT_BALANCE_COLUMNS);
      const chunk = rows.slice(rowIndex, rowIndex + availableRows);
      for (const row of chunk) {
        drawTableRow(context, WEIGHT_BALANCE_COLUMNS, row, 22);
      }
      rowIndex += chunk.length;
      context.y -= 10;
      if (rowIndex < rows.length) {
        context = createPage(
          document,
          fonts,
          "WEIGHT & BALANCE RECORDS",
          input.organizationName,
          generatedAt
        );
        continued = true;
      }
    }
  }

  if (groups.length === 0) {
    context.page.drawText("No aircraft records are available.", {
      x: MARGIN,
      y: context.y - 12,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
  }
  addPageNumbers(document, fonts);
  return document.save();
}

function fileToken(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "organization"
  );
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes).buffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadInspectionFleetPdf(
  input: InspectionFleetReportInput
) {
  const generatedAt = input.generatedAt ?? new Date();
  const bytes = await buildInspectionFleetPdf({ ...input, generatedAt });
  downloadPdf(
    bytes,
    `${fileToken(input.organizationName)}-MX-next-inspections-${generatedAt
      .toISOString()
      .slice(0, 10)}.pdf`
  );
}

export async function downloadWeightBalanceFleetPdf(input: FleetReportInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const bytes = await buildWeightBalanceFleetPdf({ ...input, generatedAt });
  downloadPdf(
    bytes,
    `${fileToken(input.organizationName)}-weight-balance-records-${generatedAt
      .toISOString()
      .slice(0, 10)}.pdf`
  );
}
