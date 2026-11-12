/* Ассистент EcoTrack: отвечает на вопросы о работе системы (база знаний на 3 языках)
   и на вопросы по данным («сколько отходов в этом месяце?», «кто не сдал отчёт?»),
   плюс кнопка связи с поддержкой в WhatsApp. Работает без внешних сервисов и без интернета. */
(function () {
  function L(ru, kk, en) { return { ru: ru, kk: kk, en: en }; }
  function pick(o) { return o[I18N.lang] || o.ru; }

  /* --------- база знаний: [ключевые основы слов, ответ, (переход)] --------- */
  var KB = [
    { k: ['внест', 'добав запис', 'записат', 'взвеш', 'ввести', 'енгіз', 'жазба', 'add entry', 'enter', 'record', 'weigh', 'log waste'],
      a: L('Откройте «Ввод» → нажмите плитку вида отхода → введите вес → «Сохранить запись». Дата и ответственный подставляются сами, итоги за день и месяц пересчитываются сразу. Можно и голосом — кнопка 🎤.',
        '«Енгізу» бөлімін ашыңыз → қалдық түрінің тақтасын басыңыз → салмағын жазыңыз → «Жазбаны сақтау». Күні мен жауапты тұлға өзі қойылады, күн мен ай жиыны бірден есептеледі. Дауыспен де болады — 🎤 батырмасы.',
        'Open “Entry” → tap the waste type tile → enter the weight → “Save entry”. Date and responsible person are filled in automatically, daily and monthly totals update instantly. You can also use voice — the 🎤 button.'), go: 'form' },
    { k: ['голос', 'голосов ввод', 'микрофон', 'дауыс', 'дауыспен', 'сөйле', 'voice', 'micro', 'speak', 'speech'],
      a: L('Нажмите 🎤 и скажите, например: «очистки овощей 12 с половиной кило, картон 5 на переработку». Система создаст несколько записей сразу, их можно поправить перед сохранением. Если микрофон не включается — разрешите доступ к микрофону в браузере и проверьте интернет. Текст можно также напечатать в поле.',
        '🎤 басып, мысалы, айтыңыз: «көкөніс қабығы он екі жарым килограмм, картон бес». Жүйе бірден бірнеше жазба жасайды, сақтамас бұрын түзетуге болады. Микрофон қосылмаса — браузерде микрофонға рұқсат беріңіз және интернетті тексеріңіз. Мәтінді өрiске жазуға да болады.',
        'Tap 🎤 and say, for example: “vegetable peelings 12 and a half kilos, cardboard 5 for recycling”. Several entries are created at once and can be corrected before saving. If the mic does not start — allow microphone access in the browser and check the internet. You can also type the text.') },
    { k: ['новый вид', 'нов вид', 'нет в списке', 'жаңа түр', 'тізімде жоқ', 'new type', 'new waste', 'not in the list'],
      a: L('В форме нажмите «＋ Новый вид отхода», введите название, единицу и способ утилизации. Новый вид сразу появится в форме вашей организации.',
        'Нысанда «＋ Жаңа қалдық түрі» батырмасын басып, атауын, өлшем бірлігін және кәдеге жарату тәсілін енгізіңіз. Жаңа түр ұйымыңыздың нысанында бірден пайда болады.',
        'In the form tap “＋ New waste type”, enter the name, unit and disposal method. It appears in your organization’s form right away.'), go: 'form' },
    { k: ['отправ', 'сдать отч', 'сдат', 'жібер', 'тапсыр', 'submit', 'send report'],
      a: L('Внизу формы нажмите «Отправить отчёт на проверку». Отчёт = все записи за месяц. После отправки редактирование блокируется, статус меняется на «Отправлено». Срок — до 5-го числа следующего месяца.',
        'Нысанның төменгі жағындағы «Есепті тексеруге жіберу» батырмасын басыңыз. Есеп = айдағы барлық жазба. Жібергеннен кейін өңдеу бұғатталады, мәртебесі «Жіберілді» болады. Мерзімі — келесі айдың 5-іне дейін.',
        'At the bottom of the form tap “Submit report for review”. A report = all entries for the month. After submitting, editing is locked and the status becomes “Submitted”. Due by the 5th of the next month.') },
    { k: ['верну', 'возвращ', 'доработ', 'қайтар', 'пысықта', 'returned', 'return'],
      a: L('Если отчёт вернули, вверху формы виден комментарий проверяющего. Исправьте записи (✎ — изменить, 🗑 — удалить) и нажмите «Отправить повторно». Все шаги сохраняются в истории.',
        'Есеп қайтарылса, нысанның жоғарғы жағында тексерушінің түсініктемесі көрінеді. Жазбаларды түзетіп (✎ — өзгерту, 🗑 — жою), «Қайта жіберу» батырмасын басыңыз. Барлық қадам тарихта сақталады.',
        'If a report is returned, the reviewer’s comment is shown at the top of the form. Fix the entries (✎ edit, 🗑 delete) and tap “Resubmit”. Every step is kept in the history.') },
    { k: ['измен', 'удал', 'ошиб', 'исправ', 'өзгерт', 'жой', 'түзет', 'қате', 'edit', 'delete', 'mistake', 'fix', 'wrong'],
      a: L('В списке «Записи за …» нажмите ✎, чтобы изменить запись, или 🗑, чтобы удалить. Это возможно, пока отчёт в статусе «Черновик» или «Возвращено». Изменения записываются в историю.',
        '«Жазбалар: …» тізімінде ✎ басып өзгертіңіз немесе 🗑 басып жойыңыз. Есеп «Жоба» немесе «Қайтарылды» мәртебесінде болғанда ғана мүмкін. Өзгерістер тарихқа жазылады.',
        'In the “Entries for …” list tap ✎ to edit or 🗑 to delete an entry. This is possible while the report is a Draft or Returned. Changes are recorded in the history.') },
    { k: ['заблок', 'не могу', 'не редакт', 'бұғат', 'locked', 'cannot edit', "can't edit"],
      a: L('Отправленный или принятый отчёт заблокирован, чтобы данные не менялись после проверки. Если нужно исправить — попросите проверяющего вернуть отчёт с комментарием.',
        'Жіберілген немесе қабылданған есеп тексеруден кейін деректер өзгермеуі үшін бұғатталады. Түзету керек болса, тексерушіден есепті түсініктемемен қайтаруды сұраңыз.',
        'A submitted or accepted report is locked so data cannot change after review. If you need to fix something, ask the reviewer to return the report with a comment.') },
    { k: ['провер', 'принят', 'принять', 'тексер', 'қабылда', 'review', 'accept', 'approve'],
      a: L('Проверяющий открывает «Проверка отчётов» → отчёт → «Принять» или «Вернуть с комментарием». Принятый отчёт блокируется и попадает в единый реестр.',
        'Тексеруші «Есептерді тексеру» → есеп → «Қабылдау» немесе «Түсініктемемен қайтару» басады. Қабылданған есеп бұғатталып, бірыңғай тізілімге түседі.',
        'The reviewer opens “Report review” → a report → “Accept” or “Return with comment”. An accepted report is locked and goes to the unified registry.'), go: 'reports' },
    { k: ['реестр', 'фильтр', 'тізілім', 'сүзгі', 'registry', 'filter'],
      a: L('«Реестр» — все записи из принятых отчётов. Фильтры: период, организация, вид отходов, способ утилизации. Кнопка «Выгрузить в Excel».',
        '«Тізілім» — қабылданған есептердің барлық жазбалары. Сүзгілер: кезең, ұйым, қалдық түрі, кәдеге жарату тәсілі. «Excel-ге жүктеу» батырмасы бар.',
        '“Registry” holds all entries from accepted reports. Filters: period, organization, waste type, disposal method. Use “Export to Excel”.'), go: 'registry' },
    { k: ['excel', 'эксел', 'выгруз', 'скача', 'pdf', 'печат', 'жүкте', 'басып шығар', 'export', 'download', 'print'],
      a: L('Excel: кнопка «⬇ Excel» в отчёте, реестре или сводном отчёте (структура как в таблицах АТУ). PDF: кнопка «Печать / PDF» → «Сохранить как PDF».',
        'Excel: есепте, тізілімде немесе жиынтық есепте «⬇ Excel» батырмасы (АТУ кестелерінің құрылымымен). PDF: «Басып шығару / PDF» → «PDF ретінде сақтау».',
        'Excel: the “⬇ Excel” button in a report, the registry or the summary (same structure as ATU tables). PDF: “Print / PDF” → “Save as PDF”.') },
    { k: ['свод', 'квартал', 'годов', 'жиынтық', 'тоқсан', 'summary', 'quarter', 'annual'],
      a: L('«Сводный отчёт» → выберите месяц, квартал или год → таблицы по организациям, видам отходов и способам утилизации, список несдавших и выгрузка в Excel/PDF.',
        '«Жиынтық есеп» → ай, тоқсан немесе жылды таңдаңыз → ұйымдар, қалдық түрлері және тәсілдер бойынша кестелер, тапсырмағандар тізімі және Excel/PDF.',
        '“Summary report” → choose a month, quarter or year → tables by organization, waste type and method, a list of non-submitters and Excel/PDF export.'), go: 'summary' },
    { k: ['график', 'дашборд', 'dashboard', 'аналитик', 'динамик', 'chart', 'analytic'],
      a: L('Dashboard показывает массу отходов, долю пригодных к переработке и фактически переработанных, CO₂, динамику по месяцам, структуру, сравнение организаций, отклонения и рекомендации.',
        'Дашборд қалдық салмағын, қайта өңдеуге жарамды және нақты өңделген үлесті, CO₂-ні, айлық динамиканы, құрылымды, ұйымдарды салыстыруды, ауытқулар мен ұсыныстарды көрсетеді.',
        'The dashboard shows waste mass, the recyclable and actually recycled share, CO₂, monthly trends, structure, organization comparison, deviations and recommendations.'), go: 'dashboard' },
    { k: ['co2', 'со2', 'выброс', 'углерод', 'коэффиц', 'шығарынды', 'көміртек', 'emission', 'carbon', 'factor'],
      a: L('CO₂-экв. = масса × коэффициент (UK DEFRA 2024): пищевые на полигоне ≈0,70 кг/кг, картон ≈1,04, пластик/стекло/металл ≈0,009; при переработке/компосте ≈0,01. Коэффициенты меняются в справочнике видов отходов.',
        'CO₂-экв. = салмақ × коэффициент (UK DEFRA 2024): полигондағы тағам ≈0,70 кг/кг, картон ≈1,04, пластик/шыны/металл ≈0,009; қайта өңдеуде/компостта ≈0,01. Коэффициенттер қалдық түрлерінің анықтамалығында өзгертіледі.',
        'CO₂e = mass × factor (UK DEFRA 2024): landfilled food ≈0.70 kg/kg, cardboard ≈1.04, plastic/glass/metal ≈0.009; recycling/compost ≈0.01. Factors can be changed in the waste type list.') },
    { k: ['отклон', 'аномал', 'ауытқу', 'deviation', 'anomal'],
      a: L('Отклонение — когда доля вида отхода в массе организации выросла больше чем на N % к средней за 3 прошлых месяца. Порог N меняется на dashboard. Система сразу даёт рекомендацию.',
        'Ауытқу — қалдық түрінің ұйым салмағындағы үлесі алдыңғы 3 айдың орташасынан N %-дан көп өскенде. N шегі дашбордта өзгертіледі. Жүйе бірден ұсыныс береді.',
        'A deviation is when a waste type’s share of the organization’s total grows more than N % above its 3-month average. N is set on the dashboard, and a recommendation is shown.') },
    { k: ['установ', 'приложен', 'иконк', 'телефон', 'айфон', 'iphone', 'android', 'андроид', 'орнат', 'қосымша', 'install', 'app', 'phone'],
      a: L('Нажмите «📲 Приложение». Android: «Установить». iPhone: в Safari «Поделиться» ⬆ → «На экран „Домой“». EcoTrack появится как обычное приложение и будет работать офлайн.',
        '«📲 Қосымша» басыңыз. Android: «Орнату». iPhone: Safari-де «Бөлісу» ⬆ → «Басты экранға». EcoTrack кәдімгі қосымша сияқты пайда болып, офлайн жұмыс істейді.',
        'Tap “📲 App”. Android: “Install”. iPhone: in Safari tap “Share” ⬆ → “Add to Home Screen”. EcoTrack appears like a normal app and works offline.') },
    { k: ['офлайн', 'интернет', 'синхрон', 'облак', 'желі', 'бұлт', 'offline', 'internet', 'sync', 'cloud'],
      a: L('Данные хранятся в облаке и общие для всех устройств (индикатор ☁ онлайн). Без интернета записи сохраняются в телефоне и отправляются автоматически, когда связь появится.',
        'Деректер бұлтта сақталады және барлық құрылғыларға ортақ (☁ онлайн белгісі). Интернет болмаса, жазбалар телефонда сақталып, байланыс пайда болғанда автоматты түрде жіберіледі.',
        'Data is stored in the cloud and shared by all devices (☁ online indicator). Without internet, entries are kept on the phone and sent automatically once the connection returns.') },
    { k: ['язык', 'казах', 'англ', 'русск', 'тіл', 'қазақ', 'ағылшын', 'language', 'english', 'kazakh', 'russian'],
      a: L('Язык меняется в переключателе «РУС / ҚАЗ / ENG» вверху экрана.', 'Тіл экранның жоғарғы жағындағы «РУС / ҚАЗ / ENG» ауыстырғышымен өзгертіледі.', 'Change the language with the “РУС / ҚАЗ / ENG” selector at the top.') },
    { k: ['qr', 'кюар', 'код'],
      a: L('QR-коды организаций: «Справочники / Администрирование → QR-коды». Распечатайте и повесьте на кухне — сканирование открывает форму этой организации.',
        'Ұйымдардың QR-кодтары: «Анықтамалықтар / Әкімшілік → QR-кодтар». Басып шығарып, ас үйге іліңіз — сканерлеу сол ұйымның нысанын ашады.',
        'Organization QR codes: “Reference data / Administration → QR codes”. Print and place them in the kitchen — scanning opens that organization’s form.'), go: 'admin/qr' },
    { k: ['организац', 'пользоват', 'сотрудник', 'ұйым', 'пайдаланушы', 'қызметкер', 'organization', 'user', 'staff'],
      a: L('Администратор: «Администрирование → Организации» (кнопка «Подключить организацию», можно скопировать шаблон формы) и «Пользователи» (роль, организация, пароль). Код менять не нужно.',
        'Әкімші: «Әкімшілік → Ұйымдар» («Ұйымды қосу», нысан үлгісін көшіруге болады) және «Пайдаланушылар» (рөл, ұйым, құпиясөз). Кодты өзгерту қажет емес.',
        'Administrator: “Administration → Organizations” (“Add organization”, the form template can be copied) and “Users” (role, organization, password). No code changes needed.') },
    { k: ['пароль', 'войти', 'логин', 'вход', 'құпиясөз', 'кіру', 'password', 'login', 'sign in'],
      a: L('Вход — по e-mail и паролю, которые выдаёт администратор. Забыли пароль — администратор задаст новый в разделе «Пользователи».',
        'Кіру — әкімші берген e-mail және құпиясөз арқылы. Құпиясөзді ұмытсаңыз — әкімші «Пайдаланушылар» бөлімінде жаңасын қояды.',
        'Sign in with the e-mail and password issued by the administrator. Forgot it? The administrator can set a new one under “Users”.') },
    { k: ['фото', 'сурет', 'камер', 'photo', 'camera', 'picture'],
      a: L('В форме ввода откройте «Фото и примечание» → «📷 Фото отходов». Фото сжимается и прикрепляется к записи, проверяющий видит его в отчёте.',
        'Енгізу нысанында «Фото және ескертпе» → «📷 Қалдық фотосы». Фото кішірейтіліп, жазбаға тіркеледі, тексеруші оны есепте көреді.',
        'In the entry form open “Photo and note” → “📷 Waste photo”. The photo is compressed and attached; the reviewer sees it in the report.') },
    { k: ['роль', 'роли', 'кто вид', 'права', 'рөл', 'құқық', 'role', 'permission', 'access'],
      a: L('Роли: ответственное лицо (вводит данные своей организации), проверяющий (принимает/возвращает отчёты, реестр, свод), администратор (организации, пользователи, справочники), руководство (dashboard, реестр, отчёты — только просмотр).',
        'Рөлдер: жауапты тұлға (өз ұйымының деректерін енгізеді), тексеруші (есептерді қабылдайды/қайтарады, тізілім, жиынтық), әкімші (ұйымдар, пайдаланушылар, анықтамалықтар), басшылық (дашборд, тізілім, есептер — тек көру).',
        'Roles: responsible person (enters own organization data), reviewer (accepts/returns reports, registry, summary), administrator (organizations, users, reference data), management (dashboard, registry, reports — view only).') },
    { k: ['что такое', 'для чего', 'зачем', 'ecotrack', 'система', 'не үшін', 'бұл не', 'what is', 'about'],
      a: L('EcoTrack ATU — цифровой учёт пищевых отходов АО «АТУ»: ввод со смартфона, проверка отчётов, единый реестр, сводные отчёты в Excel/PDF, аналитика и расчёт CO₂ для снижения потерь и ESG-отчётности.',
        'EcoTrack ATU — «АТУ» АҚ тағам қалдықтарын цифрлық есепке алу: смартфоннан енгізу, есептерді тексеру, бірыңғай тізілім, Excel/PDF жиынтық есептер, шығынды азайту және ESG үшін аналитика мен CO₂ есебі.',
        'EcoTrack ATU is digital food waste tracking for ATU: smartphone entry, report review, a unified registry, Excel/PDF summaries, analytics and CO₂ to reduce losses and support ESG reporting.') },
    { k: ['поддержк', 'оператор', 'связ', 'whatsapp', 'ватсап', 'вотсап', 'человек', 'көмек', 'қолдау', 'support', 'human', 'contact', 'help me'],
      a: L('Нажмите «💬 Написать в поддержку» ниже — откроется WhatsApp с готовым сообщением.', 'Төмендегі «💬 Қолдау қызметіне жазу» батырмасын басыңыз — WhatsApp дайын хабарламамен ашылады.', 'Tap “💬 Contact support” below — WhatsApp opens with a ready message.'), support: true }
  ];

  var GREET = L('Здравствуйте! Я ассистент EcoTrack. Спросите, как пользоваться системой, или про ваши данные — например: «Сколько отходов в этом месяце?», «Кто не сдал отчёт?», «Как работает голосовой ввод?»',
    'Сәлеметсіз бе! Мен EcoTrack ассистентімін. Жүйені қалай қолдану керегін немесе деректеріңіз туралы сұраңыз — мысалы: «Осы айда қанша қалдық?», «Кім есеп тапсырмады?», «Дауыспен енгізу қалай жұмыс істейді?»',
    'Hello! I’m the EcoTrack assistant. Ask how to use the system or about your data — e.g. “How much waste this month?”, “Who hasn’t submitted?”, “How does voice input work?”');
  var FALLBACK = L('Не нашёл точного ответа. Попробуйте переформулировать или напишите в поддержку — ответим в WhatsApp.',
    'Нақты жауап таппадым. Сұрақты басқаша қойып көріңіз немесе қолдау қызметіне жазыңыз — WhatsApp-та жауап береміз.',
    'I couldn’t find an exact answer. Try rephrasing or contact support — we’ll reply on WhatsApp.');
  var CHIPS = [
    L('Сколько отходов в этом месяце?', 'Осы айда қанша қалдық?', 'How much waste this month?'),
    L('Статус моего отчёта', 'Есебімнің мәртебесі', 'My report status'),
    L('Кто не сдал отчёт?', 'Кім есеп тапсырмады?', 'Who hasn’t submitted?'),
    L('Как работает голосовой ввод?', 'Дауыспен енгізу қалай жұмыс істейді?', 'How does voice input work?'),
    L('Как установить приложение?', 'Қосымшаны қалай орнатамын?', 'How do I install the app?'),
    L('Как считается CO₂?', 'CO₂ қалай есептеледі?', 'How is CO₂ calculated?')
  ];

  function norm(s) { return ' ' + String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/₂/g, '2').replace(/[’']/g, ' ').replace(/[^0-9a-zа-яәіңғүұқөһ₂\s]/gi, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function has(text, re) { return re.test(text); }

  /* ---------- ответы по живым данным ---------- */
  function monthFromText(x) {
    var cur = API.todayStr().slice(0, 7);
    if (/прошл|өткен|last month|previous/.test(x)) return addMonths(cur, -1);
    var names = [['январ', 'қаңтар', 'january'], ['феврал', 'ақпан', 'february'], ['март', 'наурыз', 'march'], ['апрел', 'сәуір', 'april'], ['мая', 'май ', 'мамыр', ' may '], ['июн', 'маусым', 'june'], ['июл', 'шілде', 'july'], ['август', 'тамыз', 'august'], ['сентябр', 'қыркүйек', 'september'], ['октябр', 'қазан', 'october'], ['ноябр', 'қараша', 'november'], ['декабр', 'желтоқсан', 'december']];
    for (var i = 0; i < 12; i++) if (names[i].some(function (n) { return x.indexOf(n) >= 0; })) {
      var y = +cur.slice(0, 4), m = String(i + 1).padStart(2, '0');
      var p = y + '-' + m; if (p > cur) p = (y - 1) + '-' + m; return p;
    }
    return cur;
  }
  function dataAnswer(x, u) {
    if (!u) return null;
    var orgName = {}; API.orgs({ all: true }).forEach(function (o) { orgName[o.id] = o.short; });
    var isResp = u.role === 'resp';
    // сколько отходов
    if (has(x, /сколько|масса|скольк|қанша|салмақ|how much|total|kg|кг/) && has(x, /отход|кг|масс|қалдық|waste|kg|месяц|ай|month/)) {
      var p = monthFromText(x);
      var all = API.analyticsEntries(!isResp).filter(function (e) { return e.date.slice(0, 7) === p; });
      var kg = all.reduce(function (s, e) { return s + API.kg(e); }, 0);
      var co2 = all.reduce(function (s, e) { return s + API.co2(e); }, 0);
      var by = {}; all.forEach(function (e) { var n = API.wasteType(e.typeId).name; by[n] = (by[n] || 0) + API.kg(e); });
      var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
      var scope = isResp ? orgName[u.orgId] : pick(L('все организации', 'барлық ұйымдар', 'all organizations'));
      return pick(L('За ' + monthLabel(p) + ' (' + scope + '): ', monthLabel(p) + ' (' + scope + '): ', monthLabel(p) + ' (' + scope + '): ')) +
        '<b>' + fmt(kg, 1) + ' ' + t('кг') + '</b>, CO₂ ≈ ' + fmt(co2, 0) + ' ' + t('кг') + (all.length ? '. ' + pick(L('Больше всего: ', 'Ең көбі: ', 'Largest: ')) + esc(top) + ' — ' + fmt(by[top], 1) + ' ' + t('кг') + '.' : '.') +
        (!isResp ? ' <span class="muted small">' + esc(pick(L('(все записи, включая непроверенные)', '(барлық жазбалар, тексерілмегендерді қоса)', '(all entries, including unreviewed)'))) + '</span>' : '');
    }
    // кто не сдал
    if (has(x, /не сдал|несдав|не сдан|тапсырма|not submit|hasn t submit|missing report|кто не/)) {
      if (isResp) x = ' статус '; // ответственное лицо видит только свой отчёт
      else {
        var prev = addMonths(API.todayStr().slice(0, 7), -1);
        var ns = API.nonSubmitters([prev]);
        if (!ns.length) return pick(L('За ', '', 'For ')) + monthLabel(prev) + pick(L(' все организации сдали отчёты ✓', ' бойынша барлық ұйымдар есеп тапсырды ✓', ' all organizations have submitted ✓'));
        return pick(L('Нет принятого отчёта за ', 'Қабылданған есеп жоқ: ', 'No accepted report for ')) + monthLabel(prev) + ':<br>' +
          ns.map(function (r) { return '• <b>' + esc(orgName[r.orgId]) + '</b> — ' + esc(t(STATUS[r.status].label)); }).join('<br>');
      }
    }
    // статус отчёта / срок
    if (has(x, /статус|мәртебе|status|срок|дедлайн|мерзім|deadline|due|когда сдать/)) {
      var cur = API.todayStr().slice(0, 7), dl = deadlineOf(cur, API.settings().deadlineDay);
      if (isResp) {
        var r = API.reportByPeriod(u.orgId, cur);
        return pick(L('Отчёт за ', 'Есеп: ', 'Report for ')) + monthLabel(cur) + ' — <b>' + esc(t(STATUS[r ? r.status : 'draft'].label)) + '</b>. ' + pick(L('Срок сдачи: ', 'Тапсыру мерзімі: ', 'Due: ')) + dateLabel(dl) + ' (' + daysBetween(API.todayStr(), dl) + ' ' + pick(L('дн.', 'күн', 'days')) + ').';
      }
      var q = API.reports({ status: ['submitted', 'in_review'] });
      return pick(L('Ожидают проверки: ', 'Тексеруді күтуде: ', 'Awaiting review: ')) + '<b>' + q.length + '</b>' + (q.length ? ' — ' + q.map(function (x2) { return esc(orgName[x2.orgId]) + ' (' + monthLabel(x2.period) + ')'; }).join(', ') : '') + '. ' + pick(L('Срок сдачи за ', 'Мерзімі: ', 'Due for ')) + monthLabel(cur) + ': ' + dateLabel(dl) + '.';
    }
    return null;
  }

  /* отвечаем на языке вопроса: казахские буквы → қаз., латиница → англ., иначе язык интерфейса */
  function detectLang(q) {
    if (/[әіңғүұқөһ]/i.test(q)) return 'kk';
    if (/[а-яё]/i.test(q)) return I18N.lang === 'en' ? 'ru' : I18N.lang;
    if (/[a-z]/i.test(q)) return 'en';
    return I18N.lang;
  }
  function answer(q) {
    var saved = I18N.lang;
    I18N.lang = detectLang(q);
    try { return answerIn(q); } finally { I18N.lang = saved; }
  }
  function answerIn(q) {
    var x = norm(q), u = API.me();
    var d = null;
    try { d = dataAnswer(x, u); } catch (e) { d = null; }
    if (d) return { html: d };
    var best = null, bestScore = 0;
    KB.forEach(function (it) {
      var score = 0;
      it.k.forEach(function (k) {
        if (k.indexOf(' ') >= 0) { if (x.indexOf(' ' + k) >= 0) score += 2; }
        else if (new RegExp('(^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(x)) score += 1;
      });
      if (score > bestScore) { bestScore = score; best = it; }
    });
    if (!best) return { html: esc(pick(FALLBACK)), support: true };
    return { html: esc(pick(best.a)), go: best.go, support: best.support };
  }

  /* ---------- поддержка в WhatsApp ---------- */
  function whatsappUrl() {
    var num = String((window.ECOTRACK_CONFIG || {}).supportWhatsApp || '').replace(/\D/g, '');
    if (!num) return null;
    var u = API.me();
    var msg = pick(L('Здравствуйте! Нужна помощь по EcoTrack ATU.', 'Сәлеметсіз бе! EcoTrack ATU бойынша көмек керек.', 'Hello! I need help with EcoTrack ATU.'));
    if (u) msg += '\n' + u.name + ' (' + u.email + ')' + (u.orgId ? ', ' + (API.org(u.orgId) || {}).short : '');
    msg += '\n' + location.hash.replace('#/', '');
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
  }
  function openSupport() {
    var url = whatsappUrl();
    if (!url) { toast(pick(L('Номер поддержки не настроен', 'Қолдау нөмірі бапталмаған', 'Support number is not configured')), 'err'); return; }
    window.open(url, '_blank', 'noopener');
  }

  /* ---------- окно чата ---------- */
  var history = [];
  function open() {
    var body = document.createElement('div');
    body.className = 'assist';
    body.innerHTML = '<div class="assist-log" id="as-log"></div>' +
      '<div class="assist-chips" id="as-chips">' + CHIPS.map(function (c) { return '<button type="button" class="chip">' + esc(pick(c)) + '</button>'; }).join('') + '</div>' +
      '<form class="assist-input" id="as-form"><input id="as-q" autocomplete="off" placeholder="' + esc(pick(L('Задайте вопрос…', 'Сұрақ қойыңыз…', 'Ask a question…'))) + '"><button class="btn primary" type="submit">➤</button></form>' +
      '<button type="button" class="btn wa-btn block" id="as-wa">💬 ' + esc(pick(L('Написать в поддержку (WhatsApp)', 'Қолдау қызметіне жазу (WhatsApp)', 'Contact support (WhatsApp)'))) + '</button>';
    var m = openModal({ title: '🤖 ' + pick(L('Ассистент EcoTrack', 'EcoTrack ассистенті', 'EcoTrack assistant')), body: body, noFocus: true, actions: [] });
    $('.modal-foot', m.el).remove();
    m.el.querySelector('.modal').classList.add('assist-modal');
    var log = $('#as-log', body);
    function add(who, html, extra) {
      var d = document.createElement('div');
      d.className = 'msg ' + who;
      d.innerHTML = html;
      if (extra && extra.go) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'chip go-chip';
        b.textContent = pick(L('Открыть раздел →', 'Бөлімді ашу →', 'Open section →'));
        b.onclick = function () { m.close(); go(extra.go); };
        d.appendChild(document.createElement('br')); d.appendChild(b);
      }
      if (extra && extra.support) {
        var w = document.createElement('button'); w.type = 'button'; w.className = 'chip wa-chip';
        w.textContent = '💬 WhatsApp'; w.onclick = openSupport;
        d.appendChild(document.createElement('br')); d.appendChild(w);
      }
      log.appendChild(d); log.scrollTop = log.scrollHeight;
    }
    function ask(q) {
      q = String(q || '').trim(); if (!q) return;
      add('me', esc(q)); history.push(['me', esc(q)]);
      var a = answer(q);
      setTimeout(function () { add('bot', a.html, a); history.push(['bot', a.html, a]); }, 250);
    }
    add('bot', esc(pick(GREET)));
    history.slice(-10).forEach(function (h) { add(h[0], h[1], h[2]); });
    $$('#as-chips .chip', body).forEach(function (c) { c.onclick = function () { ask(c.textContent); }; });
    $('#as-form', body).onsubmit = function (ev) { ev.preventDefault(); var i = $('#as-q', body); ask(i.value); i.value = ''; };
    $('#as-wa', body).onclick = openSupport;
    setTimeout(function () { $('#as-q', body).focus(); }, 50);
  }

  window.Assistant = {
    answer: answer, open: open, whatsappUrl: whatsappUrl,
    mount: function () {
      var b = document.getElementById('help-fab');
      if (!b) {
        b = document.createElement('button');
        b.id = 'help-fab'; b.className = 'help-fab'; b.type = 'button';
        b.innerHTML = '<span>?</span>';
        b.onclick = open;
        document.body.appendChild(b);
      }
      b.title = pick(L('Помощь', 'Көмек', 'Help'));
      b.setAttribute('aria-label', b.title);
    }
  };
})();
