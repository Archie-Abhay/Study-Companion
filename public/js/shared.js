// Shared Utilities and API Layer for Multi-Page Study Companion
// Strictly Grounded in Lecture Notes with Gemma 4

const API = {
  // Get active system status, engine version, learner profile
  async getStatus() {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("Failed to load engine status");
    return res.json();
  },

  // Get active notes data, sections, and summaries
  async getActiveNotes() {
    const res = await fetch("/api/active-notes");
    if (!res.ok) throw new Error("Failed to load active lecture material");
    return res.json();
  },

  // Get presets
  async getPresets() {
    const res = await fetch("/api/presets");
    if (!res.ok) throw new Error("Failed to load presets");
    return res.json();
  },

  // Load a preset topic
  async loadTopic(topicId, quizCount = 5) {
    const res = await fetch("/api/load-topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, quizCount })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to load topic");
    }
    const data = await res.json();
    localStorage.setItem("study_active_topic", topicId);
    return data;
  },

  // Upload or paste custom notes
  async uploadNotes(text, title, quizCount = 5) {
    const res = await fetch("/api/upload-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title, quizCount })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload notes");
    }
    const data = await res.json();
    localStorage.setItem("study_active_topic", "custom");
    if (title) localStorage.setItem("study_custom_title", title);
    return data;
  },

  // Ask question grounded strictly in notes
  async askQuestion(question) {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Question evaluation failed");
    }
    return res.json();
  },

  // Dual-mode AI Chatbot with Groq API (Strict vs General mode, last 3 turns history)
  async chatWithAI(message, mode = "strict", history = []) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, mode, history })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Chat request failed");
    }
    return res.json();
  },

  // Get current active quiz
  async getQuiz() {
    const res = await fetch("/api/quiz");
    if (!res.ok) throw new Error("Failed to fetch quiz");
    return res.json();
  },

  // Generate quiz with limit (5 to 15 questions) and difficulty
  async generateQuiz(count = 5, difficulty = "Adaptive") {
    const res = await fetch("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, difficulty })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to generate practice quiz");
    }
    return res.json();
  },

  // Evaluate quiz answer
  async evaluateQuiz(questionId, selectedIndex) {
    const res = await fetch("/api/quiz/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, selectedIndex })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Evaluation failed");
    }
    return res.json();
  },

  // Get demo checklist
  async getDemoChecklist() {
    const res = await fetch("/api/demo-checklist");
    if (!res.ok) throw new Error("Failed to load demo checklist");
    return res.json();
  }
};

// Simple clean toast notifier (solid, monochrome, no floating glow)
function showToast(message, type = "info") {
  let toastEl = document.getElementById("appToast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "appToast";
    toastEl.className = "app-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = `app-toast visible toast-${type}`;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.className = "app-toast";
  }, 3500);
}

// Global escape HTML helper to prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
