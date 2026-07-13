import { compareFlightCategory, getFlightCategory } from "./flightCategory";

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
  NSW: "no significant weather",
};

function parseCloudLayer(token) {
  const match = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
  if (!match) return null;
  return {
    code: match[1],
    heightFt: Number(match[2]) * 100,
    qualifier: match[3] || null,
    raw: token,
  };
}

function parseVisibility(token) {
  if (!token) return null;
  if (/^\d+SM$/.test(token) || /^P?\d+SM$/.test(token)) {
    return {
      text: token,
      valueSm: Number(token.replace("P", "").replace("SM", "")),
    };
  }
  if (/^\d+\/\d+SM$/.test(token)) {
    const [num, den] = token.replace("SM", "").split("/");
    return {
      text: token,
      valueSm: Number(num) / Number(den),
    };
  }
  return null;
}

function describeWeatherToken(token) {
  if (token === "NSW") return "no significant weather";

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

function parseWind(token) {
  const match = (token || "").match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!match) return null;
  return {
    raw: token,
    direction: match[1],
    speedKt: Number(match[2]),
    gustKt: match[4] ? Number(match[4]) : null,
  };
}

function parseSegmentTokens(tokens) {
  const details = {
    wind: null,
    visibility: null,
    weather: [],
    clouds: [],
    windShear: null,
  };

  tokens.forEach((token) => {
    if (!details.wind && parseWind(token)) {
      details.wind = parseWind(token);
      return;
    }
    if (!details.visibility && parseVisibility(token)) {
      details.visibility = parseVisibility(token);
      return;
    }
    if (!details.windShear && /^WS\d{3}\/\d{5}KT$/.test(token)) {
      details.windShear = token;
      return;
    }
    if (parseCloudLayer(token)) {
      details.clouds.push(parseCloudLayer(token));
      return;
    }
    if (/^[A-Z\+\-]{2,}$/.test(token) && !token.includes("/")) {
      details.weather.push({
        raw: token,
        text: describeWeatherToken(token),
      });
    }
  });

  const ceilingCandidates = details.clouds
    .filter((layer) => ["BKN", "OVC", "VV"].includes(layer.code))
    .map((layer) => layer.heightFt);
  const ceilingFt = ceilingCandidates.length ? Math.min(...ceilingCandidates) : null;
  const visibilitySm = details.visibility?.valueSm ?? null;

  return {
    ...details,
    ceilingFt,
    visibilitySm,
    flightCategory: getFlightCategory(visibilitySm, ceilingFt),
  };
}

export function parseTaf(rawInput) {
  const raw = rawInput.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const tokens = raw.split(" ");
  let index = 0;
  const reportType = tokens[index] === "TAF" ? tokens[index++] : "TAF";
  const amendment =
    tokens[index] === "AMD" || tokens[index] === "COR" ? tokens[index++] : null;
  const station = /^[A-Z]{4}$/.test(tokens[index] || "") ? tokens[index++] : null;
  const issueTime = /^\d{6}Z$/.test(tokens[index] || "") ? tokens[index++] : null;
  const validPeriod =
    /^\d{4}\/\d{4}$/.test(tokens[index] || "") || /^\d{6}$/.test(tokens[index] || "")
      ? tokens[index++]
      : null;

  const segments = [];
  let current = {
    type: "BASE",
    label: "Initial",
    timeLabel: validPeriod,
    tokens: [],
  };

  while (index < tokens.length) {
    const token = tokens[index];

    if (/^FM\d{6}$/.test(token)) {
      segments.push(current);
      current = {
        type: "FM",
        label: "From",
        timeLabel: token,
        tokens: [],
      };
      index += 1;
      continue;
    }

    if (token === "TEMPO" || token === "BECMG") {
      segments.push(current);
      current = {
        type: token,
        label: token,
        timeLabel: tokens[index + 1] || null,
        tokens: [],
      };
      index +=
        /^\d{4}\/\d{4}$/.test(tokens[index + 1] || "") || /^\d{4}$/.test(tokens[index + 1] || "")
          ? 2
          : 1;
      continue;
    }

    if (/^PROB\d{2}$/.test(token)) {
      segments.push(current);
      let timeLabel = token;
      let step = 1;
      if (/^\d{4}\/\d{4}$/.test(tokens[index + 1] || "")) {
        timeLabel = `${token} ${tokens[index + 1]}`;
        step = 2;
      } else if (/^\d{4}$/.test(tokens[index + 1] || "")) {
        timeLabel = `${token} ${tokens[index + 1]}`;
        step = 2;
      } else if (tokens[index + 1] === "TEMPO" && /^\d{4}\/\d{4}$/.test(tokens[index + 2] || "")) {
        timeLabel = `${token} TEMPO ${tokens[index + 2]}`;
        step = 3;
      } else if (tokens[index + 1] === "TEMPO" && /^\d{4}$/.test(tokens[index + 2] || "")) {
        timeLabel = `${token} TEMPO ${tokens[index + 2]}`;
        step = 3;
      }
      current = {
        type: "PROB",
        label: token,
        timeLabel,
        tokens: [],
      };
      index += step;
      continue;
    }

    current.tokens.push(token);
    index += 1;
  }

  segments.push(current);

  const parsedSegments = segments
    .filter((segment) => segment.tokens.length > 0)
    .map((segment) => ({
      ...segment,
      ...parseSegmentTokens(segment.tokens),
    }));

  const categories = parsedSegments
    .map((segment) => segment.flightCategory)
    .filter(Boolean)
    .sort(compareFlightCategory);

  return {
    kind: "taf",
    reportType,
    amendment,
    station,
    issueTime,
    validPeriod,
    raw,
    worstCategory: categories[0] || null,
    segments: parsedSegments,
  };
}
