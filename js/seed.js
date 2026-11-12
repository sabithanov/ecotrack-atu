/* Демо-данные: 5 организаций АТУ по образцам таблиц учёта, июнь–ноябрь 2026.
   Данные генерируются детерминированно (одинаковы при каждом сбросе). */
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* Справочники — по файлу оргкомитета «Справочники для Трека 1: отходы, утилизация, CO₂».
     Коэффициенты: UK DEFRA/BEIS «Greenhouse gas reporting: conversion factors 2024», Waste disposal (сверены по Climatiq),
     в файле — кг CO₂-экв/т, здесь хранятся в кг CO₂-экв/кг (÷1000).
     Экономия = масса × (коэффициент ТБО вида − коэффициент рекомендуемого способа). */
  var F = { foodTbo: 0.70021, paperTbo: 1.16439, glassTbo: 0.00888, comp: 0.00888, recyc: 0.00641 };

  window.buildSeed = function (todayStr) {
    var rnd = mulberry32(20261112);
    var S = {
      version: 1, seq: 100,
      settings: { anomalyPct: 30, deadlineDay: 5 },
      orgs: [], users: [], methods: [], wasteTypes: [], reports: [], entries: [], history: []
    };
    function nid(p) { return p + (S.seq++); }

    // --- Способы утилизации (код, название, тип, CO₂ кг/кг, иерархия: 1 — лучше, примечание)
    var M = {};
    [
      ['donate', 'DONATE', 'Передача нереализованной продукции (фудшеринг, благотворительность)', 'donate', 0, 1, 'Отход не возникает. Только безопасная продукция с неистёкшим сроком годности'],
      ['feed', 'FEED', 'Передача на корм животным', 'feed', 0, 2, 'Нет коэффициента DEFRA (учитывается как 0). Нужны договор и ветеринарно-санитарные требования'],
      ['rec', 'RECYCLE', 'Сдача вторсырья на переработку', 'recycle', F.recyc, 3, 'Только транспорт и переработка (методика DEFRA)'],
      ['oil', 'OIL', 'Сдача отработанного масла спецорганизации (биодизель)', 'recycle', F.recyc, 3, 'Допущение: как переработка. Масло идёт на биодизель'],
      ['ad', 'AD', 'Анаэробное сбраживание (биогаз)', 'ad', F.comp, 4, 'DEFRA 2024: пищевые отходы, анаэробное сбраживание'],
      ['comp', 'COMPOST', 'Компостирование', 'compost', F.comp, 4, 'DEFRA 2024: пищевые отходы, компостирование'],
      ['tbo', 'TBO', 'Вывоз ТБО', 'landfill', null, 5, 'Захоронение на полигоне. Коэффициент зависит от вида отхода'],
      ['bak', 'TBO_BIN', 'Вывоз ТБО (мусорный бак)', 'landfill', null, 5, 'Как ТБО, сбор в мусорный бак (образец кофейни)']
    ].forEach(function (m) {
      S.methods.push({ id: 'm_' + m[0], code: m[1], name: m[2], mode: m[3], co2: m[4], rank: m[5], note: m[6], active: true });
      M[m[0]] = 'm_' + m[0];
    });

    // --- Организации
    var orgDefs = [
      { key: 'tpp', name: 'Кафедра ТПП', short: 'Кафедра ТПП', type: 'department', building: 'Учебный корпус, лаборатории кафедры ТПП' },
      { key: 'thpp', name: 'Кафедра ТХиПП', short: 'Кафедра ТХиПП', type: 'department', building: 'Учебный корпус, лаборатории кафедры ТХиПП' },
      { key: 'inn', name: 'Учебно-гостиничный комплекс ATU INN', short: 'ATU INN', type: 'hotel', building: 'ATU INN' },
      { key: 'canella', name: 'Кофейня АТУ (ИП «Canella»)', short: 'Кофейня Canella', type: 'cafe', building: 'Корпус 1' },
      { key: 'iskander', name: 'Столовый комплекс корп. 1, 2 (ИП «Искандер»)', short: 'Столовая «Искандер»', type: 'canteen', building: 'Корпуса 1 и 2' }
    ];
    var O = {};
    orgDefs.forEach(function (o) {
      S.orgs.push({ id: 'org_' + o.key, name: o.name, short: o.short, type: o.type, building: o.building, active: true, createdAt: '2026-06-01T09:00:00' });
      O[o.key] = 'org_' + o.key;
    });

    // --- Пользователи (пароль у всех демо-учёток: demo123)
    var userDefs = [
      ['u_isk', 'Ахметова Айгерим', 'iskander@atu.kz', 'resp', 'iskander'],
      ['u_inn', 'Сериков Данияр', 'inn@atu.kz', 'resp', 'inn'],
      ['u_can', 'Касымова Дана', 'canella@atu.kz', 'resp', 'canella'],
      ['u_tpp', 'Нурланов Ерлан', 'tpp@atu.kz', 'resp', 'tpp'],
      ['u_thpp', 'Жумабаева Асель', 'thpp@atu.kz', 'resp', 'thpp'],
      ['u_rev', 'Омарова Сауле', 'reviewer@atu.kz', 'reviewer', null],
      ['u_adm', 'Администратор системы', 'admin@atu.kz', 'admin', null],
      ['u_mgmt', 'Руководство АТУ', 'rector@atu.kz', 'mgmt', null]
    ];
    userDefs.forEach(function (u) {
      var salt = window.randomSalt();
      S.users.push({ id: u[0], name: u[1], email: u[2], role: u[3], orgId: u[4] ? O[u[4]] : null, salt: salt, hash: window.hashPassword('demo123', salt), active: true });
    });
    var RESP = { tpp: 'u_tpp', thpp: 'u_thpp', inn: 'u_inn', canella: 'u_can', iskander: 'u_isk' };

    // --- Справочник видов отходов (лист «Виды отходов» файла оргкомитета)
    // название → [категория, пригодность yes/partial/no, рекомендуемый способ, CO₂ ТБО, CO₂ рекоменд., примечание]
    var REF = {
      'Пищевые отходы из зала': ['food', 'yes', 'comp', F.foodTbo, F.comp, 'Объедки после потребления. Компостирование / биогаз'],
      'Остатки нереализованной продукции': ['food', 'yes', 'donate', F.foodTbo, F.comp, 'Лучше предотвратить: передать (фудшеринг), пока пригодно в пищу; иначе компост'],
      'Остатки еды': ['food', 'yes', 'comp', F.foodTbo, F.comp, 'Компостирование / биогаз'],
      'Очистки овощей': ['food', 'yes', 'comp', F.foodTbo, F.comp, 'Отходы первичной обработки сырья'],
      'Отходы фруктов и овощей': ['food', 'yes', 'comp', F.foodTbo, F.comp, ''],
      'Обрезки мясопродуктов': ['food', 'partial', 'ad', F.foodTbo, F.comp, 'В обычный компост мясо не принимают'],
      'Мясные кости': ['food', 'partial', 'ad', F.foodTbo, F.comp, 'В обычный компост кости не принимают'],
      'Рыбные кости': ['food', 'partial', 'ad', F.foodTbo, F.comp, 'В обычный компост кости не принимают'],
      'Яичная скорлупа': ['food', 'yes', 'comp', F.foodTbo, F.comp, ''],
      'Кофейный жмых': ['food', 'yes', 'comp', F.foodTbo, F.comp, 'Хорошо компостируется'],
      'Отходы образцов хлебобулочных изделий': ['food', 'yes', 'comp', F.foodTbo, F.comp, 'Компостирование / биогаз'],
      'Отходы образцов кондитерских изделий': ['food', 'yes', 'comp', F.foodTbo, F.comp, 'Печенье, карамель. Компостирование / биогаз'],
      'Сахароза': ['food', 'yes', 'ad', F.foodTbo, F.comp, 'Допущение: коэффициент как у пищевых отходов'],
      'Отработанное масло': ['oil', 'yes', 'oil', F.foodTbo, F.recyc, 'Допущение: у DEFRA нет фактора для масла. 1 л ≈ 0,92 кг. В канализацию сливать нельзя'],
      'Картонная тара': ['paper', 'yes', 'rec', F.paperTbo, F.recyc, 'Сухой и чистый картон'],
      'ПЭТ-бутылка 1,0 л (растительное масло)': ['packaging', 'partial', 'rec', F.glassTbo, F.recyc, 'Допущение: коэффициенты как у стекла. Бутылки из-под масла принимают не везде'],
      'Стеклобутылка': ['packaging', 'yes', 'rec', F.glassTbo, F.recyc, ''],
      'Алюминиевые банки': ['packaging', 'yes', 'rec', F.glassTbo, F.recyc, 'Допущение: коэффициенты как у стекла'],
      'Упаковочные отходы': ['other', 'partial', 'rec', F.paperTbo, F.recyc, 'Разделить: картон и ПЭТ — на переработку, остальное — ТБО. Допущение: считать как картон']
    };
    // [название, ед., способ сейчас (по образцам), мин, макс, вероятность в рабочий день, лимит на запись]
    var catalog = {
      tpp: [['Упаковочные отходы', 'kg', 'tbo', 0.4, 1.6, 1, 50], ['Мясные кости', 'kg', 'tbo', 1.0, 3.2, 1, 100], ['Рыбные кости', 'kg', 'tbo', 0.4, 1.5, 0.7, 100]],
      thpp: [
        ['Яичная скорлупа', 'kg', 'tbo', 0.2, 0.8, 0.8, 30], ['Сахароза', 'kg', 'tbo', 0.1, 0.4, 0.6, 30],
        ['ПЭТ-бутылка 1,0 л (растительное масло)', 'kg', 'tbo', 0.1, 0.5, 0.6, 30], ['Стеклобутылка', 'kg', 'tbo', 0.3, 1.2, 0.5, 50],
        ['Отходы образцов хлебобулочных изделий', 'kg', 'tbo', 0.4, 1.6, 0.9, 50], ['Отходы образцов кондитерских изделий', 'kg', 'tbo', 0.3, 1.1, 0.7, 50],
        ['Отходы фруктов и овощей', 'kg', 'tbo', 0.8, 2.6, 0.9, 50], ['Алюминиевые банки', 'kg', 'tbo', 0.1, 0.3, 0.4, 30]
      ],
      inn: [
        ['Очистки овощей', 'kg', 'tbo', 5, 11, 1, 200], ['Обрезки мясопродуктов', 'kg', 'tbo', 1.2, 3.0, 1, 100],
        ['Пищевые отходы из зала', 'kg', 'tbo', 6, 14, 1, 200], ['Остатки нереализованной продукции', 'kg', 'tbo', 1.5, 4.5, 1, 100],
        ['Отработанное масло', 'l', 'oil', 4, 7, 0.17, 60], ['Картонная тара', 'kg', 'tbo', 1.5, 4, 0.8, 100]
      ],
      canella: [['Кофейный жмых', 'kg', 'bak', 2.5, 5.5, 1, 50], ['Картонная тара', 'kg', 'bak', 0.8, 2.5, 0.8, 50], ['Остатки еды', 'kg', 'bak', 0.8, 2.8, 1, 50]],
      iskander: [
        ['Очистки овощей', 'kg', 'tbo', 14, 26, 1, 300], ['Обрезки мясопродуктов', 'kg', 'tbo', 3, 6.5, 1, 150],
        ['Пищевые отходы из зала', 'kg', 'tbo', 18, 34, 1, 300], ['Остатки нереализованной продукции', 'kg', 'tbo', 5, 11, 1, 200],
        ['Отработанное масло', 'l', 'oil', 9, 14, 0.17, 80], ['Картонная тара', 'kg', 'tbo', 3.5, 8, 0.9, 150]
      ]
    };
    var TYPES = {}; // orgKey -> [{t, min, max, p}]
    Object.keys(catalog).forEach(function (ok) {
      TYPES[ok] = catalog[ok].map(function (c) {
        var r = REF[c[0]];
        var t = {
          id: nid('wt_'), orgId: O[ok], name: c[0], unit: c[1], density: c[1] === 'l' ? 0.92 : 1, category: r[0],
          recLevel: r[1], recyclable: r[1] === 'yes', recMethodId: M[r[2]], co2: r[3], recCo2: r[4], note: r[5],
          methodId: M[c[2]], maxQty: c[6], active: true
        };
        S.wasteTypes.push(t);
        return { t: t, min: c[3], max: c[4], p: c[5] };
      });
    });

    // --- Генерация взвешиваний
    var today = todayStr; // 'YYYY-MM-DD'
    var months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    var season = {
      univ: { '2026-06': 0.75, '2026-07': 0.35, '2026-08': 0.55, '2026-09': 1.0, '2026-10': 1.05, '2026-11': 1.0 },
      hotel: { '2026-06': 1.0, '2026-07': 1.2, '2026-08': 1.15, '2026-09': 0.9, '2026-10': 0.95, '2026-11': 0.9 }
    };
    // дни работы: 0=вс … 6=сб
    var workdays = { tpp: [2, 4], thpp: [1, 3, 5], inn: [0, 1, 2, 3, 4, 5, 6], canella: [1, 2, 3, 4, 5, 6], iskander: [1, 2, 3, 4, 5, 6] };

    function reportFor(orgKey, period) {
      var r = S.reports.filter(function (x) { return x.orgId === O[orgKey] && x.period === period; })[0];
      if (!r) {
        r = { id: nid('rep_'), orgId: O[orgKey], period: period, status: 'draft', createdAt: period + '-01T09:00:00', submittedAt: null, reviewerId: null, decidedAt: null };
        S.reports.push(r);
        S.history.push({ id: nid('h_'), reportId: r.id, from: null, to: 'draft', action: 'create', userId: RESP[orgKey], comment: '', at: r.createdAt });
      }
      return r;
    }

    months.forEach(function (period) {
      var y = +period.slice(0, 4), m = +period.slice(5, 7);
      var days = new Date(y, m, 0).getDate();
      Object.keys(catalog).forEach(function (ok) {
        var rep = reportFor(ok, period);
        var isLab = ok === 'tpp' || ok === 'thpp';
        var f = (ok === 'inn' ? season.hotel : season.univ)[period];
        for (var d = 1; d <= days; d++) {
          var ds = period + '-' + pad(d);
          if (ds > today) break;
          if (ds === today) continue; // сегодняшние записи вносятся вживую на демо
          var wd = new Date(y, m - 1, d).getDay();
          if (workdays[ok].indexOf(wd) < 0) continue;
          if (isLab && rnd() > f) continue; // в каникулы лабораторных занятий меньше
          TYPES[ok].forEach(function (g) {
            if (rnd() > g.p) return;
            var q = g.min + rnd() * (g.max - g.min);
            if (!isLab) q *= f;
            // встроенная аномалия: рост нереализованной продукции в октябре
            if (ok === 'iskander' && period === '2026-10' && g.t.name === 'Остатки нереализованной продукции') q *= 1.75;
            if (ok === 'canella' && period === '2026-10' && g.t.name === 'Кофейный жмых') q *= 1.4;
            q = Math.max(0.1, Math.round(q * 10) / 10);
            var method = g.t.methodId;
            // ATU INN с октября начал сдавать картон на переработку
            if (ok === 'inn' && g.t.category === 'paper' && period >= '2026-10') method = M.rec;
            var hh = 9 + Math.floor(rnd() * 8), mm = Math.floor(rnd() * 60);
            S.entries.push({
              id: nid('e_'), reportId: rep.id, orgId: O[ok], date: ds, typeId: g.t.id, qty: q, methodId: method,
              userId: RESP[ok], photo: null, note: '', createdAt: ds + 'T' + pad(hh) + ':' + pad(mm) + ':00'
            });
          });
        }
      });
    });

    // --- Статусы отчётов и история
    function nextMonthDay(period, day) {
      var y = +period.slice(0, 4), m = +period.slice(5, 7) + 1;
      if (m > 12) { m = 1; y++; }
      return y + '-' + pad(m) + '-' + pad(day);
    }
    function hist(r, from, to, action, uid, comment, at) {
      S.history.push({ id: nid('h_'), reportId: r.id, from: from, to: to, action: action, userId: uid, comment: comment || '', at: at });
    }
    function acceptFlow(r, orgKey, dSubmit, dReview) {
      r.status = 'accepted'; r.submittedAt = dSubmit + 'T10:15:00'; r.reviewerId = 'u_rev'; r.decidedAt = dReview + 'T15:40:00';
      hist(r, 'draft', 'submitted', 'submit', RESP[orgKey], '', r.submittedAt);
      hist(r, 'submitted', 'in_review', 'review', 'u_rev', '', dReview + 'T11:00:00');
      hist(r, 'in_review', 'accepted', 'accept', 'u_rev', 'Принято', r.decidedAt);
    }
    S.reports.forEach(function (r) {
      var ok = Object.keys(O).filter(function (k) { return O[k] === r.orgId; })[0];
      var idx = Object.keys(O).indexOf(ok);
      if (r.period <= '2026-09') {
        if (ok === 'iskander' && r.period === '2026-09') {
          // пример цикла с возвратом
          r.submittedAt = '2026-10-02T10:05:00';
          hist(r, 'draft', 'submitted', 'submit', RESP[ok], '', '2026-10-02T10:05:00');
          hist(r, 'submitted', 'in_review', 'review', 'u_rev', '', '2026-10-02T14:00:00');
          hist(r, 'in_review', 'returned', 'return', 'u_rev', 'Проверьте объём отработанного масла за 28.09 и добавьте картонную тару за 30.09.', '2026-10-02T14:20:00');
          hist(r, 'returned', 'submitted', 'submit', RESP[ok], 'Исправлено', '2026-10-03T09:30:00');
          r.status = 'accepted'; r.reviewerId = 'u_rev'; r.decidedAt = '2026-10-03T16:10:00';
          hist(r, 'submitted', 'in_review', 'review', 'u_rev', '', '2026-10-03T11:00:00');
          hist(r, 'in_review', 'accepted', 'accept', 'u_rev', 'Принято', r.decidedAt);
        } else {
          acceptFlow(r, ok, nextMonthDay(r.period, 1 + idx % 4), nextMonthDay(r.period, 3 + idx % 3));
        }
      } else if (r.period === '2026-10') {
        if (ok === 'thpp') {
          r.status = 'returned'; r.submittedAt = '2026-11-04T12:00:00'; r.reviewerId = 'u_rev'; r.decidedAt = '2026-11-05T10:30:00';
          hist(r, 'draft', 'submitted', 'submit', RESP[ok], '', r.submittedAt);
          hist(r, 'submitted', 'in_review', 'review', 'u_rev', '', '2026-11-05T10:00:00');
          hist(r, 'in_review', 'returned', 'return', 'u_rev', 'Нет записей по стеклобутылкам за лабораторные занятия 14.10 и 16.10 — дополните.', r.decidedAt);
        } else if (ok === 'canella') {
          r.status = 'submitted'; r.submittedAt = '2026-11-10T17:20:00';
          hist(r, 'draft', 'submitted', 'submit', RESP[ok], '', r.submittedAt);
        } else {
          acceptFlow(r, ok, '2026-11-0' + (2 + idx % 3), '2026-11-0' + (4 + idx % 3));
        }
      }
      // ноябрь — черновики (текущий период)
    });
    S.entries.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    return S;
  };
})();
