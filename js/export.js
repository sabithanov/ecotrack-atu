/* Выгрузка в Excel (SheetJS) в структуре действующих таблиц учёта АО «АТУ». */
(function () {
  var TITLE = 'Таблица учёта пищевых отходов в университетском комплексе АО «АТУ»';

  function need() {
    if (!window.XLSX) { toast(t('Библиотека Excel не загружена — нужен интернет при первом открытии'), 'err'); return false; }
    return true;
  }
  function sheetName(s, used) {
    var n = String(s).replace(/[\[\]\:\*\?\/\\]/g, ' ').slice(0, 28).trim();
    var base = n, i = 2;
    while (used[n]) n = base.slice(0, 26) + ' ' + (i++);
    used[n] = 1; return n;
  }
  function r1(x) { return Math.round(x * 10) / 10; }
  function aoa(rows, widths) {
    var ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }
  /* Лист в структуре образца: №, Дата, Наименование, Вес/объём, Ед., Способ, Ответственное лицо + итоги за день и за месяц */
  function journalSheet(org, periodLabel, entries) {
    var rows = [[TITLE], [org.name], [t('Период') + ': ' + periodLabel], [],
      ['№', 'Дата', 'Наименование отходов', 'Вес (кг) / Объём (л)', 'Ед.', 'Способ переработки / утилизации', 'Ответственное лицо']];
    var byDate = {}, n = 0;
    entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });
    Object.keys(byDate).sort().forEach(function (d) {
      var dk = 0;
      byDate[d].forEach(function (e) {
        var w = API.wasteType(e.typeId), m = API.method(e.methodId);
        rows.push([++n, dateLabel(e.date), w.name, r1(e.qty), w.unit === 'l' ? 'л' : 'кг', m ? m.name : '', API.userName(e.userId)]);
        dk += API.kg(e);
      });
      rows.push(['', '', 'Итого за ' + dateLabel(d) + ', кг', r1(dk), 'кг', '', '']);
    });
    rows.push([]);
    rows.push(['', '', 'Итого за месяц по наименованию', '', '', '', '']);
    var tot = {};
    entries.forEach(function (e) { var tt = tot[e.typeId] = tot[e.typeId] || { q: 0, kg: 0 }; tt.q += e.qty; tt.kg += API.kg(e); });
    var all = 0;
    Object.keys(tot).forEach(function (id) { var w = API.wasteType(id); rows.push(['', '', w.name, r1(tot[id].q), w.unit === 'l' ? 'л' : 'кг', '', '']); all += tot[id].kg; });
    rows.push(['', '', 'ИТОГО, кг', r1(all), 'кг', '', '']);
    return aoa(rows, [5, 12, 42, 18, 6, 36, 26]);
  }

  window.Exporter = {
    report: function (r, org, entries) {
      if (!need()) return;
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, journalSheet(org, monthLabel(r.period), entries), 'Журнал');
      var hist = API.history(r.id).map(function (h) { return [dateTimeLabel(h.at), API.userName(h.userId), h.action, h.from || '', h.to || '', h.comment]; });
      XLSX.utils.book_append_sheet(wb, aoa([['Время', 'Пользователь', 'Действие', 'Из статуса', 'В статус', 'Комментарий']].concat(hist), [18, 26, 12, 14, 14, 60]), 'История');
      XLSX.writeFile(wb, 'EcoTrack_' + (org.short || 'org').replace(/[^\wА-Яа-яЁё]+/g, '_') + '_' + r.period + '.xlsx', { compression: true });
    },
    registry: function (rows, f, orgName) {
      if (!need()) return;
      var data = [['Единый реестр пищевых отходов АО «АТУ» (принятые отчёты)'], ['Период: ' + monthLabel(f.from) + ' — ' + monthLabel(f.to)], [],
        ['Дата', 'Организация', 'Наименование отходов', 'Количество', 'Ед.', 'Масса, кг', 'Способ утилизации', 'Пригоден к переработке', 'CO2-экв., кг', 'Ответственное лицо']];
      rows.forEach(function (e) {
        var w = API.wasteType(e.typeId), m = API.method(e.methodId);
        data.push([dateLabel(e.date), orgName[e.orgId], w.name, r1(e.qty), w.unit === 'l' ? 'л' : 'кг', r1(API.kg(e)), m ? m.name : '', w.recyclable ? 'да' : 'нет', r1(API.co2(e)), API.userName(e.userId)]);
      });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, aoa(data, [12, 24, 40, 12, 6, 12, 34, 12, 12, 26]), 'Реестр');
      XLSX.writeFile(wb, 'EcoTrack_Реестр_' + f.from + '_' + f.to + '.xlsx', { compression: true });
    },
    summary: function (d) {
      if (!need()) return;
      var wb = XLSX.utils.book_new(), used = { 'Свод': 1, 'По видам': 1, 'Способы': 1, 'Не сдали': 1 };
      var head = ['Организация'].concat(d.months.map(function (p) { return monthLabel(p); }), ['Итого, кг', 'Пригодно к переработке, %', 'CO2-экв., кг']);
      var a = [['Сводный отчёт по пищевым отходам университетского комплекса АО «АТУ»'], ['Период: ' + d.label], [], head];
      d.orgRows.forEach(function (r) { a.push([r.name].concat(r.perMonth.map(r1), [r1(r.total), r.total ? Math.round(r.rec / r.total * 100) : 0, Math.round(r.co2)])); });
      a.push(['ИТОГО'].concat(d.months.map(function (p, i) { return r1(d.orgRows.reduce(function (s, r) { return s + r.perMonth[i]; }, 0)); }), [r1(d.totalKg), d.totalKg ? Math.round(d.recKg / d.totalKg * 100) : 0, Math.round(d.co2)]));
      a.push([]);
      a.push(['Фактически переработано / компостировано, %', d.totalKg ? Math.round(d.divKg / d.totalKg * 100) : 0]);
      a.push(['Отчётов принято', d.accepted + ' из ' + d.expected]);
      a.push(['Сформировано', dateTimeLabel(API.nowStr()) + ', EcoTrack ATU']);
      XLSX.utils.book_append_sheet(wb, aoa(a, [44].concat(d.months.map(function () { return 14; }), [12, 14, 12])), 'Свод');

      var b = [['По организациям и видам отходов'], ['Период: ' + d.label], [], ['Организация', 'Наименование отходов', 'Ед.'].concat(d.months.map(function (p) { return monthLabel(p); }), ['Итого', 'Масса, кг', 'Способ утилизации'])];
      d.typeRows.forEach(function (r) { b.push([r.org, r.type, r.unit === 'l' ? 'л' : 'кг'].concat(r.perMonth.map(r1), [r1(r.total), r1(r.kg), r.methods])); });
      XLSX.utils.book_append_sheet(wb, aoa(b, [40, 40, 6].concat(d.months.map(function () { return 12; }), [10, 10, 34])), 'По видам');

      var c = [['По способам утилизации'], [], ['Способ', 'Масса, кг', 'Доля, %']];
      d.methodRows.forEach(function (r) { c.push([r.name, r1(r.kg), d.totalKg ? Math.round(r.kg / d.totalKg * 1000) / 10 : 0]); });
      XLSX.utils.book_append_sheet(wb, aoa(c, [40, 12, 10]), 'Способы');

      var n = [['Организации без принятого отчёта'], [], ['Организация', 'Период', 'Статус']];
      d.nonSub.forEach(function (x) { n.push([API.org(x.orgId).name, monthLabel(x.period), t(STATUS[x.status].label)]); });
      if (d.nonSub.length === 0) n.push(['Все организации сдали отчёты']);
      XLSX.utils.book_append_sheet(wb, aoa(n, [44, 16, 26]), 'Не сдали');

      d.orgs.forEach(function (o) {
        var l = d.entries.filter(function (e) { return e.orgId === o.id; });
        if (l.length) XLSX.utils.book_append_sheet(wb, journalSheet(o, d.label, l), sheetName(o.short, used));
      });
      XLSX.writeFile(wb, 'EcoTrack_Сводный_отчёт_' + d.value + '.xlsx', { compression: true });
    }
  };
})();
