import type { Brief, SavePayload } from "@web-autopsy/core";

export async function enhanceBriefWithAi(
  payload: SavePayload,
  heuristic: Brief,
): Promise<Brief> {
  try {
    if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
      return heuristic;
    }
    const { generateText } = await import("ai");
    const { gateway } = await import("@ai-sdk/gateway");

    const redactedCatalog = payload.portableApis.slice(0, 30).map((a) => ({
      name: a.humanName,
      purpose: a.purpose,
      method: a.method,
      path: (() => {
        try {
          return new URL(a.url).pathname;
        } catch {
          return a.url;
        }
      })(),
      status: a.status,
      replayClass: a.replayClass,
    }));

    const findings = payload.findings.slice(0, 40).map((f) => ({
      plain: f.plainTitle,
      severity: f.severity,
      area: f.area,
    }));

    const { text } = await generateText({
      model: gateway("openai/gpt-5.4"),
      prompt: `You write plain-English website health briefings for mixed teams (PMs + engineers).
Never invent secrets. Never suggest bypassing security.
Given this redacted capture, rewrite a short story (2 sentences max) about what the page is doing and its health.

Title: ${payload.title}
URL: ${payload.pageUrl}
Health: ${heuristic.health}
APIs: ${JSON.stringify(redactedCatalog)}
Findings: ${JSON.stringify(findings)}

Reply with ONLY the story paragraph.`,
    });

    if (text?.trim()) {
      return { ...heuristic, story: text.trim(), model: "openai/gpt-5.4" };
    }
  } catch (err) {
    console.warn("AI brief failed, using heuristics", err);
  }
  return heuristic;
}
