import { describe, it, expect } from 'vitest';
import { validateUploadFile, MAX_FILE_SIZE_BYTES } from './uploadConstraints';

function fakeFile(name: string, size: number, type = ''): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateUploadFile', () => {
  it('accepts an allowed type under the size cap', () => {
    expect(validateUploadFile(fakeFile('Manual.pdf', 1024, 'application/pdf'))).toEqual({ ok: true });
  });

  it('rejects a disallowed extension', () => {
    const r = validateUploadFile(fakeFile('malware.exe', 1024, ''));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/type/i);
  });

  it('rejects a file over the size cap', () => {
    const r = validateUploadFile(fakeFile('big.pdf', MAX_FILE_SIZE_BYTES + 1, 'application/pdf'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/large|size|MB/i);
  });

  it('matches the extension case-insensitively', () => {
    expect(validateUploadFile(fakeFile('Scan.PDF', 1024, 'application/pdf')).ok).toBe(true);
  });
});
