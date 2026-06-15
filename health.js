/* Source 3 : Apple Santé via l'app « Health Auto Export » (export JSON).
   Apporte la couche physiologique absente de Strava : VO₂max, VFC (HRV), FC de repos,
   sommeil, récupération cardiaque, et les dynamiques de course mesurées par l'Apple Watch
   (cadence réelle, temps de contact au sol, oscillation verticale, longueur de foulée, puissance).
   Tout est calculé dans le navigateur ; rien n'est envoyé sur un serveur. */
(function () {
  'use strict';

  const LS = { json: 'health_json', date: 'health_date' };
  const round = (x, n = 0) => { const p = 10 ** n; return Math.round(x * p) / p; };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const day = s => (s || '').slice(0, 10); // "2026-06-15 00:00:00 +0200" -> "2026-06-15"

  // ---------- Parsing ----------
  function parse(text) {
    const j = JSON.parse(text);
    const d = j && j.data;
    if (!d || !Array.isArray(d.metrics)) {
      throw new Error('Format Santé non reconnu — attendu : export JSON de « Health Auto Export ».');
    }
    const metrics = {};
    for (const m of d.metrics) metrics[m.name] = { units: m.units, data: m.data || [] };
    return { metrics, workouts: Array.isArray(d.workouts) ? d.workouts : [] };
  }

  // Série journalière triée : [{x:'YYYY-MM-DD', y:Number}]
  function ser(H, name, prec = 1) {
    const m = H.metrics[name];
    if (!m || !m.data.length) return [];
    const out = m.data
      .filter(p => p.qty !== null && p.qty !== undefined && p.date)
      .map(p => ({ x: day(p.date), y: round(p.qty, prec) }));
    out.sort((a, b) => a.x.localeCompare(b.x));
    return out;
  }

  // Résumé d'une série : dernière valeur, base (moyenne), min/max, tendance (récent vs ancien).
  function summarize(s, opts) {
    opts = opts || {};
    if (!s.length) return null;
    const ys = s.map(p => p.y);
    const n = ys.length;
    const third = Math.max(1, Math.floor(n / 3));
    const early = mean(ys.slice(0, third)), recent = mean(ys.slice(-third));
    const delta = recent - early;
    // direction « bonne » : pour FC repos, GCT, oscillation → baisse = mieux (lowerBetter)
    const improving = opts.lowerBetter ? delta < 0 : delta > 0;
    return {
      latest: s[s.length - 1].y, latestDate: s[s.length - 1].x,
      first: s[0].y, mean: round(mean(ys), 1), min: Math.min(...ys), max: Math.max(...ys),
      n, delta: round(delta, 2), deltaPct: early ? round(100 * delta / Math.abs(early), 1) : 0,
      improving, lowerBetter: !!opts.lowerBetter,
    };
  }

  // ---------- Sommeil ----------
  function sleepSeries(H) {
    const m = H.metrics['sleep_analysis'];
    if (!m || !m.data.length) return [];
    const out = m.data.map(p => {
      const date = day(p.inBedEnd || p.sleepStart || p.date);
      const deep = +p.deep || 0, core = +p.core || 0, rem = +p.rem || 0, awake = +p.awake || 0;
      const total = +p.totalSleep || (deep + core + rem);
      return { x: date, deep: round(deep, 2), core: round(core, 2), rem: round(rem, 2),
        awake: round(awake, 2), total: round(total, 2) };
    }).filter(p => p.x && p.total > 0);
    out.sort((a, b) => a.x.localeCompare(b.x));
    return out;
  }

  // ---------- Readiness (VFC + FC de repos vs ligne de base personnelle) ----------
  function readiness(hrv, rhr) {
    if (hrv.length < 5) return null;
    const hMean = mean(hrv.map(p => p.y)), hSd = std(hrv.map(p => p.y)) || 1;
    const rMap = new Map(rhr.map(p => [p.x, p.y]));
    const rMean = rhr.length ? mean(rhr.map(p => p.y)) : null, rSd = (rhr.length ? std(rhr.map(p => p.y)) : 0) || 1;
    let lastRhr = null;
    const series = [];
    for (const p of hrv) {
      const r = rMap.has(p.x) ? rMap.get(p.x) : lastRhr;
      if (rMap.has(p.x)) lastRhr = rMap.get(p.x);
      // VFC haute = bon ; FC repos basse = bon. Score 0–100 centré sur 60.
      const zHrv = (p.y - hMean) / hSd;
      const zRhr = (r !== null && rMean !== null) ? (rMean - r) / rSd : 0;
      const weight = (r !== null && rMean !== null) ? 1 : 1.6; // si pas de FC repos, on appuie plus sur la VFC
      let score = 60 + 11 * weight * (zHrv * 0.6 + zRhr * 0.4);
      score = Math.max(15, Math.min(100, Math.round(score)));
      series.push({ x: p.x, y: score, hrv: p.y, rhr: r });
    }
    const latest = series[series.length - 1];
    const lvl = latest.y >= 75 ? { l: 'Frais', c: '#54f283', i: '🟢' }
      : latest.y >= 60 ? { l: 'Bon', c: '#22d3ee', i: '🔵' }
        : latest.y >= 45 ? { l: 'Correct', c: '#ffd166', i: '🟡' }
          : latest.y >= 32 ? { l: 'Fatigué', c: '#ff9f43', i: '🟠' }
            : { l: 'Récupération nécessaire', c: '#ff4d6d', i: '🔴' };
    return { series, latest: latest.y, label: lvl.l, color: lvl.c, icon: lvl.i,
      hrv: latest.hrv, rhr: latest.rhr };
  }

  // ---------- Cadence mesurée par séance (workouts Apple Watch) ----------
  const isRunW = w => /course|run/i.test(w.name || '');
  function runCadence(H) {
    const out = [];
    for (const w of H.workouts) {
      if (!isRunW(w)) continue;
      const cad = w.stepCadence && w.stepCadence.qty;
      if (!cad) continue;
      out.push({
        x: day(w.start), spm: round(cad, 0),
        km: round((w.distance && w.distance.qty) || 0, 2),
        pace: w.speed && w.speed.qty ? round(60 / w.speed.qty, 2) : null, // min/km depuis km/h
        hr: w.avgHeartRate && w.avgHeartRate.qty ? round(w.avgHeartRate.qty, 0) : null,
        name: w.name,
      });
    }
    out.sort((a, b) => a.x.localeCompare(b.x));
    return out;
  }

  // ---------- Calcul global ----------
  function compute(H) {
    const vo2 = ser(H, 'vo2_max', 1);
    const rhr = ser(H, 'resting_heart_rate', 0);
    const hrv = ser(H, 'heart_rate_variability', 0);
    const resp = ser(H, 'respiratory_rate', 1);
    const recov = ser(H, 'cardio_recovery', 0);
    const gct = ser(H, 'running_ground_contact_time', 0);
    const vosc = ser(H, 'running_vertical_oscillation', 1);
    const stride = ser(H, 'running_stride_length', 2);
    const power = ser(H, 'running_power', 0);
    const runspeed = ser(H, 'running_speed', 1);
    const sleep = sleepSeries(H);
    const cadence = runCadence(H);

    const sleepTotals = sleep.map(s => s.total);
    return {
      has: !!(vo2.length || hrv.length || rhr.length || sleep.length || gct.length),
      range: rangeOf([vo2, rhr, hrv, sleep.map(s => ({ x: s.x }))].flat()),
      vo2, rhr, hrv, resp, recov, gct, vosc, stride, power, runspeed, sleep, cadence,
      sum: {
        vo2: summarize(vo2), rhr: summarize(rhr, { lowerBetter: true }), hrv: summarize(hrv),
        gct: summarize(gct, { lowerBetter: true }), vosc: summarize(vosc, { lowerBetter: true }),
        stride: summarize(stride), power: summarize(power), recov: summarize(recov),
        cadence: summarize(cadence.map(c => ({ x: c.x, y: c.spm }))),
        sleep: sleepTotals.length ? {
          avg: round(mean(sleepTotals), 1), latest: sleepTotals[sleepTotals.length - 1],
          n: sleep.length,
          deepPct: round(100 * mean(sleep.map(s => s.deep)) / mean(sleepTotals), 0),
          remPct: round(100 * mean(sleep.map(s => s.rem)) / mean(sleepTotals), 0),
        } : null,
      },
      readiness: readiness(hrv, rhr),
    };
  }

  function rangeOf(pts) {
    const xs = pts.map(p => p.x).filter(Boolean).sort();
    return xs.length ? { from: xs[0], to: xs[xs.length - 1] } : null;
  }

  // ---------- Stockage ----------
  window.Health = {
    parse, compute,
    save(text) {
      parse(text); // valide avant de stocker
      localStorage.setItem(LS.json, text);
      localStorage.setItem(LS.date, new Date().toLocaleDateString('fr-BE'));
    },
    stored: () => localStorage.getItem(LS.json),
    storedDate: () => localStorage.getItem(LS.date) || '?',
    clear: () => { localStorage.removeItem(LS.json); localStorage.removeItem(LS.date); },
    // Parse + compute depuis le stockage, ou null si absent/illisible
    load() {
      const t = localStorage.getItem(LS.json);
      if (!t) return null;
      try { return compute(parse(t)); } catch (e) { return null; }
    },
  };
})();
