const backendBase = (localStorage.getItem('VSHOP_BACKEND') || 'https://localhost:3000').replace(/\/+$/, '');
const statusEl = document.getElementById('status');
const shopEl = document.getElementById('shop');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

function setStatus(s, isErr=false){
  statusEl.textContent = s;
  statusEl.style.color = isErr ? 'crimson' : '#666';
}

async function init(){
  try {
    const tokens = await VShopAPI.getTokens();
    if (tokens && tokens.accessToken) {
      setStatus('Logged in');
      logoutBtn.style.display = 'inline-block';
      loginBtn.style.display = 'none';
      await loadStore();
    } else {
      setStatus('Not logged');
      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'inline-block';
    }
  } catch (e) {
    console.error(e);
    setStatus('Init error', true);
  }
}

// Open backend login page in a new popup window
loginBtn.addEventListener('click', () => {
  const url = backendBase + '/auth/login';
  const w = window.open(url, 'vshop_login', 'width=600,height=700');
  if (!w) {
    setStatus('Popup blocked. Allow popups for this extension.', true);
    return;
  }
  setStatus('Login window opened — complete login there.');
});

// Listen for one-time-code posted from the backend login page
window.addEventListener('message', async (ev) => {
  try {
    const data = ev.data || {};
    if (data && data.type === 'vshop_auth' && data.code) {
      setStatus('Received auth code; fetching tokens...');
      const tokenUrl = backendBase + '/token?code=' + encodeURIComponent(data.code);
      const resp = await fetch(tokenUrl);
      if (!resp.ok) {
        const txt = await resp.text().catch(()=>null);
        throw new Error('Token endpoint error ' + resp.status + ' ' + (txt||''));
      }
      const payload = await resp.json();
      const access = payload.access_token || payload.accessToken || payload.access_token;
      const ent = payload.entitlements_token || payload.entitlements || payload.entitlements_token || payload.entitlementsToken || payload.entitlementsToken;
      if (!access) throw new Error('No access token in response');
      await VShopAPI.saveTokens(access, ent || '');
      setStatus('Logged in (tokens saved).');
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-block';
      await loadStore();
    }
  } catch (e) {
    console.error('message handler error', e);
    setStatus('Auth failed: ' + (e.message || e), true);
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  try {
    await VShopAPI.clearTokens();
    setStatus('Not logged');
    logoutBtn.style.display = 'none';
    loginBtn.style.display = 'inline-block';
    shopEl.innerHTML = '';
  } catch (e) {
    console.error(e);
    setStatus('Logout error', true);
  }
});

// Render store
async function loadStore(){
  shopEl.innerHTML = 'Loading store...';
  try {
    const store = await VShopAPI.fetchStore('na');
    // Try to render known shapes
    if (!store) { shopEl.innerHTML = 'No store data'; return; }
    if (store.offers && Array.isArray(store.offers)) {
      shopEl.innerHTML = '';
      store.offers.forEach(o => {
        const div = document.createElement('div');
        div.style.borderBottom = '1px solid #eee';
        div.style.padding = '6px 0';
        const title = document.createElement('div');
        title.textContent = o.name || o.displayName || o.title || 'Unknown';
        const price = document.createElement('div');
        price.textContent = o.cost ? String(o.cost) : (o.price || '');
        price.style.color='gray';
        div.appendChild(title);
        div.appendChild(price);
        shopEl.appendChild(div);
      });
      return;
    }
    if (store.SkinsPanelLayout && store.SkinsPanelLayout.SingleItemOffers) {
      const offers = store.SkinsPanelLayout.SingleItemOffers;
      const dataMap = store.SkinsPanelLayout?.SingleItemOffersData || {};
      shopEl.innerHTML = '';
      offers.forEach(id => {
        const merch = dataMap[id] || {};
        const div = document.createElement('div');
        div.style.borderBottom = '1px solid #eee';
        div.style.padding = '6px 0';
        const title = document.createElement('div');
        title.textContent = merch.displayName || 'Unknown';
        const price = document.createElement('div');
        price.textContent = (merch.cost && merch.cost[0]) ? (merch.cost[0].amount + ' VP') : '';
        price.style.color='gray';
        div.appendChild(title);
        div.appendChild(price);
        shopEl.appendChild(div);
      });
      return;
    }
    // fallback
    shopEl.innerHTML = '<pre style="white-space:pre-wrap;max-width:320px">' + JSON.stringify(store, null, 2) + '</pre>';
  } catch (e) {
    console.error(e);
    shopEl.innerHTML = '<div style="color:crimson">Failed to load store: ' + (e.message || e) + '</div>';
  }
}

init();
