// Clover OAuth v2 redirect callback.
// Receives ?code=...&merchant_id=... from Clover, immediately exchanges the
// authorization code for tokens (oauth/v2/token), and displays the result
// for one-time manual copy into the console app's clover_tokens.json.
//
// Required environment variables (set in Vercel project settings):
//   CLOVER_CLIENT_ID
//   CLOVER_CLIENT_SECRET
//   CLOVER_TOKEN_BASE_URL   e.g. https://sandbox.dev.clover.com/oauth/v2

const STORE_NAMES = {
  // merchant_id: "Friendly store name"
  // Fill in once real Laferté merchant IDs are known.
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage({ title, bodyHtml, statusColor }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #1a1a1a; }
  h2 { color: ${statusColor || "#1a1a1a"}; }
  pre { background: #f4f4f4; border: 1px solid #ddd; border-radius: 6px; padding: 16px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  button { font-size: 14px; padding: 8px 16px; margin: 4px 8px 4px 0; cursor: pointer; border-radius: 6px; border: 1px solid #ccc; background: #fff; }
  button:hover { background: #f0f0f0; }
  .warn { color: #a15c00; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function errorPage(res, statusCode, message) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(statusCode).send(
    renderPage({
      title: "Clover OAuth — Error",
      statusColor: "#c00",
      bodyHtml: `
        <h2>Authorization failed</h2>
        <p>${escapeHtml(message)}</p>
        <p>Please retry the authorization process from the beginning.</p>
      `,
    })
  );
}

module.exports = async (req, res) => {
  const { code, merchant_id, merchantId } = req.query;
  const merchantIdValue = merchant_id || merchantId || "";

  if (!code) {
    return errorPage(res, 400, "No authorization code was received in the redirect.");
  }

  const clientId = process.env.CLOVER_CLIENT_ID;
  const clientSecret = process.env.CLOVER_CLIENT_SECRET;
  const tokenBaseUrl = process.env.CLOVER_TOKEN_BASE_URL;

  if (!clientId || !clientSecret || !tokenBaseUrl) {
    return errorPage(
      res,
      500,
      "Server misconfiguration: CLOVER_CLIENT_ID, CLOVER_CLIENT_SECRET, and CLOVER_TOKEN_BASE_URL must all be set in the Vercel project's environment variables."
    );
  }

  let tokenResponse;
  try {
    tokenResponse = await fetch(`${tokenBaseUrl}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });
  } catch (err) {
    return errorPage(res, 502, `Network error while contacting Clover: ${err.message}`);
  }

  const responseText = await tokenResponse.text();

  if (!tokenResponse.ok) {
    return errorPage(
      res,
      502,
      `Clover rejected the token exchange (${tokenResponse.status}): ${responseText}`
    );
  }

  let raw;
  try {
    raw = JSON.parse(responseText);
  } catch (err) {
    return errorPage(res, 502, "Clover returned an unexpected (non-JSON) response.");
  }

  if (!raw.access_token || !raw.access_token_expiration) {
    return errorPage(res, 502, "Clover's response was missing access_token or access_token_expiration.");
  }

  // Build the output in the exact shape the console app's clover_tokens.json expects.
  const tokenData = {
    access_token: raw.access_token,
    access_token_expiration: raw.access_token_expiration,
    refresh_token: raw.refresh_token,
    ...(raw.refresh_token_expiration ? { refresh_token_expiration: raw.refresh_token_expiration } : {}),
    expires_at: new Date(raw.access_token_expiration * 1000).toISOString(),
    ...(raw.refresh_token_expiration
      ? { refresh_expires_at: new Date(raw.refresh_token_expiration * 1000).toISOString() }
      : {}),
  };

  const tokenJsonPretty = JSON.stringify(tokenData, null, 2);
  const storeName = STORE_NAMES[merchantIdValue];
  const merchantLabel = storeName
    ? `${escapeHtml(storeName)} (Merchant ID: ${escapeHtml(merchantIdValue)})`
    : merchantIdValue
    ? `Merchant ID: ${escapeHtml(merchantIdValue)}`
    : "Merchant ID: (not provided by Clover)";

  const bodyHtml = `
    <h2>Authorization successful</h2>
    <p><b>${merchantLabel}</b></p>
    <p class="warn">This page will not be saved anywhere. Copy or download the tokens below now, then close this tab.</p>

    <pre id="tokenJson">${escapeHtml(tokenJsonPretty)}</pre>

    <button onclick="copyTokens()">Copy JSON</button>
    <button onclick="downloadTokens()">Download tokens file</button>
    <p id="copyStatus"></p>

    <script>
      const tokenJsonText = ${JSON.stringify(tokenJsonPretty)};
      const merchantId = ${JSON.stringify(merchantIdValue)};

      function copyTokens() {
        navigator.clipboard.writeText(tokenJsonText).then(() => {
          document.getElementById('copyStatus').textContent = 'Copied to clipboard.';
        });
      }

      function downloadTokens() {
        const blob = new Blob([tokenJsonText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = merchantId ? \`clover_tokens_\${merchantId}.json\` : 'clover_tokens.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    </script>
  `;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderPage({ title: "Clover OAuth — Success", statusColor: "#0a0", bodyHtml }));
};
