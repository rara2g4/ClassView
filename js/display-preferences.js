(() => {
  "use strict";

  const key = "classview.displayPreferences";
  const fields = {
    theme: { label: "外観", options: { light: "ライト", dark: "ダーク", system: "システム設定" } },
    density: { label: "表示密度", options: { compact: "コンパクト", standard: "標準", roomy: "ゆったり" } },
    textSize: { label: "文字サイズ", options: { small: "小", standard: "標準", large: "大" } },
  };
  const defaults = { theme: "system", density: "standard", textSize: "standard" };
  const read = () => {
    const result = { ...defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      for (const [name, field] of Object.entries(fields)) {
        if (typeof saved?.[name] === "string" && Object.hasOwn(field.options, saved[name])) {
          result[name] = saved[name];
        }
      }
    } catch { /* Storage can be disabled or contain invalid JSON. */ }
    return result;
  };

  let preferences = read();
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const { theme, density, textSize } = preferences;
    Object.assign(document.documentElement.dataset, {
      theme: theme === "system" ? (dark.matches ? "dark" : "light") : theme,
      density,
      textSize,
    });
  };
  apply();
  dark.addEventListener("change", apply);

  document.addEventListener("DOMContentLoaded", () => {
    const trigger = document.querySelector("#display-preferences-button");
    const panel = document.createElement("dialog");
    panel.className = "preferences-panel";
    panel.id = "display-preferences";
    panel.setAttribute("aria-labelledby", "display-preferences-title");
    panel.innerHTML = '<header class="panel-heading"><h2 id="display-preferences-title">表示設定</h2><button type="button" aria-label="表示設定を閉じる">×</button></header>';
    const radios = [];
    for (const [name, field] of Object.entries(fields)) {
      const group = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = field.label;
      group.append(legend);
      const row = document.createElement("div");
      row.className = "preference-options";
      for (const [value, text] of Object.entries(field.options)) {
        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = name;
        radio.value = value;
        label.append(radio, text);
        row.append(label);
        radios.push(radio);
      }
      group.append(row);
      panel.append(group);
    }
    const sync = () => {
      for (const radio of radios) radio.checked = preferences[radio.name] === radio.value;
    };
    panel.addEventListener("change", ({ target }) => {
      preferences[target.name] = target.value;
      apply();
      try { localStorage.setItem(key, JSON.stringify(preferences)); }
      catch { /* The current page can still use the selected settings. */ }
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== key && event.key !== null) return;
      preferences = read();
      apply();
      sync();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) { preferences = read(); apply(); sync(); }
    });
    trigger.addEventListener("click", () => {
      sync();
      panel.showModal();
      panel.querySelector("input:checked").focus();
    });
    panel.querySelector("button").addEventListener("click", () => panel.close());
    panel.addEventListener("click", (event) => {
      if (event.target !== panel) return;
      const { left, right, top, bottom } = panel.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) panel.close();
    });
    document.body.append(panel);
  });
})();
