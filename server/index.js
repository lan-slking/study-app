import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { initDb, getAllNotes, createNote, updateNote, deleteNote } from "./db.js";

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
  const note = createNote({ title, content });
  res.status(201).json(note);
});

app.put("/api/notes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid note id." });
  }

  const title = req.body.title ?? "";
  const content = req.body.content ?? "";
  const note = updateNote(id, { title, content });

  if (!note) {
    return res.status(404).json({ error: "Note not found." });
  }
  res.json(note);
});

app.delete("/api/notes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid note id." });
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
      error: "Server is missing a GEMINI_API_KEY. Add it to server/.env and restart the server.",
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded." });
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

    // Gemini returns a 400 with "API key not valid" for a malformed/revoked key —
    // surface that distinctly so it's obvious what to fix, instead of a generic message.
    const isInvalidKey = /api key not valid/i.test(err?.message ?? "");
    const message = isInvalidKey
      ? "The Gemini API key was rejected. Check GEMINI_API_KEY in server/.env."
      : "Failed to process image. Please try again.";

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
  res.status(500).json({ error: "Unexpected server error. Please try again." });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
