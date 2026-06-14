import { describe, it, expect } from 'vitest';
import {
  buildTemplateItemRows,
  buildTemplateMeta,
  type InspectionTemplateData,
  type TemplateSection,
} from './inspectionTemplateRows';

describe('buildTemplateItemRows', () => {
  const section = (items: TemplateSection['items']): TemplateSection => ({ title: 'S', items });

  it('maps required to Yes/No and joins options', () => {
    const rows = buildTemplateItemRows(section([
      { label: 'Condition', type: 'select', required: true, options: ['Good', 'Fair', 'Poor'] },
    ]));
    expect(rows[0]).toEqual({ label: 'Condition', type: 'select', required: 'Yes', options: 'Good, Fair, Poor' });
  });

  it('uses No and em-dash options when absent', () => {
    const [row] = buildTemplateItemRows(section([{ label: 'Notes', type: 'text' }]));
    expect(row.required).toBe('No');
    expect(row.options).toBe('—');
  });

  it('guards blank label/type', () => {
    const [row] = buildTemplateItemRows(section([{ label: '  ', type: '' }]));
    expect(row.label).toBe('—');
    expect(row.type).toBe('—');
  });

  it('returns an empty array for a section with no items', () => {
    expect(buildTemplateItemRows({ title: 'Empty' })).toEqual([]);
  });
});

describe('buildTemplateMeta', () => {
  const data = (o: Partial<InspectionTemplateData> = {}): InspectionTemplateData => ({
    templateName: 'T', sections: [], ...o,
  });

  it('counts sections and total fields across sections', () => {
    const meta = buildTemplateMeta(data({
      category: 'Electrical',
      sections: [
        { title: 'A', items: [{ label: '1' }, { label: '2' }] },
        { title: 'B', items: [{ label: '3' }] },
      ],
    }));
    expect(meta).toEqual([
      { label: 'Category', value: 'Electrical' },
      { label: 'Sections', value: '2' },
      { label: 'Total Fields', value: '3' },
    ]);
  });

  it('falls back to em-dash category and zero counts', () => {
    const meta = buildTemplateMeta(data());
    expect(meta.find((m) => m.label === 'Category')!.value).toBe('—');
    expect(meta.find((m) => m.label === 'Total Fields')!.value).toBe('0');
  });
});
