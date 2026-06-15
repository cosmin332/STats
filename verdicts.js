/* Moteur de verdicts : pour chaque graphique, calcule une note (5 niveaux) + une phrase
   d'analyse chiffrée à partir des données. Recalculé à chaque render → évolue avec les sorties.
   Sortie : { <idElement>: {lvl,label,color,icon,text}, _overall: {...} } */
(function () {
  'use strict';

  const T = {
    faible:    { lvl: 0, label: 'En dessous',       color: '#ff4d6d', icon: '🔴' },
    bof:       { lvl: 1, label: 'Peut mieux faire', color: '#ff9f43', icon: '🟠' },
    moyen:     { lvl: 2, label: 'Dans la moyenne',  color: '#ffd166', icon: '🟡' },
    bien:      { lvl: 3, label: 'Bien',             color: '#54f283', icon: '🟢' },
    excellent: { lvl: 4, label: 'Excellent',        color: '#22d3ee', icon: '⭐' },
    info:      { lvl: -1, label: 'Repère',          color: '#a78bfa', icon: 'ℹ️' },
  };
  const v = (key, text) => Object.assign({}, T[key], { text });
  // valeur haute = mieux ; breaks ascendants [b0,b1,b2,b3]
  const up = (x, b) => x >= b[3] ? 'excellent' : x >= b[2] ? 'bien' : x >= b[1] ? 'moyen' : x >= b[0] ? 'bof' : 'faible';
  const fmtPace = p => { let m = Math.floor(p), s = Math.round((p - m) * 60); if (s === 60) { m++; s = 0; } return m + ':' + String(s).padStart(2, '0'); };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

  function compute(D) {
    const g = D.global, out = {};

    // ---- Volume mensuel : dynamique récente ----
    (function () {
      const m = D.monthly;
      if (m.length >= 4) {
        const recent = m.slice(-3), prior = m.slice(-6, -3);
        const ra = mean(recent.map(x => x.km)), pa = mean(prior.map(x => x.km));
        if (pa > 0) {
          const tr = ra / pa - 1;
          const key = tr >= 0.10 ? 'excellent' : tr >= 0.02 ? 'bien' : tr >= -0.02 ? 'moyen' : tr >= -0.15 ? 'bof' : 'faible';
          out.cMonthly = v(key, `Volume récent <b>${ra.toFixed(0)} km/mois</b> contre ${pa.toFixed(0)} avant (${tr >= 0 ? '+' : ''}${Math.round(tr * 100)} %). ` +
            (tr >= 0.02 ? 'Charge en hausse maîtrisée.' : tr >= -0.02 ? 'Volume stable.' : 'Volume en baisse — relance progressive conseillée.'));
        }
      }
      if (!out.cMonthly) out.cMonthly = v('info', `${g.km_per_week} km/semaine en moyenne sur la période.`);
    })();

    // ---- Hebdo vs objectif ----
    (function () {
      const r = g.goal_hit_rate;
      out.cWeekly = v(up(r, [20, 40, 60, 80]), `Objectif hebdo atteint <b>${r} %</b> des semaines (meilleure série ${g.best_week_streak} sem.). ` +
        (r >= 60 ? 'Belle régularité.' : r >= 40 ? 'Régularité correcte, vise la constance.' : 'Trop de semaines sous l\'objectif — la régularité est ton premier levier.'));
    })();

    // ---- Cumul annuel à date égale ----
    (function () {
      const yrs = Object.keys(D.cumulative);
      if (yrs.length >= 2) {
        const yl = yrs[yrs.length - 1], yp = yrs[yrs.length - 2];
        const cl = D.cumulative[yl], cp = D.cumulative[yp];
        const doy = cl[cl.length - 1].doy, kmL = cl[cl.length - 1].km;
        let kmP = 0; for (const p of cp) { if (p.doy <= doy) kmP = p.km; else break; }
        if (kmP > 0) {
          const ratio = kmL / kmP, diff = (kmL - kmP).toFixed(0);
          out.cCum = v(up(ratio, [0.6, 0.8, 0.95, 1.05]), `<b>${kmL} km</b> en ${yl} contre ${kmP} km à la même date en ${yp} (${diff >= 0 ? '+' : ''}${diff} km). ` +
            (ratio >= 1.05 ? 'Tu bats ton rythme de l\'an dernier.' : ratio >= 0.95 ? 'Au niveau de l\'an dernier.' : 'En retard sur l\'an dernier.'));
        }
      } else out.cCum = v('info', 'Première saison de données : pas encore de comparaison annuelle.');
    })();

    // ---- Forme CTL/TSB ----
    (function () {
      const f = D.fitness;
      if (f.length > 20) {
        const cur = f[f.length - 1], peak = f.reduce((a, b) => b.ctl > a.ctl ? b : a);
        const ratio = peak.ctl > 0 ? cur.ctl / peak.ctl : 0;
        const rising = cur.ctl - f[Math.max(0, f.length - 21)].ctl;
        out.cForm = v(up(ratio, [0.3, 0.5, 0.7, 0.85]), `Fitness actuelle <b>${cur.ctl}</b> (pic ${peak.ctl}, ${Math.round(ratio * 100)} %), fraîcheur ${cur.tsb >= 0 ? '+' : ''}${cur.tsb}. ` +
          (rising > 1 ? 'En construction 👍' : rising < -1 ? 'En baisse — tu perds du fond.' : 'Stable.'));
      }
    })();

    // ---- ACWR ----
    (function () {
      const a = (D.acwr || []).filter(p => p.ratio !== null);
      if (a.length) {
        const r = a[a.length - 1].ratio;
        let key, txt;
        if (r > 1.5) { key = 'faible'; txt = 'Zone rouge : montée de charge trop brutale, risque de blessure élevé. Allège la semaine.'; }
        else if (r > 1.3) { key = 'moyen'; txt = 'Légèrement au-dessus de la zone optimale — surveille la fatigue.'; }
        else if (r >= 0.8) { key = 'excellent'; txt = 'Dans la zone optimale 0,8–1,3 : progression sûre.'; }
        else { key = 'bof'; txt = 'Sous-charge : tu peux augmenter le volume (+10 %/sem max).'; }
        const verdict = v(key, `ACWR <b>${r}</b>. ${txt}`);
        out.cAcwr = verdict; out.cAcwrGauge = verdict;
      }
    })();

    // ---- Progression allure ----
    (function () {
      const p = D.progression;
      if (p.length >= 6) {
        const firstMa = p[Math.min(4, p.length - 1)].ma, lastMa = p[p.length - 1].ma;
        const ds = (firstMa - lastMa) * 60; // + = plus rapide aujourd'hui
        out.cProg = v(up(ds, [-15, -5, 5, 15]), `Allure lissée passée de ${fmtPace(firstMa)} à <b>${fmtPace(lastMa)}/km</b> (${ds >= 0 ? '−' : '+'}${Math.abs(Math.round(ds))} s/km). ` +
          (ds >= 5 ? 'Tu cours plus vite à effort suivi 🚀' : Math.abs(ds) < 5 ? 'Allure stable sur la période.' : 'Allure en recul — vérifie fatigue et fraîcheur.'));
      }
    })();

    // ---- Efficacité aérobie (cPaceHr + cEff) ----
    (function () {
      const mh = D.monthly.filter(m => m.hr && m.pace);
      if (mh.length >= 4) {
        const eff = arr => mean(arr.map(m => (1 / m.pace) / m.hr)) * 1000; // vitesse par battement
        const recent = mh.slice(-3), early = mh.slice(0, 3);
        const imp = eff(recent) / eff(early) - 1;
        const hrNow = Math.round(mean(recent.map(m => m.hr)));
        const verdict = v(up(imp, [-0.04, -0.005, 0.02, 0.05]), `Efficacité aérobie <b>${imp >= 0 ? '+' : ''}${Math.round(imp * 100)} %</b> vs le début (FC ${hrNow} bpm récemment). ` +
          (imp >= 0.02 ? 'Ton moteur s\'améliore : moins de FC pour la même vitesse.' : Math.abs(imp) < 0.02 ? 'Efficacité stable.' : 'FC plus haute à allure égale — fatigue ou perte de fond.'));
        out.cPaceHr = verdict; out.cEff = verdict;
      }
    })();

    // ---- Zones cardiaques (polarisation) ----
    (function () {
      const z = D.zones, tot = Object.values(z).reduce((a, b) => a + b, 0);
      if (tot > 0) {
        const easy = (z['Z1 <60%'] || 0) + (z['Z2 60-70%'] || 0), frac = easy / tot;
        out.cZones = v(up(frac, [0.25, 0.40, 0.55, 0.70]), `<b>${Math.round(frac * 100)} %</b> du temps en zones faciles (Z1-Z2). ` +
          (frac >= 0.7 ? 'Bonne base d\'endurance (proche du 80/20).' : frac >= 0.4 ? 'Un peu trop de tempo — ajoute des footings vraiment lents.' : 'Beaucoup trop d\'intensité : la plupart des sorties sont « au tempo ». Plus de sorties faciles = progrès aérobie et moins de blessures.'));
      }
    })();

    // ---- Cadence ----
    (function () {
      if (g.avg_cad) {
        const c = g.avg_cad;
        out.cCad = v(up(c, [158, 163, 168, 173]), `Cadence moyenne <b>${c} pas/min</b> (cible 170-180). ` +
          (c >= 170 ? 'Foulée efficace.' : c >= 163 ? 'Proche de la cible, gagne encore quelques spm.' : 'Cadence basse → foulées longues et impact élevé. Travaille +5 spm au métronome.') +
          (g.cad_derived ? ' <span style="opacity:.7">(estimée depuis les pas)</span>' : ''));
      }
    })();

    // ---- Matrice cadence × allure ----
    (function () {
      const pts = D.runs.filter(r => r.cad && r.pace);
      if (pts.length > 9) {
        const mx = mean(pts.map(r => r.pace)), my = mean(pts.map(r => r.cad));
        let num = 0, den = 0;
        for (const r of pts) { num += (r.pace - mx) * (r.cad - my); den += (r.pace - mx) ** 2; }
        const slope = den ? -(num / den) : 0; // spm gagnés par min/km plus rapide
        out.cMatrix = v(up(slope, [-0.5, 0.5, 2, 4]), `<b>${slope >= 0 ? '+' : ''}${slope.toFixed(1)} spm</b> par min/km gagnée. ` +
          (slope > 2 ? 'Ta cadence grimpe bien avec la vitesse.' : slope > 0.5 ? 'Réaction modérée de la cadence à l\'allure.' : 'Cadence quasi figée quand tu accélères → tu allonges la foulée (sur-enjambement).'));
      }
    })();

    // ---- Calendrier / fréquence ----
    (function () {
      const rpw = g.runs_per_week;
      out.calendar = v(up(rpw, [1, 2, 3, 4]), `<b>${rpw} sorties/semaine</b> en moyenne. ` +
        (rpw >= 3 ? 'Fréquence solide.' : rpw >= 2 ? 'Fréquence correcte, vise 3/sem.' : 'Fréquence faible — la régularité prime sur la durée des sorties.'));
    })();

    // ---- Répartition distances / base d'endurance ----
    (function () {
      const runs = D.runs;
      if (runs.length) {
        const share = runs.filter(r => r.km >= 10).length / runs.length;
        out.cHist = v(up(share, [0.02, 0.06, 0.12, 0.20]), `<b>${Math.round(share * 100)} %</b> de tes sorties font ≥ 10 km. ` +
          (share >= 0.12 ? 'Bon volume de sorties longues.' : share >= 0.06 ? 'Quelques sorties longues — une par semaine consoliderait l\'endurance.' : 'Très peu de sorties longues : ajoute une sortie longue hebdo pour préparer les distances.'));
      }
    })();

    // ---- Jour de semaine (info) ----
    (function () {
      const d = D.dow, tot = d.reduce((a, b) => a + b, 0);
      if (tot) {
        const max = Math.max(...d), idx = d.indexOf(max), conc = Math.round(100 * max / tot);
        const names = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
        out.cDow = v('info', `Jour favori : <b>${names[idx]}</b> (${conc} % des sorties). ` +
          (conc > 40 ? 'Répartition concentrée sur peu de jours.' : 'Répartition plutôt équilibrée sur la semaine.'));
      }
    })();

    // ---- Température (info) ----
    (function () {
      const tp = D.temp_pace;
      if (tp.length >= 8) {
        const mx = mean(tp.map(r => r.temp)), my = mean(tp.map(r => r.pace));
        let num = 0, dx = 0, dy = 0;
        for (const r of tp) { num += (r.temp - mx) * (r.pace - my); dx += (r.temp - mx) ** 2; dy += (r.pace - my) ** 2; }
        const corr = dx && dy ? num / Math.sqrt(dx * dy) : 0;
        out.cTemp = v('info', Math.abs(corr) < 0.25 ? `Allure peu sensible à la température (corrélation ${corr.toFixed(2)}).`
          : corr > 0 ? `Tu ralentis quand il fait chaud (corrélation ${corr.toFixed(2)}).`
          : `Plutôt plus rapide par temps doux/chaud (corrélation ${corr.toFixed(2)}).`);
      }
    })();

    // ---- Usure chaussures ----
    (function () {
      const shoes = D.gear.filter(s => s.name !== 'Sans matériel');
      if (shoes.length) {
        const worst = shoes.reduce((a, b) => b.km > a.km ? b : a), pct = Math.round(100 * worst.km / 600);
        const key = pct < 60 ? 'excellent' : pct < 75 ? 'bien' : pct < 85 ? 'moyen' : pct < 100 ? 'bof' : 'faible';
        out.shoeBars = v(key, `${worst.name} : <b>${worst.km} km</b> (${pct} % des ~600 km). ` +
          (pct < 75 ? 'Encore de la marge.' : pct < 100 ? 'Approche de la fin de vie — surveille les sensations.' : 'Au-delà du repère d\'usure : pense à remplacer.'));
      }
    })();

    // ---- Projection annuelle ----
    (function () {
      const p = D.projection;
      if (p && p.prev_year_km) {
        const ratio = p.km_proj / p.prev_year_km;
        out.projBody = v(up(ratio, [0.7, 0.85, 1.0, 1.1]), `Projection <b>${p.km_proj} km</b> vs ${p.prev_year_km} km l'an dernier (${Math.round(ratio * 100)} %). ` +
          (ratio >= 1 ? 'En route pour un record annuel.' : 'Sous le total de l\'an dernier au rythme actuel.'));
      }
    })();

    // ---- Objectif adaptatif de la semaine ----
    (function () {
      const w = D.weekly;
      if (w.length >= 2) {
        const cur = w[w.length - 1], prev = w.slice(-4, -1);
        const avg = prev.length ? mean(prev.map(x => x.km)) : 0;
        const target = Math.max(cur.goal, Math.round(avg * 1.1 * 10) / 10);
        const pct = target > 0 ? cur.km / target : 0;
        out.goalBody = v(up(pct, [0.25, 0.5, 0.8, 1.0]), `<b>${cur.km} km</b> cette semaine sur ${target} km visés (${Math.round(pct * 100)} %). ` +
          (pct >= 1 ? 'Objectif de la semaine atteint 🎉' : pct >= 0.5 ? 'En bonne voie cette semaine.' : 'Semaine en retard sur la cible (début de semaine ?).'));
      }
    })();

    // ---- Apple Santé : physiologie, récupération, biomécanique ----
    (function () {
      const H = D.health;
      if (!H || !H.has) return;
      const s = H.sum;
      if (s.vo2) out.cVo2 = v(up(s.vo2.latest, [40, 45, 50, 55]), `VO₂max <b>${s.vo2.latest}</b> ml/kg/min` +
        (s.rhr ? `, FC repos ${s.rhr.latest} bpm` : '') + `. ` +
        (s.vo2.improving ? 'Forme cardio en progression 📈.' : 'Forme cardio stable — un bloc de VMA la relancerait.'));
      if (H.readiness) {
        const rd = H.readiness.latest;
        out.cReady = v(up(rd, [32, 45, 60, 75]), `Readiness <b>${rd}/100</b> (${H.readiness.label})` +
          (s.hrv ? `, VFC ${s.hrv.latest} ms` : '') + `. ` +
          (rd >= 60 ? 'Prêt pour une séance de qualité.' : rd >= 45 ? 'Séance modérée recommandée.' : 'Repos ou sortie très facile conseillés.'));
      }
      // Croisement récup × charge
      (function () {
        const a = (D.acwr || []).filter(p => p.ratio !== null);
        if (!H.readiness || !a.length) return;
        const ac = a[a.length - 1].ratio, rd = H.readiness.latest;
        let key, txt;
        if (ac > 1.3 && rd < 50) { key = 'faible'; txt = `charge haute (ACWR ${ac}) ET récup basse (${rd}) — zone de surentraînement, allège.`; }
        else if (ac < 0.8 && rd >= 60) { key = 'excellent'; txt = `récup pleine (${rd}) et charge basse — fenêtre idéale pour pousser le volume.`; }
        else if (ac > 1.3) { key = 'moyen'; txt = `charge haute (ACWR ${ac}) mais récup OK (${rd}) — tu encaisses, surveille la VFC.`; }
        else { key = 'bien'; txt = `équilibre sain (ACWR ${ac}, readiness ${rd}).`; }
        out.cRecovery = v(key, `Charge vs récupération : ${txt}`);
      })();
      if (s.sleep) out.cSleep = v(up(s.sleep.avg, [6, 6.5, 7, 7.5]), `Sommeil moyen <b>${s.sleep.avg} h</b> (profond ${s.sleep.deepPct} %). ` +
        (s.sleep.avg >= 7 ? 'Durée suffisante pour récupérer.' : 'Sous 7 h : première limite à ta progression.'));
      if (s.gct || s.vosc) {
        const parts = [];
        if (s.gct) parts.push(`contact sol ${s.gct.latest} ms`);
        if (s.vosc) parts.push(`oscillation ${s.vosc.latest} cm`);
        const good = (!s.gct || s.gct.latest < 300) && (!s.vosc || s.vosc.latest < 10);
        out.cBio1 = v(good ? 'bien' : 'moyen', `${parts.join(' · ')}. ` +
          (good ? 'Foulée économique.' : 'Marge pour réduire le temps au sol / le rebond vertical.'));
      }
      if (s.cadence) out.bioStrip = v(up(s.cadence.mean, [158, 163, 168, 173]), `Cadence mesurée <b>${s.cadence.mean} pas/min</b> de moyenne. ` +
        (s.cadence.mean >= 170 ? 'Foulée efficace.' : 'Vise +5 spm par paliers (métronome).'));
    })();

    // ---- Renforcement (4 séances/sem) — programme réel suivi après la muscu ----
    (function () {
      const sh = D.shield;
      if (!sh || !sh.total) return;
      out.checklist = v(up(sh.score, [25, 50, 75, 100]), `<b>${sh.done}/${sh.total}</b> séances de renforcement validées cette semaine (${sh.score} %). ` +
        (sh.score >= 75 ? 'Excellent travail invisible — c\'est ce qui protège tendons et genoux pendant les montées de charge.'
          : sh.score >= 50 ? 'Bon rythme, vise les 4 séances pour le plein effet.'
            : sh.score > 0 ? 'Peu de renforcement cette semaine — c\'est ton bouclier anti-blessure n°1.'
              : 'Aucune séance validée — pense à cocher tes routines au fil de la semaine.'));
    })();

    // ---- Score global ----
    const rated = Object.values(out).filter(x => x.lvl >= 0);
    if (rated.length) {
      const score = Math.round(mean(rated.map(x => x.lvl)) / 4 * 100);
      const cnt = [0, 0, 0, 0, 0];
      rated.forEach(x => cnt[x.lvl]++);
      const key = up(score, [35, 50, 65, 80]);
      out._overall = Object.assign({}, T[key], {
        score, cnt,
        label: score >= 80 ? 'État de forme excellent' : score >= 65 ? 'Bon état de forme'
          : score >= 50 ? 'État correct' : score >= 35 ? 'À consolider' : 'Fragile',
      });
    }
    return out;
  }

  (typeof window !== 'undefined' ? window : globalThis).computeVerdicts = compute;
})();
