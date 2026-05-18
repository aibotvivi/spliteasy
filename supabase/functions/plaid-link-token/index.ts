// Creates a Plaid Link token so the client can launch the bank-linking
// flow. Sandbox environment only.
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("Missing userId");

    const clientId = Deno.env.get("PLAID_CLIENT_ID");
    const secret = Deno.env.get("PLAID_SECRET");
    if (!clientId) throw new Error("PLAID_CLIENT_ID not set");
    if (!secret) throw new Error("PLAID_SECRET not set");

    // PLAID_ENV controls which Plaid host to call. Default sandbox.
    // Valid values: sandbox | production
    const env = (Deno.env.get("PLAID_ENV") || "sandbox").toLowerCase();
    const host = "https://" + env + ".plaid.com";

    const r = await fetch(
      host + "/link/token/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          secret: secret,
          client_name: "SplitEasy",
          user: { client_user_id: userId },
          products: ["transactions"],
          country_codes: ["GB", "US"],
          language: "en",
        }),
      },
    );

    const body = await r.text();
    if (!r.ok) {
      console.error("plaid link-token", r.status, body);
      return reply({
        error: "Plaid " + r.status + ": " + body.slice(0, 400),
      });
    }

    return reply(JSON.parse(body));
  } catch (e) {
    console.error("crash", e);
    const msg = (e && e.message) || String(e);
    return reply({ error: msg });
  }
});
