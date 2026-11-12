/* Submission Workflow: список отчётов, карточка отчёта, проверка, история. */
(function () {
  window.Views = window.Views || {};

  Views.reports = function (user, h) {
    var view = $('#view');
    var isStaff = user.role !== 'resp';
    var orgs = API.orgs({ all: true });
    var orgName = {}; orgs.forEach(function (o) { orgName[o.id] = o.short; });
    var f = { status: h.q.status || (user.role === 'reviewer' ? 'queue' : ''), orgId: h.q.org || '' };

    function render() {
      var st = f.status === 'queue' ? ['submitted', 'in_review'] : (f.status ? [f.status] : null);
      var list = API.reports({ status: st, orgId: f.orgId || null });
      var queueN = API.reports({ status: ['submitted', 'in_review'] }).length;
      var html = '<div class="page-head"><div><h1>' + esc(isStaff ? t('Отчёты организаций') : t('Мои отчёты')) + '</h1>' +
        '<p class="muted">' + esc(isStaff ? t('Отчёт = записи организации за месяц. Принятые отчёты автоматически попадают в единый реестр.') : API.org(user.orgId).name) + '</p></div></div>';
      if (isStaff && queueN) html += '<div class="alert info">' + esc(t('Ожидают проверки')) + ': <b>' + queueN + '</b></div>';
      html += '<div class="filters card">' +
        '<label class="field"><span>' + esc(t('Статус')) + '</span><select id="r-status">' +
        '<option value="">' + esc(t('Все')) + '</option>' +
        (isStaff ? '<option value="queue"' + (f.status === 'queue' ? ' selected' : '') + '>' + esc(t('Требуют проверки')) + '</option>' : '') +
        Object.keys(STATUS).filter(function (k) { return k !== 'none'; }).map(function (k) { return '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + esc(t(STATUS[k].label)) + '</option>'; }).join('') +
        '</select></label>' +
        (isStaff ? '<label class="field"><span>' + esc(t('Организация')) + '</span><select id="r-org"><option value="">' + esc(t('Все')) + '</option>' + optionList(orgs, f.orgId, function (o) { return o.id; }, function (o) { return o.short; }) + '</select></label>' : '') +
        '</div>';
      html += '<div class="card"><div class="table-wrap"><table class="tbl click"><thead><tr><th>' + esc(t('Период')) + '</th>' + (isStaff ? '<th>' + esc(t('Организация')) + '</th>' : '') +
        '<th>' + esc(t('Статус')) + '</th><th class="num">' + esc(t('Записей')) + '</th><th class="num">' + esc(t('Масса, кг')) + '</th><th>' + esc(t('Отправлен')) + '</th><th>' + esc(t('Решение')) + '</th></tr></thead><tbody>' +
        (list.length ? list.map(function (r) {
          return '<tr data-id="' + r.id + '"><td><b>' + esc(monthLabel(r.period)) + '</b></td>' + (isStaff ? '<td>' + esc(orgName[r.orgId]) + '</td>' : '') +
            '<td>' + statusBadge(r.status) + '</td><td class="num">' + r.count + '</td><td class="num">' + fmt(r.kg) + '</td>' +
            '<td>' + (r.submittedAt ? dateTimeLabel(r.submittedAt) : '—') + '</td><td>' + (r.decidedAt && ['accepted', 'returned'].indexOf(r.status) >= 0 ? dateTimeLabel(r.decidedAt) : '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="muted center">' + esc(t('Нет отчётов по выбранным фильтрам')) + '</td></tr>') +
        '</tbody></table></div></div>';
      view.innerHTML = html;
      $('#r-status').onchange = function () { f.status = this.value; render(); };
      if ($('#r-org')) $('#r-org').onchange = function () { f.orgId = this.value; render(); };
      $$('tr[data-id]').forEach(function (tr) { tr.onclick = function () { go('report/' + tr.dataset.id); }; });
    }
    render();
  };

  var ACTIONS = { create: 'Создан черновик', submit: 'Отправлен на проверку', review: 'Взят на проверку', accept: 'Принят', return: 'Возвращён на доработку', edit: 'Изменение записи', delete: 'Удаление записи' };

  Views.report = function (user, h) {
    var view = $('#view');
    var r = API.report(h.arg);
    // проверяющий открыл отправленный отчёт → статус «на проверке»
    if ((user.role === 'reviewer' || user.role === 'admin') && r.status === 'submitted') { r = API.startReview(r.id); toast(t('Отчёт взят на проверку')); }
    var org = API.org(r.orgId);
    var entries = API.reportEntries(r.id);
    var hist = API.history(r.id);
    var settings = API.settings();

    var byDate = {};
    entries.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });
    var totals = {};
    entries.forEach(function (e) {
      var tt = totals[e.typeId] = totals[e.typeId] || { qty: 0, kg: 0, co2: 0, n: 0 };
      tt.qty += e.qty; tt.kg += API.kg(e); tt.co2 += API.co2(e); tt.n++;
    });
    var sumKg = entries.reduce(function (s, e) { return s + API.kg(e); }, 0);
    var sumCo2 = entries.reduce(function (s, e) { return s + API.co2(e); }, 0);
    var recKg = entries.filter(function (e) { return API.wasteType(e.typeId).recyclable; }).reduce(function (s, e) { return s + API.kg(e); }, 0);
    var lastReturn = hist.filter(function (x) { return x.action === 'return'; }).pop();

    var canDecide = (user.role === 'reviewer' || user.role === 'admin') && ['submitted', 'in_review'].indexOf(r.status) >= 0;
    var canSubmit = user.role === 'resp' && ['draft', 'returned'].indexOf(r.status) >= 0;

    var html = '<div class="page-head"><div><a class="back" href="#/reports">← ' + esc(t('К списку отчётов')) + '</a>' +
      '<h1>' + esc(t('Отчёт за')) + ' ' + esc(monthLabel(r.period)) + '</h1><p class="muted">' + esc(org.name) + '</p></div>' +
      '<div class="head-actions">' + statusBadge(r.status) + '</div></div>';

    if (r.status === 'returned' && lastReturn) html += '<div class="alert warn"><b>' + esc(t('Возвращён на доработку')) + ':</b> ' + esc(lastReturn.comment) + '<div class="small muted">' + esc(API.userName(lastReturn.userId)) + ', ' + dateTimeLabel(lastReturn.at) + '</div></div>';
    if (r.status === 'accepted') html += '<div class="alert ok">🔒 ' + esc(t('Отчёт принят и заблокирован от редактирования. Данные включены в единый реестр.')) + '</div>';

    html += '<div class="kpis">' +
      '<div class="kpi"><span>' + esc(t('Записей')) + '</span><b>' + entries.length + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Масса, кг')) + '</span><b>' + fmt(sumKg) + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Пригодно к переработке')) + '</span><b>' + (sumKg ? pct(recKg / sumKg) : '—') + '</b></div>' +
      '<div class="kpi"><span>CO₂-' + esc(t('экв., кг')) + '</span><b>' + fmt(sumCo2) + '</b></div>' +
      '<div class="kpi"><span>' + esc(t('Срок сдачи')) + '</span><b>' + dateLabel(deadlineOf(r.period, settings.deadlineDay)) + '</b></div></div>';

    html += '<div class="row-actions sticky-actions">' +
      (canDecide ? '<button class="btn primary" id="acc-btn">✓ ' + esc(t('Принять')) + '</button><button class="btn danger" id="ret-btn">↩ ' + esc(t('Вернуть с комментарием')) + '</button>' : '') +
      (canSubmit ? '<button class="btn primary" id="sub-btn">' + esc(r.status === 'returned' ? t('Отправить повторно') : t('Отправить на проверку')) + '</button><a class="btn ghost" href="#/form?date=' + (entries.length ? entries[entries.length - 1].date : r.period + '-01') + '">✎ ' + esc(t('Редактировать записи')) + '</a>' : '') +
      '<button class="btn ghost" id="xls-btn">⬇ Excel</button><button class="btn ghost" id="print-btn">🖨 ' + esc(t('Печать / PDF')) + '</button>' +
      '</div>';

    // Итоги по наименованиям (как «за месяц по наименованию» в образцах)
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('Итого за месяц по наименованию')) + '</h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Наименование отходов')) + '</th><th class="num">' + esc(t('Количество')) + '</th><th>' + esc(t('Ед.')) + '</th><th class="num">' + esc(t('кг')) + '</th><th class="num">CO₂, ' + esc(t('кг')) + '</th><th>♻</th></tr></thead><tbody>' +
      Object.keys(totals).map(function (id) {
        var w = API.wasteType(id), tt = totals[id];
        return '<tr><td>' + esc(w.name) + '</td><td class="num">' + fmt(tt.qty) + '</td><td>' + unitLabel(w.unit) + '</td><td class="num">' + fmt(tt.kg) + '</td><td class="num">' + fmt(tt.co2) + '</td><td>' + (w.recyclable ? '✓' : '') + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>' + esc(t('Итого')) + '</td><td></td><td></td><td class="num">' + fmt(sumKg) + '</td><td class="num">' + fmt(sumCo2) + '</td><td></td></tr></tbody></table></div></section>';

    // Журнал в структуре образца таблицы
    var n = 0;
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('Таблица учёта пищевых отходов')) + '</h2><span class="muted small">' + esc(t('по образцу АО «АТУ»')) + '</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>№</th><th>' + esc(t('Дата')) + '</th><th>' + esc(t('Наименование отходов')) + '</th><th class="num">' + esc(t('Вес (кг) / Объём (л)')) + '</th><th>' + esc(t('Способ переработки / утилизации')) + '</th><th>' + esc(t('Ответственное лицо')) + '</th><th></th></tr></thead><tbody>' +
      (Object.keys(byDate).length ? Object.keys(byDate).sort().map(function (d) {
        var rows = byDate[d].map(function (e) {
          var w = API.wasteType(e.typeId), m = API.method(e.methodId);
          n++;
          return '<tr><td>' + n + '</td><td>' + dateLabel(e.date) + '</td><td>' + esc(w.name) + (e.note ? '<div class="small muted">' + esc(e.note) + '</div>' : '') + '</td><td class="num">' + fmt(e.qty) + ' ' + unitLabel(w.unit) + '</td><td>' + esc(m ? m.name : '') + '</td><td>' + esc(API.userName(e.userId)) + '</td><td>' + (e.photo ? '<img class="thumb" src="' + e.photo + '" data-photo>' : '') + '</td></tr>';
        }).join('');
        var dk = byDate[d].reduce(function (s, e) { return s + API.kg(e); }, 0);
        return rows + '<tr class="subtotal"><td></td><td colspan="2">' + esc(t('Итого за день')) + ' ' + dateLabel(d) + '</td><td class="num">' + fmt(dk) + ' ' + esc(t('кг')) + '</td><td colspan="3"></td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted center">' + esc(t('В отчёте нет записей')) + '</td></tr>') +
      '</tbody></table></div></section>';

    // История
    html += '<section class="card"><div class="card-head"><h2>' + esc(t('История изменений')) + '</h2></div><ol class="timeline">' +
      hist.slice().reverse().map(function (x) {
        return '<li class="tl-' + x.action + '"><div class="tl-head"><b>' + esc(t(ACTIONS[x.action] || x.action)) + '</b>' + (x.from !== x.to && x.to ? ' ' + (x.from ? statusBadge(x.from) + ' → ' : '') + statusBadge(x.to) : '') + '</div>' +
          '<div class="small muted">' + esc(API.userName(x.userId)) + ' · ' + dateTimeLabel(x.at) + '</div>' + (x.comment ? '<div class="tl-comment">' + esc(x.comment) + '</div>' : '') + '</li>';
      }).join('') + '</ol></section>';

    view.innerHTML = html;
    $$('[data-photo]').forEach(function (img) { img.onclick = function () { openModal({ title: t('Фото'), body: '<img class="photo-full" src="' + img.src + '">', actions: [{ label: 'OK' }] }); }; });
    $('#xls-btn').onclick = function () { Exporter.report(r, org, entries); };
    $('#print-btn').onclick = function () { window.print(); };
    if ($('#acc-btn')) $('#acc-btn').onclick = function () {
      confirmDlg(t('Принять отчёт? После принятия он будет заблокирован и попадёт в единый реестр.'), t('Принять')).then(function (ok) {
        if (!ok) return;
        try { API.decideReport(r.id, true); toast(t('Отчёт принят')); route(); } catch (e) { showError(e); }
      });
    };
    if ($('#ret-btn')) $('#ret-btn').onclick = function () {
      promptDlg(t('Вернуть на доработку'), t('Комментарий для ответственного лица (обязательно)'), t('Вернуть')).then(function (c) {
        if (!c) return;
        try { API.decideReport(r.id, false, c); toast(t('Отчёт возвращён с комментарием')); route(); } catch (e) { showError(e); }
      });
    };
    if ($('#sub-btn')) $('#sub-btn').onclick = function () {
      try { API.submitReport(r.id); toast(t('Отчёт отправлен на проверку')); route(); } catch (e) { showError(e); }
    };
  };
})();
