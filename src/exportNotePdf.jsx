import { createRoot } from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import { slugifyFilename } from './downloadFile.js'

// Fixed pixel width for the offscreen render, so html2canvas always lays
// the content out at a known, consistent size.
const RENDER_WIDTH = 800
const PAGE_MARGIN_PT = 32
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89

// html2canvas (the library jsPDF uses under the hood to snapshot the DOM)
// can't parse the modern CSS color functions — oklch(), color-mix() — that
// this app's entire live theme is built on (see :root in App.css). Feeding
// it the real ".zapiski-content" styles throws "unsupported color function"
// and the export fails outright. Canvas 2D always renders to concrete
// pixels no matter how a color was specified, so painting a 1x1 rect and
// reading the pixel back is a reliable way to resolve *any* CSS color down
// to a plain rgb() html2canvas can handle.
function resolveToRgbComponents(cssColor) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return { r, g, b }
}

// Resolves a CSS color expression (possibly a var(--token) reference that
// only means something in the context of the live document, e.g. the
// subject's accent color) to concrete rgb components.
function resolveCssColor(cssColorExpression) {
  const probe = document.createElement('span')
  probe.style.color = cssColorExpression
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  document.body.removeChild(probe)
  return resolveToRgbComponents(computed)
}

let exportCounter = 0

// A self-contained, print-friendly stylesheet: white page, dark text, and
// the note's subject color as the one accent — deliberately not a reuse of
// the app's dark-theme classes (which rely on oklch/color-mix throughout),
// both because html2canvas can't render those functions and because a dark
// page is an odd thing to print. Structurally it mirrors ".zapiski-content"
// in App.css: bold terms tinted with the accent, h3 gets an accent bar,
// bullets are accent-colored dots, formulas render as a centered mono block.
function buildExportStylesheet(scopeClass, accent) {
  const { r, g, b } = accent
  const accentRgb = `rgb(${r}, ${g}, ${b})`
  const accentTint = `rgba(${r}, ${g}, ${b}, 0.14)`
  const textColor = '#18181b'
  const mutedColor = '#6b7280'
  const cardBg = '#f4f4f5'

  return `
    .${scopeClass} {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: ${textColor};
      font-size: 13px;
      line-height: 1.65;
    }
    .${scopeClass} h1 { font-size: 22px; font-weight: 800; margin: 0 0 18px; letter-spacing: -0.01em; }
    .${scopeClass} h2 { font-size: 16px; font-weight: 800; margin: 22px 0 12px; }
    .${scopeClass} h3 { font-size: 14px; font-weight: 800; margin: 18px 0 8px; padding-left: 10px; border-left: 4px solid ${accentRgb}; }
    .${scopeClass} p { margin: 0 0 12px; }
    .${scopeClass} em { color: ${mutedColor}; font-style: italic; }
    .${scopeClass} strong { font-weight: 700; color: ${accentRgb}; background-color: ${accentTint}; border-radius: 3px; padding: 0 3px; }
    .${scopeClass} blockquote {
      margin: 12px 0; padding: 10px 14px; border-left: 3px solid ${accentRgb}; border-radius: 4px;
      background-color: ${cardBg}; font-style: italic; color: ${mutedColor}; font-size: 12px;
    }
    .${scopeClass} ul, .${scopeClass} ol { list-style: none; margin: 12px 0; padding: 0; }
    .${scopeClass} li { position: relative; padding-left: 18px; margin-bottom: 6px; }
    .${scopeClass} li::before {
      content: ''; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 50%;
      background-color: ${accentRgb};
    }
    .${scopeClass} code {
      display: block; margin: 12px 0; padding: 10px 14px; border-radius: 6px; background-color: ${cardBg};
      text-align: center; font-family: Consolas, 'Courier New', monospace; font-size: 13px; color: ${accentRgb};
    }
  `
}

// Renders the note's title and Markdown content off-screen with a print-safe
// version of the app's note styling, rasterizes that DOM with html2canvas,
// and lays the result across as many A4 pages as needed via jsPDF.
export async function exportNoteAsPdf(note, subjectColor) {
  // Loaded on demand — jsPDF + html2canvas are only needed for this one
  // action, so they shouldn't bloat the bundle every page load pulls in.
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])

  const accent = resolveCssColor(subjectColor || 'var(--primary)')
  const scopeClass = `pdf-export-${exportCounter++}`

  const style = document.createElement('style')
  style.textContent = buildExportStylesheet(scopeClass, accent)
  document.head.appendChild(style)

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-99999px'
  container.style.width = `${RENDER_WIDTH}px`
  container.style.backgroundColor = '#ffffff'
  container.style.padding = '48px'
  container.className = scopeClass
  document.body.appendChild(container)

  const root = createRoot(container)

  // html2canvas walks up to ancestor elements (including <body>) to resolve
  // backgrounds for compositing — and body's own background/color in
  // index.css are oklch() too. Neutralize them to plain colors for the
  // duration of the capture, then put back whatever was there before.
  const previousBodyBackground = document.body.style.backgroundColor
  const previousBodyColor = document.body.style.color
  document.body.style.backgroundColor = '#ffffff'
  document.body.style.color = '#18181b'

  try {
    await new Promise((resolve) => {
      root.render(
        <>
          <h1>{note.title || 'Neimenovana snov'}</h1>
          <ReactMarkdown>{note.content}</ReactMarkdown>
        </>,
      )
      // Let React commit and the browser paint before capturing.
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    // jsPDF's own .html() convenience method clones the source element into
    // a hidden iframe and gets confused by off-screen-positioned elements,
    // producing blank pages — so html2canvas is called directly here and the
    // resulting tall screenshot is sliced into A4-sized chunks by hand.
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: RENDER_WIDTH,
    })

    const contentWidthPt = A4_WIDTH_PT - PAGE_MARGIN_PT * 2
    const contentHeightPt = A4_HEIGHT_PT - PAGE_MARGIN_PT * 2
    const pxPerPt = canvas.width / contentWidthPt
    const pageHeightPx = Math.floor(contentHeightPt * pxPerPt)

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    let renderedPx = 0
    let pageIndex = 0
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx)

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeightPx
      pageCanvas
        .getContext('2d')
        .drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(
        pageCanvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        PAGE_MARGIN_PT,
        PAGE_MARGIN_PT,
        contentWidthPt,
        sliceHeightPx / pxPerPt,
      )

      renderedPx += sliceHeightPx
      pageIndex += 1
    }

    pdf.save(`${slugifyFilename(note.title)}.pdf`)
  } finally {
    document.body.style.backgroundColor = previousBodyBackground
    document.body.style.color = previousBodyColor
    root.unmount()
    document.body.removeChild(container)
    document.head.removeChild(style)
  }
}
