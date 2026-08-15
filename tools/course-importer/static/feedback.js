(() => {
  "use strict";

  const setStatus = (element, message, type = "") => {
    if (!element) return;
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ""}`;
  };

  const requestJson = async (url, options) => {
    const response = await fetch(url, options);
    let payload = {};
    try { payload = await response.json(); } catch (_error) { /* friendly fallback below */ }
    if (!response.ok) {
      const error = new Error(payload.error || "処理を完了できませんでした。もう一度お試しください。");
      error.diagnostic = payload.diagnostic || "";
      throw error;
    }
    return payload;
  };

  const importForm = document.querySelector("#feedback-import-form");
  if (importForm) {
    const input = document.querySelector("#feedback-csv");
    const filename = document.querySelector("#feedback-file-name");
    const status = document.querySelector("#feedback-import-status");
    const warnings = document.querySelector("#feedback-import-warnings");
    const technical = document.querySelector("#feedback-import-technical");
    const technicalText = document.querySelector("#feedback-import-technical-text");
    input.addEventListener("change", () => { filename.textContent = input.files[0]?.name || "ファイルが選択されていません"; });
    importForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input.files.length) { setStatus(status, "回答CSVを選択してください。", "error"); return; }
      const button = importForm.querySelector("button[type='submit']");
      button.disabled = true;
      warnings.replaceChildren();
      technical.hidden = true;
      technical.open = false;
      technicalText.textContent = "";
      setStatus(status, "回答を確認しています…");
      try {
        const body = new FormData(); body.append("csv", input.files[0]);
        const result = await requestJson("/api/feedback/import", { method: "POST", body });
        const duplicateText = result.duplicates ? ` 重複していた${result.duplicates}件は追加していません。` : "";
        setStatus(status, result.message + duplicateText, "success");
        (result.warnings || []).forEach((message) => { const item = document.createElement("li"); item.textContent = message; warnings.append(item); });
        window.setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        setStatus(status, error.message, "error");
        if (error.diagnostic) {
          technicalText.textContent = error.diagnostic;
          technical.hidden = false;
        }
      }
      finally { button.disabled = false; }
    });
  }

  document.querySelectorAll(".feedback-issue-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      const statusElement = form.querySelector(".status");
      button.disabled = true;
      try {
        const result = await requestJson(`/api/feedback/issues/${encodeURIComponent(form.dataset.issueId)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: form.elements.status.value, note: form.elements.note.value }),
        });
        setStatus(statusElement, result.message, "success");
      } catch (error) { setStatus(statusElement, error.message, "error"); }
      finally { button.disabled = false; }
    });
  });

  const summaryButton = document.querySelector("#feedback-summary-button");
  if (summaryButton) summaryButton.addEventListener("click", async () => {
    const status = document.querySelector("#feedback-summary-status");
    summaryButton.disabled = true;
    setStatus(status, "公開用データを準備しています…");
    try {
      const result = await requestJson("/api/feedback/public-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: summaryButton.dataset.courseId, academicYear: summaryButton.dataset.academicYear }),
      });
      setStatus(status, result.message, "success");
    } catch (error) { setStatus(status, error.message, "error"); summaryButton.disabled = false; }
  });
})();
