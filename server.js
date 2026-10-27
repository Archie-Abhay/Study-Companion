// Express Server for PS 01: Study Companion from Real Notes
// Centered around Gemma 4 Grounding Engine

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { SAMPLE_TOPICS } = require("./sampleNotes");
const { GemmaGroundingEngine } = require("./gemmaEngine");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Explicit Multi-Page Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/upload", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "upload.html"));
});

app.get("/study", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "study.html"));
});

app.get("/quiz", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "quiz.html"));
});

const engine = new GemmaGroundingEngine();

// Native .env file loader (zero extra dependencies)
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

// Helper to call Groq Chat API with automatic fallback
async function callGroqChat(messages, model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b", temperature = 0.3) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in .env file.");
  }

  // Sanitize messages so Groq/OpenAI never rejects unexpected properties like 'evidence'
  const cleanMessages = messages.map(m => ({
    role: String(m.role || "user"),
    content: String(m.content || "")
  }));

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: cleanMessages,
      temperature: temperature,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    if (model !== "openai/gpt-oss-120b") {
      console.warn(`Groq request with ${model} failed, attempting fallback to openai/gpt-oss-120b...`);
      return callGroqChat(messages, "openai/gpt-oss-120b", temperature);
    }
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response received from AI model.";
}

// In-memory active session state
let activeTopicId = "electricity";
let activeRawNotes = SAMPLE_TOPICS.electricity.content;
let activeIndexedNotes = engine.indexNotes(activeRawNotes);
let activeQuiz = engine.generatePracticeQuiz(activeIndexedNotes, activeTopicId, 5);

const apiRouter = express.Router();

// Demo checklist state tracking
let demoChecklistState = {
  step1_notes_loaded: true,
  step2_supported_qa_run: false,
  step3_quiz_incorrect_run: false,
  step4_unsupported_qa_refused: false
};

// 1. Get system & engine info
apiRouter.get("/status", (req, res) => {
  res.json({
    status: "online",
    model: engine.modelName,
    version: engine.version,
    activeTopicId,
    totalParagraphs: activeIndexedNotes.totalParagraphs,
    totalSentences: activeIndexedNotes.totalSentences,
    learnerProfile: engine.learnerProfile || { totalAttempted: 0, totalCorrect: 0, streak: 0, currentDifficulty: "Analytical", accuracy: 0 },
    demoChecklistState
  });
});

// Active notes for study and quiz pages
apiRouter.get("/active-notes", (req, res) => {
  const currentTopic = SAMPLE_TOPICS[activeTopicId] || {
    id: "custom",
    title: "Custom Uploaded Notes",
    subject: "User Academic Material",
    content: activeRawNotes
  };

  res.json({
    activeTopicId,
    title: currentTopic.title,
    subject: currentTopic.subject,
    rawNotes: activeRawNotes,
    indexedSummary: {
      totalParagraphs: activeIndexedNotes.totalParagraphs,
      totalSentences: activeIndexedNotes.totalSentences,
      sections: activeIndexedNotes.sections.map(s => s.title)
    },
    sections: activeIndexedNotes.sections,
    demoQuestions: currentTopic.demoQuestions || null,
    learnerProfile: engine.learnerProfile || { totalAttempted: 0, totalCorrect: 0, streak: 0, currentDifficulty: "Analytical", accuracy: 0 }
  });
});

// 2. Get available preset topics
apiRouter.get("/presets", (req, res) => {
  const presets = Object.values(SAMPLE_TOPICS).map(t => ({
    id: t.id,
    title: t.title,
    subject: t.subject,
    pages: t.pages,
    summary: t.summary,
    demoQuestions: t.demoQuestions
  }));
  res.json({ presets, currentTopicId: activeTopicId });
});

// 3. Load a preset topic
apiRouter.post("/load-topic", (req, res) => {
  const { topicId, quizCount } = req.body;
  if (!SAMPLE_TOPICS[topicId]) {
    return res.status(404).json({ error: "Preset topic not found" });
  }

  activeTopicId = topicId;
  activeRawNotes = SAMPLE_TOPICS[topicId].content;
  activeIndexedNotes = engine.indexNotes(activeRawNotes);
  activeQuiz = engine.generatePracticeQuiz(activeIndexedNotes, activeTopicId, quizCount || 5);
  demoChecklistState.step1_notes_loaded = true;

  res.json({
    success: true,
    topic: SAMPLE_TOPICS[topicId],
    indexedSummary: {
      totalParagraphs: activeIndexedNotes.totalParagraphs,
      totalSentences: activeIndexedNotes.totalSentences,
      sections: activeIndexedNotes.sections.map(s => s.title)
    },
    demoQuestions: SAMPLE_TOPICS[topicId].demoQuestions,
    demoChecklistState
  });
});

// 4. Upload or paste custom notes
apiRouter.post("/upload-notes", (req, res) => {
  const { text, title, quizCount } = req.body;
  const notesText = typeof text === "string" ? text : (text ? String(text) : "");
  if (!notesText || notesText.trim().length < 20) {
    return res.status(400).json({ error: "Please provide notes with at least 20 characters." });
  }

  activeTopicId = "custom";
  activeRawNotes = notesText;
  activeIndexedNotes = engine.indexNotes(activeRawNotes);
  activeQuiz = engine.generatePracticeQuiz(activeIndexedNotes, "custom", quizCount || 5);
  demoChecklistState.step1_notes_loaded = true;

  res.json({
    success: true,
    topic: {
      id: "custom",
      title: title || "Custom Uploaded Notes",
      subject: "User Academic Material",
      content: text
    },
    indexedSummary: {
      totalParagraphs: activeIndexedNotes.totalParagraphs,
      totalSentences: activeIndexedNotes.totalSentences,
      sections: activeIndexedNotes.sections.map(s => s.title)
    },
    demoChecklistState
  });
});

// 5. Ask question strictly grounded with Gemma 4
apiRouter.post("/ask", (req, res) => {
  const { question } = req.body;
  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: "Question cannot be empty." });
  }

  const result = engine.answerQuestion(activeIndexedNotes, question);

  // Update live demo checklist flags
  if (!result.isRefusal && result.status === "SUPPORTED_GROUNDED") {
    demoChecklistState.step2_supported_qa_run = true;
  } else if (result.isRefusal) {
    demoChecklistState.step4_unsupported_qa_refused = true;
  }

  res.json({
    ...result,
    demoChecklistState
  });
});

// 5b. Dual-Mode AI Chatbot with Groq API (Strict vs General, 3 Conversations History)
apiRouter.post("/chat", async (req, res) => {
  try {
    const { message, mode = "strict", history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    // Keep only the last 3 conversations (max 6 messages: 3 user + 3 assistant)
    // Strictly sanitize to { role, content } so Groq never rejects custom fields
    const validHistory = (Array.isArray(history) ? history.slice(-6) : [])
      .filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .map(item => ({ role: item.role, content: item.content }));

    if (mode === "strict") {
      // Step 1: Check context match against active indexed notes
      const grounding = engine.answerQuestion(activeIndexedNotes, message);

      // Strict mode: If not found in uploaded notes, strictly REFUSE and DO NOT call Groq API!
      if (grounding.isRefusal) {
        demoChecklistState.step4_unsupported_qa_refused = true;
        return res.json({
          isRefusal: true,
          mode: "strict",
          reply: `⛔ **Not Found in Notes**\n\nThis question cannot be answered because the verified facts or keywords are not present in your uploaded notes (*${SAMPLE_TOPICS[activeTopicId]?.title || 'Uploaded Notes'}*).\n\n💡 *Tip: In **Strict Mode**, I only answer facts directly verified in your notes. Switch to **General Mode** above to ask broader questions using open AI knowledge.*`,
          refusalReason: grounding.message,
          evidence: [],
          demoChecklistState
        });
      }

      // Step 2: Context matched! Assemble grounded context from notes
      demoChecklistState.step2_supported_qa_run = true;
      const contextText = grounding.evidence.map((ev, i) => 
        `[Citation ${i + 1}] (${ev.section}, Paragraph ${ev.paragraph}): "${ev.verbatimQuote}"`
      ).join("\n\n");

      const systemPrompt = `You are an academic Study Companion strictly grounded in the user's uploaded lecture notes on "${SAMPLE_TOPICS[activeTopicId]?.title || 'Course Material'}".

STRICT GROUNDING RULES:
1. Answer the student's question accurately, directly, and EXCLUSIVELY using the Note Context provided below.
2. Cite the exact Section and Paragraph number from the context for each key point.
3. Quote relevant verbatim phrases from the context to verify your statements.
4. If an aspect of the question is NOT answered in the Note Context, explicitly state: "This detail is not mentioned in the notes." Do NOT guess or hallucinate external facts.
5. Format the answer cleanly using markdown with bold headings and bullet points where helpful.

VERIFIED NOTE CONTEXT:
${contextText}`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...validHistory,
        { role: "user", content: message }
      ];

      let llmReply = "";
      try {
        llmReply = await callGroqChat(messages, process.env.GROQ_MODEL || "qwen/qwen3.8-27b", 0.2);
      } catch (apiErr) {
        console.warn("Groq API error in strict mode, falling back to local grounded synthesis:", apiErr.message);
        llmReply = grounding.answer;
      }

      return res.json({
        isRefusal: false,
        mode: "strict",
        reply: llmReply,
        groundingConfidence: grounding.groundingConfidence,
        evidence: grounding.evidence,
        primarySentenceId: grounding.primarySentenceId,
        primaryParagraphIndex: grounding.primaryParagraphIndex,
        demoChecklistState
      });
    } else {
      // General Mode: Open AI conversation without context restrictions
      const systemPrompt = `You are an intelligent, encouraging AI Study Companion and academic tutor.
1. Provide clear, accurate, and structured explanations to the student's questions.
2. Use relatable analogies, examples, and formulas where appropriate.
3. If explaining technical or scientific topics, make it intuitive and easy to remember.
4. Format your answer with clean markdown, bold terms, and bullet points.`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...validHistory,
        { role: "user", content: message }
      ];

      const llmReply = await callGroqChat(messages, process.env.GROQ_MODEL || "qwen/qwen3.8-27b", 0.6);

      return res.json({
        isRefusal: false,
        mode: "general",
        reply: llmReply,
        evidence: [],
        demoChecklistState
      });
    }
  } catch (error) {
    console.error("Chat endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to process chat message." });
  }
});

// 6. Get practice quiz
apiRouter.get("/quiz", (req, res) => {
  // Strip correct answer index from public quiz payload to keep it an authentic test
  const sanitizedQuestions = activeQuiz.map(q => ({
    id: q.id,
    concept: q.concept,
    difficulty: q.difficulty,
    question: q.question,
    options: q.options,
    hintLevel1: q.hintLevel1 || q.hint,
    hintLevel2: q.hintLevel2
  }));

  res.json({
    totalQuestions: activeQuiz.length,
    questions: sanitizedQuestions,
    topicId: activeTopicId
  });
});

// 6b. Generate practice quiz with custom limit (5 to 15 questions) and difficulty
apiRouter.post("/quiz/generate", (req, res) => {
  let { count, difficulty } = req.body;
  count = parseInt(count, 10);
  if (isNaN(count) || count < 5) count = 5;
  if (count > 15) count = 15;

  activeQuiz = engine.generatePracticeQuiz(activeIndexedNotes, activeTopicId, count, difficulty);

  const sanitizedQuestions = activeQuiz.map(q => ({
    id: q.id,
    concept: q.concept,
    difficulty: q.difficulty,
    question: q.question,
    options: q.options,
    hintLevel1: q.hintLevel1 || q.hint,
    hintLevel2: q.hintLevel2
  }));

  res.json({
    success: true,
    totalQuestions: activeQuiz.length,
    requestedCount: count,
    difficulty: difficulty || "Adaptive",
    questions: sanitizedQuestions,
    topicId: activeTopicId
  });
});

// 7. Evaluate practice quiz answer with detailed pedagogy, hints, and mistake diagnostics
apiRouter.post("/quiz/evaluate", (req, res) => {
  const { questionId, selectedIndex } = req.body;
  const question = activeQuiz.find(q => q.id === questionId);
  if (!question) {
    return res.status(404).json({ error: "Question not found." });
  }

  if (selectedIndex === undefined || selectedIndex === null) {
    return res.status(400).json({ error: "Please select an answer." });
  }

  const evaluation = engine.evaluateQuizAnswer(question, Number(selectedIndex));

  if (!evaluation.isCorrect) {
    demoChecklistState.step3_quiz_incorrect_run = true;
  }

  res.json({
    ...evaluation,
    demoChecklistState
  });
});

// 8. Get Live Demo Checklist status & presets
apiRouter.get("/demo-checklist", (req, res) => {
  const currentDemo = SAMPLE_TOPICS[activeTopicId] || SAMPLE_TOPICS.electricity;
  res.json({
    checklistState: demoChecklistState,
    items: [
      {
        id: "step1",
        title: "1. Load sample notes on one academic topic",
        status: demoChecklistState.step1_notes_loaded ? "PASSED" : "PENDING",
        description: `Notes loaded on: "${SAMPLE_TOPICS[activeTopicId]?.title || 'Custom Notes'}" (${activeIndexedNotes.totalSentences} verified sentences across ${activeIndexedNotes.totalParagraphs} paragraphs).`
      },
      {
        id: "step2",
        title: "2. Ask supported question & inspect evidence",
        status: demoChecklistState.step2_supported_qa_run ? "PASSED" : "READY",
        suggestedQuery: currentDemo.demoQuestions?.supported?.question,
        expectedEvidence: currentDemo.demoQuestions?.supported?.expectedEvidenceFragment,
        description: "Ask a grounded question; verify the verbatim source quote, paragraph location, and confidence badge."
      },
      {
        id: "step3",
        title: "3. Intentionally answer quiz question incorrectly",
        status: demoChecklistState.step3_quiz_incorrect_run ? "PASSED" : "READY",
        description: "Select an incorrect option on the practice quiz to trigger Gemma 4's misconception analysis, progressive hints, and exact evidence citation."
      },
      {
        id: "step4",
        title: "4. Ask unsupported question to prove zero hallucination",
        status: demoChecklistState.step4_unsupported_qa_refused ? "PASSED" : "READY",
        suggestedQuery: currentDemo.demoQuestions?.unsupported?.question,
        description: "Ask a query outside the notes; verify that Gemma 4 explicitly flags and refuses to answer without fabricating external facts."
      }
    ]
  });
});

app.use("/api", apiRouter);
app.use("/.netlify/functions/api", apiRouter);
app.use("/.netlify/functions/api/api", apiRouter);

// Start server
let server = null;
if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Gemma 4 Grounded Study Companion server online!`);
    console.log(`📍 Web App URL: http://localhost:${PORT}`);
    console.log(`📚 Active Topic: ${SAMPLE_TOPICS[activeTopicId]?.title || 'Electricity: Complete Study Notes'}`);
    console.log(`🎯 Live Demo Checklist ready with 1-click execution`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, server, engine };
