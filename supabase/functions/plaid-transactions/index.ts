// Fetches recent transactions for a linked Plaid item.
// Defaults to the last 30 days if no date range is supplied.
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

// PLAID_ENV controls which Plaid host to call. Default sandbox.
// Valid values: sandbox | production
function plaidHost() {
  const env = (Deno.env.get("PLAID_ENV") || "sandbox").toLowerCase();
  return "https://" + env + ".plaid.com";
}

function isoDate(d) {
  return d.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { accessToken, startDate, endDate } = await req.json();
    if (!accessToken) throw new Error("Missing accessToken");

    const clientId = Deno.env.get("PLAID_CLIENT_ID");
    const secret = Deno.env.get("PLAID_SECRET");
    if (!clientId) throw new Error("PLAID_CLIENT_ID not set");
    if (!secret) throw new Error("PLAID_SECRET not set");

    const today = new Date();
    const dayMs = 86400000;
    const start = startDate || isoDate(new Date(today.getTime() - 30 * dayMs));
    const end = endDate || isoDate(today);

    const r = await fetch(plaidHost() + "/transactions/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret: secret,
        access_token: accessToken,
        start_date: start,
        end_date: end,
        options: { count: 250 },
      }),
    });

    const body = await r.text();
    if (!r.ok) {
      console.error("plaid transactions", r.status, body);
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
