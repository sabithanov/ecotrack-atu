/* Каркас приложения: роутер, навигация по ролям, вход. */
(function () {
  var NAV = {
    resp: [['form', '✚', 'Ввод'], ['reports', '▤', 'Мои отчёты'], ['dashboard', '◔', 'Аналитика']],
    reviewer: [['dashboard', '◔', 'Dashboard'], ['reports', '✓', 'Проверка отчётов'], ['registry', '▦', 'Реестр'], ['summary', '∑', 'Сводный отчёт'], ['admin', '⚙', 'Справочники']],
    admin: [['dashboard', '◔', 'Dashboard'], ['reports', '✓', 'Отчёты'], ['registry', '▦', 'Реестр'], ['summary', '∑', 'Сводный отчёт'], ['admin', '⚙', 'Администрирование']],
    mgmt: [['dashboard', '◔', 'Dashboard'], ['registry', '▦', 'Реестр'], ['summary', '∑', 'Сводный отчёт'], ['reports', '▤', 'Отчёты']]
  };
  var HOME = { resp: 'form', reviewer: 'reports', admin: 'dashboard', mgmt: 'dashboard' };

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {}, parts = h.split('?');
    (parts[1] || '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    var seg = parts[0].split('/');
    return { name: seg[0] || '', arg: seg[1] || null, q: q };
  }
  window.go = function (path) { location.hash = '#/' + path; };

  function shell(user, active) {
    var org = user.orgId ? API.org(user.orgId) : null;
    var items = NAV[user.role] || [];
    var nav = items.map(function (it) {
      return '<a href="#/' + it[0] + '" class="nav-item' + (active === it[0] ? ' active' : '') + '"><span class="ni">' + it[1] + '</span><span>' + esc(t(it[2])) + '</span></a>';
    }).join('');
    return '<div class="layout">' +
      '<aside class="sidebar"><div class="brand"><img src="assets/icon.svg" alt=""><div><b>EcoTrack</b><small>ATU · Smart Food</small></div></div>' +
      '<nav>' + nav + '</nav>' +
      '<div class="side-foot">' + esc(t('Трек 1 · хакатон Smart Food Industries')) + '</div></aside>' +
      '<div class="main"><header class="topbar">' +
      '<div class="tb-title"><img class="tb-logo" src="assets/icon.svg" alt=""><div><b>' + esc(user.name) + '</b><small>' + esc(t(ROLES[user.role])) + (org ? ' · ' + esc(org.short) : '') + '</small></div></div>' +
      '<div class="tb-actions">' + syncChip() + '<button class="chip" id="lang-btn" title="Тіл / Язык">' + (I18N.lang === 'ru' ? 'ҚАЗ' : 'РУС') + '</button>' +
      '<button class="chip" id="logout-btn">' + esc(t('Выход')) + '</button></div></header>' +
      '<main id="view"></main></div>' +
      '<nav class="bottom-nav">' + nav + '</nav></div>';
  }

  function syncChip() {
    var S = window.Sync;
    var st = S && S.enabled ? S.status : 'local';
    var label = st === 'online' ? '☁ ' + t('онлайн') : st === 'syncing' ? '☁ …' : st === 'offline' ? '☁ ' + t('офлайн') : t('локально');
    return '<span id="sync-ind" class="sync-ind ' + st + '" title="' + esc(S ? S.statusText() : '') + '">' + esc(label) + '</span>';
  }
  window.syncChip = syncChip;

  function bindShell() {
    var si = $('#sync-ind');
    if (si) si.onclick = function () { toast(Sync.statusText()); if (Sync.enabled) Sync.tick(); };
    $('#lang-btn').onclick = function () { I18N.set(I18N.lang === 'ru' ? 'kk' : 'ru'); route(); };
    $('#logout-btn').onclick = function () { API.logout(); go('login'); };
  }

  function renderLogin(q) {
    var demo = [
      ['iskander@atu.kz', 'Ответственное лицо', 'Столовая «Искандер»'],
      ['reviewer@atu.kz', 'Проверяющий', 'Экологический отдел'],
      ['admin@atu.kz', 'Администратор', ''],
      ['rector@atu.kz', 'Руководство', ''],
      ['inn@atu.kz', 'Ответственное лицо', 'ATU INN'],
      ['canella@atu.kz', 'Ответственное лицо', 'Кофейня Canella'],
      ['tpp@atu.kz', 'Ответственное лицо', 'Кафедра ТПП'],
      ['thpp@atu.kz', 'Ответственное лицо', 'Кафедра ТХиПП']
    ];
    var orgHint = '';
    if (q.org) { var o = API.db.orgs.filter(function (x) { return x.id === q.org; })[0]; if (o) orgHint = '<div class="alert info">' + esc(t('Форма учёта')) + ': <b>' + esc(o.name) + '</b>. ' + esc(t('Войдите, чтобы внести данные.')) + '</div>'; }
    $('#app').innerHTML =
      '<div class="login-page"><div class="login-card">' +
      '<div class="login-top"><img src="assets/icon.svg" alt=""><div><h1>EcoTrack ATU</h1><p>' + esc(t('Цифровая система управления пищевыми отходами университетского комплекса')) + '</p></div>' +
      '<button class="chip" id="lang-btn">' + (I18N.lang === 'ru' ? 'ҚАЗ' : 'РУС') + '</button></div>' + orgHint +
      '<form id="login-form" autocomplete="on">' +
      '<label class="field"><span>E-mail</span><input type="email" name="email" required autocomplete="username" inputmode="email"></label>' +
      '<label class="field"><span>' + esc(t('Пароль')) + '</span><input type="password" name="password" required autocomplete="current-password"></label>' +
      '<button class="btn primary block" type="submit">' + esc(t('Войти')) + '</button></form>' +
      '<div class="demo"><div class="demo-title">' + esc(t('Демо-доступы (пароль: demo123) — нажмите, чтобы войти')) + '</div><div class="demo-grid">' +
      demo.map(function (d) { return '<button class="demo-btn" data-email="' + d[0] + '"><b>' + esc(t(d[1])) + '</b><small>' + esc(d[2] ? t(d[2]) : d[0]) + '</small></button>'; }).join('') +
      '</div></div>' +
      '<p class="login-foot">' + syncChip() + ' ' + esc(t('Студенческий хакатон ATU «Smart Food Industries» · Трек 1')) + '</p>' +
      '</div></div>';
    $('#lang-btn').onclick = function () { I18N.set(I18N.lang === 'ru' ? 'kk' : 'ru'); renderLogin(q); };
    function doLogin(email, pw) {
      try {
        var u = API.login(email, pw);
        toast(t('Добро пожаловать') + ', ' + u.name);
        var back = sessionStorage.getItem('ecotrack_after_login');
        sessionStorage.removeItem('ecotrack_after_login');
        if (back) location.hash = back; else go(HOME[u.role]);
      } catch (e) { showError(e); }
    }
    $('#login-form').onsubmit = function (ev) { ev.preventDefault(); doLogin(this.email.value, this.password.value); };
    $$('.demo-btn').forEach(function (b) {
      b.onclick = function () { $('#login-form').email.value = b.dataset.email; $('#login-form').password.value = 'demo123'; doLogin(b.dataset.email, 'demo123'); };
    });
  }

  var VIEWS = {
    dashboard: function (u, h) { return Views.dashboard(u, h); },
    form: function (u, h) { return Views.form(u, h); },
    reports: function (u, h) { return Views.reports(u, h); },
    report: function (u, h) { return Views.report(u, h); },
    registry: function (u, h) { return Views.registry(u, h); },
    summary: function (u, h) { return Views.summary(u, h); },
    admin: function (u, h) { return Views.admin(u, h); }
  };
  var ACCESS = {
    form: ['resp'], registry: ['reviewer', 'admin', 'mgmt'], summary: ['reviewer', 'admin', 'mgmt'], admin: ['reviewer', 'admin'],
    dashboard: ['resp', 'reviewer', 'admin', 'mgmt'], reports: ['resp', 'reviewer', 'admin', 'mgmt'], report: ['resp', 'reviewer', 'admin', 'mgmt']
  };

  function route() {
    destroyCharts();
    var h = parseHash();
    var user = API.me();
    document.documentElement.lang = I18N.lang === 'kk' ? 'kk' : 'ru';
    if (!user) {
      if (h.name && h.name !== 'login') sessionStorage.setItem('ecotrack_after_login', location.hash);
      if (h.name !== 'login') { history.replaceState(null, '', '#/login' + (h.q.org ? '?org=' + h.q.org : '')); }
      return renderLogin(h.q);
    }
    if (h.name === 'login' || !h.name || !VIEWS[h.name]) return go(HOME[user.role]);
    if (ACCESS[h.name].indexOf(user.role) < 0) { toast(t('Раздел недоступен для вашей роли'), 'err'); return go(HOME[user.role]); }
    var active = h.name === 'report' ? 'reports' : h.name;
    $('#app').innerHTML = shell(user, active);
    bindShell();
    try { VIEWS[h.name](user, h); } catch (e) { showError(e); $('#view').innerHTML = '<div class="card"><p>' + esc(e.message || e) + '</p></div>'; }
    window.scrollTo(0, 0);
  }
  window.route = route;

  function start() {
    API.load();
    function go2() { window.addEventListener('hashchange', route); route(); }
    if (window.Sync && Sync.configured()) {
      $('#app').innerHTML = '<div class="boot">☁ ' + esc(t('Синхронизация с облаком…')) + '</div>';
      var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 12000); });
      Promise.race([Sync.init(), timeout]).catch(function (e) {
        console.error(e);
        Sync._setStatus('offline', e.message);
        Sync.needInit = true; // при появлении связи — полная загрузка из облака, а не слияние
        if (!Sync.timer) Sync._startPolling();
        setTimeout(function () { toast(t('Облако недоступно — работаем с локальной копией'), 'err'); }, 300);
      }).then(go2);
    } else go2();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
