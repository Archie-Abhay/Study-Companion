# 🌟 Gemma 4 Grounded Study Companion
> **Track 1 - PS 01: Study Companion from Real Notes (Focus: Learning Support)**  
> *A clean, intuitive study companion web application focused on academic topics and real notes, powered centrally by the Gemma 4 Grounding Engine.*

---

## 📋 Project Overview & Academic Focus
Rather than creating an over-engineered Learning Management System, this project is purpose-built for deep, verified learning from real academic lecture notes. It enforces **strict factual grounding**, provides **verifiable source evidence citations**, delivers **pedagogical practice quizzes with diagnostic misconception feedback**, and features an active **Zero-Hallucination Guardrail** that explicitly refuses out-of-scope inquiries.

### Central Model & Grounding Architecture
- **Central Model**: Gemma 4 (7B / 27B Grounded Academic Edition)
- **Turn Template**: Gemma 4 chat control tokens (`<start_of_turn>system`, `<start_of_turn>user`, `<start_of_turn>model`)
- **Grounding Method**: BM25 + N-gram phrase matching + sentence-level token indexing + contextual paragraph adjacency
- **Refusal Guardrail**: Strict entity & vocabulary coverage checks to prevent hallucination outside the notes

---

## 🎯 Live Demo Checklist (4/4 Completed & Verified)

| Step | Requirement | Implementation & Verification | Live Demo Trigger | Status |
|---|---|---|---|---|
| **1** | **Load sample notes on one academic topic** | Multi-page academic notes on *Electricity: Complete Study Notes* (Class 10 Physics / Science). | Top Bar: `01 Load Sample Notes` | **PASSED** |
| **2** | **Ask supported question & inspect evidence** | Query: *"What does Ohm's law state, and what physical quantity does the slope of the voltage versus current graph represent?"*<br>Answers strictly with high confidence and cites exact sentences (Ohm's law & conductor resistance), automatically highlighting the sentence in glowing emerald. | Top Bar: `02 Ask Supported Q` | **PASSED** |
| **3** | **Intentionally answer quiz question incorrectly** | Select an incorrect option. The Gemma 4 coach displays: (1) Misconception Diagnosis, (2) Progressive Pedagogical Hint, and (3) Verbatim Note Citation coordinates with auto-highlight. | Top Bar: `03 Test Quiz Mistake` | **PASSED** |
| **4** | **Ask unsupported question to prove zero hallucination** | Query: *"What is the maximum lifespan of Drosophila melanogaster fruit flies when fed on a sucrose-restricted diet?"*<br>Triggers the **Explicit Refusal Guardrail** with missing keywords breakdown, refusing to hallucinate external facts. | Top Bar: `04 Test Refusal Guardrail` | **PASSED** |

---

## 🚀 Quick Start Guide

### Start the Web Application
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

- **Clean Split Workspace**:
  - **Left Pane (Lecture Notes)**: Formatted lecture text with section headers, sentence markers, instant search, and luminous evidence highlighting.
  - **Right Pane (Study Companion Assistant)**:
    - **Tab 1 (Ask & Inspect Evidence)**: Grounded Q&A input, quick sample pills, evidence quotes, and refusal guardrail.
    - **Tab 2 (Practice Quiz & Feedback)**: Multiple choice quiz with misconception diagnosis, hints, and source citations.
- **Top Bar Live Demo Ribbon**: 1-click execution for all 4 required demo steps, plus an automated `▶ Run Complete Demo Tour`.
- **Upload / Paste Notes Modal**: Easily test custom lecture notes (.txt, .md, or paste).
- **Gemma 4 Prompt Trace**: Inspect the underlying `<start_of_turn>` templates and grounding constraints.

---

## 🏗️ Repository Architecture

- **`server.js`**: Express backend providing REST endpoints (`/api/ask`, `/api/quiz`, `/api/quiz/generate`, `/api/quiz/evaluate`, `/api/load-topic`, `/api/upload-notes`, `/api/demo-checklist`).
- **`gemmaEngine.js`**: Core Gemma 4 grounding engine, BM25 ranker, token segmentation, dynamic quiz generator, and zero-hallucination guardrail.
- **`sampleNotes.js`**: Curated, high-yield academic lecture notes on Electricity: Complete Study Notes (Class 10 Level).
- **`public/`**:
  - `index.html`: Clean landing page introducing the sequential learning flow.
  - `upload.html`: Notes upload & intake studio (supports drag-and-drop `.txt`, `.md`, or pasting, plus 1-click sample topic).
  - `study.html`: Grounded Q&A console & Note Reader with verbatim quote inspection.
  - `quiz.html`: Practice Quiz Studio (customizable 5 to 15 questions limit, green correct answer highlighting, mistake diagnostics).
  - `styles.css`: Pure Vanilla CSS design system with minimalist dark mode and 1px solid borders.
  - `js/`: Modular scripts (`shared.js`, `home.js`, `study.js`, `quiz.js`).
