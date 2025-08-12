VShop — Riot non-official auth backend (DEV ONLY)

WARNING: This server posts user credentials to Riot's non-public endpoints. Use only for personal testing and at your own risk.

Quick start (local):
1. Install deps: npm install
2. Create certs (optional but recommended for browser extension testing):
   mkdir cert
   openssl req -nodes -new -x509 -keyout cert/selfsigned.key -out cert/selfsigned.crt -days 365
3. Start server: npm run dev
4. Open in browser: https://localhost:3000/auth/login  (allow insecure cert in browser for local testing)

Flow:
- /auth/login : form for credentials
- /auth/submit : submits credentials to Riot auth endpoints, obtains access_token & entitlements_token
- /token?code=... : exchange one-time code for tokens (used by extension)

Security notes:
- Do NOT use production accounts with valuables. This is for testing.
- Do not expose this server publicly without hardening.
- Consider deleting certs/keys after use.
