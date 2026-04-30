import { getFlightCategory } from "./flightCategory";

const CLOUD_PREFIXES = ["FEW", "SCT", "BKN", "OVC", "VV"];
const PHENOMENA = {
  BR: "mist",
  FG: "fog",
  HZ: "haze",
  FU: "smoke",
  DU: "dust",
  SA: "sand",
  RA: "rain",
  DZ: "drizzle",
  SN: "snow",
  SG: "snow grains",
  IC: "ice crystals",
  PL: "ice pellets",
  GS: "small hail",
  GR: "hail",
  UP: "unknown precipitation",
  TS: "thunderstorm",
  SH: "showers",
  FZ: "freezing",
  VC: "in the vicinity",
};

function parseFraction(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(\d+)\/(\d+)$/);
  if (!match) return null;
  return Number(match[1]) / Number(match[2]);
}

function parseVisibility(tokens, startIndex) {
  const token = tokens[startIndex];
  if (!token) return null;

  if (/^\d+\s\d+\/\d+SM$/.test(token)) {
    const [whole, fraction] = token.replace("SM", "").split(" ");
    return {
      text: token,
      valueSm: Number(whole) + parseFraction(fraction),
      consumed: 1,
    };
  }

  if (/^\d+\/\d+SM$/.test(token)) {
    return {
      text: token,
      valueSm: parseFraction(token.replace("SM", "")),
      consumed: 1,
    };
  }

  if (/^\d+SM$/.test(token) || /^P?\d+SM$/.test(token)) {
    return {
      text: token,
      valueSm: Number(token.replace("P", "").replace("SM", "")),
      consumed: 1,
    };
  }

  if (/^\d+$/.test(token) && /^\d+\/\d+SM$/.test(tokens[startIndex + 1] || "")) {
    const fractionToken = tokens[startIndex + 1].replace("SM", "");
    return {
      text: `${token} ${tokens[startIndex + 1]}`,
      valueSm: Number(token) + parseFraction(fractionToken),
      consumed: 2,
    };
  }

  return null;
}

function parseCloudLayer(token) {
  const match = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
  if (!match) return null;
  const amountMap = {
    FEW: "few",
    SCT: "scattered",
    BKN: "broken",
    OVC: "overcast",
    VV: "vertical visibility",
  };
  return {
    code: match[1],
    amount: amountMap[match[1]],
    heightFt: Number(match[2]) * 100,
    qualifier: match[3] || null,
    raw: token,
  };
}

function describeWeatherToken(token) {
  let remaining = token;
  const pieces = [];

  if (remaining.startsWith("+")) {
    pieces.push("heavy");
    remaining = remaining.slice(1);
  } else if (remaining.startsWith("-")) {
    pieces.push("light");
    remaining = remaining.slice(1);
  }

  ["VC", "MI", "PR", "BC", "DR", "BL", "SH", "TS", "FZ"].forEach((prefix) => {
    if (remaining.startsWith(prefix)) {
      pieces.push(PHENOMENA[prefix] || prefix);
      remaining = remaining.slice(prefix.length);
    }
  });

  const chunks = remaining.match(/.{1,2}/g) || [];
  chunks.forEach((chunk) => {
    pieces.push(PHENOMENA[chunk] || chunk.toLowerCase());
  });

  return pieces.join(" ");
}

function detectHazards({ wind, weatherTokens, clouds }) {
  const hazards = [];

  if (wind?.gustKt) hazards.push(`Gusts ${wind.gustKt} kt`);
  if (weatherTokens.some((item) => item.raw.includes("TS"))) hazards.push("Thunderstorm");
  if (weatherTokens.some((item) => item.raw.includes("FZ"))) hazards.push("Freezing precipitation");
  if (weatherTokens.some((item) => item.raw.includes("SN"))) hazards.push("Snow");
  if (weatherTokens.some((item) => item.raw.includes("FG"))) hazards.push("Fog");
  if (clouds.some((layer) => layer.qualifier === "CB")) hazards.push("Cumulonimbus");

  return hazards;
}

export function parseMetar(rawInput) {
  const raw = rawInput.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const tokens = raw.split(" ");
  let index = 0;
  const reportType = ["METAR", "SPECI"].includes(tokens[0]) ? tokens[index++] : null;
  const station = /^[A-Z]{4}$/.test(tokens[index] || "") ? tokens[index++] : null;
  const time = /^\d{6}Z$/.test(tokens[index] || "") ? tokens[index++] : null;

  const windToken = tokens[index] || "";
  let wind = null;
  const windMatch = windToken.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/);
  if (windMatch) {
    wind = {
      raw: windToken,
      direction: windMatch[1],
      speedKt: Number(windMatch[2]),
      gustKt: windMatch[4] ? Number(windMatch[4]) : null,
    };
    index += 1;
  }

  const visibility = parseVisibility(tokens, index);
  if (visibility) index += visibility.consumed;

  const weatherTokens = [];
  while (
    tokens[index] &&
    !parseCloudLayer(tokens[index]) &&
    !/^(M?\d{2}\/M?\d{2})$/.test(tokens[index]) &&
    !/^(A\d{4}|Q\d{4})$/.test(tokens[index]) &&
    tokens[index] !== "RMK"
  ) {
    if (/^[\+\-A-Z]{2,}$/.test(tokens[index])) {
      weatherTokens.push({
        raw: tokens[index],
        text: describeWeatherToken(tokens[index]),
      });
    }
    index += 1;
  }

  const clouds = [];
  while (tokens[index] && parseCloudLayer(tokens[index])) {
    clouds.push(parseCloudLayer(tokens[index]));
    index += 1;
  }

  let temperature = null;
  let dewpoint = null;
  if (/^(M?\d{2})\/(M?\d{2})$/.test(tokens[index] || "")) {
    const match = tokens[index].match(/^(M?\d{2})\/(M?\d{2})$/);
    temperature = match[1].replace("M", "-");
    dewpoint = match[2].replace("M", "-");
    index += 1;
  }

  let altimeter = null;
  if (/^(A\d{4}|Q\d{4})$/.test(tokens[index] || "")) {
    altimeter = tokens[index];
    index += 1;
  }

  const remarksIndex = tokens.indexOf("RMK");
  const remarks =
    remarksIndex >= 0 ? tokens.slice(remarksIndex + 1).join(" ") : "";

  const ceilingCandidates = clouds
    .filter((layer) => ["BKN", "OVC", "VV"].includes(layer.code))
    .map((layer) => layer.heightFt);
  const ceilingFt = ceilingCandidates.length
    ? Math.min(...ceilingCandidates)
    : null;

  const visibilitySm = visibility?.valueSm ?? null;
  const flightCategory = getFlightCategory(visibilitySm, ceilingFt);

  return {
    kind: "metar",
    reportType,
    station,
    time,
    raw,
    wind,
    visibility,
    weather: weatherTokens,
    clouds,
    temperature,
    dewpoint,
    altimeter,
    remarks,
    ceilingFt,
    visibilitySm,
    flightCategory,
    hazards: detectHazards({ wind, weatherTokens, clouds }),
  };
}
