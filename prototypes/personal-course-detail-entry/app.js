(() => {
  "use strict";

  const DAY_NAMES = ["月", "火", "水", "木", "金"];
  const VARIANTS = {
    a: {
      label: "A案",
      description: "情報アイコン方式：44pxの操作領域にⓘを置き、見た目の情報量を抑えます。",
    },
    b: {
      label: "B案",
      description: "「詳細」ボタン方式：操作目的を文字で明示し、初見の分かりやすさを優先します。",
    },
    c: {
      label: "C案",
      description: "授業名リンク方式：追加部品を置かず、授業名を詳細操作として見せます。",
    },
    compare: {
      label: "比較表示",
      description: "同じ3枚のカードをA・B・Cで並べ、タイトル幅と操作密度を直接比較します。",
    },
  };

  const candidateDefinitions = [
    { id: "demo-digital-foundations", initial: "required", slots: [["月", 3], ["月", 4]] },
    { id: "demo-visual-design", initial: "selected", slots: [["月", 3]] },
    { id: "demo-required-overlap", initial: "blocked", slots: [["月", 3]] },
    { id: "demo-long-title", initial: "available", slots: [["月", 3], ["木", 3]] },
    { id: "demo-expanded-g1-01", initial: "available", slots: [["月", 3], ["火", 2]] },
    { id: "demo-cross-media", initial: "selected", slots: [["月", 3], ["火", 2]] },
    { id: "demo-web-creative", initial: "available", slots: [["月", 3], ["木", 3]] },
    { id: "demo-expanded-g1-24", initial: "available", slots: [["月", 3], ["木", 3]] },
    { id: "demo-game-prototyping", initial: "available", slots: [["火", 2]] },
    { id: "demo-expanded-g1-25", initial: "available", slots: [["木", 3]] },
  ];
  const comparisonIds = ["demo-expanded-g1-01", "demo-visual-design", "demo-long-title"];

  const state = {
    variant: "a",
    day: "月",
    period: 3,
    courses: new Map(),
    selected: new Set(candidateDefinitions.filter((item) => item.initial === "selected").map((item) => item.id)),
    returnFocus: null,
  };

  const candidateArea = document.querySelector("#candidate-area");
  const candidateCount = document.querySelector("#candidate-count");
  const slotHeading = document.querySelector("#slot-heading");
  const interactionStatus = document.querySelector("#interaction-status");
  const selectedSummary = document.querySelector("#selected-summary");
  const weeklySummary = document.querySelector("#weekly-summary");
  const variantDescription = document.querySelector("#variant-description");
  const detailDialog = document.querySelector("#course-detail-dialog");
  const detailTitle = document.querySelector("#detail-title");
  const detailContent = document.querySelector("#detail-content");

  const createSvg = (name) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const add = (tag, attributes) => {
      const child = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attributes).forEach(([key, value]) => child.setAttribute(key, value));
      svg.append(child);
    };
    if (name === "info") {
      add("circle", { cx: "12", cy: "12", r: "9" });
      add("path", { d: "M12 11v5" });
      add("path", { d: "M12 8h.01" });
    } else if (name === "circle") {
      add("circle", { cx: "12", cy: "12", r: "9" });
    } else if (name === "check-circle") {
      add("circle", { cx: "12", cy: "12", r: "9" });
      add("path", { d: "m8 12 2.5 2.5L16 9" });
    } else if (name === "lock-keyhole") {
      add("rect", { x: "4", y: "10", width: "16", height: "11", rx: "2" });
      add("path", { d: "M8 10V7a4 4 0 0 1 8 0v3" });
      add("path", { d: "M12 14v3" });
    } else if (name === "calendar-x") {
      add("rect", { x: "3", y: "4", width: "18", height: "17", rx: "2" });
      add("path", { d: "M8 2v4M16 2v4M3 9h18" });
      add("path", { d: "m9.5 13.5 5 5m0-5-5 5" });
    }
    return svg;
  };

  const definitionFor = (courseId) => candidateDefinitions.find((item) => item.id === courseId);
  const courseFor = (courseId) => state.courses.get(courseId) || { id: courseId, title: courseId };
  const stateFor = (definition) => {
    if (definition.initial === "required") return "required";
    if (definition.initial === "blocked") return "blocked";
    return state.selected.has(definition.id) ? "selected" : "available";
  };
  const occupancyLabel = (definition) => definition.slots.map(([day, period]) => `${day}曜${period}限`).join(" / ");
  const stateLabel = (cardState) => ({
    required: "必修・解除不可",
    selected: "選択済み",
    blocked: "時間競合",
    available: "未選択",
  }[cardState]);
  const stateIcon = (cardState) => ({
    required: "lock-keyhole",
    selected: "check-circle",
    blocked: "calendar-x",
    available: "circle",
  }[cardState]);

  const showStatus = (message) => {
    interactionStatus.textContent = message;
  };

  const addDetailRow = (label, value) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    detailContent.append(term, detail);
  };

  const openDetail = (courseId, trigger, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    const course = courseFor(courseId);
    state.returnFocus = trigger;
    detailTitle.textContent = course.title || courseId;
    detailContent.replaceChildren();
    addDetailRow("授業概要", course.summary || "比較用に用意した仮の授業概要です。");
    addDetailRow("担当講師", course.instructor || "未確認");
    addDetailRow("単位数", Number.isFinite(course.credits) ? `${course.credits}単位` : "未確認");
    addDetailRow("到達目標", course.learningGoals || "テーマを理解し、演習や制作で基礎的な成果物を作成できることを目指します（試作用仮情報）。");
    addDetailRow("授業の進め方", course.classFlow || `${course.classStyle || "講義・演習"}を中心に進めます（試作用仮情報）。`);
    detailDialog.showModal();
    document.querySelector("#detail-close-icon").focus();
    showStatus(`${course.title || courseId}の詳細を開きました。履修状態は変わっていません。`);
  };

  const toggleSelection = (definition) => {
    const cardState = stateFor(definition);
    const course = courseFor(definition.id);
    if (cardState === "required") {
      showStatus(`${course.title}は必修のため、選択を解除できません。`);
      return;
    }
    if (cardState === "blocked") {
      showStatus(`${course.title}は選択中の授業と時間が重複しています。詳細は別操作から確認できます。`);
      return;
    }
    if (state.selected.has(definition.id)) {
      state.selected.delete(definition.id);
      showStatus(`${course.title}の選択を解除しました。`);
    } else {
      state.selected.add(definition.id);
      showStatus(`${course.title}を選択しました。`);
    }
    renderCards();
    renderSummary();
  };

  const detailControl = (variant, definition, titleElement) => {
    const course = courseFor(definition.id);
    if (variant === "c") {
      const button = document.createElement("button");
      button.className = "prototype-course-card__title-button";
      button.type = "button";
      button.textContent = course.title;
      button.setAttribute("aria-label", `${course.title}の授業詳細を開く`);
      button.addEventListener("click", (event) => openDetail(definition.id, button, event));
      titleElement.append(button);
      return null;
    }
    titleElement.textContent = course.title;
    const button = document.createElement("button");
    button.className = "prototype-course-card__detail";
    button.type = "button";
    button.setAttribute("aria-label", `${course.title}の授業詳細を開く`);
    button.title = "授業詳細を開く";
    if (variant === "a") button.append(createSvg("info"));
    else button.textContent = "詳細";
    button.addEventListener("click", (event) => openDetail(definition.id, button, event));
    return button;
  };

  const courseCard = (definition, variant) => {
    const course = courseFor(definition.id);
    const cardState = stateFor(definition);
    const article = document.createElement("article");
    article.className = `personal-wizard-card prototype-course-card prototype-course-card--${variant} is-${cardState}`;
    article.dataset.courseId = definition.id;

    const selectButton = document.createElement("button");
    selectButton.className = "prototype-course-card__select";
    selectButton.type = "button";
    selectButton.setAttribute("aria-label", `${course.title}。${stateLabel(cardState)}。カード本体で履修状態を変更`);
    selectButton.setAttribute("aria-pressed", String(cardState === "selected" || cardState === "required"));
    if (cardState === "required") selectButton.setAttribute("aria-disabled", "true");
    if (cardState === "blocked") selectButton.setAttribute("aria-haspopup", "dialog");
    selectButton.addEventListener("click", () => toggleSelection(definition));

    const content = document.createElement("div");
    content.className = "prototype-course-card__content";
    const titleRow = document.createElement("div");
    titleRow.className = "personal-wizard-card__title-row";
    const title = document.createElement("strong");
    title.className = "personal-wizard-card__title";
    const detail = detailControl(variant, definition, title);
    const actions = document.createElement("span");
    actions.className = "prototype-course-card__actions";
    if (detail) actions.append(detail);
    const mark = document.createElement("span");
    mark.className = "personal-wizard-card__state";
    mark.append(createSvg(stateIcon(cardState)));
    if (cardState === "required") {
      const requiredLabel = document.createElement("span");
      requiredLabel.className = "personal-wizard-card__state-label";
      requiredLabel.textContent = "必修";
      mark.append(requiredLabel);
    }
    actions.append(mark);
    titleRow.append(title, actions);

    const details = document.createElement("span");
    details.className = "personal-wizard-card__details";
    const facts = [occupancyLabel(definition)];
    if (course.instructor) facts.push(`講師: ${course.instructor}`);
    if (Number.isFinite(course.credits)) facts.push(`${course.credits}単位`);
    details.textContent = facts.join(" / ");
    content.append(titleRow, details);
    article.append(selectButton, content);
    return article;
  };

  const currentCandidates = () => candidateDefinitions.filter((definition) => (
    definition.slots.some(([day, period]) => day === state.day && period === state.period)
  ));

  const renderComparison = () => {
    const grid = document.createElement("div");
    grid.className = "prototype-compare-grid";
    ["a", "b", "c"].forEach((variant) => {
      const column = document.createElement("section");
      column.className = "prototype-compare-column";
      const heading = document.createElement("h4");
      heading.textContent = `${variant.toUpperCase()}案：${variant === "a" ? "情報アイコン" : variant === "b" ? "「詳細」ボタン" : "授業名リンク"}`;
      const description = document.createElement("p");
      description.textContent = VARIANTS[variant].description;
      column.append(heading, description);
      comparisonIds.forEach((courseId) => column.append(courseCard(definitionFor(courseId), variant)));
      grid.append(column);
    });
    candidateArea.append(grid);
    candidateCount.textContent = "同じ3枚 × 3案";
  };

  const renderCards = () => {
    candidateArea.replaceChildren();
    slotHeading.textContent = `${state.day}曜日・${state.period}限`;
    if (state.variant === "compare") {
      renderComparison();
      return;
    }
    const candidates = currentCandidates();
    candidateCount.textContent = `${candidates.length}件の候補`;
    if (!candidates.length) {
      const empty = document.createElement("p");
      empty.className = "personal-wizard-empty";
      empty.textContent = "この比較用シナリオには候補がありません。月曜3限を選ぶと全状態を確認できます。";
      candidateArea.append(empty);
      return;
    }
    candidates.forEach((definition) => candidateArea.append(courseCard(definition, state.variant)));
  };

  const renderSummary = () => {
    weeklySummary.replaceChildren();
    let courseCount = 0;
    let slotCount = 0;
    DAY_NAMES.forEach((day) => {
      const section = document.createElement("section");
      section.className = "personal-weekly-day";
      const heading = document.createElement("h4");
      heading.textContent = `${day}曜日`;
      section.append(heading);
      const rows = [];
      candidateDefinitions.forEach((definition) => {
        if (definition.initial !== "required" && !state.selected.has(definition.id)) return;
        definition.slots.filter(([slotDay]) => slotDay === day).forEach(([, period]) => rows.push({ definition, period }));
      });
      rows.sort((left, right) => left.period - right.period);
      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "personal-weekly-empty";
        empty.textContent = "選択なし";
        section.append(empty);
      } else {
        rows.forEach(({ definition, period }) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "personal-weekly-item";
          row.innerHTML = `<span>${period}限</span><span>${courseFor(definition.id).title}</span>`;
          row.addEventListener("click", () => {
            state.day = day;
            state.period = period;
            syncSlotTabs();
            renderCards();
            showStatus(`${day}曜日・${period}限へ移動しました。`);
          });
          section.append(row);
          slotCount += 1;
        });
      }
      weeklySummary.append(section);
    });
    courseCount = new Set([
      ...candidateDefinitions.filter((item) => item.initial === "required").map((item) => item.id),
      ...state.selected,
    ]).size;
    selectedSummary.textContent = `${courseCount}科目・${slotCount}コマ`;
  };

  const syncVariantTabs = () => {
    document.querySelectorAll("[data-variant]").forEach((button) => {
      const selected = button.dataset.variant === state.variant;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    variantDescription.textContent = VARIANTS[state.variant].description;
  };

  const syncSlotTabs = () => {
    document.querySelectorAll("[data-day]").forEach((button) => {
      const selected = button.dataset.day === state.day;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[data-period]").forEach((button) => {
      const selected = Number(button.dataset.period) === state.period;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  };

  const bindRovingTabs = (selector, values, currentValue, selectValue) => {
    document.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let current = currentValue();
        let index = values.indexOf(current);
        if (event.key === "Home") index = 0;
        else if (event.key === "End") index = values.length - 1;
        else index = (index + (event.key === "ArrowRight" ? 1 : -1) + values.length) % values.length;
        selectValue(values[index]);
        document.querySelector(`${selector}[aria-selected="true"]`)?.focus();
      });
    });
  };

  const initialize = async () => {
    const response = await fetch("../../data/demo/courses.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Demo courses request failed: ${response.status}`);
    const documentData = await response.json();
    documentData.courses.forEach((course) => state.courses.set(course.id, course));
    const missingIds = candidateDefinitions.filter((item) => !state.courses.has(item.id)).map((item) => item.id);
    if (missingIds.length) throw new Error(`Missing demo courses: ${missingIds.join(", ")}`);

    const requestedVariant = new URLSearchParams(window.location.search).get("variant");
    if (requestedVariant && Object.hasOwn(VARIANTS, requestedVariant)) {
      state.variant = requestedVariant;
    }

    document.querySelectorAll("[data-variant]").forEach((button) => {
      button.addEventListener("click", () => {
        state.variant = button.dataset.variant;
        syncVariantTabs();
        renderCards();
        showStatus(`${VARIANTS[state.variant].label}へ切り替えました。履修状態は維持されています。`);
      });
    });
    document.querySelectorAll("[data-day]").forEach((button) => {
      button.addEventListener("click", () => {
        state.day = button.dataset.day;
        syncSlotTabs();
        renderCards();
        showStatus(`${state.day}曜日へ切り替えました。`);
      });
    });
    document.querySelectorAll("[data-period]").forEach((button) => {
      button.addEventListener("click", () => {
        state.period = Number(button.dataset.period);
        syncSlotTabs();
        renderCards();
        showStatus(`${state.period}限へ切り替えました。`);
      });
    });

    bindRovingTabs("[data-variant]", ["a", "b", "c", "compare"], () => state.variant, (value) => {
      state.variant = value;
      syncVariantTabs();
      renderCards();
    });
    bindRovingTabs("[data-day]", DAY_NAMES, () => state.day, (value) => {
      state.day = value;
      syncSlotTabs();
      renderCards();
    });
    bindRovingTabs("[data-period]", [1, 2, 3, 4], () => state.period, (value) => {
      state.period = value;
      syncSlotTabs();
      renderCards();
    });

    document.querySelector("#reset-selection").addEventListener("click", () => {
      state.selected = new Set(candidateDefinitions.filter((item) => item.initial === "selected").map((item) => item.id));
      renderCards();
      renderSummary();
      showStatus("選択状態を比較用の初期状態へ戻しました。");
    });
    const closeDetail = () => detailDialog.close("close");
    document.querySelector("#detail-close").addEventListener("click", closeDetail);
    document.querySelector("#detail-close-icon").addEventListener("click", closeDetail);
    detailDialog.addEventListener("close", () => {
      const focus = state.returnFocus;
      state.returnFocus = null;
      focus?.focus({ preventScroll: true });
      showStatus("授業詳細を閉じました。曜日・時限と履修状態は維持されています。");
    });

    syncVariantTabs();
    syncSlotTabs();
    renderCards();
    renderSummary();
  };

  initialize().catch((error) => {
    console.error(error);
    candidateArea.innerHTML = '<p class="personal-wizard-empty">比較用データを読み込めませんでした。HTTPサーバーから開いてください。</p>';
    showStatus("比較用データの読み込みに失敗しました。");
  });
})();
