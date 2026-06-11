/* Connexion à l'API Strava : OAuth (authorization code + refresh), récupération
   des activités (/athlete/activities) et du matériel (/gear), cache en localStorage. */
(function () {
  'use strict';

  const LS = { tok: 'strava_tokens', acts: 'strava_acts', actsDate: 'strava_acts_date',
    cfg: 'strava_cfg', gear: 'strava_gear' };
  const API = 'https://www.strava.com/api/v3';

  const get = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch (e) { return fb; } };

  function cfg() {
    const base = (typeof window !== 'undefined' && window.STRAVA_CONFIG) || {};
    const o = get(LS.cfg, {});
    return { client_id: o.client_id || base.client_id || '',
             client_secret: o.client_secret || base.client_secret || '' };
  }

  async function tokenRequest(params) {
    const r = await fetch(API + '/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error('OAuth Strava : HTTP ' + r.status + ' — vérifie le Client ID/Secret.');
    return r.json();
  }

  async function ensureToken() {
    const t = get(LS.tok, null);
    if (!t) return null;
    if (t.expires_at * 1000 - Date.now() > 5 * 60e3) return t.access_token;
    const c = cfg();
    const j = await tokenRequest({ client_id: c.client_id, client_secret: c.client_secret,
      grant_type: 'refresh_token', refresh_token: t.refresh_token });
    localStorage.setItem(LS.tok, JSON.stringify(j));
    return j.access_token;
  }

  async function api(path, tok) {
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + tok } });
    if (r.status === 401) throw new Error('Session Strava expirée — reconnecte-toi.');
    if (r.status === 429) throw new Error('Limite de requêtes Strava atteinte — réessaie dans 15 min.');
    if (!r.ok) throw new Error('API Strava : HTTP ' + r.status + ' sur ' + path);
    return r.json();
  }

  // Champs conservés du résumé d'activité (suffisant pour toutes les stats)
  const KEEP = ['id', 'name', 'sport_type', 'type', 'start_date_local', 'distance',
    'moving_time', 'elapsed_time', 'total_elevation_gain', 'average_speed', 'max_speed',
    'average_heartrate', 'max_heartrate', 'average_cadence', 'suffer_score', 'gear_id'];

  async function fetchAll(tok, status) {
    let page = 1; const all = [];
    for (;;) {
      status(`Récupération des activités… (${all.length})`);
      const batch = await api(`/athlete/activities?per_page=200&page=${page}`, tok);
      all.push(...batch);
      if (batch.length < 200 || page >= 30) break;
      page++;
    }
    return all.map(a => { const o = {}; for (const k of KEEP) o[k] = a[k]; return o; });
  }

  async function gearNames(tok, acts, status) {
    const cached = get(LS.gear, {});
    const ids = [...new Set(acts.map(a => a.gear_id).filter(Boolean))].filter(id => !cached[id]);
    for (const id of ids) {
      status('Matériel… ' + id);
      try {
        const gr = await api('/gear/' + id, tok);
        cached[id] = [gr.brand_name, gr.model_name, gr.nickname || gr.name].filter(Boolean).join(' ');
      } catch (e) { cached[id] = id; }
    }
    localStorage.setItem(LS.gear, JSON.stringify(cached));
    return cached;
  }

  window.Strava = {
    config: cfg,
    saveConfig: o => localStorage.setItem(LS.cfg, JSON.stringify(o)),
    isConfigured: () => !!(cfg().client_id && cfg().client_secret),
    isConnected: () => !!get(LS.tok, null),
    hasCache: () => !!localStorage.getItem(LS.acts),
    cached: () => get(LS.acts, null),
    cachedGear: () => get(LS.gear, {}),
    cachedDate: () => localStorage.getItem(LS.actsDate) || '?',

    connect() {
      const c = cfg();
      const redirect = location.origin + location.pathname;
      location.href = 'https://www.strava.com/oauth/authorize'
        + '?client_id=' + encodeURIComponent(c.client_id)
        + '&redirect_uri=' + encodeURIComponent(redirect)
        + '&response_type=code&approval_prompt=auto&scope=activity:read_all';
    },

    // À appeler au chargement : true si on revient de l'autorisation Strava
    async handleRedirect() {
      const u = new URL(location.href);
      const code = u.searchParams.get('code');
      if (!code) return false;
      const c = cfg();
      const j = await tokenRequest({ client_id: c.client_id, client_secret: c.client_secret,
        grant_type: 'authorization_code', code });
      localStorage.setItem(LS.tok, JSON.stringify(j));
      ['code', 'scope', 'state'].forEach(k => u.searchParams.delete(k));
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : ''));
      return true;
    },

    async sync(status) {
      status = status || (() => {});
      const tok = await ensureToken();
      if (!tok) throw new Error('Non connecté à Strava.');
      const acts = await fetchAll(tok, status);
      const gear = await gearNames(tok, acts, status);
      localStorage.setItem(LS.acts, JSON.stringify(acts));
      localStorage.setItem(LS.actsDate, new Date().toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }));
      return { acts, gear };
    },

    disconnect() {
      [LS.tok, LS.acts, LS.actsDate].forEach(k => localStorage.removeItem(k));
    },
  };
})();
