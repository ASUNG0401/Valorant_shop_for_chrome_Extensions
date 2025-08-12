// Minimal wrapper that uses chrome.storage for tokens and requests store via Riot endpoints
const VShopAPI = (() => {
  async function getTokens() {
    return new Promise((resolve) => chrome.storage.local.get(['accessToken','entitlementToken'], (items)=> resolve(items)));
  }
  async function saveTokens(a,e){ return new Promise(r=>chrome.storage.local.set({accessToken:a, entitlementToken:e}, r)); }
  async function clearTokens(){ return new Promise(r=>chrome.storage.local.remove(['accessToken','entitlementToken'], r)); }

  async function fetchStore(region='na') {
    const t = await getTokens();
    if (!t.accessToken) throw new Error('no_access_token');
    const headers = { 'Authorization': t.accessToken.startsWith('Bearer')? t.accessToken : 'Bearer ' + t.accessToken, 'X-Riot-Entitlements-JWT': t.entitlementToken || '' };
    const url = `https://pd.${region}.a.pvp.net/store/v2/storefront`;
    const resp = await fetch(url, { headers, credentials: 'omit' });
    if (!resp.ok) throw new Error('riot_store_error:' + resp.status);
    return await resp.json();
  }

  return { getTokens, saveTokens, clearTokens, fetchStore };
})();