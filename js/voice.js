/* Голосовой ввод: одна фраза → несколько взвешиваний.
   «очистки овощей двенадцать с половиной кило, картон пять на переработку и масло три литра»
   → [Очистки овощей 12,5 кг] [Картонная тара 5 кг, переработка] [Отработанное масло 3 л].
   Понимает цифры и числа словами (рус./каз.), «с половиной», «полтора», «и пять» (12,5), граммы,
   синонимы видов отходов и способ утилизации. Перед сохранением результат можно поправить. */
(function () {
  var NUM = {
    'ноль': 0, 'нуль': 0, 'один': 1, 'одна': 1, 'одно': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7,
    'восемь': 8, 'девять': 9, 'десять': 10, 'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14, 'пятнадцать': 15,
    'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19, 'двадцать': 20, 'тридцать': 30, 'сорок': 40,
    'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90, 'сто': 100, 'двести': 200, 'триста': 300,
    'четыреста': 400, 'пятьсот': 500,
    'нөл': 0, 'бір': 1, 'екі': 2, 'үш': 3, 'төрт': 4, 'бес': 5, 'алты': 6, 'жеті': 7, 'сегіз': 8, 'тоғыз': 9, 'он': 10, 'жиырма': 20,
    'отыз': 30, 'қырық': 40, 'елу': 50, 'алпыс': 60, 'жетпіс': 70, 'сексен': 80, 'тоқсан': 90, 'жүз': 100,
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
    'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40,
    'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100
  };
  var SPECIAL = { 'полтора': 1.5, 'полторы': 1.5, 'половина': 0.5, 'пол': 0.5, 'жарты': 0.5, 'half': 0.5 };
  var DEC_SEP = { 'и': 1, 'запятая': 1, 'точка': 1, 'целых': 1, 'бүтін': 1, 'үтір': 1, 'point': 1 };
  var SKIP_AFTER = /^(десят|сот|тысячн)/;
  function unitOf(w) {
    if (/^(кг|кило|килограмм|килограм|кілограмм|келі|кгр|kg|kilo)/.test(w)) return 'kg';
    if (/^(л|литр|литра|литров|литрах|литрі|l|liter|liters|litre|litres)$/.test(w) || /^литр/.test(w)) return 'l';
    if (/^(г|гр|грамм|грам|граммов|грамма|g|gram|grams|gramme|grammes)$/.test(w)) return 'g';
    return null;
  }
  var SEP = /^(и|еще|ещё|плюс|также|потом|тағы|және|сосын|а|and|plus|also|then)$/;

  /* синонимы: что говорят → какому виду отхода это соответствует */
  var ALIASES = [
    [/кост|сүйек/, /кост/], [/рыб|балық/, /рыб/], [/мяс|обрез| ет |еттің/, /мяс/],
    [/картон|короб|коробк|макулат|қорап/, /картон/], [/масл|фритюр| май |майы/, /масл/],
    [/жмых|кофе|гущ|кофейн/, /жмых/], [/очист|кожур|шелух|қабы|көкөніс|овощ/, /очист|овощ/],
    [/тарел|зал|объед|доед|залдан|тәрелке/, /зал/], [/не ?прода|нереализ|непрод|сатылмаған|продукц/, /нереализ/],
    [/хлеб| нан |выпеч|булк|батон/, /хлеб/], [/кондит|торт|пирож|печень|печен|конфет/, /кондит/],
    [/яйц|скорлуп|жұмыртқа/, /скорлуп/], [/сахар|қант/, /сахар/], [/пэт|пластик|бутыл| пет /, /пэт/],
    [/стекл|шыны/, /стекл/], [/алюмин|банк|жестян/, /алюмин/], [/фрукт|жеміс|яблок/, /фрукт/],
    [/упаков|пакет|пленк|қаптама/, /упаков/], [/ еда | еды |тамақ/, /еды/],
    [/peel/, /очист/], [/cardboard|carton|box/, /картон/], [/ oil |cooking oil|frying/, /масл/], [/coffee|grounds/, /жмых/],
    [/plate|leftover|dining/, /зал/], [/unsold|surplus/, /нереализ/], [/bone/, /кост/], [/fish/, /рыб/], [/meat|trim/, /мяс/],
    [/bread|bakery/, /хлеб/], [/pastry|cake|confection/, /кондит/], [/egg|shell/, /скорлуп/], [/sugar/, /сахар/], [/plastic|bottle| pet /, /пэт/],
    [/glass/, /стекл/], [/alumin| can /, /алюмин/], [/fruit/, /фрукт/], [/vegetable/, /овощ/], [/packag|wrap/, /упаков/], [/ food /, /еды/]
  ];
  var GENERIC = { 'отход': 1, 'остат': 1, 'пищев': 1, 'издел': 1, 'образ': 1, 'кафед': 1 };
  var METHOD_RULES = [
    [/компост|compost/, function (m) { return m.mode === 'compost'; }],
    [/корм|животн|мал азы|feed|animal/, function (m) { return m.mode === 'feed'; }],
    [/биотоп|биодиз|biofuel|biodiesel/, function (m) { return /масл/i.test(m.name); }],
    [/переработ|вторсыр|макулат|қайта өңде|сдать|сдали|recycl/, function (m) { return m.mode === 'recycle' && !/масл/i.test(m.name); }],
    [/бак|контейнер|bin|container/, function (m) { return /бак/i.test(m.name); }],
    [/тбо|вывоз|мусор|полигон|landfill|trash/, function (m) { return m.mode === 'landfill' && !/бак/i.test(m.name); }]
  ];

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е')
      .replace(/(\d)\s*[,.]\s*(\d)/g, '$1.$2')
      .replace(/(\d)\s*(кг|л|г)(?=\s|$)/g, '$1 $2')
      .replace(/[^0-9a-zа-яәіңғүұқөһ.\s-]/gi, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function stem(w) { return w.slice(0, Math.min(5, w.length)); }
  function wordNum(w) { return NUM[w] != null ? NUM[w] : null; }
  function isNumTok(w) { return /^\d+(\.\d+)?$/.test(w) || wordNum(w) != null || SPECIAL[w] != null; }

  /* читает число начиная с i; возвращает {v, unit, end} или null */
  function readNumber(t, i) {
    var w = t[i], v, j = i + 1;
    if (/^\d+(\.\d+)?$/.test(w)) v = parseFloat(w);
    else if (SPECIAL[w] != null) v = SPECIAL[w];
    else if (wordNum(w) != null) {
      v = 0; j = i;
      while (j < t.length && wordNum(t[j]) != null) {
        var n = wordNum(t[j]);
        if (n === 100 && v > 0 && v < 10) v *= 100; else v += n;
        j++;
      }
    } else return null;
    // десятичная часть: «двенадцать и пять», «12 запятая 5»
    if (j + 1 < t.length && DEC_SEP[t[j]] && (/^\d+$/.test(t[j + 1]) || wordNum(t[j + 1]) != null) && (j + 2 >= t.length || wordNum(t[j + 2]) == null)) {
      var f = /^\d+$/.test(t[j + 1]) ? parseInt(t[j + 1], 10) : wordNum(t[j + 1]);
      if (f < 10) { v += f / 10; j += 2; } else if (f < 100) { v += f / 100; j += 2; }
      if (j < t.length && SKIP_AFTER.test(t[j])) j++;
    }
    // «с половиной», «жарым»
    if (t[j] === 'с' && /^половин/.test(t[j + 1] || '')) { v += 0.5; j += 2; }
    if (t[j] === 'жарым') { v += 0.5; j++; }
    if (t[j] === 'and' && t[j + 1] === 'a' && t[j + 2] === 'half') { v += 0.5; j += 3; }
    // «пол» без единицы — не число
    if (w === 'пол' && !unitOf(t[j] || '')) return null;
    var unit = null;
    if (j < t.length && unitOf(t[j])) { unit = unitOf(t[j]); j++; }
    if (unit === 'g') { v = v / 1000; unit = 'kg'; }
    return { v: Math.round(v * 1000) / 1000, unit: unit, end: j };
  }

  function matchType(words, types) {
    var text = ' ' + words.join(' ') + ' ';
    var ws = words.filter(function (w) { return w.length >= 3 && !SEP.test(w); });
    if (!ws.length) return null;
    var best = null, bestScore = 0;
    types.forEach(function (ty) {
      var nm = ty.name.toLowerCase().replace(/ё/g, 'е');
      var ns = nm.replace(/[^a-zа-яәіңғүұқөһ\s]/gi, ' ').split(/\s+/).filter(function (x) { return x.length >= 3; }).map(stem).filter(function (s) { return !GENERIC[s]; });
      var score = 0;
      ws.forEach(function (w) {
        var s = stem(w);
        if (GENERIC[s]) return;
        if (ns.some(function (n) { return n === s || (n.length >= 4 && s.length >= 4 && n.slice(0, 4) === s.slice(0, 4)); })) score += 1;
      });
      ALIASES.forEach(function (a) { if (a[0].test(text) && a[1].test(nm)) score += 1.5; });
      if (score > bestScore || (score === bestScore && score > 0 && best && ty.name.length < best.name.length)) { bestScore = score; best = ty; }
    });
    return bestScore >= 1 ? { type: best, score: bestScore } : null;
  }

  function matchMethod(text, type, methods) {
    for (var i = 0; i < METHOD_RULES.length; i++) {
      if (METHOD_RULES[i][0].test(text)) {
        var pred = METHOD_RULES[i][1];
        if (/переработ|вторсыр|сдать|сдали|recycl/.test(text) && type && type.category === 'oil') pred = function (m) { return /масл/i.test(m.name); };
        var m = methods.filter(pred)[0];
        if (m) return m;
      }
    }
    return null;
  }

  /* главный разбор: текст → [{type, qty, unit, method, text}] */
  function parse(text, types, methods) {
    var t = norm(text).split(' ').filter(Boolean);
    var nums = [], i = 0;
    while (i < t.length) {
      var n = isNumTok(t[i]) ? readNumber(t, i) : null;
      if (n) { n.start = i; nums.push(n); i = n.end; } else i++;
    }
    var chunks = []; // слова между числами: chunks[k] — перед nums[k], последний — после
    var prev = 0;
    nums.forEach(function (n) { chunks.push(t.slice(prev, n.start)); prev = n.end; });
    chunks.push(t.slice(prev));
    var used = {}, items = [];
    nums.forEach(function (n, k) {
      var m = null, ci = -1;
      if (!used[k]) { m = matchType(chunks[k], types); if (m) ci = k; }
      if (!m && !used[k + 1]) { m = matchType(chunks[k + 1], types); if (m) ci = k + 1; }
      if (ci >= 0) used[ci] = 1;
      // способ утилизации: слова после последнего «и/тағы» перед числом + слова после числа до следующего «и»
      var before = chunks[k] || [], after = chunks[k + 1] || [];
      var lastSep = -1; before.forEach(function (w, x) { if (SEP.test(w)) lastSep = x; });
      var firstSep = after.length; for (var x = 0; x < after.length; x++) { if (SEP.test(after[x])) { firstSep = x; break; } }
      var ctx = before.slice(lastSep + 1).concat(after.slice(0, firstSep)).join(' ');
      var type = m ? m.type : null;
      items.push({
        type: type, qty: n.v, unit: n.unit, score: m ? m.score : 0,
        method: matchMethod(ctx, type, methods),
        text: (chunks[k] || []).concat(t.slice(n.start, n.end)).join(' ')
      });
    });
    // вид назван, а число нет → строка без количества
    if (!nums.length) {
      var m0 = matchType(t, types);
      if (m0) items.push({ type: m0.type, qty: null, unit: null, score: m0.score, method: matchMethod(t.join(' '), m0.type, methods), text: t.join(' ') });
    }
    return items;
  }

  window.VoiceParser = { parse: parse, norm: norm };

  /* ---------------- окно голосового ввода ---------------- */
  /* одна активная запись на всё приложение */
  var ACTIVE = { rec: null, id: 0, lastEnd: 0 };
  function stopActive() {
    ACTIVE.id++;
    var r = ACTIVE.rec; ACTIVE.rec = null;
    if (r) {
      r.onresult = r.onerror = r.onstart = null;
      r.onend = function () { ACTIVE.lastEnd = Date.now(); };
      try { r.abort(); } catch (e) { }
    }
  }

  window.VoiceUI = {
    stop: stopActive,
    open: function (ctx) {
      stopActive();
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      var items = [], rec = null, listening = false, baseText = '';
      var lang = I18N.lang === 'kk' ? 'kk-KZ' : I18N.lang === 'en' ? 'en-US' : 'ru-RU';
      var body = document.createElement('div');
      body.className = 'voice';
      body.innerHTML =
        '<div class="voice-top"><button type="button" class="mic-btn" id="v-mic" aria-label="mic">🎤</button>' +
        '<div class="voice-status"><b id="v-status"></b><div class="small muted">' + esc(t('Можно назвать несколько видов сразу: «очистки овощей 12 с половиной кило, картон 5 на переработку, масло 3 литра»')) + '</div></div>' +
        '<select id="v-lang" class="chip" title="' + esc(t('Язык распознавания')) + '"><option value="ru-RU"' + (lang === 'ru-RU' ? ' selected' : '') + '>RU</option><option value="kk-KZ"' + (lang === 'kk-KZ' ? ' selected' : '') + '>KZ</option><option value="en-US"' + (lang === 'en-US' ? ' selected' : '') + '>EN</option></select></div>' +
        '<label class="field"><span>' + esc(t('Распознанный текст (можно исправить или ввести вручную)')) + '</span><textarea id="v-text" rows="2"></textarea></label>' +
        '<div id="v-items"></div>';
      var modal = openModal({
        title: '🎤 ' + t('Голосовой ввод'), body: body, noFocus: true, wide: true,
        onClose: function () { stopActive(); listening = false; },
        actions: [
          { label: t('Отмена'), cls: 'ghost', onClick: function () { stop(); } },
          { label: t('Сохранить'), cls: 'primary', onClick: function () { return saveAll(); } }
        ]
      });
      var saveBtn = $$('.modal-foot .btn', modal.el)[1];
      var ta = $('#v-text', body), statusEl = $('#v-status', body), micBtn = $('#v-mic', body);

      function setStatus(s, cls) { statusEl.textContent = s; micBtn.classList.toggle('on', cls === 'on'); }
      function stop() { stopActive(); listening = false; micBtn.classList.remove('on'); }
      function reparse() {
        items = parse(ta.value, ctx.types, ctx.methods).map(function (it) {
          return { typeId: it.type ? it.type.id : '', qty: it.qty, methodId: it.method ? it.method.id : (it.type ? it.type.methodId : ''), spokenUnit: it.unit, text: it.text };
        });
        renderItems();
      }
      function renderItems() {
        var box = $('#v-items', body);
        if (!items.length) {
          box.innerHTML = ta.value.trim() ? '<p class="muted small">' + esc(t('Не удалось распознать вид отхода и количество. Скажите, например: «пищевые отходы из зала 24 килограмма».')) + '</p>' : '';
          saveBtn.textContent = t('Сохранить'); saveBtn.disabled = true; return;
        }
        box.innerHTML = '<div class="v-head small muted">' + esc(t('Проверьте перед сохранением')) + ' · ' + items.length + '</div>' + items.map(function (it, k) {
          var ty = ctx.types.filter(function (x) { return x.id === it.typeId; })[0];
          var warn = '';
          if (!ty) warn = t('Выберите вид отхода');
          else if (!(it.qty > 0)) warn = t('Укажите количество');
          else if (it.spokenUnit && it.spokenUnit !== ty.unit) warn = t('Названа другая единица — проверьте: вид учитывается в') + ' ' + unitLabel(ty.unit);
          else if (it.qty > (ty.maxQty || 500)) warn = t('Больше разумного предела') + ' (' + ty.maxQty + ')';
          return '<div class="v-item' + (warn ? ' warn' : '') + '" data-k="' + k + '">' +
            '<select class="v-type"><option value="">— ' + esc(t('вид отхода')) + ' —</option>' + optionList(ctx.types, it.typeId, function (x) { return x.id; }, function (x) { return x.name; }) + '</select>' +
            '<div class="v-qty"><input class="v-q" type="number" inputmode="decimal" step="0.1" min="0" value="' + (it.qty != null ? it.qty : '') + '"><span>' + (ty ? unitLabel(ty.unit) : '') + '</span></div>' +
            '<select class="v-method">' + optionList(ctx.methods, it.methodId, function (m) { return m.id; }, function (m) { return m.name; }) + '</select>' +
            '<button type="button" class="icon-btn v-del" title="' + esc(t('Удалить')) + '">✕</button>' +
            (warn ? '<div class="v-warn small">⚠ ' + esc(warn) + '</div>' : '') + '</div>';
        }).join('');
        var ok = items.filter(function (it) { return it.typeId && it.qty > 0; }).length;
        saveBtn.textContent = t('Сохранить') + ' (' + ok + ')';
        saveBtn.disabled = ok === 0;
        $$('.v-item', box).forEach(function (row) {
          var k = +row.dataset.k;
          $('.v-type', row).onchange = function () {
            items[k].typeId = this.value;
            var ty = ctx.types.filter(function (x) { return x.id === items[k].typeId; })[0];
            if (ty) items[k].methodId = ty.methodId;
            items[k].spokenUnit = null; renderItems();
          };
          $('.v-q', row).oninput = function () { items[k].qty = +String(this.value).replace(',', '.'); var ok2 = items.filter(function (it) { return it.typeId && it.qty > 0; }).length; saveBtn.textContent = t('Сохранить') + ' (' + ok2 + ')'; saveBtn.disabled = ok2 === 0; };
          $('.v-q', row).onchange = function () { items[k].spokenUnit = null; renderItems(); };
          $('.v-method', row).onchange = function () { items[k].methodId = this.value; };
          $('.v-del', row).onclick = function () { items.splice(k, 1); renderItems(); };
        });
      }
      function saveAll() {
        var good = items.filter(function (it) { return it.typeId && it.qty > 0; });
        if (!good.length) { toast(t('Нечего сохранять'), 'err'); return false; }
        stop();
        ctx.save(good);
        return true;
      }
      /* Каждый запуск — новая сессия со своим номером. Колбэки старых сессий игнорируются,
         поэтому поздний onend прошлой записи не «ломает» новую (причина, почему 2-й раз не работал). */
      function idleStatus() { return items.length ? t('Готово — проверьте и сохраните. 🎤 — добавить ещё') : t('Нажмите 🎤 и говорите'); }
      function listen() {
        if (!SR) { setStatus(t('Голосовой ввод недоступен в этом браузере — введите текст (лучше Chrome)')); ta.focus(); return; }
        if (listening) { stop(); setStatus(t('Остановлено')); return; }
        stopActive();
        var myId = ++ACTIVE.id;
        listening = true;
        setStatus(t('Включаю микрофон…'), 'on');
        baseText = ta.value.trim();
        function begin() {
          if (myId !== ACTIVE.id) return;
          var r = new SR();
          ACTIVE.rec = r; rec = r;
          r.lang = $('#v-lang', body).value;
          r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
          r.onstart = function () { if (myId !== ACTIVE.id) return; setStatus(t('Слушаю… говорите'), 'on'); };
          r.onresult = function (ev) {
            if (myId !== ACTIVE.id) return;
            var fin = '', interim = '', isFinal = false;
            for (var i = 0; i < ev.results.length; i++) { if (ev.results[i].isFinal) { fin += ev.results[i][0].transcript; isFinal = true; } else interim += ev.results[i][0].transcript; }
            ta.value = (baseText ? baseText + ', ' : '') + (fin + interim).trim();
            reparse();
            if (isFinal && !interim) setStatus(t('Готово — проверьте и сохраните. 🎤 — добавить ещё'), 'on');
          };
          r.onerror = function (ev) {
            if (myId !== ACTIVE.id || ev.error === 'aborted') return;
            var msg = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? t('Нет доступа к микрофону — разрешите его в браузере') : ev.error === 'no-speech' ? t('Ничего не услышал — попробуйте ещё раз') : ev.error === 'network' ? t('Нужен интернет для распознавания речи') : ev.error === 'audio-capture' ? t('Микрофон занят другим приложением') : t('Ошибка распознавания') + ': ' + ev.error;
            finish(msg);
          };
          r.onend = function () { ACTIVE.lastEnd = Date.now(); if (myId !== ACTIVE.id) return; finish(null); };
          try { r.start(); }
          catch (e) {
            // движок ещё не освободился после прошлой записи — пробуем ещё раз
            setTimeout(function () { if (myId !== ACTIVE.id) return; try { r.start(); } catch (e2) { finish(t('Ошибка распознавания') + ': ' + e2.message); } }, 500);
          }
          // страховка: если браузер «завис» и не прислал onend
          setTimeout(function () { if (myId === ACTIVE.id && listening) { stopActive(); finish(null); } }, 20000);
        }
        function finish(msg) {
          if (ACTIVE.rec === rec) ACTIVE.rec = null;
          listening = false; micBtn.classList.remove('on');
          setStatus(msg || idleStatus());
        }
        // iOS требует старт прямо в обработчике нажатия; паузу делаем, только если прошлая запись закончилась только что
        var since = Date.now() - (ACTIVE.lastEnd || 0);
        if (since < 350) setTimeout(begin, 350 - since); else begin();
      }
      micBtn.onclick = listen;
      var tmr;
      ta.oninput = function () { clearTimeout(tmr); tmr = setTimeout(reparse, 250); };
      if (ctx.text) { ta.value = ctx.text; reparse(); setStatus(t('Готово — проверьте и сохраните. 🎤 — добавить ещё')); }
      else { renderItems(); setStatus(t('Нажмите 🎤 и говорите')); if (ctx.autostart !== false) listen(); }
      return modal;
    }
  };
})();
