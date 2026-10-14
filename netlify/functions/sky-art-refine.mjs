import OpenAI from "openai";

const validPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);

export default async function skyArtRefine(request) {
  if (request.method !== "POST") return Response.json({ error: "POST required." }, { status: 405 });
  const body = await request.json().catch(() => null);
  const strokes = body?.strokes;
  if (!Array.isArray(strokes) || !strokes.length || strokes.length > 8 ||
    strokes.reduce((n, s) => n + (s.points?.length ?? 0), 0) > 300 ||
    typeof body.intent !== "string" || body.intent.length > 200 ||
    strokes.some((s) => typeof s.id !== "string" || !Array.isArray(s.points) ||
      s.points.length < 2 || s.points.some((p) => !validPoint(p))))
    return Response.json({ error: "Select up to 8 strokes and 300 points." }, { status: 400 });
  if (!process.env.OPENAI_BASE_URL || !process.env.OPENAI_API_KEY)
    return Response.json({ error: "AI refinement is unavailable here. Local refinement still works." }, { status: 503 });
  try {
    const client = new OpenAI();
    const result = await client.chat.completions.create({
      model: process.env.SKY_ART_AI_MODEL || "gpt-5-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only JSON {strokes:[{id,points:[{x,y}]}]}. Refine the hand-drawn lines subtly for legibility. Keep each stroke ID, point count, point order, and endpoints exactly. Preserve crossings, corners, and disconnected topology. Never return navigation data." },
        { role: "user", content: JSON.stringify({ intent: body.intent, strokes }) },
      ],
    });
    const output = JSON.parse(result.choices[0]?.message?.content ?? "null");
    if (!Array.isArray(output?.strokes) || output.strokes.length !== strokes.length)
      throw new Error("Invalid suggestion.");
    const checked = output.strokes.map((suggestion, i) => {
      const source = strokes[i];
      if (suggestion.id !== source.id || !Array.isArray(suggestion.points) ||
        suggestion.points.length !== source.points.length ||
        suggestion.points.some((p) => !validPoint(p))) throw new Error("Invalid suggestion.");
      const xs = source.points.map((p) => p.x), ys = source.points.map((p) => p.y);
      const limit = Math.max(3, Math.hypot(Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys)) * 0.15);
      if (suggestion.points.some((p, j) => Math.hypot(p.x - source.points[j].x,
        p.y - source.points[j].y) > limit) ||
        [0, source.points.length - 1].some((j) =>
          Math.hypot(suggestion.points[j].x - source.points[j].x,
            suggestion.points[j].y - source.points[j].y) > 1e-6))
        throw new Error("Suggestion changed the drawing too much.");
      return { id: source.id, points: suggestion.points };
    });
    return Response.json({ strokes: checked });
  } catch {
    return Response.json({ error: "Could not refine this sketch. Try local refinement." }, { status: 502 });
  }
}

export const config = {
  path: "/api/sky-art-refine",
  method: "POST",
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 10 },
};
