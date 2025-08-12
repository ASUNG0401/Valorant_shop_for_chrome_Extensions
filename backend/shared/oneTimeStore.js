/**
 * Simple in-memory one-time-code to token store.
 * Not persistent. For production use a database or encrypted store.
 */
const store = new Map();

function saveOneTimeCode(code, payload, ttlMs = 5*60*1000) {
  const expireAt = Date.now() + ttlMs;
  store.set(code, { payload, expireAt });
  setTimeout(() => { store.delete(code); }, ttlMs + 1000);
}

function getAndDelete(code) {
  const entry = store.get(code);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) { store.delete(code); return null; }
  store.delete(code);
  return entry.payload;
}

module.exports = { saveOneTimeCode, getAndDelete };
