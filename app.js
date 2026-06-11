/* UI du dashboard PWA : rendu des charts depuis l'objet calculé par compute.js,
   import d'un activities.csv à jour (persisté en localStorage), service worker. */
(function () {
  'use strict';

  const C = { orange: '#fc5200', blue: '#4cc2ff', green: '#3ddc84', yellow: '#ffd166',
    purple: '#b388ff', red: '#ff4d6d', muted: '#8a93a6', grid: '#262e40' };
  Chart.defaults.color = C.muted;
  Chart.defaults.borderColor = C.grid;
  Chart.defaults.font.family = '-apple-system, "Segoe UI", Roboto, sans-serif';

  const DOWS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const LS_KEY = 'strava_csv';
  const $ = id => document.getElementById(id);
  const fmtPace = p => { let m = Math.floor(p), s = Math.round((p - m) * 60); if (s === 60) { m++; s = 0; } return m + ':' + String(s).padStart(2, '0'); };
  const nf = n => Number(n).toLocaleString('fr-BE');

  let charts = [];
  function mk(id, cfg) { charts.push(new Chart($(id), cfg)); }

  function render(D, source) {
    charts.forEach(c => c.destroy());
    charts = [];
    const g = D.global;

    $('subtitle').textContent = `${D.profile.name} · ${D.profile.city} · ${g.first_run.split('-')[0]} → ${g.last_run} · données ${source}, analysées le ${D.generated}`;
    $('lastRun').textContent = g.last_run;
    $('fcmax').textContent = Math.round(D.fc_max);
    $('footer').textContent = `${D.runs.length} courses à pied · ${g.total_km} km — export Strava.`;

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
      [nf(g.total_cal), 'Calories brûlées', 'green'],
      [nf(g.total_steps), 'Pas en courant', 'purple'],
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

    // ---- Duel courses longues ----
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
        x: { type: 'linear', min: 1, max: 366, ticks: { callback: v => ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'][Math.ceil(v / 30.5)] || '', stepSize: 30.5 } },
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
    mk('cForm', { type: 'line', data: { datasets: [
        { label: 'Fitness (42j)', data: D.fitness.map(p => ({ x: p.date, y: p.ctl })), borderColor: C.blue, backgroundColor: C.blue + '22', pointRadius: 0, borderWidth: 2.5, fill: true, tension: .3 },
        { label: 'Fatigue (7j)', data: D.fitness.map(p => ({ x: p.date, y: p.atl })), borderColor: C.red, pointRadius: 0, borderWidth: 1.5, tension: .3 },
        { label: 'Fraîcheur', data: D.fitness.map(p => ({ x: p.date, y: p.tsb })), borderColor: C.green, pointRadius: 0, borderWidth: 1.5, borderDash: [5, 4], tension: .3 }
      ] },
      options: { maintainAspectRatio: false, scales: {
        x: { type: 'time', time: { unit: 'month' }, ticks: { maxTicksLimit: 14 } },
        y: { title: { display: true, text: 'charge (effort relatif/j)' } }
      }, plugins: { legend: { display: true } } }
    });

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
    mk('cPaceHr', { type: 'bubble', data: { datasets: [{
        label: 'course', data: D.runs.filter(r => r.hr).map(r => ({ x: r.pace, y: r.hr, r: Math.sqrt(r.km) * 2.2, km: r.km, d: r.date })),
        backgroundColor: C.purple + '77', borderColor: C.purple
      }] },
      options: { maintainAspectRatio: false, scales: {
        x: { reverse: true, ticks: { callback: fmtPace }, title: { display: true, text: 'allure (→ plus rapide)' } },
        y: { title: { display: true, text: 'FC moyenne (bpm)' } }
      }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw.d} · ${ctx.raw.km} km · ${fmtPace(ctx.raw.x)}/km · ${Math.round(ctx.raw.y)} bpm` } } } }
    });

    // ---- Zones ----
    mk('cZones', { type: 'doughnut', data: {
      labels: Object.keys(D.zones),
      datasets: [{ data: Object.values(D.zones), backgroundColor: ['#4cc2ff', '#3ddc84', '#ffd166', '#fc5200', '#ff4d6d'], borderWidth: 0 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: ctx => ctx.label + ' : ' + ctx.parsed + ' h' } } } }
    });

    // ---- Efficacité aérobie ----
    const effM = D.monthly.filter(m => m.hr);
    mk('cEff', { data: { labels: effM.map(m => m.month), datasets: [
        { type: 'line', label: 'FC moy (bpm)', data: effM.map(m => m.hr), borderColor: C.red, tension: .3, yAxisID: 'y' },
        { type: 'line', label: 'allure', data: effM.map(m => m.pace), borderColor: C.blue, tension: .3, yAxisID: 'y2' }
      ] },
      options: { maintainAspectRatio: false, scales: {
        y: { title: { display: true, text: 'bpm' } },
        y2: { position: 'right', reverse: true, grid: { drawOnChartArea: false }, ticks: { callback: fmtPace } }
      }, plugins: { tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 1 ? 'allure : ' + fmtPace(ctx.parsed.y) + '/km' : 'FC : ' + ctx.parsed.y + ' bpm' } } } }
    });

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

    // ---- Heatmap ----
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
    mk('cTemp', { type: 'scatter', data: { datasets: [{
        data: D.temp_pace.map(t => ({ x: t.temp, y: t.pace, km: t.km })), backgroundColor: C.green + '88' }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x}°C · ${fmtPace(ctx.parsed.y)}/km · ${ctx.raw.km} km` } } },
        scales: { x: { title: { display: true, text: 'température (°C)' } }, y: { reverse: true, ticks: { callback: fmtPace }, title: { display: true, text: 'allure' } } } }
    });

    // ---- Chaussures ----
    mk('cGear', { type: 'bar', data: { labels: D.gear.map(s => s.name),
      datasets: [{ data: D.gear.map(s => s.km), backgroundColor: [C.muted + '88', C.blue + 'cc', C.orange + 'cc', C.green + 'cc', C.purple + 'cc'], borderRadius: 6 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} km · ${D.gear[ctx.dataIndex].n} sorties` } } },
        scales: { x: { title: { display: true, text: 'km' } } } }
    });

    // ---- Tables ----
    $('tYear').innerHTML =
      '<tr><th>Année</th><th class="num">Courses</th><th class="num">km</th><th class="num">Heures</th><th class="num">D+ (m)</th><th class="num">Allure moy.</th></tr>' +
      D.yearly.map(y => `<tr><td><b>${y.year}</b></td><td class="num">${y.n}</td><td class="num">${y.km}</td><td class="num">${y.hours}</td><td class="num">${y.dplus}</td><td class="num">${y.pace_str}/km</td></tr>`).join('');

    const ICONS = { 'Course à pied': '🏃', 'Entraînement aux poids': '🏋️', 'Vélo': '🚴', 'Marche': '🚶', 'Ski alpin': '⛷️', 'Randonnée': '🥾', 'Natation': '🏊' };
    $('tOther').innerHTML =
      '<tr><th>Sport</th><th class="num">Séances</th><th class="num">Heures</th><th class="num">km</th><th class="num">Calories</th></tr>' +
      D.other.map(o => `<tr><td>${ICONS[o.type] || '💪'} ${o.type}</td><td class="num">${o.n}</td><td class="num">${o.hours}</td><td class="num">${o.km || '—'}</td><td class="num">${nf(o.cal)}</td></tr>`).join('');

    const top10 = [...D.runs].sort((a, b) => b.km - a.km).slice(0, 10);
    $('tTop').innerHTML =
      '<tr><th>Date</th><th>Nom</th><th class="num">km</th><th class="num">Temps</th><th class="num">Allure</th><th class="num">FC moy</th><th class="num">D+</th></tr>' +
      top10.map(r => `<tr><td>${r.date}</td><td>${r.name}</td><td class="num"><b>${r.km}</b></td><td class="num">${r.time}</td><td class="num">${r.pace_str}/km</td><td class="num">${r.hr ? Math.round(r.hr) : '—'}</td><td class="num">${r.dplus}</td></tr>`).join('');

    // ---- Insights dynamiques ----
    const ins = [];
    if (D.duel && D.duel.delta_s > 0) {
      const d = D.duel, dm = Math.floor(d.delta_s / 60);
      ins.push(`<li><b>Progression sur course longue :</b> « ${d.last.name} » couru en <span class="good">${d.last.time} (${d.last.pace}/km)</span> contre ${d.prev.time} (${d.prev.pace}/km) en ${d.prev.year}, soit ~${dm} min et ${d.delta_pace_s} s/km gagnés. La preuve la plus directe que l'entraînement paie.</li>`);
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
    const z = D.zones, zEasy = (z['Z1 <60%'] || 0) + (z['Z2 60-70%'] || 0), zHard = (z['Z3 70-80%'] || 0) + (z['Z4 80-90%'] || 0) + (z['Z5 90%+'] || 0);
    if (g.avg_hr) ins.push(`<li><b>Cardio :</b> FC moyenne ${Math.round(g.avg_hr)} bpm pour une FC max observée de ${Math.round(D.fc_max)} bpm (~${Math.round(100 * g.avg_hr / D.fc_max)} %). ${zEasy < zHard / 4 ? `<span class="warn">${zHard.toFixed(0)} h en zones 3+ contre ${zEasy.toFixed(1)} h en zones faciles</span> : la majorité des sorties sont « au tempo ». Plus de vraies sorties faciles (< 70 % FCmax) accélérerait la progression aérobie et réduirait le risque de blessure.` : 'Bonne répartition entre sorties faciles et soutenues.'}</li>`);
    const topDow = D.dow.indexOf(Math.max(...D.dow)), topHour = D.hours.indexOf(Math.max(...D.hours));
    ins.push(`<li><b>Habitudes :</b> jour favori le <b>${DOWS[topDow]}</b> (${D.dow[topDow]} sorties), départ le plus fréquent vers ${topHour} h. Objectif hebdo atteint ${g.goal_hit_rate} % des semaines ; meilleure série ${g.best_week_streak} semaines, série en cours ${g.current_week_streak}.</li>`);
    const topShoe = D.gear.find(s => s.name !== 'Sans matériel');
    if (topShoe) ins.push(`<li><b>Matériel :</b> ${D.gear.filter(s => s.name !== 'Sans matériel').map(s => `<b>${s.name}</b> : ${s.km} km`).join(' · ')}. Repère d'usure usuel : ~600 km par paire.</li>`);
    const weights = D.other.find(o => o.type === 'Entraînement aux poids');
    if (weights) ins.push(`<li><b>Renforcement :</b> ${weights.n} séances (≈ ${weights.hours} h) — excellent complément, à maintenir pendant les blocs de course.</li>`);
    $('insights').innerHTML = '<ul>' + ins.join('') + '</ul>';
  }

  // ---------- Chargement des données ----------
  function load() {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try { render(computeData(saved), 'importées le ' + (localStorage.getItem(LS_KEY + '_date') || '?')); return; }
      catch (e) { console.warn('CSV importé invalide, retour aux données du dépôt', e); localStorage.removeItem(LS_KEY); }
    }
    fetch('./activities.csv')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(t => render(computeData(t), 'du dépôt'))
      .catch(e => { $('subtitle').textContent = 'Impossible de charger activities.csv : ' + e.message; });
  }

  // ---------- Import ----------
  $('fileInput').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const D = computeData(reader.result);
        localStorage.setItem(LS_KEY, reader.result);
        localStorage.setItem(LS_KEY + '_date', new Date().toLocaleDateString('fr-BE'));
        render(D, 'importées le ' + new Date().toLocaleDateString('fr-BE'));
        $('importMsg').textContent = `✅ ${D.global.n_runs} courses importées (dernière : ${D.global.last_run})`;
      } catch (e) {
        $('importMsg').textContent = '❌ ' + e.message;
      }
      ev.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });
  $('resetBtn').addEventListener('click', () => {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_KEY + '_date');
    $('importMsg').textContent = '';
    load();
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW non enregistré :', e));
  }

  load();
})();
