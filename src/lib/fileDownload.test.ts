/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: { loading: vi.fn(() => 'tid'), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
// downloadHandoff is imported by fileDownload; stub it so the module loads.
vi.mock('@/lib/downloadHandoff', () => ({ openDownloadHandoffWindow: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ download: vi.fn() }) } } }));

import { downloadBlob } from './fileDownload';

const blob = () => new Blob(['x'], { type: 'application/pdf' });

describe('downloadBlob — honest success/failure (#6)', () => {
  beforeEach(() => {
    toastMock.loading.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    toastMock.dismiss.mockClear();
    // Default: no File System Access API, not framed.
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    // Ensure not-in-iframe by default (jsdom: window.top === window.self).
    // jsdom does not implement URL.createObjectURL/revokeObjectURL — stub them.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  it('uses the File System Access picker when available and toasts success', async () => {
    const writable = { write: vi.fn(() => Promise.resolve()), close: vi.fn(() => Promise.resolve()) };
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn(() =>
      Promise.resolve({ createWritable: () => Promise.resolve(writable) }),
    );
    await downloadBlob(blob(), 'R.pdf');
    expect(writable.write).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('stays silent when the user cancels the save dialog (AbortError)', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn(() =>
      Promise.reject(new DOMException('cancelled', 'AbortError')),
    );
    await downloadBlob(blob(), 'R.pdf');
    expect(toastMock.dismiss).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('does NOT claim success when sandboxed and the popup is blocked', async () => {
    // Force the "in iframe" branch: window.top !== window.self.
    Object.defineProperty(window, 'top', { configurable: true, value: {} as Window });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null); // popup blocked
    await downloadBlob(blob(), 'R.pdf');
    expect(openSpy).toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    openSpy.mockRestore();
    Object.defineProperty(window, 'top', { configurable: true, value: window });
  });

  it('downloads via anchor and toasts success in a normal (non-framed) page', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadBlob(blob(), 'R.pdf');
    expect(clickSpy).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
