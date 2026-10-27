// Study & Grounded Q&A Page Script
// Loads active notes into Document Reader, handles grounded Q&A, evidence locator,
// out-of-scope refusals, and live demo checklist integration.

document.addEventListener("DOMContentLoaded", async () => {
  const activeTopicTitle = document.getElementById("activeTopicTitle");
  const activeTopicSubject = document.getElementById("activeTopicSubject");
  const activeNotesSummary = document.getElementById("activeNotesSummary");
  const notesDocumentReader = document.getElementById("notesDocumentReader");
  const notesSearchInput = document.getElementById("notesSearchInput");

  const questionInput = document.getElementById("questionInput");
  const btnSubmitQuestion = document.getElementById("btnSubmitQuestion");
  const chipSupported = document.getElementById("chipSupported");
  const chipUnsupported = document.getElementById("chipUnsupported");

  const btnModeStrict = document.getElementById("btnModeStrict");
  const btnModeGeneral = document.getElementById("btnModeGeneral");
  const btnClearChat = document.getElementById("btnClearChat");
  const chatThreadContainer = document.getElementById("chatThreadContainer");
  const chatModeBanner = document.getElementById("chatModeBanner");
  const chatBannerText = document.getElementById("chatBannerText");
  const chatEngineLabel = document.getElementById("chatEngineLabel");

  let currentChatMode = "strict";
  let chatHistory = [];
  try {
    const saved = sessionStorage.getItem("study_chat_history");
    if (saved) chatHistory = JSON.parse(saved);
  } catch (e) {
    chatHistory = [];
  }

  let currentActiveData = null;

  // ---------------------------------------------------------------------------
  // 1. Load active notes into reader (IMMEDIATE EXECUTION)
  // ---------------------------------------------------------------------------
  async function loadActiveNotes() {
    try {
      if (notesDocumentReader) {
        notesDocumentReader.innerHTML = `
          <div class="reader-empty" style="display:flex;flex-direction:column;align-items:center;gap:12px;">
            <svg class="btn-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a10 10 0 0 1 10 10"/>
            </svg>
            <span>Loading verified course material…</span>
          </div>`;
      }

      const data = await API.getActiveNotes();
      currentActiveData = data;

      if (activeTopicTitle) activeTopicTitle.textContent = data.title;
      if (activeTopicSubject) activeTopicSubject.textContent = data.subject || "Academic Course Material";
      if (activeNotesSummary && data.indexedSummary) {
        activeNotesSummary.textContent = `${data.indexedSummary.totalSentences} verified sentences across ${data.indexedSummary.totalParagraphs} paragraphs (${data.indexedSummary.sections.length} sections)`;
      }

      renderDocumentReader(data.sections);
      updateDemoChips(data.demoQuestions);
      refreshChecklist();
    } catch (err) {
      console.error("Failed to load active notes:", err);
      showToast(err.message || "Failed to load course material", "error");
      if (notesDocumentReader) {
        notesDocumentReader.innerHTML = `
          <div class="reader-empty">
            <p style="color:#EF4444;margin-bottom:8px;">⚠️ Unable to load active notes.</p>
            <button type="button" class="btn-primary btn-sm" onclick="location.reload()" style="margin-top:8px;">Retry Loading</button>
          </div>`;
      }
    }
  }

  // Render notes with continuous paragraph IDs (para_1 to para_N) and indexed sentences
  function renderDocumentReader(sections) {
    if (!notesDocumentReader) return;
    if (!sections || sections.length === 0) {
      notesDocumentReader.innerHTML = `<div class="reader-empty">No notes content loaded. <a href="/upload">Upload material here</a>.</div>`;
      return;
    }

    let html = "";
    let globalParaIndex = 0;
    let globalSentenceIndex = 0;

    sections.forEach((sec, sIdx) => {
      html += `<div class="reader-section" data-section-idx="${sIdx + 1}">`;
      html += `<h3 class="reader-section-title">${escapeHtml(sec.title)}</h3>`;

      sec.paragraphs.forEach((para) => {
        globalParaIndex++;
        const currentParaId = `para_${globalParaIndex}`;

        html += `<div class="reader-paragraph" id="${currentParaId}" data-para-idx="${globalParaIndex}">`;
        html += `<span class="para-marker" title="Paragraph §${globalParaIndex}">§${globalParaIndex}</span>`;

        // Split paragraph lines and bullets into readable blocks
        const lines = para.split("\n");
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;

          const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ");
          const cleanLine = trimmed.replace(/^[-*•]\s*|\d+[.)]\s+/, "");

          html += `<div class="para-line ${isBullet ? 'is-bullet' : ''}">`;
          if (isBullet) {
            html += `<span class="bullet-dot" aria-hidden="true">•</span>`;
          }

          // Protect abbreviations and decimals before splitting into sentences
          const PH = "\u0001";
          const protectedText = cleanLine
            .replace(/(\d)\.(?=\d)/g, "$1" + PH)
            .replace(/\b(?:e\.g|i\.e|vs|Fig|fig|approx|Dr|Mr|Mrs|Prof|cf|Eq|eq|Ref)\./g, m => m.replace(/\./g, PH));
          const rawSentences = protectedText.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [protectedText];

          rawSentences.forEach((rawSent) => {
            const sentText = rawSent.split(PH).join(".").trim();
            if (!sentText) return;
            globalSentenceIndex++;
            const sentId = `sent_${globalSentenceIndex}`;
            html += `<span class="note-sentence" id="${sentId}" data-para-idx="${globalParaIndex}" data-sentence-idx="${globalSentenceIndex}" data-sentence-text="${escapeHtml(sentText)}">${escapeHtml(sentText)}</span> `;
          });

          html += `</div>`;
        });

        html += `</div>`;
      });

      html += `</div>`;
    });

    notesDocumentReader.innerHTML = html;
  }

  // Quick chips for demo queries
  function updateDemoChips(demoQuestions) {
    if (demoQuestions && demoQuestions.supported && chipSupported) {
      chipSupported.style.display = "inline-flex";
      chipSupported.querySelector(".chip-text").textContent = `Query: "${demoQuestions.supported.question.slice(0, 48)}…"`;
      chipSupported.onclick = () => {
        questionInput.value = demoQuestions.supported.question;
        sendChatMessage();
      };
    } else if (chipSupported) {
      chipSupported.style.display = "none";
    }

    if (demoQuestions && demoQuestions.unsupported && chipUnsupported) {
      chipUnsupported.style.display = "inline-flex";
      chipUnsupported.querySelector(".chip-text").textContent = `Unsupported: "${demoQuestions.unsupported.question.slice(0, 46)}…"`;
      chipUnsupported.onclick = () => {
        questionInput.value = demoQuestions.unsupported.question;
        sendChatMessage();
      };
    } else if (chipUnsupported) {
      chipUnsupported.style.display = "none";
    }
  }

  // ---------------------------------------------------------------------------
  // 2. AI Study Chatbot (Strict Grounded vs General Mode) with Groq API
  // ---------------------------------------------------------------------------

  function setChatMode(mode) {
    currentChatMode = mode;
    if (btnModeStrict) btnModeStrict.classList.toggle("active", mode === "strict");
    if (btnModeGeneral) btnModeGeneral.classList.toggle("active", mode === "general");

    if (chatModeBanner && chatBannerText) {
      if (mode === "strict") {
        chatModeBanner.className = "chat-mode-banner strict-banner";
        chatBannerText.innerHTML = `<strong>Strict Mode:</strong> Answers strictly verified against uploaded notes. Out-of-scope questions are refused without AI hallucination.`;
        if (chatEngineLabel) chatEngineLabel.textContent = "Strict Grounded Mode";
        if (questionInput) questionInput.placeholder = "Ask a question from your lecture notes (Enter to send, Shift+Enter for newline)...";
      } else {
        chatModeBanner.className = "chat-mode-banner general-banner";
        chatBannerText.innerHTML = `<strong>General Mode:</strong> Open AI tutor powered by Groq. Ask any academic question freely without note restrictions.`;
        if (chatEngineLabel) chatEngineLabel.textContent = "General Mode • Groq AI";
        if (questionInput) questionInput.placeholder = "Ask anything! e.g. 'Can you explain the difference between AC and DC with an analogy?'...";
      }
    }
  }

  if (btnModeStrict) btnModeStrict.addEventListener("click", () => setChatMode("strict"));
  if (btnModeGeneral) btnModeGeneral.addEventListener("click", () => setChatMode("general"));

  // Clear Chat History
  if (btnClearChat) {
    btnClearChat.addEventListener("click", () => {
      chatHistory = [];
      sessionStorage.removeItem("study_chat_history");
      if (chatThreadContainer) {
        chatThreadContainer.innerHTML = `
          <div class="chat-msg assistant-msg">
            <div class="msg-avatar">AI</div>
            <div class="msg-bubble">
              <p>Chat history cleared. How can I help you study your notes today?</p>
            </div>
          </div>
        `;
      }
      clearEvidenceHighlights();
      showToast("Conversation history cleared", "info");
    });
  }

  // Format markdown into safe HTML
  function formatChatMarkdown(text) {
    if (!text) return "";
    let safe = escapeHtml(text);
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");
    safe = safe.replace(/`([^`]+)`/g, "<code style='background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;'>$1</code>");
    
    const paras = safe.split(/\n\n+/);
    return paras.map(p => {
      const lines = p.split(/\n/);
      const isList = lines.some(l => /^\s*[-*•]\s+/.test(l));
      if (isList) {
        const items = lines.map(l => {
          if (/^\s*[-*•]\s+/.test(l)) {
            return `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`;
          }
          return l;
        }).join("");
        return `<ul style="margin:4px 0 8px 18px;padding:0;">${items}</ul>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    }).join("");
  }

  // Send message to Chatbot
  async function sendChatMessage() {
    const query = questionInput.value.trim();
    if (!query) {
      showToast("Please enter a question or topic to study.", "error");
      return;
    }

    // Append user message to chat UI
    appendChatBubble("user", query);
    questionInput.value = "";

    // Show typing indicator
    const typingIndicator = showTypingIndicator();

    btnSubmitQuestion.disabled = true;
    btnSubmitQuestion.innerHTML = `
      <svg class="btn-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
      <span>Thinking…</span>
    `;

    clearEvidenceHighlights();

    try {
      // Send only clean { role, content } to API to satisfy Groq/OpenAI message schema
      const apiHistory = chatHistory.slice(-6).map(item => ({
        role: item.role,
        content: item.content
      }));
      const result = await API.chatWithAI(query, currentChatMode, apiHistory);
      typingIndicator.remove();

      if (result.isRefusal) {
        // Render refusal bubble
        appendRefusalBubble(result.reply);
        // Save to history
        chatHistory.push({ role: "user", content: query });
        chatHistory.push({ role: "assistant", content: result.reply });
      } else {
        // Render assistant answer bubble with citations
        appendChatBubble("assistant", result.reply, result.evidence);
        // Save to history with citations attached
        chatHistory.push({ role: "user", content: query });
        chatHistory.push({ role: "assistant", content: result.reply, evidence: result.evidence });

        // If evidence is present, immediately highlight the primary evidence in reader
        if (result.evidence && result.evidence.length > 0) {
          const firstEv = result.evidence[0];
          highlightEvidenceInReader(firstEv.paragraph, firstEv.verbatimQuote);
        }
      }

      // Keep only last 3 conversations (6 messages: 3 user + 3 assistant)
      if (chatHistory.length > 6) {
        chatHistory = chatHistory.slice(-6);
      }
      sessionStorage.setItem("study_chat_history", JSON.stringify(chatHistory));
      refreshChecklist();

    } catch (err) {
      typingIndicator.remove();
      appendRefusalBubble("⚠️ Error: " + err.message);
      showToast(err.message, "error");
    } finally {
      btnSubmitQuestion.disabled = false;
      btnSubmitQuestion.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <span>Send</span>
      `;
    }
  }

  // Append chat bubble
  function appendChatBubble(role, text, evidence = []) {
    if (!chatThreadContainer) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = `chat-msg ${role === "user" ? "user-msg" : "assistant-msg"}`;

    let evidenceHtml = "";
    if (evidence && evidence.length > 0) {
      evidenceHtml = `<div class="chat-evidence-footer">`;
      evidence.forEach((ev) => {
        evidenceHtml += `
          <button type="button" class="evidence-chip-btn" data-para="${ev.paragraph}" data-quote="${escapeHtml(ev.verbatimQuote)}" data-section="${escapeHtml(ev.section || '')}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>§ Paragraph ${ev.paragraph} Evidence</span>
          </button>
        `;
      });
      evidenceHtml += `</div>`;
    }

    msgDiv.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "You" : "AI"}</div>
      <div class="msg-bubble">
        ${role === "user" ? `<p>${escapeHtml(text)}</p>` : formatChatMarkdown(text)}
        ${evidenceHtml}
      </div>
    `;

    // Attach click listeners to evidence buttons
    if (evidence && evidence.length > 0) {
      msgDiv.querySelectorAll(".evidence-chip-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const paraNum = parseInt(btn.dataset.para, 10);
          const quote = btn.dataset.quote || "";
          highlightEvidenceInReader(paraNum, quote);
        });
      });
    }

    chatThreadContainer.appendChild(msgDiv);
    chatThreadContainer.scrollTop = chatThreadContainer.scrollHeight;
  }

  // Append refusal bubble
  function appendRefusalBubble(text) {
    if (!chatThreadContainer) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-msg assistant-msg";
    msgDiv.innerHTML = `
      <div class="msg-avatar" style="color:#EF4444;">⛔</div>
      <div class="msg-bubble msg-refusal-box">
        ${formatChatMarkdown(text)}
      </div>
    `;
    chatThreadContainer.appendChild(msgDiv);
    chatThreadContainer.scrollTop = chatThreadContainer.scrollHeight;
  }

  // Show typing indicator
  function showTypingIndicator() {
    const typingDiv = document.createElement("div");
    typingDiv.className = "chat-msg assistant-msg";
    typingDiv.innerHTML = `
      <div class="msg-avatar">AI</div>
      <div class="typing-indicator">
        <span>AI is thinking</span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    chatThreadContainer.appendChild(typingDiv);
    chatThreadContainer.scrollTop = chatThreadContainer.scrollHeight;
    return typingDiv;
  }

  // Restore saved chat history on load
  function restoreSavedChatHistory() {
    if (!chatThreadContainer || !chatHistory || chatHistory.length === 0) return;
    try {
      chatThreadContainer.innerHTML = "";
      chatHistory.forEach(item => {
        if (item.role === "assistant" && typeof item.content === "string" && item.content.startsWith("⛔")) {
          appendRefusalBubble(item.content);
        } else {
          appendChatBubble(item.role, item.content, item.evidence || []);
        }
      });
    } catch (e) {
      console.warn("Error restoring chat history:", e);
    }
  }

  if (btnSubmitQuestion) {
    btnSubmitQuestion.addEventListener("click", sendChatMessage);
  }
  if (questionInput) {
    questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Robust In-Reader Evidence Locator & Paragraph Jumping
  // ---------------------------------------------------------------------------

  function normalizeTextForMatch(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function highlightEvidenceInReader(paraNum, quoteText) {
    clearEvidenceHighlights();
    if (!notesDocumentReader) return;

    let targetPara = null;
    if (paraNum) {
      targetPara = document.getElementById(`para_${paraNum}`) || 
                   notesDocumentReader.querySelector(`.reader-paragraph[data-para-idx="${paraNum}"]`);
    }

    let targetSentence = null;
    const cleanQuote = normalizeTextForMatch(quoteText);

    // 1. If paragraph is located, search inside it first
    if (targetPara) {
      targetPara.classList.add("para-highlighted");

      if (cleanQuote) {
        const paraSentences = targetPara.querySelectorAll(".note-sentence");
        // Exact / substring match inside paragraph
        for (const span of paraSentences) {
          const sText = normalizeTextForMatch(span.textContent);
          if (sText && (sText.includes(cleanQuote) || cleanQuote.includes(sText) || 
              (sText.length > 20 && cleanQuote.slice(0, 20) === sText.slice(0, 20)))) {
            targetSentence = span;
            break;
          }
        }

        // Token overlap fallback inside paragraph
        if (!targetSentence && paraSentences.length > 0) {
          const quoteWords = cleanQuote.split(" ").filter(w => w.length >= 3);
          let bestScore = 0;
          for (const span of paraSentences) {
            const sText = normalizeTextForMatch(span.textContent);
            const score = quoteWords.filter(w => sText.includes(w)).length;
            if (score > bestScore) {
              bestScore = score;
              targetSentence = span;
            }
          }
        }
      }
    }

    // 2. Global search fallback across all document sentences if not found inside paragraph
    if (!targetSentence && cleanQuote) {
      const allSentences = notesDocumentReader.querySelectorAll(".note-sentence");
      for (const span of allSentences) {
        const sText = normalizeTextForMatch(span.textContent);
        if (sText && (sText.includes(cleanQuote) || cleanQuote.includes(sText) || 
            (sText.length > 20 && cleanQuote.slice(0, 20) === sText.slice(0, 20)))) {
          targetSentence = span;
          const parentPara = span.closest(".reader-paragraph");
          if (parentPara) parentPara.classList.add("para-highlighted");
          break;
        }
      }
    }

    // 3. Apply highlighting and scroll smoothly into view
    if (targetSentence) {
      targetSentence.classList.add("evidence-highlighted");
      targetSentence.scrollIntoView({ behavior: "smooth", block: "center" });
      const pIdx = targetPara ? targetPara.dataset.paraIdx : (targetSentence.dataset.paraIdx || paraNum);
      showToast(`Showing § Paragraph ${pIdx} verified evidence`, "info");
    } else if (targetPara) {
      targetPara.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast(`Showing § Paragraph ${paraNum} verified source`, "info");
    } else {
      showToast("Evidence located in lecture material", "info");
    }
  }

  function clearEvidenceHighlights() {
    if (!notesDocumentReader) return;
    notesDocumentReader.querySelectorAll(".evidence-highlighted").forEach(el => {
      el.classList.remove("evidence-highlighted");
    });
    notesDocumentReader.querySelectorAll(".para-highlighted").forEach(el => {
      el.classList.remove("para-highlighted");
    });
  }

  // In-document search input handler
  if (notesSearchInput) {
    notesSearchInput.addEventListener("input", (e) => {
      const term = e.target.value.trim().toLowerCase();
      const sentences = notesDocumentReader.querySelectorAll(".note-sentence");

      sentences.forEach(span => {
        if (!term) {
          span.classList.remove("search-match");
        } else if (span.textContent.toLowerCase().includes(term)) {
          span.classList.add("search-match");
        } else {
          span.classList.remove("search-match");
        }
      });
    });
  }

  // Demo Checklist Bar
  async function refreshChecklist() {
    const listEl = document.getElementById("demoChecklistItems");
    if (!listEl) return;
    try {
      const data = await API.getDemoChecklist();
      listEl.innerHTML = "";

      data.items.forEach(item => {
        const row = document.createElement("div");
        row.className = `checklist-row-item ${item.status === 'PASSED' ? 'row-passed' : 'row-ready'}`;
        row.innerHTML = `
          <div class="chk-status-col">
            <span class="chk-status-badge ${item.status === 'PASSED' ? 'badge-passed' : 'badge-ready'}">${item.status}</span>
          </div>
          <div class="chk-info-col">
            <span class="chk-title">${escapeHtml(item.title)}</span>
            <span class="chk-desc">${escapeHtml(item.description)}</span>
          </div>
        `;
        listEl.appendChild(row);
      });
    } catch (e) {
      // Non-critical
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Initial Launch Sequencing
  // ---------------------------------------------------------------------------
  // Load notes immediately so student never sees stuck loading screen
  await loadActiveNotes();
  restoreSavedChatHistory();
});
