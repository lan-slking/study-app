import "dotenv/config";
import crypto from "crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import {
  initDb,
  getAllNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  updateGeneratedContent,
  invalidateGeneratedContent,
  logActivity,
  getStreak,
  getNoteByShareToken,
  setShareToken,
} from "./db.js";
import { generateValidatedJson, describeGeminiError } from "./geminiJson.js";

// Node's ES modules support top-level await, so we can wait for the database
// to be ready before the server starts accepting requests.
await initDb();

const app = express();
// Named SERVER_PORT rather than PORT — some tools/OSes set a machine-level PORT
// variable, and dotenv never overrides an already-set env var, so a plain PORT
// here could silently be ignored in favor of an unrelated value.
const PORT = process.env.SERVER_PORT || 3001;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  // Log loudly at startup so a missing key is obvious immediately, not just
  // when the first request fails.
  console.warn(
    "WARNING: GEMINI_API_KEY is not set. Copy server/.env.example to server/.env " +
      "and add your key, then restart the server.",
  );
}

// Gemini client — reads GEMINI_API_KEY from the environment (loaded from .env above).
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const GEMINI_MODEL = "gemini-2.5-flash";

// Keep uploads in memory (no need to write the image to disk for this endpoint).
// Limit to 10MB, which is comfortably above what a phone photo needs.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());

// --- Notes CRUD ---
// Backed by server/data.sqlite (see db.js). This is what makes notes survive
// a page refresh or server restart — the frontend no longer keeps the only
// copy of a note in memory.

app.get("/api/notes", (req, res) => {
  res.json(getAllNotes());
});

app.post("/api/notes", (req, res) => {
  const title = req.body.title ?? "";
  const content = req.body.content ?? "";
  const subject = req.body.subject ?? "";
  const mode = req.body.mode ?? "";
  const testDate = req.body.testDate ?? null;
  const note = createNote({ title, content, subject, mode, testDate });
  res.status(201).json(note);
});

app.put("/api/notes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Neveljaven ID zapiska." });
  }

  const before = getNoteById(id);
  const { title, content, subject, lastQuizCorrect, lastQuizTotal, testDate } = req.body;
  let note = updateNote(id, { title, content, subject, lastQuizCorrect, lastQuizTotal, testDate });

  if (!note) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
  }

  // The cached quiz/flashcards/fill-blank content was generated from the OLD
  // content — once it actually changes, that cache no longer matches and
  // must be regenerated, not just left stale. Re-fetch afterward so the
  // response reflects the invalidation instead of the pre-invalidation `note`.
  if (content !== undefined && content !== before.content) {
    invalidateGeneratedContent(id);
    scheduleRegeneration(id);
    note = getNoteById(id);
  }

  res.json(note);
});

app.delete("/api/notes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Neveljaven ID zapiska." });
  }

  deleteNote(id);
  res.status(204).end();
});

// Logs one completed study session (quiz / flashcards / fill_blank) — feeds
// the Domov streak and the "reviewed today" check in the review plan. Called
// by the frontend whenever a Kviz/Kartice/Dopolnjevanje session finishes.
const ACTIVITY_TYPES = new Set(["quiz", "flashcards", "fill_blank"]);

app.post("/api/notes/:id/activity", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Neveljaven ID zapiska." });
  }
  if (!getNoteById(id)) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
  }

  const { type, correct, total } = req.body;
  if (!ACTIVITY_TYPES.has(type)) {
    return res.status(400).json({ error: "Neveljavna vrsta dejavnosti." });
  }

  logActivity(id, { type, correct, total });
  res.status(201).json({ streak: getStreak() });
});

app.get("/api/streak", (req, res) => {
  res.json({ streak: getStreak() });
});

// --- Sharing ---
// A note's share link is stable once created (clicking "Deli" again returns
// the same token, not a new one) and is read-only: the public routes below
// expose only that one note's title/content/subject, and a quiz taken
// through them is generated the same way as the owner's (from the cache if
// warm) but never logged as the owner's activity or quiz score — an
// anonymous visitor's attempt isn't the owner's result.

app.post("/api/notes/:id/share", (req, res) => {
  const id = Number(req.params.id);
  const note = Number.isInteger(id) ? getNoteById(id) : null;
  if (!note) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
  }

  const token = note.share_token || crypto.randomBytes(12).toString("hex");
  if (!note.share_token) setShareToken(id, token);

  res.json({ shareToken: token });
});

app.get("/api/shared/:token", (req, res) => {
  const note = getNoteByShareToken(req.params.token);
  if (!note) {
    return res.status(404).json({ error: "Ta povezava ni (več) veljavna." });
  }
  res.json({ title: note.title, content: note.content, subject: note.subject });
});

app.post("/api/shared/:token/quiz", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v server/.env in znova zaženi strežnik.",
    });
  }

  const note = getNoteByShareToken(req.params.token);
  if (!note) {
    return res.status(404).json({ error: "Ta povezava ni (več) veljavna." });
  }
  if (!note.content.trim()) {
    return res.status(400).json({ error: "Ta zapisek še nima vsebine, iz katere bi lahko naredili kviz." });
  }

  try {
    const quiz = await getOrGenerateStudyContent(note, "quiz_json", {
      prompt: buildQuizPrompt(note.content),
      validate: validateQuiz,
    });
    res.json(quiz);
  } catch (err) {
    console.error("Shared quiz generation error:", err);
    const message = describeGeminiError(err) || "Kviza ni bilo mogoče ustvariti. Poskusi znova.";
    res.status(500).json({ error: message });
  }
});

// The two prompts the "Upload photo" feature can use, keyed by the `mode` field
// the frontend sends alongside the image. Edit the wording here to change what
// each mode produces — no other code changes needed.
// Shared formatting rules appended to both prompts below, so the Markdown
// syntax only needs to be described once. The frontend renders this Markdown
// with react-markdown — see src/NoteEditor.jsx and the ".markdown-view" rules
// in src/App.css.
const MARKDOWN_FORMAT_RULES = `Format the output as Markdown:
- Start with a single "# " title line summarizing the topic.
- Use "## " for each section heading.
- Use **bold** for key terms and definitions.
- Use "- " bullet lists for enumerations.
- Put each formula or equation on its own line, wrapped in single backticks, like \`E = mc^2\`.

Critical accuracy rule: if any word, phrase, or section is illegible, smudged,
cut off, or you are not confident you're reading it correctly, write exactly
[nečitljivo] in its place. Never guess or invent text to fill a gap — a marked
gap is far more useful to a student than a confident-sounding wrong answer.`;

const PROMPTS = {
  // "Full notes" — transcribe everything, just cleaned up and organized.
  full: `Transcribe the handwritten notes in this image, then organize them into clean, well-structured study notes.

- Fix obvious spelling/OCR mistakes where the intent is clear.
- Organize the content under clear headings.
- Preserve the original meaning — don't invent information that isn't in the image.
${MARKDOWN_FORMAT_RULES}

Return only the resulting notes as Markdown (no extra commentary).`,

  // "Summary" — condensed study version, but never at the cost of testable content.
  summary: `Read the handwritten notes in this image and produce a condensed study summary.

- Keep all key concepts, definitions, and formulas exactly as written — never drop or alter anything a student could be tested on.
- Cut filler, repetition, and redundant examples.
- Rewrite explanations more concisely, in your own words where that saves space, without changing their meaning.
- The result should be meaningfully shorter than the original notes, but must not lose any testable information.
- Fix obvious spelling/OCR mistakes where the intent is clear.
${MARKDOWN_FORMAT_RULES}

Return only the resulting summary as Markdown (no extra commentary).`,
};

app.post("/api/process-image", upload.single("image"), async (req, res) => {
  // Fail fast with a clear message instead of letting the Gemini call blow up
  // with a less obvious error further down.
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v server/.env in znova zaženi strežnik.",
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Fotografija ni bila naložena." });
  }

  // multer puts non-file form fields on req.body. Fall back to "full" for any
  // missing/unrecognized value so a bad or absent mode never breaks the request.
  const mode = PROMPTS[req.body.mode] ? req.body.mode : "full";
  const prompt = PROMPTS[mode];

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: req.file.buffer.toString("base64"),
          },
        },
        { text: prompt },
      ],
    });

    const notes = response.text;
    if (!notes) {
      throw new Error("Gemini returned an empty response.");
    }

    res.json({ notes });
  } catch (err) {
    console.error("Gemini API error:", err);

    const message = describeGeminiError(err) || "Pri obdelavi fotografije je prišlo do napake. Poskusi znova.";
    res.status(500).json({ error: message });
  }
});

// --- Study modes: Quiz, Flashcards, and Dopolnjevanje (fill-in-the-blank) ---
// Each is cached on the note (quiz_json / flashcards_json / fill_blank_json)
// once generated, so opening it again is instant instead of re-calling
// Gemini — see getOrGenerateStudyContent below. The cache is invalidated
// whenever the note's content changes (see the PUT handler above) and
// regenerated in the background a few seconds after edits settle (see
// scheduleRegeneration), and pre-warmed right after a note is first created
// by the wizard calling all three endpoints once up front. See geminiJson.js
// for the shared "force JSON, validate, retry once" helper these all use.

// Checks the shape Gemini must return for a quiz. Returns null if valid,
// otherwise a short string describing what's wrong (used only for logging).
function validateQuiz(parsed) {
  if (!parsed || !Array.isArray(parsed.questions)) return "missing questions array";
  if (parsed.questions.length < 6 || parsed.questions.length > 8) {
    return `expected 6-8 questions, got ${parsed.questions.length}`;
  }

  for (const q of parsed.questions) {
    if (typeof q.question !== "string" || !q.question.trim()) return "question missing text";
    if (typeof q.section !== "string" || !q.section.trim()) return "question missing section";
    if (typeof q.explanation !== "string" || !q.explanation.trim()) return "question missing explanation";

    if (q.type === "multiple_choice") {
      if (!Array.isArray(q.options) || q.options.length < 3) return "multiple_choice missing options";
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        return "multiple_choice has invalid correctIndex";
      }
    } else if (q.type === "short_answer") {
      if (typeof q.answer !== "string" || !q.answer.trim()) return "short_answer missing answer";
    } else {
      return `unknown question type "${q.type}"`;
    }
  }

  return null;
}

function validateFlashcards(parsed) {
  if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    return "missing or empty cards array";
  }
  for (const card of parsed.cards) {
    if (typeof card.term !== "string" || !card.term.trim()) return "card missing term";
    if (typeof card.definition !== "string" || !card.definition.trim()) return "card missing definition";
  }
  return null;
}

function validateGrade(parsed) {
  if (!parsed || typeof parsed.correct !== "boolean") return "missing correct boolean";
  if (typeof parsed.explanation !== "string") return "missing explanation";
  return null;
}

function validateFillBlank(parsed) {
  if (!parsed || !Array.isArray(parsed.exercises)) return "missing exercises array";
  if (parsed.exercises.length < 6 || parsed.exercises.length > 8) {
    return `expected 6-8 exercises, got ${parsed.exercises.length}`;
  }
  for (const ex of parsed.exercises) {
    if (typeof ex.sentence !== "string" || !ex.sentence.includes("___")) return "exercise missing blank in sentence";
    if (typeof ex.answer !== "string" || !ex.answer.trim()) return "exercise missing answer";
    if (typeof ex.explanation !== "string" || !ex.explanation.trim()) return "exercise missing explanation";
    if (typeof ex.section !== "string" || !ex.section.trim()) return "exercise missing section";
  }
  return null;
}

function buildQuizPrompt(noteContent) {
  return `Based on the following study notes, create a quiz with 6 to 8 questions that test understanding of the material. Use a mix of multiple-choice and short-answer questions.

Study notes:
"""
${noteContent}
"""

Return ONLY valid JSON matching exactly this shape, with no other text:
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "...",
      "section": "..."
    },
    {
      "type": "short_answer",
      "question": "...",
      "answer": "...",
      "explanation": "...",
      "section": "..."
    }
  ]
}

Rules:
- "section" is a short label (a heading or topic taken from the notes) identifying which part of the notes this question is drawn from, so the student knows what to review if they get it wrong.
- "explanation" is 1-2 sentences explaining why the answer is correct.
- For multiple_choice, provide 3-4 plausible options; exactly one is correct.
- Base every question strictly on the provided notes — never introduce outside facts.
- Write the quiz in the same language as the notes.`;
}

function buildFlashcardsPrompt(noteContent) {
  return `Based on the following study notes, extract the key term/definition pairs as flashcards for studying.

Study notes:
"""
${noteContent}
"""

Return ONLY valid JSON matching exactly this shape, with no other text:
{
  "cards": [
    { "term": "...", "definition": "..." }
  ]
}

Rules:
- Extract every important term, concept, or formula that explicitly appears in the notes, with its definition/explanation as given there.
- Keep each definition concise (1-2 sentences).
- Do not invent terms that aren't in the notes.
- Write in the same language as the notes.
- Include as many cards as the material reasonably supports (typically 5-15).`;
}

function buildFillBlankPrompt(noteContent) {
  return `Based on the following study notes, create 6 to 8 fill-in-the-blank exercises that test recall of key terms, definitions, and formula components.

Study notes:
"""
${noteContent}
"""

Return ONLY valid JSON matching exactly this shape, with no other text:
{
  "exercises": [
    { "sentence": "...", "answer": "...", "explanation": "...", "section": "..." }
  ]
}

Rules:
- "sentence" is a complete sentence taken or adapted from the notes, with exactly one key term, value, or formula element replaced by "___" (three underscores).
- "answer" is the exact word or short phrase that fills the blank.
- "explanation" is 1 short sentence explaining the answer.
- "section" is a short label (a heading or topic taken from the notes) identifying which part of the notes this is drawn from.
- Base every exercise strictly on the provided notes — never introduce outside facts.
- Write in the same language as the notes.`;
}

function buildGradeAnswerPrompt({ question, expectedAnswer, userAnswer }) {
  return `A student answered a short-answer quiz question. Judge whether their answer is correct, allowing for paraphrasing, synonyms, and minor wording differences — the meaning must match, not the exact words.

Question: ${question}
Expected answer: ${expectedAnswer}
Student's answer: ${userAnswer}

Return ONLY valid JSON matching exactly this shape, with no other text:
{
  "correct": true,
  "explanation": "..."
}

"explanation" is 1 short sentence written directly to the student, explaining the grading decision.`;
}

// Returns the cached value for `field` (quiz_json / flashcards_json /
// fill_blank_json) if present, otherwise generates, validates, caches, and
// returns it — the single place "check cache, else ask Gemini" happens, so
// pre-generation, on-demand generation, and post-edit regeneration all agree
// on what "ready" means.
async function getOrGenerateStudyContent(note, field, { prompt, validate }) {
  if (note[field]) {
    try {
      return JSON.parse(note[field]);
    } catch {
      // Corrupt cache (shouldn't normally happen) — fall through and regenerate.
    }
  }

  const generated = await generateValidatedJson(ai, { model: GEMINI_MODEL, prompt, validate });
  updateGeneratedContent(note.id, { [field]: JSON.stringify(generated) });
  return generated;
}

// Debounces regeneration after a content edit — without this, every
// keystroke-debounced save from the frontend (see App.jsx's own 600ms
// debounce) would trigger three fresh Gemini calls while the student is
// still actively typing. Waiting a few extra seconds after edits settle
// keeps this to one regeneration per editing session. In-memory only: lost
// on server restart, which just means the cache regenerates next time the
// note's study modes are opened instead — never a hard failure.
const REGENERATION_DEBOUNCE_MS = 4000;
const regenerationTimers = new Map();

function scheduleRegeneration(noteId) {
  const existing = regenerationTimers.get(noteId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    regenerationTimers.delete(noteId);
    regenerateStudyContent(noteId).catch((err) => {
      console.error(`Background regeneration failed for note ${noteId}:`, err);
    });
  }, REGENERATION_DEBOUNCE_MS);
  regenerationTimers.set(noteId, timer);
}

async function regenerateStudyContent(noteId) {
  const note = getNoteById(noteId);
  if (!note || !note.content.trim()) return;

  const [quiz, flashcards, fillBlank] = await Promise.allSettled([
    generateValidatedJson(ai, { model: GEMINI_MODEL, prompt: buildQuizPrompt(note.content), validate: validateQuiz }),
    generateValidatedJson(ai, {
      model: GEMINI_MODEL,
      prompt: buildFlashcardsPrompt(note.content),
      validate: validateFlashcards,
    }),
    generateValidatedJson(ai, {
      model: GEMINI_MODEL,
      prompt: buildFillBlankPrompt(note.content),
      validate: validateFillBlank,
    }),
  ]);

  const update = {};
  if (quiz.status === "fulfilled") update.quiz_json = JSON.stringify(quiz.value);
  if (flashcards.status === "fulfilled") update.flashcards_json = JSON.stringify(flashcards.value);
  if (fillBlank.status === "fulfilled") update.fill_blank_json = JSON.stringify(fillBlank.value);
  if (Object.keys(update).length > 0) updateGeneratedContent(noteId, update);
}

app.post("/api/notes/:id/quiz", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v server/.env in znova zaženi strežnik.",
    });
  }

  const id = Number(req.params.id);
  const note = Number.isInteger(id) ? getNoteById(id) : null;
  if (!note) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
  }
  if (!note.content.trim()) {
    return res.status(400).json({ error: "Ta zapisek še nima vsebine, iz katere bi lahko naredili kviz." });
  }

  try {
    const quiz = await getOrGenerateStudyContent(note, "quiz_json", {
      prompt: buildQuizPrompt(note.content),
      validate: validateQuiz,
    });
    res.json(quiz);
  } catch (err) {
    console.error("Quiz generation error:", err);
    const message = describeGeminiError(err) || "Kviza ni bilo mogoče ustvariti. Poskusi znova.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/notes/:id/flashcards", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v server/.env in znova zaženi strežnik.",
    });
  }

  const id = Number(req.params.id);
  const note = Number.isInteger(id) ? getNoteById(id) : null;
  if (!note) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
  }
  if (!note.content.trim()) {
    return res.status(400).json({ error: "Ta zapisek še nima vsebine, iz katere bi lahko naredili kartončke." });
  }

  try {
    const flashcards = await getOrGenerateStudyContent(note, "flashcards_json", {
      prompt: buildFlashcardsPrompt(note.content),
      validate: validateFlashcards,
    });
    res.json(flashcards);
  } catch (err) {
    console.error("Flashcard generation error:", err);
    const message = describeGeminiError(err) || "Kartončkov ni bilo mogoče ustvariti. Poskusi znova.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/notes/:id/fill-blank", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v server/.env in znova zaženi strežnik.",
    });
  }

  const id = Number(req.params.id);
  const note = Number.isInteger(id) ? getNoteById(id) : null;
  if (!note) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
  }
  if (!note.content.trim()) {
    return res.status(400).json({ error: "Ta zapisek še nima vsebine, iz katere bi lahko naredili nalog dopolnjevanja." });
  }

  try {
    const fillBlank = await getOrGenerateStudyContent(note, "fill_blank_json", {
      prompt: buildFillBlankPrompt(note.content),
      validate: validateFillBlank,
    });
    res.json(fillBlank);
  } catch (err) {
    console.error("Fill-blank generation error:", err);
    const message = describeGeminiError(err) || "Nalog dopolnjevanja ni bilo mogoče ustvariti. Poskusi znova.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/grade-answer", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v server/.env in znova zaženi strežnik.",
    });
  }

  const { question, expectedAnswer, userAnswer } = req.body;
  if (!question || !expectedAnswer || typeof userAnswer !== "string") {
    return res.status(400).json({ error: "Manjkajo podatki, potrebni za ocenjevanje odgovora." });
  }

  try {
    const grade = await generateValidatedJson(ai, {
      model: GEMINI_MODEL,
      prompt: buildGradeAnswerPrompt({ question, expectedAnswer, userAnswer }),
      validate: validateGrade,
    });
    res.json(grade);
  } catch (err) {
    console.error("Answer grading error:", err);
    const message = describeGeminiError(err) || "Odgovora ni bilo mogoče oceniti. Poskusi znova.";
    res.status(500).json({ error: message });
  }
});

// Catch-all error handler (must have 4 args so Express treats it as an error
// handler, and must be registered after all routes/middleware).
// Without this, an error thrown outside the try/catch above — e.g. multer
// rejecting an oversized upload before our route handler even runs — would
// fall through to Express's default HTML error page instead of JSON, which is
// exactly what caused "Unexpected end of JSON input" on the frontend.
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Fotografija je prevelika (največ 10 MB)." });
  }

  res.status(500).json({ error: "Prišlo je do nepričakovane napake na strežniku. Poskusi znova." });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
