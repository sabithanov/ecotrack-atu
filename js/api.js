/* Слой API (бэкенд MVP).
   Каждый метод сам проверяет сессию и права роли — UI только отображает результат.
   В демо-режиме хранилище — localStorage браузера; для пилота этот же контракт переносится
   на сервер (Supabase/PostgreSQL + RLS, см. supabase/schema.sql). */
(function () {
  var DB_KEY = 'ecotrack_db_v3', SES_KEY = 'ecotrack_session';
  var EDITABLE = ['draft', 'returned'];

  function ApiError(message, code) { this.message = message; this.code = code || 'ERR'; }
  ApiError.prototype = Object.create(Error.prototype);

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowStr() { var d = new Date(); return todayStr() + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function publicUser(u) { if (!u) return null; var c = clone(u); delete c.salt; delete c.hash; return c; }

  var API = {
    ApiError: ApiError,
    todayStr: todayStr,
    nowStr: nowStr,
    db: null,

    load: function () {
      try { this.db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { this.db = null; }
      if (!this.db || this.db.version !== 1) { this.db = window.buildSeed(todayStr()); this.save(); }
    },
    /* локальная копия (кэш) */
    _persist: function () {
      try { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); }
      catch (e) { throw new ApiError(t('Недостаточно места в хранилище браузера. Удалите часть фотографий или сбросьте демо-данные.'), 'QUOTA'); }
    },
    /* сохранение изменения: локально + отправка в облако (если подключено) */
    save: function () {
      this._persist();
      if (window.Sync && Sync.enabled) Sync.schedulePush();
    },
    nid: function (p) { this.db.seq++; return p + this.db.seq + '_' + Math.random().toString(36).slice(2, 6); },

    /* ---------- Аутентификация ---------- */
    login: function (email, password) {
      email = String(email || '').trim().toLowerCase();
      var u = this.db.users.filter(function (x) { return x.email.toLowerCase() === email; })[0];
      if (!u || !u.active || window.hashPassword(password, u.salt) !== u.hash) throw new ApiError(t('Неверный e-mail или пароль'), 'AUTH');
      var ses = { uid: u.id, token: window.randomSalt(), exp: Date.now() + 12 * 3600 * 1000 };
      localStorage.setItem(SES_KEY, JSON.stringify(ses));
      return publicUser(u);
    },
    logout: function () { localStorage.removeItem(SES_KEY); },
    _me: function () {
      var ses; try { ses = JSON.parse(localStorage.getItem(SES_KEY)); } catch (e) { ses = null; }
      if (!ses || ses.exp < Date.now()) return null;
      var u = this.db.users.filter(function (x) { return x.id === ses.uid; })[0];
      return u && u.active ? u : null;
    },
    me: function () { return publicUser(this._me()); },
    _auth: function (roles) {
      var u = this._me();
      if (!u) throw new ApiError(t('Требуется вход в систему'), 'AUTH');
      if (roles && roles.indexOf(u.role) < 0) throw new ApiError(t('Недостаточно прав для этого действия'), 'FORBIDDEN');
      return u;
    },
    _orgScope: function (u, orgId) {
      if (u.role === 'resp' && u.orgId !== orgId) throw new ApiError(t('Доступ только к данным своей организации'), 'FORBIDDEN');
    },

    /* ---------- Справочники ---------- */
    settings: function () { this._auth(); return clone(this.db.settings); },
    saveSettings: function (s) { this._auth(['admin']); Object.assign(this.db.settings, s); this.save(); },
    orgs: function (opts) {
      this._auth();
      var all = opts && opts.all;
      return clone(this.db.orgs.filter(function (o) { return all || o.active; }));
    },
    org: function (id) { this._auth(); return clone(this.db.orgs.filter(function (o) { return o.id === id; })[0] || null); },
    saveOrg: function (o, templateOrgId) {
      var u = this._auth(['admin']);
      if (!o.name || !o.type) throw new ApiError(t('Заполните название и тип организации'), 'VALIDATION');
      var self = this;
      if (o.id) {
        var cur = this.db.orgs.filter(function (x) { return x.id === o.id; })[0];
        Object.assign(cur, { name: o.name, short: o.short || o.name, type: o.type, building: o.building || '', active: !!o.active });
      } else {
        var no = { id: this.nid('org_'), name: o.name, short: o.short || o.name, type: o.type, building: o.building || '', active: o.active !== false, createdAt: nowStr() };
        this.db.orgs.push(no);
        if (templateOrgId) {
          this.db.wasteTypes.filter(function (w) { return w.orgId === templateOrgId && w.active; }).forEach(function (w) {
            var c = clone(w); c.id = self.nid('wt_'); c.orgId = no.id; self.db.wasteTypes.push(c);
          });
        }
        o = no;
      }
      this.save();
      return clone(o);
    },
    users: function () { this._auth(['admin']); return this.db.users.map(publicUser); },
    usersOfOrg: function (orgId) {
      this._auth();
      return this.db.users.filter(function (u) { return u.orgId === orgId && u.active; }).map(function (u) { return { id: u.id, name: u.name, email: u.email }; });
    },
    userName: function (id) { var u = this.db.users.filter(function (x) { return x.id === id; })[0]; return u ? u.name : '—'; },
    saveUser: function (data, password) {
      this._auth(['admin']);
      var email = String(data.email || '').trim().toLowerCase();
      if (!data.name || !email || !data.role) throw new ApiError(t('Заполните ФИО, e-mail и роль'), 'VALIDATION');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(t('Некорректный e-mail'), 'VALIDATION');
      if (data.role === 'resp' && !data.orgId) throw new ApiError(t('Ответственное лицо должно быть привязано к организации'), 'VALIDATION');
      var dup = this.db.users.filter(function (x) { return x.email.toLowerCase() === email && x.id !== data.id; })[0];
      if (dup) throw new ApiError(t('Пользователь с таким e-mail уже есть'), 'VALIDATION');
      var u;
      if (data.id) u = this.db.users.filter(function (x) { return x.id === data.id; })[0];
      else {
        if (!password || password.length < 6) throw new ApiError(t('Пароль — не менее 6 символов'), 'VALIDATION');
        u = { id: this.nid('u_') }; this.db.users.push(u);
      }
      Object.assign(u, { name: data.name, email: email, role: data.role, orgId: data.role === 'resp' ? data.orgId : null, active: data.active !== false });
      if (password) {
        if (password.length < 6) throw new ApiError(t('Пароль — не менее 6 символов'), 'VALIDATION');
        u.salt = window.randomSalt(); u.hash = window.hashPassword(password, u.salt);
      }
      this.save();
      return publicUser(u);
    },
    methods: function (opts) {
      this._auth();
      return clone(this.db.methods.filter(function (m) { return (opts && opts.all) || m.active; }));
    },
    method: function (id) { return this.db.methods.filter(function (m) { return m.id === id; })[0] || null; },
    saveMethod: function (m) {
      this._auth(['admin']);
      if (!m.name) throw new ApiError(t('Введите название'), 'VALIDATION');
      var data = { name: m.name, mode: m.mode || 'landfill', code: m.code || '', co2: m.co2 === '' || m.co2 == null ? null : +m.co2, rank: +m.rank || null, note: m.note || '', active: m.active !== false };
      if (m.id) Object.assign(this.db.methods.filter(function (x) { return x.id === m.id; })[0], data);
      else this.db.methods.push(Object.assign({ id: this.nid('m_') }, data));
      this.save();
    },
    wasteTypes: function (orgId, opts) {
      var u = this._auth();
      if (orgId) this._orgScope(u, orgId);
      else if (u.role === 'resp') orgId = u.orgId;
      return clone(this.db.wasteTypes.filter(function (w) {
        return (!orgId || w.orgId === orgId || w.orgId === null) && ((opts && opts.all) || w.active);
      }));
    },
    wasteType: function (id) { return this.db.wasteTypes.filter(function (w) { return w.id === id; })[0] || null; },
    typeUsage: function (id) { return this.db.entries.filter(function (e) { return e.typeId === id; }).length; },
    saveWasteType: function (w) {
      var u = this._auth(['resp', 'reviewer', 'admin']);
      if (u.role === 'resp') { w.orgId = u.orgId; if (w.id) throw new ApiError(t('Изменять справочник может проверяющий или администратор'), 'FORBIDDEN'); }
      var name = String(w.name || '').trim();
      if (!name) throw new ApiError(t('Введите наименование отхода'), 'VALIDATION');
      if (!w.methodId) throw new ApiError(t('Выберите способ утилизации'), 'VALIDATION');
      var dup = this.db.wasteTypes.filter(function (x) { return x.orgId === w.orgId && x.name.toLowerCase() === name.toLowerCase() && x.id !== w.id; })[0];
      if (dup) throw new ApiError(t('Такой вид отхода уже есть в справочнике организации'), 'VALIDATION');
      var rec = {
        name: name, unit: w.unit === 'l' ? 'l' : 'kg', density: w.unit === 'l' ? (+w.density || 0.92) : 1,
        category: w.category || 'food', co2: w.co2 != null && w.co2 !== '' ? +w.co2 : 0.70021,
        methodId: w.methodId, maxQty: +w.maxQty || 200
      };
      var lvl = w.recLevel || (w.recyclable ? 'yes' : 'no');
      rec.recLevel = lvl; rec.recyclable = lvl === 'yes';
      if (w.recMethodId !== undefined) rec.recMethodId = w.recMethodId || null;
      if (w.recCo2 !== undefined && w.recCo2 !== '') rec.recCo2 = w.recCo2 == null ? null : +w.recCo2;
      if (w.note !== undefined) rec.note = String(w.note || '');
      var t0;
      if (w.id) { t0 = this.db.wasteTypes.filter(function (x) { return x.id === w.id; })[0]; Object.assign(t0, rec, { active: w.active !== false }); }
      else { t0 = Object.assign({ id: this.nid('wt_'), orgId: w.orgId || null, active: true, createdBy: u.id }, rec); this.db.wasteTypes.push(t0); }
      this.save();
      return clone(t0);
    },
    setWasteTypeActive: function (id, active) {
      this._auth(['reviewer', 'admin']);
      this.db.wasteTypes.filter(function (x) { return x.id === id; })[0].active = !!active; this.save();
    },
    deleteWasteType: function (id) {
      this._auth(['admin']);
      if (this.typeUsage(id) > 0) throw new ApiError(t('По этому виду есть записи — удаление запрещено, используйте деактивацию'), 'VALIDATION');
      this.db.wasteTypes = this.db.wasteTypes.filter(function (x) { return x.id !== id; }); this.save();
    },

    /* ---------- Отчёты ---------- */
    _report: function (orgId, period, create, u) {
      var r = this.db.reports.filter(function (x) { return x.orgId === orgId && x.period === period; })[0];
      if (!r && create) {
        r = { id: this.nid('rep_'), orgId: orgId, period: period, status: 'draft', createdAt: nowStr(), submittedAt: null, reviewerId: null, decidedAt: null };
        this.db.reports.push(r);
        this._hist(r, null, 'draft', 'create', u.id, '');
      }
      return r || null;
    },
    _hist: function (r, from, to, action, uid, comment) {
      this.db.history.push({ id: this.nid('h_'), reportId: r.id, from: from, to: to, action: action, userId: uid, comment: comment || '', at: nowStr() });
    },
    reportByPeriod: function (orgId, period) {
      var u = this._auth(); this._orgScope(u, orgId);
      return clone(this._report(orgId, period, false));
    },
    report: function (id) {
      var u = this._auth();
      var r = this.db.reports.filter(function (x) { return x.id === id; })[0];
      if (!r) throw new ApiError(t('Отчёт не найден'), 'NOTFOUND');
      this._orgScope(u, r.orgId);
      return clone(r);
    },
    reports: function (f) {
      var u = this._auth(); f = f || {};
      var self = this;
      return this.db.reports.filter(function (r) {
        if (u.role === 'resp' && r.orgId !== u.orgId) return false;
        if (f.orgId && r.orgId !== f.orgId) return false;
        if (f.status && f.status.length && f.status.indexOf(r.status) < 0) return false;
        if (f.period && r.period !== f.period) return false;
        return true;
      }).map(function (r) {
        var c = clone(r); var es = self.db.entries.filter(function (e) { return e.reportId === r.id; });
        c.count = es.length; c.kg = es.reduce(function (s, e) { return s + self.kg(e); }, 0);
        return c;
      }).sort(function (a, b) { return a.period < b.period ? 1 : a.period > b.period ? -1 : (a.orgId < b.orgId ? -1 : 1); });
    },
    reportEntries: function (reportId) {
      var r = this.report(reportId);
      return clone(this.db.entries.filter(function (e) { return e.reportId === r.id; }))
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1); });
    },
    history: function (reportId) {
      this.report(reportId);
      return clone(this.db.history.filter(function (h) { return h.reportId === reportId; }))
        .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    },
    submitReport: function (id) {
      var u = this._auth(['resp']);
      var r = this.db.reports.filter(function (x) { return x.id === id; })[0];
      if (!r) throw new ApiError(t('Отчёт не найден'), 'NOTFOUND');
      this._orgScope(u, r.orgId);
      if (EDITABLE.indexOf(r.status) < 0) throw new ApiError(t('Отчёт уже отправлен или принят'), 'STATE');
      if (!this.db.entries.some(function (e) { return e.reportId === r.id; })) throw new ApiError(t('В отчёте нет ни одной записи'), 'VALIDATION');
      var from = r.status; r.status = 'submitted'; r.submittedAt = nowStr();
      this._hist(r, from, 'submitted', 'submit', u.id, from === 'returned' ? t('Исправлено и отправлено повторно') : '');
      this.save(); return clone(r);
    },
    startReview: function (id) {
      var u = this._auth(['reviewer', 'admin']);
      var r = this.db.reports.filter(function (x) { return x.id === id; })[0];
      if (!r || r.status !== 'submitted') return r ? clone(r) : null;
      r.status = 'in_review'; r.reviewerId = u.id;
      this._hist(r, 'submitted', 'in_review', 'review', u.id, '');
      this.save(); return clone(r);
    },
    decideReport: function (id, accept, comment) {
      var u = this._auth(['reviewer', 'admin']);
      var r = this.db.reports.filter(function (x) { return x.id === id; })[0];
      if (!r) throw new ApiError(t('Отчёт не найден'), 'NOTFOUND');
      if (['submitted', 'in_review'].indexOf(r.status) < 0) throw new ApiError(t('Решение можно принять только по отправленному отчёту'), 'STATE');
      comment = String(comment || '').trim();
      if (!accept && !comment) throw new ApiError(t('При возврате комментарий обязателен'), 'VALIDATION');
      var from = r.status;
      if (from === 'submitted') { this._hist(r, 'submitted', 'in_review', 'review', u.id, ''); from = 'in_review'; }
      r.status = accept ? 'accepted' : 'returned'; r.reviewerId = u.id; r.decidedAt = nowStr();
      this._hist(r, from, r.status, accept ? 'accept' : 'return', u.id, comment || (accept ? t('Принято') : ''));
      this.save(); return clone(r);
    },

    /* ---------- Записи (взвешивания) ---------- */
    _validateEntry: function (u, d, existingId) {
      if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new ApiError(t('Укажите дату'), 'VALIDATION');
      if (d.date > todayStr()) throw new ApiError(t('Дата не может быть в будущем'), 'VALIDATION');
      var w = this.wasteType(d.typeId);
      if (!w || !w.active || (w.orgId && w.orgId !== d.orgId)) throw new ApiError(t('Выберите вид отхода из справочника организации'), 'VALIDATION');
      var q = +String(d.qty).replace(',', '.');
      if (!(q > 0)) throw new ApiError(t('Количество должно быть больше нуля'), 'VALIDATION');
      if (q > (w.maxQty || 500)) throw new ApiError(t('Слишком большое значение: максимум {max} {unit} за одну запись', { max: w.maxQty, unit: unitLabel(w.unit) }), 'VALIDATION');
      if (!d.methodId || !this.method(d.methodId)) throw new ApiError(t('Выберите способ утилизации'), 'VALIDATION');
      if (!d.force) {
        var dup = this.db.entries.filter(function (e) { return e.orgId === d.orgId && e.date === d.date && e.typeId === d.typeId && Math.abs(e.qty - q) < 0.001 && e.id !== existingId; })[0];
        if (dup) throw new ApiError(t('Похоже на дубль: такая же запись за эту дату уже есть. Сохранить всё равно?'), 'DUP');
      }
      return q;
    },
    addEntry: function (d) {
      var u = this._auth(['resp']);
      d.orgId = u.orgId;
      var q = this._validateEntry(u, d);
      var r = this._report(u.orgId, d.date.slice(0, 7), true, u);
      if (EDITABLE.indexOf(r.status) < 0) throw new ApiError(t('Отчёт за этот период уже отправлен или принят — редактирование заблокировано'), 'LOCKED');
      var e = { id: this.nid('e_'), reportId: r.id, orgId: u.orgId, date: d.date, typeId: d.typeId, qty: q, methodId: d.methodId, userId: u.id, photo: d.photo || null, note: d.note || '', createdAt: nowStr() };
      this.db.entries.push(e);
      this.save(); return clone(e);
    },
    updateEntry: function (id, d) {
      var u = this._auth(['resp']);
      var e = this.db.entries.filter(function (x) { return x.id === id; })[0];
      if (!e) throw new ApiError(t('Запись не найдена'), 'NOTFOUND');
      this._orgScope(u, e.orgId);
      var r = this.db.reports.filter(function (x) { return x.id === e.reportId; })[0];
      if (EDITABLE.indexOf(r.status) < 0) throw new ApiError(t('Отчёт уже отправлен или принят — редактирование заблокировано'), 'LOCKED');
      d.orgId = e.orgId;
      if (d.date.slice(0, 7) !== r.period) throw new ApiError(t('Дата должна быть в пределах периода отчёта'), 'VALIDATION');
      var q = this._validateEntry(u, d, id);
      var before = this.wasteType(e.typeId).name + ' ' + e.qty;
      Object.assign(e, { date: d.date, typeId: d.typeId, qty: q, methodId: d.methodId, note: d.note || '', updatedAt: nowStr(), userId: u.id });
      if (d.photo !== undefined) e.photo = d.photo;
      this._hist(r, r.status, r.status, 'edit', u.id, t('Изменена запись') + ': ' + before + ' → ' + this.wasteType(e.typeId).name + ' ' + q + ' (' + e.date + ')');
      this.save(); return clone(e);
    },
    deleteEntry: function (id) {
      var u = this._auth(['resp']);
      var e = this.db.entries.filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      this._orgScope(u, e.orgId);
      var r = this.db.reports.filter(function (x) { return x.id === e.reportId; })[0];
      if (EDITABLE.indexOf(r.status) < 0) throw new ApiError(t('Отчёт уже отправлен или принят — редактирование заблокировано'), 'LOCKED');
      this.db.entries = this.db.entries.filter(function (x) { return x.id !== id; });
      this._hist(r, r.status, r.status, 'delete', u.id, t('Удалена запись') + ': ' + this.wasteType(e.typeId).name + ' ' + e.qty + ' (' + e.date + ')');
      this.save();
    },
    orgEntries: function (orgId, from, to) {
      var u = this._auth(); this._orgScope(u, orgId);
      return clone(this.db.entries.filter(function (e) { return e.orgId === orgId && (!from || e.date >= from) && (!to || e.date <= to); }));
    },

    /* ---------- Реестр и аналитика ---------- */
    _acceptedIds: function () {
      var s = {}; this.db.reports.forEach(function (r) { if (r.status === 'accepted') s[r.id] = 1; }); return s;
    },
    /* Единый реестр = записи отчётов со статусом «принято». */
    registry: function (f) {
      this._auth(['reviewer', 'admin', 'mgmt']); f = f || {};
      var acc = this._acceptedIds(), self = this;
      return clone(this.db.entries.filter(function (e) {
        if (!acc[e.reportId]) return false;
        var p = e.date.slice(0, 7);
        if (f.from && p < f.from) return false;
        if (f.to && p > f.to) return false;
        if (f.orgId && e.orgId !== f.orgId) return false;
        if (f.typeName && self.wasteType(e.typeId).name !== f.typeName) return false;
        if (f.methodId && e.methodId !== f.methodId) return false;
        return true;
      }));
    },
    /* Данные для dashboard: ответственное лицо видит все записи своей организации,
       остальные роли — принятые записи (или все, если includePending). */
    analyticsEntries: function (includePending) {
      var u = this._auth();
      if (u.role === 'resp') return clone(this.db.entries.filter(function (e) { return e.orgId === u.orgId; }));
      if (includePending) return clone(this.db.entries);
      return this.registry({});
    },
    nonSubmitters: function (periods) {
      this._auth(['reviewer', 'admin', 'mgmt']);
      var self = this, out = [];
      this.db.orgs.filter(function (o) { return o.active; }).forEach(function (o) {
        periods.forEach(function (p) {
          var r = self.db.reports.filter(function (x) { return x.orgId === o.id && x.period === p; })[0];
          if (!r || r.status !== 'accepted') out.push({ orgId: o.id, period: p, status: r ? r.status : 'none' });
        });
      });
      return out;
    },

    /* ---------- Вспомогательные расчёты ---------- */
    kg: function (e) { var w = this.wasteType(e.typeId); return e.qty * (w && w.unit === 'l' ? (w.density || 0.92) : 1); },
    isDiverted: function (e) { var m = this.method(e.methodId); return !!m && m.mode !== 'landfill'; },
    /* CO₂-экв., кг: ТБО — коэффициент вида отхода; иначе — коэффициент способа (DEFRA 2024, файл оргкомитета) */
    co2: function (e) {
      var w = this.wasteType(e.typeId), m = this.method(e.methodId);
      if (!m || m.mode === 'landfill') return this.kg(e) * (w ? w.co2 : 0.70021);
      return this.kg(e) * (m.co2 != null ? m.co2 : 0);
    },
    recLevel: function (w) { return w ? (w.recLevel || (w.recyclable ? 'yes' : 'no')) : 'no'; },
    /* потенциал снижения: масса × (коэффициент ТБО − коэффициент рекомендуемого способа), если сейчас вывозится на ТБО */
    co2Saving: function (e) {
      var w = this.wasteType(e.typeId);
      if (!w || this.isDiverted(e) || this.recLevel(w) === 'no') return 0;
      var rc = w.recCo2 != null ? w.recCo2 : ((this.method(w.recMethodId) || {}).co2);
      if (rc == null) rc = 0.00888;
      return this.kg(e) * Math.max(0, w.co2 - rc);
    },

    /* ---------- Импорт справочника из Excel (формат файла оргкомитета) ---------- */
    importReference: function (ref) {
      this._auth(['reviewer', 'admin']);
      var self = this, rep = { methodsUpdated: 0, methodsCreated: 0, typesUpdated: 0, typesCreated: 0, skipped: [] };
      var MODE = { DONATE: 'donate', FEED: 'feed', RECYCLE: 'recycle', OIL: 'recycle', AD: 'ad', COMPOST: 'compost', TBO: 'landfill', TBO_BIN: 'landfill' };
      (ref.methods || []).forEach(function (r) {
        var code = String(r.code || '').trim().toUpperCase(); if (!code || !r.name) return;
        var m = self.db.methods.filter(function (x) { return x.code === code; })[0];
        var data = { code: code, name: r.name, mode: MODE[code] || (/тбо|полигон/i.test(r.name) ? 'landfill' : 'recycle'), co2: r.co2 != null && r.co2 !== '' ? +r.co2 / 1000 : (code === 'TBO' ? null : 0), rank: +r.rank || null, note: r.note || '', active: true };
        if (m) { Object.assign(m, data); rep.methodsUpdated++; } else { self.db.methods.push(Object.assign({ id: self.nid('m_') }, data)); rep.methodsCreated++; }
      });
      function methodByText(txt) {
        var x = String(txt || '').toLowerCase(), order = [[/фудшер|передач.*продук|благотвор/, 'DONATE'], [/компост/, 'COMPOST'], [/биогаз|анаэроб/, 'AD'], [/корм/, 'FEED'], [/масл|биодиз|спецорганиз/, 'OIL'], [/переработ|вторсыр/, 'RECYCLE'], [/тбо|полигон/, 'TBO']];
        for (var i = 0; i < order.length; i++) if (order[i][0].test(x)) { var c = order[i][1]; return self.db.methods.filter(function (m) { return m.code === c; })[0]; }
        return null;
      }
      var ORGS = [[/atu inn|гостинич/i, 'org_inn'], [/столов|искандер/i, 'org_iskander'], [/кофейн|canella/i, 'org_canella'], [/тхипп/i, 'org_thpp'], [/кафедра тпп|(^|[^х])тпп/i, 'org_tpp']];
      var CAT = { 'органические': 'food', 'специальные': 'oil', 'смешанные': 'other' };
      (ref.types || []).forEach(function (r) {
        var name = String(r.name || '').trim(); if (!name) return;
        var orgIds = [];
        String(r.orgs || '').split(/[;,]/).forEach(function (part) { ORGS.forEach(function (o) { if (o[0].test(part) && orgIds.indexOf(o[1]) < 0) orgIds.push(o[1]); }); });
        if (!orgIds.length) { rep.skipped.push(name); return; }
        var cat = CAT[String(r.category || '').toLowerCase()] || (/картон|бумаг/i.test(name) ? 'paper' : /вторсыр/i.test(r.category || '') ? 'packaging' : 'food');
        var lvl = /частич/i.test(r.recyclable) ? 'partial' : /нет/i.test(r.recyclable) ? 'no' : 'yes';
        var rm = methodByText(r.recMethod);
        var unit = /^л/i.test(String(r.unit || '')) ? 'l' : 'kg';
        orgIds.forEach(function (oid) {
          var w = self.db.wasteTypes.filter(function (x) { return x.orgId === oid && x.name.toLowerCase() === name.toLowerCase(); })[0];
          var data = { category: cat, recLevel: lvl, recyclable: lvl === 'yes', unit: unit, density: unit === 'l' ? 0.92 : 1, note: r.note || '' };
          if (r.co2Tbo !== '' && r.co2Tbo != null) data.co2 = +r.co2Tbo / 1000;
          if (r.co2Rec !== '' && r.co2Rec != null) data.recCo2 = +r.co2Rec / 1000;
          if (rm) data.recMethodId = rm.id;
          if (w) { Object.assign(w, data); rep.typesUpdated++; }
          else {
            var tbo = self.db.methods.filter(function (m) { return m.code === 'TBO'; })[0] || self.db.methods[0];
            self.db.wasteTypes.push(Object.assign({ id: self.nid('wt_'), orgId: oid, name: name, methodId: tbo.id, maxQty: 200, active: true, co2: 0.70021 }, data));
            rep.typesCreated++;
          }
        });
      });
      this.save();
      return rep;
    },

    /* ---------- Данные ---------- */
    resetDemo: function () { this._auth(['admin']); this.db = window.buildSeed(todayStr()); this.save(); },
    exportJson: function () { this._auth(['admin']); return JSON.stringify(this.db); },
    importJson: function (s) {
      this._auth(['admin']);
      var d = JSON.parse(s);
      if (!d || d.version !== 1 || !d.orgs || !d.entries) throw new ApiError(t('Файл не является резервной копией EcoTrack'), 'VALIDATION');
      this.db = d; this.save();
    }
  };

  window.unitLabel = function (u) { return u === 'l' ? t('л') : t('кг'); };
  window.API = API;
})();
