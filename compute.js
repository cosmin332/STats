/* Portage JS de analyze.py — parse activities.csv (export Strava FR) et calcule
   toutes les statistiques course à pied. Même forme de sortie que dashboard/data.json. */
(function () {
  'use strict';

  const MONTHS = { 'janv.': 1, 'févr.': 2, 'mars': 3, 'avr.': 4, 'mai': 5, 'juin': 6, 'juil.': 7,
    'août': 8, 'sept.': 9, 'oct.': 10, 'nov.': 11, 'déc.': 12, 'janvier': 1, 'février': 2,
    'avril': 4, 'juillet': 7, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12 };

  // Objectifs hebdo issus de goals.csv : 5 km/sem jusqu'au 2 sept. 2025, puis 15 km/sem
  const GOALS = [{ until: new Date(2025, 8, 2), km: 5 }, { until: null, km: 15 }];
  const PROFILE = { name: 'Cosmin Patrau', weight: 70, city: 'Ixelles, Belgique' };

  function parseCSV(text) {
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
        else if (c !== '\r') field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parseDate(s) {
    const m = /^(\d+)\s+(\S+)\s+(\d{4}),\s+(\d+):(\d+):(\d+)/.exec((s || '').trim());
    if (!m || !(m[2] in MONTHS)) return null;
    return new Date(+m[3], MONTHS[m[2]] - 1, +m[1], +m[4], +m[5], +m[6]);
  }

  function f(v) {
    if (v === null || v === undefined || v === '') return null;
    const x = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(x) ? null : x;
  }

  const norm = s => s.replace(/[’']/g, "'"); // apostrophes typographiques
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dow = d => (d.getDay() + 6) % 7;     // 0 = lundi, comme Python weekday()
  const doy = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const round = (x, n = 0) => { const p = 10 ** n; return Math.round(x * p) / p; };

  function fmtPace(p) {
    if (p === null || p === undefined) return null;
    let m = Math.floor(p), s = Math.round((p - m) * 60);
    if (s === 60) { m++; s = 0; }
    return `${m}:${pad(s)}`;
  }
  function fmtTime(sec) {
    sec = Math.floor(sec);
    return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec % 3600 / 60))}:${pad(sec % 60)}`;
  }

  function computeData(csvText) {
    const rows = parseCSV(csvText);
    const header = rows[0].map(norm), data = rows.slice(1);
    const idxs = name => header.reduce((a, h, i) => (h === name && a.push(i), a), []);
    const col = name => header.indexOf(name);
    const I = {
      id: 0, date: 1, name: 2, type: 3,
      gear: col("Matériel utilisé pour l'activité"),
      elapsed: idxs('Temps écoulé')[1], moving: col('Durée de déplacement'),
      dist_m: idxs('Distance')[1], vmax: col('Vitesse max.'), vavg: col('Vitesse moyenne'),
      dplus: col('Dénivelé positif'), dminus: col('Dénivelé négatif'),
      cad_max: col('Cadence max.'), cad_avg: col('Cadence moyenne'),
      hr_max: idxs('Fréquence cardiaque max.')[1], hr_avg: col('Fréquence cardiaque moyenne'),
      cal: col('Calories'), rel_effort: idxs('Effort relatif')[1],
      temp: col('Température selon les prévisions météo'), humidity: col('Humidité'),
      wind: col('Vitesse du vent'), meteo: col('Conditions météo'),
      steps: col('Nombre total de pas'), load: col("Charge d'entraînement"),
      intensity: col('Intensité'), gap_speed: col('Vitesse moyenne ajustée selon la pente'),
    };
    if (I.dist_m === undefined || I.moving < 0) throw new Error('Format CSV non reconnu — est-ce bien le fichier activities.csv de l\'export Strava (en français) ?');

    const acts = [];
    for (const r of data) {
      if (r.length < 90) continue;
      const dt = parseDate(r[I.date]);
      if (!dt) continue;
      acts.push({
        id: r[I.id], date: dt, name: r[I.name], type: r[I.type],
        gear: r[I.gear] || null,
        elapsed: f(r[I.elapsed]), moving: f(r[I.moving]), dist: f(r[I.dist_m]),
        vavg: f(r[I.vavg]), vmax: f(r[I.vmax]),
        dplus: f(r[I.dplus]), dminus: f(r[I.dminus]),
        cad: f(r[I.cad_avg]), cad_max: f(r[I.cad_max]),
        hr: f(r[I.hr_avg]), hr_max: f(r[I.hr_max]),
        cal: f(r[I.cal]), effort: f(r[I.rel_effort]),
        temp: f(r[I.temp]), humidity: f(r[I.humidity]),
        wind: f(r[I.wind]), meteo: r[I.meteo] || null,
        steps: f(r[I.steps]), load: f(r[I.load]),
        intensity: f(r[I.intensity]), gap_speed: f(r[I.gap_speed]),
      });
    }
    acts.sort((a, b) => a.date - b.date);
    const runs = acts.filter(a => a.type === 'Course à pied' && a.dist && a.moving);
    if (!runs.length) throw new Error('Aucune course à pied trouvée dans ce fichier.');

    const pace = a => (a.moving / 60) / (a.dist / 1000);

    // ---- Stats globales ----
    const totDist = runs.reduce((s, a) => s + a.dist, 0) / 1000;
    const totTime = runs.reduce((s, a) => s + a.moving, 0);
    const hrs = runs.filter(a => a.hr).map(a => a.hr);
    const cads = runs.filter(a => a.cad).map(a => a.cad);
    const spanDays = Math.floor((runs[runs.length - 1].date - runs[0].date) / 86400000);
    const g = {
      n_runs: runs.length,
      total_km: round(totDist, 1),
      total_time_h: round(totTime / 3600, 1),
      total_dplus: Math.round(runs.reduce((s, a) => s + (a.dplus || 0), 0)),
      total_cal: Math.round(runs.reduce((s, a) => s + (a.cal || 0), 0)),
      total_steps: Math.round(runs.reduce((s, a) => s + (a.steps || 0), 0)),
      avg_dist: round(totDist / runs.length, 2),
      avg_pace: fmtPace(totTime / 60 / totDist),
      avg_pace_val: round(totTime / 60 / totDist, 2),
      median_pace: fmtPace(median(runs.map(pace))),
      avg_hr: hrs.length ? round(mean(hrs), 1) : null,
      avg_cad: cads.length ? Math.round(mean(cads) * 2) : null,
      first_run: ymd(runs[0].date),
      last_run: ymd(runs[runs.length - 1].date),
      span_days: spanDays,
    };
    g.runs_per_week = round(runs.length / (spanDays / 7), 2);
    g.km_per_week = round(totDist / (spanDays / 7), 1);

    // ---- Records ----
    const best = (seq, key, rev) => seq.length ? [...seq].sort((a, b) => rev ? key(b) - key(a) : key(a) - key(b))[0] : null;
    const actinfo = (a, extra) => a ? Object.assign({
      date: `${pad(a.date.getDate())}/${pad(a.date.getMonth() + 1)}/${a.date.getFullYear()}`,
      name: a.name, dist: round(a.dist / 1000, 2), pace: fmtPace(pace(a)), time: fmtTime(a.moving),
    }, extra || {}) : null;
    const longest = best(runs, a => a.dist, true);
    const fastest3 = best(runs.filter(a => a.dist >= 3000), pace);
    const fastest5 = best(runs.filter(a => a.dist >= 5000), a => a.moving / a.dist);
    const fastest10 = best(runs.filter(a => a.dist >= 10000), a => a.moving / a.dist);
    const climb = best(runs.filter(a => a.dplus), a => a.dplus, true);
    const maxHr = best(runs.filter(a => a.hr_max), a => a.hr_max, true);
    const maxEff = best(runs.filter(a => a.effort), a => a.effort, true);
    const records = {
      longest: actinfo(longest), fastest_3k: actinfo(fastest3),
      fastest_5k_plus: actinfo(fastest5), fastest_10k_plus: actinfo(fastest10),
      biggest_climb: climb ? actinfo(climb, { dplus: Math.round(climb.dplus) }) : null,
      max_hr: maxHr ? actinfo(maxHr, { hr_max: maxHr.hr_max }) : null,
      max_effort: maxEff ? actinfo(maxEff, { effort: maxEff.effort }) : null,
      max_speed: round(Math.max(...runs.filter(a => a.vmax).map(a => a.vmax)) * 3.6, 1),
    };

    // ---- Duel : meilleure course longue (>= 19,5 km) par année ----
    const longRaces = {};
    for (const a of runs.filter(a => a.dist >= 19500)) {
      const y = a.date.getFullYear();
      if (!longRaces[y] || a.moving / a.dist < longRaces[y].moving / longRaces[y].dist) longRaces[y] = a;
    }
    const duelYears = Object.keys(longRaces).sort();
    let duel = null;
    if (duelYears.length >= 2) {
      const [y1, y2] = duelYears.slice(-2);
      const a1 = longRaces[y1], a2 = longRaces[y2];
      duel = {
        prev: Object.assign(actinfo(a1), { year: +y1 }),
        last: Object.assign(actinfo(a2), { year: +y2 }),
        delta_s: Math.round(a1.moving - a2.moving),
        delta_pace_s: Math.round((pace(a1) - pace(a2)) * 60),
      };
    }

    // ---- Mensuel ----
    const monthly = {};
    for (const a of runs) {
      const k = `${a.date.getFullYear()}-${pad(a.date.getMonth() + 1)}`;
      const m = monthly[k] || (monthly[k] = { km: 0, n: 0, time: 0, dplus: 0, hr: [], t: 0, d: 0 });
      m.km += a.dist / 1000; m.n++; m.time += a.moving; m.dplus += a.dplus || 0;
      if (a.hr) m.hr.push(a.hr);
      m.t += a.moving; m.d += a.dist;
    }
    const monthlyOut = Object.keys(monthly).sort().map(k => {
      const m = monthly[k], p = m.t / 60 / (m.d / 1000);
      return { month: k, km: round(m.km, 1), n: m.n, hours: round(m.time / 3600, 1),
        dplus: Math.round(m.dplus), pace: round(p, 2), pace_str: fmtPace(p),
        hr: m.hr.length ? round(mean(m.hr), 1) : null };
    });

    // ---- Hebdomadaire ----
    const weekly = {};
    for (const a of runs) {
      const mon = new Date(a.date); mon.setDate(mon.getDate() - dow(a.date));
      const k = ymd(mon);
      const w = weekly[k] || (weekly[k] = { km: 0, n: 0 });
      w.km += a.dist / 1000; w.n++;
    }
    const allWeeks = [];
    const w0 = new Date(runs[0].date); w0.setDate(w0.getDate() - dow(w0)); w0.setHours(0, 0, 0, 0);
    for (let w = new Date(w0); w <= runs[runs.length - 1].date; w.setDate(w.getDate() + 7)) {
      const k = ymd(w);
      const goal = GOALS.find(gl => !gl.until || w < gl.until).km;
      allWeeks.push({ week: k, km: round((weekly[k] || {}).km || 0, 1), n: (weekly[k] || {}).n || 0, goal });
    }
    let bestStreak = 0, tmp = 0, curStreak = 0;
    for (const wk of allWeeks) { tmp = wk.n > 0 ? tmp + 1 : 0; bestStreak = Math.max(bestStreak, tmp); }
    for (let i = allWeeks.length - 1; i >= 0 && allWeeks[i].n > 0; i--) curStreak++;
    g.best_week_streak = bestStreak;
    g.current_week_streak = curStreak;
    g.goal_hit_rate = Math.round(100 * allWeeks.filter(w => w.km >= w.goal).length / allWeeks.length);
    const bw = allWeeks.reduce((a, b) => b.km > a.km ? b : a);
    g.best_week = { week: bw.week, km: bw.km };

    // ---- Annuel ----
    const yearly = {};
    for (const a of runs) {
      const y = yearly[a.date.getFullYear()] || (yearly[a.date.getFullYear()] = { km: 0, n: 0, time: 0, dplus: 0 });
      y.km += a.dist / 1000; y.n++; y.time += a.moving; y.dplus += a.dplus || 0;
    }
    const yearlyOut = Object.keys(yearly).sort().map(k => {
      const v = yearly[k];
      return { year: +k, km: round(v.km, 1), n: v.n, hours: round(v.time / 3600, 1),
        dplus: Math.round(v.dplus), pace_str: fmtPace(v.time / 60 / v.km) };
    });

    // ---- Liste des courses ----
    const runList = runs.map(a => ({
      date: ymd(a.date), ts: `${ymd(a.date)}T${pad(a.date.getHours())}:${pad(a.date.getMinutes())}`,
      name: a.name, km: round(a.dist / 1000, 2),
      pace: round(pace(a), 3), pace_str: fmtPace(pace(a)),
      hr: a.hr, hr_max: a.hr_max, cad: a.cad ? Math.round(a.cad * 2) : null,
      dplus: a.dplus ? Math.round(a.dplus) : 0, effort: a.effort,
      temp: a.temp, humidity: a.humidity !== null ? Math.round(a.humidity * 100) : null,
      meteo: a.meteo, cal: a.cal, time: fmtTime(a.moving), load: a.load, gear: a.gear,
      hour: a.date.getHours(), dow: dow(a.date),
    }));

    // ---- Histogramme distances ----
    const bins = [0, 3, 5, 7, 10, 15, 21, 100], labels = ['<3', '3-5', '5-7', '7-10', '10-15', '15-21', '21+'];
    const hist = labels.map(() => 0);
    for (const a of runs) {
      const km = a.dist / 1000;
      for (let i = 0; i < labels.length; i++) if (km >= bins[i] && km < bins[i + 1]) { hist[i]++; break; }
    }

    // ---- Heatmap / habitudes ----
    const dowHour = {}, dowCounts = Array(7).fill(0), hourCounts = Array(24).fill(0);
    for (const a of runs) {
      dowHour[`${dow(a.date)}-${a.date.getHours()}`] = (dowHour[`${dow(a.date)}-${a.date.getHours()}`] || 0) + 1;
      dowCounts[dow(a.date)]++; hourCounts[a.date.getHours()]++;
    }

    // ---- Chaussures ----
    const gearMap = {};
    for (const a of runs) {
      const k = a.gear || 'Sans matériel';
      const v = gearMap[k] || (gearMap[k] = { km: 0, n: 0, time: 0 });
      v.km += a.dist / 1000; v.n++; v.time += a.moving;
    }
    const gearOut = Object.entries(gearMap).map(([name, v]) =>
      ({ name, km: round(v.km, 1), n: v.n, hours: round(v.time / 3600, 1) })).sort((a, b) => b.km - a.km);

    // ---- Météo ----
    const meteoCounts = {};
    for (const a of runs) if (a.meteo) meteoCounts[a.meteo] = (meteoCounts[a.meteo] || 0) + 1;
    const tempPace = runs.filter(a => a.temp !== null).map(a =>
      ({ temp: a.temp, pace: round(pace(a), 3), km: round(a.dist / 1000, 1) }));

    // ---- Zones FC ----
    const fcMax = Math.max(...runs.filter(a => a.hr_max).map(a => a.hr_max));
    const zones = { 'Z1 <60%': 0, 'Z2 60-70%': 0, 'Z3 70-80%': 0, 'Z4 80-90%': 0, 'Z5 90%+': 0 };
    for (const a of runs) {
      if (!a.hr) continue;
      const p = a.hr / fcMax;
      const z = p < .6 ? 'Z1 <60%' : p < .7 ? 'Z2 60-70%' : p < .8 ? 'Z3 70-80%' : p < .9 ? 'Z4 80-90%' : 'Z5 90%+';
      zones[z] += a.moving;
    }
    const zonesOut = {};
    for (const k in zones) zonesOut[k] = round(zones[k] / 3600, 1);

    // ---- Autres sports ----
    const other = {};
    for (const a of acts) {
      const o = other[a.type] || (other[a.type] = { n: 0, time: 0, km: 0, cal: 0 });
      o.n++; o.time += a.moving || a.elapsed || 0; o.km += (a.dist || 0) / 1000; o.cal += a.cal || 0;
    }
    const otherOut = Object.entries(other).map(([type, v]) =>
      ({ type, n: v.n, hours: round(v.time / 3600, 1), km: round(v.km, 1), cal: Math.round(v.cal) }))
      .sort((a, b) => b.n - a.n);

    // ---- Progression allure (MA 10, >= 3 km) ----
    const flat = runs.filter(a => a.dist >= 3000);
    const prog = flat.map((a, i) => {
      const win = flat.slice(Math.max(0, i - 9), i + 1);
      const t = win.reduce((s, x) => s + x.moving, 0), d = win.reduce((s, x) => s + x.dist, 0);
      return { date: ymd(a.date), pace: round(pace(a), 3), ma: round(t / 60 / (d / 1000), 3) };
    });

    // ---- Cumul annuel ----
    const cum = {}, ytot = {};
    for (const a of runs) {
      const y = a.date.getFullYear();
      ytot[y] = (ytot[y] || 0) + a.dist / 1000;
      (cum[y] = cum[y] || []).push({ doy: doy(a.date), km: round(ytot[y], 1) });
    }

    // ---- Forme CTL/ATL/TSB ----
    const dayLoad = {};
    for (const a of acts) if (a.effort) {
      const k = ymd(a.date);
      dayLoad[k] = (dayLoad[k] || 0) + a.effort;
    }
    const fitness = [];
    const loadKeys = Object.keys(dayLoad).sort();
    if (loadKeys.length) {
      let ctl = 0, atl = 0;
      const d1 = new Date(loadKeys[loadKeys.length - 1]);
      for (let d = new Date(loadKeys[0]); d <= d1; d.setDate(d.getDate() + 1)) {
        const L = dayLoad[ymd(d)] || 0;
        ctl += (L - ctl) / 42; atl += (L - atl) / 7;
        fitness.push({ date: ymd(d), ctl: round(ctl, 1), atl: round(atl, 1), tsb: round(ctl - atl, 1) });
      }
    }

    const now = new Date();
    return {
      profile: PROFILE,
      generated: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
      global: g, records, duel, monthly: monthlyOut, weekly: allWeeks, yearly: yearlyOut,
      runs: runList, hist: { labels, values: hist }, dow: dowCounts, hours: hourCounts,
      dow_hour: dowHour, gear: gearOut, meteo: meteoCounts, temp_pace: tempPace,
      zones: zonesOut, fc_max: fcMax, other: otherOut, progression: prog,
      cumulative: Object.fromEntries(Object.keys(cum).sort().map(y => [String(y), cum[y]])),
      fitness,
    };
  }

  (typeof window !== 'undefined' ? window : globalThis).computeData = computeData;
})();
