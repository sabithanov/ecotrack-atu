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

  /* CO2-коэффициенты, кг CO2-экв. на кг отходов при захоронении на полигоне.
     Источник (приближённо): UK DESNZ/DEFRA «Greenhouse gas reporting: conversion factors 2024», раздел Waste disposal (landfill).
     При переработке / компостировании используется коэффициент 0,01 кг CO2-экв./кг (там же: composting / closed-loop ≈ 9–21 кг/т). */
  var CO2 = { food: 0.70, paper: 1.04, plastic: 0.009, glass: 0.009, metal: 0.009, oil: 0.70 };

  window.buildSeed = function (todayStr) {
    var rnd = mulberry32(20261112);
    var S = {
      version: 1, seq: 100,
      settings: { anomalyPct: 30, deadlineDay: 5, divertedFactor: 0.01 },
      orgs: [], users: [], methods: [], wasteTypes: [], reports: [], entries: [], history: []
    };
    function nid(p) { return p + (S.seq++); }

    // --- Способы утилизации
    var M = {};
    [
      ['tbo', 'Вывоз ТБО', 'landfill'],
      ['bak', 'Вывоз ТБО (мусорный бак)', 'landfill'],
      ['rec', 'Сдача на переработку (вторсырьё)', 'recycle'],
      ['oil', 'Сдача масла на переработку (биотопливо)', 'recycle'],
      ['comp', 'Компостирование', 'compost'],
      ['feed', 'Передача на корм животным', 'feed']
    ].forEach(function (m) { S.methods.push({ id: 'm_' + m[0], name: m[1], mode: m[2], active: true }); M[m[0]] = 'm_' + m[0]; });

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

    // --- Виды отходов по образцам таблиц.
    // [название, ед., категория, пригоден к переработке, CO2, способ по умолчанию, мин, макс, вероятность в рабочий день, лимит на запись]
    var catalog = {
      tpp: [
        ['Упаковочные отходы', 'kg', 'packaging', true, CO2.plastic, 'tbo', 0.4, 1.6, 1, 50],
        ['Мясные кости', 'kg', 'food', false, CO2.food, 'tbo', 1.0, 3.2, 1, 100],
        ['Рыбные кости', 'kg', 'food', false, CO2.food, 'tbo', 0.4, 1.5, 0.7, 100]
      ],
      thpp: [
        ['Яичная скорлупа', 'kg', 'food', true, CO2.food, 'tbo', 0.2, 0.8, 0.8, 30],
        ['Сахароза', 'kg', 'food', false, CO2.food, 'tbo', 0.1, 0.4, 0.6, 30],
        ['ПЭТ-бутылка 1,0 л (растительное масло)', 'kg', 'packaging', true, CO2.plastic, 'tbo', 0.1, 0.5, 0.6, 30],
        ['Стеклобутылка', 'kg', 'packaging', true, CO2.glass, 'tbo', 0.3, 1.2, 0.5, 50],
        ['Отходы образцов хлебобулочных изделий', 'kg', 'food', true, CO2.food, 'tbo', 0.4, 1.6, 0.9, 50],
        ['Отходы образцов кондитерских изделий', 'kg', 'food', true, CO2.food, 'tbo', 0.3, 1.1, 0.7, 50],
        ['Отходы фруктов и овощей', 'kg', 'food', true, CO2.food, 'tbo', 0.8, 2.6, 0.9, 50],
        ['Алюминиевые банки', 'kg', 'packaging', true, CO2.metal, 'tbo', 0.1, 0.3, 0.4, 30]
      ],
      inn: [
        ['Очистки овощей', 'kg', 'food', true, CO2.food, 'tbo', 5, 11, 1, 200],
        ['Обрезки мясопродуктов', 'kg', 'food', false, CO2.food, 'tbo', 1.2, 3.0, 1, 100],
        ['Пищевые отходы из зала', 'kg', 'food', false, CO2.food, 'tbo', 6, 14, 1, 200],
        ['Остатки нереализованной продукции', 'kg', 'food', false, CO2.food, 'tbo', 1.5, 4.5, 1, 100],
        ['Отработанное масло', 'l', 'oil', true, CO2.oil, 'oil', 4, 7, 0.17, 60],
        ['Картонная тара', 'kg', 'paper', true, CO2.paper, 'tbo', 1.5, 4, 0.8, 100]
      ],
      canella: [
        ['Кофейный жмых', 'kg', 'food', true, CO2.food, 'bak', 2.5, 5.5, 1, 50],
        ['Картонная тара', 'kg', 'paper', true, CO2.paper, 'bak', 0.8, 2.5, 0.8, 50],
        ['Остатки еды', 'kg', 'food', false, CO2.food, 'bak', 0.8, 2.8, 1, 50]
      ],
      iskander: [
        ['Очистки овощей', 'kg', 'food', true, CO2.food, 'tbo', 14, 26, 1, 300],
        ['Обрезки мясопродуктов', 'kg', 'food', false, CO2.food, 'tbo', 3, 6.5, 1, 150],
        ['Пищевые отходы из зала', 'kg', 'food', false, CO2.food, 'tbo', 18, 34, 1, 300],
        ['Остатки нереализованной продукции', 'kg', 'food', false, CO2.food, 'tbo', 5, 11, 1, 200],
        ['Отработанное масло', 'l', 'oil', true, CO2.oil, 'oil', 9, 14, 0.17, 80],
        ['Картонная тара', 'kg', 'paper', true, CO2.paper, 'tbo', 3.5, 8, 0.9, 150]
      ]
    };
    var TYPES = {}; // orgKey -> [{id, gen}]
    Object.keys(catalog).forEach(function (ok) {
      TYPES[ok] = catalog[ok].map(function (c) {
        var t = {
          id: nid('wt_'), orgId: O[ok], name: c[0], unit: c[1], density: c[1] === 'l' ? 0.92 : 1, category: c[2],
          recyclable: c[3], co2: c[4], methodId: M[c[5]], maxQty: c[9], active: true
        };
        S.wasteTypes.push(t);
        return { t: t, min: c[6], max: c[7], p: c[8] };
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
