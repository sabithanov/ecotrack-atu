/* Analytics & Dashboard, единый реестр, сводный отчёт (Consolidation & Reporting). */
(function () {
  window.Views = window.Views || {};

  function sum(list, fn) { return list.reduce(function (s, x) { return s + fn(x); }, 0); }
  function kgOf(list) { return sum(list, function (e) { return API.kg(e); }); }
  function inMonth(list, p) { return list.filter(function (e) { return e.date.slice(0, 7) === p; }); }
  function inMonths(list, ps) { return list.filter(function (e) { return ps.indexOf(e.date.slice(0, 7)) >= 0; }); }
  function groupBy(list, keyFn) { var g = {}; list.forEach(function (e) { var k = keyFn(e); (g[k] = g[k] || []).push(e); }); return g; }
  function delta(a, b) { return b > 0 ? (a - b) / b : null; }
  function deltaHtml(d, invert) {
    if (d == null) return '<span class="muted">—</span>';
    if (d === -1) return '<span class="muted small">' + esc(t('нет данных')) + '</span>';
    var up = d > 0, good = invert ? up : !up;
    return '<span class="delta ' + (Math.abs(d) < 0.005 ? '' : good ? 'good' : 'bad') + '">' + (up ? '▲ ' : '▼ ') + pct(Math.abs(d), 0) + '</span>';
  }
  function daysInMonth(p) { return new Date(+p.slice(0, 4), +p.slice(5, 7), 0).getDate(); }
  function elapsedDays(p) {
    var today = API.todayStr();
    if (p < today.slice(0, 7)) return daysInMonth(p);
    if (p > today.slice(0, 7)) return 0;
    return +today.slice(8, 10);
  }
  window.Analytics = { kgOf: kgOf, inMonth: inMonth, groupBy: groupBy };

  /* Отклонения: доля вида отхода в общей массе организации за месяц vs средняя доля за 3 предыдущих месяца.
     Доля не зависит от сезонности (каникулы, загрузка гостиницы) и неполного текущего месяца. */
  function findAnomalies(entries, M, thresholdPct, orgName) {
    var prev = [addMonths(M, -3), addMonths(M, -2), addMonths(M, -1)];
    var byOrg = groupBy(entries, function (e) { return e.orgId; });
    var out = [];
    Object.keys(byOrg).forEach(function (oid) {
      var ol = byOrg[oid];
      var totM = kgOf(inMonth(ol, M));
      if (totM <= 0) return;
      var totP = {}; prev.forEach(function (p) { totP[p] = kgOf(inMonth(ol, p)); });
      var g = groupBy(ol, function (e) { return API.wasteType(e.typeId).name; });
      Object.keys(g).forEach(function (name) {
        var list = g[name];
        var cur = kgOf(inMonth(list, M));
        if (cur <= 0) return;
        var shares = prev.filter(function (p) { return totP[p] > 0; }).map(function (p) { return kgOf(inMonth(list, p)) / totP[p]; });
        if (shares.length < 2) return;
        var avg = shares.reduce(function (s, x) { return s + x; }, 0) / shares.length;
        if (avg < 0.02) return;
        var share = cur / totM, d = (share - avg) / avg;
        if (d * 100 > thresholdPct) out.push({ orgId: oid, org: orgName[oid], type: name, rate: share, avg: avg, d: d, kg: cur });
      });
    });
    return out.sort(function (a, b) { return b.d - a.d; });
  }

  /* ======================= DASHBOARD ======================= */
  Views.dashboard = function (user, h) {
    var view = $('#view');
    var isResp = user.role === 'resp';
    var pending = !isResp && sessionStorage.getItem('ecotrack_pending') === '1';
    var settings = API.settings();
    var orgs = API.orgs({ all: true });
    var orgName = {}; orgs.forEach(function (o) { orgName[o.id] = o.short; });
    var all = API.analyticsEntries(pending);
    var cur = API.todayStr().slice(0, 7);
    var months = all.length ? monthRange(all.reduce(function (m, e) { var p = e.date.slice(0, 7); return p < m ? p : m; }, cur), cur) : [cur];
    var M = h.q.m || (inMonth(all, cur).length ? cur : addMonths(cur, -1));
    var threshold = +(sessionStorage.getItem('ecotrack_thr') || settings.anomalyPct || 30);
    var P = addMonths(M, -1);
    var eM = inMonth(all, M), eP = inMonth(all, P);
    var kgM = kgOf(eM), kgP = kgOf(eP);
    var recM = kgOf(eM.filter(function (e) { return API.wasteType(e.typeId).recyclable; }));
    var divM = kgOf(eM.filter(function (e) { return API.isDiverted(e); }));
    var co2M = sum(eM, function (e) { return API.co2(e); }), co2P = sum(eP, function (e) { return API.co2(e); });
    var saveM = sum(eM, function (e) { return API.co2Saving(e); });
    var reportsM = API.reports({ period: M });
    var activeOrgs = orgs.filter(function (o) { return o.active; });
    var accN = reportsM.filter(function (r) { return r.status === 'accepted'; }).length;
    var ed = elapsedDays(M), partial = ed < daysInMonth(M);

    var html = '<div class="page-head"><div><h1>' + esc(isResp ? t('Аналитика организации') : t('Dashboard')) + '</h1><p class="muted">' +
      esc(isResp ? API.org(user.orgId).name : (pending ? t('Все данные, включая неподтверждённые отчёты') : t('Данные единого реестра (принятые отчёты)'))) + '</p></div>' +
      '<div class="head-actions"><label class="field inline"><span>' + esc(t('Месяц')) + '</span><select id="d-month">' + months.slice().reverse().map(function (p) { return '<option value="' + p + '"' + (p === M ? ' selected' : '') + '>' + esc(monthLabel(p)) + '</option>'; }).join('') + '</select></label>' +
      (!isResp ? '<label class="check"><input type="checkbox" id="d-pending"' + (pending ? ' checked' : '') + '> ' + esc(t('включая неподтверждённые')) + '</label>' : '') + '</div></div>';

    if (partial && ed > 0) html += '<div class="alert info small">' + esc(t('Текущий месяц не завершён: данные за {n} дн. из {m}. Изменение к прошлому месяцу покажем после его завершения; отклонения считаются по структуре отходов.', { n: ed, m: daysInMonth(M) })) + '</div>';

    html += '<div class="kpis">' +
      '<div class="kpi"><span>' + esc(t('Масса отходов за месяц')) + '</span><b>' + fmt(kgM, 0) + ' ' + esc(t('кг')) + '</b><small>' + deltaHtml(partial ? null : delta(kgM, kgP)) + ' ' + esc(t('к прошлому месяцу')) + '</small></div>' +
      '<div class="kpi"><span>' + esc(t('Пригодно к переработке')) + '</span><b>' + (kgM ? pct(recM / kgM, 0) : '—') + '</b><small>' + fmt(recM, 0) + ' ' + esc(t('кг')) + '</small></div>' +
      '<div class="kpi"><span>' + esc(t('Фактически переработано')) + '</span><b>' + (kgM ? pct(divM / kgM, 0) : '—') + '</b><small>' + fmt(divM, 0) + ' ' + esc(t('кг')) + '</small></div>' +
      '<div class="kpi"><span>CO₂-' + esc(t('эквивалент')) + '</span><b>' + fmt(co2M / 1000, 2) + ' ' + esc(t('т')) + '</b><small>' + deltaHtml(partial ? null : delta(co2M, co2P)) + '</small></div>' +
      '<div class="kpi accent"><span>' + esc(t('Потенциал снижения CO₂')) + '</span><b>' + fmt(saveM / 1000, 2) + ' ' + esc(t('т')) + '</b><small>' + esc(t('если пригодные отходы не захоранивать')) + '</small></div>' +
      (isResp ? '' : '<div class="kpi"><span>' + esc(t('Отчётов принято')) + '</span><b>' + accN + ' / ' + activeOrgs.length + '</b><small>' + esc(monthLabel(M)) + '</small></div>') +
      '</div>';

    html += '<div class="charts">' +
      '<section class="card chart-card wide"><h2>' + esc(t('Динамика массы отходов по месяцам, кг')) + '</h2><div class="chart-box"><canvas id="c-dyn"></canvas></div></section>' +
      '<section class="card chart-card"><h2>' + esc(t('Структура по видам отходов')) + ' · ' + esc(monthLabel(M)) + '</h2><div class="chart-box"><canvas id="c-struct"></canvas></div></section>' +
      '<section class="card chart-card"><h2>' + esc(isResp ? t('Виды отходов: месяц к месяцу, кг') : t('Сравнение организаций, кг')) + '</h2><div class="chart-box"><canvas id="c-cmp"></canvas></div></section>' +
      '<section class="card chart-card"><h2>' + esc(t('Способы утилизации')) + '</h2><div class="chart-box"><canvas id="c-meth"></canvas></div></section>' +
      '<section class="card chart-card"><h2>' + esc(t('Доля пригодных к переработке и CO₂ по месяцам')) + '</h2><div class="chart-box"><canvas id="c-rec"></canvas></div></section>' +
      '</div>';

    // Сравнение периодов
    var Q = quarterOf(M), qMonths = quarterMonths(Q), pqMonths = quarterMonths(quarterOf(addMonths(qMonths[0], -1)));
    var keyFn = isResp ? function (e) { return API.wasteType(e.typeId).name; } : function (e) { return e.orgId; };
    var keys = Object.keys(groupBy(inMonths(all, qMonths.concat(pqMonths, [M, P])), keyFn));
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('Сравнение периодов')) + '</h2><span class="muted small">' + esc(t('месяц к месяцу и квартал к кварталу')) + '</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(isResp ? t('Вид отхода') : t('Организация')) + '</th>' +
      '<th class="num">' + esc(monthLabel(M, true)) + '</th><th class="num">' + esc(monthLabel(P, true)) + '</th><th class="num">Δ</th>' +
      '<th class="num">' + esc(quarterLabel(Q)) + '</th><th class="num">' + esc(quarterLabel(quarterOf(pqMonths[0]))) + '</th><th class="num">Δ</th></tr></thead><tbody>' +
      keys.map(function (k) {
        var l = all.filter(function (e) { return keyFn(e) === k; });
        var a = kgOf(inMonth(l, M)), b = kgOf(inMonth(l, P)), qa = kgOf(inMonths(l, qMonths)), qb = kgOf(inMonths(l, pqMonths));
        return '<tr><td>' + esc(isResp ? k : orgName[k]) + '</td><td class="num">' + fmt(a, 0) + '</td><td class="num">' + fmt(b, 0) + '</td><td class="num">' + deltaHtml(partial ? null : delta(a, b)) + '</td><td class="num">' + fmt(qa, 0) + '</td><td class="num">' + fmt(qb, 0) + '</td><td class="num">' + deltaHtml(qMonths.indexOf(cur) >= 0 ? null : delta(qa, qb)) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';

    // Отклонения
    var anomalies = findAnomalies(all, M, threshold, orgName);
    html += '<section class="card"><div class="card-head"><h2>⚠ ' + esc(t('Отклонения')) + '</h2><label class="field inline"><span>' + esc(t('Порог роста, %')) + '</span><input type="number" id="d-thr" min="5" max="300" step="5" value="' + threshold + '" style="width:80px"></label></div>' +
      '<p class="muted small">' + esc(t('Доля вида отхода в общей массе организации за месяц сравнивается со средней долей за 3 предыдущих месяца (без влияния сезонности и неполного месяца).')) + '</p>' +
      (anomalies.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Организация')) + '</th><th>' + esc(t('Вид отхода')) + '</th><th class="num">' + esc(t('кг за месяц')) + '</th><th class="num">' + esc(t('Доля сейчас')) + '</th><th class="num">' + esc(t('Доля в среднем')) + '</th><th class="num">' + esc(t('Рост')) + '</th></tr></thead><tbody>' +
        anomalies.map(function (a) { return '<tr><td>' + esc(a.org) + '</td><td>' + esc(a.type) + '</td><td class="num">' + fmt(a.kg, 1) + '</td><td class="num">' + pct(a.rate, 1) + '</td><td class="num">' + pct(a.avg, 1) + '</td><td class="num"><span class="delta bad">▲ ' + pct(a.d, 0) + '</span></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="ok-text">✓ ' + esc(t('Отклонений выше порога не обнаружено')) + '</p>') + '</section>';

    // Рекомендации и экопоказатели
    var recs = buildRecommendations(all, M, anomalies, orgName, isResp);
    var yStart = M.slice(0, 4) + '-01';
    var eY = all.filter(function (e) { return e.date.slice(0, 7) >= yStart && e.date.slice(0, 7) <= M; });
    var kgY = kgOf(eY), co2Y = sum(eY, function (e) { return API.co2(e); }), saveY = sum(eY, function (e) { return API.co2Saving(e); });
    html += '<div class="grid2 gap">' +
      '<section class="card"><div class="card-head"><h2>💡 ' + esc(t('Рекомендации по сокращению отходов')) + '</h2></div><ul class="recs">' + recs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul></section>' +
      '<section class="card eco"><div class="card-head"><h2>🌱 ' + esc(t('Экопоказатели с начала года')) + '</h2><span class="muted small">' + esc(t('ЦУР 12.3')) + '</span></div>' +
      '<div class="kpis two"><div class="kpi"><span>' + esc(t('Масса отходов')) + '</span><b>' + fmt(kgY / 1000, 2) + ' ' + esc(t('т')) + '</b></div>' +
      '<div class="kpi"><span>CO₂-' + esc(t('эквивалент')) + '</span><b>' + fmt(co2Y / 1000, 2) + ' ' + esc(t('т')) + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Можно сократить CO₂')) + '</span><b>' + fmt(saveY / 1000, 2) + ' ' + esc(t('т')) + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('≈ км пробега авто')) + '</span><b>' + fmt(co2Y / 0.17, 0) + '</b></div></div>' +
      '<p class="small muted">' + esc(t('Коэффициенты CO₂: UK DESNZ/DEFRA GHG Conversion Factors 2024 (Waste disposal): пищевые отходы на полигоне ≈ 0,70 кг CO₂-экв./кг, картон ≈ 1,04, пластик/стекло/металл ≈ 0,009, переработка/компост ≈ 0,01. Авто ≈ 0,17 кг CO₂/км. Коэффициенты редактируются в справочнике.')) + '</p></section></div>';

    view.innerHTML = html;

    $('#d-month').onchange = function () { go('dashboard?m=' + this.value); };
    if ($('#d-pending')) $('#d-pending').onchange = function () { sessionStorage.setItem('ecotrack_pending', this.checked ? '1' : '0'); route(); };
    $('#d-thr').onchange = function () { sessionStorage.setItem('ecotrack_thr', this.value); route(); };

    // ---- графики
    var last6 = monthRange(addMonths(M, -5), M);
    while (last6.length > 1 && !inMonth(all, last6[0]).length) last6.shift();
    var seriesKeys = isResp ? Object.keys(CATEGORIES) : activeOrgs.map(function (o) { return o.id; });
    makeChart($('#c-dyn'), {
      type: 'bar',
      data: {
        labels: last6.map(function (p) { return monthLabel(p, true); }),
        datasets: seriesKeys.map(function (k, i) {
          return {
            label: isResp ? t(CATEGORIES[k]) : orgName[k], backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 3,
            data: last6.map(function (p) { return Math.round(kgOf(inMonth(all, p).filter(function (e) { return isResp ? API.wasteType(e.typeId).category === k : e.orgId === k; }))); })
          };
        }).filter(function (ds) { return ds.data.some(function (v) { return v > 0; }); })
      },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
    });
    var byType = groupBy(eM, function (e) { return API.wasteType(e.typeId).name; });
    var tRows = Object.keys(byType).map(function (k) { return [k, kgOf(byType[k])]; }).sort(function (a, b) { return b[1] - a[1]; });
    var top = tRows.slice(0, 7), rest = tRows.slice(7).reduce(function (s, x) { return s + x[1]; }, 0);
    if (rest > 0) top.push([t('Прочие'), rest]);
    makeChart($('#c-struct'), {
      type: 'doughnut',
      data: { labels: top.map(function (x) { return x[0]; }), datasets: [{ data: top.map(function (x) { return Math.round(x[1]); }), backgroundColor: PALETTE }] },
      options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }, cutout: '55%' }
    });
    if (isResp) {
      var names = Object.keys(groupBy(eM.concat(eP), function (e) { return API.wasteType(e.typeId).name; }));
      makeChart($('#c-cmp'), {
        type: 'bar',
        data: {
          labels: names.map(function (n) { return n.length > 22 ? n.slice(0, 21) + '…' : n; }), datasets: [
            { label: monthLabel(P, true), backgroundColor: '#94a3b8', data: names.map(function (n) { return Math.round(kgOf(eP.filter(function (e) { return API.wasteType(e.typeId).name === n; }))); }) },
            { label: monthLabel(M, true), backgroundColor: '#1f8a4c', data: names.map(function (n) { return Math.round(kgOf(eM.filter(function (e) { return API.wasteType(e.typeId).name === n; }))); }) }]
        },
        options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } } }
      });
    } else {
      makeChart($('#c-cmp'), {
        type: 'bar',
        data: {
          labels: activeOrgs.map(function (o) { return o.short; }), datasets: [
            { label: monthLabel(P, true), backgroundColor: '#94a3b8', data: activeOrgs.map(function (o) { return Math.round(kgOf(eP.filter(function (e) { return e.orgId === o.id; }))); }) },
            { label: monthLabel(M, true), backgroundColor: '#1f8a4c', data: activeOrgs.map(function (o) { return Math.round(kgOf(eM.filter(function (e) { return e.orgId === o.id; }))); }) }]
        },
        options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } } }
      });
    }
    var byM = groupBy(eM, function (e) { var m = API.method(e.methodId); return m ? m.name : '—'; });
    var mk = Object.keys(byM);
    makeChart($('#c-meth'), {
      type: 'pie',
      data: { labels: mk, datasets: [{ data: mk.map(function (k) { return Math.round(kgOf(byM[k])); }), backgroundColor: ['#64748b', '#94a3b8', '#1f8a4c', '#0891b2', '#65a30d', '#ca8a04'] }] },
      options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
    makeChart($('#c-rec'), {
      data: {
        labels: last6.map(function (p) { return monthLabel(p, true); }),
        datasets: [
          { type: 'line', label: t('Пригодно к переработке, %'), yAxisID: 'y1', borderColor: '#1f8a4c', backgroundColor: '#1f8a4c', tension: .3, data: last6.map(function (p) { var l = inMonth(all, p), k = kgOf(l); return k ? Math.round(kgOf(l.filter(function (e) { return API.wasteType(e.typeId).recyclable; })) / k * 100) : null; }) },
          { type: 'line', label: t('Фактически переработано, %'), yAxisID: 'y1', borderColor: '#2563eb', backgroundColor: '#2563eb', tension: .3, data: last6.map(function (p) { var l = inMonth(all, p), k = kgOf(l); return k ? Math.round(kgOf(l.filter(function (e) { return API.isDiverted(e); })) / k * 100) : null; }) },
          { type: 'bar', label: 'CO₂, ' + t('кг'), yAxisID: 'y', backgroundColor: 'rgba(224,138,0,.35)', data: last6.map(function (p) { return Math.round(sum(inMonth(all, p), function (e) { return API.co2(e); })); }) }
        ]
      },
      options: { scales: { y: { beginAtZero: true, position: 'left' }, y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false } } }, plugins: { legend: { position: 'bottom' } } }
    });
  };

  function buildRecommendations(all, M, anomalies, orgName, isResp) {
    var recs = [];
    var eM = inMonth(all, M);
    anomalies.slice(0, 3).forEach(function (a) {
      var tip = /нереализ/i.test(a.type) ? t('скорректируйте объём производства по прогнозу посещаемости, внедрите продажу со скидкой в конце дня')
        : /зала|остатки еды/i.test(a.type) ? t('проверьте размер порций и меню; рассмотрите опрос посетителей')
          : /жмых/i.test(a.type) ? t('кофейный жмых можно передавать на компост или как субстрат для грибов')
            : t('проверьте закупки и технологические потери');
      recs.push('<b>' + esc(a.org) + '</b>: ' + esc(t('доля')) + ' «' + esc(a.type) + '» ' + esc(t('выше средней на')) + ' ' + pct(a.d, 0) + ' — ' + esc(tip) + '.');
    });
    var lf = groupBy(eM.filter(function (e) { return API.co2Saving(e) > 0; }), function (e) { return API.wasteType(e.typeId).category; });
    if (lf.paper) recs.push(esc(t('Картонная тара')) + ': ' + fmt(kgOf(lf.paper), 0) + ' ' + esc(t('кг за месяц уходит на полигон. Раздельный сбор и сдача в макулатуру снизят выбросы на ≈')) + ' ' + fmt(sum(lf.paper, function (e) { return API.co2Saving(e); }), 0) + ' ' + esc(t('кг CO₂-экв. в месяц')) + '.');
    if (lf.food) recs.push(esc(t('Пищевые органические отходы')) + ': ' + fmt(kgOf(lf.food), 0) + ' ' + esc(t('кг на полигон. Компостирование / передача на корм животным снизит выбросы на ≈')) + ' ' + fmt(sum(lf.food, function (e) { return API.co2Saving(e); }), 0) + ' ' + esc(t('кг CO₂-экв. в месяц')) + '.');
    if (lf.packaging) recs.push(esc(t('Упаковка (ПЭТ, стекло, алюминий)')) + ': ' + fmt(kgOf(lf.packaging), 1) + ' ' + esc(t('кг — установите контейнеры для вторсырья в лабораториях.')));
    var g = groupBy(eM, function (e) { return e.orgId; });
    Object.keys(g).forEach(function (oid) {
      var tot = kgOf(g[oid]);
      var uns = kgOf(g[oid].filter(function (e) { return /нереализ/i.test(API.wasteType(e.typeId).name); }));
      if (tot > 0 && uns / tot > 0.12) recs.push('<b>' + esc(orgName[oid]) + '</b>: ' + esc(t('нереализованная продукция')) + ' — ' + pct(uns / tot, 0) + ' ' + esc(t('всех отходов. Снижение на 20% даст экономию закупок ≈')) + ' ' + fmt(uns * 0.2 * 1500, 0) + ' ₸ ' + esc(t('в месяц (при 1500 ₸/кг себестоимости).')));
    });
    if (!isResp) {
      var ns = API.nonSubmitters([addMonths(M, -1)]);
      if (ns.length) recs.push(esc(t('Не сдали отчёт за')) + ' ' + esc(monthLabel(addMonths(M, -1))) + ': ' + ns.map(function (x) { return '<b>' + esc(orgName[x.orgId]) + '</b>'; }).join(', ') + '.');
    }
    if (!recs.length) recs.push(esc(t('Существенных резервов не выявлено — продолжайте учёт.')));
    return recs;
  }

  /* ======================= РЕЕСТР ======================= */
  Views.registry = function (user, h) {
    var view = $('#view');
    var orgs = API.orgs({ all: true });
    var orgName = {}; orgs.forEach(function (o) { orgName[o.id] = o.short; });
    var methods = API.methods({ all: true });
    var allAcc = API.registry({});
    var cur = API.todayStr().slice(0, 7);
    var minP = allAcc.reduce(function (m, e) { var p = e.date.slice(0, 7); return p < m ? p : m; }, cur);
    var months = monthRange(minP, cur);
    var typeNames = Object.keys(groupBy(allAcc, function (e) { return API.wasteType(e.typeId).name; })).sort();
    var f = { from: h.q.from || minP, to: h.q.to || cur, orgId: h.q.org || '', typeName: h.q.type || '', methodId: h.q.method || '' };

    function render() {
      var rows = API.registry(f).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      var kg = kgOf(rows), rec = kgOf(rows.filter(function (e) { return API.wasteType(e.typeId).recyclable; }));
      var co2 = sum(rows, function (e) { return API.co2(e); });
      var LIMIT = 300;
      var html = '<div class="page-head"><div><h1>' + esc(t('Единый реестр')) + '</h1><p class="muted">' + esc(t('Записи всех организаций из принятых отчётов')) + '</p></div>' +
        '<div class="head-actions"><button class="btn primary" id="reg-xls">⬇ ' + esc(t('Выгрузить в Excel')) + '</button></div></div>' +
        '<div class="filters card">' +
        '<label class="field"><span>' + esc(t('Период с')) + '</span><select id="g-from">' + months.map(function (p) { return '<option value="' + p + '"' + (p === f.from ? ' selected' : '') + '>' + esc(monthLabel(p)) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>' + esc(t('по')) + '</span><select id="g-to">' + months.map(function (p) { return '<option value="' + p + '"' + (p === f.to ? ' selected' : '') + '>' + esc(monthLabel(p)) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>' + esc(t('Организация')) + '</span><select id="g-org"><option value="">' + esc(t('Все')) + '</option>' + optionList(orgs, f.orgId, function (o) { return o.id; }, function (o) { return o.short; }) + '</select></label>' +
        '<label class="field"><span>' + esc(t('Вид отходов')) + '</span><select id="g-type"><option value="">' + esc(t('Все')) + '</option>' + optionList(typeNames, f.typeName, function (x) { return x; }, function (x) { return x; }) + '</select></label>' +
        '<label class="field"><span>' + esc(t('Способ утилизации')) + '</span><select id="g-method"><option value="">' + esc(t('Все')) + '</option>' + optionList(methods, f.methodId, function (m) { return m.id; }, function (m) { return m.name; }) + '</select></label>' +
        '<button class="btn ghost" id="g-reset">' + esc(t('Сбросить')) + '</button></div>' +
        '<div class="kpis"><div class="kpi"><span>' + esc(t('Записей')) + '</span><b>' + rows.length + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('Масса, кг')) + '</span><b>' + fmt(kg, 0) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('Пригодно к переработке')) + '</span><b>' + (kg ? pct(rec / kg, 0) : '—') + '</b></div>' +
        '<div class="kpi"><span>CO₂-' + esc(t('экв., кг')) + '</span><b>' + fmt(co2, 0) + '</b></div></div>' +
        '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Дата')) + '</th><th>' + esc(t('Организация')) + '</th><th>' + esc(t('Наименование отходов')) + '</th><th class="num">' + esc(t('Количество')) + '</th><th class="num">' + esc(t('кг')) + '</th><th>' + esc(t('Способ утилизации')) + '</th><th>' + esc(t('Ответственное лицо')) + '</th></tr></thead><tbody>' +
        (rows.length ? rows.slice(0, LIMIT).map(function (e) {
          var w = API.wasteType(e.typeId), m = API.method(e.methodId);
          return '<tr><td>' + dateLabel(e.date) + '</td><td>' + esc(orgName[e.orgId]) + '</td><td>' + esc(w.name) + '</td><td class="num">' + fmt(e.qty) + ' ' + unitLabel(w.unit) + '</td><td class="num">' + fmt(API.kg(e)) + '</td><td>' + esc(m ? m.name : '') + '</td><td>' + esc(API.userName(e.userId)) + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="muted center">' + esc(t('Нет данных по выбранным фильтрам')) + '</td></tr>') +
        '</tbody></table></div>' + (rows.length > LIMIT ? '<p class="muted small">' + esc(t('Показаны первые {n} из {m} записей; в Excel выгружаются все.', { n: LIMIT, m: rows.length })) + '</p>' : '') + '</div>';
      view.innerHTML = html;
      $('#g-from').onchange = function () { f.from = this.value; if (f.to < f.from) f.to = f.from; render(); };
      $('#g-to').onchange = function () { f.to = this.value; if (f.to < f.from) f.from = f.to; render(); };
      $('#g-org').onchange = function () { f.orgId = this.value; render(); };
      $('#g-type').onchange = function () { f.typeName = this.value; render(); };
      $('#g-method').onchange = function () { f.methodId = this.value; render(); };
      $('#g-reset').onclick = function () { f = { from: minP, to: cur, orgId: '', typeName: '', methodId: '' }; render(); };
      $('#reg-xls').onclick = function () { Exporter.registry(rows, f, orgName); };
    }
    render();
  };

  /* ======================= СВОДНЫЙ ОТЧЁТ ======================= */
  Views.summary = function (user, h) {
    var view = $('#view');
    var cur = API.todayStr().slice(0, 7);
    var curQ = quarterOf(cur);
    var kind = h.q.kind || 'quarter';
    var value = h.q.v || (kind === 'quarter' ? quarterOf(addMonths(quarterMonths(curQ)[0], -1)) : kind === 'year' ? cur.slice(0, 4) : addMonths(cur, -1));

    var data = buildSummary(kind, value);
    var orgs = data.orgs;
    var options;
    if (kind === 'month') options = monthRange('2026-01', cur).reverse().map(function (p) { return [p, monthLabel(p)]; });
    else if (kind === 'quarter') { options = []; for (var p = '2026-01'; p <= cur; p = addMonths(p, 3)) options.push([quarterOf(p), quarterLabel(quarterOf(p))]); options.reverse(); }
    else options = [[cur.slice(0, 4), cur.slice(0, 4)], [String(+cur.slice(0, 4) - 1), String(+cur.slice(0, 4) - 1)]];

    var html = '<div class="page-head"><div><h1>' + esc(t('Сводный отчёт')) + '</h1><p class="muted">' + esc(t('По организациям и видам отходов на основе принятых отчётов')) + '</p></div>' +
      '<div class="head-actions"><button class="btn primary" id="s-xls">⬇ Excel</button><button class="btn ghost" id="s-print">🖨 ' + esc(t('Печать / PDF')) + '</button></div></div>' +
      '<div class="filters card"><label class="field"><span>' + esc(t('Период')) + '</span><select id="s-kind">' +
      [['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год']].map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === kind ? ' selected' : '') + '>' + esc(t(k[1])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>' + esc(t('Значение')) + '</span><select id="s-val">' + options.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label></div>';

    html += '<div class="print-title"><h2>' + esc(t('Сводный отчёт по пищевым отходам университетского комплекса АО «АТУ»')) + '</h2><p>' + esc(data.label) + '</p></div>';

    html += '<div class="kpis"><div class="kpi"><span>' + esc(t('Масса, кг')) + '</span><b>' + fmt(data.totalKg, 0) + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Пригодно к переработке')) + '</span><b>' + (data.totalKg ? pct(data.recKg / data.totalKg, 0) : '—') + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Фактически переработано')) + '</span><b>' + (data.totalKg ? pct(data.divKg / data.totalKg, 0) : '—') + '</b></div>' +
      '<div class="kpi"><span>CO₂-' + esc(t('экв., т')) + '</span><b>' + fmt(data.co2 / 1000, 2) + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Отчётов принято')) + '</span><b>' + data.accepted + ' / ' + data.expected + '</b></div></div>';

    if (data.nonSub.length) html += '<section class="card"><div class="card-head"><h2>⏰ ' + esc(t('Не сдали отчёт (нет принятого отчёта)')) + '</h2><span class="badge st-returned">' + data.nonSub.length + '</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Организация')) + '</th><th>' + esc(t('Период')) + '</th><th>' + esc(t('Статус')) + '</th><th class="noprint"></th></tr></thead><tbody>' +
      data.nonSub.map(function (x) {
        var o = API.org(x.orgId);
        var resp = API.usersOfOrg(x.orgId)[0];
        var mail = resp ? 'mailto:' + encodeURIComponent(resp.email) + '?subject=' + encodeURIComponent(t('Напоминание: отчёт по пищевым отходам')) + '&body=' + encodeURIComponent(t('Просим сдать отчёт по пищевым отходам за {m} в системе EcoTrack ATU.', { m: monthLabel(x.period) })) : '';
        return '<tr><td>' + esc(o.short) + '</td><td>' + esc(monthLabel(x.period)) + '</td><td>' + statusBadge(x.status) + '</td><td class="noprint">' + (mail ? '<a class="btn ghost sm" href="' + mail + '">✉ ' + esc(t('Напомнить')) + '</a>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    else html += '<div class="alert ok">✓ ' + esc(t('Все организации сдали отчёты за период')) + '</div>';

    // Таблица A
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('1. По организациям, кг')) + '</h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Организация')) + '</th>' +
      data.months.map(function (p) { return '<th class="num">' + esc(monthLabel(p, true)) + '</th>'; }).join('') +
      '<th class="num">' + esc(t('Итого, кг')) + '</th><th class="num">♻ %</th><th class="num">CO₂, ' + esc(t('кг')) + '</th></tr></thead><tbody>' +
      data.orgRows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td>' + r.perMonth.map(function (v) { return '<td class="num">' + (v ? fmt(v, 1) : '—') + '</td>'; }).join('') + '<td class="num"><b>' + fmt(r.total, 1) + '</b></td><td class="num">' + (r.total ? pct(r.rec / r.total, 0) : '—') + '</td><td class="num">' + fmt(r.co2, 0) + '</td></tr>'; }).join('') +
      '<tr class="total"><td>' + esc(t('Итого')) + '</td>' + data.months.map(function (p, i) { return '<td class="num">' + fmt(sum(data.orgRows, function (r) { return r.perMonth[i]; }), 1) + '</td>'; }).join('') + '<td class="num">' + fmt(data.totalKg, 1) + '</td><td class="num">' + (data.totalKg ? pct(data.recKg / data.totalKg, 0) : '—') + '</td><td class="num">' + fmt(data.co2, 0) + '</td></tr>' +
      '</tbody></table></div></section>';

    // Таблица B
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('2. По организациям и видам отходов')) + '</h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Наименование отходов')) + '</th><th>' + esc(t('Ед.')) + '</th>' +
      data.months.map(function (p) { return '<th class="num">' + esc(monthLabel(p, true)) + '</th>'; }).join('') + '<th class="num">' + esc(t('Итого')) + '</th><th>' + esc(t('Способ утилизации')) + '</th></tr></thead><tbody>' +
      orgs.map(function (o) {
        var rows = data.typeRows.filter(function (r) { return r.orgId === o.id; });
        if (!rows.length) return '';
        return '<tr class="group"><td colspan="' + (data.months.length + 4) + '">' + esc(o.name) + '</td></tr>' +
          rows.map(function (r) { return '<tr><td>' + esc(r.type) + '</td><td>' + unitLabel(r.unit) + '</td>' + r.perMonth.map(function (v) { return '<td class="num">' + (v ? fmt(v, 1) : '—') + '</td>'; }).join('') + '<td class="num"><b>' + fmt(r.total, 1) + '</b></td><td class="small">' + esc(r.methods) + '</td></tr>'; }).join('');
      }).join('') + '</tbody></table></div></section>';

    // Таблица C
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('3. По способам утилизации')) + '</h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Способ')) + '</th><th class="num">' + esc(t('кг')) + '</th><th class="num">%</th></tr></thead><tbody>' +
      data.methodRows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="num">' + fmt(r.kg, 1) + '</td><td class="num">' + (data.totalKg ? pct(r.kg / data.totalKg, 1) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';

    html += '<p class="small muted">' + esc(t('Сформировано')) + ': ' + dateTimeLabel(API.nowStr()) + ' · ' + esc(user.name) + ' · EcoTrack ATU</p>';
    view.innerHTML = html;

    $('#s-kind').onchange = function () { go('summary?kind=' + this.value); };
    $('#s-val').onchange = function () { go('summary?kind=' + kind + '&v=' + this.value); };
    $('#s-xls').onclick = function () { Exporter.summary(data); };
    $('#s-print').onclick = function () { window.print(); };
  };

  function buildSummary(kind, value) {
    var cur = API.todayStr().slice(0, 7);
    var months = kind === 'month' ? [value] : kind === 'quarter' ? quarterMonths(value) : monthRange(value + '-01', value + '-12');
    var label = kind === 'month' ? monthLabel(value) : kind === 'quarter' ? quarterLabel(value) : value + ' ' + t('год');
    var dueMonths = months.filter(function (p) { return p < cur; }); // отчёты, которые уже должны быть сданы
    var rows = API.registry({ from: months[0], to: months[months.length - 1] });
    var orgs = API.orgs();
    var orgRows = orgs.map(function (o) {
      var l = rows.filter(function (e) { return e.orgId === o.id; });
      return {
        orgId: o.id, name: o.name, perMonth: months.map(function (p) { return kgOf(inMonth(l, p)); }), total: kgOf(l),
        rec: kgOf(l.filter(function (e) { return API.wasteType(e.typeId).recyclable; })), co2: sum(l, function (e) { return API.co2(e); })
      };
    });
    var typeRows = [];
    orgs.forEach(function (o) {
      var g = groupBy(rows.filter(function (e) { return e.orgId === o.id; }), function (e) { return e.typeId; });
      Object.keys(g).forEach(function (tid) {
        var w = API.wasteType(tid), l = g[tid];
        var ms = Object.keys(groupBy(l, function (e) { var m = API.method(e.methodId); return m ? m.name : '—'; }));
        typeRows.push({ orgId: o.id, org: o.name, type: w.name, unit: w.unit, perMonth: months.map(function (p) { return sum(inMonth(l, p), function (e) { return e.qty; }); }), total: sum(l, function (e) { return e.qty; }), kg: kgOf(l), methods: ms.join('; ') });
      });
    });
    var gm = groupBy(rows, function (e) { var m = API.method(e.methodId); return m ? m.name : '—'; });
    var nonSub = dueMonths.length ? API.nonSubmitters(dueMonths) : [];
    var curInPeriod = months.indexOf(cur) >= 0;
    if (curInPeriod) nonSub = nonSub.concat(API.nonSubmitters([cur]).map(function (x) { x.current = true; return x; }));
    return {
      kind: kind, value: value, label: label, months: months, orgs: orgs, orgRows: orgRows, typeRows: typeRows,
      methodRows: Object.keys(gm).map(function (k) { return { name: k, kg: kgOf(gm[k]) }; }).sort(function (a, b) { return b.kg - a.kg; }),
      nonSub: nonSub, entries: rows,
      totalKg: kgOf(rows), recKg: kgOf(rows.filter(function (e) { return API.wasteType(e.typeId).recyclable; })),
      divKg: kgOf(rows.filter(function (e) { return API.isDiverted(e); })), co2: sum(rows, function (e) { return API.co2(e); }),
      expected: orgs.length * months.filter(function (p) { return p <= cur; }).length,
      accepted: API.reports({ status: ['accepted'] }).filter(function (r) { return months.indexOf(r.period) >= 0; }).length
    };
  }
  window.buildSummary = buildSummary;
})();
