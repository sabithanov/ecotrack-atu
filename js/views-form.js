/* Электронная форма учёта (Digital Forms + Mobile Input) для ответственного лица. */
(function () {
  window.Views = window.Views || {};
  var DRAFT_KEY = function (u) { return 'ecotrack_draft_' + u.id; };

  Views.form = function (user, h) {
    var view = $('#view');
    var org = API.org(user.orgId);
    if (h.q.org && h.q.org !== user.orgId) toast(t('QR-код другой организации: открыта форма вашей организации'), 'err');
    var state = { date: h.q.date || API.todayStr(), editing: null, photo: undefined };
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY(user))); } catch (e) { }
    if (draft && draft.date) state.date = draft.date;

    function render() {
      var types = API.wasteTypes(user.orgId);
      var methods = API.methods();
      var period = state.date.slice(0, 7);
      var rep = API.reportByPeriod(user.orgId, period);
      var locked = rep && ['draft', 'returned'].indexOf(rep.status) < 0;
      var monthEntries = API.orgEntries(user.orgId, period + '-01', period + '-31');
      var dayEntries = monthEntries.filter(function (e) { return e.date === state.date; });
      function sumBy(list, typeId) { return list.filter(function (e) { return e.typeId === typeId; }).reduce(function (s, e) { return s + e.qty; }, 0); }
      var dayKg = dayEntries.reduce(function (s, e) { return s + API.kg(e); }, 0);
      var monKg = monthEntries.reduce(function (s, e) { return s + API.kg(e); }, 0);
      var settings = API.settings();
      var deadline = deadlineOf(period, settings.deadlineDay);
      var left = daysBetween(API.todayStr(), deadline);
      var lastReturn = null;
      if (rep && rep.status === 'returned') {
        var hs = API.history(rep.id).filter(function (x) { return x.action === 'return'; });
        lastReturn = hs[hs.length - 1];
      }

      var html = '<div class="page-head"><div><h1>' + esc(t('Ввод отходов')) + '</h1><p class="muted">' + esc(org.name) + '</p></div>' +
        '<div class="head-actions"><label class="date-pick"><span>' + esc(t('Дата')) + '</span><input type="date" id="f-date" value="' + state.date + '" max="' + API.todayStr() + '"></label></div></div>';

      html += '<div class="status-strip"><div>' + esc(t('Отчёт за')) + ' <b>' + esc(monthLabel(period)) + '</b>: ' + statusBadge(rep ? rep.status : 'draft') + '</div>' +
        (!locked ? '<div class="muted small">' + (left >= 0 ? esc(t('Срок сдачи: {d} (осталось {n} дн.)', { d: dateLabel(deadline), n: left })) : '<span class="danger-text">' + esc(t('Срок сдачи прошёл: {d}', { d: dateLabel(deadline) })) + '</span>') + '</div>' : '') + '</div>';

      if (lastReturn) html += '<div class="alert warn"><b>' + esc(t('Отчёт возвращён на доработку')) + '</b><br>' + esc(lastReturn.comment) + '<div class="small muted">' + esc(API.userName(lastReturn.userId)) + ', ' + dateTimeLabel(lastReturn.at) + '</div></div>';
      if (locked) html += '<div class="alert info">' + esc(t('Отчёт за этот период отправлен или принят — редактирование заблокировано. Выберите другую дату.')) + '</div>';

      // Плитки видов отходов: 1 касание — выбор вида
      html += '<section class="card"><div class="card-head"><h2>' + esc(t('1. Выберите вид отхода')) + '</h2>' +
        '<button class="btn ghost sm" id="voice-btn" ' + (locked ? 'disabled' : '') + ' title="' + esc(t('Голосовой ввод')) + '">🎤 ' + esc(t('Голосом')) + '</button></div>' +
        '<div class="tiles">' + types.map(function (w) {
          var d = sumBy(dayEntries, w.id);
          return '<button class="tile' + (state.typeId === w.id ? ' sel' : '') + '" data-type="' + w.id + '" ' + (locked ? 'disabled' : '') + '>' +
            '<span class="tile-name">' + esc(w.name) + '</span>' +
            '<span class="tile-meta">' + (d > 0 ? '<b>' + fmt(d) + ' ' + unitLabel(w.unit) + '</b> ' + esc(t('сегодня')) : esc(unitLabel(w.unit))) + (w.recyclable ? ' · ♻' : '') + '</span></button>';
        }).join('') +
        '<button class="tile add" id="add-type" ' + (locked ? 'disabled' : '') + '><span class="tile-name">＋ ' + esc(t('Новый вид отхода')) + '</span><span class="tile-meta">' + esc(t('нет в списке')) + '</span></button>' +
        '</div></section>';

      // Панель ввода
      html += '<section class="card entry-panel" id="entry-panel" hidden></section>';

      // Итоги
      html += '<section class="card"><div class="card-head"><h2>' + esc(t('Итоги')) + '</h2></div>' +
        '<div class="kpis two"><div class="kpi"><span>' + esc(t('За день')) + ' ' + dateLabel(state.date) + '</span><b>' + fmt(dayKg) + ' ' + esc(t('кг')) + '</b></div>' +
        '<div class="kpi"><span>' + esc(t('За месяц')) + ' · ' + esc(monthLabel(period)) + '</span><b>' + fmt(monKg) + ' ' + esc(t('кг')) + '</b></div></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('Наименование отходов')) + '</th><th class="num">' + esc(t('За день')) + '</th><th class="num">' + esc(t('За месяц')) + '</th></tr></thead><tbody>' +
        API.wasteTypes(user.orgId, { all: true }).filter(function (w) { return w.active || sumBy(monthEntries, w.id) > 0; }).map(function (w) {
          var d = sumBy(dayEntries, w.id), m = sumBy(monthEntries, w.id);
          return '<tr><td>' + esc(w.name) + '</td><td class="num">' + (d ? fmt(d) : '—') + '</td><td class="num">' + (m ? fmt(m) : '—') + ' <small class="muted">' + unitLabel(w.unit) + '</small></td></tr>';
        }).join('') +
        '<tr class="total"><td>' + esc(t('Итого, кг')) + '</td><td class="num">' + fmt(dayKg) + '</td><td class="num">' + fmt(monKg) + '</td></tr>' +
        '</tbody></table></div></section>';

      // Записи за день
      html += '<section class="card"><div class="card-head"><h2>' + esc(t('Записи за')) + ' ' + dateLabel(state.date) + '</h2><span class="muted small">' + dayEntries.length + '</span></div>' +
        (dayEntries.length ? '<ul class="entry-list">' + dayEntries.slice().reverse().map(function (e) {
          var w = API.wasteType(e.typeId), m = API.method(e.methodId);
          return '<li><div class="el-main"><b>' + esc(w.name) + '</b><span class="muted small">' + esc(m ? m.name : '') + ' · ' + esc(e.createdAt.slice(11, 16)) + (e.note ? ' · ' + esc(e.note) : '') + '</span></div>' +
            (e.photo ? '<img class="thumb" src="' + e.photo + '" alt="photo" data-photo="' + e.id + '">' : '') +
            '<div class="el-qty">' + fmt(e.qty) + ' ' + unitLabel(w.unit) + '</div>' +
            (!locked ? '<div class="el-actions"><button class="icon-btn" data-edit="' + e.id + '" title="' + esc(t('Изменить')) + '">✎</button><button class="icon-btn" data-del="' + e.id + '" title="' + esc(t('Удалить')) + '">🗑</button></div>' : '') +
            '</li>';
        }).join('') + '</ul>' : '<p class="muted">' + esc(t('Пока нет записей за эту дату')) + '</p>') + '</section>';

      // Отправка отчёта
      html += '<section class="card"><div class="card-head"><h2>' + esc(t('Отчёт за')) + ' ' + esc(monthLabel(period)) + '</h2>' + statusBadge(rep ? rep.status : 'draft') + '</div>' +
        '<p class="muted small">' + esc(t('Записей в отчёте')) + ': ' + monthEntries.length + ' · ' + fmt(monKg) + ' ' + esc(t('кг')) + '</p>' +
        '<div class="row-actions">' +
        (!locked && rep ? '<button class="btn primary" id="submit-rep">' + esc(t('Отправить отчёт на проверку')) + '</button>' : '') +
        (rep ? '<a class="btn ghost" href="#/report/' + rep.id + '">' + esc(t('Открыть отчёт и историю')) + '</a>' : '') +
        '</div></section>';

      if (!locked) html += '<button class="fab" id="voice-fab" title="' + esc(t('Голосовой ввод')) + '" aria-label="' + esc(t('Голосовой ввод')) + '">🎤</button>';
      view.innerHTML = html;
      bind(types, methods, locked, rep);
      if (state.typeId || state.editing) openPanel(types, methods);
    }

    function bind(types, methods, locked, rep) {
      $('#f-date').onchange = function () {
        if (this.value > API.todayStr()) { toast(t('Дата не может быть в будущем'), 'err'); this.value = API.todayStr(); }
        state.date = this.value || API.todayStr(); saveDraft(); render();
      };
      $$('.tile[data-type]').forEach(function (b) {
        b.onclick = function () { state.typeId = b.dataset.type; state.editing = null; state.qty = ''; state.methodId = null; state.note = ''; state.photo = undefined; render(); };
      });
      var at = $('#add-type'); if (at) at.onclick = function () { addTypeDialog(methods); };
      var sb = $('#submit-rep');
      if (sb) sb.onclick = function () {
        confirmDlg(t('Отправить отчёт за {m} на проверку? После отправки редактирование будет заблокировано.', { m: monthLabel(rep.period) }), t('Отправить')).then(function (ok) {
          if (!ok) return;
          try { API.submitReport(rep.id); toast(t('Отчёт отправлен на проверку')); render(); } catch (e) { showError(e); }
        });
      };
      $$('[data-edit]').forEach(function (b) {
        b.onclick = function () {
          var e = API.orgEntries(user.orgId).filter(function (x) { return x.id === b.dataset.edit; })[0];
          state.editing = e.id; state.typeId = e.typeId; state.qty = e.qty; state.methodId = e.methodId; state.note = e.note; state.photo = undefined; state.existingPhoto = e.photo;
          render();
        };
      });
      $$('[data-del]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg(t('Удалить запись?'), t('Удалить')).then(function (ok) {
            if (!ok) return;
            try { API.deleteEntry(b.dataset.del); toast(t('Запись удалена')); render(); } catch (e) { showError(e); }
          });
        };
      });
      $$('[data-photo]').forEach(function (img) { img.onclick = function () { openModal({ title: t('Фото'), body: '<img class="photo-full" src="' + img.src + '">', actions: [{ label: 'OK' }] }); }; });
      var vb = $('#voice-btn'); if (vb) vb.onclick = function () { voiceInput(types, methods); };
      var fab = $('#voice-fab'); if (fab) fab.onclick = function () { voiceInput(types, methods); };
    }

    function openPanel(types, methods) {
      var w = API.wasteType(state.typeId);
      if (!w) return;
      var p = $('#entry-panel');
      p.hidden = false;
      var mId = state.methodId || w.methodId;
      p.innerHTML = '<div class="card-head"><h2>' + esc(state.editing ? t('Изменить запись') : t('2. Введите количество')) + '</h2><button class="icon-btn" id="ep-close">✕</button></div>' +
        '<div class="ep-type">' + esc(w.name) + '</div>' +
        '<div class="qty-row"><input id="ep-qty" type="number" inputmode="decimal" step="0.1" min="0.1" max="' + (w.maxQty || 500) + '" placeholder="0,0" value="' + esc(state.qty || '') + '"><span class="unit">' + unitLabel(w.unit) + '</span></div>' +
        '<label class="field"><span>' + esc(t('Способ переработки / утилизации')) + '</span><select id="ep-method">' + optionList(methods, mId, function (m) { return m.id; }, function (m) { return m.name; }) + '</select></label>' +
        '<details class="more"><summary>' + esc(t('Фото и примечание (необязательно)')) + '</summary>' +
        '<label class="field"><span>' + esc(t('Примечание')) + '</span><input id="ep-note" type="text" maxlength="200" value="' + esc(state.note || '') + '"></label>' +
        '<label class="btn ghost file-btn">📷 ' + esc(t('Фото отходов')) + '<input type="file" id="ep-photo" accept="image/*" capture="environment" hidden></label>' +
        '<span id="ep-photo-prev">' + ((state.photo || state.existingPhoto) ? '<img class="thumb" src="' + (state.photo || state.existingPhoto) + '">' : '') + '</span>' +
        '</details>' +
        '<div class="small muted">' + esc(t('Ответственный')) + ': ' + esc(user.name) + ' · ' + esc(t('Дата')) + ': ' + dateLabel(state.date) + '</div>' +
        '<button class="btn primary block lg" id="ep-save">' + esc(state.editing ? t('Сохранить изменения') : t('Сохранить запись')) + '</button>';
      var q = $('#ep-qty');
      if (!state.editing) setTimeout(function () { q.focus(); }, 50);
      p.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ['input', 'change'].forEach(function (ev) {
        p.addEventListener(ev, function () { state.qty = q.value; state.methodId = $('#ep-method').value; state.note = $('#ep-note').value; saveDraft(); });
      });
      q.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('#ep-save').click(); } };
      $('#ep-close').onclick = function () { clearState(); render(); };
      $('#ep-photo').onchange = function () {
        var f = this.files[0]; if (!f) return;
        compressImage(f).then(function (data) { state.photo = data; $('#ep-photo-prev').innerHTML = '<img class="thumb" src="' + data + '">'; toast(t('Фото прикреплено')); }).catch(showError);
      };
      $('#ep-save').onclick = function () { save(false); };
    }

    function save(force) {
      var d = { date: state.date, typeId: state.typeId, qty: $('#ep-qty').value, methodId: $('#ep-method').value, note: $('#ep-note').value, force: force };
      if (state.photo !== undefined) d.photo = state.photo;
      try {
        if (state.editing) { API.updateEntry(state.editing, d); toast(t('Запись изменена')); }
        else { API.addEntry(d); toast(t('Сохранено: {n} {u}', { n: fmt(+String(d.qty).replace(',', '.')), u: unitLabel(API.wasteType(d.typeId).unit) })); }
        clearState(); render();
      } catch (e) {
        if (e.code === 'DUP') { confirmDlg(e.message, t('Сохранить')).then(function (ok) { if (ok) save(true); }); }
        else showError(e);
      }
    }
    function clearState() {
      state.typeId = null; state.editing = null; state.qty = ''; state.methodId = null; state.note = ''; state.photo = undefined; state.existingPhoto = null;
      try { localStorage.removeItem(DRAFT_KEY(user)); } catch (e) { }
    }
    /* Автосохранение черновика ввода (ФТ-2.3) */
    function saveDraft() {
      try {
        if (state.editing) return;
        localStorage.setItem(DRAFT_KEY(user), JSON.stringify({ date: state.date, typeId: state.typeId, qty: state.qty, methodId: state.methodId, note: state.note }));
      } catch (e) { }
    }

    function addTypeDialog(methods) {
      var body = '<p class="muted small">' + esc(t('Новый вид сохранится в справочник вашей организации и будет доступен в форме.')) + '</p>' +
        '<label class="field"><span>' + esc(t('Наименование отходов')) + ' *</span><input id="nt-name" maxlength="120" placeholder="' + esc(t('например: Хлебные отходы')) + '"></label>' +
        '<div class="grid2"><label class="field"><span>' + esc(t('Единица')) + '</span><select id="nt-unit"><option value="kg">' + esc(t('кг')) + '</option><option value="l">' + esc(t('л')) + '</option></select></label>' +
        '<label class="field"><span>' + esc(t('Категория')) + '</span><select id="nt-cat">' + Object.keys(CATEGORIES).map(function (k) { return '<option value="' + k + '">' + esc(t(CATEGORIES[k])) + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="field"><span>' + esc(t('Способ утилизации по умолчанию')) + '</span><select id="nt-method">' + optionList(methods, methods[0].id, function (m) { return m.id; }, function (m) { return m.name; }) + '</select></label>' +
        '<label class="check"><input type="checkbox" id="nt-rec" checked> ' + esc(t('Пригоден к переработке')) + '</label>';
      openModal({
        title: t('Новый вид отхода'), body: body,
        actions: [{ label: t('Отмена'), cls: 'ghost' }, {
          label: t('Добавить'), cls: 'primary', onClick: function (w) {
            var cat = $('#nt-cat', w).value;
            var co2 = { food: 0.70021, packaging: 0.00888, paper: 1.16439, oil: 0.70021, other: 1.16439 }[cat];
            try {
              var nt = API.saveWasteType({ name: $('#nt-name', w).value, unit: $('#nt-unit', w).value, category: cat, methodId: $('#nt-method', w).value, recyclable: $('#nt-rec', w).checked, co2: co2, maxQty: 200 });
              toast(t('Вид отхода добавлен в справочник'));
              state.typeId = nt.id; state.editing = null; state.qty = ''; state.methodId = null;
              setTimeout(render, 0);
            } catch (e) { showError(e); return false; }
          }
        }]
      });
    }

    /* Голосовой ввод (js/voice.js): одна фраза → несколько записей с проверкой перед сохранением */
    function voiceInput(types, methods, text) {
      VoiceUI.open({
        types: types, methods: methods, text: text,
        save: function (items) {
          var saved = 0, dups = [], errs = [];
          items.forEach(function (it) {
            try { API.addEntry({ date: state.date, typeId: it.typeId, qty: it.qty, methodId: it.methodId, note: t('голосом') }); saved++; }
            catch (e) { if (e.code === 'DUP') dups.push(it); else errs.push(API.wasteType(it.typeId).name + ': ' + e.message); }
          });
          function finish() {
            if (saved) toast(t('Сохранено записей') + ': ' + saved);
            if (errs.length) toast(errs.join('; '), 'err');
            clearState(); render();
          }
          if (dups.length) {
            confirmDlg(t('Похоже на дубль: такая же запись за эту дату уже есть. Сохранить всё равно?') + ' (' + dups.map(function (d) { return API.wasteType(d.typeId).name + ' ' + d.qty; }).join(', ') + ')', t('Сохранить')).then(function (ok) {
              if (ok) dups.forEach(function (it) { try { API.addEntry({ date: state.date, typeId: it.typeId, qty: it.qty, methodId: it.methodId, note: t('голосом'), force: true }); saved++; } catch (e) { errs.push(e.message); } });
              finish();
            });
          } else finish();
        }
      });
    }

    // восстановление черновика
    if (draft && draft.typeId && API.wasteType(draft.typeId)) {
      state.typeId = draft.typeId; state.qty = draft.qty; state.methodId = draft.methodId; state.note = draft.note;
      setTimeout(function () { toast(t('Черновик восстановлен')); }, 300);
    }
    render();
  };
})();
