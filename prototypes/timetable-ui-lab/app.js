(() => {
  "use strict";

  const DATA_BASE = "../../data/demo";
  const DEFAULT_DATE = "2026-11-02";
  const DAYS = ["月", "火", "水", "木", "金"];
  const LONG_DAYS = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"];
  const PERSONAL_COURSE_IDS = new Set([
    "demo-digital-foundations",
    "demo-communication-basics",
    "demo-cross-media",
    "demo-expanded-g1-04",
    "demo-expanded-g1-08",
    "demo-expanded-g1-09",
    "demo-expanded-g1-30",
    "demo-expanded-g1-12",
    "demo-expanded-g1-14",
    "demo-expanded-g1-32",
    "demo-expanded-g1-18",
  ]);

  const CONCEPTS = {
    A: {
      name: "現行整理型",
      short: "Agenda",
      description: "現行のカード中心構造を保ち、日付・時限・授業情報の階層を整理した堅実案。",
      strength: "学習コストが低く、日表示で迷いにくい",
      risk: "週間全体の比較には縦スクロールが残る",
    },
    B: {
      name: "週間グリッド型",
      short: "Matrix",
      description: "曜日を横軸、時限を縦軸に固定し、空きと重なりを最短で把握する表形式。",
      strength: "1週間の空き・重複・偏りが一目で分かる",
      risk: "候補が多いセルとスマホ表示に工夫が必要",
    },
    C: {
      name: "高密度ダッシュボード型",
      short: "Dense",
      description: "統計・クイックナビ・圧縮リストを一画面に集め、探索速度を優先する案。",
      strength: "大量授業の走査と比較が速い",
      risk: "初見では情報量が多く、落ち着きに欠ける",
    },
    D: {
      name: "時間軸カレンダー型",
      short: "Timeline",
      description: "実際の開始・終了時刻に沿って予定ブロックを置き、1日の流れを視覚化する案。",
      strength: "授業の長さと一日のリズムを直感的に把握できる",
      risk: "同時限に多数の授業がある学校全体表示では混雑する",
    },
    E: {
      name: "曜日ボード型",
      short: "Board",
      description: "曜日ごとの列に時限グループとカードを積み、授業単位の認識を重視する案。",
      strength: "カードの内容を読みやすく、曜日単位で比較できる",
      risk: "列ごとの高さが揃わず、全体把握にスクロールが必要",
    },
    F: {
      name: "分割ペイン型",
      short: "Split",
      description: "左で曜日を選び、中央で授業、右で週間俯瞰を確認する探索型レイアウト。",
      strength: "現在地を保ったまま日と週を行き来しやすい",
      risk: "狭い画面ではペインを積み直す必要がある",
    },
    G: {
      name: "路線図型",
      short: "Route",
      description: "1〜4限を駅、授業を路線上の停車情報として並べ、時間の進行を強調する案。",
      strength: "視線が自然に時系列へ流れ、空き時間も認識しやすい",
      risk: "一般的な時間割表ではないため慣れが必要",
    },
    H: {
      name: "フォーカス＋ミニマップ型",
      short: "Focus",
      description: "週全体を小さなヒートマップで示し、選んだ1枠の授業を大きく読む案。",
      strength: "スマホでも週の位置関係と詳細を両立できる",
      risk: "複数枠の授業名を同時に読み比べにくい",
    },
  };

  const params = new URLSearchParams(location.search);
  const state = {
    concept: CONCEPTS[params.get("concept")] ? params.get("concept") : "A",
    view: params.get("view") === "day" ? "day" : "week",
    mode: params.get("mode") === "personal" ? "personal" : "school",
    date: isDateKey(params.get("date")) ? params.get("date") : DEFAULT_DATE,
    focusPeriod: clamp(Number(params.get("period")) || 1, 1, 4),
    compare: params.get("compare") === "1",
    embed: params.get("embed") === "1",
    courses: new Map(),
    days: {},
    periods: {},
  };

  const ui = {
    tabs: document.querySelector("#concept-tabs"),
    title: document.querySelector("#concept-title"),
    kicker: document.querySelector("#concept-kicker"),
    description: document.querySelector("#concept-description"),
    strength: document.querySelector("#concept-strength"),
    risk: document.querySelector("#concept-risk"),
    stage: document.querySelector("#lab-stage"),
    status: document.querySelector("#prototype-status"),
    school: document.querySelector("#mode-school"),
    personal: document.querySelector("#mode-personal"),
    day: document.querySelector("#view-day"),
    week: document.querySelector("#view-week"),
    previous: document.querySelector("#date-previous"),
    reset: document.querySelector("#date-reset"),
    next: document.querySelector("#date-next"),
    comparisonToggle: document.querySelector("#comparison-toggle"),
    comparisonPanel: document.querySelector("#comparison-panel"),
    comparisonGrid: document.querySelector("#comparison-grid"),
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function parseDate(dateKey) {
    return new Date(`${dateKey}T12:00:00`);
  }

  function formatDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function addDays(dateKey, count) {
    const date = parseDate(dateKey);
    date.setDate(date.getDate() + count);
    return formatDateKey(date);
  }

  function startOfWeek(dateKey) {
    const date = parseDate(dateKey);
    const day = date.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + offset);
    return formatDateKey(date);
  }

  function weekDates() {
    const start = startOfWeek(state.date);
    return Array.from({ length: 5 }, (_, index) => addDays(start, index));
  }

  function dateLabel(dateKey, withDay = true) {
    const date = parseDate(dateKey);
    const base = `${date.getMonth() + 1}月${date.getDate()}日`;
    return withDay ? `${base}${LONG_DAYS[(date.getDay() + 6) % 7] ?? ""}` : base;
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function entriesForDate(dateKey) {
    const entries = Array.isArray(state.days[dateKey]) ? state.days[dateKey] : [];
    if (state.mode === "school") return entries;
    return entries.filter((entry) => {
      if (entry.kind !== "class") return true;
      return entry.courseId && PERSONAL_COURSE_IDS.has(entry.courseId);
    });
  }

  function entriesForSlot(dateKey, period) {
    return entriesForDate(dateKey).filter((entry) => Number(entry.period) === Number(period));
  }

  function courseFor(entry) {
    return state.courses.get(entry.courseId) || null;
  }

  function entryTitle(entry) {
    return courseFor(entry)?.title || entry.subjectName || entry.subjectRaw || "名称未設定";
  }

  function courseType(entry) {
    return courseFor(entry)?.courseType || "区分未確認";
  }

  function cardTone(entry) {
    const type = courseType(entry);
    if (type === "必修") return "required";
    if (type === "選択必修") return "elective-required";
    if (!entry.courseId) return "event";
    return "elective";
  }

  function detailHref(entry) {
    if (!entry.courseId) return "";
    return `../../course.html?id=${encodeURIComponent(entry.courseId)}&demo=1`;
  }

  function slotLabel(entry, dateKey) {
    const dates = weekDates();
    const sameCourse = dates.flatMap((date) =>
      entriesForDate(date)
        .filter((candidate) => candidate.courseId && candidate.courseId === entry.courseId)
        .map((candidate) => ({ date, period: candidate.period })),
    );
    const sameDayPeriods = sameCourse
      .filter((slot) => slot.date === dateKey)
      .map((slot) => Number(slot.period))
      .sort((a, b) => a - b);
    if (!sameDayPeriods.length) return `${entry.period}限`;
    const first = sameDayPeriods[0];
    const last = sameDayPeriods.at(-1);
    return first === last ? `${first}限` : `${first}〜${last}限`;
  }

  function metaText(entry, dateKey) {
    const instructor = entry.instructors?.join("・") || courseFor(entry)?.instructor || "担当未確認";
    return `${slotLabel(entry, dateKey)} / ${instructor}`;
  }

  function makeCourseCard(entry, dateKey, options = {}) {
    const card = el("article", `course-card course-card--${cardTone(entry)}`);
    if (options.compact) card.classList.add("course-card--compact");
    const header = el("div", "course-card__header");
    const title = entry.courseId ? el("a", "course-card__title", entryTitle(entry)) : el("span", "course-card__title", entryTitle(entry));
    if (entry.courseId) {
      title.href = detailHref(entry);
      title.setAttribute("aria-label", `${entryTitle(entry)}の授業詳細を見る`);
    }
    const badge = el("span", `course-badge course-badge--${cardTone(entry)}`, courseType(entry));
    header.append(title, badge);
    card.append(header, el("p", "course-card__meta", metaText(entry, dateKey)));
    if (!options.compact && entry.rooms?.length) {
      card.append(el("p", "course-card__room", entry.rooms.join("・")));
    }
    return card;
  }

  function makeEmpty(text = "予定なし") {
    return el("div", "slot-empty", text);
  }

  function makePeriodHeading(period) {
    const wrap = el("div", "period-heading");
    const number = el("strong", "period-heading__number", `${period}限`);
    const time = state.periods[String(period)];
    wrap.append(number, el("span", "period-heading__time", time ? `${time.start}–${time.end}` : ""));
    return wrap;
  }

  function renderConceptA() {
    const root = el("section", "prototype concept-a");
    const header = el("div", "prototype__heading");
    header.append(el("div", "prototype__eyebrow", state.mode === "personal" ? "PERSONAL TIMETABLE" : "SCHOOL TIMETABLE"));
    header.append(el("h3", "prototype__title", state.view === "week" ? `${dateLabel(weekDates()[0], false)}からの1週間` : dateLabel(state.date)));
    root.append(header);

    const dates = state.view === "week" ? weekDates() : [state.date];
    const agenda = el("div", "agenda");
    dates.forEach((dateKey, dayIndex) => {
      const day = el("section", "agenda-day");
      const dayHead = el("header", "agenda-day__header");
      dayHead.append(el("span", "agenda-day__day", LONG_DAYS[dayIndex] || dateLabel(dateKey)), el("span", "agenda-day__date", dateLabel(dateKey, false)));
      day.append(dayHead);
      for (let period = 1; period <= 4; period += 1) {
        const row = el("div", "agenda-row");
        row.append(makePeriodHeading(period));
        const cards = el("div", "agenda-row__cards");
        const entries = entriesForSlot(dateKey, period);
        if (!entries.length) cards.append(makeEmpty());
        else entries.forEach((entry) => cards.append(makeCourseCard(entry, dateKey)));
        row.append(cards);
        day.append(row);
      }
      agenda.append(day);
    });
    root.append(agenda);
    return root;
  }

  function renderConceptB() {
    const root = el("section", "prototype concept-b");
    const dates = state.view === "week" ? weekDates() : [state.date];
    const grid = el("div", "matrix");
    grid.style.setProperty("--day-count", String(dates.length));
    grid.append(el("div", "matrix__corner", "時限"));
    dates.forEach((dateKey) => {
      const head = el("div", "matrix__day-head");
      head.append(el("strong", "", DAYS[(parseDate(dateKey).getDay() + 6) % 7]), el("span", "", dateLabel(dateKey, false)));
      grid.append(head);
    });
    for (let period = 1; period <= 4; period += 1) {
      grid.append(makePeriodHeading(period));
      dates.forEach((dateKey) => {
        const cell = el("div", "matrix__cell");
        const entries = entriesForSlot(dateKey, period);
        if (!entries.length) cell.append(makeEmpty("空き"));
        else entries.forEach((entry) => cell.append(makeCourseCard(entry, dateKey, { compact: true })));
        grid.append(cell);
      });
    }
    root.append(grid);
    return root;
  }

  function renderConceptC() {
    const root = el("section", "prototype concept-c");
    const dates = state.view === "week" ? weekDates() : [state.date];
    const entries = dates.flatMap((dateKey) => entriesForDate(dateKey).map((entry) => ({ entry, dateKey })));
    const uniqueCourses = new Set(entries.map(({ entry }) => entry.courseId).filter(Boolean));
    const required = entries.filter(({ entry }) => courseType(entry) === "必修").length;
    const occupied = dates.reduce((sum, dateKey) => sum + [1, 2, 3, 4].filter((period) => entriesForSlot(dateKey, period).length).length, 0);
    const metrics = el("div", "dense-metrics");
    [["表示授業", uniqueCourses.size], ["登録枠", entries.length], ["必修表示", required], ["使用コマ", occupied]].forEach(([label, value]) => {
      const metric = el("div", "dense-metric");
      metric.append(el("span", "", label), el("strong", "", String(value)));
      metrics.append(metric);
    });
    root.append(metrics);

    const quick = el("div", "dense-quick", "曜日別の件数");
    dates.forEach((dateKey) => {
      const item = el("button", "dense-quick__item");
      item.type = "button";
      item.dataset.date = dateKey;
      item.append(el("strong", "", DAYS[(parseDate(dateKey).getDay() + 6) % 7]), el("span", "", `${entriesForDate(dateKey).length}件`));
      quick.append(item);
    });
    root.append(quick);

    const table = el("div", "dense-table");
    const head = el("div", "dense-row dense-row--head");
    ["日", "時限", "授業", "区分", "担当 / 教室"].forEach((label) => head.append(el("span", "", label)));
    table.append(head);
    entries
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.entry.period - b.entry.period || entryTitle(a.entry).localeCompare(entryTitle(b.entry), "ja"))
      .forEach(({ entry, dateKey }) => {
        const row = el("div", `dense-row dense-row--${cardTone(entry)}`);
        row.append(
          el("span", "dense-row__day", DAYS[(parseDate(dateKey).getDay() + 6) % 7]),
          el("span", "dense-row__period", `${entry.period}`),
        );
        const title = entry.courseId ? el("a", "dense-row__title", entryTitle(entry)) : el("span", "dense-row__title", entryTitle(entry));
        if (entry.courseId) title.href = detailHref(entry);
        row.append(title, el("span", "dense-row__type", courseType(entry)), el("span", "dense-row__meta", `${entry.instructors?.[0] || "担当未確認"} / ${entry.rooms?.[0] || "教室未確認"}`));
        table.append(row);
      });
    root.append(table);
    return root;
  }

  function renderConceptD() {
    const root = el("section", "prototype concept-d");
    const dates = state.view === "week" ? weekDates() : [state.date];
    const calendar = el("div", "calendar-layout");
    calendar.style.setProperty("--day-count", String(dates.length));
    calendar.append(el("div", "calendar-layout__corner", "時刻"));
    dates.forEach((dateKey) => {
      const dayHead = el("div", "calendar-layout__day");
      dayHead.append(el("strong", "", DAYS[(parseDate(dateKey).getDay() + 6) % 7]), el("span", "", dateLabel(dateKey, false)));
      calendar.append(dayHead);
    });
    for (let period = 1; period <= 4; period += 1) {
      const time = state.periods[String(period)];
      const timeLabel = el("div", "calendar-layout__time");
      timeLabel.append(el("strong", "", time?.start || `${period}限`), el("span", "", time?.end || ""));
      calendar.append(timeLabel);
      dates.forEach((dateKey) => {
        const lane = el("div", "calendar-layout__lane");
        const entries = entriesForSlot(dateKey, period);
        if (!entries.length) lane.append(makeEmpty(""));
        entries.forEach((entry) => {
          const block = makeCourseCard(entry, dateKey, { compact: true });
          block.classList.add("calendar-block");
          lane.append(block);
        });
        calendar.append(lane);
      });
    }
    root.append(calendar);
    return root;
  }

  function renderConceptE() {
    const root = el("section", "prototype concept-e");
    const dates = state.view === "week" ? weekDates() : [state.date];
    const board = el("div", "board");
    board.style.setProperty("--day-count", String(dates.length));
    dates.forEach((dateKey) => {
      const column = el("section", "board-column");
      const head = el("header", "board-column__header");
      head.append(el("strong", "", DAYS[(parseDate(dateKey).getDay() + 6) % 7]), el("span", "", `${dateLabel(dateKey, false)}・${entriesForDate(dateKey).length}件`));
      column.append(head);
      for (let period = 1; period <= 4; period += 1) {
        const group = el("section", "board-group");
        const groupHead = el("h4", "board-group__title", `${period}限`);
        const time = state.periods[String(period)];
        groupHead.append(el("span", "", time ? `${time.start}–${time.end}` : ""));
        group.append(groupHead);
        const entries = entriesForSlot(dateKey, period);
        if (!entries.length) group.append(makeEmpty("空き"));
        else entries.forEach((entry) => group.append(makeCourseCard(entry, dateKey, { compact: true })));
        column.append(group);
      }
      board.append(column);
    });
    root.append(board);
    return root;
  }

  function renderConceptF() {
    const root = el("section", "prototype concept-f");
    const dates = weekDates();
    let selected = dates.includes(state.date) ? state.date : dates[0];
    const split = el("div", "split-layout");
    const nav = el("nav", "split-nav");
    nav.setAttribute("aria-label", "曜日を選択");
    dates.forEach((dateKey) => {
      const button = el("button", "split-nav__day");
      button.type = "button";
      button.dataset.splitDate = dateKey;
      button.setAttribute("aria-pressed", String(dateKey === selected));
      button.append(el("strong", "", LONG_DAYS[(parseDate(dateKey).getDay() + 6) % 7]), el("span", "", `${entriesForDate(dateKey).length}件`));
      nav.append(button);
    });

    const center = el("section", "split-main");
    const renderSelectedDay = () => {
      center.replaceChildren();
      center.append(el("h3", "split-main__title", dateLabel(selected)));
      for (let period = 1; period <= 4; period += 1) {
        const section = el("section", "split-period");
        section.append(makePeriodHeading(period));
        const cards = el("div", "split-period__cards");
        const entries = entriesForSlot(selected, period);
        if (!entries.length) cards.append(makeEmpty());
        else entries.forEach((entry) => cards.append(makeCourseCard(entry, selected)));
        section.append(cards);
        center.append(section);
      }
    };
    renderSelectedDay();

    const aside = el("aside", "split-overview");
    aside.append(el("h3", "split-overview__title", "1週間の密度"));
    dates.forEach((dateKey) => {
      const row = el("div", "split-overview__row");
      row.append(el("span", "", DAYS[(parseDate(dateKey).getDay() + 6) % 7]));
      const cells = el("div", "split-overview__cells");
      for (let period = 1; period <= 4; period += 1) {
        const count = entriesForSlot(dateKey, period).length;
        const cell = el("button", `heat-cell heat-cell--${Math.min(count, 4)}`, String(count || "–"));
        cell.type = "button";
        cell.dataset.splitDate = dateKey;
        cell.title = `${dateLabel(dateKey)} ${period}限：${count}件`;
        cells.append(cell);
      }
      row.append(cells);
      aside.append(row);
    });

    split.append(nav, center, aside);
    split.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-split-date]");
      if (!trigger) return;
      selected = trigger.dataset.splitDate;
      state.date = selected;
      split.querySelectorAll(".split-nav__day").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.splitDate === selected)));
      renderSelectedDay();
      updateUrl();
    });
    root.append(split);
    return root;
  }

  function renderConceptG() {
    const root = el("section", "prototype concept-g");
    const dates = state.view === "week" ? weekDates() : [state.date];
    const routes = el("div", "route-map");
    dates.forEach((dateKey) => {
      const route = el("section", "route-day");
      const head = el("header", "route-day__header");
      head.append(el("strong", "", LONG_DAYS[(parseDate(dateKey).getDay() + 6) % 7]), el("span", "", dateLabel(dateKey, false)));
      route.append(head);
      const track = el("div", "route-track");
      for (let period = 1; period <= 4; period += 1) {
        const stop = el("section", "route-stop");
        const marker = el("div", "route-stop__marker");
        marker.append(el("span", "", String(period)), el("small", "", "限"));
        const content = el("div", "route-stop__content");
        const entries = entriesForSlot(dateKey, period);
        if (!entries.length) content.append(makeEmpty("空き時間"));
        else entries.forEach((entry) => content.append(makeCourseCard(entry, dateKey, { compact: true })));
        stop.append(marker, content);
        track.append(stop);
      }
      route.append(track);
      routes.append(route);
    });
    root.append(routes);
    return root;
  }

  function renderConceptH() {
    const root = el("section", "prototype concept-h");
    const dates = weekDates();
    let selectedDate = dates.includes(state.date) ? state.date : dates[0];
    let selectedPeriod = state.focusPeriod;
    const focus = el("div", "focus-layout");
    const map = el("section", "focus-map");
    map.append(el("h3", "focus-map__title", "週のミニマップ"));
    const grid = el("div", "focus-map__grid");
    grid.append(el("span", "focus-map__corner", ""));
    dates.forEach((dateKey) => grid.append(el("strong", "focus-map__day", DAYS[(parseDate(dateKey).getDay() + 6) % 7])));
    for (let period = 1; period <= 4; period += 1) {
      grid.append(el("strong", "focus-map__period", `${period}`));
      dates.forEach((dateKey) => {
        const count = entriesForSlot(dateKey, period).length;
        const button = el("button", `focus-map__cell heat-cell--${Math.min(count, 4)}`);
        button.type = "button";
        button.dataset.focusDate = dateKey;
        button.dataset.focusPeriod = String(period);
        button.setAttribute("aria-pressed", String(dateKey === selectedDate && period === selectedPeriod));
        button.setAttribute("aria-label", `${dateLabel(dateKey)} ${period}限、${count}件`);
        button.append(el("span", "", String(count || "–")));
        grid.append(button);
      });
    }
    map.append(grid);

    const detail = el("section", "focus-detail");
    const renderFocus = () => {
      detail.replaceChildren();
      detail.append(el("span", "focus-detail__eyebrow", `${LONG_DAYS[(parseDate(selectedDate).getDay() + 6) % 7]} / ${selectedPeriod}限`));
      detail.append(el("h3", "focus-detail__title", `${dateLabel(selectedDate, false)}の授業`));
      const time = state.periods[String(selectedPeriod)];
      detail.append(el("p", "focus-detail__time", time ? `${time.start}–${time.end}` : ""));
      const cards = el("div", "focus-detail__cards");
      const entries = entriesForSlot(selectedDate, selectedPeriod);
      if (!entries.length) cards.append(makeEmpty("この時間は空いています"));
      else entries.forEach((entry) => cards.append(makeCourseCard(entry, selectedDate)));
      detail.append(cards);
      grid.querySelectorAll(".focus-map__cell").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.focusDate === selectedDate && Number(button.dataset.focusPeriod) === selectedPeriod));
      });
    };
    renderFocus();
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-focus-date]");
      if (!button) return;
      selectedDate = button.dataset.focusDate;
      selectedPeriod = Number(button.dataset.focusPeriod);
      state.date = selectedDate;
      state.focusPeriod = selectedPeriod;
      renderFocus();
      updateUrl();
    });
    focus.append(map, detail);
    root.append(focus);
    return root;
  }

  const renderers = {
    A: renderConceptA,
    B: renderConceptB,
    C: renderConceptC,
    D: renderConceptD,
    E: renderConceptE,
    F: renderConceptF,
    G: renderConceptG,
    H: renderConceptH,
  };

  function renderTabs() {
    ui.tabs.replaceChildren();
    Object.entries(CONCEPTS).forEach(([key, concept]) => {
      const button = el("button", "concept-tab");
      button.type = "button";
      button.role = "tab";
      button.dataset.concept = key;
      button.setAttribute("aria-selected", String(key === state.concept));
      button.append(el("span", "concept-tab__key", key), el("span", "concept-tab__name", concept.name));
      ui.tabs.append(button);
    });
  }

  function renderIntro() {
    const concept = CONCEPTS[state.concept];
    ui.kicker.textContent = `${state.concept} / ${concept.short.toUpperCase()}`;
    ui.title.textContent = concept.name;
    ui.description.textContent = concept.description;
    ui.strength.textContent = concept.strength;
    ui.risk.textContent = concept.risk;
  }

  function renderControls() {
    ui.school.setAttribute("aria-pressed", String(state.mode === "school"));
    ui.personal.setAttribute("aria-pressed", String(state.mode === "personal"));
    ui.day.setAttribute("aria-pressed", String(state.view === "day"));
    ui.week.setAttribute("aria-pressed", String(state.view === "week"));
    ui.comparisonToggle.setAttribute("aria-pressed", String(state.compare));
    ui.comparisonToggle.textContent = state.compare ? "1案の表示に戻る" : "8案を一覧比較";
    const current = parseDate(state.date);
    ui.reset.textContent = state.view === "week"
      ? `${current.getMonth() + 1}月${parseDate(startOfWeek(state.date)).getDate()}日の週`
      : dateLabel(state.date, false);
  }

  function renderStage() {
    document.body.dataset.concept = state.concept;
    document.body.dataset.view = state.view;
    document.body.dataset.mode = state.mode;
    const renderer = renderers[state.concept];
    ui.stage.replaceChildren(renderer());
    const count = (state.view === "week" ? weekDates() : [state.date])
      .reduce((sum, dateKey) => sum + entriesForDate(dateKey).length, 0);
    ui.status.textContent = `${state.mode === "personal" ? "保存済み個人時間割" : "学校全体"}・${state.view === "week" ? "週間" : "日"}表示・${count}件を表示`;
  }

  function comparisonUrl(concept) {
    const query = new URLSearchParams({
      concept,
      view: state.view,
      mode: state.mode,
      date: state.date,
      embed: "1",
    });
    return `index.html?${query.toString()}`;
  }

  function renderComparison() {
    ui.comparisonPanel.hidden = !state.compare;
    ui.stage.hidden = state.compare;
    document.querySelector(".concept-intro").hidden = state.compare;
    if (!state.compare) return;
    ui.comparisonGrid.replaceChildren();
    Object.entries(CONCEPTS).forEach(([key, concept]) => {
      const frame = el("article", "comparison-frame");
      const heading = el("header", "comparison-frame__heading");
      heading.append(el("strong", "", `${key}案`), el("span", "", concept.name));
      const iframe = document.createElement("iframe");
      iframe.title = `${key}案 ${concept.name}`;
      iframe.loading = "lazy";
      iframe.src = comparisonUrl(key);
      frame.append(heading, iframe);
      ui.comparisonGrid.append(frame);
    });
  }

  function updateUrl() {
    const next = new URL(location.href);
    next.searchParams.set("concept", state.concept);
    next.searchParams.set("view", state.view);
    next.searchParams.set("mode", state.mode);
    next.searchParams.set("date", state.date);
    next.searchParams.set("period", String(state.focusPeriod));
    if (state.compare) next.searchParams.set("compare", "1");
    else next.searchParams.delete("compare");
    history.replaceState(null, "", next);
  }

  function render() {
    renderTabs();
    renderIntro();
    renderControls();
    renderStage();
    renderComparison();
    updateUrl();
  }

  function bindEvents() {
    ui.tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-concept]");
      if (!button || !CONCEPTS[button.dataset.concept]) return;
      state.concept = button.dataset.concept;
      state.compare = false;
      render();
      document.querySelector(`[data-concept="${state.concept}"]`)?.focus();
    });
    ui.school.addEventListener("click", () => { state.mode = "school"; render(); });
    ui.personal.addEventListener("click", () => { state.mode = "personal"; render(); });
    ui.day.addEventListener("click", () => { state.view = "day"; render(); });
    ui.week.addEventListener("click", () => { state.view = "week"; render(); });
    ui.previous.addEventListener("click", () => {
      state.date = addDays(state.date, state.view === "week" ? -7 : -1);
      render();
    });
    ui.next.addEventListener("click", () => {
      state.date = addDays(state.date, state.view === "week" ? 7 : 1);
      render();
    });
    ui.reset.addEventListener("click", () => { state.date = DEFAULT_DATE; render(); });
    ui.comparisonToggle.addEventListener("click", () => { state.compare = !state.compare; render(); });
  }

  async function loadData() {
    const [coursesResponse, timetableResponse, periodsResponse] = await Promise.all([
      fetch(`${DATA_BASE}/courses.json`),
      fetch(`${DATA_BASE}/timetable/2026-11.json`),
      fetch(`${DATA_BASE}/timetable/periods.json`),
    ]);
    if (![coursesResponse, timetableResponse, periodsResponse].every((response) => response.ok)) {
      throw new Error("比較用デモデータを読み込めませんでした。");
    }
    const [coursesDocument, timetableDocument, periodsDocument] = await Promise.all([
      coursesResponse.json(),
      timetableResponse.json(),
      periodsResponse.json(),
    ]);
    state.courses = new Map(coursesDocument.courses.map((course) => [course.id, course]));
    state.days = timetableDocument.days;
    state.periods = periodsDocument.periods;
  }

  async function initialize() {
    if (state.embed) document.body.classList.add("is-embedded");
    bindEvents();
    try {
      await loadData();
      render();
    } catch (error) {
      ui.stage.replaceChildren(el("div", "error-state", error.message));
      ui.status.textContent = "読み込みに失敗しました";
      console.error(error);
    }
  }

  initialize();
})();
