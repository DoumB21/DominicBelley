// Clover "Alternate Launch Path" handler.
// Clover redirects merchants here (with a merchantId query param) when they:
//   - click Connect from their own Merchant Dashboard left navigation
//   - install/connect from the Clover App Market
//   - or when an external app (this one) initiates the OAuth flow
// Per Clover's docs, this endpoint must respond by initiating OAuth via /v2/authorize.
//
// Required environment variables (set in Vercel project settings):
//   CLOVER_CLIENT_ID
//   CLOVER_AUTHORIZE_BASE_URL   e.g. https://sandbox.dev.clover.com/oauth/v2

module.exports = async (req, res) => {
  const { merchantId, merchant_id, merchantID } = req.query;
  const resolvedMerchantId = merchantId || merchant_id || merchantID;

  const clientId = process.env.CLOVER_CLIENT_ID;
  const authorizeBaseUrl = process.env.CLOVER_AUTHORIZE_BASE_URL;

  if (!clientId || !authorizeBaseUrl) {
    res.setHeader("Cache-Control", "no-store");
    res
      .status(500)
      .send(
        "Server misconfiguration: CLOVER_CLIENT_ID and CLOVER_AUTHORIZE_BASE_URL must both be set in the Vercel project's environment variables."
      );
    return;
  }

  const target = new URL(`${authorizeBaseUrl}/authorize`);
  target.searchParams.set("client_id", clientId);
  if (resolvedMerchantId) {
    // Clover's own generated links use merchant_id (snake_case) - matching that here.
    target.searchParams.set("merchant_id", resolvedMerchantId);
  }

  res.setHeader("Cache-Control", "no-store");
  res.writeHead(307, { Location: target.toString() });
  res.end();
};
