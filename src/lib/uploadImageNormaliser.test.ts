import { describe, it, expect } from 'vitest';
import {
  applyExtension,
  isHeicSource,
  labelFor,
  describeRejectedSource,
  normaliseImageForUpload,
} from './uploadImageNormaliser';
import { VALID_PNG_DATA_URL, VALID_JPEG_DATA_URL, makePng } from './pdf/imageFixtures';

/**
 * Build a File from bytes. The BlobPart cast works around TS 5.7's
 * Uint8Array<ArrayBufferLike> vs BlobPart typing, as elsewhere in the repo.
 */
function fileFromBytes(bytes: Buffer, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

/** Build a File from a base64 data URL without needing a DOM. */
function fileFromDataUrl(dataUrl: string, name: string, type: string): File {
  return fileFromBytes(Buffer.from(dataUrl.split('base64,')[1], 'base64'), name, type);
}

describe('applyExtension', () => {
  it('replaces an existing extension', () => {
    expect(applyExtension('photo.heic', 'jpg')).toBe('photo.jpg');
    expect(applyExtension('logo.svg', 'png')).toBe('logo.png');
  });

  it('appends when there is no extension', () => {
    expect(applyExtension('logo', 'png')).toBe('logo.png');
  });

  it('does not mistake a dotted directory for an extension', () => {
    expect(applyExtension('a.b/photo', 'jpg')).toBe('a.b/photo.jpg');
  });

  it('handles an empty name', () => {
    expect(applyExtension('', 'jpg')).toBe('image.jpg');
  });
});

describe('isHeicSource', () => {
  it('detects by MIME type', () => {
    expect(isHeicSource({ type: 'image/heic' })).toBe(true);
    expect(isHeicSource({ type: 'image/HEIF' })).toBe(true);
  });

  it('detects by filename when the browser reports no type', () => {
    // iOS share sheets frequently hand over an empty type.
    expect(isHeicSource({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
  });

  it('does not match ordinary photos', () => {
    expect(isHeicSource({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
  });
});

describe('labelFor — the mislabelling fix', () => {
  it('labels JPEG bytes as JPEG', () => {
    expect(labelFor('jpeg', true)).toEqual({ mime: 'image/jpeg', extension: 'jpg', recompressed: true });
  });

  it('labels PNG bytes as PNG, not JPEG', () => {
    // The old code renamed everything .jpg and set image/jpeg regardless.
    expect(labelFor('png', true)).toEqual({ mime: 'image/png', extension: 'png', recompressed: true });
  });

  it('mime and extension always agree', () => {
    for (const format of ['jpeg', 'png'] as const) {
      const { mime, extension } = labelFor(format, false);
      expect(mime.replace('image/', '')).toBe(extension === 'jpg' ? 'jpeg' : 'png');
    }
  });
});

describe('describeRejectedSource', () => {
  it('names the format from the MIME type', () => {
    expect(describeRejectedSource({ type: 'image/svg+xml' })).toBe('SVG+XML');
  });

  it('falls back to the file extension', () => {
    expect(describeRejectedSource({ type: '', name: 'drawing.avif' })).toBe('AVIF');
  });

  it('degrades gracefully with nothing to go on', () => {
    expect(describeRejectedSource({})).toBe('unrecognised');
  });
});

describe('normaliseImageForUpload — without a DOM (canvas unavailable)', () => {
  // In Node the canvas re-encode cannot run, which exercises the fallback that
  // used to mislabel: bytes are passed through, so the label must match them.
  it('passes a real PNG through under its TRUE label', async () => {
    const file = fileFromDataUrl(VALID_PNG_DATA_URL, 'logo.png', 'image/png');
    const result = await normaliseImageForUpload(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.mime).toBe('image/png');
    expect(result.image.extension).toBe('png');
    expect(result.image.recompressed).toBe(false);
  });

  it('passes a real JPEG through under its true label', async () => {
    const file = fileFromDataUrl(VALID_JPEG_DATA_URL, 'photo.jpg', 'image/jpeg');
    const result = await normaliseImageForUpload(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.mime).toBe('image/jpeg');
    expect(result.image.extension).toBe('jpg');
  });

  it('trusts the BYTES, not the declared type', async () => {
    // This is the exact shape of the stored corruption: PNG bytes in a file
    // claiming to be a JPEG. The old path would have kept the lie.
    const file = fileFromBytes(makePng(), 'mislabelled.jpg', 'image/jpeg');
    const result = await normaliseImageForUpload(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.mime).toBe('image/png');
    expect(result.image.extension).toBe('png');
  });

  it('refuses an SVG rather than storing it as .jpg when it cannot be rasterised', async () => {
    // NOTE: in a real browser this SVG DOES rasterise — a viewBox-only SVG gets a
    // default 150x150 intrinsic size (verified in-browser), so it is converted to
    // PNG rather than refused. What this asserts is the fallback contract: when
    // re-encoding is unavailable, refuse. The old code stored it as .jpg instead.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>';
    const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });

    const result = await normaliseImageForUpload(file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toContain('SVG');
    expect(result.error.reason).toContain('JPG or PNG');
  });

  it('refuses a WebP that cannot be re-encoded', async () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(14, 0),
    ]);
    const result = await normaliseImageForUpload(fileFromBytes(webp, 'a.webp', 'image/webp'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toContain('WEBP');
  });

  it('refuses a non-image body outright', async () => {
    const file = new File(['{"error":"nope"}'], 'a.json', { type: 'application/json' });
    const result = await normaliseImageForUpload(file);
    expect(result.ok).toBe(false);
  });

  it('refuses HEIC when conversion is unavailable rather than storing it as .jpg', async () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(12, 0),
    ]);
    const result = await normaliseImageForUpload(fileFromBytes(heic, 'IMG_1.HEIC', 'image/heic'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toContain('HEIC');
  });
});
