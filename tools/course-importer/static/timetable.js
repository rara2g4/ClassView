(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const state = { status: null, preview: null, file: null, busy: false, referencesRendered: false };
  const severityLabels = { blocking: "解決が必要", warning: "確認推奨", reference: "参考情報", info: "情報" };
  const classificationLabels = {
    class: "通常授業",
    special: "単発講座・特別授業",
    event: "行事・説明会",
    exam: "試験",
    holiday: "休暇",
    other: "その他",
  };
  const referenceLabels = {
    see_below_detail: "「下記参照」に関連する補足",
    schedule_detail: "クラス・教室などの補足",
    special_schedule: "予定・行事の補足",
    note: "その他の補足",
  };

  const requestJson = async (url, options) => {
    const response = await fetch(url, options);
    let payload;
    try { payload = await response.json(); }
    catch (_error) { payload = { error: "管理ツールから正しい応答を受け取れませんでした。" }; }
    if (!response.ok) throw new Error(payload.error || "処理を完了できませんでした。");
    return payload;
  };

  const setStatus = (element, message = "", type = "") => {
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ""}`;
  };

  const formatDateTime = (value) => {
    if (!value) return "記録なし";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(parsed);
  };

  const displayEntry = (entry) => {
    if (!entry) return "なし";
    const target = [entry.grades?.length ? `${entry.grades.join("・")}年` : "学年指定なし", ...(entry.groupTags || [])].join(" / ");
    const room = entry.rooms?.length ? ` / ${entry.rooms.join("・")}` : "";
    return `${entry.subjectName}（${target}${room}）`;
  };

  const makeEmpty = (message) => {
    const item = document.createElement("p");
    item.className = "timetable-empty";
    item.textContent = message;
    return item;
  };

  const renderIssues = () => {
    const list = $("#issue-list");
    const filter = $("#issue-filter").value;
    const issues = (state.preview?.issues || []).filter((item) => (
      ["blocking", "warning"].includes(item.severity) && (filter === "all" || item.severity === filter)
    ));
    list.replaceChildren();
    if (!issues.length) return list.append(makeEmpty("該当する確認事項はありません。"));
    issues.forEach((issue) => {
      const item = document.createElement("article");
      item.className = `timetable-item timetable-item--${issue.severity}`;
      const heading = document.createElement("strong");
      heading.textContent = severityLabels[issue.severity] || "確認事項";
      const message = document.createElement("p");
      message.textContent = issue.message;
      item.append(heading, message);
      if (issue.date) {
        const context = document.createElement("small");
        context.textContent = `${issue.date}${issue.period ? `・${issue.period}限` : ""}${issue.subjectRaw ? `・${issue.subjectRaw}` : ""}${issue.sourceCell ? `・セル ${issue.sourceCell}` : ""}`;
        item.append(context);
      }
      list.append(item);
    });
  };

  const appendOverview = (root, items, emptyMessage) => {
    root.replaceChildren();
    if (!items.length) return root.append(makeEmpty(emptyMessage));
    const list = document.createElement("dl");
    list.className = "timetable-overview-list";
    items.forEach((item) => {
      const label = document.createElement("dt");
      label.textContent = item.category ? (referenceLabels[item.category] || item.label) : item.label;
      const count = document.createElement("dd");
      count.textContent = `${item.count}件`;
      list.append(label, count);
    });
    root.append(list);
  };

  const renderOverview = () => {
    const counts = state.preview?.issueCounts || [];
    appendOverview($("#blocking-overview"), counts.filter((item) => item.severity === "blocking"), "解決が必要な項目はありません。");
    appendOverview($("#warning-overview"), counts.filter((item) => item.severity === "warning"), "確認推奨の項目はありません。");
    appendOverview($("#reference-overview"), counts.filter((item) => item.severity === "reference"), "参考情報はありません。");
  };

  const renderReferences = () => {
    if (state.referencesRendered) return;
    const root = $("#reference-groups");
    root.replaceChildren();
    const references = (state.preview?.issues || []).filter((item) => item.severity === "reference");
    const groups = new Map();
    references.forEach((item) => {
      const key = item.referenceCategory || "note";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    groups.forEach((items, category) => {
      const section = document.createElement("section");
      section.className = "timetable-reference-group";
      const heading = document.createElement("h4");
      heading.textContent = `${referenceLabels[category] || "補足"}（${items.length}件）`;
      const list = document.createElement("ul");
      items.forEach((item) => {
        const row = document.createElement("li");
        row.textContent = `${item.date || "日付不明"}${item.sourceCell ? `・${item.sourceCell}` : ""}：${item.subjectRaw || item.message}`;
        list.append(row);
      });
      section.append(heading, list);
      root.append(section);
    });
    state.referencesRendered = true;
  };

  const renderChanges = () => {
    const list = $("#change-list");
    const filter = $("#change-filter").value;
    const changes = (state.preview?.changes || []).filter((item) => filter === "all" || item.type === filter);
    list.replaceChildren();
    if (!changes.length) return list.append(makeEmpty("該当する変更はありません。"));
    const labels = { added: "新しく追加", removed: "削除される予定", changed: "変更" };
    changes.forEach((change) => {
      const item = document.createElement("article");
      item.className = `timetable-item timetable-item--${change.type}`;
      const heading = document.createElement("strong");
      heading.textContent = `${change.date}・${change.period}限　${labels[change.type]}`;
      item.append(heading);
      if (change.type !== "added") {
        const before = document.createElement("p");
        before.textContent = `変更前：${displayEntry(change.before)}`;
        item.append(before);
      }
      if (change.type !== "removed") {
        const after = document.createElement("p");
        after.textContent = `変更後：${displayEntry(change.after)}`;
        item.append(after);
      }
      if (change.fields?.length) {
        const fields = document.createElement("small");
        fields.textContent = `変更：${change.fields.join("、")}`;
        item.append(fields);
      }
      list.append(item);
    });
  };

  const postMapping = async (url, body) => requestJson(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  const rerun = async () => {
    if (!state.file) return;
    await analyze(state.file);
  };

  const applyMappingResult = async (result) => {
    state.status = await requestJson("/api/timetable/status");
    if (result.preview) {
      state.preview = result.preview;
      renderPreview();
    } else {
      await rerun();
    }
  };

  const formatUsageContext = (example) => {
    const grade = example.grades?.length ? `${example.grades.join("・")}年` : (example.gradeRaw || "学年指定なし");
    return `${example.date || "日付不明"}${example.period ? `・${example.period}限` : ""}・${grade}${example.sourceCell ? `・セル ${example.sourceCell}` : ""}`;
  };

  const appendUsageExamples = (root, examples = []) => {
    const buildList = (values) => {
      const list = document.createElement("ul");
      list.className = "timetable-usage-list";
      values.forEach((example) => {
        const item = document.createElement("li");
        const subject = document.createElement("strong");
        subject.textContent = example.subjectRaw || "表記不明";
        const context = document.createElement("small");
        context.textContent = formatUsageContext(example);
        item.append(subject, context);
        list.append(item);
      });
      return list;
    };
    root.append(buildList(examples.slice(0, 3)));
    if (examples.length > 3) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `すべての使用箇所を見る（${examples.length}件）`;
      details.append(summary, buildList(examples.slice(3)));
      root.append(details);
    }
  };

  const appendSubjectExamples = (root, examples = []) => {
    const buildList = (values) => {
      const list = document.createElement("ul");
      list.className = "timetable-usage-list";
      values.forEach((example) => {
        const item = document.createElement("li");
        const date = document.createElement("strong");
        date.textContent = `${example.date || "日付不明"}${example.period ? `・${example.period}限` : ""}`;
        const details = [
          example.grades?.length ? `${example.grades.join("・")}年` : (example.gradeRaw || "学年指定なし"),
          example.groupTags?.length ? `受講グループ: ${example.groupTags.join("・")}` : "",
          example.instructors?.length ? `講師情報: ${example.instructors.join("・")}` : "",
          example.rooms?.length ? `教室: ${example.rooms.join("・")}` : "",
          example.subjectRaw ? `Excel表記: ${example.subjectRaw}` : "",
          example.sourceCell ? `セル: ${example.sourceCell}` : "",
        ].filter(Boolean).join(" / ");
        const context = document.createElement("small");
        context.textContent = details;
        item.append(date, context);
        list.append(item);
      });
      return list;
    };
    root.append(buildList(examples.slice(0, 3)));
    if (examples.length > 3) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `すべての使用箇所を見る（${examples.length}件）`;
      details.append(summary, buildList(examples.slice(3)));
      root.append(details);
    }
  };

  const saveSubjectMapping = async (subjectName, courseId, button, replaceExisting = false) => {
    button.disabled = true;
    try {
      const result = await postMapping("/api/timetable/mappings/subject", {
        subjectName, courseId, previewToken: state.preview.token, replaceExisting,
      });
      await applyMappingResult(result);
      setStatus($("#analyze-status"), `「${subjectName}」をClassViewの授業と対応しました。`, "success");
    } catch (error) {
      setStatus($("#analyze-status"), error.message, "error");
    } finally {
      button.disabled = false;
    }
  };

  const saveItemClassification = async (
    subjectName, classification, button, replaceExisting = false,
  ) => {
    const label = classificationLabels[classification];
    const extra = classification === "other"
      ? "\n\n「その他」は、ほかの種類に分類できない場合だけ使用してください。" : "";
    if (!window.confirm(
      `「${subjectName}」を「${label}」として登録します。\n\n今後、同じExcel表記は通常授業として扱われません。${extra}`,
    )) return;
    button.disabled = true;
    try {
      const result = await postMapping("/api/timetable/mappings/item", {
        subjectName, classification, previewToken: state.preview.token, replaceExisting,
      });
      await applyMappingResult(result);
      setStatus($("#analyze-status"), `「${subjectName}」を「${label}」として登録しました。`, "success");
    } catch (error) {
      setStatus($("#analyze-status"), error.message, "error");
    } finally {
      button.disabled = false;
    }
  };

  const startCourseRegistration = async (subjectName, button) => {
    button.disabled = true;
    try {
      const context = await postMapping("/api/timetable/course-context", {
        previewToken: state.preview.token, subjectName,
      });
      window.location.assign(`/register?timetableContext=${encodeURIComponent(context.token)}`);
    } catch (error) {
      setStatus($("#analyze-status"), error.message, "error");
      button.disabled = false;
    }
  };

  const renderSubjectCard = (subject) => {
    const card = document.createElement("article");
    card.className = "timetable-subject-card";
    const heading = document.createElement("h6");
    heading.textContent = subject.subjectName;
    const facts = document.createElement("p");
    facts.className = "timetable-subject-facts";
    const variant = subject.courseVariantTags?.length
      ? `授業の段階: ${subject.courseVariantTags.join("・")} / ` : "";
    facts.textContent = `${variant}時間割で${subject.count}回使用`;
    card.append(heading, facts);
    appendSubjectExamples(card, subject.examples);

    if (subject.exactCourseCandidates?.length === 1) {
      const exact = subject.exactCourseCandidates[0];
      const candidate = document.createElement("div");
      candidate.className = "timetable-course-candidate";
      const text = document.createElement("p");
      text.textContent = `同じ授業名がClassViewにあります: ${exact.title}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--secondary button--compact";
      button.textContent = "この授業と対応";
      button.addEventListener("click", () => saveSubjectMapping(subject.subjectName, exact.id, button));
      candidate.append(text, button);
      card.append(candidate);
    }
    if (subject.relatedBaseCourses?.length) {
      const related = document.createElement("p");
      related.className = "timetable-related-course";
      related.textContent = `名前の近い授業があります: ${subject.relatedBaseCourses.map((item) => item.title).join("、")}。時間割では別の授業段階が指定されているため、自動では対応しません。`;
      card.append(related);
    }

    const actions = document.createElement("div");
    actions.className = "timetable-subject-actions";
    const courseActions = document.createElement("section");
    courseActions.className = "timetable-classification-choice timetable-classification-choice--course";
    const coursePrompt = document.createElement("strong");
    coursePrompt.textContent = "シラバスを持つ通常授業ですか？";
    const form = document.createElement("form");
    form.className = "timetable-existing-course-form";
    const select = document.createElement("select");
    select.required = true;
    select.append(new Option("ClassViewの授業を選択", ""));
    (state.status.courses || []).forEach((course) => select.append(new Option(
      `${course.title}${course.academicYear ? `（${course.academicYear}年度）` : ""}`,
      course.id,
    )));
    const mapButton = document.createElement("button");
    mapButton.type = "submit";
    mapButton.className = "button button--secondary button--compact";
    mapButton.textContent = "既存授業と対応";
    form.append(select, mapButton);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (select.value) saveSubjectMapping(subject.subjectName, select.value, mapButton);
    });
    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.className = "button button--compact";
    createButton.textContent = "新しい授業として登録";
    createButton.addEventListener("click", () => startCourseRegistration(subject.subjectName, createButton));
    courseActions.append(coursePrompt, form, createButton);

    const itemActions = document.createElement("section");
    itemActions.className = "timetable-classification-choice timetable-classification-choice--item";
    const itemPrompt = document.createElement("strong");
    itemPrompt.textContent = "シラバスを持たない単発の予定ですか？";
    const specialButton = document.createElement("button");
    specialButton.type = "button";
    specialButton.className = "button button--secondary button--compact";
    specialButton.textContent = "単発講座・特別授業";
    specialButton.addEventListener("click", () => (
      saveItemClassification(subject.subjectName, "special", specialButton)
    ));
    const otherForm = document.createElement("form");
    otherForm.className = "timetable-item-classification-form";
    const kindSelect = document.createElement("select");
    kindSelect.required = true;
    kindSelect.append(new Option("その他の種類を選択", ""));
    ["event", "exam", "holiday", "other"].forEach((kind) => (
      kindSelect.append(new Option(classificationLabels[kind], kind))
    ));
    const classifyButton = document.createElement("button");
    classifyButton.type = "submit";
    classifyButton.className = "button button--secondary button--compact";
    classifyButton.textContent = "この種類で登録";
    otherForm.append(kindSelect, classifyButton);
    otherForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (kindSelect.value) {
        saveItemClassification(subject.subjectName, kindSelect.value, classifyButton);
      }
    });
    itemActions.append(itemPrompt, specialButton, otherForm);
    actions.append(courseActions, itemActions);
    card.append(actions);
    return card;
  };

  const renderMappingSettings = () => {
    const root = $("#mapping-settings");
    const section = $("#mapping-settings-section");
    const mappings = state.preview.mappingSettings || [];
    root.replaceChildren();
    section.hidden = !mappings.length;
    mappings.forEach((mapping) => {
      const card = document.createElement("article");
      card.className = "timetable-mapping-setting";
      const heading = document.createElement("h4");
      heading.textContent = mapping.subjectName;
      const current = document.createElement("p");
      current.className = "timetable-mapping-current";
      current.textContent = `現在の扱い: ${mapping.classificationLabel}`;
      const course = document.createElement("p");
      course.textContent = mapping.courseId
        ? `対応するClassViewの授業: ${mapping.courseTitle || mapping.courseId}`
        : "対応するClassViewの授業: なし";
      const count = document.createElement("p");
      count.textContent = `今回の時間割で${mapping.count}回使用`;
      card.append(heading, current, course, count);
      if (mapping.examples?.length) appendSubjectExamples(card, mapping.examples);

      const changeButton = document.createElement("button");
      changeButton.type = "button";
      changeButton.className = "button button--secondary button--compact";
      changeButton.textContent = "分類を変更";
      const controls = document.createElement("div");
      controls.className = "timetable-mapping-change";
      controls.hidden = true;
      const kindLabel = document.createElement("label");
      kindLabel.textContent = "変更後の扱い";
      const kindSelect = document.createElement("select");
      Object.entries(classificationLabels).forEach(([kind, label]) => (
        kindSelect.append(new Option(label, kind, false, kind === mapping.classification))
      ));
      kindLabel.append(kindSelect);

      const courseControls = document.createElement("div");
      courseControls.className = "timetable-mapping-course-controls";
      const courseSelect = document.createElement("select");
      courseSelect.append(new Option("ClassViewの授業を選択", ""));
      (state.status.courses || []).forEach((item) => courseSelect.append(new Option(
        `${item.title}${item.academicYear ? `（${item.academicYear}年度）` : ""}`,
        item.id,
        false,
        item.id === mapping.courseId,
      )));
      const mapButton = document.createElement("button");
      mapButton.type = "button";
      mapButton.className = "button button--secondary button--compact";
      mapButton.textContent = "既存授業へ変更";
      mapButton.addEventListener("click", () => {
        if (!courseSelect.value) {
          setStatus($("#analyze-status"), "ClassViewの授業を選択してください。", "error");
          return;
        }
        if (!window.confirm(
          `「${mapping.subjectName}」を通常授業へ変更し、選択したClassViewの授業と対応しますか？`,
        )) return;
        saveSubjectMapping(mapping.subjectName, courseSelect.value, mapButton, true);
      });
      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "button button--compact";
      createButton.textContent = "新しい授業として登録";
      createButton.addEventListener("click", () => {
        if (!window.confirm(
          `「${mapping.subjectName}」を通常授業へ変更します。授業が正常保存された後に現在の分類が置き換わります。続けますか？`,
        )) return;
        startCourseRegistration(mapping.subjectName, createButton);
      });
      courseControls.append(courseSelect, mapButton, createButton);

      const itemButton = document.createElement("button");
      itemButton.type = "button";
      itemButton.className = "button button--secondary button--compact";
      itemButton.textContent = "この分類へ変更";
      itemButton.addEventListener("click", () => (
        saveItemClassification(mapping.subjectName, kindSelect.value, itemButton, true)
      ));
      const updateControls = () => {
        const isCourse = kindSelect.value === "class";
        courseControls.hidden = !isCourse;
        itemButton.hidden = isCourse;
      };
      kindSelect.addEventListener("change", updateControls);
      controls.append(kindLabel, courseControls, itemButton);
      updateControls();
      changeButton.addEventListener("click", () => {
        controls.hidden = !controls.hidden;
        changeButton.textContent = controls.hidden ? "分類を変更" : "変更を閉じる";
      });
      card.append(changeButton, controls);
      root.append(card);
    });
  };

  const renderMappings = () => {
    const subjectRoot = $("#subject-mappings");
    const groupRoot = $("#group-mappings");
    subjectRoot.replaceChildren();
    groupRoot.replaceChildren();
    const subjects = state.preview.unregisteredSubjects || [];
    const groups = (state.preview.tokenSummary?.groups || []).filter((item) => !item.resolved);
    const bases = new Map();
    subjects.forEach((subject) => {
      if (!bases.has(subject.subjectBaseName)) bases.set(subject.subjectBaseName, []);
      bases.get(subject.subjectBaseName).push(subject);
    });
    bases.forEach((variants, baseName) => {
      const section = document.createElement("section");
      section.className = "timetable-subject-family";
      const heading = document.createElement("h5");
      heading.textContent = baseName;
      const progress = document.createElement("p");
      progress.textContent = variants.length > 1
        ? `${variants.length}種類の授業段階を個別に登録してください。`
        : "ClassViewに対応する授業を確認してください。";
      section.append(heading, progress);
      variants.forEach((subject) => section.append(renderSubjectCard(subject)));
      subjectRoot.append(section);
    });
    groups.forEach((group) => {
      const card = document.createElement("article");
      card.className = "timetable-group-card";
      const heading = document.createElement("h5");
      heading.textContent = group.rawTokens.map((item) => item.rawToken).join(" / ");
      const count = document.createElement("p");
      count.className = "timetable-group-count";
      count.textContent = `${group.count}件で使用（alias: ${group.key}）`;
      card.append(heading, count);
      appendUsageExamples(card, group.examples);

      const row = document.createElement("form");
      row.className = "timetable-group-controls";
      const selectLabel = document.createElement("label");
      selectLabel.textContent = "既存のグループへ対応";
      const select = document.createElement("select");
      select.append(new Option("既存グループを選択", ""));
      (state.status.canonicalGroups || []).forEach((item) => select.append(new Option(item.displayName, item.id)));
      selectLabel.append(select);
      const inputLabel = document.createElement("label");
      inputLabel.textContent = "新しいグループとして登録";
      const input = document.createElement("input");
      input.placeholder = "例：A組";
      inputLabel.append(input);
      const button = document.createElement("button");
      button.className = "button button--secondary button--compact";
      button.type = "submit";
      button.textContent = "対応を登録";
      select.addEventListener("change", () => { if (select.value) input.value = ""; });
      input.addEventListener("input", () => { if (input.value) select.value = ""; });
      row.append(selectLabel, inputLabel, button);
      row.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!select.value && !input.value.trim()) {
          return setStatus($("#analyze-status"), "既存グループを選ぶか、新しいグループ名を入力してください。", "error");
        }
        button.disabled = true;
        try {
          const result = await postMapping("/api/timetable/mappings/group", {
            rawToken: group.key, groupId: select.value, displayName: input.value.trim(),
            previewToken: state.preview.token,
          });
          await applyMappingResult(result);
        }
        catch (error) { setStatus($("#analyze-status"), error.message, "error"); }
        finally { button.disabled = false; }
      });
      card.append(row);
      groupRoot.append(card);
    });
    $("#subject-mapping-section").hidden = !subjects.length;
    $("#group-mapping-section").hidden = !groups.length;
    $("#mapping-section").hidden = !subjects.length && !groups.length;
  };

  const renderTokenSummaryList = (root, items, emptyMessage) => {
    root.replaceChildren();
    if (!items.length) return root.append(makeEmpty(emptyMessage));
    const list = document.createElement("dl");
    list.className = "timetable-token-list";
    items.forEach((item) => {
      const token = document.createElement("dt");
      token.textContent = item.rawTokens.map((raw) => raw.rawToken).join(" / ");
      const count = document.createElement("dd");
      count.textContent = `${item.count}件`;
      list.append(token, count);
    });
    root.append(list);
  };

  const renderTokenSummary = () => {
    const variants = state.preview.tokenSummary?.courseVariants || [];
    const instructors = state.preview.tokenSummary?.instructors || [];
    renderTokenSummaryList($("#variant-summary"), variants, "授業区分表記はありません。");
    renderTokenSummaryList($("#instructor-summary"), instructors, "講師表記はありません。");
    $("#token-summary-section").hidden = !variants.length && !instructors.length;
  };

  const renderPreview = () => {
    const payload = state.preview;
    state.referencesRendered = false;
    $("#review-section").hidden = false;
    $("#review-counts").textContent = `${payload.entryCount}件 / ${payload.dateCount}日`;
    $("#review-summary").textContent = `${payload.entryCount}件の予定を認識しました。解決が必要 ${payload.blockingCount}件、確認推奨 ${payload.warningCount}件、参考情報 ${payload.referenceCount || 0}件です。`;
    $("#review-summary").className = `dashboard-status-summary${payload.blockingCount ? " is-error" : payload.warningCount ? " is-behind" : ""}`;
    $("#warnings-confirmed").checked = false;
    $("#warning-confirm-row").hidden = payload.warningCount === 0;
    $("#save-timetable").disabled = payload.blockingCount > 0;
    $("#reference-section").hidden = !payload.referenceCount;
    $("#reference-section").open = false;
    $("#reference-summary").textContent = `参考情報を表示（${payload.referenceCount || 0}件）`;
    $("#reference-groups").replaceChildren();
    renderOverview();
    renderMappings();
    renderMappingSettings();
    renderTokenSummary();
    renderIssues();
    renderChanges();
    $("#review-section").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const analyze = async (file) => {
    if (state.busy) return;
    state.busy = true;
    state.file = file;
    $("#analyze-button").disabled = true;
    setStatus($("#analyze-status"), "Excelを解析しています。内容によって少し時間がかかります…");
    try {
      const formData = new FormData();
      formData.append("excel", file, file.name);
      formData.append("sheetName", $("#timetable-sheet").value);
      formData.append("startDate", $("#timetable-start").value);
      formData.append("endDate", $("#timetable-end").value);
      formData.append("sourceModifiedAt", new Date(file.lastModified).toISOString());
      state.preview = await requestJson("/api/timetable/analyze", { method: "POST", body: formData });
      setStatus($("#analyze-status"), "解析が完了しました。変更内容を確認してください。", "success");
      renderPreview();
    } catch (error) {
      setStatus($("#analyze-status"), error.message, "error");
    } finally {
      state.busy = false;
      $("#analyze-button").disabled = false;
    }
  };

  $("#timetable-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const file = $("#timetable-excel").files[0];
    if (file) analyze(file);
  });

  $("#timetable-excel").addEventListener("change", () => {
    const file = $("#timetable-excel").files[0];
    if (!file || !state.status?.lastImportedAt) return;
    const importedAt = new Date(state.status.lastImportedAt).getTime();
    if (file.lastModified > importedAt) {
      $("#last-import").textContent = `時間割Excelに未反映の変更がある可能性があります。Excel更新：${formatDateTime(new Date(file.lastModified).toISOString())} / ClassView最終取込：${formatDateTime(state.status.lastImportedAt)}`;
      $("#last-import").classList.add("is-warning");
    }
  });

  $("#save-timetable").addEventListener("click", async () => {
    const button = $("#save-timetable");
    button.disabled = true;
    setStatus($("#save-status"), "時間割を検証して保存しています…");
    try {
      const result = await requestJson("/api/timetable/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.preview.token, warningsAcknowledged: $("#warnings-confirmed").checked }),
      });
      setStatus($("#save-status"), result.message, "success");
      state.preview = null;
      button.disabled = true;
      await loadStatus();
    } catch (error) {
      setStatus($("#save-status"), error.message, "error");
      button.disabled = Boolean(state.preview?.blockingCount);
    }
  });

  $("#issue-filter").addEventListener("change", renderIssues);
  $("#change-filter").addEventListener("change", renderChanges);
  $("#reference-section").addEventListener("toggle", () => {
    if ($("#reference-section").open) renderReferences();
  });

  const loadStatus = async () => {
    try {
      state.status = await requestJson("/api/timetable/status");
      $("#timetable-sheet").value = state.status.sheetName;
      $("#last-import").textContent = state.status.lastImportedAt
        ? `前回取込：${formatDateTime(state.status.lastImportedAt)} / ${state.status.lastFilename || "ファイル名不明"} / 登録 ${state.status.entryCount}件`
        : "時間割はまだ取り込まれていません。";
    } catch (error) {
      $("#last-import").textContent = error.message;
    }
  };

  const today = new Date();
  const localDate = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  $("#timetable-start").value = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
  $("#timetable-end").value = localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const initialize = async () => {
    await loadStatus();
    const previewToken = new URLSearchParams(window.location.search).get("preview");
    if (!previewToken) return;
    try {
      state.preview = await requestJson(`/api/timetable/previews/${encodeURIComponent(previewToken)}`);
      setStatus($("#analyze-status"), "前回の解析結果を復元しました。", "success");
      renderPreview();
    } catch (error) {
      setStatus($("#analyze-status"), `${error.message} Excelをもう一度選択してください。`, "error");
    }
  };
  initialize();
})();
