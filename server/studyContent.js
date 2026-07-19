import { GoogleGenAI } from "@google/genai";
import { updateGeneratedContent } from "./db.js";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not set. Copy .env.example to .env " +
      "(or set it in the Vercel project's Environment Variables) and redeploy/restart.",
  );
}

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
export const GEMINI_MODEL = "gemini-2.5-flash";

// The two prompts the "New study topic" feature can use, keyed by the `mode`
// field the frontend sends alongside the upload. The source can be a photo of
// handwritten notes, a PDF, or extracted text from a Word/PowerPoint file.
// Edit the wording here to change what each mode produces — no other code
// changes needed.
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

Language rule: write the title, headings, and every part of the notes in the
same language as the source material. Never translate the source into English
or another language. If the source uses more than one language, preserve each
part in its original language.

Critical accuracy rule: if any word, phrase, or section is illegible, smudged,
cut off, or you are not confident you're reading it correctly, write exactly
[nečitljivo] in its place. Never guess or invent text to fill a gap — a marked
gap is far more useful to a student than a confident-sounding wrong answer.`;

export const PROMPTS = {
  // "Full notes" — transcribe everything, just cleaned up and organized.
  full: `Transcribe the notes in the provided material, then organize them into clean, well-structured study notes.

- Fix obvious spelling/OCR mistakes where the intent is clear.
- Organize the content under clear headings.
- Preserve the original meaning — don't invent information that isn't in the source material.
${MARKDOWN_FORMAT_RULES}

Return only the resulting notes as Markdown (no extra commentary).`,

  // "Summary" — condensed study version, but never at the cost of testable content.
  summary: `Read the notes in the provided material and produce a condensed study summary.

- Keep all key concepts, definitions, and formulas exactly as written — never drop or alter anything a student could be tested on.
- Cut filler, repetition, and redundant examples.
- Rewrite explanations more concisely, in your own words where that saves space, without changing their meaning.
- The result should be meaningfully shorter than the original notes, but must not lose any testable information.
- Fix obvious spelling/OCR mistakes where the intent is clear.
${MARKDOWN_FORMAT_RULES}

Return only the resulting summary as Markdown (no extra commentary).`,
};

// Checks the shape Gemini must return for a quiz. Returns null if valid,
// otherwise a short string describing what's wrong (used only for logging).
export function validateQuiz(parsed) {
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

export function validateFlashcards(parsed) {
  if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    return "missing or empty cards array";
  }
  for (const card of parsed.cards) {
    if (typeof card.term !== "string" || !card.term.trim()) return "card missing term";
    if (typeof card.definition !== "string" || !card.definition.trim()) return "card missing definition";
  }
  return null;
}

export function validateGrade(parsed) {
  if (!parsed || typeof parsed.correct !== "boolean") return "missing correct boolean";
  if (typeof parsed.explanation !== "string") return "missing explanation";
  return null;
}

export function validateFillBlank(parsed) {
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

export function buildQuizPrompt(noteContent) {
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

export function buildFlashcardsPrompt(noteContent) {
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

export function buildFillBlankPrompt(noteContent) {
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

export function buildGradeAnswerPrompt({ question, expectedAnswer, userAnswer }) {
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
// returns it — the single place "check cache, else ask Gemini" happens.
//
// There's no background pre-warming here (unlike a long-running server, a
// Vercel function is frozen the moment it responds, so a fire-and-forget
// timer would never fire). The trade-off: opening a study mode for the first
// time after creating or editing a note takes one Gemini round-trip instead
// of being instant: every open after that is served from cache exactly as
// before.
import { generateValidatedJson } from "./geminiJson.js";

export async function getOrGenerateStudyContent(db, note, field, { prompt, validate }) {
  if (note[field]) {
    try {
      return typeof note[field] === "string" ? JSON.parse(note[field]) : note[field];
    } catch {
      // Corrupt cache (shouldn't normally happen) — fall through and regenerate.
    }
  }

  const generated = await generateValidatedJson(ai, { model: GEMINI_MODEL, prompt, validate });
  await updateGeneratedContent(db, note.id, { [field]: generated });
  return generated;
}
