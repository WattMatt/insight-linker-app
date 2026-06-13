import { describe, it, expect } from 'vitest';
import { createPageFooter } from './pdfMakeUtils';
import { formatDate } from './report/reportKernel';

// The footer factory returns (currentPage, pageCount) => Content.
// The page-number text lives in columns[1].text; the date in columns[2].text.
function pageText(content: any): string {
  if (content && typeof content === 'object' && 'columns' in content) {
    return content.columns[1].text;
  }
  return ''; // skipped page returns { text: '' }
}
function dateText(content: any): string {
  return content?.columns?.[2]?.text ?? '';
}

describe('createPageFooter', () => {
  it('skips the cover page (returns empty content)', () => {
    const footer = createPageFooter(true);
    expect(pageText(footer(1, 5))).toBe('');
  });
  it('numbers content pages correctly when skipping the cover', () => {
    const footer = createPageFooter(true);
    expect(pageText(footer(2, 5))).toBe('Page 1 of 4');
    expect(pageText(footer(5, 5))).toBe('Page 4 of 4');
  });
  it('never renders "Page 0 of 0"', () => {
    const footer = createPageFooter(true);
    // Defensive: a single-page doc with skip should not underflow.
    expect(pageText(footer(1, 1))).toBe(''); // page 1 is skipped
  });
  it('numbers every page when not skipping a cover', () => {
    const footer = createPageFooter(false);
    expect(pageText(footer(1, 3))).toBe('Page 1 of 3');
  });
  it('renders the generation date in the kernel day-first format (not numeric en-GB)', () => {
    const footer = createPageFooter(false);
    const text = dateText(footer(1, 3));
    expect(text).not.toContain('/');           // old "13/06/2026" is gone
    expect(text).toBe(formatDate(new Date())); // matches kernel "13 June 2026"
  });
});
