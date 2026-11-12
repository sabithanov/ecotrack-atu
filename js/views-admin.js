/* Organizations & Roles: организации, пользователи, справочники, QR-коды, данные. */
(function () {
  window.Views = window.Views || {};

  var TABS = {
    admin: [['orgs', 'Организации'], ['users', 'Пользователи'], ['types', 'Виды отходов'], ['methods', 'Способы утилизации'], ['qr', 'QR-коды'], ['data', 'Настройки и данные']],
    reviewer: [['types', 'Виды отходов'], ['qr', 'QR-коды']]
  };

  Views.admin = function (user, h) {
    var view = $('#view');
    var tabs = TABS[user.role];
    var tab = h.arg && tabs.some(function (x) { return x[0] === h.arg; }) ? h.arg : tabs[0][0];
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(user.role === 'admin' ? t('Администрирование') : t('Справочники')) + '</h1>' +
      '<p class="muted">' + esc(t('Новые организации, пользователи и виды отходов подключаются без изменения кода')) + '</p></div></div>' +
      '<div class="tabs">' + tabs.map(function (x) { return '<a href="#/admin/' + x[0] + '" class="tab' + (x[0] === tab ? ' active' : '') + '">' + esc(t(x[1])) + '</a>'; }).join('') + '</div><div id="tab-body"></div>';
    ({ orgs: orgsTab, users: usersTab, types: typesTab, methods: methodsTab, qr: qrTab, data: dataTab })[tab](user, $('#tab-body'), h);
  };

  function formUrl(orgId) {
    var base = (window.ECOTRACK_CONFIG || {}).publicUrl || (location.origin + location.pathname);
    return base + '#/form?org=' + orgId;
  }

  /* ---------- Организации ---------- */
  function orgsTab(user, el) {
    var orgs = API.orgs({ all: true });
    var users = API.users();
    el.innerHTML = '<div class="row-actions"><button class="btn primary" id="org-add">＋ ' + esc(t('Подключить организацию')) + '</button></div>' +
      '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Название')) + '</th><th>' + esc(t('Тип')) + '</th><th>' + esc(t('Корпус / адрес')) + '</th><th>' + esc(t('Ответственные лица')) + '</th><th>' + esc(t('Видов отходов')) + '</th><th>' + esc(t('Статус')) + '</th><th></th></tr></thead><tbody>' +
      orgs.map(function (o) {
        var rs = users.filter(function (u) { return u.orgId === o.id && u.role === 'resp'; }).map(function (u) { return u.name; }).join(', ');
        return '<tr><td><b>' + esc(o.name) + '</b><div class="small muted">' + esc(o.short) + '</div></td><td>' + esc(t(ORG_TYPES[o.type] || o.type)) + '</td><td>' + esc(o.building) + '</td><td>' + esc(rs || '—') + '</td><td class="num">' + API.wasteTypes(o.id).length + '</td>' +
          '<td>' + (o.active ? '<span class="badge st-accepted">' + esc(t('активна')) + '</span>' : '<span class="badge st-none">' + esc(t('неактивна')) + '</span>') + '</td><td><button class="btn ghost sm" data-edit="' + o.id + '">✎</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('#org-add').onclick = function () { orgDialog(null, orgs); };
    $$('[data-edit]', el).forEach(function (b) { b.onclick = function () { orgDialog(orgs.filter(function (o) { return o.id === b.dataset.edit; })[0], orgs); }; });
  }
  function orgDialog(o, orgs) {
    o = o || { name: '', short: '', type: 'buffet', building: '', active: true };
    var body = '<label class="field"><span>' + esc(t('Полное название')) + ' *</span><input id="o-name" value="' + esc(o.name) + '"></label>' +
      '<label class="field"><span>' + esc(t('Краткое название')) + '</span><input id="o-short" value="' + esc(o.short) + '"></label>' +
      '<div class="grid2"><label class="field"><span>' + esc(t('Тип')) + '</span><select id="o-type">' + Object.keys(ORG_TYPES).map(function (k) { return '<option value="' + k + '"' + (o.type === k ? ' selected' : '') + '>' + esc(t(ORG_TYPES[k])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>' + esc(t('Корпус / адрес')) + '</span><input id="o-building" value="' + esc(o.building) + '"></label></div>' +
      (!o.id ? '<label class="field"><span>' + esc(t('Шаблон формы (скопировать виды отходов из)')) + '</span><select id="o-tpl"><option value="">' + esc(t('— пустой справочник —')) + '</option>' + optionList(orgs, '', function (x) { return x.id; }, function (x) { return x.short; }) + '</select></label>' : '') +
      '<label class="check"><input type="checkbox" id="o-active"' + (o.active ? ' checked' : '') + '> ' + esc(t('Организация активна')) + '</label>';
    openModal({
      title: o.id ? t('Организация') : t('Подключить организацию'), body: body,
      actions: [{ label: t('Отмена'), cls: 'ghost' }, {
        label: t('Сохранить'), cls: 'primary', onClick: function (w) {
          try {
            API.saveOrg({ id: o.id, name: $('#o-name', w).value.trim(), short: $('#o-short', w).value.trim(), type: $('#o-type', w).value, building: $('#o-building', w).value.trim(), active: $('#o-active', w).checked }, $('#o-tpl', w) ? $('#o-tpl', w).value : null);
            toast(t('Сохранено')); setTimeout(route, 0);
          } catch (e) { showError(e); return false; }
        }
      }]
    });
  }

  /* ---------- Пользователи ---------- */
  function usersTab(user, el) {
    var users = API.users();
    var orgs = API.orgs({ all: true });
    var on = {}; orgs.forEach(function (o) { on[o.id] = o.short; });
    el.innerHTML = '<div class="row-actions"><button class="btn primary" id="u-add">＋ ' + esc(t('Добавить пользователя')) + '</button></div>' +
      '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('ФИО')) + '</th><th>E-mail</th><th>' + esc(t('Роль')) + '</th><th>' + esc(t('Организация')) + '</th><th>' + esc(t('Статус')) + '</th><th></th></tr></thead><tbody>' +
      users.map(function (u) {
        return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + esc(t(ROLES[u.role])) + '</td><td>' + esc(u.orgId ? on[u.orgId] : '—') + '</td><td>' + (u.active ? '<span class="badge st-accepted">' + esc(t('активен')) + '</span>' : '<span class="badge st-none">' + esc(t('заблокирован')) + '</span>') + '</td><td><button class="btn ghost sm" data-edit="' + u.id + '">✎</button></td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">' + esc(t('Пароли хранятся только в виде солёного хэша SHA-256; права проверяются в слое API при каждом действии.')) + '</p></div>';
    $('#u-add').onclick = function () { userDialog(null, orgs); };
    $$('[data-edit]', el).forEach(function (b) { b.onclick = function () { userDialog(users.filter(function (u) { return u.id === b.dataset.edit; })[0], orgs); }; });
  }
  function userDialog(u, orgs) {
    u = u || { name: '', email: '', role: 'resp', orgId: orgs[0].id, active: true };
    var body = '<label class="field"><span>' + esc(t('ФИО')) + ' *</span><input id="u-name" value="' + esc(u.name) + '"></label>' +
      '<label class="field"><span>E-mail (' + esc(t('логин')) + ') *</span><input id="u-email" type="email" value="' + esc(u.email) + '"></label>' +
      '<div class="grid2"><label class="field"><span>' + esc(t('Роль')) + '</span><select id="u-role">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (u.role === k ? ' selected' : '') + '>' + esc(t(ROLES[k])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>' + esc(t('Организация')) + '</span><select id="u-org">' + optionList(orgs, u.orgId, function (o) { return o.id; }, function (o) { return o.short; }) + '</select></label></div>' +
      '<label class="field"><span>' + esc(u.id ? t('Новый пароль (оставьте пустым, чтобы не менять)') : t('Пароль')) + '</span><input id="u-pass" type="password" autocomplete="new-password"></label>' +
      '<label class="check"><input type="checkbox" id="u-active"' + (u.active ? ' checked' : '') + '> ' + esc(t('Активен')) + '</label>';
    var m = openModal({
      title: u.id ? t('Пользователь') : t('Добавить пользователя'), body: body,
      actions: [{ label: t('Отмена'), cls: 'ghost' }, {
        label: t('Сохранить'), cls: 'primary', onClick: function (w) {
          try {
            API.saveUser({ id: u.id, name: $('#u-name', w).value.trim(), email: $('#u-email', w).value, role: $('#u-role', w).value, orgId: $('#u-org', w).value, active: $('#u-active', w).checked }, $('#u-pass', w).value);
            toast(t('Сохранено')); setTimeout(route, 0);
          } catch (e) { showError(e); return false; }
        }
      }]
    });
    function sync() { $('#u-org', m.el).disabled = $('#u-role', m.el).value !== 'resp'; }
    $('#u-role', m.el).onchange = sync; sync();
  }

  /* ---------- Виды отходов ---------- */
  function kgT(v) { return v == null || v === '' ? '—' : fmt(v * 1000, 2); } // кг/кг → кг/т (как в справочнике оргкомитета)
  function typesTab(user, el, h) {
    var orgs = API.orgs({ all: true });
    var orgId = h.q.org || orgs[0].id;
    var types = API.wasteTypes(orgId, { all: true });
    var methods = API.methods({ all: true });
    var mn = {}; methods.forEach(function (m) { mn[m.id] = m.name; });
    el.innerHTML = '<div class="filters card"><label class="field"><span>' + esc(t('Организация')) + '</span><select id="t-org">' + optionList(orgs, orgId, function (o) { return o.id; }, function (o) { return o.name; }) + '</select></label>' +
      '<button class="btn primary" id="t-add">＋ ' + esc(t('Добавить вид отхода')) + '</button>' +
      '<label class="btn ghost file-btn">⬆ ' + esc(t('Импорт справочника из Excel')) + '<input type="file" id="t-import" accept=".xlsx,.xls" hidden></label></div>' +
      '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Наименование')) + '</th><th>' + esc(t('Ед.')) + '</th><th>' + esc(t('Категория')) + '</th><th>' + esc(t('Пригоден к переработке')) + '</th><th>' + esc(t('Способ сейчас')) + '</th><th>' + esc(t('Рекомендуемый способ')) + '</th>' +
      '<th class="num">CO₂ ' + esc(t('ТБО')) + ',<br>' + esc(t('кг/т')) + '</th><th class="num">CO₂ ' + esc(t('рекоменд.')) + ',<br>' + esc(t('кг/т')) + '</th><th class="num">' + esc(t('Экономия')) + ',<br>' + esc(t('кг/т')) + '</th><th class="num">' + esc(t('Записей')) + '</th><th>' + esc(t('Статус')) + '</th><th></th></tr></thead><tbody>' +
      types.map(function (w) {
        var used = API.typeUsage(w.id), lvl = API.recLevel(w);
        var rc = w.recCo2 != null ? w.recCo2 : null;
        return '<tr class="' + (w.active ? '' : 'inactive') + '"><td>' + esc(w.name) + (w.note ? '<div class="small muted">' + esc(w.note) + '</div>' : '') + '</td><td>' + unitLabel(w.unit) + '</td><td class="small">' + esc(t(CATEGORIES[w.category] || '')) + '</td>' +
          '<td><span class="badge ' + (lvl === 'yes' ? 'st-accepted' : lvl === 'partial' ? 'st-submitted' : 'st-none') + '">' + esc(t(REC_LEVELS[lvl])) + '</span></td>' +
          '<td class="small">' + esc(mn[w.methodId] || '') + '</td><td class="small">' + esc(mn[w.recMethodId] || '—') + '</td>' +
          '<td class="num">' + kgT(w.co2) + '</td><td class="num">' + kgT(rc) + '</td><td class="num"><b>' + (rc != null ? kgT(Math.max(0, w.co2 - rc)) : '—') + '</b></td><td class="num">' + used + '</td>' +
          '<td>' + (w.active ? '<span class="badge st-accepted">' + esc(t('активен')) + '</span>' : '<span class="badge st-none">' + esc(t('деактивирован')) + '</span>') + '</td>' +
          '<td class="nowrap"><button class="btn ghost sm" data-edit="' + w.id + '">✎</button> <button class="btn ghost sm" data-toggle="' + w.id + '">' + esc(w.active ? t('Деактивировать') : t('Активировать')) + '</button>' +
          (user.role === 'admin' && !used ? ' <button class="btn ghost sm" data-del="' + w.id + '">🗑</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">' + esc(t('Коэффициенты — UK DEFRA 2024 (Waste disposal), кг CO₂-экв на тонну, по справочнику оргкомитета. Экономия = масса × (CO₂ ТБО − CO₂ рекомендуемого способа).')) + ' ' + esc(t('Удаление вида отхода, по которому есть записи, запрещено — используйте деактивацию.')) + '</p></div>';
    $('#t-org').onchange = function () { go('admin/types?org=' + this.value); };
    $('#t-add').onclick = function () { typeDialog({ orgId: orgId, unit: 'kg', category: 'food', recLevel: 'yes', co2: 0.70021, recCo2: 0.00888, maxQty: 200, methodId: methods[0].id }, methods); };
    $('#t-import').onchange = function () { var f = this.files[0]; this.value = ''; if (f) importReferenceFile(f); };
    $$('[data-edit]', el).forEach(function (b) { b.onclick = function () { typeDialog(types.filter(function (w) { return w.id === b.dataset.edit; })[0], methods); }; });
    $$('[data-toggle]', el).forEach(function (b) {
      b.onclick = function () { var w = types.filter(function (x) { return x.id === b.dataset.toggle; })[0]; try { API.setWasteTypeActive(w.id, !w.active); route(); } catch (e) { showError(e); } };
    });
    $$('[data-del]', el).forEach(function (b) {
      b.onclick = function () { confirmDlg(t('Удалить вид отхода?'), t('Удалить')).then(function (ok) { if (!ok) return; try { API.deleteWasteType(b.dataset.del); route(); } catch (e) { showError(e); } }); };
    });
  }

  /* Импорт файла «Справочники для Трека 1: отходы, утилизация, CO₂» (листы «Виды отходов» и «Способы утилизации») */
  function importReferenceFile(file) {
    if (!window.XLSX) { toast(t('Библиотека Excel не загружена — нужен интернет при первом открытии'), 'err'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' });
        function sheet(re) { var n = wb.SheetNames.filter(function (x) { return re.test(x); })[0]; return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }) : []; }
        function col(row, re) { var k = Object.keys(row).filter(function (x) { return re.test(x); })[0]; return k ? row[k] : ''; }
        var types = sheet(/вид/i).map(function (r) {
          return { name: col(r, /^вид отход/i), orgs: col(r, /организ/i), category: col(r, /категор/i), unit: col(r, /^ед/i), recyclable: col(r, /пригод/i),
            recMethod: col(r, /рекоменд/i), co2Tbo: col(r, /тбо/i), co2Rec: col(r, /рекомендуемом|при рекоменд/i), note: col(r, /примеч/i) };
        }).filter(function (r) { return String(r.name).trim(); });
        var methods = sheet(/способ/i).map(function (r) {
          return { code: col(r, /^код/i), name: col(r, /^способ/i), co2: col(r, /co₂|co2/i), rank: col(r, /иерарх/i), note: col(r, /примеч/i) };
        }).filter(function (r) { return String(r.code).trim(); });
        if (!types.length && !methods.length) throw new Error(t('В файле не найдены листы «Виды отходов» / «Способы утилизации»'));
        var rep = API.importReference({ types: types, methods: methods });
        openModal({
          title: '✓ ' + t('Справочник загружен'),
          body: '<p><b>' + esc(file.name) + '</b></p><ul>' +
            '<li>' + esc(t('Способы утилизации')) + ': ' + esc(t('обновлено')) + ' ' + rep.methodsUpdated + ', ' + esc(t('добавлено')) + ' ' + rep.methodsCreated + '</li>' +
            '<li>' + esc(t('Виды отходов')) + ': ' + esc(t('обновлено')) + ' ' + rep.typesUpdated + ', ' + esc(t('добавлено')) + ' ' + rep.typesCreated + '</li>' +
            (rep.skipped.length ? '<li>' + esc(t('Пропущено (организация не найдена)')) + ': ' + esc(rep.skipped.join(', ')) + '</li>' : '') +
            '</ul><p class="small muted">' + esc(t('Категории, пригодность, рекомендуемые способы, коэффициенты CO₂ и примечания обновлены во всех организациях. Новые записи считаются по новым коэффициентам сразу.')) + '</p>',
          actions: [{ label: 'OK', cls: 'primary', onClick: function () { setTimeout(route, 0); } }]
        });
      } catch (e) { showError(e); }
    };
    rd.readAsArrayBuffer(file);
  }

  function typeDialog(w, methods) {
    var lvl = API.recLevel(w);
    var body = '<label class="field"><span>' + esc(t('Наименование отходов')) + ' *</span><input id="w-name" value="' + esc(w.name || '') + '"></label>' +
      '<div class="grid2"><label class="field"><span>' + esc(t('Единица')) + '</span><select id="w-unit"><option value="kg"' + (w.unit === 'kg' ? ' selected' : '') + '>' + esc(t('кг')) + '</option><option value="l"' + (w.unit === 'l' ? ' selected' : '') + '>' + esc(t('л')) + '</option></select></label>' +
      '<label class="field"><span>' + esc(t('Плотность, кг/л (для л)')) + '</span><input id="w-dens" type="number" step="0.01" value="' + (w.density || 1) + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>' + esc(t('Категория')) + '</span><select id="w-cat">' + Object.keys(CATEGORIES).map(function (k) { return '<option value="' + k + '"' + (w.category === k ? ' selected' : '') + '>' + esc(t(CATEGORIES[k])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>' + esc(t('Пригоден к переработке')) + '</span><select id="w-lvl">' + Object.keys(REC_LEVELS).map(function (k) { return '<option value="' + k + '"' + (lvl === k ? ' selected' : '') + '>' + esc(t(REC_LEVELS[k])) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>' + esc(t('Способ утилизации по умолчанию')) + '</span><select id="w-method">' + optionList(methods, w.methodId, function (m) { return m.id; }, function (m) { return m.name; }) + '</select></label>' +
      '<label class="field"><span>' + esc(t('Рекомендуемый способ')) + '</span><select id="w-rmethod"><option value="">—</option>' + optionList(methods, w.recMethodId, function (m) { return m.id; }, function (m) { return m.name; }) + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>CO₂ ' + esc(t('при вывозе ТБО, кг CO₂-экв/т')) + '</span><input id="w-co2" type="number" step="0.01" value="' + (w.co2 != null ? Math.round(w.co2 * 100000) / 100 : '') + '"></label>' +
      '<label class="field"><span>CO₂ ' + esc(t('при рекомендуемом способе, кг CO₂-экв/т')) + '</span><input id="w-rco2" type="number" step="0.01" value="' + (w.recCo2 != null ? Math.round(w.recCo2 * 100000) / 100 : '') + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>' + esc(t('Разумный максимум за одну запись')) + '</span><input id="w-max" type="number" step="1" value="' + w.maxQty + '"></label>' +
      '<label class="field"><span>' + esc(t('Примечание')) + '</span><input id="w-note" value="' + esc(w.note || '') + '"></label></div>';
    openModal({
      title: w.id ? t('Вид отхода') : t('Добавить вид отхода'), body: body, wide: true,
      actions: [{ label: t('Отмена'), cls: 'ghost' }, {
        label: t('Сохранить'), cls: 'primary', onClick: function (m) {
          try {
            var co2 = $('#w-co2', m).value, rco2 = $('#w-rco2', m).value;
            API.saveWasteType({ id: w.id, orgId: w.orgId, active: w.active !== false, name: $('#w-name', m).value, unit: $('#w-unit', m).value, density: $('#w-dens', m).value, category: $('#w-cat', m).value,
              methodId: $('#w-method', m).value, recMethodId: $('#w-rmethod', m).value, recLevel: $('#w-lvl', m).value, note: $('#w-note', m).value,
              co2: co2 === '' ? '' : +co2 / 1000, recCo2: rco2 === '' ? null : +rco2 / 1000, maxQty: $('#w-max', m).value });
            toast(t('Сохранено')); setTimeout(route, 0);
          } catch (e) { showError(e); return false; }
        }
      }]
    });
  }

  /* ---------- Способы утилизации ---------- */
  function methodsTab(user, el) {
    var methods = API.methods({ all: true }).sort(function (a, b) { return (a.rank || 9) - (b.rank || 9); });
    el.innerHTML = '<div class="row-actions"><button class="btn primary" id="m-add">＋ ' + esc(t('Добавить способ')) + '</button></div>' +
      '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Код')) + '</th><th>' + esc(t('Название')) + '</th><th>' + esc(t('Тип обращения')) + '</th><th class="num">CO₂, ' + esc(t('кг/т')) + '</th><th class="num">' + esc(t('Иерархия (1 — лучше)')) + '</th><th>' + esc(t('Примечание')) + '</th><th>' + esc(t('Статус')) + '</th><th></th></tr></thead><tbody>' +
      methods.map(function (m) {
        return '<tr><td><code>' + esc(m.code || '') + '</code></td><td>' + esc(m.name) + '</td><td class="small">' + esc(t(MODES[m.mode] || m.mode)) + '</td><td class="num">' + (m.mode === 'landfill' ? esc(t('по виду')) : kgT(m.co2)) + '</td><td class="num">' + (m.rank || '—') + '</td><td class="small muted">' + esc(m.note || '') + '</td>' +
          '<td>' + (m.active ? '<span class="badge st-accepted">' + esc(t('активен')) + '</span>' : '<span class="badge st-none">' + esc(t('деактивирован')) + '</span>') + '</td><td><button class="btn ghost sm" data-edit="' + m.id + '">✎</button></td></tr>';
      }).join('') +
      '</tbody></table></div><p class="small muted">' + esc(t('Иерархия обращения с отходами: предотвращение и передача → корм → переработка → компост/биогаз → полигон.')) + '</p></div>';
    function dlg(m) {
      m = m || { name: '', mode: 'landfill', active: true };
      openModal({
        title: t('Способ утилизации'),
        body: '<div class="grid2"><label class="field"><span>' + esc(t('Код')) + '</span><input id="mm-code" value="' + esc(m.code || '') + '"></label>' +
          '<label class="field"><span>' + esc(t('Иерархия (1 — лучше)')) + '</span><input id="mm-rank" type="number" min="1" max="9" value="' + (m.rank || '') + '"></label></div>' +
          '<label class="field"><span>' + esc(t('Название')) + '</span><input id="mm-name" value="' + esc(m.name) + '"></label>' +
          '<div class="grid2"><label class="field"><span>' + esc(t('Тип обращения')) + '</span><select id="mm-mode">' + Object.keys(MODES).map(function (k) { return '<option value="' + k + '"' + (m.mode === k ? ' selected' : '') + '>' + esc(t(MODES[k])) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span>CO₂, ' + esc(t('кг CO₂-экв/т')) + '</span><input id="mm-co2" type="number" step="0.01" value="' + (m.co2 != null ? Math.round(m.co2 * 100000) / 100 : '') + '"></label></div>' +
          '<label class="field"><span>' + esc(t('Примечание')) + '</span><input id="mm-note" value="' + esc(m.note || '') + '"></label>' +
          '<label class="check"><input type="checkbox" id="mm-act"' + (m.active ? ' checked' : '') + '> ' + esc(t('Активен')) + '</label>',
        actions: [{ label: t('Отмена'), cls: 'ghost' }, { label: t('Сохранить'), cls: 'primary', onClick: function (w) {
          try { var c = $('#mm-co2', w).value; API.saveMethod({ id: m.id, code: $('#mm-code', w).value.trim().toUpperCase(), rank: $('#mm-rank', w).value, name: $('#mm-name', w).value.trim(), mode: $('#mm-mode', w).value, co2: c === '' ? null : +c / 1000, note: $('#mm-note', w).value, active: $('#mm-act', w).checked }); setTimeout(route, 0); } catch (e) { showError(e); return false; } } }]
      });
    }
    $('#m-add').onclick = function () { dlg(null); };
    $$('[data-edit]', el).forEach(function (b) { b.onclick = function () { dlg(methods.filter(function (m) { return m.id === b.dataset.edit; })[0]); }; });
  }

  /* ---------- QR-коды ---------- */
  function qrTab(user, el) {
    var orgs = API.orgs();
    el.innerHTML = '<div class="row-actions"><button class="btn ghost" onclick="window.print()">🖨 ' + esc(t('Печать QR-кодов')) + '</button></div>' +
      '<p class="muted small">' + esc(t('Распечатайте и разместите QR-код на месте образования отходов: сканирование открывает форму учёта организации со смартфона.')) + '</p>' +
      '<div class="qr-grid">' + orgs.map(function (o) {
        var url = formUrl(o.id), svg = '';
        if (window.qrcode) { var q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
        else svg = '<p class="muted">' + esc(t('QR недоступен без интернета')) + '</p>';
        return '<div class="qr-card card"><div class="qr-img">' + svg + '</div><b>' + esc(o.name) + '</b><div class="small muted">' + esc(t('Форма учёта пищевых отходов')) + '</div><a class="small break" href="' + esc(url) + '">' + esc(url) + '</a></div>';
      }).join('') + '</div>';
  }

  /* ---------- Облачная синхронизация ---------- */
  function cloudOff() { try { var o = JSON.parse(localStorage.getItem('ecotrack_cloud')); return !!(o && o.off); } catch (e) { return false; } }
  function cloudCard() {
    var c = Sync.config() || {};
    return '<section class="card"><div class="card-head"><h2>☁ ' + esc(t('Облачная синхронизация (Supabase)')) + '</h2>' + syncChip() + '</div>' +
      '<p class="small muted">' + esc(Sync.statusText()) + '</p>' +
      '<p class="small muted">' + esc(t('Один раз выполните supabase/setup.sql в SQL Editor проекта Supabase, затем укажите Project URL и публичный ключ (anon / publishable). Ключ можно также прописать в js/config.js — тогда облако подключится на всех устройствах автоматически.')) + '</p>' +
      '<div class="grid2"><label class="field"><span>Project URL</span><input id="c-url" placeholder="https://xxxx.supabase.co" value="' + esc(c.url || '') + '"' + (c.fromFile ? ' disabled' : '') + '></label>' +
      '<label class="field"><span>' + esc(t('Публичный ключ (anon / publishable)')) + '</span><input id="c-key" value="' + esc(c.key || '') + '"' + (c.fromFile ? ' disabled' : '') + '></label></div>' +
      '<div class="row-actions">' +
      (c.fromFile ? '<span class="small muted">' + esc(t('Настроено в js/config.js')) + '</span>' : '<button class="btn primary" id="c-on">' + esc(t('Подключить')) + '</button>') +
      (Sync.enabled ? '<button class="btn ghost" id="c-off">' + esc(t('Отключить на этом устройстве')) + '</button>' : '') +
      (cloudOff() ? '<button class="btn primary" id="c-reon">' + esc(t('Включить облако снова')) + '</button>' : '') +
      (Sync.enabled ? '<button class="btn ghost" id="c-now">⟳ ' + esc(t('Синхронизировать сейчас')) + '</button>' : '') +
      '</div></section>';
  }
  function bindCloud() {
    var on = $('#c-on'), off = $('#c-off'), now = $('#c-now');
    if (on) on.onclick = function () {
      var url = $('#c-url').value.trim(), key = $('#c-key').value.trim();
      if (!/^https:\/\/.+/.test(url) || key.length < 20) { toast(t('Укажите Project URL и ключ'), 'err'); return; }
      var probe = { url: url, key: key };
      var h = { apikey: key }; if (/^eyJ/.test(key)) h.Authorization = 'Bearer ' + key;
      fetch(url.replace(/\/+$/, '') + '/rest/v1/ecotrack_records?select=id&limit=1', { headers: h, cache: 'no-store' })
        .then(function (r) { return r.text().then(function (tx) { if (!r.ok) throw new Error(r.status + ': ' + tx.slice(0, 200)); }); })
        .then(function () { Sync.saveConfig(probe.url, probe.key); toast(t('Подключено. Перезагрузка…')); setTimeout(function () { location.reload(); }, 600); })
        .catch(function (e) { toast(t('Не удалось подключиться') + ': ' + e.message, 'err'); });
    };
    if (off) off.onclick = function () { Sync.saveConfig((window.ECOTRACK_CONFIG || {}).supabaseUrl ? 'off' : null); Sync.stop(); toast(t('Облако отключено на этом устройстве')); route(); };
    var reon = $('#c-reon');
    if (reon) reon.onclick = function () { Sync.saveConfig(null); location.reload(); };
    if (now) now.onclick = function () { Sync.tick(); toast(t('Синхронизация…')); };
  }

  /* ---------- Настройки и данные ---------- */
  function dataTab(user, el) {
    var s = API.settings();
    el.innerHTML = '<div class="grid2 gap"><section class="card"><div class="card-head"><h2>' + esc(t('Настройки')) + '</h2></div>' +
      '<label class="field"><span>' + esc(t('Срок сдачи отчёта: число следующего месяца')) + '</span><input id="s-dd" type="number" min="1" max="28" value="' + s.deadlineDay + '"></label>' +
      '<label class="field"><span>' + esc(t('Порог отклонения по умолчанию, %')) + '</span><input id="s-an" type="number" min="5" max="300" value="' + s.anomalyPct + '"></label>' +
      '<label class="field"><span>' + esc(t('CO₂ при переработке/компостировании, кг/кг')) + '</span><input id="s-df" type="number" step="0.001" value="' + s.divertedFactor + '"></label>' +
      '<button class="btn primary" id="s-save">' + esc(t('Сохранить')) + '</button></section>' +
      '<section class="card"><div class="card-head"><h2>' + esc(t('Данные')) + '</h2></div>' +
      '<p class="small muted">' + esc(t('Резервная копия базы в JSON, восстановление и сброс к демо-данным (5 организаций, июнь–ноябрь 2026).')) + '</p>' +
      '<div class="row-actions"><button class="btn ghost" id="d-exp">⬇ ' + esc(t('Резервная копия (JSON)')) + '</button>' +
      '<label class="btn ghost file-btn">⬆ ' + esc(t('Восстановить из JSON')) + '<input type="file" id="d-imp" accept="application/json,.json" hidden></label>' +
      '<button class="btn danger" id="d-reset">' + esc(t('Сбросить к демо-данным')) + '</button></div>' +
      (Sync.enabled ? '<p class="small muted">' + esc(t('Облако подключено: сброс и восстановление применяются для всех устройств.')) + '</p>' : '') + '</section></div>' +
      cloudCard();
    bindCloud();
    $('#s-save').onclick = function () {
      try { API.saveSettings({ deadlineDay: +$('#s-dd').value || 5, anomalyPct: +$('#s-an').value || 30, divertedFactor: +$('#s-df').value || 0.01 }); toast(t('Сохранено')); } catch (e) { showError(e); }
    };
    $('#d-exp').onclick = function () {
      var blob = new Blob([API.exportJson()], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ecotrack_backup_' + API.todayStr() + '.json'; a.click();
    };
    $('#d-imp').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { try { API.importJson(rd.result); toast(t('Данные восстановлены')); route(); } catch (e) { showError(e); } };
      rd.readAsText(f);
    };
    $('#d-reset').onclick = function () {
      confirmDlg(t('Сбросить все данные к демо-набору? Внесённые изменения будут потеряны.'), t('Сбросить')).then(function (ok) {
        if (!ok) return;
        try { API.resetDemo(); API.login('admin@atu.kz', 'demo123'); toast(t('Демо-данные восстановлены')); route(); } catch (e) { showError(e); }
      });
    };
  }
})();
