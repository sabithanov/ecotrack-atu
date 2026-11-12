/* Облачная синхронизация через Supabase (PostgREST, без SDK).
   Локальная копия (API.db) остаётся основной для UI; изменения отправляются в облако,
   а изменения других устройств подтягиваются каждые несколько секунд. */
(function () {
  var COLS = ['orgs', 'users', 'methods', 'wasteTypes', 'reports', 'entries', 'history'];
  var TABLE = 'ecotrack_records';
  var POLL_MS = 4000, BATCH = 400, PAGE = 1000;
  var LS_CLOUD = 'ecotrack_cloud';

  /* JSON с отсортированными ключами: jsonb в Postgres не сохраняет порядок ключей */
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }

  var Sync = {
    enabled: false, status: 'local', error: null, lastPull: null, lastOk: null,
    snap: {}, timer: null, pushTimer: null, pushing: null, pendingRender: false, c: null,

    config: function () {
      var o = null;
      try { o = JSON.parse(localStorage.getItem(LS_CLOUD)); } catch (e) { }
      if (o && o.url && o.key) return o;
      var c = window.ECOTRACK_CONFIG || {};
      if (c.supabaseUrl && c.supabaseKey) return { url: c.supabaseUrl, key: c.supabaseKey, fromFile: true };
      return null;
    },
    configured: function () { return !!this.config(); },
    saveConfig: function (url, key) {
      if (url && key) localStorage.setItem(LS_CLOUD, JSON.stringify({ url: url.trim(), key: key.trim() }));
      else localStorage.removeItem(LS_CLOUD);
    },

    _headers: function (extra) {
      var h = { apikey: this.c.key, 'Content-Type': 'application/json' };
      if (/^eyJ/.test(this.c.key)) h.Authorization = 'Bearer ' + this.c.key; // старый JWT-ключ anon
      for (var k in (extra || {})) h[k] = extra[k];
      return h;
    },
    _url: function (qs) { return this.c.url.replace(/\/+$/, '') + '/rest/v1/' + TABLE + (qs || ''); },
    _req: function (method, qs, body, extra) {
      var self = this;
      return fetch(this._url(qs), { method: method, headers: this._headers(extra), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
        .then(function (r) {
          return r.text().then(function (tx) {
            if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + tx.slice(0, 300));
            return tx ? JSON.parse(tx) : null;
          });
        });
    },
    _setStatus: function (s, err) {
      this.status = s; this.error = err || null;
      if (s === 'online') this.lastOk = new Date();
      var el = document.getElementById('sync-ind');
      if (el) { el.className = 'sync-ind ' + s; el.title = this.statusText(); el.textContent = s === 'online' ? '☁ ' + t('онлайн') : s === 'syncing' ? '☁ …' : s === 'offline' ? '☁ ' + t('офлайн') : t('локально'); }
    },
    statusText: function () {
      if (!this.enabled) return t('Локальный режим: данные хранятся только в этом браузере');
      if (this.status === 'offline') return t('Нет связи с облаком — изменения сохранены локально и будут отправлены позже') + (this.error ? ' (' + this.error + ')' : '');
      return t('Облако Supabase: данные общие для всех устройств') + (this.lastOk ? ' · ' + this.lastOk.toLocaleTimeString() : '');
    },

    /* ---------- чтение ---------- */
    _fetchSince: function (since) {
      var self = this, all = [];
      function page(offset) {
        var qs = '?select=collection,id,data,deleted,updated_at&order=updated_at.asc,collection.asc,id.asc&limit=' + PAGE + '&offset=' + offset +
          (since ? '&updated_at=gt.' + encodeURIComponent(since) : '');
        return self._req('GET', qs).then(function (rows) {
          all = all.concat(rows || []);
          if (rows && rows.length === PAGE) return page(offset + PAGE);
          return all;
        });
      }
      return page(0);
    },
    _trackTs: function (rows) {
      var self = this;
      rows.forEach(function (r) { if (!self.lastPull || r.updated_at > self.lastPull) self.lastPull = r.updated_at; });
    },
    /* применяет строки из облака к локальной копии; возвращает true, если что-то изменилось */
    _apply: function (rows) {
      var db = API.db, self = this, changed = false, idx = {};
      COLS.forEach(function (col) { self.snap[col] = self.snap[col] || {}; });
      self.snap.meta = self.snap.meta || {};
      function index(col) {
        if (!idx[col]) { idx[col] = {}; db[col].forEach(function (o, i) { idx[col][o.id] = i; }); }
        return idx[col];
      }
      rows.forEach(function (r) {
        if (r.collection === 'meta') {
          if (r.id === 'settings' && r.data) {
            var ss = stable(r.data);
            if (self.snap.meta.settings !== ss) { db.settings = r.data; self.snap.meta.settings = ss; changed = true; }
          }
          return;
        }
        var col = r.collection;
        if (COLS.indexOf(col) < 0) return;
        var s = self.snap[col], ix = index(col);
        if (r.deleted || !r.data) {
          if (ix[r.id] != null) { db[col].splice(ix[r.id], 1); idx[col] = null; changed = true; }
          s[r.id] = null;
          return;
        }
        var str = stable(r.data);
        if (s[r.id] === str) return;
        if (ix[r.id] != null) db[col][ix[r.id]] = r.data; else { db[col].push(r.data); idx[col] = null; }
        s[r.id] = str; changed = true;
      });
      this._trackTs(rows);
      if (changed) API._persist();
      return changed;
    },
    pull: function () {
      var self = this;
      var since = this.lastPull ? new Date(Date.parse(this.lastPull) - 3000).toISOString() : null;
      return this._fetchSince(since).then(function (rows) {
        var ch = self._apply(rows);
        self._setStatus('online');
        return ch;
      });
    },

    /* ---------- запись ---------- */
    _diff: function () {
      var db = API.db, self = this, ups = [];
      COLS.forEach(function (col) {
        var s = self.snap[col] = self.snap[col] || {}, seen = {};
        db[col].forEach(function (o) {
          seen[o.id] = 1;
          var str = stable(o);
          if (s[o.id] !== str) ups.push({ row: { collection: col, id: o.id, data: o, deleted: false }, col: col, id: o.id, str: str });
        });
        Object.keys(s).forEach(function (id) {
          if (!seen[id] && s[id] !== null) ups.push({ row: { collection: col, id: id, data: null, deleted: true }, col: col, id: id, str: null });
        });
      });
      self.snap.meta = self.snap.meta || {};
      var st = stable(db.settings);
      if (self.snap.meta.settings !== st) ups.push({ row: { collection: 'meta', id: 'settings', data: db.settings, deleted: false }, col: 'meta', id: 'settings', str: st });
      return ups;
    },
    push: function () {
      var self = this;
      if (!this.enabled || this.needInit) return Promise.resolve();
      if (this.pushing) { this.pushAgain = true; return this.pushing; }
      var ups = this._diff();
      if (!ups.length) return Promise.resolve();
      self._setStatus('syncing');
      var batches = [];
      for (var i = 0; i < ups.length; i += BATCH) batches.push(ups.slice(i, i + BATCH));
      var p = batches.reduce(function (chain, b) {
        return chain.then(function () {
          return self._req('POST', '?on_conflict=collection,id', b.map(function (u) { return u.row; }), { Prefer: 'resolution=merge-duplicates,return=minimal' })
            .then(function () { b.forEach(function (u) { (self.snap[u.col] = self.snap[u.col] || {})[u.id] = u.str; }); });
        });
      }, Promise.resolve());
      this.pushing = p.then(function () { self._setStatus('online'); })
        .catch(function (e) { console.error(e); self._setStatus('offline', e.message); })
        .then(function () { self.pushing = null; if (self.pushAgain) { self.pushAgain = false; return self.push(); } });
      return this.pushing;
    },
    schedulePush: function () {
      var self = this;
      if (!this.enabled) return;
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(function () { self.push(); }, 250);
    },

    /* ---------- запуск ---------- */
    init: function () {
      var self = this;
      this.c = this.config();
      if (!this.c) return Promise.resolve(false);
      this.enabled = true; this.snap = {}; this.lastPull = null;
      this._setStatus('syncing');
      return this._fetchSince(null).then(function (rows) {
        if (!rows.length) {
          // облако пустое → загружаем туда текущие (демо) данные этого устройства
          return self.push().then(function () { return self.pull(); });
        }
        // облако — источник истины: собираем локальную копию из строк
        var db = { version: 1, seq: (API.db && API.db.seq) || 100, settings: API.db.settings };
        COLS.forEach(function (col) { db[col] = []; });
        API.db = db;
        self._apply(rows);
        API._persist();
        self._setStatus('online');
        return true;
      }).then(function () {
        self._startPolling();
        return true;
      });
    },
    _startPolling: function () {
      var self = this;
      clearInterval(this.timer);
      this.timer = setInterval(function () { self.tick(); }, POLL_MS);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) self.tick(); });
    },
    _busy: function () {
      var a = document.activeElement;
      if (document.querySelector('.modal-wrap')) return true;
      var panel = document.getElementById('entry-panel');
      if (panel && !panel.hidden) return true;
      return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    },
    tick: function () {
      var self = this;
      if (!this.enabled || this.ticking) return;
      this.ticking = true;
      var work = this.needInit
        ? this.init().then(function () { self.needInit = false; return true; })
        : Promise.resolve(this.pushing).then(function () { return self.push(); }).then(function () { return self.pull(); });
      work
        .then(function (changed) {
          if (changed) self.pendingRender = true;
          if (self.pendingRender && !self._busy() && window.route) { self.pendingRender = false; var y = window.scrollY; window.route(); window.scrollTo(0, y); }
        })
        .catch(function (e) { self._setStatus('offline', e.message); })
        .then(function () { self.ticking = false; });
    },
    stop: function () { clearInterval(this.timer); this.enabled = false; this._setStatus('local'); },
    stable: stable
  };
  window.Sync = Sync;
})();
