(() => {
  "use strict";

  const DATA_BASE = "../../data/demo";
  const DEFAULT_DATE = "2026-11-02";
  const DAY_NAMES = ["月", "火", "水", "木", "金"];
  const LONG_DAY_NAMES = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"];
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

  const THEMES = {
    a: {
      code: "A",
      name: "現行デザイン改良型",
      file: "themes/a-current.css",
      description: "現行ClassViewの角を抑えた業務的な骨格を保ち、階層・余白・青の使い方を整理した案。",
      axis: "堅実・明快・連続性",
      feature: "直線的なカード、紺と青、控えめな影",
    },
    b: {
      code: "B",
      name: "ミニマル",
      file: "themes/b-minimal.css",
      description: "装飾を削り、広い余白と細い罫線、読みやすいサンセリフで授業情報そのものを主役にする案。",
      axis: "余白・静けさ・タイポグラフィー",
      feature: "白地、極細線、ラベルを抑えたカード",
    },
    c: {
      code: "C",
      name: "アカデミック・エディトリアル",
      file: "themes/c-academic.css",
      description: "大学案内や研究紀要を思わせるセリフ見出し、生成りの紙面、深い臙脂と紺の罫線を使う案。",
      axis: "知性・信頼・出版物",
      feature: "明朝見出し、二重罫、紙面調の背景",
    },
    d: {
      code: "D",
      name: "モダン・テクノロジー",
      file: "themes/d-technology.css",
      description: "濃色の面、シアンのアクセント、細い発光線とモノスペースの補助情報で技術分野らしさを出す案。",
      axis: "精密・高コントラスト・先進性",
      feature: "ダーク基調、シアン、角を切ったカード",
    },
    e: {
      code: "E",
      name: "ソフト・フレンドリー",
      file: "themes/e-friendly.css",
      description: "淡い空色とラベンダー、丸み、柔らかな影を使い、毎日開いても緊張しにくい雰囲気にする案。",
      axis: "親しみ・安心・穏やかさ",
      feature: "大きめ角丸、パステル、やさしい影",
    },
    f: {
      code: "F",
      name: "高密度・実用型",
      file: "themes/f-dense.css",
      description: "余白と装飾を圧縮し、罫線と文字サイズを最適化して1画面の情報量を増やす実用案。",
      axis: "効率・一覧性・業務性",
      feature: "小さな文字、密な行間、強いグリッド",
    },
    g: {
      code: "G",
      name: "クラシック・スクール",
      file: "themes/g-school.css",
      description: "紙の時間割や校内システムを思わせる青緑の見出し、表罫線、明瞭なボタンを使う案。",
      axis: "学校らしさ・安定・馴染み",
      feature: "表組み、青緑、掲示物のような見出し",
    },
    h: {
      code: "H",
      name: "スイス・シグナル",
      file: "themes/h-signal.css",
      description: "強いグリッド、太いタイポグラフィー、コバルトとコーラルの信号色で情報の優先度を示す自由提案。",
      axis: "視線誘導・大胆さ・記憶性",
      feature: "太字、非対称な装飾、高彩度アクセント",
    },
  };

  const params = new URLSearchParams(location.search);
  const state = {
    theme: THEMES[params.get("theme")] ? params.get("theme") : "a",
    mode: params.get("mode") === "school" ? "school" : "personal",
    view: params.get("view") === "day" ? "day" : "week",
    date: isDateKey(params.get("date")) ? params.get("date") : DEFAULT_DATE,
    colorMode: params.get("color") === "dark" ? "dark" : "light",
    compare: params.get("compare") === "1",
    compareLeft: THEMES[params.get("left")] ? params.get("left") : "a",
    compareRight: THEMES[params.get("right")] ? params.get("right") : "e",
    embed: params.get("embed") === "1",
    courses: new Map(),
    days: {},
    periods: {},
  };

  const ui = {
    themeStylesheet: document.querySelector("#theme-stylesheet"),
    tabs: document.querySelector("#theme-tabs"),
    code: document.querySelector("#theme-code"),
    name: document.querySelector("#theme-name"),
    description: document.querySelector("#theme-description"),
    axis: document.querySelector("#theme-axis"),
    feature: document.querySelector("#theme-feature"),
    canvas: document.querySelector("#theme-canvas"),
    root: document.querySelector("#timetable-root"),
    heading: document.querySelector("#timetable-heading"),
    modeLabel: document.querySelector("#timetable-mode-label"),
    count: document.querySelector("#entry-count"),
    personalStatus: document.querySelector("#personal-status"),
    personal: document.querySelector("#mode-personal"),
    school: document.querySelector("#mode-school"),
    day: document.querySelector("#view-day"),
    week: document.querySelector("#view-week"),
    previous: document.querySelector("#date-previous"),
    reset: document.querySelector("#date-reset"),
    next: document.querySelector("#date-next"),
    color: document.querySelector("#color-mode-toggle"),
    compareToggle: document.querySelector("#compare-toggle"),
    compareControls: document.querySelector("#compare-controls"),
    compareLeft: document.querySelector("#compare-left"),
    compareRight: document.querySelector("#compare-right"),
    singlePreview: document.querySelector("#single-preview"),
    comparePreview: document.querySelector("#compare-preview"),
    compareLeftFrame: document.querySelector("#compare-left-frame"),
    compareRightFrame: document.querySelector("#compare-right-frame"),
    compareLeftHeading: document.querySelector("#compare-left-heading"),
    compareRightHeading: document.querySelector("#compare-right-heading"),
  };

  function isDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function parseDate(dateKey) {
    return new Date(`${dateKey}T12:00:00`);
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(dateKey, amount) {
    const date = parseDate(dateKey);
    date.setDate(date.getDate() + amount);
    return formatDateKey(date);
  }

  function startOfWeek(dateKey) {
    const date = parseDate(dateKey);
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    return formatDateKey(date);
  }

  function weekDates() {
    const start = startOfWeek(state.date);
    return Array.from({ length: 5 }, (_, index) => addDays(start, index));
  }

  function dateLabel(dateKey, includeWeekday = true) {
    const date = parseDate(dateKey);
    const base = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    if (!includeWeekday) return base;
    return `${base}${LONG_DAY_NAMES[(date.getDay() + 6) % 7] || ""}`;
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
    return entries.filter((entry) => entry.kind !== "class" || (entry.courseId && PERSONAL_COURSE_IDS.has(entry.courseId)));
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

  function entryType(entry) {
    return courseFor(entry)?.courseType || (entry.kind === "class" ? "区分未確認" : "学校予定");
  }

  function tone(entry) {
    const type = entryType(entry);
    if (type === "必修") return "required";
    if (type === "選択必修") return "select-required";
    if (entry.kind !== "class") return "event";
    return "elective";
  }

  function detailHref(entry) {
    return `../../course.html?id=${encodeURIComponent(entry.courseId)}&demo=1`;
  }

  function makeCard(entry, dateKey) {
    const card = el("article", `lesson-card lesson-card--${tone(entry)}`);
    card.dataset.courseId = entry.courseId || "";
    const head = el("div", "lesson-card__head");
    const title = entry.courseId
      ? el("a", "lesson-card__title", entryTitle(entry))
      : el("span", "lesson-card__title", entryTitle(entry));
    if (entry.courseId) {
      title.href = detailHref(entry);
      title.setAttribute("aria-label", `${entryTitle(entry)}の授業詳細を見る`);
    }
    head.append(title, el("span", `lesson-card__type lesson-card__type--${tone(entry)}`, entryType(entry)));
    const instructor = entry.instructors?.join("・") || courseFor(entry)?.instructor || "担当未確認";
    const room = entry.rooms?.join("・") || "教室未確認";
    card.append(
      head,
      el("p", "lesson-card__meta", `${entry.period}限 / 講師: ${instructor}`),
      el("p", "lesson-card__room", room),
    );
    return card;
  }

  function periodLabel(period) {
    const wrap = el("div", "period-label");
    const time = state.periods[String(period)];
    wrap.append(el("strong", "", `${period}限`), el("span", "", time ? `${time.start}–${time.end}` : ""));
    return wrap;
  }

  function emptySlot(text = "予定なし") {
    return el("div", "empty-slot", text);
  }

  function renderDay() {
    const schedule = el("div", "day-schedule");
    for (let period = 1; period <= 4; period += 1) {
      const row = el("section", "day-period");
      row.append(periodLabel(period));
      const entriesRoot = el("div", "period-entries");
      const entries = entriesForSlot(state.date, period);
      if (!entries.length) entriesRoot.append(emptySlot());
      else entries.forEach((entry) => entriesRoot.append(makeCard(entry, state.date)));
      row.append(entriesRoot);
      schedule.append(row);
    }
    return schedule;
  }

  function renderWeek() {
    const dates = weekDates();
    const scroll = el("div", "week-scroll");
    const table = el("div", "week-table");
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", "週間時間割");
    table.append(el("div", "week-corner", "時限"));
    dates.forEach((dateKey) => {
      const day = el("div", "week-day");
      const date = parseDate(dateKey);
      day.append(el("strong", "", DAY_NAMES[(date.getDay() + 6) % 7]), el("span", "", `${date.getMonth() + 1}/${date.getDate()}`));
      table.append(day);
    });
    for (let period = 1; period <= 4; period += 1) {
      table.append(periodLabel(period));
      dates.forEach((dateKey) => {
        const cell = el("div", "week-cell");
        const entries = entriesForSlot(dateKey, period);
        if (!entries.length) cell.append(emptySlot("空き"));
        else entries.forEach((entry) => cell.append(makeCard(entry, dateKey)));
        table.append(cell);
      });
    }
    scroll.append(table);
    return scroll;
  }

  function renderTimetable() {
    const dates = state.view === "week" ? weekDates() : [state.date];
    const count = dates.reduce((total, dateKey) => total + entriesForDate(dateKey).length, 0);
    ui.modeLabel.textContent = state.mode === "personal" ? "自分の時間割" : "学校全体";
    ui.heading.textContent = state.view === "week"
      ? `${dateLabel(dates[0], false)}からの1週間`
      : dateLabel(state.date);
    ui.count.textContent = `${count}件`;
    ui.personalStatus.textContent = state.mode === "personal"
      ? "1年・2組・2026年度後期の設定"
      : "学校全体の授業を表示しています";
    ui.root.replaceChildren(state.view === "week" ? renderWeek() : renderDay());
    ui.root.setAttribute("aria-busy", "false");
  }

  function renderThemeTabs() {
    ui.tabs.replaceChildren();
    Object.entries(THEMES).forEach(([key, theme]) => {
      const button = el("button", "theme-tab");
      button.type = "button";
      button.role = "tab";
      button.dataset.theme = key;
      button.setAttribute("aria-selected", String(key === state.theme));
      button.append(el("span", "theme-tab__code", theme.code), el("span", "theme-tab__name", theme.name));
      ui.tabs.append(button);
    });
  }

  function applyTheme(nextTheme, updateHistory = true) {
    if (!THEMES[nextTheme]) return;
    state.theme = nextTheme;
    const theme = THEMES[nextTheme];
    ui.themeStylesheet.href = theme.file;
    ui.canvas.dataset.theme = nextTheme;
    ui.code.textContent = `${theme.code} / CSS THEME`;
    ui.name.textContent = theme.name;
    ui.description.textContent = theme.description;
    ui.axis.textContent = theme.axis;
    ui.feature.textContent = theme.feature;
    document.title = `${theme.code} ${theme.name} | ClassView Style Lab`;
    ui.tabs.querySelectorAll("[data-theme]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.theme === nextTheme));
    });
    if (updateHistory) updateUrl();
  }

  function renderControls() {
    ui.personal.setAttribute("aria-pressed", String(state.mode === "personal"));
    ui.school.setAttribute("aria-pressed", String(state.mode === "school"));
    ui.day.setAttribute("aria-pressed", String(state.view === "day"));
    ui.week.setAttribute("aria-pressed", String(state.view === "week"));
    ui.color.setAttribute("aria-pressed", String(state.colorMode === "dark"));
    ui.color.textContent = state.colorMode === "dark" ? "ライト" : "ダーク";
    document.documentElement.dataset.colorMode = state.colorMode;
    const date = parseDate(state.date);
    ui.reset.textContent = state.view === "week" ? `${date.getMonth() + 1}月${parseDate(startOfWeek(state.date)).getDate()}日の週` : `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function frameUrl(theme) {
    const query = new URLSearchParams({
      theme,
      mode: state.mode,
      view: state.view,
      date: state.date,
      color: state.colorMode,
      embed: "1",
    });
    return `index.html?${query.toString()}`;
  }

  function renderCompare() {
    ui.compareControls.hidden = !state.compare;
    ui.singlePreview.hidden = state.compare;
    ui.comparePreview.hidden = !state.compare;
    ui.compareToggle.setAttribute("aria-pressed", String(state.compare));
    ui.compareToggle.textContent = state.compare ? "1案の表示に戻る" : "2案を並べて比較";
    if (!state.compare) return;
    ui.compareLeft.value = state.compareLeft;
    ui.compareRight.value = state.compareRight;
    ui.compareLeftHeading.textContent = `${THEMES[state.compareLeft].code} ${THEMES[state.compareLeft].name}`;
    ui.compareRightHeading.textContent = `${THEMES[state.compareRight].code} ${THEMES[state.compareRight].name}`;
    ui.compareLeftFrame.src = frameUrl(state.compareLeft);
    ui.compareRightFrame.src = frameUrl(state.compareRight);
  }

  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set("theme", state.theme);
    url.searchParams.set("mode", state.mode);
    url.searchParams.set("view", state.view);
    url.searchParams.set("date", state.date);
    url.searchParams.set("color", state.colorMode);
    if (state.compare) {
      url.searchParams.set("compare", "1");
      url.searchParams.set("left", state.compareLeft);
      url.searchParams.set("right", state.compareRight);
    } else {
      url.searchParams.delete("compare");
      url.searchParams.delete("left");
      url.searchParams.delete("right");
    }
    history.replaceState(null, "", url);
  }

  function refresh({ timetable = true } = {}) {
    renderControls();
    if (timetable) renderTimetable();
    renderCompare();
    updateUrl();
  }

  function populateCompareSelects() {
    [ui.compareLeft, ui.compareRight].forEach((select) => {
      select.replaceChildren();
      Object.entries(THEMES).forEach(([key, theme]) => {
        const option = el("option", "", `${theme.code} ${theme.name}`);
        option.value = key;
        select.append(option);
      });
    });
  }

  function bindEvents() {
    ui.tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme]");
      if (!button) return;
      applyTheme(button.dataset.theme);
      button.focus();
    });
    ui.personal.addEventListener("click", () => { state.mode = "personal"; refresh(); });
    ui.school.addEventListener("click", () => { state.mode = "school"; refresh(); });
    ui.day.addEventListener("click", () => { state.view = "day"; refresh(); });
    ui.week.addEventListener("click", () => { state.view = "week"; refresh(); });
    ui.previous.addEventListener("click", () => { state.date = addDays(state.date, state.view === "week" ? -7 : -1); refresh(); });
    ui.next.addEventListener("click", () => { state.date = addDays(state.date, state.view === "week" ? 7 : 1); refresh(); });
    ui.reset.addEventListener("click", () => { state.date = DEFAULT_DATE; refresh(); });
    ui.color.addEventListener("click", () => { state.colorMode = state.colorMode === "dark" ? "light" : "dark"; refresh({ timetable: false }); });
    ui.compareToggle.addEventListener("click", () => { state.compare = !state.compare; refresh({ timetable: false }); });
    ui.compareLeft.addEventListener("change", () => { state.compareLeft = ui.compareLeft.value; refresh({ timetable: false }); });
    ui.compareRight.addEventListener("change", () => { state.compareRight = ui.compareRight.value; refresh({ timetable: false }); });
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
    renderThemeTabs();
    populateCompareSelects();
    bindEvents();
    applyTheme(state.theme, false);
    try {
      await loadData();
      refresh();
    } catch (error) {
      ui.root.replaceChildren(el("p", "loading-state", error.message));
      ui.root.setAttribute("aria-busy", "false");
      console.error(error);
    }
  }

  initialize();
})();
