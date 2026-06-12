import { describe, it, expect } from 'vitest';
import { cocFailsGate, COC_STATUSES, isExpired } from './cocCompliance';

describe('cocFailsGate (mirror of the DB recompute gate)', () => {
  const today = '2026-06-12';
  it('not required => never gates, even on Fail', () => {
    expect(cocFailsGate({ isCocRequired: false, cocStatus: 'Fail', cocExpiryDate: null }, today)).toBe(false);
  });
  it('required + Fail => gates (forces non-compliant)', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Fail', cocExpiryDate: null }, today)).toBe(true);
  });
  it('required + legacy "Failed"/"Rejected" => gates (vocab-tolerant)', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Failed', cocExpiryDate: null }, today)).toBe(true);
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Rejected', cocExpiryDate: null }, today)).toBe(true);
  });
  it('required + Pass + future expiry => does NOT gate', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: '2027-01-01' }, today)).toBe(false);
  });
  it('required + Pass + past expiry => gates', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: '2025-01-01' }, today)).toBe(true);
  });
  it('required + Pass + no expiry => does NOT gate', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: null }, today)).toBe(false);
  });
  it('required + Missing/Pending => does NOT gate (inspections decide)', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Missing', cocExpiryDate: null }, today)).toBe(false);
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pending', cocExpiryDate: null }, today)).toBe(false);
  });
});

describe('isExpired', () => {
  it('null expiry is never expired', () => expect(isExpired(null, '2026-06-12')).toBe(false));
  it('past date is expired', () => expect(isExpired('2025-01-01', '2026-06-12')).toBe(true));
  it('today is not expired', () => expect(isExpired('2026-06-12', '2026-06-12')).toBe(false));
});

describe('COC_STATUSES', () => {
  it('is the 5-value set', () => expect(COC_STATUSES).toEqual(['Missing', 'Pending', 'Pass', 'Fail', 'N/A']));
});
