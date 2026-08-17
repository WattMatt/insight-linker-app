/**
 * PDF IMAGE SINK GUARD
 *
 * The last line of defence before a document definition reaches pdfmake. Walks
 * the whole definition and replaces every `{ image: ... }` node pdfkit cannot
 * embed with a visible placeholder, collecting a diagnostic for each one.
 *
 * Why a sink guard rather than only fixing the loaders: the app had four
 * independent image loaders with four different failure modes, and a single bad
 * logo took down every report that drew it. Validating at the sink makes the
 * invariant unconditional — no future loader, generator or data shape can
 * reintroduce a hard render failure, and the failure degrades to a placeholder
 * plus a named diagnostic instead of a thrown error.
 *
 * This mirrors the existing canvas pre-flight in pdfMakeConfig.generatePdfBlob,
 * which walks the same tree for malformed canvas nodes.
 */

import { inspectPdfImage, summariseImageValue, type ImageRejectReason } from './imageFormat';

export interface DroppedImage {
  /** Path within the document definition, e.g. `content[7].columns[0].stack[1]`. */
  path: string;
  reason: ImageRejectReason;
  /** Human-readable explanation, safe to show in the report and the console. */
  detail: string;
  /** Short description of the offending value — never the full payload. */
  value: string;
  /** Caption or label text found alongside the image, to help identify it. */
  label?: string;
}

export interface SanitizeResult {
  dropped: DroppedImage[];
}

/** Fallback placeholder footprint when the node declares no dimensions. */
const DEFAULT_PLACEHOLDER = { width: 120, height: 90 };

/** Keys whose values are pdfmake layout callbacks, not content — never walked. */
const CALLBACK_KEYS = new Set(['layout', 'pageBreakBefore', 'onPageChange']);

/**
 * Work out how much space the failed image would have occupied, so the
 * placeholder keeps the page layout stable instead of collapsing it.
 */
function placeholderSize(node: Record<string, unknown>): { width: number; height: number } {
  const fit = node.fit;
  if (Array.isArray(fit) && typeof fit[0] === 'number' && typeof fit[1] === 'number') {
    return { width: fit[0], height: fit[1] };
  }
  const width = typeof node.width === 'number' ? node.width : undefined;
  const height = typeof node.height === 'number' ? node.height : undefined;
  if (width !== undefined && height !== undefined) return { width, height };
  // Only one dimension given: pdfmake would have scaled the other by aspect
  // ratio. 4:3 is the closest thing to a neutral guess for inspection photos.
  if (width !== undefined) return { width, height: Math.round(width * 0.75) };
  if (height !== undefined) return { width: Math.round(height * 1.33), height };
  return { ...DEFAULT_PLACEHOLDER };
}

/**
 * Build the in-place replacement for an unembeddable image: a dashed box of the
 * same footprint saying the image is missing. A silent omission would leave a
 * reader unable to tell "no photo was taken" from "the photo failed to embed",
 * which matters for documents that get audited.
 */
function buildPlaceholder(node: Record<string, unknown>): Record<string, unknown> {
  const { width, height } = placeholderSize(node);
  // Keep the box inside its column; captions below it stay where they were.
  const boxWidth = Math.max(48, Math.min(width, 460));
  const boxHeight = Math.max(28, Math.min(height, 620));

  return {
    table: {
      widths: [boxWidth - 2],
      heights: [boxHeight - 2],
      body: [
        [
          {
            text: 'Image unavailable',
            fontSize: boxWidth < 110 ? 6 : 8,
            italics: true,
            color: '#a0aec0',
            alignment: 'center',
            margin: [2, Math.max(0, Math.round(boxHeight / 2) - 12), 2, 0],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#e2e8f0',
      vLineColor: () => '#e2e8f0',
      hLineStyle: () => ({ dash: { length: 3, space: 2 } }),
      vLineStyle: () => ({ dash: { length: 3, space: 2 } }),
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    // Preserve the original node's placement so surrounding layout is unchanged.
    ...(node.alignment ? { alignment: node.alignment } : {}),
    ...(node.margin ? { margin: node.margin } : {}),
  };
}

/**
 * Find a nearby caption to name the failed image in diagnostics. Photo grids in
 * this app render `{ stack: [ {image}, {text: 'Photo 1'} ] }`, so the sibling
 * text is the most useful identifier available.
 */
function findSiblingLabel(siblings: unknown[], selfIndex: number): string | undefined {
  for (let i = selfIndex + 1; i < Math.min(siblings.length, selfIndex + 3); i++) {
    const sibling = siblings[i];
    if (sibling && typeof sibling === 'object' && typeof (sibling as { text?: unknown }).text === 'string') {
      const text = (sibling as { text: string }).text.trim();
      if (text && text.length <= 60) return text;
    }
  }
  return undefined;
}

/**
 * Nesting cap. Real definitions in this app reach ~15 levels (table > cell >
 * stack > columns > table…); the cap only exists so a malformed structure cannot
 * turn the pre-flight walk into a stack overflow.
 */
const MAX_DEPTH = 64;

/**
 * Recursively sanitize a node, returning the (possibly replaced) node. Arrays are
 * rebuilt so a replacement can be substituted at its original index.
 */
function sanitizeNode(
  node: unknown,
  path: string,
  dropped: DroppedImage[],
  siblings?: unknown[],
  selfIndex?: number,
  depth = 0,
): unknown {
  if (node === null || node === undefined || depth > MAX_DEPTH) return node;

  if (Array.isArray(node)) {
    return node.map((item, i) => sanitizeNode(item, `${path}[${i}]`, dropped, node, i, depth + 1));
  }

  if (typeof node !== 'object') return node;

  const obj = node as Record<string, unknown>;

  // An image node: adjudicate it before recursing into anything else.
  if ('image' in obj) {
    const inspection = inspectPdfImage(obj.image);
    if (!inspection.ok) {
      dropped.push({
        path,
        reason: inspection.reason ?? 'unsupported-format',
        detail: inspection.detail,
        value: summariseImageValue(obj.image),
        label: siblings && selfIndex !== undefined ? findSiblingLabel(siblings, selfIndex) : undefined,
      });
      return buildPlaceholder(obj);
    }
    // Valid image — no need to walk into it further.
    return obj;
  }

  for (const key of Object.keys(obj)) {
    if (CALLBACK_KEYS.has(key)) continue;
    const value = obj[key];
    if (typeof value === 'function') continue;
    obj[key] = sanitizeNode(value, `${path}.${key}`, dropped, undefined, undefined, depth + 1);
  }

  return obj;
}

/**
 * pdfmake evaluates header/footer/background callbacks at render time, so a
 * static walk cannot see images inside them. Wrap the callback instead and
 * sanitize whatever it returns, on every page.
 */
function wrapDynamicSlot(
  fn: (...args: unknown[]) => unknown,
  slot: string,
  dropped: DroppedImage[],
): (...args: unknown[]) => unknown {
  const seen = new Set<string>();
  return (...args: unknown[]) => {
    const produced = fn(...args);
    // Collect each distinct failure once rather than once per page.
    const local: DroppedImage[] = [];
    const sanitized = sanitizeNode(produced, slot, local);
    for (const drop of local) {
      const key = `${drop.path}|${drop.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dropped.push(drop);
    }
    return sanitized;
  };
}

/**
 * Build the report-level warning panel listing every image that could not be
 * embedded. Appended to the document so the reader gets a single authoritative
 * list rather than having to hunt for placeholder boxes.
 */
export function buildImageWarningPanel(dropped: DroppedImage[]): Record<string, unknown> {
  const rows = dropped.map((drop, i) => [
    { text: String(i + 1), fontSize: 8, color: '#4a5568', alignment: 'center' },
    { text: drop.label || drop.path, fontSize: 8, color: '#1a202c' },
    { text: drop.detail, fontSize: 8, color: '#4a5568' },
    { text: drop.value, fontSize: 7, color: '#718096' },
  ]);

  return {
    stack: [
      {
        text: 'Images not embedded',
        fontSize: 11,
        bold: true,
        color: '#d69e2e',
        margin: [0, 0, 0, 4],
      },
      {
        text:
          `${dropped.length} image${dropped.length === 1 ? '' : 's'} referenced by this report could not be embedded and ` +
          'appear as placeholders above. The records themselves are unaffected — re-upload the ' +
          'affected files as JPEG or PNG to include them in a future export.',
        fontSize: 8,
        color: '#4a5568',
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [16, 120, '*', 110],
          body: [
            [
              { text: '#', fontSize: 8, bold: true, color: '#ffffff', alignment: 'center' },
              { text: 'Item', fontSize: 8, bold: true, color: '#ffffff' },
              { text: 'Reason', fontSize: 8, bold: true, color: '#ffffff' },
              { text: 'Source', fontSize: 8, bold: true, color: '#ffffff' },
            ],
            ...rows,
          ],
        },
        layout: {
          hLineWidth: (i: number, n: { table: { body: unknown[] } }) =>
            i === 0 || i === 1 || i === n.table.body.length ? 0.5 : 0.25,
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8f0',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          fillColor: (rowIndex: number) => (rowIndex === 0 ? '#d69e2e' : rowIndex % 2 === 0 ? '#f7fafc' : null),
        },
      },
    ],
    // Never let the panel split mid-table when it lands at a page boundary.
    margin: [0, 12, 0, 0],
    pageBreak: 'before' as const,
  };
}

/**
 * Sanitize a document definition in place and append the warning panel when
 * anything was dropped.
 *
 * Mutates `docDefinition` deliberately: it is called once at the render
 * chokepoint, immediately before pdfmake consumes the definition, and the
 * mutation is what makes the getStream -> getBlob retry in generatePdfBlob reuse
 * the already-sanitized definition rather than appending a second panel.
 */
export function sanitizeDocDefinitionImages(docDefinition: Record<string, unknown>): SanitizeResult {
  const dropped: DroppedImage[] = [];

  if (docDefinition.content !== undefined) {
    docDefinition.content = sanitizeNode(docDefinition.content, 'content', dropped);
  }

  // The images dictionary is the one place pdfmake does resolve remote URLs, so
  // http(s) entries there are legitimate and must be left alone.
  const images = docDefinition.images;
  if (images && typeof images === 'object' && !Array.isArray(images)) {
    for (const [key, value] of Object.entries(images as Record<string, unknown>)) {
      if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) continue;
      const inspection = inspectPdfImage(value);
      if (!inspection.ok) {
        dropped.push({
          path: `images.${key}`,
          reason: inspection.reason ?? 'unsupported-format',
          detail: inspection.detail,
          value: summariseImageValue(value),
          label: key,
        });
        delete (images as Record<string, unknown>)[key];
      }
    }
  }

  // Header/footer/background callbacks run during rendering, i.e. after the panel
  // below has been built, so failures inside them are logged by the caller rather
  // than listed in the panel. No generator in this app puts an image there today;
  // the wrapper exists so one that does still cannot throw.
  for (const slot of ['header', 'footer', 'background'] as const) {
    const value = docDefinition[slot];
    if (typeof value === 'function') {
      docDefinition[slot] = wrapDynamicSlot(value as (...args: unknown[]) => unknown, slot, dropped);
    } else if (value !== undefined) {
      docDefinition[slot] = sanitizeNode(value, slot, dropped);
    }
  }

  if (dropped.length > 0) {
    const panel = buildImageWarningPanel(dropped);
    const content = docDefinition.content;
    if (Array.isArray(content)) {
      content.push(panel);
    } else if (content !== undefined) {
      docDefinition.content = [content, panel];
    } else {
      docDefinition.content = [panel];
    }
  }

  return { dropped };
}
