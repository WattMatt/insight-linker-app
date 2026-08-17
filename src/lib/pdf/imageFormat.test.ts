import { describe, it, expect } from 'vitest';
import { inspectPdfImage, isPdfSafeImage, sniffImageFormat, summariseImageValue } from './imageFormat';
import {
  VALID_PNG_DATA_URL,
  VALID_JPEG_DATA_URL,
  WEBP_DATA_URL,
  HEIC_DATA_URL,
  GIF_DATA_URL,
  SVG_DATA_URL,
  SVG_UTF8_DATA_URL,
  JSON_BODY_DATA_URL,
  REMOTE_URL,
  TRUNCATED_PNG_DATA_URL,
  makePng,
} from './imageFixtures';

describe('sniffImageFormat', () => {
  it('recognises the two formats pdfkit can embed', () => {
    expect(sniffImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImageFormat(new Uint8Array(makePng().subarray(0, 8)))).toBe('png');
  });

  it('rejects everything else', () => {
    expect(sniffImageFormat(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull(); // RIFF/WebP
    expect(sniffImageFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(sniffImageFormat(new Uint8Array([]))).toBeNull();
    expect(sniffImageFormat(new Uint8Array([0xff]))).toBeNull(); // one byte short of JPEG
  });
});

describe('inspectPdfImage — accepts what pdfkit accepts', () => {
  it('accepts a real PNG data URL', () => {
    const result = inspectPdfImage(VALID_PNG_DATA_URL);
    expect(result.ok).toBe(true);
    expect(result.format).toBe('png');
  });

  it('accepts a real JPEG data URL', () => {
    const result = inspectPdfImage(VALID_JPEG_DATA_URL);
    expect(result.ok).toBe(true);
    expect(result.format).toBe('jpeg');
  });

  it('passes binary values through — pdfkit sniffs Buffers itself', () => {
    expect(inspectPdfImage(makePng()).ok).toBe(true);
  });
});

describe('inspectPdfImage — rejects what pdfkit throws on', () => {
  // Each of these reproduced "Invalid image: Error: Unknown image format." against
  // pdfmake 0.3.7 / pdfkit 0.18 before this guard existed.
  const cases: Array<[string, string, string]> = [
    ['WebP', WEBP_DATA_URL, 'unsupported-format'],
    ['HEIC', HEIC_DATA_URL, 'unsupported-format'],
    ['GIF', GIF_DATA_URL, 'unsupported-format'],
    ['base64 SVG', SVG_DATA_URL, 'unsupported-format'],
    ['JSON error body', JSON_BODY_DATA_URL, 'unsupported-format'],
    ['percent-encoded SVG', SVG_UTF8_DATA_URL, 'not-base64'],
    ['remote URL', REMOTE_URL, 'remote-url'],
    ['truncated PNG', TRUNCATED_PNG_DATA_URL, 'truncated'],
    ['empty string', '', 'empty'],
    ['null', null as unknown as string, 'empty'],
  ];

  for (const [label, value, reason] of cases) {
    it(`rejects ${label} with reason "${reason}"`, () => {
      const result = inspectPdfImage(value);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe(reason);
      expect(result.detail).toBeTruthy();
    });
  }

  it('names the offending format so diagnostics are actionable', () => {
    expect(inspectPdfImage(WEBP_DATA_URL).detail).toContain('WebP');
    expect(inspectPdfImage(HEIC_DATA_URL).detail).toContain('HEIC');
    expect(inspectPdfImage(JSON_BODY_DATA_URL).detail).toContain('JSON');
  });

  it('explains that inline remote URLs are never fetched', () => {
    expect(inspectPdfImage(REMOTE_URL).detail).toContain('never fetches inline URLs');
  });
});

describe('isPdfSafeImage', () => {
  it('is a strict subset: only JPEG and PNG pass', () => {
    expect(isPdfSafeImage(VALID_PNG_DATA_URL)).toBe(true);
    expect(isPdfSafeImage(VALID_JPEG_DATA_URL)).toBe(true);
    for (const bad of [WEBP_DATA_URL, HEIC_DATA_URL, GIF_DATA_URL, SVG_DATA_URL, REMOTE_URL, '']) {
      expect(isPdfSafeImage(bad)).toBe(false);
    }
  });
});

describe('summariseImageValue', () => {
  it('describes data URLs without leaking the payload', () => {
    const summary = summariseImageValue(VALID_PNG_DATA_URL);
    expect(summary).toContain('image/png');
    expect(summary).not.toContain('base64,');
  });

  it('truncates long URLs', () => {
    const long = `https://example.invalid/${'a'.repeat(200)}.jpg`;
    expect(summariseImageValue(long).length).toBeLessThan(120);
  });
});
