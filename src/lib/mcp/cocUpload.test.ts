import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { checkCocUpload, isPoolPathOf } from "./fortressTools";
import { poolDetection, poolObjectPath } from "@/lib/coc/poolUpload";

const SITE = "16729bf2-d71b-40d1-b8c6-b57d1cadd46a";

describe("COC upload helpers", () => {
  it("builds the same pool path as the app upload", () => {
    expect(poolObjectPath(SITE, "NM-1751468_SHOP 12 (PEP)_I.pdf", 1700000000000))
      .toBe(`${SITE}/_pool/1700000000000-NM-1751468_SHOP_12__PEP__I.pdf`);
  });
  it("detects the certificate number and kind from the file name", () => {
    expect(poolDetection("NM-1751468_SHOP-12_I.pdf")).toEqual({ detected_cert_no: expect.stringMatching(/1751468/), detected_kind: "coc" });
    expect(poolDetection("FAIL_ECA 1234567.html").detected_kind).toBe("eval");
  });
  it("accepts only pool paths of the same site", () => {
    expect(isPoolPathOf(SITE, poolObjectPath(SITE, "a b.pdf", 1))).toBe(true);
    expect(isPoolPathOf(SITE, `${SITE}/_pool/../x.pdf`)).toBe(false);
    expect(isPoolPathOf(SITE, `other/_pool/1-a.pdf`)).toBe(false);
    expect(isPoolPathOf(SITE, `${SITE}/COC/1-a.pdf`)).toBe(false);
  });
  it("validates file type and size like the app", () => {
    expect(checkCocUpload("x.PDF", 1000)).toBe("application/pdf");
    expect(checkCocUpload("x.jpeg")).toBe("image/jpeg");
    expect(() => checkCocUpload("x.exe")).toThrow(/only PDF/);
    expect(() => checkCocUpload("dir/x.pdf")).toThrow(/bare file name/);
    expect(() => checkCocUpload("x.pdf", 60 * 1024 * 1024)).toThrow(/50 MB/);
  });
});
