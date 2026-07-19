import JSZip from "jszip";

// Gemini accepts images and PDFs directly as inline data, but not
// docx/pptx — so for those we unzip the OOXML package ourselves and pull
// the raw text out of the slide/document XML, then send that as a plain
// text prompt instead of inline file data.
export const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_MIMETYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function decodeXmlEntities(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("text");
  if (!xml) throw new Error("word/document.xml not found in .docx package");

  const withBreaks = xml
    .replace(/<w:p\b[^>]*>/g, "\n")
    .replace(/<w:tab\/>/g, "\t");
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, "")).trim();
}

async function extractPptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)[1]) - Number(b.match(/slide(\d+)\.xml/)[1]));

  if (slideFiles.length === 0) throw new Error("no slides found in .pptx package");

  const slideTexts = [];
  for (const name of slideFiles) {
    const xml = await zip.file(name).async("text");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    slideTexts.push(runs.join(" ").trim());
  }
  return slideTexts.map((text, i) => `[Slide ${i + 1}]\n${text}`).join("\n\n");
}

// Returns extracted plain text for a docx/pptx buffer. Throws if the
// mimetype isn't one of the two supported office formats.
export async function extractOfficeDocText(buffer, mimetype) {
  if (mimetype === DOCX_MIMETYPE) return extractDocxText(buffer);
  if (mimetype === PPTX_MIMETYPE) return extractPptxText(buffer);
  throw new Error(`Unsupported office mimetype: ${mimetype}`);
}
