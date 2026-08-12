(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const state = { diagnostic: "", publicUrl: "", loading: false, canPublish: false };
  const statusSummary = $("#status-summary");
  const checksList = $("#system-checks");
  const backupSummary = $("#backup-summary");
  const countBadge = $("#unpublished-count");
  const changesList = $("#unpublished-list");
  const emptyChanges = $("#unpublished-empty");
  const publishButton = $("#publish-button");
  const publicSiteLink = $("#public-site-link");
  const publishStatus = $("#publish-status");
  const progress = $("#publish-progress");
  const supportPanel = $("#support-panel");
  const supportMessage = $("#support-message");
  const diagnosticDetails = $("#diagnostic-details");
  const reconnectButton = $("#reconnect-button");
  const historyList = $("#publication-history");

  const setStatus = (element, message = "", type = "") => {
    element.textContent = message;
    element.className = `status${type ? ` is-${type}` : ""}`;
  };

  const requestJson = async (url, options) => {
    const response = await fetch(url, options);
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = { error: "管理ツールから正しい応答を受け取れませんでした。" };
    }
    if (!response.ok) {
      const error = new Error(payload.error || "処理を完了できませんでした。");
      error.code = payload.code || "request_failed";
      error.diagnostic = payload.diagnostic || "";
      throw error;
    }
    return payload;
  };

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const renderChecks = (checks) => {
    checksList.replaceChildren();
    checks.forEach((check) => {
      const item = document.createElement("li");
      item.className = `system-check system-check--${check.state}`;
      const mark = document.createElement("span");
      mark.className = "system-check__mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = check.state === "ok" ? "✓" : check.state === "warning" ? "!" : "×";
      const label = document.createElement("strong");
      label.textContent = check.label;
      const message = document.createElement("span");
      message.textContent = check.message;
      item.append(mark, label, message);
      checksList.append(item);
    });
  };

  const renderChanges = (changes) => {
    changesList.replaceChildren();
    countBadge.textContent = `${changes.length}件`;
    emptyChanges.hidden = changes.length > 0;
    changesList.hidden = changes.length === 0;
    changes.forEach((change) => {
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = change.title;
      const detail = document.createElement("span");
      const year = change.academicYear ? `${change.academicYear}年度・` : "";
      detail.textContent = `${year}${change.description}`;
      item.append(heading, detail);
      changesList.append(item);
    });
  };

  const showSupport = (message, diagnostic = "", code = "") => {
    supportPanel.hidden = false;
    supportMessage.textContent = message;
    state.diagnostic = diagnostic || state.diagnostic || "診断情報はありません。";
    diagnosticDetails.textContent = state.diagnostic;
    reconnectButton.hidden = code !== "authentication_required";
  };

  const hideSupport = () => {
    supportPanel.hidden = true;
    reconnectButton.hidden = true;
  };

  const renderStatus = (payload) => {
    state.diagnostic = payload.diagnostic || "";
    state.publicUrl = payload.publicUrl || "";
    statusSummary.textContent = payload.syncMessage;
    statusSummary.className = `dashboard-status-summary is-${payload.syncState}`;
    renderChecks(payload.checks || []);
    renderChanges(payload.unpublishedChanges || []);
    backupSummary.textContent = payload.latestBackup
      ? `最新バックアップ：${formatDate(payload.latestBackup)}`
      : "バックアップは最初の保存時に自動作成されます。";
    state.canPublish = Boolean(payload.canPublish);
    publishButton.disabled = !state.canPublish || state.loading;
    if (state.publicUrl) {
      publicSiteLink.href = state.publicUrl;
      publicSiteLink.hidden = false;
    } else {
      publicSiteLink.hidden = true;
    }
    const errorCheck = (payload.checks || []).find((check) => check.state === "error");
    const warningNeedsHelp = ["conflict", "connection", "error"].includes(payload.syncState);
    if (errorCheck || warningNeedsHelp) {
      showSupport(errorCheck?.message || payload.syncMessage, payload.diagnostic, payload.supportCode);
    } else {
      hideSupport();
    }
  };

  const loadStatus = async ({ refresh = false, autoUpdate = false } = {}) => {
    if (state.loading) return;
    statusSummary.textContent = refresh ? "最新状態を確認しています…" : "状態を確認しています…";
    try {
      const query = new URLSearchParams({
        refresh: refresh ? "1" : "0",
        autoUpdate: autoUpdate ? "1" : "0",
      });
      const payload = await requestJson(`/api/admin/status?${query}`);
      renderStatus(payload);
    } catch (error) {
      statusSummary.textContent = error.message;
      statusSummary.className = "dashboard-status-summary is-error";
      publishButton.disabled = true;
      showSupport(error.message, error.diagnostic, error.code);
    }
  };

  const loadHistory = async () => {
    try {
      const payload = await requestJson("/api/admin/history");
      historyList.replaceChildren();
      if (!payload.history.length) {
        const item = document.createElement("li");
        item.textContent = "公開履歴はまだありません。";
        historyList.append(item);
        return;
      }
      payload.history.forEach((entry) => {
        const item = document.createElement("li");
        const date = document.createElement("time");
        date.dateTime = entry.publishedAt;
        date.textContent = formatDate(entry.publishedAt);
        const summary = document.createElement("span");
        summary.textContent = entry.summary.replace(/^ClassView:\s*/, "");
        item.append(date, summary);
        historyList.append(item);
      });
    } catch (_error) {
      historyList.innerHTML = "<li>公開履歴を読み込めませんでした。</li>";
    }
  };

  const setProgress = (completedCount) => {
    progress.hidden = false;
    progress.querySelectorAll("[data-publish-step]").forEach((item, index) => {
      item.classList.toggle("is-complete", index < completedCount);
      item.classList.toggle("is-current", index === completedCount);
    });
  };

  publishButton.addEventListener("click", async () => {
    state.loading = true;
    publishButton.disabled = true;
    hideSupport();
    setStatus(publishStatus, "公開前の確認を行っています…");
    setProgress(0);
    try {
      setProgress(1);
      const result = await requestJson("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setProgress(3);
      setStatus(
        publishStatus,
        `${result.message} 公開サイトへの反映には少し時間がかかる場合があります。`,
        "success"
      );
      if (result.publicUrl) {
        publicSiteLink.href = result.publicUrl;
        publicSiteLink.hidden = false;
      }
      await Promise.all([loadStatus(), loadHistory()]);
    } catch (error) {
      progress.hidden = true;
      setStatus(publishStatus, error.message, "error");
      showSupport(error.message, error.diagnostic, error.code);
    } finally {
      state.loading = false;
      publishButton.disabled = !state.canPublish;
    }
  });

  $("#refresh-status-button").addEventListener("click", () => loadStatus({ refresh: true, autoUpdate: true }));

  $("#copy-diagnostic-button").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.diagnostic || "診断情報はありません。");
      setStatus($("#support-status"), "診断情報をコピーしました。", "success");
    } catch (_error) {
      setStatus($("#support-status"), "コピーできませんでした。技術情報を開いて手動でコピーしてください。", "error");
    }
  });

  reconnectButton.addEventListener("click", async () => {
    reconnectButton.disabled = true;
    try {
      const result = await requestJson("/api/admin/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setStatus($("#support-status"), result.message, "success");
    } catch (error) {
      setStatus($("#support-status"), error.message, "error");
    } finally {
      reconnectButton.disabled = false;
    }
  });

  $("#shutdown-button").addEventListener("click", async () => {
    try {
      await requestJson("/api/admin/shutdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      document.body.innerHTML = '<main class="shutdown-message"><h1>ClassView管理ツールを終了しました</h1><p>この画面を閉じてください。</p></main>';
    } catch (error) {
      setStatus(publishStatus, error.message, "error");
      showSupport(error.message, error.diagnostic, error.code);
    }
  });

  Promise.all([loadStatus({ refresh: true, autoUpdate: true }), loadHistory()]);
})();
