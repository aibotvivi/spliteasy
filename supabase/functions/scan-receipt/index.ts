import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
};

function reply(body) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const PROMPT = [
  "Extract this receipt and return ONLY a JSON object",
  "with keys: merchant, date (YYYY-MM-DD), currency",
  "(ISO 4217 code like GBP / USD / EUR), items (array",
  "of { description, amount }), subtotal, tax, tip,",
  "and total. Amounts to 2 decimal places. Use null",
  "when a value is unclear. Do not put subtotal, tax",
  "or tip lines inside items.",
].join(" ");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { image, currencyHint } = await req.json();
    if (!image) throw new Error("Missing image");

    const m = image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) throw new Error("Bad image format");

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("Missing ANTHROPIC_API_KEY");

    const hint = currencyHint || "GBP";
    const text = PROMPT + " Receipt is likely in " + hint + ".";

    const r = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: m[1],
                    data: m[2],
                  },
                },
                { type: "text", text },
              ],
            },
          ],
        }),
      },
    );

    const body = await r.text();
    if (!r.ok) {
      console.error("anthropic", r.status, body);
      return reply({
        error: "Anthropic " + r.status + ": " + body.slice(0, 400),
      });
    }

    const j = JSON.parse(body);
    const out = (j && j.content && j.content[0] && j.content[0].text) || "";
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) {
      return reply({
        error: "No JSON in response: " + out.slice(0, 300),
      });
    }
    return reply(JSON.parse(match[0]));
  } catch (e) {
    console.error("crash", e);
    const msg = (e && e.message) || String(e);
    return reply({ error: msg });
  }
});
