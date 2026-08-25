((global) => {
  "use strict";

  const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

  const normalizeVersion = (value) =>
    typeof value === "string" && VERSION_PATTERN.test(value) ? value : "";

  const versionedUrl = (path, version, baseUri) => {
    const url = new URL(path, baseUri);
    const safeVersion = normalizeVersion(version);
    if (safeVersion) url.searchParams.set("v", safeVersion);
    return url.href;
  };

  const api = Object.freeze({ normalizeVersion, versionedUrl });
  global.ClassViewSiteLoader = api;

  if (typeof document === "undefined") return;

  const loadScript = (path, version) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = versionedUrl(path, version, document.baseURI);
      script.async = false;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });

  const loadSiteVersion = async () => {
    const url = new URL("./data/site-version.json", document.baseURI);
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const data = await response.json();
    return normalizeVersion(data?.version);
  };

  const applyStylesheetVersion = (version) => {
    if (!version) return;
    const stylesheet = document.querySelector("link[data-site-stylesheet]");
    const path = stylesheet?.dataset.siteHref;
    if (!stylesheet || !path) return;
    stylesheet.href = versionedUrl(path, version, document.baseURI);
  };

  const loadPageAssets = async () => {
    let version = "";
    try {
      version = await loadSiteVersion();
      applyStylesheetVersion(version);
    } catch (error) {
      console.warn("公開バージョンを確認できないため、通常URLで表示します。", error);
    }

    const scripts = [...document.querySelectorAll("script[data-site-src]")];
    for (const placeholder of scripts) {
      await loadScript(placeholder.dataset.siteSrc, version);
    }
  };

  void loadPageAssets().catch((error) => {
    console.error("ClassViewの画面資産を読み込めませんでした。", error);
  });
})(globalThis);
