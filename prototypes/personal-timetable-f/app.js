(() => {
  "use strict";

  const mock = window.PersonalTimetableMock;
  const conflictEngine = window.PersonalTimetableConflict;
  if (!mock || !conflictEngine) throw new Error("Prototype dependencies are unavailable.");
  const pageQuery = new URLSearchParams(window.location.search);

  const scenarioCourses = [
    {
      id: "case-a",
      title: "Python基礎",
      instructor: "佐藤",
      grades: ["3"],
      groups: ["1組"],
      courseType: "選択",
      category: "AI・データ",
      slots: ["mon-1"],
      note: "Case 1 / 3 / 4",
    },
    {
      id: "case-b",
      title: "Webアプリケーション開発総合演習",
      instructor: "鈴木",
      grades: ["3"],
      groups: ["1組"],
      courseType: "選択必修",
      category: "プログラミング・Web・情報システム",
      slots: ["mon-1", "mon-2"],
      note: "Case 1: 月曜1〜2限",
    },
    {
      id: "case-c",
      title: "データ活用演習",
      instructor: "田中",
      grades: ["3"],
      groups: ["1組"],
      courseType: "選択",
      category: "AI・データ",
      slots: ["mon-2", "mon-3"],
      note: "Case 2: 月曜2〜3限",
    },
    {
      id: "case-d",
      title: "キャリア演習",
      instructor: "高橋",
      grades: ["3"],
      groups: ["1組"],
      courseType: null,
      category: null,
      slots: ["mon-2"],
      note: "Case 3: 区分未確認・月曜2限",
    },
    {
      id: "case-required",
      title: "必修プロジェクト",
      instructor: "専任",
      grades: ["3"],
      groups: ["1組"],
      courseType: "必修",
      category: "総合制作・プロジェクト",
      slots: ["wed-2", "wed-3"],
      note: "Case 5",
    },
    {
      id: "case-required-option",
      title: "クラウド制作・運用実践演習",
      instructor: "山本",
      grades: ["3"],
      groups: ["1組"],
      courseType: "選択必修",
      category: "プログラミング・Web・情報システム",
      slots: ["wed-3", "wed-4"],
      note: "Case 5: 必修と水曜3限で重複",
    },
    {
      id: "case-required-2",
      title: "必修ホームルーム",
      instructor: "専任",
      grades: ["3"],
      groups: ["2組"],
      courseType: "必修",
      category: "キャリア・資格・基礎教養",
      slots: ["fri-1", "fri-2"],
      note: "Case 6",
    },
    {
      id: "case-required-3",
      title: "必修キャリア基礎",
      instructor: "専任",
      grades: ["3"],
      groups: ["2組"],
      courseType: "必修",
      category: "キャリア・資格・基礎教養",
      slots: ["fri-2", "fri-3"],
      note: "Case 6: 必修同士が金曜2限で重複",
    },
  ];

  const slotKeys = mock.periods.flatMap((period) => mock.days.map((day) => `${day.id}-${period.id}`));
  const slotOrder = new Map(slotKeys.map((slotKey, index) => [slotKey, index]));
  const dayById = new Map(mock.days.map((day) => [day.id, day]));
  const periodById = new Map(mock.periods.map((period) => [String(period.id), period]));

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const slotLabel = (slotKey) => {
    const [dayId, periodId] = slotKey.split("-");
    return `${dayById.get(dayId).label}${periodById.get(periodId).label}`;
  };

  const normalizeCourses = () => {
    const courseMap = new Map();
    mock.courses.forEach((entry) => {
      // 統合版では火曜2限を指定された最大8件の比較ケースに揃える。
      if (entry.id === "xlsx-32") return;
      if (!courseMap.has(entry.id)) {
        courseMap.set(entry.id, {
          id: entry.id,
          title: entry.title,
          instructor: entry.instructor,
          grades: entry.grades,
          groups: entry.groups,
          courseType: entry.courseType,
          category: entry.category,
          note: entry.note,
          courseTypeIsSynthetic: entry.courseTypeIsSynthetic,
          slots: [],
        });
      }
      courseMap.get(entry.id).slots.push(`${entry.day}-${entry.period}`);
    });
    scenarioCourses.forEach((course) => courseMap.set(course.id, { ...course, courseTypeIsSynthetic: true }));
    courseMap.forEach((course) => {
      course.slots = [...new Set(course.slots)].sort((a, b) => slotOrder.get(a) - slotOrder.get(b));
    });
    return [...courseMap.values()];
  };

  const allCourses = normalizeCourses();
  const allCoursesById = new Map(allCourses.map((course) => [course.id, course]));

  const state = {
    grade: "3",
    group: "1組",
    activeSlot: "mon-2",
    gradeFilters: new Set(["3"]),
    categoryFilter: "all",
    manualSelectedIds: new Set(["case-a"]),
    inspectedCourseId: "case-b",
    scenario: "case1",
  };

  const isGroupMatch = (course) => course.groups.includes("all") || course.groups.includes(state.group);
  const isGradeEligible = (course) => state.grade === "3" || course.grades.includes(state.grade);
  const isEligible = (course) => isGradeEligible(course) && isGroupMatch(course);
  const isRequiredForCohort = (course) => (
    course.courseType === "必修"
    && course.grades.includes(state.grade)
    && isGroupMatch(course)
  );

  const getViewModel = () => {
    const eligibleCourses = allCourses.filter(isEligible);
    const requiredIds = new Set(eligibleCourses.filter(isRequiredForCohort).map((course) => course.id));
    const manualSelectedIds = new Set(
      [...state.manualSelectedIds].filter((courseId) => eligibleCourses.some((course) => course.id === courseId)),
    );
    state.manualSelectedIds = manualSelectedIds;
    const selectedIds = new Set([...requiredIds, ...manualSelectedIds]);
    const analysis = conflictEngine.analyze({ courses: eligibleCourses, selectedIds, requiredIds, orderedSlotKeys: slotKeys });
    const coursesById = new Map(eligibleCourses.map((course) => [course.id, course]));
    const matchesFilters = (course) => (
      course.grades.some((grade) => state.gradeFilters.has(grade))
      && (state.categoryFilter === "all" || course.category === state.categoryFilter)
    );
    const courses = eligibleCourses.filter((course) => selectedIds.has(course.id) || matchesFilters(course));
    return { courses, eligibleCourses, coursesById, requiredIds, selectedIds, analysis, matchesFilters };
  };

  const typeLabel = (courseType) => courseType || "区分未確認";
  const categoryLabel = (category) => category || "分野未確定";
  const typeBadgeClass = (courseType) => {
    if (courseType === "必修") return " type-badge--required";
    if (courseType === "選択必修") return " type-badge--selective-required";
    return "";
  };

  const requiredConflictFor = (courseId, viewModel) => viewModel.analysis.requiredConflicts.some(
    (conflict) => conflict.leftId === courseId || conflict.rightId === courseId,
  );

  const courseState = (course, viewModel) => {
    const selected = viewModel.selectedIds.has(course.id);
    const required = viewModel.requiredIds.has(course.id);
    const conflicts = viewModel.analysis.candidateConflicts.get(course.id) || [];
    const requiredConflict = required && requiredConflictFor(course.id, viewModel);
    if (requiredConflict) return { key: "required-conflict", label: "必修・要確認", icon: "!", selected, required, conflicts };
    if (required) return { key: "required", label: "必修・解除不可", icon: "🔒", selected, required, conflicts };
    if (selected) return { key: "selected", label: "選択済み", icon: "✓", selected, required, conflicts };
    if (conflicts.length) return { key: "unavailable", label: "選択不可", icon: "×", selected, required, conflicts };
    return { key: "available", label: "選択可能", icon: "+", selected, required, conflicts };
  };

  const conflictReasonLines = (course, viewModel) => conflictEngine.formatConflictReason(
    viewModel.analysis.candidateConflicts.get(course.id) || [],
    slotLabel,
  );

  const courseAriaLabel = (course, viewModel) => {
    const status = courseState(course, viewModel);
    const reasons = conflictReasonLines(course, viewModel);
    return [course.title, categoryLabel(course.category), typeLabel(course.courseType), status.label, ...reasons].join("。 ");
  };

  const desktopTypeBadge = (courseType) => {
    if (courseType === "選択") return "";
    const shortLabel = courseType === "必修"
      ? "必修"
      : courseType === "選択必修"
        ? "選必"
        : "?";
    return `<span class="type-badge${typeBadgeClass(courseType)}" aria-hidden="true" title="授業区分：${escapeHtml(typeLabel(courseType))}">${escapeHtml(shortLabel)}</span>`;
  };

  const renderDesktopCourse = (course, viewModel) => {
    const status = courseState(course, viewModel);
    const classes = ["c-course", "f-course", `is-${status.key}`];
    if (status.required) classes.push("is-required");
    if (status.selected) classes.push("is-selected");
    if (status.selected && !viewModel.matchesFilters(course)) classes.push("is-filter-retained");
    const reasons = conflictReasonLines(course, viewModel);
    const title = reasons.length ? reasons.join(" / ") : `${status.label} / ${course.slots.map(slotLabel).join("・")}`;
    return `<button class="${classes.join(" ")}" type="button" data-course-id="${escapeHtml(course.id)}"${status.required || status.key === "unavailable" ? ' aria-disabled="true"' : ""} aria-label="${escapeHtml(courseAriaLabel(course, viewModel))}" title="${escapeHtml(title)}"><span class="course-title">${escapeHtml(course.title)}</span><span class="course-state-icon" aria-hidden="true">${status.icon}</span>${desktopTypeBadge(course.courseType)}</button>`;
  };

  const coursesInSlot = (slotKey, viewModel) => viewModel.courses.filter((course) => course.slots.includes(slotKey));
  const eligibleCoursesInSlot = (slotKey, viewModel) => viewModel.eligibleCourses.filter((course) => course.slots.includes(slotKey));

  const renderDesktop = (viewModel) => {
    const cells = ['<div class="c-corner"></div>'];
    mock.days.forEach((day) => cells.push(`<div class="c-day">${day.label}</div>`));
    mock.periods.forEach((period) => {
      cells.push(`<div class="c-period"><strong>${period.label}</strong><span>${period.time}</span></div>`);
      mock.days.forEach((day) => {
        const slotKey = `${day.id}-${period.id}`;
        const courses = coursesInSlot(slotKey, viewModel);
        const totalCourses = eligibleCoursesInSlot(slotKey, viewModel);
        const unavailableCount = courses.filter((course) => courseState(course, viewModel).key === "unavailable").length;
        const countLabel = courses.length === totalCourses.length ? `${courses.length}候補` : `${courses.length}/${totalCourses.length}表示`;
        cells.push(`<div class="c-cell${unavailableCount ? " has-unavailable" : ""}" data-slot-key="${slotKey}"><div class="c-cell__meta"><span>${countLabel}</span>${unavailableCount ? `<span>${unavailableCount}件不可</span>` : ""}</div><div class="c-courses">${courses.map((course) => renderDesktopCourse(course, viewModel)).join("")}</div></div>`);
      });
    });
    document.querySelector("#desktop-grid").innerHTML = `<div class="c-desktop"><div class="c-grid">${cells.join("")}</div></div>`;
  };

  const renderMap = (viewModel) => {
    const cells = ['<div class="e-map__day"></div>'];
    mock.days.forEach((day) => cells.push(`<div class="e-map__day">${day.short}</div>`));
    mock.periods.forEach((period) => {
      cells.push(`<div class="e-map__period">${period.id}</div>`);
      mock.days.forEach((day) => {
        const slotKey = `${day.id}-${period.id}`;
        const courses = coursesInSlot(slotKey, viewModel);
        const totalCourses = eligibleCoursesInSlot(slotKey, viewModel);
        const selectedCount = courses.filter((course) => viewModel.selectedIds.has(course.id)).length;
        const unavailableCount = courses.filter((course) => courseState(course, viewModel).key === "unavailable").length;
        const classes = ["e-map__slot"];
        if (slotKey === state.activeSlot) classes.push("is-active");
        if (selectedCount) classes.push("is-selected");
        if (unavailableCount) classes.push("has-unavailable");
        cells.push(`<button class="${classes.join(" ")}" type="button" data-slot-key="${slotKey}" aria-label="${slotLabel(slotKey)}、${courses.length}件表示、全${totalCourses.length}件、${selectedCount}選択済み、${unavailableCount}選択不可"${slotKey === state.activeSlot ? ' aria-current="true"' : ""}><strong>${courses.length}</strong><span>${selectedCount}選択</span>${unavailableCount ? `<span class="map-state">${unavailableCount}不可</span>` : ""}</button>`);
      });
    });
    document.querySelector("#mobile-map").innerHTML = `<div class="e-map-heading"><h2>週間mini-map</h2><span>数字＝候補数</span></div><div class="e-map">${cells.join("")}</div>`;
  };

  const renderMobileCourse = (course, viewModel) => {
    const status = courseState(course, viewModel);
    const classes = ["mobile-course", "f-course", `is-${status.key}`];
    if (status.required) classes.push("is-required");
    if (status.selected) classes.push("is-selected");
    if (status.selected && !viewModel.matchesFilters(course)) classes.push("is-filter-retained");
    if (state.inspectedCourseId === course.id) classes.push("is-inspected");
    const reasons = conflictReasonLines(course, viewModel);
    const compactReason = reasons.length ? `<span class="mobile-course__reason">${escapeHtml(reasons[0])}${reasons.length > 1 ? `（ほか${reasons.length - 1}件）` : ""}</span>` : "";
    const retained = status.selected && !viewModel.matchesFilters(course)
      ? '<span class="mobile-course__retained">filter条件外・選択を維持</span>'
      : "";
    return `<button class="${classes.join(" ")}" type="button" data-course-id="${escapeHtml(course.id)}"${status.required || status.key === "unavailable" ? ' aria-disabled="true"' : ""} aria-label="${escapeHtml(courseAriaLabel(course, viewModel))}"><strong>${escapeHtml(course.title)}</strong><span class="mobile-course__state">${escapeHtml(status.label)}</span><span class="mobile-course__meta"><span class="type-badge${typeBadgeClass(course.courseType)}">${escapeHtml(typeLabel(course.courseType))}</span>　${escapeHtml(categoryLabel(course.category))}　${escapeHtml(course.instructor || "講師未確認")}　${escapeHtml(course.slots.map(slotLabel).join("・"))}</span>${retained}${compactReason}</button>`;
  };

  const renderMobile = (viewModel) => {
    renderMap(viewModel);
    const activeCourses = coursesInSlot(state.activeSlot, viewModel);
    const totalCourses = eligibleCoursesInSlot(state.activeSlot, viewModel);
    document.querySelector("#mobile-position").textContent = slotLabel(state.activeSlot);
    document.querySelector("#mobile-candidate-count").textContent = activeCourses.length === totalCourses.length
      ? `${activeCourses.length}件の履修候補`
      : `${activeCourses.length}件表示 / 全${totalCourses.length}件`;
    document.querySelector("#mobile-candidates").innerHTML = activeCourses.length
      ? `<div class="mobile-course-list">${activeCourses.map((course) => renderMobileCourse(course, viewModel)).join("")}</div>`
      : '<p class="empty-slot">このコマに候補はありません。</p>';
  };

  const courseExplanation = (course, viewModel) => {
    const status = courseState(course, viewModel);
    const requiredProblem = status.key === "required-conflict";
    let explanation = `${course.slots.map(slotLabel).join("・")} / ${categoryLabel(course.category)} / ${typeLabel(course.courseType)}`;
    if (status.key === "available") explanation += "。この授業は選択できます。";
    if (status.key === "selected") explanation += "。選択済みです。もう一度操作すると解除します。";
    if (status.key === "required") explanation += "。学年・組に一致する必修のため自動追加され、解除できません。";
    if (requiredProblem) explanation += "。必修同士の重複があるため学校側の確認が必要です。";
    return explanation;
  };

  const inspectorMarkup = (course, viewModel) => {
    if (!course) return "<strong>候補を選んでください</strong><p>状態と重複理由をここで確認できます。</p>";
    const status = courseState(course, viewModel);
    const reasons = conflictReasonLines(course, viewModel);
    const explanation = courseExplanation(course, viewModel);
    const reasonList = reasons.length ? `<ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : "";
    return `<strong>${escapeHtml(status.label)}｜${escapeHtml(course.title)}</strong><p>${escapeHtml(explanation)}</p>${reasonList}`;
  };

  const desktopInspectorMarkup = (course, viewModel) => {
    if (!course) return '<div class="desktop-inspector__copy"><strong>候補を選んでください</strong><p>状態と重複理由をここで確認できます。</p></div>';
    const status = courseState(course, viewModel);
    const reasons = conflictReasonLines(course, viewModel);
    const compactReason = reasons.length
      ? `${reasons[0]}${reasons.length > 1 ? `（ほか${reasons.length - 1}件）` : ""}`
      : courseExplanation(course, viewModel);
    const details = reasons.length || status.key === "required-conflict"
      ? `<button class="desktop-inspector__details" type="button" data-detail-course-id="${escapeHtml(course.id)}" aria-label="${escapeHtml(course.title)}の競合詳細を表示">詳細</button>`
      : "";
    return `<div class="desktop-inspector__copy"><strong>${escapeHtml(status.label)}｜${escapeHtml(course.title)}</strong><p>${escapeHtml(compactReason)}</p></div>${details}`;
  };

  const renderInspectors = (viewModel) => {
    const course = viewModel.coursesById.get(state.inspectedCourseId);
    const desktopInspector = document.querySelector("#desktop-inspector");
    const mobileInspector = document.querySelector("#mobile-inspector");
    [desktopInspector, mobileInspector].forEach((inspector) => {
      inspector.className = "conflict-inspector";
      if (course) {
        const status = courseState(course, viewModel);
        if (status.key === "unavailable") inspector.classList.add("is-unavailable");
        if (status.required) inspector.classList.add("is-required");
      }
    });
    desktopInspector.innerHTML = desktopInspectorMarkup(course, viewModel);
    mobileInspector.innerHTML = inspectorMarkup(course, viewModel);
  };

  const renderRequiredAlert = (viewModel) => {
    const alert = document.querySelector("#required-alert");
    if (!viewModel.analysis.requiredConflicts.length) {
      alert.hidden = true;
      alert.replaceChildren();
      return;
    }
    const items = viewModel.analysis.requiredConflicts.map((conflict) => {
      const left = viewModel.coursesById.get(conflict.leftId);
      const right = viewModel.coursesById.get(conflict.rightId);
      return `<li>${escapeHtml(conflict.sharedSlots.map(slotLabel).join("・"))}：${escapeHtml(left.title)} / ${escapeHtml(right.title)}</li>`;
    });
    alert.hidden = false;
    alert.innerHTML = `<strong>必修授業同士が重複しています。学校側の時間割確認が必要です。</strong><ul>${items.join("")}</ul>`;
  };

  const renderManualSelection = (viewModel) => {
    const list = document.querySelector("#manual-selection-list");
    const courses = [...state.manualSelectedIds].map((courseId) => viewModel.coursesById.get(courseId)).filter(Boolean);
    list.className = "manual-selection-list";
    list.innerHTML = courses.length
      ? courses.map((course) => `<button type="button" data-remove-course-id="${escapeHtml(course.id)}" aria-label="${escapeHtml(course.title)}を解除">${escapeHtml(course.title)}　×</button>`).join("")
      : '<span class="manual-selection-empty">まだ選択していません</span>';
  };

  const gradeChoices = () => state.grade === "3" ? ["3", "2", "1"] : [state.grade];
  const resetCandidateFilters = () => {
    state.gradeFilters = new Set([state.grade]);
    state.categoryFilter = "all";
  };
  const filtersAreDefault = () => (
    state.gradeFilters.size === 1
    && state.gradeFilters.has(state.grade)
    && state.categoryFilter === "all"
  );
  const filterSummaryText = () => {
    const grades = gradeChoices().filter((grade) => state.gradeFilters.has(grade));
    const gradeSummary = grades.map((grade) => `${grade}年`).join("・");
    return `${gradeSummary}・${state.categoryFilter === "all" ? "すべて" : state.categoryFilter}`;
  };

  const categoryOptionsMarkup = (selectedCategory, inputType = "option") => {
    if (inputType === "option") {
      return ["all", ...mock.categories].map((category) => {
        const label = category === "all" ? "すべての分野" : category;
        return `<option value="${escapeHtml(category)}"${selectedCategory === category ? " selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("");
    }
    return ["all", ...mock.categories].map((category) => {
      const label = category === "all" ? "すべての分野" : category;
      return `<label><input type="radio" name="mobile-category" value="${escapeHtml(category)}"${selectedCategory === category ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`;
    }).join("");
  };

  const renderFilterControls = (viewModel) => {
    document.querySelector("#desktop-grade-filters").innerHTML = gradeChoices().map((grade) => {
      const ownGrade = grade === state.grade;
      return `<button type="button" data-filter-grade="${grade}" data-own-grade="${ownGrade}" aria-pressed="${state.gradeFilters.has(grade)}"${ownGrade ? ' aria-disabled="true"' : ""}>${grade}年</button>`;
    }).join("");
    const categorySelect = document.querySelector("#desktop-category-filter");
    categorySelect.innerHTML = categoryOptionsMarkup(state.categoryFilter);
    categorySelect.value = state.categoryFilter;

    const eligibleCandidates = viewModel.eligibleCourses.filter((course) => !viewModel.selectedIds.has(course.id));
    const shownCandidates = viewModel.courses.filter((course) => !viewModel.selectedIds.has(course.id));
    const retainedSelections = [...viewModel.selectedIds].filter((courseId) => {
      const course = viewModel.coursesById.get(courseId);
      return course && !viewModel.matchesFilters(course);
    }).length;
    document.querySelector("#filter-result-summary").textContent = `候補 ${shownCandidates.length}/${eligibleCandidates.length}件${retainedSelections ? `・選択維持 ${retainedSelections}件` : ""}`;
    document.querySelector("#mobile-filter-summary").textContent = filterSummaryText();
    document.querySelectorAll("#desktop-filter-reset, #mobile-filter-reset").forEach((button) => {
      button.disabled = filtersAreDefault();
    });
  };

  const renderMobileFilterDialog = () => {
    document.querySelector("#mobile-grade-filters").innerHTML = gradeChoices().map((grade) => {
      const ownGrade = grade === state.grade;
      return `<label><input type="checkbox" value="${grade}"${state.gradeFilters.has(grade) ? " checked" : ""}${ownGrade ? " disabled" : ""}><span>${grade}年</span></label>`;
    }).join("");
    document.querySelector("#mobile-category-filters").innerHTML = categoryOptionsMarkup(state.categoryFilter, "radio");
  };

  const renderStats = (viewModel) => {
    document.querySelector("#selected-count").textContent = viewModel.selectedIds.size;
    document.querySelector("#selected-slots").textContent = viewModel.analysis.occupancy.size;
    document.querySelectorAll("[data-scenario]").forEach((button) => {
      button.setAttribute("aria-current", String(button.dataset.scenario === state.scenario));
    });
  };

  const updateDiagnostics = (viewModel) => {
    const output = document.querySelector("#prototype-diagnostics");
    const caseB = document.querySelector('.f-mobile [data-course-id="case-b"]');
    const caseC = document.querySelector('.f-mobile [data-course-id="case-c"]');
    const requiredOption = document.querySelector('.f-mobile [data-course-id="case-required-option"]');
    Object.assign(output.dataset, {
      viewportWidth: String(window.innerWidth),
      documentScrollWidth: String(document.documentElement.scrollWidth),
      desktopDisplay: getComputedStyle(document.querySelector(".f-desktop")).display,
      mobileDisplay: getComputedStyle(document.querySelector(".f-mobile")).display,
      scenario: state.scenario,
      activeSlot: state.activeSlot,
      activeCandidates: String(coursesInSlot(state.activeSlot, viewModel).length),
      activeTotalCandidates: String(eligibleCoursesInSlot(state.activeSlot, viewModel).length),
      activeUnavailable: String(coursesInSlot(state.activeSlot, viewModel).filter((course) => courseState(course, viewModel).key === "unavailable").length),
      gradeFilters: [...state.gradeFilters].sort().join(","),
      categoryFilter: state.categoryFilter,
      filterSummary: filterSummaryText(),
      retainedSelections: String([...viewModel.selectedIds].filter((courseId) => {
        const course = viewModel.coursesById.get(courseId);
        return course && !viewModel.matchesFilters(course);
      }).length),
      unknownCategoryVisible: String(viewModel.courses.some((course) => course.id === "xlsx-13")),
      caseBDisabled: String(caseB?.getAttribute("aria-disabled") === "true"),
      caseCDisabled: String(caseC?.getAttribute("aria-disabled") === "true"),
      requiredOptionDisabled: String(requiredOption?.getAttribute("aria-disabled") === "true"),
      requiredAlertVisible: String(!document.querySelector("#required-alert").hidden),
      focusedCourse: document.activeElement?.dataset?.courseId || "none",
      inspectorUnavailable: String(document.querySelector("#mobile-inspector").classList.contains("is-unavailable")),
      desktopInspectorHeight: String(Math.round(document.querySelector("#desktop-inspector").getBoundingClientRect().height)),
      desktopGridTop: String(Math.round(
        document.querySelector("#desktop-grid").getBoundingClientRect().top + window.scrollY
      )),
      errorCount: String(window.prototypeErrors?.length || 0),
    });
    if (pageQuery.get("diagnostics") === "1") {
      document.title = [
        `F width=${output.dataset.viewportWidth}`,
        `scroll=${output.dataset.documentScrollWidth}`,
        `scenario=${output.dataset.scenario}`,
        `candidates=${output.dataset.activeCandidates}`,
        `totalCandidates=${output.dataset.activeTotalCandidates}`,
        `unavailable=${output.dataset.activeUnavailable}`,
        `grades=${output.dataset.gradeFilters}`,
        `category=${output.dataset.categoryFilter}`,
        `retained=${output.dataset.retainedSelections}`,
        `unknownVisible=${output.dataset.unknownCategoryVisible}`,
        `caseBDisabled=${output.dataset.caseBDisabled}`,
        `caseCDisabled=${output.dataset.caseCDisabled}`,
        `requiredOptionDisabled=${output.dataset.requiredOptionDisabled}`,
        `requiredAlert=${output.dataset.requiredAlertVisible}`,
        `focused=${output.dataset.focusedCourse}`,
        `inspectorUnavailable=${output.dataset.inspectorUnavailable}`,
        `inspectorHeight=${output.dataset.desktopInspectorHeight}`,
        `gridTop=${output.dataset.desktopGridTop}`,
        `errors=${output.dataset.errorCount}`,
      ].join(" | ");
    }
  };

  const render = ({ focusCourseId = null } = {}) => {
    const viewModel = getViewModel();
    if (state.inspectedCourseId && !viewModel.courses.some((course) => course.id === state.inspectedCourseId)) {
      const activeCourses = coursesInSlot(state.activeSlot, viewModel);
      const firstUnavailable = activeCourses.find((course) => courseState(course, viewModel).key === "unavailable");
      state.inspectedCourseId = firstUnavailable?.id || activeCourses[0]?.id || viewModel.courses[0]?.id || null;
    }
    renderFilterControls(viewModel);
    renderDesktop(viewModel);
    renderMobile(viewModel);
    renderInspectors(viewModel);
    renderRequiredAlert(viewModel);
    renderManualSelection(viewModel);
    renderStats(viewModel);
    updateDiagnostics(viewModel);
    if (focusCourseId) {
      requestAnimationFrame(() => {
        const selector = `[data-course-id="${CSS.escape(focusCourseId)}"]`;
        const preferredRoot = window.matchMedia("(max-width: 760px)").matches ? ".f-mobile" : ".f-desktop";
        document.querySelector(`${preferredRoot} ${selector}`)?.focus();
      });
    }
    return viewModel;
  };

  const inspectCourse = (courseId, viewModel = getViewModel()) => {
    state.inspectedCourseId = courseId;
    renderInspectors(viewModel);
    document.querySelectorAll(".mobile-course.is-inspected").forEach((course) => course.classList.remove("is-inspected"));
    document.querySelector(`.f-mobile [data-course-id="${CSS.escape(courseId)}"]`)?.classList.add("is-inspected");
  };

  const openDesktopDetails = (courseId) => {
    const viewModel = getViewModel();
    const course = viewModel.coursesById.get(courseId);
    if (!course) return;
    document.querySelector("#desktop-conflict-dialog-content").innerHTML = inspectorMarkup(course, viewModel);
    const dialog = document.querySelector("#desktop-conflict-dialog");
    if (!dialog.open) dialog.showModal();
  };

  const activateCourse = (courseId) => {
    const viewModel = getViewModel();
    const course = viewModel.coursesById.get(courseId);
    if (!course) return;
    state.inspectedCourseId = courseId;
    const status = courseState(course, viewModel);
    if (status.required || status.key === "unavailable") {
      inspectCourse(courseId, viewModel);
      return;
    }
    state.scenario = "custom";
    if (state.manualSelectedIds.has(courseId)) state.manualSelectedIds.delete(courseId);
    else state.manualSelectedIds.add(courseId);
    render({ focusCourseId: courseId });
  };

  const changeActiveSlot = (slotKey) => {
    if (!slotOrder.has(slotKey)) return;
    state.activeSlot = slotKey;
    const viewModel = getViewModel();
    const firstUnavailable = coursesInSlot(slotKey, viewModel).find((course) => courseState(course, viewModel).key === "unavailable");
    state.inspectedCourseId = firstUnavailable?.id || coursesInSlot(slotKey, viewModel)[0]?.id || null;
    render();
  };

  const applyScenario = (scenario) => {
    const definitions = {
      case1: { group: "1組", selected: ["case-a"], activeSlot: "mon-2", inspected: "case-b" },
      case2: { group: "1組", selected: ["case-b"], activeSlot: "mon-2", inspected: "case-c" },
      required: { group: "1組", selected: [], activeSlot: "wed-3", inspected: "case-required-option" },
      dense: { group: "1組", selected: [], activeSlot: "tue-2", inspected: "xlsx-11" },
      "required-required": { group: "2組", selected: [], activeSlot: "fri-2", inspected: "case-required-2" },
    };
    const definition = definitions[scenario];
    if (!definition) return;
    state.grade = "3";
    state.group = definition.group;
    resetCandidateFilters();
    state.manualSelectedIds = new Set(definition.selected);
    state.activeSlot = definition.activeSlot;
    state.inspectedCourseId = definition.inspected;
    state.scenario = scenario;
    document.querySelector("#grade-select").value = state.grade;
    document.querySelector("#group-select").value = state.group;
    render();
  };

  document.querySelector("#desktop-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-course-id]");
    if (button) activateCourse(button.dataset.courseId);
  });
  document.querySelector("#desktop-grid").addEventListener("focusin", (event) => {
    const button = event.target.closest("[data-course-id]");
    if (button) inspectCourse(button.dataset.courseId);
  });
  document.querySelector("#desktop-grid").addEventListener("mouseover", (event) => {
    const button = event.target.closest("[data-course-id]");
    if (button) inspectCourse(button.dataset.courseId);
  });
  document.querySelector("#desktop-inspector").addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail-course-id]");
    if (button) openDesktopDetails(button.dataset.detailCourseId);
  });
  document.querySelector("#desktop-conflict-dialog-close").addEventListener("click", () => {
    document.querySelector("#desktop-conflict-dialog").close();
  });
  document.querySelector("#mobile-candidates").addEventListener("click", (event) => {
    const button = event.target.closest("[data-course-id]");
    if (button) activateCourse(button.dataset.courseId);
  });
  document.querySelector("#mobile-candidates").addEventListener("focusin", (event) => {
    const button = event.target.closest("[data-course-id]");
    if (button) inspectCourse(button.dataset.courseId);
  });
  document.querySelector("#mobile-map").addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot-key]");
    if (button) changeActiveSlot(button.dataset.slotKey);
  });
  document.querySelector("#manual-selection-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-course-id]");
    if (!button) return;
    state.manualSelectedIds.delete(button.dataset.removeCourseId);
    state.inspectedCourseId = button.dataset.removeCourseId;
    state.scenario = "custom";
    render();
  });
  document.querySelector("#desktop-grade-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-grade]");
    if (!button || button.dataset.ownGrade === "true") return;
    const grade = button.dataset.filterGrade;
    if (state.gradeFilters.has(grade)) state.gradeFilters.delete(grade);
    else state.gradeFilters.add(grade);
    state.scenario = "custom";
    render({ focusCourseId: state.inspectedCourseId });
  });
  document.querySelector("#desktop-category-filter").addEventListener("change", (event) => {
    state.categoryFilter = event.target.value;
    state.scenario = "custom";
    render();
  });
  const clearFilters = () => {
    resetCandidateFilters();
    state.scenario = "custom";
    render();
  };
  document.querySelector("#desktop-filter-reset").addEventListener("click", clearFilters);
  document.querySelector("#mobile-filter-reset").addEventListener("click", clearFilters);
  document.querySelector("#mobile-filter-open").addEventListener("click", () => {
    renderMobileFilterDialog();
    const dialog = document.querySelector("#mobile-filter-dialog");
    if (!dialog.open) dialog.showModal();
  });
  document.querySelector("#mobile-filter-dialog-close").addEventListener("click", () => {
    document.querySelector("#mobile-filter-dialog").close();
  });
  document.querySelector("#mobile-dialog-reset").addEventListener("click", () => {
    document.querySelectorAll('#mobile-grade-filters input[type="checkbox"]').forEach((input) => {
      input.checked = input.value === state.grade;
    });
    const allCategory = document.querySelector('#mobile-category-filters input[value="all"]');
    if (allCategory) allCategory.checked = true;
  });
  document.querySelector("#mobile-dialog-apply").addEventListener("click", () => {
    const selectedGrades = new Set([state.grade]);
    document.querySelectorAll('#mobile-grade-filters input[type="checkbox"]:checked').forEach((input) => {
      selectedGrades.add(input.value);
    });
    state.gradeFilters = selectedGrades;
    state.categoryFilter = document.querySelector('#mobile-category-filters input[name="mobile-category"]:checked')?.value || "all";
    state.scenario = "custom";
    document.querySelector("#mobile-filter-dialog").close();
    render();
  });
  document.querySelector(".scenario-bar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-scenario]");
    if (button) applyScenario(button.dataset.scenario);
  });
  document.querySelector("#previous-slot").addEventListener("click", () => {
    const index = slotOrder.get(state.activeSlot);
    changeActiveSlot(slotKeys[(index - 1 + slotKeys.length) % slotKeys.length]);
  });
  document.querySelector("#next-slot").addEventListener("click", () => {
    const index = slotOrder.get(state.activeSlot);
    changeActiveSlot(slotKeys[(index + 1) % slotKeys.length]);
  });
  document.querySelector("#grade-select").addEventListener("change", (event) => {
    state.grade = event.target.value;
    resetCandidateFilters();
    state.manualSelectedIds.clear();
    state.scenario = "custom";
    render();
  });
  document.querySelector("#group-select").addEventListener("change", (event) => {
    state.group = event.target.value;
    state.manualSelectedIds.clear();
    state.scenario = "custom";
    render();
  });

  const initialScenario = pageQuery.get("scenario");
  if (initialScenario) applyScenario(initialScenario);
  else render();
  const initialGrades = pageQuery.get("filterGrades");
  const initialCategory = pageQuery.get("category");
  if (initialGrades || initialCategory) {
    const allowedGrades = new Set(gradeChoices());
    const requestedGrades = new Set(
      (initialGrades || state.grade).split(",").filter((grade) => allowedGrades.has(grade)),
    );
    requestedGrades.add(state.grade);
    state.gradeFilters = requestedGrades;
    if (initialCategory && mock.categories.includes(initialCategory)) state.categoryFilter = initialCategory;
    render();
  }
  const initialRemoval = pageQuery.get("remove");
  if (initialRemoval && state.manualSelectedIds.has(initialRemoval)) {
    state.manualSelectedIds.delete(initialRemoval);
    state.inspectedCourseId = initialRemoval;
    state.scenario = "custom";
    render();
  }
  const initialFocus = pageQuery.get("focus");
  if (initialFocus) {
    const preferredRoot = window.matchMedia("(max-width: 760px)").matches ? ".f-mobile" : ".f-desktop";
    document.querySelector(`${preferredRoot} [data-course-id="${CSS.escape(initialFocus)}"]`)?.focus();
    updateDiagnostics(getViewModel());
  }
  const interactionSequence = pageQuery.get("interactionSequence");
  if (interactionSequence) {
    const desktopGrid = document.querySelector("#desktop-grid");
    const desktopInspector = document.querySelector("#desktop-inspector");
    const gridTops = [];
    const inspectorHeights = [];
    interactionSequence.split(",").forEach((courseId, index) => {
      const course = document.querySelector(`.f-desktop [data-course-id="${CSS.escape(courseId)}"]`);
      if (!course) return;
      if (index % 2 === 0) course.focus();
      else course.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      gridTops.push(Math.round(desktopGrid.getBoundingClientRect().top + window.scrollY));
      inspectorHeights.push(Math.round(desktopInspector.getBoundingClientRect().height));
    });
    const output = document.querySelector("#prototype-diagnostics");
    output.dataset.interactionGridTops = gridTops.join(",");
    output.dataset.interactionInspectorHeights = inspectorHeights.join(",");
    if (pageQuery.get("diagnostics") === "1") {
      document.title += ` | sequenceGridTops=${output.dataset.interactionGridTops} | sequenceHeights=${output.dataset.interactionInspectorHeights}`;
    }
  }
})();
