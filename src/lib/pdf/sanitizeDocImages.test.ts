import { describe, it, expect } from 'vitest';
import { sanitizeDocDefinitionImages } from './sanitizeDocImages';
import {
  VALID_PNG_DATA_URL,
  VALID_JPEG_DATA_URL,
  WEBP_DATA_URL,
  HEIC_DATA_URL,
  SVG_DATA_URL,
  REMOTE_URL,
  HOSTILE_IMAGES,
} from './imageFixtures';

/** Recursively collect every `image` value still present in a definition. */
function collectImages(node: unknown, found: unknown[] = []): unknown[] {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collectImages(item, found);
    return found;
  }
  const obj = node as Record<string, unknown>;
  if ('image' in obj) found.push(obj.image);
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'function') continue;
    collectImages(obj[key], found);
  }
  return found;
}

/** Does the definition contain the placeholder text anywhere? */
function hasPlaceholder(node: unknown): boolean {
  return JSON.stringify(node, (_k, v) => (typeof v === 'function' ? undefined : v))
    .includes('Image unavailable');
}

describe('sanitizeDocDefinitionImages — leaves valid images alone', () => {
  it('keeps JPEG and PNG untouched and reports nothing dropped', () => {
    const doc = {
      content: [
        { text: 'hello' },
        { image: VALID_PNG_DATA_URL, width: 100 },
        { columns: [{ stack: [{ image: VALID_JPEG_DATA_URL, fit: [80, 60] }] }] },
      ],
    };

    const { dropped } = sanitizeDocDefinitionImages(doc);

    expect(dropped).toHaveLength(0);
    expect(collectImages(doc)).toEqual([VALID_PNG_DATA_URL, VALID_JPEG_DATA_URL]);
    expect(hasPlaceholder(doc)).toBe(false);
  });

  it('adds no warning panel when everything is embeddable', () => {
    const doc = { content: [{ image: VALID_PNG_DATA_URL }] };
    sanitizeDocDefinitionImages(doc);
    expect((doc.content as unknown[]).length).toBe(1);
  });
});

describe('sanitizeDocDefinitionImages — replaces what pdfkit cannot embed', () => {
  for (const { name, value } of HOSTILE_IMAGES) {
    it(`replaces a ${name} image with a placeholder instead of throwing`, () => {
      const doc = { content: [{ image: value, width: 200 }] };

      const { dropped } = sanitizeDocDefinitionImages(doc);

      expect(dropped).toHaveLength(1);
      expect(collectImages(doc)).toHaveLength(0);
      expect(hasPlaceholder(doc)).toBe(true);
    });
  }

  it('finds images nested deep inside tables, columns and stacks', () => {
    const doc = {
      content: [
        {
          table: {
            body: [
              [{ stack: [{ columns: [{ stack: [{ image: HEIC_DATA_URL, fit: [220, 180] }] }] }] }],
              [{ text: 'row 2' }],
            ],
          },
        },
      ],
    };

    const { dropped } = sanitizeDocDefinitionImages(doc);

    expect(dropped).toHaveLength(1);
    expect(dropped[0].path).toContain('table.body');
    expect(collectImages(doc)).toHaveLength(0);
  });

  it('preserves the footprint so the page does not reflow', () => {
    const doc = { content: [{ image: WEBP_DATA_URL, fit: [250, 190], alignment: 'center' }] };

    sanitizeDocDefinitionImages(doc);

    const placeholder = (doc.content as Array<Record<string, any>>)[0];
    expect(placeholder.table.widths[0]).toBeCloseTo(248, 0);
    expect(placeholder.table.heights[0]).toBeCloseTo(188, 0);
    expect(placeholder.alignment).toBe('center');
  });

  it('names the failed image using its caption when one is nearby', () => {
    const doc = {
      content: [
        {
          stack: [
            { image: SVG_DATA_URL, fit: [220, 180] },
            { text: 'Photo 3' },
          ],
        },
      ],
    };

    const { dropped } = sanitizeDocDefinitionImages(doc);

    expect(dropped[0].label).toBe('Photo 3');
  });

  it('never leaks the payload into diagnostics', () => {
    const doc = { content: [{ image: WEBP_DATA_URL }] };
    const { dropped } = sanitizeDocDefinitionImages(doc);
    expect(dropped[0].value).not.toContain('base64,');
    expect(dropped[0].value).toContain('image/webp');
  });
});

describe('sanitizeDocDefinitionImages — report-level warning panel', () => {
  it('appends one panel listing every dropped image', () => {
    const doc = {
      content: [
        { image: WEBP_DATA_URL },
        { text: 'body' },
        { image: HEIC_DATA_URL },
        { image: REMOTE_URL },
      ],
    };

    const { dropped } = sanitizeDocDefinitionImages(doc);

    expect(dropped).toHaveLength(3);
    const panel = (doc.content as Array<Record<string, any>>).at(-1)!;
    const serialised = JSON.stringify(panel);
    expect(serialised).toContain('Images not embedded');
    expect(serialised).toContain('3 images');
    // Header row + one row per dropped image.
    expect(panel.stack[2].table.body).toHaveLength(4);
  });

  it('wraps a non-array content value rather than losing it', () => {
    const doc: Record<string, unknown> = { content: { image: WEBP_DATA_URL } };
    sanitizeDocDefinitionImages(doc);
    expect(Array.isArray(doc.content)).toBe(true);
    expect((doc.content as unknown[]).length).toBe(2);
  });

  it('does not append a second panel when called again on the same definition', () => {
    // generatePdfBlob retries via getBlob() with the same object; a second panel
    // would mean the retry path double-reports.
    const doc = { content: [{ image: WEBP_DATA_URL }] };
    sanitizeDocDefinitionImages(doc);
    const afterFirst = (doc.content as unknown[]).length;
    const { dropped } = sanitizeDocDefinitionImages(doc);
    expect(dropped).toHaveLength(0);
    expect((doc.content as unknown[]).length).toBe(afterFirst);
  });
});

describe('sanitizeDocDefinitionImages — images dictionary and dynamic slots', () => {
  it('drops unusable dictionary entries but keeps remote URLs, which pdfmake does resolve', () => {
    const doc: Record<string, unknown> = {
      content: [{ text: 'x' }],
      images: { bad: WEBP_DATA_URL, good: VALID_PNG_DATA_URL, remote: REMOTE_URL },
    };

    const { dropped } = sanitizeDocDefinitionImages(doc);

    expect(dropped.map(d => d.label)).toEqual(['bad']);
    expect(Object.keys(doc.images as object).sort()).toEqual(['good', 'remote']);
  });

  it('sanitizes images returned by a header callback at render time', () => {
    const doc: Record<string, unknown> = {
      content: [{ text: 'x' }],
      header: () => ({ image: WEBP_DATA_URL, width: 60 }),
    };

    const { dropped } = sanitizeDocDefinitionImages(doc);
    // Nothing known yet — the callback has not run.
    expect(dropped).toHaveLength(0);

    const rendered = (doc.header as (p: number, c: number) => unknown)(2, 5);
    expect(hasPlaceholder(rendered)).toBe(true);
    expect(dropped).toHaveLength(1);
  });

  it('records a repeated header failure once, not once per page', () => {
    const doc: Record<string, unknown> = {
      content: [{ text: 'x' }],
      footer: () => ({ image: HEIC_DATA_URL }),
    };
    const { dropped } = sanitizeDocDefinitionImages(doc);
    const footer = doc.footer as (p: number, c: number) => unknown;
    footer(1, 3);
    footer(2, 3);
    footer(3, 3);
    expect(dropped).toHaveLength(1);
  });

  it('leaves static header content and layout callbacks intact', () => {
    const layout = () => 0;
    const doc: Record<string, unknown> = {
      content: [{ table: { body: [[{ text: 'a' }]] }, layout }],
      header: { text: 'Report title' },
    };

    sanitizeDocDefinitionImages(doc);

    expect(doc.header).toEqual({ text: 'Report title' });
    expect((doc.content as Array<Record<string, unknown>>)[0].layout).toBe(layout);
  });
});
