import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  qrRedirectUrl,
  publicSubsectionUrl,
  resolveQrBaseUrl,
  DEFAULT_QR_ORIGIN,
} from './qrBaseUrl';

describe('qrRedirectUrl (durable QR payload)', () => {
  const ORIG = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc123.supabase.co';
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG;
  });

  it('encodes the stable qr-redirect endpoint, NOT the app domain', () => {
    expect(qrRedirectUrl('11111111-2222-4333-8444-555555555555')).toBe(
      'https://abc123.supabase.co/functions/v1/qr-redirect?path=11111111-2222-4333-8444-555555555555',
    );
  });

  it('strips a trailing slash on the supabase url', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc123.supabase.co/';
    expect(qrRedirectUrl('the-id')).toBe(
      'https://abc123.supabase.co/functions/v1/qr-redirect?path=the-id',
    );
  });

  it('is domain-independent — never contains the app origin or landing path', () => {
    const out = qrRedirectUrl('abc');
    // The whole point: a frontend domain change must not orphan printed codes,
    // so the payload must not bake in the app domain or the /public path.
    expect(out).not.toContain('vercel.app');
    expect(out).not.toContain('lovable.app');
    expect(out).not.toContain('/public/subsections/');
  });
});

describe('publicSubsectionUrl (live landing link — still domain-resolved)', () => {
  it('builds the landing URL from the configured base', () => {
    expect(publicSubsectionUrl('id-1', 'https://example.com')).toBe(
      'https://example.com/public/subsections/id-1',
    );
  });

  it('falls back to the prod default when unset', () => {
    expect(resolveQrBaseUrl(null)).toBe(DEFAULT_QR_ORIGIN);
  });
});
