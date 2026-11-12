/* Общие UI-хелперы: экранирование, форматирование, тосты, модальные окна, периоды. */
(function () {
  window.$ = function (s, root) { return (root || document).querySelector(s); };
  window.$$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  window.fmt = function (n, d) {
    if (d == null) d = 1;
    var p = Math.pow(10, d);
    return (Math.round((n || 0) * p) / p).toLocaleString(I18N.lang === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  };
  window.pct = function (n, d) { return fmt(n * 100, d == null ? 1 : d) + '%'; };

  var MONTHS = {
    ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
    kk: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  window.monthLabel = function (period, short) {
    var m = +period.slice(5, 7) - 1, y = period.slice(0, 4);
    var name = MONTHS[I18N.lang][m];
    if (short) return name.slice(0, 3) + ' ' + y.slice(2);
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
  };
  window.dateLabel = function (d) { return d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : ''; };
  window.dateTimeLabel = function (d) { return d ? dateLabel(d.slice(0, 10)) + ' ' + d.slice(11, 16) : ''; };
  window.addMonths = function (period, n) {
    var y = +period.slice(0, 4), m = +period.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  };
  window.monthRange = function (from, to) { var out = []; for (var p = from; p <= to; p = addMonths(p, 1)) out.push(p); return out; };
  window.quarterOf = function (period) { return period.slice(0, 4) + '-Q' + (Math.floor((+period.slice(5, 7) - 1) / 3) + 1); };
  window.quarterMonths = function (q) { var y = q.slice(0, 4), n = +q.slice(6); var s = y + '-' + String((n - 1) * 3 + 1).padStart(2, '0'); return [s, addMonths(s, 1), addMonths(s, 2)]; };
  window.quarterLabel = function (q) { return I18N.lang === 'en' ? 'Q' + q.slice(6) + ' ' + q.slice(0, 4) : q.slice(6) + ' ' + t('квартал') + ' ' + q.slice(0, 4); };
  window.deadlineOf = function (period, day) { return addMonths(period, 1) + '-' + String(day || 5).padStart(2, '0'); };
  window.daysBetween = function (a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); };

  window.STATUS = {
    draft: { label: 'Черновик', cls: 'st-draft' },
    submitted: { label: 'Отправлено', cls: 'st-submitted' },
    in_review: { label: 'На проверке', cls: 'st-review' },
    accepted: { label: 'Принято', cls: 'st-accepted' },
    returned: { label: 'Возвращено на доработку', cls: 'st-returned' },
    none: { label: 'Нет отчёта', cls: 'st-none' }
  };
  window.statusBadge = function (s) { var x = STATUS[s] || STATUS.none; return '<span class="badge ' + x.cls + '">' + esc(t(x.label)) + '</span>'; };
  window.ROLES = { resp: 'Ответственное лицо', reviewer: 'Проверяющий', admin: 'Администратор', mgmt: 'Руководство' };
  window.ORG_TYPES = { department: 'Кафедра / учебная лаборатория', canteen: 'Столовая', cafe: 'Кофейня', hotel: 'Гостиница / общепит', buffet: 'Буфет', lab: 'Лаборатория' };
  window.CATEGORIES = { food: 'Органические', paper: 'Вторсырьё: картон / бумага', packaging: 'Вторсырьё: ПЭТ, стекло, металл', oil: 'Специальные (масло)', other: 'Смешанные' };
  window.MODES = { landfill: 'Захоронение (полигон ТБО)', recycle: 'Переработка', compost: 'Компостирование', ad: 'Анаэробное сбраживание (биогаз)', feed: 'Корм животным', donate: 'Передача (фудшеринг)' };
  window.REC_LEVELS = { yes: 'Да', partial: 'Частично', no: 'Нет' };

  /* ---------- Тосты ---------- */
  window.toast = function (msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.classList.add('hide'); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
  };
  window.showError = function (e) {
    console.error(e);
    toast(e && e.message ? e.message : String(e), 'err');
  };

  /* ---------- Модальные окна ---------- */
  window.openModal = function (opts) {
    var root = $('#modal-root');
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + esc(opts.title || '') + '</h3><button class="icon-btn" data-close aria-label="close">✕</button></div>' +
      '<div class="modal-body"></div><div class="modal-foot"></div></div>';
    var body = $('.modal-body', wrap);
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var foot = $('.modal-foot', wrap);
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      wrap.remove(); document.removeEventListener('keydown', onKey);
      if (opts.onClose) { try { opts.onClose(); } catch (e) { } }
    }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.onclick = function () { var r = a.onClick ? a.onClick(wrap) : true; if (r !== false) close(); };
      foot.appendChild(b);
    });
    $('[data-close]', wrap).onclick = close;
    wrap.addEventListener('mousedown', function (ev) { if (ev.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    var f = $('input,select,textarea', body); if (f && !opts.noFocus) setTimeout(function () { f.focus(); }, 30);
    return { el: wrap, close: close };
  };
  window.confirmDlg = function (text, okLabel) {
    return new Promise(function (resolve) {
      var done = false;
      var m = openModal({
        title: t('Подтверждение'), body: '<p>' + esc(text) + '</p>',
        actions: [
          { label: t('Отмена'), cls: 'ghost', onClick: function () { done = true; resolve(false); } },
          { label: okLabel || t('Да'), cls: 'primary', onClick: function () { done = true; resolve(true); } }
        ]
      });
      var obs = new MutationObserver(function () { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe($('#modal-root'), { childList: true });
    });
  };
  window.promptDlg = function (title, label, okLabel) {
    return new Promise(function (resolve) {
      var done = false;
      var m = openModal({
        title: title, body: '<label class="field"><span>' + esc(label) + '</span><textarea rows="4" id="prompt-text"></textarea></label>',
        actions: [
          { label: t('Отмена'), cls: 'ghost', onClick: function () { done = true; resolve(null); } },
          {
            label: okLabel || 'OK', cls: 'primary', onClick: function (w) {
              var v = $('#prompt-text', w).value.trim();
              if (!v) { toast(t('Комментарий обязателен'), 'err'); return false; }
              done = true; resolve(v);
            }
          }
        ]
      });
      var obs = new MutationObserver(function () { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(null); } });
      obs.observe($('#modal-root'), { childList: true });
    });
  };

  window.optionList = function (items, selected, getVal, getLabel) {
    return items.map(function (x) {
      var v = getVal(x);
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(getLabel(x)) + '</option>';
    }).join('');
  };

  /* Сжатие фото до ~800px JPEG, чтобы хранить вместе с записью. */
  window.compressImage = function (file, maxSide) {
    maxSide = maxSide || 800;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, maxSide / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  /* Charts: уничтожаем при перерисовке экрана */
  window.CHARTS = [];
  window.destroyCharts = function () { CHARTS.forEach(function (c) { try { c.destroy(); } catch (e) { } }); CHARTS = []; };
  window.PALETTE = ['#1f8a4c', '#2563eb', '#e08a00', '#c2410c', '#7c3aed', '#0891b2', '#be185d', '#65a30d', '#475569', '#ca8a04'];
  window.makeChart = function (canvas, cfg) {
    if (!window.Chart) { canvas.parentNode.innerHTML = '<p class="muted">' + esc(t('Графики недоступны без интернета (библиотека Chart.js не загружена)')) + '</p>'; return null; }
    cfg.options = cfg.options || {};
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;
    var c = new Chart(canvas, cfg);
    CHARTS.push(c);
    return c;
  };
})();
