((global) => {
  "use strict";

  const personal = global.ClassViewPersonalTimetable;
  const personalUi = global.ClassViewPersonalTimetableUi;
  const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
  const SVG_NS = "http://www.w3.org/2000/svg";

  const element = (tagName, className = "", text = "") => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const unique = (values) => [...new Set(values)];

  const createIcon = (name) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("personal-state-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const add = (tag, attributes) => {
      const child = document.createElementNS(SVG_NS, tag);
      Object.entries(attributes).forEach(([key, value]) => child.setAttribute(key, value));
      svg.append(child);
    };
    if (name === "circle") {
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
    } else if (name === "arrow-left-right") {
      add("path", { d: "M8 3 4 7l4 4M4 7h16" });
      add("path", { d: "m16 21 4-4-4-4M20 17H4" });
    } else {
      add("path", { d: "M12 3 2.7 20h18.6L12 3Z" });
      add("path", { d: "M12 9v4M12 17h.01" });
    }
    return svg;
  };

  const createController = ({ getContext, getSavedProfile, saveProfile, onClose } = {}) => {
    if (!personal || !personalUi || typeof getContext !== "function") {
      throw new Error("Personal timetable wizard dependencies are unavailable.");
    }
    const dialog = document.querySelector("#personal-wizard-dialog");
    const conflictDialog = document.querySelector("#personal-conflict-dialog");
    if (!dialog || !conflictDialog) throw new Error("Personal timetable wizard markup is unavailable.");

    const dom = {
      dialog,
      conflictDialog,
      form: dialog.querySelector("#personal-wizard-form"),
      steps: [...dialog.querySelectorAll("[data-personal-step]")],
      progress: [...dialog.querySelectorAll("[data-personal-progress]")],
      gradeChoices: dialog.querySelector("#personal-grade-choices"),
      homeroomChoices: dialog.querySelector("#personal-homeroom-choices"),
      periodNotice: dialog.querySelector("#personal-period-notice"),
      dayTabs: dialog.querySelector("#personal-day-tabs"),
      periodTabs: dialog.querySelector("#personal-period-tabs"),
      slotHeading: dialog.querySelector("#personal-slot-heading"),
      candidateCount: dialog.querySelector("#personal-candidate-count"),
      candidates: dialog.querySelector("#personal-wizard-candidates"),
      selectionStatus: dialog.querySelector("#personal-selection-status"),
      weeklySummary: dialog.querySelector("#personal-weekly-summary"),
      review: dialog.querySelector("#personal-wizard-review"),
      back: dialog.querySelector("#personal-wizard-back"),
      next: dialog.querySelector("#personal-wizard-next"),
      save: dialog.querySelector("#personal-wizard-save"),
      error: dialog.querySelector("#personal-wizard-error"),
      conflictIcon: conflictDialog.querySelector("#personal-conflict-icon"),
      conflictTitle: conflictDialog.querySelector("#personal-conflict-title"),
      conflictMessage: conflictDialog.querySelector("#personal-conflict-message"),
      conflictList: conflictDialog.querySelector("#personal-conflict-list"),
      conflictReplace: conflictDialog.querySelector("#personal-conflict-replace"),
      conflictCancel: conflictDialog.querySelector("#personal-conflict-cancel"),
    };

    const state = {
      step: 1,
      grade: null,
      homeroomId: "",
      weekday: 1,
      period: 1,
      context: null,
      periodContext: null,
      draftProfile: null,
      model: null,
      pendingCourseId: "",
      returnFocus: null,
      message: "",
    };

    const courseFor = (courseId) => state.context.courses.find((course) => course.id === courseId) || {};
    const homeroomFor = (homeroomId) => state.context.manifest.homerooms?.find((item) => item.id === homeroomId);
    const candidateState = (courseId) => state.model?.conflicts.candidateStates.find((item) => item.courseId === courseId);
    const enrollmentItem = (courseId) => state.model?.enrollment.items.find((item) => item.courseId === courseId);
    const slotsForCourse = (courseId) => state.model?.conflicts.slotsByCourse?.find(
      (item) => item.courseId === courseId,
    )?.slots || [];
    const slotLabel = (slot) => `${DAY_NAMES[slot.weekday]}曜${slot.period}限`;
    const occupancyLabel = (courseId) => {
      const byDay = new Map();
      slotsForCourse(courseId).forEach((slot) => byDay.set(slot.weekday, [...(byDay.get(slot.weekday) || []), slot.period]));
      return [...byDay.entries()].map(([weekday, periods]) => {
        const values = unique(periods).sort((left, right) => left - right);
        const consecutive = values.length > 1 && values.every((value, index) => index === 0 || value === values[index - 1] + 1);
        const periodText = consecutive ? `${values[0]}〜${values.at(-1)}限` : `${values.join("・")}限`;
        return `${DAY_NAMES[weekday]}曜${periodText}`;
      }).join(" / ");
    };

    const scopedEntries = () => {
      if (!state.draftProfile || !state.model) return [];
      const visible = new Set(state.model.filteredCourseIds);
      return state.model.periodEntries.filter((entry) => (
        entry?.kind === "class" &&
        visible.has(entry.courseId) &&
        personal.matchAudience(entry, state.draftProfile).matches
      ));
    };

    const candidatesForSlot = () => {
      const records = new Map();
      scopedEntries().forEach((entry) => {
        const slot = personal.slotFromEntry(entry);
        if (slot?.weekday === state.weekday && slot.period === state.period && !records.has(entry.courseId)) {
          records.set(entry.courseId, entry);
        }
      });
      return [...records.entries()].sort(([leftId], [rightId]) => {
        const leftRequired = Boolean(enrollmentItem(leftId)?.required);
        const rightRequired = Boolean(enrollmentItem(rightId)?.required);
        return Number(rightRequired) - Number(leftRequired) ||
          String(courseFor(leftId).title || leftId).localeCompare(String(courseFor(rightId).title || rightId), "ja");
      });
    };

    const rebuildDraft = (manualSelectedCourseIds) => {
      const identity = {
        academicYear: state.context.manifest.academicYear,
        term: state.periodContext.currentPeriod.term,
        grade: state.grade,
        homeroomId: state.homeroomId,
      };
      const created = personal.createProfile({
        ...identity,
        manualSelectedCourseIds,
        dataVersion: state.context.dataVersion,
      });
      if (!created.ok) return false;
      state.draftProfile = created.profile;
      state.model = personalUi.buildModel({
        manifest: state.context.manifest,
        dateKey: state.context.dateKey,
        courses: state.context.courses,
        entries: state.context.entries,
        profileLoad: { status: "ready", profile: created.profile },
        dataVersion: state.context.dataVersion,
      });
      return state.model.active;
    };

    const syncDraftIdentity = () => {
      if (!state.periodContext?.valid || !state.grade || !state.homeroomId) {
        state.draftProfile = null;
        state.model = null;
        return false;
      }
      const identity = {
        academicYear: state.context.manifest.academicYear,
        term: state.periodContext.currentPeriod.term,
        grade: state.grade,
        homeroomId: state.homeroomId,
      };
      const draft = personalUi.createDraftProfile({
        currentProfile: getSavedProfile?.() || null,
        identity,
        dataVersion: state.context.dataVersion,
      });
      if (!draft.ok) return false;
      return rebuildDraft(draft.profile.manualSelectedCourseIds);
    };

    const renderChoice = (target, name, value, label, checked, onChange) => {
      const wrapper = element("div", "personal-choice-card");
      const input = element("input");
      input.type = "radio";
      input.name = name;
      input.value = String(value);
      input.id = `personal-${name}-${value}`;
      input.checked = checked;
      const text = element("label", "", label);
      text.htmlFor = input.id;
      input.addEventListener("change", onChange);
      wrapper.append(input, text);
      target.append(wrapper);
    };

    const renderIdentity = () => {
      dom.gradeChoices.replaceChildren();
      [1, 2, 3].forEach((grade) => renderChoice(
        dom.gradeChoices,
        "grade",
        grade,
        `${grade}年`,
        state.grade === grade,
        () => {
          state.grade = grade;
          state.homeroomId = "";
          state.draftProfile = null;
          state.model = null;
          state.message = "";
          render();
        },
      ));
      dom.homeroomChoices.replaceChildren();
      const homerooms = (state.context.manifest.homerooms || []).filter((item) => item.grade === state.grade);
      homerooms.forEach((item) => renderChoice(
        dom.homeroomChoices,
        "homeroom",
        item.id,
        item.label,
        state.homeroomId === item.id,
        () => {
          state.homeroomId = item.id;
          state.message = "";
          syncDraftIdentity();
          render();
        },
      ));
      if (state.grade && !homerooms.length) {
        dom.homeroomChoices.append(element("p", "personal-wizard-empty", "この学年の所属組は登録されていません。"));
      }
      dom.periodNotice.hidden = state.periodContext.valid;
      if (!state.periodContext.valid) {
        dom.periodNotice.textContent = "正式な学期期間が未設定のため、個人時間割の設定は現在利用できません。学校全体の時間割は引き続き確認できます。";
      }
    };

    const handleTabKey = (event, values, current, select) => {
      const offsets = { ArrowLeft: -1, ArrowRight: 1 };
      if (!(event.key in offsets) && !["Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let index = values.indexOf(current);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = values.length - 1;
      else index = (index + offsets[event.key] + values.length) % values.length;
      select(values[index], true);
    };

    const renderTab = (root, { id, label, selected, hasSelection, onSelect, onKeyDown }) => {
      const button = element("button", `personal-wizard-tab${hasSelection ? " has-selection" : ""}`, label);
      button.type = "button";
      button.id = id;
      button.role = "tab";
      button.tabIndex = selected ? 0 : -1;
      button.setAttribute("aria-selected", String(selected));
      button.addEventListener("click", () => onSelect(false));
      button.addEventListener("keydown", onKeyDown);
      root.append(button);
    };

    const courseHasSlot = (courseId, weekday, period) => slotsForCourse(courseId).some(
      (slot) => slot.weekday === weekday && slot.period === period,
    );

    const selectDay = (weekday, focus = false) => {
      state.weekday = weekday;
      state.message = "";
      render();
      if (focus) dom.dayTabs.querySelector(`#personal-day-${weekday}`)?.focus({ preventScroll: true });
    };

    const selectPeriod = (period, focus = false) => {
      state.period = period;
      state.message = "";
      render();
      if (focus) dom.periodTabs.querySelector(`#personal-period-${period}`)?.focus({ preventScroll: true });
    };

    const renderTabs = () => {
      const weekdays = [1, 2, 3, 4, 5];
      const periods = Object.keys(state.context.periods.periods).map(Number).sort((a, b) => a - b);
      if (!periods.includes(state.period)) state.period = periods[0] || 1;
      dom.dayTabs.replaceChildren();
      weekdays.forEach((weekday) => renderTab(dom.dayTabs, {
        id: `personal-day-${weekday}`,
        label: DAY_NAMES[weekday],
        selected: state.weekday === weekday,
        hasSelection: state.model.enrollment.effectiveCourseIds.some(
          (courseId) => slotsForCourse(courseId).some((slot) => slot.weekday === weekday),
        ),
        onSelect: (focus) => selectDay(weekday, focus),
        onKeyDown: (event) => handleTabKey(event, weekdays, state.weekday, selectDay),
      }));
      dom.periodTabs.replaceChildren();
      periods.forEach((period) => renderTab(dom.periodTabs, {
        id: `personal-period-${period}`,
        label: `${period}限`,
        selected: state.period === period,
        hasSelection: state.model.enrollment.effectiveCourseIds.some((courseId) => courseHasSlot(courseId, state.weekday, period)),
        onSelect: (focus) => selectPeriod(period, focus),
        onKeyDown: (event) => handleTabKey(event, periods, state.period, selectPeriod),
      }));
    };

    const conflictDescription = (conflict) => `${conflict.title || courseFor(conflict.courseId).title || conflict.courseId}（${(conflict.slots || []).map(slotLabel).join("・")}）`;

    const openConflict = (courseId, trigger) => {
      const candidate = candidateState(courseId);
      const conflicts = candidate?.conflicts || [];
      const required = conflicts.filter((item) => item.required);
      state.pendingCourseId = courseId;
      state.returnFocus = trigger;
      dom.conflictIcon.replaceChildren(createIcon(required.length ? "lock-keyhole" : "arrow-left-right"));
      dom.conflictTitle.textContent = required.length ? "この授業は選択できません" : "授業を入れ替えますか？";
      dom.conflictMessage.textContent = required.length
        ? "必修授業と時間が重複しています。必修授業は解除できません。"
        : "この授業を選ぶには、現在選択中の授業を解除する必要があります。";
      dom.conflictList.replaceChildren(...conflicts.map((item) => element("li", "", conflictDescription(item))));
      dom.conflictReplace.hidden = Boolean(required.length);
      conflictDialog.showModal();
      (required.length ? dom.conflictCancel : dom.conflictReplace).focus();
    };

    const updateCourse = (courseId, trigger) => {
      const update = personalUi.updateManualSelection(state.model, courseId);
      if (update.changed) {
        rebuildDraft(update.courseIds);
        state.message = update.reason === "selected" ? "授業を選択しました。" : "授業の選択を解除しました。";
        render();
        return;
      }
      if (update.reason === "required-course") {
        state.message = "必修授業は変更できません。";
        render();
        return;
      }
      if (update.reason === "conflict") openConflict(courseId, trigger);
    };

    const courseCard = (courseId, entry) => {
      const course = courseFor(courseId);
      const candidate = candidateState(courseId);
      const item = enrollmentItem(courseId);
      const required = Boolean(item?.required);
      const selected = Boolean(candidate?.selected);
      const blocked = !selected && Boolean(candidate?.conflicts.length);
      const stateName = required ? "required" : selected ? "selected" : blocked ? "blocked" : "available";
      const iconName = required ? "lock-keyhole" : selected ? "check-circle" : blocked ? "calendar-x" : "circle";
      const stateLabel = required ? "必修" : selected ? "選択済み" : blocked ? "時間競合" : "未選択";
      const title = course.title || entry.subjectName || courseId;
      const button = element("button", `personal-wizard-card is-${stateName}`);
      button.type = "button";
      button.dataset.courseId = courseId;
      button.setAttribute("aria-pressed", String(selected));
      if (required) button.setAttribute("aria-disabled", "true");
      if (blocked) button.setAttribute("aria-haspopup", "dialog");
      const titleRow = element("span", "personal-wizard-card__title-row");
      titleRow.append(element("strong", "personal-wizard-card__title", title));
      const mark = element("span", "personal-wizard-card__state");
      mark.append(createIcon(iconName));
      if (required) mark.append(element("span", "personal-wizard-card__state-label", "必修"));
      titleRow.append(mark);
      const details = [];
      const occupancy = occupancyLabel(courseId);
      if (occupancy) details.push(occupancy);
      const instructors = unique((entry.instructors || []).filter(Boolean));
      if (instructors.length) details.push(`講師: ${instructors.join("・")}`);
      if (Number.isFinite(course.credits)) details.push(`${course.credits}単位`);
      button.append(titleRow, element("span", "personal-wizard-card__details", details.join(" / ")));
      const conflictLabel = blocked ? `。${candidate.conflicts.map(conflictDescription).join("、")}と時間が重複しています` : "";
      button.setAttribute("aria-label", `${title}。${details.join("。")}。${stateLabel}${conflictLabel}`);
      button.addEventListener("click", () => updateCourse(courseId, button));
      return button;
    };

    const renderCandidates = () => {
      const candidates = candidatesForSlot();
      dom.slotHeading.textContent = `${DAY_NAMES[state.weekday]}曜日・${state.period}限`;
      dom.candidateCount.textContent = `${candidates.length}件の候補`;
      dom.candidates.replaceChildren();
      if (!candidates.length) {
        dom.candidates.append(element("p", "personal-wizard-empty", "この曜日・時限に選択できる候補はありません。"));
      } else {
        candidates.forEach(([courseId, entry]) => dom.candidates.append(courseCard(courseId, entry)));
      }
      const requiredErrors = state.model.conflicts.requiredConflicts.length;
      const enrollmentErrors = state.model.conflicts.enrollmentConflicts.length;
      const statusText = requiredErrors
        ? `必修授業同士の時間重複が${requiredErrors}件あります。学校側で時間割データの確認が必要です。`
        : enrollmentErrors
          ? `選択中の授業に時間重複が${enrollmentErrors}件あります。選択内容を確認してください。`
          : state.message;
      dom.selectionStatus.classList.toggle("is-error", Boolean(requiredErrors));
      dom.selectionStatus.textContent = statusText;
      dom.selectionStatus.hidden = !statusText;
    };

    const renderSummary = () => {
      dom.weeklySummary.replaceChildren();
      const selectedIds = state.model.enrollment.effectiveCourseIds;
      [1, 2, 3, 4, 5].forEach((weekday) => {
        const section = element("section", "personal-weekly-day");
        section.append(element("h4", "", `${DAY_NAMES[weekday]}曜日`));
        const rows = [];
        selectedIds.forEach((courseId) => {
          slotsForCourse(courseId).filter((slot) => slot.weekday === weekday).forEach((slot) => rows.push({ courseId, period: slot.period }));
        });
        rows.sort((a, b) => a.period - b.period || a.courseId.localeCompare(b.courseId));
        if (!rows.length) section.append(element("p", "personal-weekly-empty", "選択なし"));
        else rows.forEach(({ courseId, period }) => {
          const row = element("button", "personal-weekly-item");
          row.type = "button";
          row.append(element("span", "", `${period}限`), element("span", "", courseFor(courseId).title || courseId));
          row.addEventListener("click", () => {
            state.weekday = weekday;
            state.period = period;
            render();
          });
          section.append(row);
        });
        dom.weeklySummary.append(section);
      });
      const summary = dialog.querySelector("#personal-selected-summary");
      summary.textContent = `${selectedIds.length}科目・${selectedIds.reduce((count, courseId) => count + slotsForCourse(courseId).length, 0)}コマ`;
    };

    const renderReview = () => {
      dom.review.replaceChildren();
      if (!state.draftProfile || !state.model) return;
      const heading = element("div", "personal-review-profile");
      heading.append(
        element("span", "", `${state.draftProfile.grade}年`),
        element("span", "", homeroomFor(state.draftProfile.homeroomId)?.label || state.draftProfile.homeroomId),
        element("span", "", state.draftProfile.term === "first" ? "前期" : "後期"),
      );
      dom.review.append(heading);
      const list = element("div", "personal-review-courses");
      state.model.enrollment.items.forEach((item) => {
        const row = element("div", "personal-review-course");
        row.append(
          element("strong", "", courseFor(item.courseId).title || item.courseId),
          element("span", "", `${occupancyLabel(item.courseId)}${item.required ? " / 必修" : ""}`),
        );
        list.append(row);
      });
      if (!list.childElementCount) list.append(element("p", "personal-wizard-empty", "選択した授業はありません。"));
      dom.review.append(list);
    };

    const canContinue = () => {
      if (state.step === 1) return Boolean(state.grade);
      if (state.step === 2) return Boolean(state.homeroomId && state.periodContext.valid && state.model?.active);
      if (state.step === 3) return Boolean(state.model?.active && !state.model.conflicts.enrollmentConflicts.length);
      return false;
    };

    const render = () => {
      renderIdentity();
      dom.steps.forEach((section) => { section.hidden = Number(section.dataset.personalStep) !== state.step; });
      dom.progress.forEach((item) => {
        const step = Number(item.dataset.personalProgress);
        item.classList.toggle("is-current", step === state.step);
        item.classList.toggle("is-complete", step < state.step);
        item.setAttribute("aria-current", step === state.step ? "step" : "false");
      });
      if (state.step === 3 && state.model?.active) {
        renderTabs();
        renderCandidates();
        renderSummary();
      }
      if (state.step === 4) renderReview();
      dom.back.hidden = state.step === 1;
      dom.next.hidden = state.step === 4;
      dom.save.hidden = state.step !== 4;
      dom.next.disabled = !canContinue();
      dom.save.disabled = !state.model?.active || Boolean(state.model?.conflicts.enrollmentConflicts.length);
      dom.error.hidden = true;
    };

    const open = () => {
      state.context = getContext();
      state.periodContext = personal.periodContextForDate(state.context.dateKey, state.context.manifest);
      const saved = getSavedProfile?.() || null;
      state.step = 1;
      state.grade = saved?.grade || null;
      state.homeroomId = saved?.homeroomId || "";
      state.weekday = 1;
      state.period = Number(Object.keys(state.context.periods.periods)[0] || 1);
      state.message = "";
      state.pendingCourseId = "";
      if (state.periodContext.valid && state.grade && state.homeroomId) syncDraftIdentity();
      else {
        state.draftProfile = null;
        state.model = null;
      }
      render();
      dialog.showModal();
      dom.gradeChoices.querySelector("input:checked")?.focus() || dom.gradeChoices.querySelector("input")?.focus();
    };

    dom.back.addEventListener("click", () => {
      state.step = Math.max(1, state.step - 1);
      state.message = "";
      render();
    });
    dom.next.addEventListener("click", () => {
      if (!canContinue()) return;
      state.step = Math.min(4, state.step + 1);
      state.message = "";
      render();
      dialog.querySelector(`[data-personal-step="${state.step}"] h3`)?.focus();
    });
    dom.save.addEventListener("click", async () => {
      if (!state.draftProfile || dom.save.disabled) return;
      dom.save.disabled = true;
      const result = await saveProfile(state.draftProfile);
      if (!result?.saved) {
        dom.error.textContent = result?.message || "このブラウザへ設定を保存できませんでした。学校全体表示は引き続き利用できます。";
        dom.error.hidden = false;
        dom.save.disabled = false;
        return;
      }
      dialog.close("saved");
    });
    dialog.querySelectorAll("[data-personal-close]").forEach((button) => button.addEventListener("click", () => dialog.close("cancel")));
    dialog.addEventListener("close", () => onClose?.(dialog.returnValue));
    dialog.addEventListener("cancel", () => { dialog.returnValue = "cancel"; });

    dom.conflictReplace.addEventListener("click", () => {
      const courseId = state.pendingCourseId;
      const replacement = personalUi.replaceManualSelection(state.model, courseId);
      if (replacement.changed) {
        rebuildDraft(replacement.courseIds);
        state.message = `${replacement.removedCourseIds.map((id) => courseFor(id).title || id).join("・")}と入れ替えました。`;
        conflictDialog.close("replace");
        render();
      } else {
        dom.conflictMessage.textContent = "現在の選択状態では安全に入れ替えられません。選択内容を確認してください。";
        dom.conflictReplace.hidden = true;
      }
    });
    dom.conflictCancel.addEventListener("click", () => conflictDialog.close("cancel"));
    conflictDialog.addEventListener("close", () => {
      const focus = state.returnFocus;
      state.pendingCourseId = "";
      state.returnFocus = null;
      focus?.focus({ preventScroll: true });
    });

    return Object.freeze({ open });
  };

  global.ClassViewPersonalTimetableWizard = Object.freeze({ createController });
})(globalThis);
