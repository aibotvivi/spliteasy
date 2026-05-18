// Exchanges a Plaid Link public_token (returned to the browser after the
// user successfully links a bank) for a permanent access_token, then
// fetches the linked accounts and the institution name in one round trip.
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

async function plaid(path, clientId, secret, body) {
  const r = await fetch("https://sandbox.plaid.com" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret: secret, ...body }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("Plaid " + path + " " + r.status + ": " + text.slice(0, 300));
  return JSON.parse(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { publicToken } = await req.json();
    if (!publicToken) throw new Error("Missing publicToken");

    const clientId = Deno.env.get("PLAID_CLIENT_ID");
    const secret = Deno.env.get("PLAID_SECRET");
    if (!clientId) throw new Error("PLAID_CLIENT_ID not set");
    if (!secret) throw new Error("PLAID_SECRET not set");

    // 1. Exchange public_token for access_token
    const exchange = await plaid(
      "/item/public_token/exchange",
      clientId,
      secret,
      { public_token: publicToken },
    );
    const accessToken = exchange.access_token;
    const itemId = exchange.item_id;

    // 2. Fetch accounts
    const accountsData = await plaid(
      "/accounts/get",
      clientId,
      secret,
      { access_token: accessToken },
    );

    // 3. Resolve institution name
    let institutionName = "Bank";
    try {
      const itemData = await plaid(
        "/item/get",
        clientId,
        secret,
        { access_token: accessToken },
      );
      const institutionId = itemData && itemData.item && itemData.item.institution_id;
      if (institutionId) {
        const instData = await plaid(
          "/institutions/get_by_id",
          clientId,
          secret,
          {
            institution_id: institutionId,
            country_codes: ["GB", "US"],
          },
        );
        institutionName = (instData && instData.institution && instData.institution.name) || institutionName;
      }
    } catch (e) {
      console.warn("institution lookup failed:", e && e.message);
    }

    return reply({
      accessToken,
      itemId,
      institutionName,
      accounts: accountsData.accounts || [],
    });
  } catch (e) {
    console.error("crash", e);
    const msg = (e && e.message) || String(e);
    return reply({ error: msg });
  }
});
