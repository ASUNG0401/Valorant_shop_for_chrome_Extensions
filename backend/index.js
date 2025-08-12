require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { saveOneTimeCode, getAndDelete } = require('./shared/oneTimeStore');

const app = express();
app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const FRONTEND_ALLOWED = process.env.FRONTEND_ALLOWED_ORIGIN || '*'; // set to chrome-extension://<id> in production
app.use(cors({ origin: FRONTEND_ALLOWED }));

const limiter = rateLimit({ windowMs: 60*1000, max: 30 });
app.use(limiter);

/**
 * Render a simple login page (username/password).
 * The form posts to /auth/submit which will call Riot's auth endpoint.
 */
app.get('/auth/login', (req, res) => {
  const html = `
  <!doctype html>
  <html>
    <head><meta charset="utf-8"><title>VShop Riot Login</title></head>
    <body>
      <h2>VShop — Riot Login (Dev Only)</h2>
      <p style="color:crimson;">Warning: Enter credentials only if you accept all risks. Do not use this for accounts with valuables.</p>
      <form method="post" action="/auth/submit">
        <label>Username (email or Riot ID):<br/><input name="username" required /></label><br/><br/>
        <label>Password:<br/><input name="password" type="password" required /></label><br/><br/>
        <input type="hidden" name="redirect" value="${req.query.redirect || ''}" />
        <button type="submit">Login</button>
      </form>
    </body>
  </html>`;
  res.setHeader('Content-Type','text/html');
  res.send(html);
});

/**
 * POST /auth/submit
 * Receives username/password from the form, calls Riot's (non-official) auth endpoint,
 * obtains access_token, then requests entitlements token. Creates a one-time code which
 * is posted back to the opener window in a small page.
 */
app.post('/auth/submit', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Missing credentials');

  try {
    // 1) Call Riot authorization endpoint to obtain access token
    // NOTE: This uses community-known Riot endpoints and payload shape. It may change anytime.
    const authUrl = 'https://auth.riotgames.com/api/v1/authorization';
    const authPayload = {
      "client_id":"play-valorant-web-prod",
      "nonce":"1",
      "redirect_uri":"https://playvalorant.com/opt_in",
      "response_type":"token id_token",
      "prompt":"none"
    };
    // First request to begin the auth flow
    const initResp = await axios.post(authUrl, authPayload, { headers: { 'Content-Type':'application/json' } });
    // Then perform credentials post (type: auth) with user credentials
    const credPayload = {
      type: "auth",
      username,
      password,
      remember: false
    };
    const credResp = await axios.put(authUrl, credPayload, { headers: { 'Content-Type':'application/json' }, maxRedirects: 0, validateStatus: s => s < 500 });
    // The response contains a 'response' object with parameters including an URI containing access_token in fragment.
    // Example: credResp.data.response.parameters.uri -> "https://playvalorant.com/opt_in#access_token=...&..."
    const respData = credResp.data || {};
    const uri = respData?.response?.parameters?.uri || '';
    // Extract access_token and id_token from URI fragment if present
    const tokens = {};
    if (uri && uri.includes('#')) {
      const frag = uri.split('#')[1];
      const params = new URLSearchParams(frag);
      tokens.access_token = params.get('access_token');
      tokens.id_token = params.get('id_token');
      tokens.expires_in = params.get('expires_in');
    }

    // 2) Obtain entitlements token
    let entitlements_token = null;
    if (tokens.access_token) {
      const entResp = await axios.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      entitlements_token = entResp.data?.entitlements_token || entResp.data?.token || null;
    }

    // 3) Obtain user info (to get puuid)
    let puuid = null;
    if (tokens.access_token) {
      const uiResp = await axios.post('https://auth.riotgames.com/userinfo', null, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      puuid = uiResp.data?.sub || uiResp.data?.puuid || null;
    }

    // Put together payload
    const payload = {
      access_token: tokens.access_token || null,
      id_token: tokens.id_token || null,
      entitlements_token: entitlements_token,
      puuid: puuid
    };

    // Create one-time-code and save payload in memory for short TTL
    const oneTimeCode = uuidv4();
    saveOneTimeCode(oneTimeCode, payload, 5*60*1000);

    // Return a page that posts the oneTimeCode to window.opener and closes
    const html = `
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><title>Auth Complete</title></head>
        <body>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'vshop_auth', code: '${oneTimeCode}' }, '*');
              }
            } catch (e) { console.error(e); }
            document.body.innerHTML = '<p>Auth complete. You can close this window.</p>';
            setTimeout(() => { window.close(); }, 1500);
          </script>
        </body>
      </html>`;
    res.setHeader('Content-Type','text/html');
    res.send(html);

  } catch (err) {
    console.error('auth error', err?.response?.data || err.message);
    res.status(500).send('<p>Authentication failed. Check credentials and server logs.</p><p><a href="/auth/login">Back</a></p>');
  }
});

// Token exchange endpoint used by extension: /token?code=ONE_TIME_CODE
app.get('/token', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: 'missing_code' });
  const payload = getAndDelete(code);
  if (!payload) return res.status(404).json({ error: 'code_not_found_or_expired' });
  return res.json(payload);
});

// Basic index route
app.get('/', (req, res) => res.send('VShop Riot non-official auth backend (dev mode)'));

// Start HTTPS server (requires cert/selfsigned.key and cert/selfsigned.crt in ./cert)
const PORT = process.env.PORT || 3000;
const certDir = path.join(__dirname, 'cert');
const keyPath = path.join(certDir, 'selfsigned.key');
const crtPath = path.join(certDir, 'selfsigned.crt');
if (fs.existsSync(keyPath) && fs.existsSync(crtPath)) {
  const https = require('https');
  const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath) };
  https.createServer(options, app).listen(PORT, () => console.log('HTTPS server running on https://localhost:' + PORT));
} else {
  app.listen(PORT, () => console.log('HTTP server running on http://localhost:' + PORT + ' (use HTTPS for extension in Chrome)'));
}
