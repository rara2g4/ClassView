((global) => {
  "use strict";

  const personal = global.ClassViewPersonalTimetable;
  if (typeof document === "undefined" || !personal) return;

  const form = document.querySelector("#onboarding-form");
  if (!form) return;

  const gradeInput = document.querySelector("#onboarding-grade");
  const homeroomInput = document.querySelector("#onboarding-homeroom");
  const termInput = document.querySelector("#onboarding-term");
  const termField = document.querySelector("#onboarding-term-field");
  const periodNote = document.querySelector("#onboarding-period-note");
  const errorNode = document.querySelector("#onboarding-error");
  const submitButton = document.querySelector("#onboarding-submit");

  const state = {
    manifest: null,
    siteVersion: null,
    period: null,
    storage: null,
    profile: null,
  };

  const showError = (message) => {
    errorNode.textContent = message;
    errorNode.hidden = false;
  };

  const clearError = () => {
    errorNode.hidden = true;
    errorNode.textContent = "";
  };

  const fetchJson = async (path) => {
    const response = await fetch(new URL(path, document.baseURI), { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + path);
    return response.json();
  };

  const localDateKey = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  };

  const selectedDateKey = () => {
    const parameter = new URLSearchParams(global.location.search).get("date");
    return personal.parseDateKey(parameter) ? parameter : localDateKey();
  };

  const setHomerooms = (selectedId = "") => {
    const grade = Number(gradeInput.value);
    const homerooms = (state.manifest?.homerooms || []).filter(
      (item) => item && item.grade === grade && typeof item.id === "string",
    );
    const prompt = document.createElement("option");
    prompt.value = "";
    prompt.textContent = homerooms.length
      ? "選択してください"
      : grade ? "この学年の所属組は未登録です" : "学年を選択してください";
    homeroomInput.replaceChildren(prompt);

    for (const item of homerooms) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      homeroomInput.append(option);
    }
    homeroomInput.disabled = homerooms.length === 0;
    homeroomInput.value = homerooms.some((item) => item.id === selectedId) ? selectedId : "";
  };

  const nextTimetableUrl = () => {
    const url = new URL("timetable.html", document.baseURI);
    const params = new URLSearchParams(global.location.search);
    if (!params.has("view")) params.set("view", "week");
    url.search = params.toString();
    return url.href;
  };

  const initialize = async () => {
    try {
      const [manifest, siteVersion] = await Promise.all([
        fetchJson("data/timetable/manifest.json"),
        fetchJson("data/site-version.json").catch(() => ({ version: null })),
      ]);
      if (
        !manifest || typeof manifest.academicYear !== "string" ||
        typeof manifest.version !== "string" || !Array.isArray(manifest.homerooms)
      ) {
        throw new Error("Invalid timetable manifest");
      }
      state.manifest = manifest;
      state.siteVersion = typeof siteVersion?.version === "string" ? siteVersion.version : null;
      state.period = personal.periodContextForDate(selectedDateKey(), manifest);

      termField.hidden = state.period.valid;
      termInput.disabled = state.period.valid;
      termInput.required = !state.period.valid;
      if (state.period.valid) {
        termInput.value = state.period.currentPeriod.term;
        periodNote.textContent = "データ年度：" + manifest.academicYear + "。表示日の前期・後期は学校の設定から自動判定します。";
      } else {
        periodNote.textContent = "データ年度：" + manifest.academicYear +
          "。表示日に対応する正式な学期日程が未登録です。期間を選んで設定を保存できますが、学校側で日程が設定されるまでは個人時間割に反映されません。";
      }

      const storageResult = personal.resolveBrowserStorage(global);
      if (storageResult.status !== "ready") {
        showError("このブラウザでは設定を保存できません。学校全体の時間割をご利用ください。");
        return;
      }
      state.storage = storageResult.storage;

      let loaded = personal.loadProfile(state.storage, { homerooms: manifest.homerooms });
      if (loaded.status === "migrated") {
        const result = personal.saveProfile(state.storage, loaded.profile);
        loaded = result.saved
          ? { status: "ready", profile: loaded.profile }
          : { status: "unavailable", profile: null };
      }
      if (loaded.status === "ready") {
        state.profile = loaded.profile;
        gradeInput.value = String(loaded.profile.grade);
        setHomerooms(loaded.profile.homeroomId);
        if (!state.period.valid) termInput.value = loaded.profile.term;
      } else if (loaded.status !== "unset") {
        showError("以前の設定はそのまま利用できません。学年・所属組を設定し直すと、保存済みの設定が更新されます。");
      }

      gradeInput.disabled = false;
      submitButton.disabled = false;
      if (loaded.status !== "ready") setHomerooms();
    } catch (error) {
      console.error("初期設定の読み込みに失敗しました。", error);
      showError("学校の設定データを読み込めませんでした。学校全体の時間割は引き続き確認できます。");
    }
  };

  gradeInput.addEventListener("change", () => {
    clearError();
    setHomerooms();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();
    if (!state.manifest || !state.storage || !state.period) return;

    const identity = {
      academicYear: state.manifest.academicYear,
      term: state.period.valid ? state.period.currentPeriod.term : termInput.value,
      grade: Number(gradeInput.value),
      homeroomId: homeroomInput.value,
    };
    const unchanged = state.profile &&
      state.profile.academicYear === identity.academicYear &&
      state.profile.term === identity.term &&
      state.profile.grade === identity.grade &&
      state.profile.homeroomId === identity.homeroomId;
    const created = personal.createProfile({
      ...identity,
      manualSelectedCourseIds: unchanged ? [...state.profile.manualSelectedCourseIds] : [],
      dataVersion: { site: state.siteVersion, timetable: state.manifest.version },
    });
    if (!created.ok) {
      showError("学年・所属組・期間を確認してください。");
      return;
    }
    const saved = personal.saveProfile(state.storage, created.profile);
    if (!saved.saved) {
      showError("設定を保存できませんでした。ブラウザの保存設定をご確認ください。");
      return;
    }
    global.location.assign(nextTimetableUrl());
  });

  void initialize();
})(globalThis);
