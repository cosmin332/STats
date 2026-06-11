/* UI du dashboard PWA : rendu des charts depuis l'objet calculé par compute.js.
   Sources de données (par priorité) : API Strava > CSV importé > activities.csv du dépôt. */
(function () {
  'use strict';

  const C = { orange: '#fc5200', blue: '#4cc2ff', green: '#3ddc84', yellow: '#ffd166',
    purple: '#b388ff', red: '#ff4d6d', muted: '#8a93a6', grid: '#262e40' };
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
  function mk(id, cfg) { charts.push(new Chart($(id), cfg)); }
  function showCard(id, show) {
    const card = $(id).closest('.card');
    if (card) card.style.display = show ? '' : 'none';
  }

  function render(D, source) {
    charts.forEach(c => c.destroy());
    charts = [];
    const g = D.global;

    $('subtitle').textContent = `${D.profile.name} · ${D.profile.city} · ${g.first_run.split('-')[0]} → ${g.last_run} · données ${source}, analysées le ${D.generated}`;
    $('lastRun').textContent = g.last_run;
    $('fcmax').textContent = D.fc_max ? Math.round(D.fc_max) : '—';
    $('footer').textContent = `${D.runs.length} courses à pied · ${g.total_km} km — données Strava.`;

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
      datasets: [{ data: zoneVals, backgroundColor: ['#4cc2ff', '#3ddc84', '#ffd166', '#fc5200', '#ff4d6d'], borderWidth: 0 }] },
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
          { type: 'scatter', label: 'sortie', data: cadRuns.map(r => ({ x: r.date, y: r.cad, km: r.km })), backgroundColor: C.green + '88', pointRadius: 3.5 },
          { type: 'line', label: 'moyenne mobile (10)', data: ma, borderColor: C.blue, pointRadius: 0, tension: .35, borderWidth: 2.5 }
        ] },
        options: { maintainAspectRatio: false, scales: {
          x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 14 } },
          y: { title: { display: true, text: 'pas/min' } }
        }, plugins: { tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} spm${ctx.raw.km ? ' · ' + ctx.raw.km + ' km' : ''}` } } } }
      });
      $('cadNote').textContent = `Cadence moyenne : ${g.avg_cad} pas/min. Repère usuel : 170–180 spm ; une cadence plus haute à allure égale réduit l'impact par foulée.`;
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
    $('insights').innerHTML = '<ul>' + ins.join('') + '</ul>';
  }

  // ---------- Boutons & état Strava ----------
  function updateButtons() {
    const btn = $('stravaBtn');
    if (Strava.isConnected()) { btn.textContent = '🔄 Sync Strava'; btn.title = 'Resynchroniser depuis l\'API Strava'; }
    else { btn.textContent = '🔗 Connecter Strava'; btn.title = 'Autoriser l\'accès à ton compte Strava'; }
  }

  async function doSync() {
    try {
      const { acts, gear } = await Strava.sync(msg);
      render(computeFromStrava(acts, gear), 'Strava du ' + Strava.cachedDate());
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

  $('resetBtn').addEventListener('click', () => {
    localStorage.removeItem(LS_CSV);
    localStorage.removeItem(LS_CSV + '_date');
    Strava.disconnect();
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
      render(computeFromStrava(Strava.cached(), Strava.cachedGear()), 'Strava du ' + Strava.cachedDate());
      return;
    }
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

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW non enregistré :', e));
  }

  load();
})();
