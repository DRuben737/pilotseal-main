const WEATHER_USAGES = ["METAR", "TAF", "METAR/TAF", "NWS"];
const GENERAL_USAGES = ["GEN", "ATC", "ICAO"];

export function getGlossaryUsages(activeCategory) {
  if (activeCategory === "Weather") return WEATHER_USAGES;
  if (activeCategory === "General") return GENERAL_USAGES;
  return [...WEATHER_USAGES, ...GENERAL_USAGES];
}

export function decodeGlossary(input, activeCategory, glossaryData) {
  const words = input.toUpperCase().trim().split(/\s+/).filter(Boolean);
  const allowedUsages = getGlossaryUsages(activeCategory);

  const matches = glossaryData.filter(
    (item) =>
      allowedUsages.includes(item.usage) &&
      words.includes(item.contraction.toUpperCase())
  );

  const contractionMap = {};
  matches.forEach((item) => {
    contractionMap[item.contraction.toUpperCase()] = `${item.contraction} (${item.definition})`;
  });

  return {
    words,
    matches,
    naturalLanguageResult: words
      .map((word) => contractionMap[word] ?? word)
      .join(" "),
  };
}
