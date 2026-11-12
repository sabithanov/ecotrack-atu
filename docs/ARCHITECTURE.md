# Архитектура EcoTrack ATU

## 1. Компоненты

```mermaid
flowchart LR
  subgraph Пользователи
    R[Ответственное лицо<br/>смартфон / QR]
    V[Проверяющий<br/>ноутбук]
    A[Администратор]
    M[Руководство]
  end
  subgraph PWA["PWA (HTML/CSS/JS, GitHub Pages, офлайн)"]
    UI[Экраны: Ввод · Отчёты · Реестр · Сводный · Dashboard · Справочники]
    EX[Экспорт Excel / PDF]
  end
  subgraph API["Слой API (js/api.js)"]
    AUTH[Сессия и роли<br/>солёный SHA-256]
    WF[Workflow отчётов<br/>+ история]
    VAL[Валидация записей]
    AGG[Реестр, свод,<br/>CO₂, отклонения]
  end
  DB[(Хранилище<br/>MVP: localStorage<br/>Пилот: Supabase PostgreSQL + RLS)]
  R --> UI
  V --> UI
  A --> UI
  M --> UI
  UI --> API
  EX --> API
  API --> DB
  SCALES[Электронные весы<br/>Трек 2, API] -. пилот .-> API
  TG[Telegram-бот<br/>напоминания] -. пилот .-> API
```

Принцип: UI никогда не обращается к данным напрямую. Все чтения и записи идут через методы API. Каждый метод проверяет сессию, роль (`resp` / `reviewer` / `admin` / `mgmt`) и принадлежность к организации. При переходе на Supabase тот же контракт реализуется функциями PostgreSQL и политиками RLS ([../supabase/schema.sql](../supabase/schema.sql)).

## 2. ER-диаграмма

```mermaid
erDiagram
  ORGANIZATION ||--o{ USER : "сотрудники"
  ORGANIZATION ||--o{ WASTE_TYPE : "справочник формы"
  ORGANIZATION ||--o{ REPORT : "сдаёт"
  REPORT ||--o{ ENTRY : "содержит"
  REPORT ||--o{ STATUS_HISTORY : "история"
  WASTE_TYPE ||--o{ ENTRY : "вид"
  DISPOSAL_METHOD ||--o{ ENTRY : "способ"
  DISPOSAL_METHOD ||--o{ WASTE_TYPE : "по умолчанию"
  USER ||--o{ ENTRY : "ответственный"
  USER ||--o{ STATUS_HISTORY : "кто"

  ORGANIZATION {
    string id PK
    string name
    string short
    enum type "кафедра|столовая|кофейня|гостиница|буфет|лаборатория"
    string building
    bool active
  }
  USER {
    string id PK
    string name "ФИО"
    string email "логин"
    enum role "resp|reviewer|admin|mgmt"
    string org_id FK "только для resp"
    string salt
    string hash "SHA-256, не пароль"
    bool active
  }
  WASTE_TYPE {
    string id PK
    string org_id FK "null = общий"
    string name
    enum unit "kg|l"
    float density "кг/л"
    enum category "food|packaging|paper|oil|other"
    bool recyclable
    float co2 "кг CO2-экв/кг на полигоне"
    string method_id FK "способ по умолчанию"
    float max_qty "лимит на запись"
    bool active "деактивация вместо удаления"
  }
  DISPOSAL_METHOD {
    string id PK
    string name
    enum mode "landfill|recycle|compost|feed"
    bool active
  }
  REPORT {
    string id PK
    string org_id FK
    string period "YYYY-MM"
    enum status "draft|submitted|in_review|accepted|returned"
    datetime submitted_at
    string reviewer_id FK
    datetime decided_at
  }
  ENTRY {
    string id PK
    string report_id FK
    string org_id FK
    date date
    string type_id FK
    float qty
    string method_id FK
    string user_id FK
    text photo "JPEG, сжато"
    string note
    datetime created_at
  }
  STATUS_HISTORY {
    string id PK
    string report_id FK
    enum from_status
    enum to_status
    enum action "create|submit|review|accept|return|edit|delete"
    string user_id FK
    string comment
    datetime at
  }
```

Правила ТЗ:
* итоги за день и месяц **не хранятся**, а вычисляются из записей;
* единый реестр — это записи отчётов со статусом `accepted`;
* вид отхода, по которому есть записи, удалить нельзя, только деактивировать;
* одна организация и один месяц дают один отчёт (уникальная пара `org_id + period`).

## 3. Жизненный цикл отчёта

```mermaid
stateDiagram-v2
  [*] --> draft: первая запись за месяц
  draft --> submitted: ответственное лицо «Отправить»
  submitted --> in_review: проверяющий открыл отчёт
  in_review --> accepted: «Принять»
  in_review --> returned: «Вернуть» + обязательный комментарий
  submitted --> accepted: «Принять»
  submitted --> returned: «Вернуть» + комментарий
  returned --> submitted: исправлено, «Отправить повторно»
  accepted --> [*]: блокировка, попадает в реестр
```

Статус `returned` работает как черновик (записи можно редактировать) и показывает комментарий проверяющего. Каждый переход, а также правка или удаление записи пишутся в `STATUS_HISTORY`.

## 4. Процесс «как есть» → «как будет»

```mermaid
flowchart TB
  subgraph AS_IS["Как есть (бумага / разрозненные Excel)"]
    a1[Взвешивание] --> a2[Запись в бумажный журнал<br/>~1,5 мин] --> a3[Конец месяца: перенос в Excel<br/>~2 ч на организацию]
    a3 --> a4[Отправка файла по почте] --> a5[Проверяющий сводит 5 таблиц,<br/>ищет ошибки, переписывается<br/>~12 ч/мес]
    a5 --> a6[Квартальный отчёт вручную]
  end
  subgraph TO_BE["Как будет (EcoTrack ATU)"]
    b1[Взвешивание] --> b2[QR → плитка → вес → «Сохранить»<br/>≤ 30 с, 3 касания] --> b3[Автоитоги, автопроверка, черновик]
    b3 --> b4[«Отправить» — 1 действие] --> b5[Проверяющий: принять / вернуть<br/>~15 мин на отчёт]
    b5 --> b6[Реестр, свод, Excel, dashboard — автоматически]
  end
```

| Операция (5 организаций, ~440 взвешиваний в месяц) | Как есть | Как будет |
|---|---|---|
| Запись взвешиваний | 440 × 1,5 мин ≈ 11 ч | 440 × 0,5 мин ≈ 3,7 ч |
| Перенос бумажного журнала в Excel | 5 × 2 ч = 10 ч | 0 |
| Сведение, проверка, переписка | ≈ 12 ч | 5 × 15 мин ≈ 1,3 ч |
| Квартальный и годовой свод (в пересчёте на месяц) | ≈ 3 ч | ≈ 0,2 ч (выгрузка) |
| **Итого в месяц** | **≈ 36 ч** | **≈ 5,2 ч (−86 %)** |

*Допущения команды основаны на хронометраже заполнения образцов таблиц; на пилоте их нужно уточнить.*

## 5. Расчёты

* **Масса, кг** = количество × плотность (для литров 0,92 кг/л — отработанное масло).
* **CO₂-экв.** = масса × коэффициент вида отхода (полигон) или × 0,01 (переработка, компост, корм) — в зависимости от способа утилизации записи.
* **Потенциал снижения CO₂** = Σ по пригодным к переработке отходам, вывезенным на полигон: масса × (коэффициент − 0,01).
* **Доля пригодных** = масса видов с признаком «пригоден к переработке» / общая масса.
* **Фактически переработано** = масса записей со способом не «полигон» / общая масса.
* **Отклонение:** доля вида отхода в массе организации за месяц сравнивается со средней долей за 3 предыдущих месяца. Порог N % задаётся на dashboard. Доля не зависит от сезонности (каникулы, загрузка гостиницы) и от неполного месяца.
* **Несдавшие:** активные организации без отчёта в статусе «принято» за прошедшие месяцы периода (и за текущий месяц, если он входит в период).
