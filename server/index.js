import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { initDb, getAllNotes, getNoteById, createNote, updateNote, deleteNote } from "./db.js";
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
  const note = createNote({ title, content, subject });
  res.status(201).json(note);
});

app.put("/api/notes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Neveljaven ID zapiska." });
  }

  const { title, content, subject } = req.body;
  const note = updateNote(id, { title, content, subject });

  if (!note) {
    return res.status(404).json({ error: "Zapiska ni bilo mogoče najti." });
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
      model: "gemini-2.5-flash",
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

// --- Study modes: Quiz and Flashcards ---
// Both are generated fresh from the note's content each time they're opened
// (nothing quiz/flashcard-related is stored in the database) — see
// geminiJson.js for the shared "force JSON, validate, retry once" helper
// these all use.

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
    const quiz = await generateValidatedJson(ai, {
      model: "gemini-2.5-flash",
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
    const flashcards = await generateValidatedJson(ai, {
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
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
