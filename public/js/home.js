// Home Page (Notes Intake) Script for Study Companion
// Handles note upload, pasting, live statistics, sample loading, and navigation to /study

document.addEventListener("DOMContentLoaded", () => {
  const notesTextarea = document.getElementById("notesTextarea");
  const notesTitleInput = document.getElementById("notesTitleInput");
  const fileInput = document.getElementById("fileInput");
  const dropZone = document.getElementById("dropZone");
  const btnSaveAndContinue = document.getElementById("btnSaveAndContinue");
  const btnLoadCrispr = document.getElementById("btnLoadCrispr");
  const counterWords = document.getElementById("counterWords");
  const counterSentences = document.getElementById("counterSentences");
  const counterChars = document.getElementById("counterChars");
  const presetContainer = document.getElementById("presetContainer");

  // Sample notes are dynamically loaded from active notes API (/api/active-notes)

  // Update live counters
  function updateCounters() {
    const text = notesTextarea.value || "";
    const charCount = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.trim() ? (text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || []).length : 0;

    counterWords.textContent = `${words} words`;
    counterSentences.textContent = `${sentences} sentences`;
    counterChars.textContent = `${charCount} characters`;

    if (btnSaveAndContinue) {
      btnSaveAndContinue.disabled = text.trim().length < 20;
    }
  }

  notesTextarea.addEventListener("input", updateCounters);

  // File Upload handler
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        notesTextarea.value = event.target.result;
        if (!notesTitleInput.value) {
          notesTitleInput.value = file.name.replace(/\.[^/.]+$/, "");
        }
        updateCounters();
        showToast(`Loaded file: ${file.name}`, "info");
      };
      reader.onerror = () => {
        showToast("Error reading file", "error");
      };
      reader.readAsText(file);
    });
  }

  // Drag and drop support
  if (dropZone) {
    ["dragenter", "dragover"].forEach(event => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(event => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
      });
    });
    dropZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          notesTextarea.value = event.target.result;
          if (!notesTitleInput.value) {
            notesTitleInput.value = file.name.replace(/\.[^/.]+$/, "");
          }
          updateCounters();
          showToast(`Imported: ${file.name}`, "info");
        };
        reader.readAsText(file);
      }
    });
  }

  // Load Sample Topic button
  if (btnLoadCrispr) {
    btnLoadCrispr.addEventListener("click", async () => {
      try {
        btnLoadCrispr.disabled = true;
        const res = await API.getActiveNotes();
        if (res && res.rawNotes) {
          notesTextarea.value = res.rawNotes;
          notesTitleInput.value = res.title || "Electricity: Complete Study Notes (Class 10 Level)";
          updateCounters();
          showToast(`Loaded sample: ${res.title}`, "info");
        }
      } catch (err) {
        showToast("Error loading sample notes: " + err.message, "error");
      } finally {
        btnLoadCrispr.disabled = false;
      }
    });
  }

  // Save Notes and Navigate to /study
  if (btnSaveAndContinue) {
    btnSaveAndContinue.addEventListener("click", async () => {
      const text = notesTextarea.value.trim();
      if (text.length < 20) {
        showToast("Please provide notes with at least 20 characters.", "error");
        return;
      }

      btnSaveAndContinue.disabled = true;
      btnSaveAndContinue.innerHTML = `
        <svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
        <span>Saving Notes…</span>
      `;

      try {
        const title = notesTitleInput.value.trim() || "Custom Uploaded Notes";
        const result = await API.uploadNotes(text, title);
        showToast("Notes saved successfully! Redirecting to Study Questions...", "success");
        setTimeout(() => {
          window.location.href = "/study";
        }, 400);
      } catch (err) {
        showToast(err.message || "Failed to upload notes", "error");
        btnSaveAndContinue.disabled = false;
        btnSaveAndContinue.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
          <span>Continue to Questions →</span>
        `;
      }
    });
  }

  // Load Presets onto the right column
  async function loadPresetsList() {
    if (!presetContainer) return;
    try {
      const data = await API.getPresets();
      presetContainer.innerHTML = "";

      data.presets.forEach((preset) => {
        const isCurrent = preset.id === data.currentTopicId;
        const card = document.createElement("div");
        card.className = `preset-topic-card ${isCurrent ? "active-preset" : ""}`;
        card.innerHTML = `
          <div class="preset-card-header">
            <div class="preset-badge">${escapeHtml(preset.subject)}</div>
            <span class="preset-pages">${preset.pages} Pages</span>
          </div>
          <h3 class="preset-card-title">${escapeHtml(preset.title)}</h3>
          <p class="preset-card-summary">${escapeHtml(preset.summary)}</p>
          <div class="preset-card-footer">
            <span class="preset-meta-tag">15 Practice Qs Ready</span>
            <button type="button" class="btn-secondary btn-sm btn-select-preset" data-topic-id="${preset.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
              <span>Load & Study →</span>
            </button>
          </div>
        `;

        const btnSelect = card.querySelector(".btn-select-preset");
        btnSelect.addEventListener("click", async (e) => {
          e.stopPropagation();
          btnSelect.disabled = true;
          btnSelect.textContent = "Loading…";
          try {
            await API.loadTopic(preset.id);
            showToast(`Loaded ${preset.title}! Navigating to Q&A...`, "success");
            setTimeout(() => {
              window.location.href = "/study";
            }, 350);
          } catch (err) {
            showToast(err.message, "error");
            btnSelect.disabled = false;
            btnSelect.textContent = "Load & Study →";
          }
        });

        presetContainer.appendChild(card);
      });
    } catch (err) {
      presetContainer.innerHTML = `<p class="text-secondary">Error loading course presets: ${escapeHtml(err.message)}</p>`;
    }
  }

  loadPresetsList();
  updateCounters();
});
