import { describe, it, expect } from 'vitest';
import { PAGE_CONFIG, FOOTER_CONTENT_OFFSET_PT, mmToPt } from './pdfMakeConfig';
import { DOCUMENT_DESIGN_STANDARDS } from './documentDesignStandards';

const { margins, headers, footers } = DOCUMENT_DESIGN_STANDARDS;

describe('PAGE_CONFIG margins', () => {
  it('derives every margin from DOCUMENT_DESIGN_STANDARDS', () => {
    // Previously top was a hardcoded 64pt and bottom was mmToPt(35)≈99pt, neither
    // traceable to the standard. Page geometry must come from one place.
    expect(PAGE_CONFIG.pageMargins).toEqual([
      mmToPt(margins.left),
      mmToPt(margins.top),
      mmToPt(margins.right),
      mmToPt(margins.bottom),
    ]);
  });

  it('top margin clears the running header band', () => {
    // createPageHeader draws a full-width band ~headers.height tall starting at
    // y=0; content must begin below it.
    expect(PAGE_CONFIG.pageMargins[1]).toBeGreaterThan(mmToPt(headers.height));
  });

  it('footer offset leaves exactly the standard footer band below it', () => {
    // pdfmake's footer area starts at (pageHeight - pageMargins[3]); shifting
    // content down by this offset leaves footers.height of band beneath it.
    expect(FOOTER_CONTENT_OFFSET_PT).toBeCloseTo(mmToPt(margins.bottom - footers.height), 5);
    expect(FOOTER_CONTENT_OFFSET_PT).toBeGreaterThanOrEqual(0);
    expect(FOOTER_CONTENT_OFFSET_PT).toBeLessThan(PAGE_CONFIG.pageMargins[3]);
  });

  it('does not waste vertical space at the bottom of the page', () => {
    // The old 35mm bottom margin left ~25mm of dead space between where content
    // stopped and where the footer text sat.
    expect(PAGE_CONFIG.pageMargins[3]).toBeLessThan(mmToPt(25));
  });
});
