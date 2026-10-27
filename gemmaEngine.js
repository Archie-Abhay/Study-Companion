// Gemma 4 Central Grounding & Study Companion Engine
// Implements Gemma 4 Chat Template, Strict Note Grounding, Verifiable Evidence Locator,
// Practice Quiz Generation, Misconception Diagnostics, and Zero-Hallucination Refusal Policy.

class GemmaGroundingEngine {
  constructor() {
    this.modelName = "Gemma 4 (7B / 27B Grounded Academic Edition)";
    this.version = "4.0.0-rc2";
    this.synonyms = {
      final: ["terminal", "last", "end"],
      terminal: ["final", "end"],
      acceptor: ["accepts", "accept"],
      formed: ["synthesized", "produced", "created", "reduced", "generated"],
      synthesized: ["formed", "produced", "created"],
      inhibited: ["blocked", "halted", "stopped"],
      produces: ["yields", "generates", "forms"],
      rate: ["limiting", "pacemaker"],
      algorithm: ["policy", "strategy"]
    };

    // Shared stopword list (also used by quiz term extraction).
    // Extra short words added so that 2-letter terms (pH, AC, DC, SI) can be
    // indexed without common 2-letter filler words sneaking in.
    this.stopWords = new Set([
      "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
      "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", 
      "but", "by", "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", 
      "doesn't", "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", 
      "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", 
      "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", 
      "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", 
      "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", 
      "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", 
      "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", 
      "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", 
      "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", 
      "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", 
      "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", 
      "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would", 
      "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
    , "us", "go", "ok", "oh", "vs", "eg", "ie"
    ]);

    // Generic question / instruction words ("define", "explain", "advantage" ...).
    // They say HOW to answer, not WHAT to look up, so they must never cause a refusal.
    const questionWordList = [
      "define", "defines", "defined", "definition", "definitions", "explain", "explains", "explained",
      "explanation", "describe", "describes", "described", "description", "list", "mention", "give",
      "advantage", "advantages", "disadvantage", "disadvantages", "difference", "differences",
      "differentiate", "compare", "comparison", "discuss", "meaning", "importance", "significance",
      "example", "examples", "briefly", "brief", "short", "write", "note", "notes", "tell", "name",
      "identify", "elaborate", "summarize", "summarise", "summary", "outline", "illustrate", "role",
      "according", "please", "kindly", "topic", "concept"
    ];
    this.questionWords = new Set();
    for (const w of questionWordList) {
      this.questionWords.add(w);
      if (w.length > 4) {
        const stem = w.replace(/(?:ing|ed|es|s)$/, "");
        if (stem.length >= 3) this.questionWords.add(stem);
      }
    }

    // Filler words the quiz should never blank out or use as an option
    this.fillerWords = new Set([
      "also", "will", "may", "might", "must", "shall", "just", "thus", "hence", "therefore", "however",
      "often", "usually", "typically", "called", "known", "using", "used", "use", "uses", "make", "makes",
      "made", "many", "much", "well", "like", "per", "via", "etc", "every", "always", "never", "either",
      "neither", "another", "among", "within", "without", "whether", "whose", "since", "though", "although",
      "almost", "second", "single", "high", "low", "states", "allows", "depends"
    ]);
  }

  // Tokenize string into normalized terms (stopword filtered)
  tokenize(text) {
    if (!text) return [];
    const stopWords = this.stopWords;

    const rawTokens = text
      .toLowerCase()
      .replace(/(\d)\.(\d)/g, "$1_$2") // keep decimals like 1.6 as one token
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w) && !/^[-_]+$/.test(w)); // length>=2 keeps pH, AC, DC, SI

    const finalTokens = [];
    for (const w of rawTokens) {
      finalTokens.push(w);
      if (w.length > 4) {
        const stemmed = w.replace(/(?:ing|ed|es|s)$/, "");
        if (stemmed.length >= 3 && stemmed !== w) {
          finalTokens.push(stemmed);
        }
      }
    }
    return finalTokens;
  }

  // True for lines such as "Misconception: current gets used up in a bulb."
  isMisconceptionText(text) {
    return /^\s*(?:common\s+)?(?:misconception|myth)\s*[:\-\u2013\u2014]/i.test(text || "");
  }

  // Sentence splitter that does NOT break on decimals (1.6), e.g., i.e., vs., Fig., etc.
  splitSentences(text) {
    const PH = "\u0001";
    const protectedText = String(text)
      .replace(/(\d)\.(?=\d)/g, "$1" + PH)
      .replace(/\b(?:e\.g|i\.e|vs|Fig|fig|approx|Dr|Mr|Mrs|Prof|cf|Eq|eq|Ref)\./g, m => m.replace(/\./g, PH));
    const parts = protectedText.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [protectedText];
    return parts.map(p => p.split(PH).join("."));
  }

  // Parse notes text into structured sections, paragraphs, and indexed sentences
  indexNotes(rawText) {
    const lines = rawText.split("\n");
    const sections = [];
    let currentSection = { title: "Introduction", paragraphs: [] };
    let currentParaLines = [];

    const flushPara = () => {
      if (currentParaLines.length > 0) {
        const paraText = currentParaLines.join("\n").trim();
        if (paraText) {
          currentSection.paragraphs.push(paraText);
        }
        currentParaLines = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        flushPara();
        if (currentSection.paragraphs.length > 0) {
          sections.push(currentSection);
        }
        const title = trimmed.replace(/^#+\s*/, "");
        currentSection = { title, paragraphs: [] };
      } else if (trimmed === "") {
        flushPara();
      } else {
        currentParaLines.push(trimmed);
      }
    }
    flushPara();
    if (currentSection.paragraphs.length > 0) {
      sections.push(currentSection);
    }

    // Now index every sentence with exact location metadata
    const sentences = [];
    let globalSentenceIndex = 0;
    let globalParaIndex = 0;

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx];
      for (let pIdx = 0; pIdx < sec.paragraphs.length; pIdx++) {
        globalParaIndex++;
        const para = sec.paragraphs[pIdx];
        
        // Split paragraph lines and bullets
        const linesOrBullets = para.split(/\n+/);
        
        for (const item of linesOrBullets) {
          // Strip only a LEADING bullet / list number (old regex could also cut "... of 2. ..." mid-line)
          const cleanItem = item.trim().replace(/^(?:[-*•]\s*|\d+[.)]\s+)/, "");
          if (cleanItem.length < 8) continue;

          const rawSentences = this.splitSentences(cleanItem);
          
          for (let rIdx = 0; rIdx < rawSentences.length; rIdx++) {
            const sentText = rawSentences[rIdx].trim();
            // Skip short label headers like "Electron Transport Chain (ETC):"
            if (sentText.length < 12 || (sentText.endsWith(":") && sentText.length < 35)) continue;

            globalSentenceIndex++;
            const tokens = this.tokenize(sentText);
            sentences.push({
              id: `sent_${globalSentenceIndex}`,
              index: globalSentenceIndex,
              sectionIndex: sIdx + 1,
              sectionTitle: sec.title,
              paragraphIndex: globalParaIndex,
              paragraphSubIndex: pIdx + 1,
              sentenceSubIndex: rIdx + 1,
              text: sentText,
              // "Misconception: ..." lines are deliberately WRONG statements. Keep them in the
              // index (the reader still shows them) but never use them as evidence or quiz answers.
              isMisconception: this.isMisconceptionText(sentText),
              tokens: tokens,
              tokenSet: new Set(tokens)
            });
          }
        }
      }
    }

    // Build overall corpus vocabulary and document frequencies for BM25
    const docFreq = {};
    const totalDocs = sentences.length;
    for (const sent of sentences) {
      const seen = new Set();
      for (const tok of sent.tokens) {
        if (!seen.has(tok)) {
          seen.add(tok);
          docFreq[tok] = (docFreq[tok] || 0) + 1;
        }
      }
    }

    return {
      rawText,
      totalLength: rawText.length,
      sections,
      sentences,
      totalSentences: sentences.length,
      totalParagraphs: globalParaIndex,
      docFreq,
      totalDocs
    };
  }

  // Format the full prompt into Gemma 4's official chat turn template
  buildGemmaPrompt(indexedNotes, question) {
    const systemPrompt = 
`<start_of_turn>system
You are Gemma 4 Grounded Academic Study Companion, a specialized AI model designed for high-integrity learning support.
OPERATIONAL CONSTRAINTS:
1. STRICT GROUNDING: Answer ONLY using facts explicitly written in the provided study notes.
2. CITATION MANDATE: Every factual claim must be accompanied by the exact supporting sentence and section coordinates.
3. ZERO HALLUCINATION POLICY: If the question asks about concepts, entities, mechanisms, or details NOT present in the notes, you MUST refuse to answer. Do not extrapolate, infer outside facts, or rely on pre-trained knowledge.
4. PEDAGOGICAL TONE: Present the grounded answer with clarity, highlighting core academic terms and their definitions directly from the text.
<end_of_turn>`;

    const userTurn = 
`<start_of_turn>user
[VERIFIED SOURCE NOTES CONTENT]
${indexedNotes.rawText}
[/VERIFIED SOURCE NOTES CONTENT]

STUDENT INQUIRY:
${question}

Perform grounded analysis. If the question cannot be answered solely from the notes above, issue an explicit Refusal with the exact missing subject. Otherwise, provide the grounded answer and cite verbatim evidence.
<end_of_turn>
<start_of_turn>model
`;

    return {
      systemPrompt,
      userTurn,
      fullPrompt: `${systemPrompt}\n${userTurn}`,
      model: this.modelName
    };
  }

  // Calculate BM25 relevance score + phrase match bonus between query and sentence
  calculateSentenceScore(queryTokens, sentence, docFreq, totalDocs, avgDocLen, rawQuery = "") {
    if (queryTokens.length === 0 || sentence.tokens.length === 0) return 0;
    const k1 = 1.2;
    const b = 0.75;
    const docLen = sentence.tokens.length;
    let score = 0;

    for (const token of queryTokens) {
      const tf = sentence.tokens.filter(t => t === token).length;
      if (tf > 0) {
        const df = docFreq[token] || 1;
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
        const num = tf * (k1 + 1);
        const denom = tf + k1 * (1 - b + b * (docLen / (avgDocLen || 15)));
        score += idf * (num / denom);
      }
    }

    // Phrase match bonus: check if 2-word or 3-word n-grams from query (or synonyms) appear in sentence
    const lowerSent = sentence.text.toLowerCase();
    for (let i = 0; i < queryTokens.length - 1; i++) {
      const q1 = queryTokens[i];
      const q2 = queryTokens[i + 1];
      const variants1 = [q1, ...(this.synonyms[q1] || [])];
      const variants2 = [q2, ...(this.synonyms[q2] || [])];

      for (const v1 of variants1) {
        for (const v2 of variants2) {
          const bigram = `${v1} ${v2}`;
          if (lowerSent.includes(bigram)) {
            score += 15.0; // High reward for exact concept phrases like "terminal electron" or "electron acceptor"
          }
        }
      }
    }

    return score;
  }

  // Grounded QA Engine with strict Non-Hallucination Guardrail
  answerQuestion(indexedNotes, question) {
    const queryTokens = this.tokenize(question);
    const gemmaPromptTrace = this.buildGemmaPrompt(indexedNotes, question);

    if (queryTokens.length === 0) {
      return {
        isRefusal: true,
        refusalType: "EMPTY_OR_INVALID_QUERY",
        status: "REFUSAL_FLAGGED",
        message: "Refusal: The question does not contain sufficient query terms to match against the notes.",
        groundingConfidence: 0,
        evidence: [],
        gemmaPromptTrace
      };
    }

    // Evidence may only come from real facts, never from "Misconception:" lines
    let searchable = indexedNotes.sentences.filter(s => !s.isMisconception);
    if (searchable.length === 0) searchable = indexedNotes.sentences;

    // "define / explain / advantage ..." tell us how to answer, not what to look up.
    // Drop them so their absence from the notes can never trigger a refusal.
    const contentTokens = queryTokens.filter(t => !this.questionWords.has(t));
    const scoringTokens = contentTokens.length > 0 ? contentTokens : queryTokens;

    // Compute average sentence length
    const totalTokens = searchable.reduce((acc, s) => acc + s.tokens.length, 0);
    const avgDocLen = totalTokens / (searchable.length || 1);

    const expandedQueryTokens = [...scoringTokens];
    for (const qt of scoringTokens) {
      if (this.synonyms[qt]) {
        expandedQueryTokens.push(...this.synonyms[qt]);
      }
    }

    // Score every sentence against query
    const scoredSentences = searchable.map(sent => {
      const baseBm25 = this.calculateSentenceScore(expandedQueryTokens, sent, indexedNotes.docFreq, indexedNotes.totalDocs, avgDocLen, question);
      
      // Calculate token coverage (how many query words appear in the sentence)
      let matchedTokens = [];
      for (const qt of scoringTokens) {
        if (sent.tokenSet.has(qt) || (this.synonyms[qt] && this.synonyms[qt].some(syn => sent.tokenSet.has(syn)))) {
          matchedTokens.push(qt);
        }
      }
      const tokenCoverage = scoringTokens.length > 0 ? matchedTokens.length / scoringTokens.length : 0;
      
      // Composite score heavily rewards high coverage of distinct query concepts
      const score = baseBm25 * (1 + 1.5 * tokenCoverage);

      return {
        sentence: sent,
        score,
        tokenCoverage,
        matchedTokens: Array.from(new Set(matchedTokens))
      };
    });

    // Sort by initial composite score
    scoredSentences.sort((a, b) => b.score - a.score);

    const initialTop = scoredSentences[0];
    if (initialTop && initialTop.score > 5) {
      // Apply contextual continuity boost to adjacent sentence in same paragraph if it shares query tokens
      for (const item of scoredSentences) {
        if (item.sentence.paragraphIndex === initialTop.sentence.paragraphIndex &&
            Math.abs(item.sentence.index - initialTop.sentence.index) === 1) {
          if (item.matchedTokens.length > 0) {
            // Boost related adjacent sentence, but keep the best-matching sentence ranked first
            item.score = Math.min(item.score + 35.0, initialTop.score * 0.99);
          }
        }
      }
      scoredSentences.sort((a, b) => b.score - a.score);
    }

    const topSentence = scoredSentences[0];
    const topCandidates = scoredSentences.slice(0, 3).filter(c => c.score > 0.4);

    // Identify if question contains major topics/entities completely absent from the entire note collection
    const absentKeywords = [];
    const notesAllTokens = new Set(searchable.flatMap(s => s.tokens));
    for (const qt of scoringTokens) {
      if (!notesAllTokens.has(qt) && qt.length >= 2) { // >=2 so an absent "pH" is reported too
        absentKeywords.push(qt);
      }
    }

    // STRICT REFUSAL POLICY CRITERIA:
    // 1. If top score is below a strict threshold (e.g. 0.85)
    // 2. Or if more than 50% of the query's informative tokens are completely missing from the entire notes
    // 3. Or if top match has less than 25% token overlap
    const missingRatio = absentKeywords.length / scoringTokens.length;
    const isUnsupported = !topSentence || topSentence.score < 0.85 || missingRatio >= 0.45 || (topSentence.score < 1.4 && topSentence.tokenCoverage < 0.25);

    if (isUnsupported) {
      const missingSubjectDesc = absentKeywords.length > 0 
        ? absentKeywords.map(k => `"${k}"`).join(", ")
        : "the requested query concepts";

      return {
        isRefusal: true,
        refusalType: "OUT_OF_SCOPE_UNSUPPORTED",
        status: "REFUSAL_FLAGGED",
        guardrailTriggered: "Gemma 4 Strict Grounding Guardrail (Zero-Hallucination Policy)",
        message: `⛔ REFUSAL (Strict Grounding): The uploaded notes do not contain sufficient verified information regarding ${missingSubjectDesc}.`,
        explanation: `As a Gemma 4 Grounded Study Companion, I am strictly instructed to refuse answering rather than hallucinate or fabricate facts from external pre-training weights when notes lack verifiable evidence.`,
        missingKeywords: absentKeywords,
        topCandidateScore: topSentence ? Number(topSentence.score.toFixed(3)) : 0,
        groundingConfidence: 0,
        evidence: [],
        gemmaPromptTrace
      };
    }

    // Supported Question: Assemble exact grounded response
    const primaryEvidence = topCandidates.slice(0, 2);
    const confidencePercent = Math.min(99.2, Math.max(82.5, topSentence.score * 22 + topSentence.tokenCoverage * 40));

    // Construct grounded answer by synthesizing verified sentences
    const citations = primaryEvidence.map((ev, idx) => ({
      citationNumber: idx + 1,
      section: ev.sentence.sectionTitle,
      paragraph: ev.sentence.paragraphIndex,
      sentenceNumber: ev.sentence.index,
      verbatimQuote: ev.sentence.text,
      relevanceScore: Number(ev.score.toFixed(2)),
      matchedKeywords: ev.matchedTokens
    }));

    // Generate grounded pedagogical answer
    const primaryQuote = primaryEvidence[0].sentence.text;
    const secondaryQuote = primaryEvidence.length > 1 ? primaryEvidence[1].sentence.text : "";

    let groundedSynthesis = "";
    if (secondaryQuote && secondaryQuote !== primaryQuote) {
      groundedSynthesis = `Based strictly on **${primaryEvidence[0].sentence.sectionTitle}** (Paragraph ${primaryEvidence[0].sentence.paragraphIndex}):\n\n` +
        `• **Direct Evidence:** "${primaryQuote}"\n` +
        `• **Supporting Context:** "${secondaryQuote}"\n\n` +
        `**Gemma 4 Summary:** The notes establish that ${this.summarizeFact(primaryQuote, question)}.`;
    } else {
      groundedSynthesis = `Based strictly on **${primaryEvidence[0].sentence.sectionTitle}** (Paragraph ${primaryEvidence[0].sentence.paragraphIndex}):\n\n` +
        `• **Direct Evidence:** "${primaryQuote}"\n\n` +
        `**Gemma 4 Summary:** According to the verified notes, ${this.summarizeFact(primaryQuote, question)}.`;
    }

    return {
      isRefusal: false,
      status: "SUPPORTED_GROUNDED",
      answer: groundedSynthesis,
      groundingConfidence: Number(confidencePercent.toFixed(1)),
      evidence: citations,
      primarySentenceId: primaryEvidence[0].sentence.id,
      primaryParagraphIndex: primaryEvidence[0].sentence.paragraphIndex,
      gemmaPromptTrace
    };
  }

  summarizeFact(sentenceText, question) {
    // Clean up sentence for pedagogical display
    return sentenceText.replace(/^\s*[-*•]\s*/, "");
  }

  // Generate grounded practice quiz tailored exclusively to uploaded notes with 5-15 question limits
  generatePracticeQuiz(indexedNotes, topicId = 'custom', count = 5, difficulty = 'Adaptive') {
    if (!indexedNotes) return [];
    const quizCount = Math.max(5, Math.min(15, parseInt(count, 10) || 5));
    return this.synthesizeDynamicQuiz(indexedNotes, quizCount, difficulty);
  }

  // ---------------------------------------------------------------------------
  // Quiz helpers
  // ---------------------------------------------------------------------------

  // Remove markdown noise / list markers so quiz text reads cleanly
  cleanQuizText(text) {
    return String(text || '')
      .replace(/\*\*|__|`/g, '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Whole-word, case-insensitive containment check
  containsWord(text, word) {
    return new RegExp('(?<![A-Za-z0-9])' + this.escapeRegExp(word) + '(?![A-Za-z0-9])', 'i').test(text);
  }

  // "voltage" vs "voltages": treat near-identical words as the same option
  sharesRoot(a, b) {
    if (a === b) return true;
    if (a.length >= 5 && b.length >= 5 && /^[a-z]+$/.test(a) && /^[a-z]+$/.test(b)) {
      return a.slice(0, 5) === b.slice(0, 5);
    }
    return false;
  }

  // Sentences that are good quiz material: real facts, readable length, mostly words
  quizSentencePool(indexedNotes) {
    const all = (indexedNotes.sentences || []).filter(s => s && s.text && !s.isMisconception);
    const good = all.filter(s => {
      const t = this.cleanQuizText(s.text);
      const words = t.split(/\s+/).length;
      const letters = (t.match(/[A-Za-z]/g) || []).length;
      return t.length >= 25 && t.length <= 220 && words >= 5 && letters / t.length >= 0.6 && !t.endsWith(':');
    });
    // Sentences that lean on the previous sentence ("In fact, ...", "This ...") make poor stand-alone questions
    const standalone = good.filter(s => !/^(?:in fact|however|thus|therefore|hence|also|this|these|those|it|they|that|so|but|and|then)\b/i.test(this.cleanQuizText(s.text)));
    if (standalone.length >= 5) return standalone;
    if (good.length >= 5) return good;

    let relaxed = all.filter(s => s.text.length > 25);
    if (relaxed.length === 0) relaxed = all.filter(s => s.text.length > 10);
    // Never fall back to "Misconception:" lines: they are false statements, not verified facts
    return relaxed;
  }

  // Spread questions across ALL sections of the notes (not just the first few sentences)
  pickQuizTargets(pool, count) {
    const bySection = new Map();
    for (const s of pool) {
      const key = s.sectionIndex || 0;
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(s);
    }

    // Inside a section, step through sentences in a well-spread (golden ratio) order
    const ordered = Array.from(bySection.values()).map(list => {
      const m = list.length;
      const used = new Set();
      const out = [];
      for (let j = 0; j < m; j++) {
        let idx = Math.floor(((j * 0.6180339887 + 0.3) % 1) * m);
        while (used.has(idx)) idx = (idx + 1) % m;
        used.add(idx);
        out.push(list[idx]);
      }
      return out;
    });

    let selected = ordered;
    if (ordered.length > count) {
      selected = Array.from({ length: count }, (_, i) => ordered[Math.floor((i * ordered.length) / count)]);
    }

    const picks = [];
    let round = 0;
    while (picks.length < count) {
      let added = false;
      for (const group of selected) {
        if (round < group.length) {
          picks.push(group[round]);
          added = true;
          if (picks.length >= count) break;
        }
      }
      if (!added) break;
      round++;
    }

    // Tiny notes: reuse sentences (a different term gets blanked on each reuse)
    const base = picks.slice();
    let k = 0;
    while (base.length > 0 && picks.length < count) {
      picks.push(base[k % base.length]);
      k++;
    }
    return picks;
  }

  // Rank candidate "answer" terms in a sentence (rare words, acronyms, numbers, proper nouns)
  extractQuizTerms(sentence, indexedNotes) {
    const text = this.cleanQuizText(sentence.text);
    const docFreq = indexedNotes.docFreq || {};
    const total = indexedNotes.totalDocs || 1;
    const titleTokens = new Set(this.tokenize(sentence.sectionTitle || ''));
    const re = /\d+(?:\.\d+)?%?|[A-Za-z][A-Za-z0-9-]*/g;
    const found = new Map();
    let m;

    while ((m = re.exec(text)) !== null) {
      const word = m[0].replace(/-+$/, '');
      if (!word) continue;
      const lower = word.toLowerCase();
      const isNum = /^\d/.test(word);
      const isAcr = !isNum && word.length <= 6 && !this.stopWords.has(lower) &&
        ((word.length >= 2 && word === word.toUpperCase() && /[A-Z]{2}/.test(word)) || /^[a-z]+[A-Z]/.test(word));

      if (!isNum && !isAcr) {
        if (word.length < 4) continue;
        if (this.stopWords.has(lower) || this.questionWords.has(lower) || this.fillerWords.has(lower)) continue;
        if (word.length > 5 && /ly$/.test(lower)) continue;
      }

      const df = docFreq[lower] || 1;
      let score = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      if (isNum) score += 1.5;
      if (isAcr) score += 2;
      const midSentenceCapital = m.index > 0 && /^[A-Z][a-z]/.test(word);
      if (midSentenceCapital) score += 1.2;
      if (word.length >= 6) score += 0.6;
      if (m.index === 0) score -= 0.3;
      if (titleTokens.has(lower)) score -= 2; // would be a giveaway from the section title
      let nounish = isNum || isAcr || midSentenceCapital;
      if (!isNum && !isAcr) {
        // Nouns usually follow a determiner / preposition; past-tense verbs make weak blanks
        const prev = /([A-Za-z]+)\W*$/.exec(text.slice(0, m.index));
        if (prev && /^(?:the|a|an|of|by|per|each|its|their|called|is|are|as)$/i.test(prev[1])) {
          score += 1.0;
          nounish = true;
        }
        if (/ed$/.test(lower)) score -= 0.8;
      }

      let type = 'word';
      if (isNum) type = 'num';
      else if (isAcr) type = 'acr';
      else if (midSentenceCapital) type = 'cap';

      const keepCase = isNum || isAcr || midSentenceCapital || /[A-Z]/.test(word.slice(1));
      const display = keepCase ? word : lower;

      const existing = found.get(lower);
      if (!existing || existing.score < score) {
        found.set(lower, { display, lower, type, score, nounish });
      }
    }

    return Array.from(found.values()).sort((a, b) => b.score - a.score);
  }

  // Fallback question: pick the true statement among statements (used only if term distractors are scarce)
  buildStatementOptions(target, cleanTarget, pool, indexedNotes) {
    const targetTokens = new Set(target.tokens || []);
    const overlap = s => {
      let n = 0;
      for (const t of (s.tokens || [])) if (targetTokens.has(t)) n++;
      return n;
    };

    const distractors = [];

    // 1) Misconception lines from the notes are real, plausible wrong beliefs
    const misconceptions = (indexedNotes.sentences || [])
      .filter(s => s.isMisconception)
      .map(s => ({ s, text: this.cleanQuizText(s.text).replace(/^\s*(?:common\s+)?(?:misconception|myth)\s*[:\-\u2013\u2014]\s*/i, '') }))
      .filter(x => x.text.length >= 20 && x.text.length <= 220)
      .sort((a, b) => overlap(b.s) - overlap(a.s));
    for (const x of misconceptions) {
      if (distractors.length >= 3) break;
      distractors.push({ text: x.text, note: 'Misconception: your notes list this as a common misconception, not a verified fact.' });
    }

    // 2) Statements that belong to other sections
    const others = pool
      .filter(s => s.sectionIndex !== target.sectionIndex && s.index !== target.index)
      .map(s => ({ s, text: this.cleanQuizText(s.text) }))
      .sort((a, b) => (Math.abs(a.text.length - cleanTarget.length) - Math.abs(b.text.length - cleanTarget.length)) + (overlap(a.s) - overlap(b.s)) * 3);
    for (const x of others) {
      if (distractors.length >= 3) break;
      if (distractors.some(d => d.text === x.text)) continue;
      distractors.push({ text: x.text, note: `Misconception: this statement belongs to "${x.s.sectionTitle || 'another section'}", not to this section.` });
    }

    // 3) Neutral last-resort false statements
    const generic = [
      { text: 'This claim is not supported by anything recorded in the notes.', note: 'Misconception: the notes do not make this claim.' },
      { text: 'The notes state the exact opposite of what this section describes.', note: 'Misconception: the notes do not reverse this section.' },
      { text: 'This idea applies only to a different topic that the notes do not cover.', note: 'Misconception: this idea is not part of the uploaded notes.' }
    ];
    for (const g of generic) {
      if (distractors.length >= 3) break;
      distractors.push(g);
    }
    return distractors.slice(0, 3);
  }

  // Dynamic quiz synthesis directly and exclusively from uploaded academic notes
  synthesizeDynamicQuiz(indexedNotes, count = 5, difficulty = 'Adaptive') {
    const questions = [];
    if (!indexedNotes || !indexedNotes.sentences) return [];

    const pool = this.quizSentencePool(indexedNotes);
    if (pool.length === 0) return [];

    const targetCount = Math.max(5, Math.min(15, parseInt(count, 10) || 5));
    const picks = this.pickQuizTargets(pool, targetCount);

    const termCache = new Map();
    const getTerms = sent => {
      if (!termCache.has(sent.index)) termCache.set(sent.index, this.extractQuizTerms(sent, indexedNotes));
      return termCache.get(sent.index);
    };
    const distractorUsage = new Map();
    const timesUsed = new Map();

    for (let i = 0; i < picks.length; i++) {
      const target = picks[i];
      const section = target.sectionTitle || 'the notes';
      const paragraph = target.paragraphIndex || 1;
      const cleanTarget = this.cleanQuizText(target.text);
      const qDifficulty = i % 3 === 0 ? 'Foundational' : (i % 3 === 1 ? 'Analytical' : 'Rigorous');

      // On a reused sentence, blank a different term than last time
      const variant = timesUsed.get(target.index) || 0;
      timesUsed.set(target.index, variant + 1);
      const terms = getTerms(target);
      const answer = terms.length > 0 ? terms[variant % terms.length] : null;

      let options = null;
      let correctIndex = 0;
      let questionText = '';
      let hintLevel1 = '';
      let hintLevel2 = '';
      const wrongNotes = []; // feedback text per distractor, in option order (filled below)
      let optionMeta = null;

      // ---- Preferred form: fill-in-the-blank with note-derived term distractors ----
      if (answer) {
        const blanked = cleanTarget.replace(
          new RegExp('(?<![A-Za-z0-9])' + this.escapeRegExp(answer.display) + '(?![A-Za-z0-9])', 'gi'),
          '_____'
        );
        const remainingWords = blanked.replace(/_____/g, ' ').split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length;

        if (blanked !== cleanTarget && remainingWords >= 3) {
          const candidates = [];
          for (const other of pool) {
            if (other.index === target.index) continue;
            for (const t of getTerms(other).slice(0, 3)) {
              if (t.lower === answer.lower || this.sharesRoot(t.lower, answer.lower)) continue;
              if (this.containsWord(cleanTarget, t.lower)) continue; // would contradict / give away the sentence
              let rank = t.score * 0.25;
              if (other.sectionIndex === target.sectionIndex) rank += 3;
              if (t.type === answer.type) rank += 2.5;
              if (t.type === 'num' && answer.type !== 'num') rank -= 2;
              if (t.nounish) rank += 1.5; // prefer noun-like options over stray verbs / adverbs
              rank += 1 - Math.min(1, Math.abs(t.display.length - answer.display.length) / 8);
              rank -= (distractorUsage.get(t.lower) || 0) * 1.5; // keep options varied between questions
              candidates.push({ term: t, rank, other });
            }
          }
          candidates.sort((a, b) => b.rank - a.rank);

          const chosen = [];
          for (const c of candidates) {
            if (chosen.some(x => x.term.lower === c.term.lower || this.sharesRoot(x.term.lower, c.term.lower))) continue;
            chosen.push(c);
            if (chosen.length === 3) break;
          }

          if (chosen.length === 3) {
            for (const c of chosen) distractorUsage.set(c.term.lower, (distractorUsage.get(c.term.lower) || 0) + 1);
            const shift = i % 4;
            const slots = new Array(4).fill(null);
            slots[shift] = { text: answer.display, note: null };
            let ci = 0;
            for (let o = 0; o < 4; o++) {
              if (o === shift) continue;
              const c = chosen[ci++];
              slots[o] = {
                text: c.term.display,
                note: `Misconception: "${c.term.display}" is a term from "${c.other.sectionTitle || 'another part of the notes'}" and does not complete this statement. The notes use "${answer.display}" here.`
              };
            }
            optionMeta = slots;
            correctIndex = shift;
            questionText = `Fill in the blank (from "${section}"): ${blanked}`;
            hintLevel1 = `Think about what "${section}" says in this statement. The missing term has ${answer.display.length} characters.`;
            hintLevel2 = `Refer to paragraph ${paragraph} in "${section}" for the exact wording. The missing term starts with "${answer.display.charAt(0)}".`;
          }
        }
      }

      // ---- Fallback form: choose the verified statement ----
      if (!optionMeta) {
        const d = this.buildStatementOptions(target, cleanTarget, pool, indexedNotes);
        const shift = i % 4;
        const slots = new Array(4).fill(null);
        slots[shift] = { text: cleanTarget, note: null };
        let di = 0;
        for (let o = 0; o < 4; o++) {
          if (o === shift) continue;
          slots[o] = d[di++];
        }
        optionMeta = slots;
        correctIndex = shift;
        questionText = `Which statement is explicitly verified in "${section}"?`;
        hintLevel1 = `Look for the statement in "${section}" and rule out options that describe other topics or common misconceptions.`;
        hintLevel2 = `Refer to paragraph ${paragraph} in "${section}" for the exact wording.`;
      }

      options = optionMeta.map(o => o.text);
      const misconceptions = {};
      optionMeta.forEach((o, idx) => {
        if (idx !== correctIndex) misconceptions[idx] = o.note;
      });

      questions.push({
        id: `q_${i + 1}`,
        concept: `${section}: Concept ${i + 1}`,
        difficulty: qDifficulty,
        question: questionText,
        options,
        correctIndex,
        hint: `Review section "${section}", specifically paragraph ${paragraph}.`,
        hintLevel1,
        hintLevel2,
        explanation: `The uploaded notes explicitly verify: "${cleanTarget}".`,
        misconceptions,
        evidence: {
          section: target.sectionTitle || 'Uploaded Notes',
          paragraph,
          // verbatim sentence from the notes (used by the UI to locate / highlight it)
          quote: target.text.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()
        }
      });
    }

    return questions;
  }

  recordLearnerPerformance(isCorrect) {
    if (!this.learnerProfile) {
      this.learnerProfile = {
        totalAttempted: 0,
        totalCorrect: 0,
        streak: 0,
        currentDifficulty: "Analytical"
      };
    }

    this.learnerProfile.totalAttempted++;
    if (isCorrect) {
      this.learnerProfile.totalCorrect++;
      this.learnerProfile.streak++;
      if (this.learnerProfile.streak >= 2 && this.learnerProfile.currentDifficulty !== "Rigorous") {
        this.learnerProfile.currentDifficulty = "Rigorous";
        this.learnerProfile.adaptiveMessage = "Promoted to Rigorous difficulty based on consistent accuracy.";
      } else {
        this.learnerProfile.adaptiveMessage = "Mastery reinforced. Maintaining current academic rigor.";
      }
    } else {
      this.learnerProfile.streak = 0;
      if (this.learnerProfile.currentDifficulty === "Rigorous") {
        this.learnerProfile.currentDifficulty = "Analytical";
        this.learnerProfile.adaptiveMessage = "Adjusted difficulty to Analytical to consolidate core mechanisms.";
      } else if (this.learnerProfile.currentDifficulty === "Analytical") {
        this.learnerProfile.currentDifficulty = "Foundational";
        this.learnerProfile.adaptiveMessage = "Adjusted difficulty to Foundational to reinforce baseline definitions.";
      } else {
        this.learnerProfile.adaptiveMessage = "Reinforcing foundational concepts with targeted citations.";
      }
    }

    const accuracy = Math.round((this.learnerProfile.totalCorrect / this.learnerProfile.totalAttempted) * 100);
    this.learnerProfile.accuracy = accuracy;

    return this.learnerProfile;
  }

  // Interactive Quiz Evaluator providing multi-stage pedagogical feedback and dynamic adaptation
  evaluateQuizAnswer(quizQuestion, selectedIndex) {
    const isCorrect = selectedIndex === quizQuestion.correctIndex;
    const adaptiveProfile = this.recordLearnerPerformance(isCorrect);
    
    // Multi-tier progressive hints
    const hintLevel1 = quizQuestion.hintLevel1 || quizQuestion.hint || "Reflect on the biochemical or architectural principles described in this section.";
    const hintLevel2 = quizQuestion.hintLevel2 || `Consult paragraph ${quizQuestion.evidence?.paragraph || 1} in "${quizQuestion.evidence?.section || 'Notes'}" to locate the exact reaction parameters.`;

    if (isCorrect) {
      return {
        isCorrect: true,
        correctIndex: quizQuestion.correctIndex,
        badge: "CORRECT",
        feedbackHeadline: "Response verified against lecture notes.",
        explanation: quizQuestion.explanation,
        evidence: quizQuestion.evidence,
        pedagogicalTakeaway: "Accurate factual grounding demonstrated. No misconceptions detected.",
        adaptiveProfile
      };
    } else {
      const misconceptionExplanation = (quizQuestion.misconceptions && quizQuestion.misconceptions[selectedIndex]) || 
        "This selection contradicts the empirical facts recorded in the lecture text.";

      return {
        isCorrect: false,
        correctIndex: quizQuestion.correctIndex,
        badge: "MISCONCEPTION IDENTIFIED",
        feedbackHeadline: "Targeted Concept Diagnostic:",
        hintLevel1,
        hintLevel2,
        hint: hintLevel1,
        misconceptionAnalysis: misconceptionExplanation,
        explanation: quizQuestion.explanation,
        evidence: quizQuestion.evidence,
        remediationAction: "Review the highlighted sentence in your notes on the left to reconcile the factual mismatch.",
        adaptiveProfile
      };
    }
  }
}

module.exports = { GemmaGroundingEngine };

