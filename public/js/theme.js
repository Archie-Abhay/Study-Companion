// Theme management for Study Companion
// Supports light and dark modes with system preference detection and localStorage persistence

(function () {
  const STORAGE_KEY = "study_theme_preference";

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggles = document.querySelectorAll(".theme-toggle-btn");
    toggles.forEach((btn) => {
      btn.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
      btn.setAttribute("title", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    });
  }

  // Set initial theme immediately
  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);

  // When DOM is ready, attach event listeners to all theme toggle buttons
  document.addEventListener("DOMContentLoaded", () => {
    // Re-apply to sync any buttons that rendered
    applyTheme(document.documentElement.getAttribute("data-theme") || initialTheme);

    const toggleBtns = document.querySelectorAll(".theme-toggle-btn");
    toggleBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    });

    // Listen for OS theme changes if user hasn't explicitly set a preference
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  });
})();
