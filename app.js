/* UI du dashboard PWA : rendu des charts depuis l'objet calculé par compute.js.
   Sources de données (par priorité) : API Strava > CSV importé > activities.csv du dépôt. */
(function () {
  'use strict';

  const APP_VERSION = '15'; // affichée en pied de page — incrémenter à chaque déploiement

  // Palette cyberpunk : cyan = primaire, magenta = tendances/records, néon = succès
  const C = { orange: '#22d3ee', blue: '#ff2d95', green: '#54f283', yellow: '#ffd166',
    purple: '#a78bfa', red: '#ff4d6d', muted: '#7d8aa3', grid: 'rgba(255,255,255,.07)' };
  Chart.defaults.color = C.muted;
  Chart.defaults.borderColor = C.grid;
  Chart.defaults.font.family = '-apple-system, "Segoe UI", Roboto, sans-serif';

  const DOWS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const MONTHS_S = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const LS_CSV = 'strava_csv';
  const SHOE_LIFE_KM = 600;
  const $ = id => document.getElementById(id);
  const fmtPace = p => { let m = Math.floor(p), s = Math.round((p - m) * 60); if (s === 60) { m++; s = 0; } return m + ':' + String(s).padStart(2, '0'); };
  const nf = n => Number(n).toLocaleString('fr-BE');
  const msg = t => { $('importMsg').textContent = t; };

  let charts = [];
  let lastD = null; // dernier objet de données rendu (pour rafraîchir les verdicts en direct)
  function mk(id, cfg) { charts.push(new Chart($(id), cfg)); }
  function showCard(id, show) {
    const card = $(id).closest('.card');
    if (card) card.style.display = show ? '' : 'none';
  }

  function render(D, source) {
    charts.forEach(c => c.destroy());
    charts = [];
    const g = D.global;
    D.health = healthComputed(); // 3ᵉ source Apple Santé (null si non importée)
    D.shield = shieldInfo();     // renforcement de la semaine — compte dans le score global
    lastD = D;

    $('subtitle').textContent = `${D.profile.name} · ${D.profile.city} · ${g.first_run.split('-')[0]} → ${g.last_run} · données ${source}, analysées le ${D.generated}`;
    $('lastRun').textContent = g.last_run;
    $('fcmax').textContent = D.fc_max ? Math.round(D.fc_max) : '—';
    $('footer').textContent = `${D.runs.length} courses à pied · ${g.total_km} km — données Strava · app v${APP_VERSION}`;

    // ---- KPIs ----
    const kpis = [
      [g.total_km + ' km', 'Distance totale', ''],
      [g.n_runs, 'Courses', 'blue'],
      [g.total_time_h + ' h', 'Temps de course', 'green'],
      [g.avg_pace + ' /km', 'Allure moyenne', ''],
      [g.avg_hr ? Math.round(g.avg_hr) + ' bpm' : '—', 'FC moyenne', 'purple'],
      [nf(g.total_dplus) + ' m', 'Dénivelé positif', 'yellow'],
      [g.avg_dist + ' km', 'Distance moyenne / sortie', 'blue'],
      [g.km_per_week + ' km', 'Volume hebdo moyen', ''],
      [g.total_cal ? nf(g.total_cal) : '—', 'Calories brûlées', 'green'],
      [g.total_steps ? nf(g.total_steps) : '—', 'Pas en courant', 'purple'],
      [g.best_week_streak + ' sem.', 'Meilleure série hebdo', 'yellow'],
      [g.goal_hit_rate + ' %', 'Semaines objectif atteint', ''],
    ];
    $('kpis').innerHTML = kpis.map(k => `<div class="kpi"><div class="v ${k[2]}">${k[0]}</div><div class="l">${k[1]}</div></div>`).join('');

    // ---- Records ----
    const R = D.records;
    const recCards = [];
    if (R.longest) recCards.push(['📏', 'Sortie la plus longue', `<span class="big">${R.longest.dist} km</span> — ${R.longest.name}`, `${R.longest.date} · ${R.longest.time} · ${R.longest.pace}/km`]);
    if (R.fastest_3k) recCards.push(['⚡', 'Allure record (≥ 3 km)', `<span class="big">${R.fastest_3k.pace}/km</span> sur ${R.fastest_3k.dist} km`, `${R.fastest_3k.date} · ${R.fastest_3k.time}`]);
    if (R.fastest_5k_plus) recCards.push(['🔥', 'Meilleur ≥ 5 km', `<span class="big">${R.fastest_5k_plus.pace}/km</span> sur ${R.fastest_5k_plus.dist} km`, `${R.fastest_5k_plus.date} · ${R.fastest_5k_plus.time}`]);
    if (R.fastest_10k_plus) recCards.push(['🏅', 'Meilleur ≥ 10 km', `<span class="big">${R.fastest_10k_plus.pace}/km</span> sur ${R.fastest_10k_plus.dist} km`, `${R.fastest_10k_plus.date} · ${R.fastest_10k_plus.time}`]);
    if (R.biggest_climb) recCards.push(['🏔️', 'Plus gros dénivelé', `<span class="big">${R.biggest_climb.dplus} m D+</span> sur ${R.biggest_climb.dist} km`, `${R.biggest_climb.date} · ${R.biggest_climb.time}`]);
    if (R.max_hr) recCards.push(['❤️', 'FC max enregistrée', `<span class="big">${Math.round(R.max_hr.hr_max)} bpm</span> — ${R.max_hr.name}`, `${R.max_hr.date} · ${R.max_hr.dist} km à ${R.max_hr.pace}/km`]);
    $('records').innerHTML = recCards.map(r => `<div class="record"><div class="badge">${r[0]}</div><div class="t">${r[1]}</div><div class="d">${r[2]}<br>${r[3]}</div></div>`).join('');

    // ---- Duel ----
    if (D.duel) {
      const d = D.duel;
      const dm = Math.floor(Math.abs(d.delta_s) / 60), ds = Math.abs(d.delta_s) % 60;
      const faster = d.delta_s >= 0;
      $('duel').style.display = '';
      $('duel').innerHTML = `
        <h3>🎽 ${d.last.name} — ${d.prev.year} vs ${d.last.year}</h3>
        <div class="duel-row">
          <div class="duel-col"><div class="y">${d.prev.date} — « ${d.prev.name} »</div><div class="p">${d.prev.time} <span style="font-size:.9rem;color:var(--muted)">(${d.prev.pace}/km)</span></div></div>
          <div class="duel-col"><div class="y">${d.last.date} — « ${d.last.name} »</div><div class="p ${faster ? 'new' : ''}">${d.last.time} <span style="font-size:.9rem;color:var(--muted)">(${d.last.pace}/km)</span></div></div>
          <div class="delta" style="${faster ? '' : 'color:var(--yellow);background:rgba(255,209,102,.12)'}">${faster ? '−' : '+'}${dm} min ${String(ds).padStart(2, '0')} s · ${faster ? '−' : '+'}${Math.abs(d.delta_pace_s)} s/km ${faster ? '🚀' : ''}</div>
        </div>`;
    } else $('duel').style.display = 'none';

    // ---- Prédictions Riegel ----
    if (D.riegel && D.riegel.length) {
      $('riegelCard').style.display = '';
      const basis = D.riegel[0].basis;
      let sub2h = '';
      const p20 = D.riegel.find(r => r.dist === 20000);
      if (p20) {
        const gap = p20.time_s - 7200;
        sub2h = gap <= 0
          ? `<div class="note" style="color:var(--green)">🎉 Le sub-2h aux 20 km est dans tes cordes selon la prédiction (${p20.time_str}).</div>`
          : `<div class="note">Objectif <b>sub-2h aux 20 km</b> : la prédiction donne ${p20.time_str}, il manque ~${Math.round(gap / 60)} min (${Math.round(gap / 20)} s/km). Un bloc de volume + sorties longues devrait combler l'écart.</div>`;
      }
      $('riegelBody').innerHTML = `
        <div class="riegel-grid">` + D.riegel.map(r => `
          <div class="riegel-item"><div class="rg-d">${r.label}</div><div class="rg-t">${r.time_str}</div><div class="rg-p">${r.pace_str}/km</div></div>`).join('') + `
        </div>
        <div class="note">Formule de Riegel (T₂ = T₁ × (D₂/D₁)^1,06) à partir de ta meilleure perf : ${basis.dist} km en ${basis.time} (${basis.date}). Suppose un entraînement adapté à la distance visée.</div>
        ${sub2h}`;
    } else $('riegelCard').style.display = 'none';

    // ---- Projection annuelle ----
    if (D.projection) {
      const p = D.projection;
      const pct = p.prev_year_km ? Math.min(100, Math.round(100 * p.km_now / p.prev_year_km)) : 0;
      const vs = p.prev_year_km
        ? (p.km_proj >= p.prev_year_km
          ? `<span class="good">dépasserait ${p.year - 1} (${p.prev_year_km} km) 🚀</span>`
          : `<span class="warn">en-dessous de ${p.year - 1} (${p.prev_year_km} km)</span>`)
        : '';
      $('projBody').innerHTML = `
        <div class="proj-row">
          <div class="proj-col"><div class="pv">${p.km_now} km</div><div class="pl">parcourus en ${p.year}</div></div>
          <div class="proj-col"><div class="pv" style="color:var(--accent2)">≈ ${p.km_proj} km</div><div class="pl">projection fin ${p.year} ${vs}</div></div>
        </div>
        ${p.prev_year_km ? `<div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="note">${pct} % du total ${p.year - 1} déjà couvert (jour ${p.doy}/${p.days_in_year}).</div>` : ''}`;
    }

    // ---- Mensuel ----
    mk('cMonthly', { data: {
      labels: D.monthly.map(m => m.month),
      datasets: [
        { type: 'bar', label: 'km', data: D.monthly.map(m => m.km), backgroundColor: C.orange + 'cc', borderRadius: 5, yAxisID: 'y' },
        { type: 'line', label: 'allure (min/km)', data: D.monthly.map(m => m.pace), borderColor: C.blue, backgroundColor: C.blue, tension: .3, yAxisID: 'y2', spanGaps: true }
      ] },
      options: { maintainAspectRatio: false, scales: {
        y: { title: { display: true, text: 'km' } },
        y2: { position: 'right', reverse: true, grid: { drawOnChartArea: false }, ticks: { callback: fmtPace }, title: { display: true, text: 'allure' } }
      }, plugins: { tooltip: { callbacks: { label: ctx => ctx.dataset.type === 'line' ? 'allure : ' + fmtPace(ctx.parsed.y) + '/km' : ctx.parsed.y + ' km (' + D.monthly[ctx.dataIndex].n + ' sorties)' } } } }
    });

    // ---- Hebdo ----
    mk('cWeekly', { data: {
      labels: D.weekly.map(w => w.week),
      datasets: [
        { type: 'bar', label: 'km/semaine', data: D.weekly.map(w => w.km), backgroundColor: D.weekly.map(w => w.km >= w.goal ? C.green + 'cc' : C.orange + '99'), borderRadius: 2 },
        { type: 'line', label: 'objectif', data: D.weekly.map(w => w.goal), borderColor: C.yellow, borderDash: [6, 4], pointRadius: 0, stepped: true }
      ] },
      options: { maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: 'km' } } }, plugins: { legend: { display: true } } }
    });
    const hitWeeks = D.weekly.filter(w => w.km >= w.goal).length;
    $('weeklyNote').textContent = `Vert = objectif atteint (${hitWeeks}/${D.weekly.length} semaines, ${g.goal_hit_rate} %). Meilleure semaine : ${g.best_week.km} km (${g.best_week.week}). Plus longue série de semaines actives : ${g.best_week_streak}.`;

    // ---- Cumul annuel ----
    const years = Object.keys(D.cumulative);
    const yearCols = {};
    years.forEach((y, i) => yearCols[y] = [C.muted, C.blue, C.orange, C.green, C.purple][i % 5]);
    if (years.length > 1) { yearCols[years[years.length - 1]] = C.orange; yearCols[years[years.length - 2]] = C.blue; }
    mk('cCum', { type: 'line', data: { datasets: years.map(y => ({
        label: y, data: D.cumulative[y].map(p => ({ x: p.doy, y: p.km })),
        borderColor: yearCols[y], backgroundColor: yearCols[y], pointRadius: 0, borderWidth: 2.5, tension: .2
      })) },
      options: { maintainAspectRatio: false, scales: {
        x: { type: 'linear', min: 1, max: 366, ticks: { callback: v => MONTHS_S[Math.ceil(v / 30.5) - 1] || '', stepSize: 30.5 } },
        y: { title: { display: true, text: 'km cumulés' } }
      }, plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} : ${ctx.parsed.y} km (jour ${ctx.parsed.x})` } } } }
    });
    let cumNote = '', cumDiff = null;
    if (years.length > 1) {
      const yLast = years[years.length - 1], yPrev = years[years.length - 2];
      const cl = D.cumulative[yLast], cp = D.cumulative[yPrev];
      const lastDoy = cl[cl.length - 1].doy, kmL = cl[cl.length - 1].km;
      let kmP = 0; for (const p of cp) { if (p.doy <= lastDoy) kmP = p.km; else break; }
      cumDiff = { yLast, yPrev, kmL, kmP, diff: +(kmL - kmP).toFixed(1), lastDoy };
      cumNote = `À date égale (jour ${lastDoy}) : <b>${kmL} km en ${yLast}</b> contre ${kmP} km en ${yPrev} → ${cumDiff.diff >= 0 ? `<span style="color:${C.green}">+${cumDiff.diff} km d'avance</span>` : `<span style="color:${C.yellow}">${cumDiff.diff} km de retard</span>`} sur l'an dernier.`;
    }
    $('cumNote').innerHTML = cumNote;

    // ---- Courbe de forme ----
    showCard('cForm', D.fitness.length > 0);
    if (D.fitness.length) mk('cForm', { type: 'line', data: { datasets: [
        { label: 'Fitness (42j)', data: D.fitness.map(p => ({ x: p.date, y: p.ctl })), borderColor: C.blue, backgroundColor: C.blue + '22', pointRadius: 0, borderWidth: 2.5, fill: true, tension: .3 },
        { label: 'Fatigue (7j)', data: D.fitness.map(p => ({ x: p.date, y: p.atl })), borderColor: C.red, pointRadius: 0, borderWidth: 1.5, tension: .3 },
        { label: 'Fraîcheur', data: D.fitness.map(p => ({ x: p.date, y: p.tsb })), borderColor: C.green, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 4], tension: .3 }
      ] },
      options: { maintainAspectRatio: false, scales: {
        x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 14 } },
        y: { title: { display: true, text: 'charge (effort relatif/j)' } }
      }, plugins: { legend: { display: true } } }
    });

    // ---- ACWR ----
    const acwrPts = (D.acwr || []).filter(p => p.ratio !== null);
    showCard('cAcwr', acwrPts.length > 10);
    if (acwrPts.length > 10) {
      const cur = acwrPts[acwrPts.length - 1].ratio;
      mk('cAcwr', { type: 'line', data: { datasets: [
          { label: 'ACWR', data: acwrPts.map(p => ({ x: p.date, y: p.ratio })), borderColor: C.orange, pointRadius: 0, borderWidth: 2, tension: .3 },
          { label: 'zone optimale 0,8–1,3', data: acwrPts.map(p => ({ x: p.date, y: 1.3 })), borderColor: C.yellow + '99', borderDash: [4, 4], pointRadius: 0, borderWidth: 1, fill: { target: { value: 0.8 }, above: C.green + '11', below: 'transparent' } },
          { label: 'seuil risque 1,5', data: acwrPts.map(p => ({ x: p.date, y: 1.5 })), borderColor: C.red + '99', borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }
        ] },
        options: { maintainAspectRatio: false, scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 14 } },
          y: { min: 0, suggestedMax: 2, title: { display: true, text: 'charge 7 j / charge 28 j' } }
        }, plugins: { legend: { display: true }, tooltip: { filter: ctx => ctx.datasetIndex === 0 } } }
      });
      $('acwrNote').innerHTML = `ACWR actuel : <b style="color:${cur > 1.5 ? C.red : cur > 1.3 || cur < 0.8 ? C.yellow : C.green}">${cur}</b>. En-dessous de 0,8 : désentraînement ; 0,8–1,3 : progression sûre ; au-delà de 1,5 : risque de blessure élevé (montée de charge trop brutale).`;
    }

    // ---- Progression allure ----
    mk('cProg', { data: { datasets: [
        { type: 'scatter', label: 'sortie', data: D.progression.map(p => ({ x: p.date, y: p.pace })), backgroundColor: C.orange + '88', pointRadius: 3.5 },
        { type: 'line', label: 'moyenne mobile (10)', data: D.progression.map(p => ({ x: p.date, y: p.ma })), borderColor: C.blue, pointRadius: 0, tension: .35, borderWidth: 2.5 }
      ] },
      options: { maintainAspectRatio: false, scales: {
        x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 14 } },
        y: { reverse: true, ticks: { callback: fmtPace }, title: { display: true, text: 'min/km (↑ = plus rapide)' } }
      }, plugins: { tooltip: { callbacks: { label: ctx => fmtPace(ctx.parsed.y) + '/km' } } } }
    });

    // ---- Allure vs FC ----
    const hrRuns = D.runs.filter(r => r.hr);
    showCard('cPaceHr', hrRuns.length > 4);
    if (hrRuns.length > 4) mk('cPaceHr', { type: 'bubble', data: { datasets: [{
        label: 'course', data: hrRuns.map(r => ({ x: r.pace, y: r.hr, r: Math.sqrt(r.km) * 2.2, km: r.km, d: r.date })),
        backgroundColor: C.purple + '77', borderColor: C.purple
      }] },
      options: { maintainAspectRatio: false, scales: {
        x: { reverse: true, ticks: { callback: fmtPace }, title: { display: true, text: 'allure (→ plus rapide)' } },
        y: { title: { display: true, text: 'FC moyenne (bpm)' } }
      }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw.d} · ${ctx.raw.km} km · ${fmtPace(ctx.raw.x)}/km · ${Math.round(ctx.raw.y)} bpm` } } } }
    });

    // ---- Zones ----
    const zoneVals = Object.values(D.zones);
    showCard('cZones', zoneVals.some(v => v > 0));
    if (zoneVals.some(v => v > 0)) mk('cZones', { type: 'doughnut', data: {
      labels: Object.keys(D.zones),
      datasets: [{ data: zoneVals, backgroundColor: ['#22d3ee', '#54f283', '#ffd166', '#ff2d95', '#ff4d6d'], borderWidth: 0 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: ctx => ctx.label + ' : ' + ctx.parsed + ' h' } } } }
    });

    // ---- Efficacité aérobie ----
    const effM = D.monthly.filter(m => m.hr);
    showCard('cEff', effM.length > 2);
    if (effM.length > 2) mk('cEff', { data: { labels: effM.map(m => m.month), datasets: [
        { type: 'line', label: 'FC moy (bpm)', data: effM.map(m => m.hr), borderColor: C.red, tension: .3, yAxisID: 'y' },
        { type: 'line', label: 'allure', data: effM.map(m => m.pace), borderColor: C.blue, tension: .3, yAxisID: 'y2' }
      ] },
      options: { maintainAspectRatio: false, scales: {
        y: { title: { display: true, text: 'bpm' } },
        y2: { position: 'right', reverse: true, grid: { drawOnChartArea: false }, ticks: { callback: fmtPace } }
      }, plugins: { tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 1 ? 'allure : ' + fmtPace(ctx.parsed.y) + '/km' : 'FC : ' + ctx.parsed.y + ' bpm' } } } }
    });

    // ---- Cadence ----
    const cadRuns = D.runs.filter(r => r.cad);
    showCard('cCad', cadRuns.length > 4);
    if (cadRuns.length > 4) {
      const ma = cadRuns.map((r, i) => {
        const win = cadRuns.slice(Math.max(0, i - 9), i + 1);
        return { x: r.date, y: Math.round(win.reduce((s, x) => s + x.cad, 0) / win.length) };
      });
      mk('cCad', { data: { datasets: [
          { type: 'scatter', label: 'sortie',
            data: cadRuns.map(r => ({ x: r.date, y: r.cad, km: r.km, name: r.name, pace: r.pace_str, date: r.date })),
            backgroundColor: C.green + '88', pointRadius: 4, hoverRadius: 6 },
          { type: 'line', label: 'moyenne mobile (10)', data: ma, borderColor: C.blue, pointRadius: 0, tension: .35, borderWidth: 2.5 }
        ] },
        options: { maintainAspectRatio: false, interaction: { mode: 'nearest', intersect: false }, scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 14 } },
          y: { title: { display: true, text: 'pas/min' } }
        }, plugins: { tooltip: { callbacks: {
          title: ctx => ctx[0].dataset.type === 'scatter' || ctx[0].datasetIndex === 0 ? `${ctx[0].raw.name || ''}` : '',
          label: ctx => ctx.datasetIndex === 0
            ? [`${ctx.raw.date} · ${ctx.raw.km} km`, `allure ${ctx.raw.pace}/km`, `cadence ${ctx.parsed.y} pas/min`]
            : `moyenne mobile : ${ctx.parsed.y} pas/min`
        } } } }
      });
      $('cadNote').textContent = `Cadence moyenne : ${g.avg_cad} pas/min${g.cad_derived ? ' (estimée : nombre de pas ÷ durée, pas de capteur de cadence sur tes enregistrements)' : ''}. Repère usuel : 170–180 spm ; une cadence plus haute à allure égale réduit l'impact par foulée et l'overstriding.`;
    }

    // ---- Histogramme ----
    mk('cHist', { type: 'bar', data: { labels: D.hist.labels.map(l => l + ' km'),
      datasets: [{ data: D.hist.values, backgroundColor: C.blue + 'cc', borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'nb de sorties' } } } }
    });

    // ---- Jour de semaine ----
    mk('cDow', { type: 'bar', data: { labels: DOWS,
      datasets: [{ data: D.dow, backgroundColor: D.dow.map(v => v === Math.max(...D.dow) ? C.orange : C.orange + '77'), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'nb de sorties' } } } }
    });

    // ---- Calendrier 12 mois (style GitHub) ----
    (function () {
      const byDay = {};
      for (const r of D.runs) byDay[r.date] = (byDay[r.date] || 0) + r.km;
      const end = new Date(g.last_run);
      end.setDate(end.getDate() + (6 - (end.getDay() + 6) % 7)); // fin de semaine
      const start = new Date(end); start.setDate(start.getDate() - 7 * 53 + 1);
      const pad2 = n => String(n).padStart(2, '0');
      const key = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      let html = '', lastMonth = -1, monthLabels = [];
      const cells = [];
      for (let d = new Date(start), col = 0; d <= end; d.setDate(d.getDate() + 1)) {
        const km = byDay[key(d)] || 0;
        const lvl = km === 0 ? 0 : km < 4 ? 1 : km < 7 ? 2 : km < 11 ? 3 : 4;
        cells.push({ k: key(d), km, lvl });
        if ((d.getDay() + 6) % 7 === 0) { // lundi : nouvelle colonne
          if (d.getMonth() !== lastMonth) { monthLabels.push({ col, m: MONTHS_S[d.getMonth()] }); lastMonth = d.getMonth(); }
          col++;
        }
      }
      const COLS = Math.ceil(cells.length / 7);
      html += `<div class="cal-months" style="grid-template-columns:repeat(${COLS},1fr)">`;
      const mlMap = {};
      monthLabels.forEach(m => mlMap[m.col] = m.m);
      for (let c = 0; c < COLS; c++) html += `<div>${mlMap[c] || ''}</div>`;
      html += '</div><div class="cal-grid" style="grid-template-rows:repeat(7,1fr);grid-template-columns:repeat(' + COLS + ',1fr)">';
      cells.forEach((c, i) => {
        html += `<div class="cal-cell l${c.lvl}" style="grid-row:${i % 7 + 1};grid-column:${Math.floor(i / 7) + 1}" title="${c.k} : ${c.km ? c.km.toFixed(1) + ' km' : 'repos'}"></div>`;
      });
      html += '</div>';
      $('calendar').innerHTML = html;
      const activeDays = cells.filter(c => c.km > 0).length;
      $('calNote').textContent = `${activeDays} jours de course sur les 12 derniers mois. Intensité : blanc = repos, orange clair → foncé = <4, 4-7, 7-11, 11+ km.`;
    })();

    // ---- Heatmap jour × heure ----
    (function () {
      const hours = Array.from({ length: 18 }, (_, i) => i + 5);
      const maxV = Math.max(...Object.values(D.dow_hour), 1);
      let html = '<div></div>' + hours.map(h => `<div class="hlbl">${h}</div>`).join('');
      for (let d = 0; d < 7; d++) {
        html += `<div class="lbl">${DOWS[d]}</div>`;
        for (const h of hours) {
          const v = D.dow_hour[`${d}-${h}`] || 0;
          const op = v ? (0.25 + 0.75 * v / maxV) : 0;
          html += `<div class="cell" title="${DOWS[d]} ${h}h : ${v} sortie(s)" style="${v ? `background:rgba(252,82,0,${op})` : ''}"></div>`;
        }
      }
      $('heat').innerHTML = html;
    })();

    // ---- Température ----
    showCard('cTemp', D.temp_pace.length > 4);
    if (D.temp_pace.length > 4) mk('cTemp', { type: 'scatter', data: { datasets: [{
        data: D.temp_pace.map(t => ({ x: t.temp, y: t.pace, km: t.km })), backgroundColor: C.green + '88' }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x}°C · ${fmtPace(ctx.parsed.y)}/km · ${ctx.raw.km} km` } } },
        scales: { x: { title: { display: true, text: 'température (°C)' } }, y: { reverse: true, ticks: { callback: fmtPace }, title: { display: true, text: 'allure' } } } }
    });

    // ---- Chaussures : km + jauges d'usure ----
    mk('cGear', { type: 'bar', data: { labels: D.gear.map(s => s.name),
      datasets: [{ data: D.gear.map(s => s.km), backgroundColor: [C.muted + '88', C.blue + 'cc', C.orange + 'cc', C.green + 'cc', C.purple + 'cc'], borderRadius: 6 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} km · ${D.gear[ctx.dataIndex].n} sorties` } } },
        scales: { x: { title: { display: true, text: 'km' } } } }
    });
    const shoes = D.gear.filter(s => s.name !== 'Sans matériel');
    $('shoeBars').innerHTML = shoes.map(s => {
      const pct = Math.min(100, Math.round(100 * s.km / SHOE_LIFE_KM));
      const col = pct < 60 ? C.green : pct < 85 ? C.yellow : C.red;
      return `<div class="shoe"><div class="shoe-name">${s.name} <span class="shoe-km">${s.km} / ${SHOE_LIFE_KM} km</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
    }).join('') || '<div class="note">Aucune chaussure assignée.</div>';

    // ---- Jalons ----
    (function () {
      const badges = [];
      let cumKm = 0;
      const kmMilestones = [100, 250, 500, 750, 1000, 1500, 2000];
      const seen = new Set();
      for (const r of D.runs) {
        cumKm += r.km;
        for (const m of kmMilestones) if (cumKm >= m && !seen.has(m)) { seen.add(m); badges.push({ i: '🛣️', t: `${m} km cumulés`, s: r.date }); }
      }
      const nMilestones = [50, 100, 150, 200, 300].filter(n => D.runs.length >= n);
      if (nMilestones.length) badges.push({ i: '🔢', t: `${nMilestones[nMilestones.length - 1]}ᵉ course`, s: D.runs[nMilestones[nMilestones.length - 1] - 1].date });
      if (R.longest && R.longest.dist >= 20) badges.push({ i: '🎽', t: 'Distance 20 km+', s: `${R.longest.dist} km · ${R.longest.date}` });
      if (g.best_week_streak >= 10) badges.push({ i: '🔁', t: `${g.best_week_streak} semaines d'affilée`, s: 'régularité !' });
      if (g.best_week.km >= 30) badges.push({ i: '📦', t: `Semaine à ${g.best_week.km} km`, s: g.best_week.week });
      if (D.duel && D.duel.delta_s > 0) badges.push({ i: '⏱️', t: `${Math.floor(D.duel.delta_s / 60)} min gagnées`, s: `${D.duel.last.name} ${D.duel.prev.year}→${D.duel.last.year}` });
      $('badges').innerHTML = badges.map(b => `<div class="badge-card"><div class="bi">${b.i}</div><div><div class="bt">${b.t}</div><div class="bs">${b.s}</div></div></div>`).join('');
    })();

    // ---- Tables ----
    $('tYear').innerHTML =
      '<tr><th>Année</th><th class="num">Courses</th><th class="num">km</th><th class="num">Heures</th><th class="num">D+ (m)</th><th class="num">Allure moy.</th></tr>' +
      D.yearly.map(y => `<tr><td><b>${y.year}</b></td><td class="num">${y.n}</td><td class="num">${y.km}</td><td class="num">${y.hours}</td><td class="num">${y.dplus}</td><td class="num">${y.pace_str}/km</td></tr>`).join('');

    const ICONS = { 'Course à pied': '🏃', 'Entraînement aux poids': '🏋️', 'Vélo': '🚴', 'Marche': '🚶', 'Ski alpin': '⛷️', 'Randonnée': '🥾', 'Natation': '🏊', 'Yoga': '🧘' };
    $('tOther').innerHTML =
      '<tr><th>Sport</th><th class="num">Séances</th><th class="num">Heures</th><th class="num">km</th><th class="num">Calories</th></tr>' +
      D.other.map(o => `<tr><td>${ICONS[o.type] || '💪'} ${o.type}</td><td class="num">${o.n}</td><td class="num">${o.hours}</td><td class="num">${o.km || '—'}</td><td class="num">${o.cal ? nf(o.cal) : '—'}</td></tr>`).join('');

    const top10 = [...D.runs].sort((a, b) => b.km - a.km).slice(0, 10);
    $('tTop').innerHTML =
      '<tr><th>Date</th><th>Nom</th><th class="num">km</th><th class="num">Temps</th><th class="num">Allure</th><th class="num">FC moy</th><th class="num">D+</th></tr>' +
      top10.map(r => `<tr><td>${r.date}</td><td>${r.name}</td><td class="num"><b>${r.km}</b></td><td class="num">${r.time}</td><td class="num">${r.pace_str}/km</td><td class="num">${r.hr ? Math.round(r.hr) : '—'}</td><td class="num">${r.dplus}</td></tr>`).join('');

    // ---- Insights dynamiques ----
    const ins = [];
    if (D.duel && D.duel.delta_s > 0) {
      const d = D.duel, dm = Math.floor(d.delta_s / 60);
      ins.push(`<li><b>Progression sur course longue :</b> « ${d.last.name} » couru en <span class="good">${d.last.time} (${d.last.pace}/km)</span> contre ${d.prev.time} (${d.prev.pace}/km) en ${d.prev.year}, soit ~${dm} min et ${d.delta_pace_s} s/km gagnés.</li>`);
    }
    ins.push(`<li><b>Volume :</b> ${g.total_km} km en ${g.n_runs} sorties sur ${Math.round(g.span_days / 30.4)} mois (~${g.km_per_week} km/sem en moyenne, sortie type ${g.avg_dist} km à ${g.avg_pace}/km).</li>`);
    if (cumDiff) {
      ins.push(`<li><b>${cumDiff.yLast} vs ${cumDiff.yPrev} :</b> à date égale, ${cumDiff.kmL} km contre ${cumDiff.kmP} km → ${cumDiff.diff >= 0 ? `<span class="good">+${cumDiff.diff} km d'avance</span>` : `<span class="warn">${Math.abs(cumDiff.diff)} km de retard</span>`}. ${cumDiff.diff < 0 ? 'Lisser les creux de volume est le levier n°1 de progression.' : 'Continue comme ça !'}</li>`);
    }
    if (D.fitness.length) {
      const peak = D.fitness.reduce((a, b) => b.ctl > a.ctl ? b : a);
      const cur = D.fitness[D.fitness.length - 1];
      ins.push(`<li><b>Forme :</b> fitness actuelle ≈ ${cur.ctl} (pic historique ≈ ${peak.ctl} le ${peak.date}), fraîcheur ${cur.tsb >= 0 ? '+' : ''}${cur.tsb}. ${cur.ctl < peak.ctl / 2 ? '<span class="warn">Le fond est nettement sous le pic</span> — un bloc de volume progressif rouvrirait la marge.' : 'Bon niveau de fond par rapport à l\'historique.'}</li>`);
    }
    if (acwrPts.length) {
      const cur = acwrPts[acwrPts.length - 1].ratio;
      if (cur > 1.5) ins.push(`<li><b>Charge :</b> <span class="warn">ACWR à ${cur}</span> — montée de charge brutale, risque de blessure élevé. Réduis légèrement le volume cette semaine.</li>`);
      else if (cur < 0.8) ins.push(`<li><b>Charge :</b> ACWR à ${cur} — charge en baisse, tu peux augmenter le volume sans risque (idéalement +10 %/sem max).</li>`);
    }
    const z = D.zones, zEasy = (z['Z1 <60%'] || 0) + (z['Z2 60-70%'] || 0), zHard = (z['Z3 70-80%'] || 0) + (z['Z4 80-90%'] || 0) + (z['Z5 90%+'] || 0);
    if (g.avg_hr && D.fc_max) ins.push(`<li><b>Cardio :</b> FC moyenne ${Math.round(g.avg_hr)} bpm pour une FC max observée de ${Math.round(D.fc_max)} bpm (~${Math.round(100 * g.avg_hr / D.fc_max)} %). ${zEasy < zHard / 4 ? `<span class="warn">${zHard.toFixed(0)} h en zones 3+ contre ${zEasy.toFixed(1)} h en zones faciles</span> : la majorité des sorties sont « au tempo ». Plus de vraies sorties faciles (< 70 % FCmax) accélérerait la progression aérobie et réduirait le risque de blessure.` : 'Bonne répartition entre sorties faciles et soutenues.'}</li>`);
    const topDow = D.dow.indexOf(Math.max(...D.dow)), topHour = D.hours.indexOf(Math.max(...D.hours));
    ins.push(`<li><b>Habitudes :</b> jour favori le <b>${DOWS[topDow]}</b> (${D.dow[topDow]} sorties), départ le plus fréquent vers ${topHour} h. Objectif hebdo atteint ${g.goal_hit_rate} % des semaines ; meilleure série ${g.best_week_streak} semaines, série en cours ${g.current_week_streak}.</li>`);
    const wornShoe = shoes.find(s => s.km > SHOE_LIFE_KM * 0.85);
    if (wornShoe) ins.push(`<li><b>Matériel :</b> <span class="warn">${wornShoe.name} approche des ${SHOE_LIFE_KM} km</span> (${wornShoe.km} km) — pense au remplacement.</li>`);
    const weights = D.other.find(o => o.type === 'Entraînement aux poids');
    if (weights) ins.push(`<li><b>Renforcement :</b> ${weights.n} séances (≈ ${weights.hours} h) — excellent complément, à maintenir pendant les blocs de course.</li>`);

    // Croisement ACWR × bouclier anti-blessure
    const shield = shieldScore();
    if (acwrPts.length && shield !== null) {
      const cur = acwrPts[acwrPts.length - 1].ratio;
      if (cur > 1.3 && shield >= 80) ins.push(`<li><b>Charge × bouclier :</b> ACWR à <span class="warn">${cur}</span> mais bouclier de renforcement à <span class="good">${shield} %</span> — la structure tient, allège quand même légèrement la prochaine sortie.</li>`);
      else if (cur > 1.3 && shield < 50) ins.push(`<li><b>Charge × bouclier :</b> <span class="warn">ACWR à ${cur} ET bouclier à ${shield} %</span> — combinaison à risque pour genoux/tendons. Priorité aux routines de renforcement cette semaine.</li>`);
    }
    // Signature de cadence : corrélation cadence/allure
    const cp = D.runs.filter(r => r.cad && r.pace);
    if (cp.length > 15) {
      const mx = cp.reduce((s, r) => s + r.pace, 0) / cp.length, my = cp.reduce((s, r) => s + r.cad, 0) / cp.length;
      let num = 0, dx = 0, dy = 0;
      for (const r of cp) { num += (r.pace - mx) * (r.cad - my); dx += (r.pace - mx) ** 2; dy += (r.cad - my) ** 2; }
      const corr = dx && dy ? num / Math.sqrt(dx * dy) : 0;
      if (Math.abs(corr) < 0.3) ins.push(`<li><b>Signature de foulée :</b> ta cadence reste <span class="warn">scotchée autour de ${Math.round(my)} pas/min quelle que soit l'allure</span> — tu accélères en allongeant la foulée (sur-enjambement probable). Travail au métronome conseillé : +5 spm par palier.</li>`);
      else if (corr < -0.3) ins.push(`<li><b>Signature de foulée :</b> ta cadence monte bien quand l'allure accélère (corrélation saine) — continue à la tirer vers 170+ sur les sorties faciles aussi.</li>`);
    }

    $('insights').innerHTML = ins.map(x => `<div class="insight-card">${x.replace(/^<li>/, '').replace(/<\/li>$/, '')}</div>`).join('');

    renderExtras(D, acwrPts);
    renderHealth(D);
    applyVerdicts(D);
  }

  // ---------- Verdicts par graphique + score global ----------
  function applyVerdicts(D) {
    document.querySelectorAll('.verdict-line').forEach(e => e.remove());
    const V = window.computeVerdicts ? computeVerdicts(D) : {};
    for (const [id, vd] of Object.entries(V)) {
      if (id[0] === '_') continue;
      const el = $(id);
      const card = el && el.closest('.card');
      if (!card) continue;
      const line = document.createElement('div');
      line.className = 'verdict-line';
      line.style.borderLeftColor = vd.color;
      line.innerHTML = `<b style="color:${vd.color}">${vd.icon} ${vd.label}</b> — ${vd.text}`;
      const note = card.querySelector('.note');
      if (note) card.insertBefore(line, note); else card.appendChild(line);
    }
    renderOverall(V._overall);
  }

  function renderOverall(o) {
    const boxes = [$('overallMini'), $('overallBox')];
    if (!o) { boxes.forEach(b => b && (b.style.display = 'none')); return; }
    const html = `<div class="overall">
      <div class="ov-score" style="color:${o.color};text-shadow:0 0 18px ${o.color}66">${o.score}<span style="font-size:1rem;color:var(--muted);text-shadow:none">/100</span></div>
      <div><div class="ov-label" style="color:${o.color}">${o.icon} ${o.label}</div>
      <div class="ov-chips">⭐ ${o.cnt[4]} · 🟢 ${o.cnt[3]} · 🟡 ${o.cnt[2]} · 🟠 ${o.cnt[1]} · 🔴 ${o.cnt[0]}</div></div></div>`;
    boxes.forEach(b => { if (b) { b.style.display = ''; b.innerHTML = html + (b.id === 'overallBox'
      ? '<div class="note">Score = moyenne des notes de tous les graphiques évaluables, sur 100. Il évolue à chaque synchronisation. Le détail graphe par graphe est sous chaque visualisation des onglets.</div>' : ''); } });
  }

  // ---------- Extras : jauge objectif, dernière sortie, caps, matrice, jauge ACWR ----------
  function renderExtras(D, acwrPts) {
    const g = D.global;

    // Objectif adaptatif : semaine en cours vs moyenne des 3 précédentes + 10 % (plancher = objectif Strava)
    (function () {
      const w = D.weekly;
      if (w.length < 2) { $('goalBody').innerHTML = ''; return; }
      const cur = w[w.length - 1];
      const prev = w.slice(-4, -1);
      const avg = prev.length ? prev.reduce((s, x) => s + x.km, 0) / prev.length : 0;
      const target = Math.max(cur.goal, Math.round(avg * 1.1 * 10) / 10);
      const pct = Math.min(100, Math.round(100 * cur.km / Math.max(target, 0.1)));
      $('goalBody').innerHTML = `
        <div class="proj-row">
          <div class="proj-col"><div class="pv">${cur.km} km</div><div class="pl">cette semaine (${cur.n} sortie${cur.n > 1 ? 's' : ''})</div></div>
          <div class="proj-col"><div class="pv" style="color:var(--neon)">${target} km</div><div class="pl">cible adaptative (moy. 3 sem. ${avg.toFixed(1)} km + 10 %)</div></div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="note">${pct} % de la cible. ${pct >= 100 ? '<span class="good">Semaine validée 🎉</span>' : `Encore ${(target - cur.km).toFixed(1)} km.`}</div>`;
    })();

    // Dernière sortie + facteur d'impact météo
    (function () {
      const r = D.runs[D.runs.length - 1];
      if (!r) { $('lastRunCard').innerHTML = ''; return; }
      let meteo = '';
      if (r.temp !== null && r.temp !== undefined) {
        // pénalité chaleur : ~1,5 s/km par °C au-dessus de 15 °C (+0,5 si humidité > 60 %)
        const over = Math.max(0, r.temp - 15);
        const penalty = Math.round(over * (1.5 + (r.humidity && r.humidity > 60 ? 0.5 : 0)));
        if (penalty > 4) {
          const adj = r.pace - penalty / 60;
          meteo = `<div class="lastrun-line"><span>🌡️ ${r.temp} °C${r.humidity ? ' · ' + r.humidity + ' % hum.' : ''} → allure ajustée chaleur : <b>${fmtPace(adj)}/km</b> (−${penalty} s/km de pénalité estimée)</span></div>`;
        } else {
          meteo = `<div class="lastrun-line"><span>🌡️ ${r.temp} °C — conditions neutres, pas d'ajustement.</span></div>`;
        }
      }
      $('lastRunCard').innerHTML = `
        <h3>${r.name} <span style="color:var(--muted);font-weight:400;font-size:.8rem">· ${r.date}</span></h3>
        <div class="lastrun-line">
          <span>📏 <b>${r.km} km</b></span><span>⏱️ <b>${r.time}</b></span><span>⚡ <b>${r.pace_str}/km</b></span>
          ${r.hr ? `<span>❤️ <b>${Math.round(r.hr)} bpm</b></span>` : ''}
          ${r.cad ? `<span>👣 <b>${r.cad} spm</b></span>` : ''}
          ${r.dplus ? `<span>⛰️ <b>${r.dplus} m D+</b></span>` : ''}
        </div>${meteo}`;
    })();

    // Caps symboliques (sub-X) depuis les prédictions Riegel
    (function () {
      if (!D.riegel || !D.riegel.length) { $('capsBody').innerHTML = ''; return; }
      const CAPS = { 5000: [20, 22.5, 25, 27.5, 30], 10000: [40, 45, 50, 55, 60, 65],
        20000: [90, 100, 105, 110, 115, 120, 130], 21097.5: [95, 105, 110, 120, 125, 130, 140] };
      const caps = [];
      for (const r of D.riegel) {
        const pred = r.time_s / 60;
        const next = (CAPS[r.dist] || []).filter(c => c < pred).pop();
        if (next === undefined) continue;
        const gapSk = Math.round((r.time_s - next * 60) / (r.dist / 1000));
        caps.push(`<span class="cap">${r.label} : sub-${next >= 60 ? Math.floor(next / 60) + 'h' + String(next % 60).padStart(2, '0') : next + ' min'} → ${gapSk} s/km à gagner</span>`);
      }
      $('capsBody').innerHTML = caps.length ? `<div class="caps">${caps.join('')}</div>` : '';
    })();

    // Matrice cadence × allure (traque le sur-enjambement)
    (function () {
      const pts = D.runs.filter(r => r.cad && r.pace);
      showCard('cMatrix', pts.length > 9);
      if (pts.length <= 9) return;
      // régression linéaire cad = a*pace + b
      const mx = pts.reduce((s, r) => s + r.pace, 0) / pts.length, my = pts.reduce((s, r) => s + r.cad, 0) / pts.length;
      let num = 0, den = 0;
      for (const r of pts) { num += (r.pace - mx) * (r.cad - my); den += (r.pace - mx) ** 2; }
      const a = den ? num / den : 0, b = my - a * mx;
      const xs = pts.map(r => r.pace), x1 = Math.min(...xs), x2 = Math.max(...xs);
      mk('cMatrix', { data: { datasets: [
          { type: 'scatter', label: 'sortie',
            data: pts.map(r => ({ x: r.pace, y: r.cad, km: r.km, name: r.name, date: r.date, pace: r.pace_str })),
            backgroundColor: C.orange + '88', pointRadius: 4, hoverRadius: 6 },
          { type: 'line', label: 'tendance', data: [{ x: x1, y: a * x1 + b }, { x: x2, y: a * x2 + b }],
            borderColor: C.blue, borderDash: [6, 4], borderWidth: 2, pointRadius: 0 },
          { type: 'line', label: 'cible 170', data: [{ x: x1, y: 170 }, { x: x2, y: 170 }],
            borderColor: C.green + '88', borderDash: [3, 4], borderWidth: 1, pointRadius: 0 }
        ] },
        options: { maintainAspectRatio: false, interaction: { mode: 'nearest', intersect: false }, scales: {
          x: { reverse: true, ticks: { callback: fmtPace }, title: { display: true, text: 'allure (→ plus rapide)' } },
          y: { title: { display: true, text: 'pas/min' } }
        }, plugins: { tooltip: { callbacks: {
          title: ctx => ctx[0].datasetIndex === 0 ? ctx[0].raw.name : '',
          label: ctx => ctx.datasetIndex === 0
            ? [`${ctx.raw.date} · ${ctx.raw.km} km`, `allure ${ctx.raw.pace}/km`, `cadence ${ctx.parsed.y} pas/min`]
            : null
        } } } }
      });
      const slope = -a; // allure inversée : pente positive = cadence monte quand ça accélère
      $('matrixNote').innerHTML = slope > 2
        ? `Pente : <span style="color:var(--neon)">+${slope.toFixed(1)} spm par min/km gagnée</span> — ta cadence accompagne l'accélération, bon signe.`
        : `Pente : <span style="color:var(--amber)">${slope > 0 ? '+' : ''}${slope.toFixed(1)} spm par min/km gagnée</span> — tu accélères surtout en allongeant la foulée (sur-enjambement) : la cadence devrait grimper davantage avec la vitesse.`;
    })();

    // Jauge ACWR (demi-cercle 0 → 2)
    (function () {
      const has = acwrPts && acwrPts.length;
      showCard('cAcwrGauge', !!has);
      if (!has) return;
      const cur = Math.min(2, acwrPts[acwrPts.length - 1].ratio);
      const col = cur > 1.5 ? C.red : cur > 1.3 || cur < 0.8 ? C.yellow : C.green;
      mk('cAcwrGauge', { type: 'doughnut', data: {
        datasets: [
          { data: [0.8, 0.5, 0.2, 0.5], backgroundColor: ['rgba(125,138,163,.35)', 'rgba(84,242,131,.75)', 'rgba(255,209,102,.75)', 'rgba(255,77,109,.8)'],
            borderWidth: 0, circumference: 180, rotation: 270, cutout: '72%' },
          { data: [cur, 2 - cur], backgroundColor: [col, 'rgba(255,255,255,.05)'],
            borderWidth: 0, circumference: 180, rotation: 270, cutout: '88%' }
        ] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
      const el = $('acwrVal');
      el.textContent = acwrPts[acwrPts.length - 1].ratio;
      el.style.color = col;
      el.style.textShadow = `0 0 16px ${col}`;
    })();
  }

  // ---------- Apple Santé (3ᵉ source : physiologie, récupération, biomécanique) ----------
  let _healthCache;                                  // undefined = pas encore chargé, null = absent
  function healthComputed() {
    if (_healthCache === undefined) _healthCache = (window.Health ? Health.load() : null);
    return _healthCache;
  }
  function invalidateHealth() { _healthCache = undefined; }

  const HC = { vo2: C.orange, rhr: C.red, hrv: C.purple, gct: C.orange, vosc: C.blue,
    stride: C.green, power: C.yellow };

  // Texte de tendance coloré selon « amélioration »
  function trendNote(s, unit, extra) {
    if (!s) return '';
    const arrow = s.delta === 0 ? '→' : s.delta > 0 ? '↑' : '↓';
    const col = s.improving ? C.green : (s.delta === 0 ? C.muted : C.yellow);
    const sign = s.delta > 0 ? '+' : '';
    return `Actuel <b style="color:${col}">${s.latest}${unit}</b> · moy. ${s.mean}${unit} · ${arrow} ${sign}${s.delta}${unit} sur la période (${s.n} mesures).${extra ? ' ' + extra : ''}`;
  }

  const vo2lvl = s => !s ? '' : s.latest >= 55 ? 'excellent (niveau compétiteur)' : s.latest >= 50 ? 'très bon' : s.latest >= 45 ? 'bon (au-dessus de la moyenne)' : s.latest >= 40 ? 'correct' : 'à développer';

  // Corrélation de Pearson entre une série Santé {x,y} et une série {date->valeur}, sur dates communes
  function corrWith(serie, byDate) {
    const a = [], b = [];
    for (const p of serie) { const v = byDate.get(p.x); if (v !== undefined) { a.push(p.y); b.push(v); } }
    if (a.length < 5) return null;
    const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? n / Math.sqrt(da * db) : null;
  }

  // Tuile de stat « signature » (valeur + tendance fléchée)
  function hstat(label, sum, unit, fmt) {
    if (!sum) return '';
    const arrow = sum.delta === 0 ? '→' : sum.delta > 0 ? '↑' : '↓';
    const col = sum.improving ? C.green : (sum.delta === 0 ? C.muted : C.yellow);
    const val = fmt ? fmt(sum.latest) : sum.latest;
    return `<div class="hstat"><div class="hv" style="color:${col}">${val}<span style="font-size:.7rem;color:var(--muted)"> ${unit}</span></div>
      <div class="hl">${label}</div>
      <div class="ht" style="color:${col}">${arrow} ${sum.delta > 0 ? '+' : ''}${sum.delta}${unit} · moy ${sum.mean}</div></div>`;
  }

  function renderHealth(D) {
    const H = D.health;
    const sections = ['healthCockpit', 'healthMoteur', 'healthMeca', 'healthCharge'];
    if (!H || !H.has) { sections.forEach(id => $(id) && ($(id).style.display = 'none')); return; }
    sections.forEach(id => $(id) && ($(id).style.display = ''));

    // ═══ 🩺 MOTEUR : VO₂max mesuré × charge de fond (CTL) — l'entraînement se traduit-il en gains ? ═══
    if (H.vo2.length) {
      showCard('cVo2', true);
      const ctlByDate = new Map(D.fitness.map(p => [p.date, p.ctl]));
      const ctl = D.fitness.map(p => ({ x: p.date, y: p.ctl }));
      mk('cVo2', { data: { datasets: [
          { type: 'line', label: 'VO₂max (ml/kg/min)', data: H.vo2.map(p => ({ x: p.x, y: p.y })), borderColor: HC.vo2, backgroundColor: HC.vo2 + '1f', pointRadius: 3, borderWidth: 2.5, tension: .3, fill: true, yAxisID: 'y' },
          { type: 'line', label: 'Forme / CTL (charge 42 j)', data: ctl, borderColor: C.blue, pointRadius: 0, borderWidth: 2, tension: .3, yAxisID: 'y2' }
        ] },
        options: { maintainAspectRatio: false, scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 8 } },
          y: { title: { display: true, text: 'VO₂max' } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'CTL' } } },
          plugins: { legend: { display: true } } }
      });
      const corr = corrWith(H.vo2, ctlByDate);
      let link = '';
      if (corr !== null) link = corr > 0.4 ? ` <span style="color:${C.neon}">Lié à ta charge de fond (corr ${corr.toFixed(2)}) : ton entraînement se transforme bien en VO₂max mesurée.</span>`
        : corr < -0.3 ? ` <span style="color:${C.amber}">VO₂max et charge évoluent en sens inverse (corr ${corr.toFixed(2)}) — fatigue accumulée qui masque les gains ?</span>`
          : ` Peu corrélé à la charge récente (corr ${corr.toFixed(2)}) : les gains de VO₂max viennent surtout de l'intensité (VMA), pas du seul volume.`;
      $('vo2Note').innerHTML = (H.sum.vo2 ? trendNote(H.sum.vo2, '', `Repère : ${vo2lvl(H.sum.vo2)}.`) : '') + link;
    } else showCard('cVo2', false);

    // ═══ 🦿 MÉCANIQUE : stress biomécanique (GCT × oscillation) + bandeau signature de foulée ═══
    const hasBio = H.gct.length || H.vosc.length || H.stride.length || H.power.length || H.cadence.length;
    $('bsiCard').style.display = hasBio ? 'none' : '';
    $('healthMeca').style.display = hasBio ? '' : 'none';

    if (H.gct.length || H.vosc.length) {
      showCard('cBio1', true);
      mk('cBio1', { data: { datasets: [
          { type: 'line', label: 'Contact sol (ms)', data: H.gct.map(p => ({ x: p.x, y: p.y })), borderColor: HC.gct, backgroundColor: HC.gct + '1f', pointRadius: 0, borderWidth: 2.5, tension: .3, yAxisID: 'y', fill: true },
          { type: 'line', label: 'Oscillation (cm)', data: H.vosc.map(p => ({ x: p.x, y: p.y })), borderColor: HC.vosc, pointRadius: 0, borderWidth: 2, tension: .3, yAxisID: 'y2' }
        ] },
        options: { maintainAspectRatio: false, scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 8 } },
          y: { title: { display: true, text: 'ms' } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'cm' } } },
          plugins: { legend: { display: true } } }
      });
      const gctTxt = H.sum.gct ? `Contact sol ${H.sum.gct.latest} ms (${H.sum.gct.latest < 250 ? 'élite' : H.sum.gct.latest < 300 ? 'efficace' : 'à raccourcir'})` : '';
      const voTxt = H.sum.vosc ? `oscillation ${H.sum.vosc.latest} cm (${H.sum.vosc.latest < 8 ? 'très économique' : H.sum.vosc.latest < 10 ? 'bon' : 'rebond un peu haut'})` : '';
      $('bio1Note').innerHTML = [gctTxt, voTxt].filter(Boolean).join(' · ') + '. Moins de temps au sol et moins de rebond vertical = foulée plus économique.';
    } else showCard('cBio1', false);

    // Bandeau signature : cadence mesurée + foulée + puissance (3 charts → 3 tuiles)
    $('bioStrip').innerHTML = [
      hstat('Cadence mesurée', H.sum.cadence, ' spm'),
      hstat('Longueur de foulée', H.sum.stride, ' m'),
      hstat('Puissance', H.sum.power, ' W'),
    ].join('');
    const cs = H.sum.cadence;
    $('bioStripNote').innerHTML = `Mesuré par l'Apple Watch (capteur réel, plus l'estimation par les pas). ` +
      (cs ? `Cadence moyenne ${cs.mean} spm sur ${H.cadence.length} séances — ${cs.mean < 165 ? `<span style="color:${C.amber}">sous le repère 170-180, vise +5 spm par paliers (métronome)</span>` : cs.mean >= 172 ? `<span style="color:${C.neon}">dans la cible, continue</span>` : 'proche de la cible'}.` : '');

    // ═══ 🔋 CHARGE : readiness (jauge) + sommeil + récupération × charge (readiness vs ACWR) ═══
    const r = H.readiness;
    if (r) {
      showCard('cReady', true);
      const val = Math.max(0, Math.min(100, r.latest));
      mk('cReady', { type: 'doughnut', data: { datasets: [
          { data: [32, 13, 15, 15, 25], backgroundColor: ['rgba(255,77,109,.65)', 'rgba(255,159,67,.65)', 'rgba(255,209,102,.65)', 'rgba(34,211,238,.6)', 'rgba(84,242,131,.7)'], borderWidth: 0, circumference: 180, rotation: 270, cutout: '72%' },
          { data: [val, 100 - val], backgroundColor: [r.color, 'rgba(255,255,255,.05)'], borderWidth: 0, circumference: 180, rotation: 270, cutout: '88%' }
        ] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
      $('readyVal').textContent = r.latest;
      $('readyVal').style.color = r.color;
      $('readyVal').style.textShadow = `0 0 16px ${r.color}`;
      $('readyLbl').textContent = r.label;
      $('readyNote').innerHTML = `${r.icon} <b style="color:${r.color}">${r.label}</b> — VFC ${r.hrv} ms, FC repos ${r.rhr || '?'} bpm aujourd'hui. ${val >= 60 ? 'Feu vert pour une séance de qualité.' : val >= 45 ? 'Séance modérée OK, reste à l\'écoute.' : 'Privilégie le repos ou une sortie très facile.'}`;
    } else showCard('cReady', false);

    // Sommeil empilé (30 dernières nuits)
    if (H.sleep.length) {
      showCard('cSleep', true);
      const sl = H.sleep.slice(-30);
      mk('cSleep', { type: 'bar', data: { labels: sl.map(s => s.x.slice(5)), datasets: [
          { label: 'Profond', data: sl.map(s => s.deep), backgroundColor: C.blue + 'cc' },
          { label: 'Paradoxal (REM)', data: sl.map(s => s.rem), backgroundColor: C.purple + 'cc' },
          { label: 'Léger', data: sl.map(s => s.core), backgroundColor: C.orange + '99' },
          { label: 'Éveil', data: sl.map(s => s.awake), backgroundColor: C.red + '88' }
        ] },
        options: { maintainAspectRatio: false, scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 12 } },
          y: { stacked: true, title: { display: true, text: 'heures' } } },
          plugins: { legend: { display: true, labels: { boxWidth: 12 } } } }
      });
      const ss = H.sum.sleep;
      $('sleepNote').innerHTML = ss ? `Moyenne <b style="color:${ss.avg >= 7 ? C.green : C.amber}">${ss.avg} h</b>/nuit (${ss.n} nuits) · profond ${ss.deepPct} % · REM ${ss.remPct} %. Sous 7 h récurrent pénalise la récupération musculaire et la consolidation des adaptations.` : '';
    } else showCard('cSleep', false);

    // LE croisement clé : readiness (récup) vs ACWR (charge) sur le même axe temps
    const acwr = (D.acwr || []).filter(p => p.ratio !== null);
    if (r && acwr.length > 5) {
      showCard('cRecovery', true);
      mk('cRecovery', { data: { datasets: [
          { type: 'line', label: 'Readiness (récup.)', data: r.series.map(p => ({ x: p.x, y: p.y })), borderColor: r.color, backgroundColor: r.color + '1f', pointRadius: 0, borderWidth: 2.5, tension: .3, fill: true, yAxisID: 'y' },
          { type: 'line', label: 'ACWR (charge 7j/28j)', data: acwr.map(p => ({ x: p.date, y: p.ratio })), borderColor: C.orange, pointRadius: 0, borderWidth: 2, tension: .3, yAxisID: 'y2' }
        ] },
        options: { maintainAspectRatio: false, scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 8 } },
          y: { min: 0, max: 100, title: { display: true, text: 'readiness' } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, suggestedMin: 0, suggestedMax: 2, title: { display: true, text: 'ACWR' } } },
          plugins: { legend: { display: true } } }
      });
      const rdByDate = new Map(r.series.map(p => [p.x, p.y]));
      const corr = corrWith(acwr.map(p => ({ x: p.date, y: p.ratio })), rdByDate);
      const curAcwr = acwr[acwr.length - 1].ratio, curRd = r.latest;
      let diag;
      if (curAcwr > 1.3 && curRd < 50) diag = `<span style="color:${C.red}">⚠️ Charge haute (ACWR ${curAcwr}) ET récup basse (${curRd}) : zone de surentraînement, allège.</span>`;
      else if (curAcwr > 1.3 && curRd >= 60) diag = `<span style="color:${C.amber}">Charge haute mais bonne récup (${curRd}) : tu encaisses, surveille la VFC.</span>`;
      else if (curAcwr < 0.8 && curRd >= 60) diag = `<span style="color:${C.neon}">Récup pleine (${curRd}) et charge basse : fenêtre idéale pour pousser le volume.</span>`;
      else diag = `Équilibre correct (ACWR ${curAcwr}, readiness ${curRd}).`;
      $('recoveryNote').innerHTML = (corr !== null && corr < -0.25
        ? `Ta récupération chute quand la charge monte (corr ${corr.toFixed(2)}) — relation attendue et saine à surveiller. `
        : '') + diag;
    } else showCard('cRecovery', false);

    // ═══ 🎛️ COCKPIT : bandeau readiness ═══
    const chip = [];
    if (H.sum.vo2) chip.push(`VO₂max ${H.sum.vo2.latest}`);
    if (H.sum.rhr) chip.push(`FC repos ${H.sum.rhr.latest} bpm`);
    if (H.sum.hrv) chip.push(`VFC ${H.sum.hrv.latest} ms`);
    if (H.sum.sleep) chip.push(`sommeil ${H.sum.sleep.avg} h`);
    $('healthCockpit').innerHTML = `<div class="overall">
      <div class="ov-score" style="color:${r ? r.color : C.muted};text-shadow:${r ? `0 0 18px ${r.color}66` : 'none'}">${r ? r.latest : '—'}<span style="font-size:1rem;color:var(--muted);text-shadow:none">/100</span></div>
      <div><div class="ov-label" style="color:${r ? r.color : C.muted}">${r ? r.icon + ' Readiness — ' + r.label : '🩺 Données Apple Santé'}</div>
      <div class="ov-chips">${chip.join(' · ')}</div></div></div>`;

    // ═══ 🧠 LAB : insights physiologiques ajoutés au feed ═══
    const hi = [];
    if (H.sum.vo2) hi.push(`<b>VO₂max :</b> ${H.sum.vo2.latest} ml/kg/min — ${vo2lvl(H.sum.vo2)}. ${H.sum.vo2.improving ? '<span class="good">En progression</span> sur la période 📈' : 'Stable/en léger recul : un bloc d\'intervalles (VMA) le ferait remonter.'}`);
    if (r) hi.push(`<b>Readiness :</b> ${r.latest}/100 (${r.label}). ${r.latest < 45 ? '<span class="warn">Plusieurs jours sous 45 = surcharge probable, allège.</span>' : 'Bon état de récupération pour enchaîner la charge.'}`);
    if (H.sum.sleep && H.sum.sleep.avg < 7) hi.push(`<b>Sommeil :</b> <span class="warn">${H.sum.sleep.avg} h/nuit en moyenne</span> — sous le seuil de récupération optimale (7–8 h). C'est souvent le levier n°1, gratuit, de progression.`);
    if (H.sum.cadence && H.sum.cadence.mean < 168) hi.push(`<b>Cadence (mesurée) :</b> ${H.sum.cadence.mean} pas/min de moyenne — sous le repère 170–180. Monter la cadence réduit l'impact articulaire à allure égale.`);
    if (hi.length) $('insights').insertAdjacentHTML('beforeend', hi.map(x => `<div class="insight-card">${x}</div>`).join(''));
  }

  // ---------- Programme de renforcement (4 séances/sem, checklist hebdo, localStorage) ----------
  // Reflète le programme réel suivi après la muscu — compté dans le score de forme global.
  const CHECKLIST = [
    ['🧱', 'Lundi — Gainage / core', 'Planche · planche latérale · mountain climbers · relevés de jambes · hollow hold · superman'],
    ['🧘', 'Mercredi — Mobilité', 'Cercles de hanches · world\'s greatest stretch · mobilité cheville · psoas · deep squat hold · leg swings'],
    ['🦵', 'Jeudi — Force jambes', 'Mollets · fentes marchées · pont fessier (2 variantes) · step-up · wall sit'],
    ['🤸', 'Samedi — Équilibre & stabilité', 'Équilibre 1 jambe · single-leg deadlift · clamshell · dead bug · planche dynamique · russian twist'],
  ];
  const mondayKey = () => {
    const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return 'shield_' + d.toISOString().slice(0, 10);
  };
  function shieldState() { try { return JSON.parse(localStorage.getItem(mondayKey())) || {}; } catch (e) { return {}; } }
  function shieldDone() { const st = shieldState(); return CHECKLIST.filter((_, i) => st[i]).length; }
  function shieldScore() { return Math.round(100 * shieldDone() / CHECKLIST.length); }
  function shieldInfo() { return { done: shieldDone(), total: CHECKLIST.length, score: shieldScore() }; }
  function renderChecklist() {
    const st = shieldState();
    $('checklist').innerHTML = CHECKLIST.map(([icon, t, s], i) => `
      <div class="check-item ${st[i] ? 'done' : ''}" data-i="${i}">
        <div class="check-box">${st[i] ? '✓' : ''}</div>
        <div>${icon} <span class="ct">${t}</span><div class="cs">${s}</div></div>
      </div>`).join('');
    const score = shieldScore();
    $('shieldScore').textContent = shieldDone() + '/' + CHECKLIST.length;
    $('shieldScore').style.color = score >= 80 ? 'var(--neon)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
    $('shieldBar').style.width = score + '%';
    $('shieldBar').style.background = score >= 80 ? 'linear-gradient(90deg,#54f283,#a7f3d0)' : score >= 50 ? 'linear-gradient(90deg,#ffd166,#fde68a)' : 'linear-gradient(90deg,#ff4d6d,#ff8fa3)';
  }
  $('checklist').addEventListener('click', ev => {
    const item = ev.target.closest('.check-item');
    if (!item) return;
    const st = shieldState();
    st[item.dataset.i] = !st[item.dataset.i];
    localStorage.setItem(mondayKey(), JSON.stringify(st));
    renderChecklist();
    // Met à jour le score de forme global en direct (le renforcement y compte)
    if (lastD) { lastD.shield = shieldInfo(); applyVerdicts(lastD); }
  });

  // ---------- Onglets ----------
  document.querySelectorAll('.tabbtn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === btn.dataset.tab));
    requestAnimationFrame(() => { charts.concat(ppmCharts).forEach(c => { try { c.resize(); } catch (e) {} }); });
    window.scrollTo({ top: 0 });
  }));
  // ouverture directe d'un onglet via #tab-xxx (différé : déclarations plus bas pas encore évaluées)
  setTimeout(() => {
    if (/^#tab-/.test(location.hash)) {
      const btn = document.querySelector(`.tabbtn[data-tab="${location.hash.slice(1)}"]`);
      if (btn) btn.click();
    }
  }, 0);

  // ---------- Pas par minute (streams API Strava) ----------
  let ppmCharts = [];
  function renderStreams(sessions) {
    ppmCharts.forEach(c => c.destroy());
    ppmCharts = [];
    const wrap = $('ppmWrap');
    if (!sessions || !sessions.length) {
      // Connecté et synchronisé mais aucune cadence : on explique pourquoi au lieu de masquer
      if (window.Strava && Strava.isConnected() && Strava.hasCache()) {
        wrap.style.display = '';
        $('ppmEmpty').style.display = '';
        $('ppmCharts').style.display = 'none';
      } else wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    $('ppmEmpty').style.display = 'none';
    $('ppmCharts').style.display = '';

    const fmtD = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '?';
    const cols = [C.orange, C.blue, C.green, C.purple, C.yellow, C.red];
    ppmCharts.push(new Chart($('cPpm'), { type: 'line', data: {
      datasets: sessions.map((s, i) => ({
        label: `${fmtD(s.date)} · ${s.km} km`,
        data: s.t.map((t, j) => ({ x: t, y: s.c[j] })),
        borderColor: i === 0 ? C.orange : cols[i % cols.length] + '88',
        borderWidth: i === 0 ? 2.5 : 1.3, pointRadius: 0, tension: .3,
      })).concat([{
        label: 'cible 170', data: [{ x: 0, y: 170 }, { x: Math.max(...sessions.map(s => s.t[s.t.length - 1])), y: 170 }],
        borderColor: C.green + '99', borderDash: [5, 5], borderWidth: 1, pointRadius: 0,
      }]) },
      options: { maintainAspectRatio: false, scales: {
        x: { type: 'linear', title: { display: true, text: 'minutes' } },
        y: { title: { display: true, text: 'pas/min' }, suggestedMin: 140, suggestedMax: 190 }
      }, plugins: { legend: { display: true, labels: { boxWidth: 14 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} : ${ctx.parsed.y} spm à ${Math.round(ctx.parsed.x)} min` } } } }
    }));

    $('ppmChips').innerHTML = sessions.map(s =>
      `<div class="ppm-chip">${fmtD(s.date)} · ${s.km} km — <b>${s.avg} spm</b> <span class="pc">· ${s.pct170} % ≥ 170</span></div>`).join('');

    // Histogramme du temps par plage (les points condensés ont un poids ~égal par séance)
    const bins = ['<160', '160-165', '165-170', '170-175', '175-180', '180+'];
    const counts = bins.map(() => 0);
    let total = 0;
    for (const s of sessions) for (const v of s.c) {
      const i = v < 160 ? 0 : v < 165 ? 1 : v < 170 ? 2 : v < 175 ? 3 : v < 180 ? 4 : 5;
      counts[i]++; total++;
    }
    ppmCharts.push(new Chart($('cPpmHist'), { type: 'bar', data: { labels: bins,
      datasets: [{ data: counts.map(c => Math.round(100 * c / total)),
        backgroundColor: ['#ff4d6d', '#ffd166', '#ffd166', '#54f283', '#54f283', '#22d3ee'].map(c => c + 'cc'), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' % du temps' } } },
        scales: { y: { title: { display: true, text: '% du temps' } } } }
    }));

    $('tPpm').innerHTML =
      '<tr><th>Date</th><th>Sortie</th><th class="num">km</th><th class="num">Cadence moy</th><th class="num">% ≥ 170</th></tr>' +
      sessions.map(s => `<tr><td>${fmtD(s.date)}</td><td>${s.name}</td><td class="num">${s.km}</td>
        <td class="num"><b style="color:${s.avg >= 170 ? '#3ddc84' : s.avg >= 165 ? '#ffd166' : '#ff4d6d'}">${s.avg}</b></td>
        <td class="num">${s.pct170} %</td></tr>`).join('');
  }

  // Données de démonstration (ouvrir la page avec #demo-streams)
  function demoStreams() {
    const mkS = (date, km, base, drift, min) => {
      const t = [], c = [];
      for (let m = 0; m <= min; m += 0.5) {
        t.push(m);
        c.push(Math.round(base + drift * (m / min) + 4 * Math.sin(m / 2) + (Math.random() - .5) * 4));
      }
      const avg = Math.round(c.reduce((a, b) => a + b, 0) / c.length);
      return { id: date, name: 'Course démo', date, km, t, c, avg,
        pct170: Math.round(100 * c.filter(v => v >= 170).length / c.length) };
    };
    return [mkS('2026-06-09', 7.3, 168, 4, 48), mkS('2026-06-02', 5.1, 165, -3, 32),
            mkS('2026-05-31', 20.0, 163, -6, 122), mkS('2026-05-26', 6.2, 166, 2, 40)];
  }

  // ---------- Boutons & état Strava ----------
  function updateButtons() {
    const btn = $('stravaBtn');
    if (Strava.isConnected()) { btn.textContent = '🔄 Sync Strava'; btn.title = 'Resynchroniser depuis l\'API Strava'; }
    else { btn.textContent = '🔗 Connecter Strava'; btn.title = 'Autoriser l\'accès à ton compte Strava'; }
  }

  // CSV d'enrichissement : celui importé par l'utilisateur, sinon celui du dépôt
  async function getCsvText() {
    const saved = localStorage.getItem(LS_CSV);
    if (saved) return saved;
    try {
      const r = await fetch('./activities.csv');
      if (r.ok) return await r.text();
    } catch (e) { /* hors-ligne sans cache */ }
    return null;
  }

  async function doSync() {
    try {
      const { acts, gear } = await Strava.sync(msg);
      render(computeFromStrava(acts, gear, await getCsvText()), 'Strava du ' + Strava.cachedDate());
      try { renderStreams(await Strava.syncStreams(acts, 6, msg)); }
      catch (e) { console.warn('streams cadence :', e); }
      msg(`✅ ${acts.length} activités synchronisées depuis Strava`);
    } catch (e) {
      msg('❌ ' + e.message);
    }
    updateButtons();
  }

  $('stravaBtn').addEventListener('click', () => {
    if (!Strava.isConfigured()) { $('cfgDlg').showModal(); return; }
    if (Strava.isConnected()) doSync();
    else Strava.connect();
  });

  $('cfgBtn').addEventListener('click', () => {
    const c = Strava.config();
    $('cfgId').value = c.client_id;
    $('cfgSecret').value = c.client_secret;
    if ($('cbDomain')) $('cbDomain').textContent = Strava.callbackDomain();
    $('cfgDlg').showModal();
  });
  $('cfgSave').addEventListener('click', ev => {
    ev.preventDefault();
    Strava.saveConfig({ client_id: $('cfgId').value.trim(), client_secret: $('cfgSecret').value.trim() });
    $('cfgDlg').close();
    if (Strava.isConfigured() && !Strava.isConnected()) Strava.connect();
  });
  $('cfgCancel').addEventListener('click', ev => { ev.preventDefault(); $('cfgDlg').close(); });

  // ---------- Import CSV ----------
  $('fileInput').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const D = computeData(reader.result);
        localStorage.setItem(LS_CSV, reader.result);
        localStorage.setItem(LS_CSV + '_date', new Date().toLocaleDateString('fr-BE'));
        render(D, 'importées le ' + new Date().toLocaleDateString('fr-BE'));
        msg(`✅ ${D.global.n_runs} courses importées (dernière : ${D.global.last_run})`);
      } catch (e) {
        msg('❌ ' + e.message);
      }
      ev.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });

  // ---------- Import Apple Santé (JSON Health Auto Export) ----------
  $('healthInput').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Health.save(reader.result);
        invalidateHealth();
        const H = Health.load();
        load(); // re-rend la source courante, qui intègre désormais la couche Santé
        const parts = [];
        if (H && H.sum.vo2) parts.push('VO₂max ' + H.sum.vo2.latest);
        if (H && H.readiness) parts.push('readiness ' + H.readiness.latest + '/100');
        msg(`✅ Données Apple Santé importées${parts.length ? ' (' + parts.join(' · ') + ')' : ''}`);
      } catch (e) {
        msg('❌ Santé : ' + e.message);
      }
      ev.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });

  $('resetBtn').addEventListener('click', () => {
    localStorage.removeItem(LS_CSV);
    localStorage.removeItem(LS_CSV + '_date');
    Strava.disconnect();
    if (window.Health) Health.clear();
    invalidateHealth();
    msg('');
    updateButtons();
    load();
  });

  // ---------- Chargement initial ----------
  async function load() {
    updateButtons();
    try {
      if (await Strava.handleRedirect()) { msg('Connecté à Strava ✓'); await doSync(); return; }
    } catch (e) { msg('❌ ' + e.message); }
    if (Strava.isConnected() && Strava.hasCache()) {
      render(computeFromStrava(Strava.cached(), Strava.cachedGear(), await getCsvText()), 'Strava du ' + Strava.cachedDate());
      renderStreams(Strava.cachedStreams());
      return;
    }
    if (location.hash === '#demo-streams') renderStreams(demoStreams());
    const saved = localStorage.getItem(LS_CSV);
    if (saved) {
      try { render(computeData(saved), 'importées le ' + (localStorage.getItem(LS_CSV + '_date') || '?')); return; }
      catch (e) { localStorage.removeItem(LS_CSV); }
    }
    fetch('./activities.csv')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(t => render(computeData(t), 'du dépôt'))
      .catch(e => { $('subtitle').textContent = 'Aucune donnée : connecte Strava (🔗) ou importe un activities.csv (📥). (' + e.message + ')'; });
  }

  renderChecklist();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW non enregistré :', e));
    // Quand un nouveau service worker prend la main, on recharge une fois pour servir la nouvelle version
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }

  load();
})();
