import React from "react";
import { ReportCustomization, ReportSection } from "@/components/pdf-editor/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PDFTemplatePreviewProps {
  customization: ReportCustomization;
  sections: ReportSection[];
  reportType: string;
}

const ACCENT_COLORS: Record<string, { primary: string; light: string; text: string }> = {
  blue: { primary: '#2563eb', light: '#dbeafe', text: '#1e40af' },
  green: { primary: '#16a34a', light: '#dcfce7', text: '#166534' },
  orange: { primary: '#ea580c', light: '#ffedd5', text: '#c2410c' },
  red: { primary: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
  purple: { primary: '#9333ea', light: '#f3e8ff', text: '#7e22ce' },
};

export const PDFTemplatePreview: React.FC<PDFTemplatePreviewProps> = ({
  customization,
  sections,
  reportType,
}) => {
  const colors = ACCENT_COLORS[customization.accentColor] || ACCENT_COLORS.blue;
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);

  // Sample data for preview
  const sampleData = {
    siteName: "Example Site Name",
    clientName: "Client Company Ltd",
    reference: "REF-2026-0001",
    date: format(new Date(), "dd MMMM yyyy"),
  };

  return (
    <div className="bg-muted/30 rounded-lg p-4 overflow-hidden">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {/* Cover Page */}
        <div 
          className="flex-shrink-0 w-[280px] bg-white rounded shadow-lg overflow-hidden border"
          style={{ aspectRatio: '210/297' }}
        >
          {/* Header accent bar */}
          <div className="h-3" style={{ backgroundColor: colors.primary }} />
          
          <div className="p-6 flex flex-col h-[calc(100%-12px)]">
            {/* Logo placeholder */}
            <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground mb-8">
              Logo
            </div>
            
            {/* Title section */}
            <div className="flex-1 flex flex-col justify-center">
              <h1 
                className="text-xl font-bold mb-2 leading-tight"
                style={{ color: colors.primary }}
              >
                {customization.coverTitle || 'Report Title'}
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                {customization.coverSubtitle}
              </p>
              
              <div className="space-y-1">
                <p className="text-sm font-medium">{sampleData.siteName}</p>
                <p className="text-xs text-muted-foreground">{sampleData.clientName}</p>
              </div>
            </div>
            
            {/* Footer info */}
            <div className="pt-4 border-t space-y-1 text-xs text-muted-foreground">
              {customization.includeDate && (
                <p>Date: {sampleData.date}</p>
              )}
              {customization.includeReference && (
                <p>Reference: {sampleData.reference}</p>
              )}
            </div>
          </div>
        </div>

        {/* Table of Contents (if enabled) */}
        {customization.includeTableOfContents && (
          <div 
            className="flex-shrink-0 w-[280px] bg-white rounded shadow-lg overflow-hidden border relative"
            style={{ aspectRatio: '210/297' }}
          >
            <div className="p-6">
              <h2 
                className="text-lg font-bold mb-4 pb-2 border-b"
                style={{ color: colors.primary, borderColor: colors.light }}
              >
                Table of Contents
              </h2>
              
              <div className="space-y-2">
                {enabledSections.map((section, idx) => (
                  <div key={section.id} className="flex justify-between text-sm">
                    <span className="truncate pr-2">{section.title}</span>
                    <span className="text-muted-foreground">{idx + 2}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {customization.includePageNumbers && (
              <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
                1
              </div>
            )}
          </div>
        )}

        {/* Executive Summary (if has content) */}
        {customization.executiveSummary && (
          <div 
            className="flex-shrink-0 w-[280px] bg-white rounded shadow-lg overflow-hidden border relative"
            style={{ aspectRatio: '210/297' }}
          >
            <div className="p-6">
              <h2 
                className="text-lg font-bold mb-4 pb-2 border-b"
                style={{ color: colors.primary, borderColor: colors.light }}
              >
                Executive Summary
              </h2>
              
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-[20]">
                {customization.executiveSummary}
              </p>
            </div>
            
            {customization.includePageNumbers && (
              <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
                {customization.includeTableOfContents ? 2 : 1}
              </div>
            )}
          </div>
        )}

        {/* Content Sections */}
        {enabledSections.map((section, idx) => (
          <div 
            key={section.id}
            className="flex-shrink-0 w-[280px] bg-white rounded shadow-lg overflow-hidden border relative"
            style={{ aspectRatio: '210/297' }}
          >
            {/* Watermark */}
            {customization.includeWatermark && (
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ 
                  transform: 'rotate(-45deg)',
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: 'rgba(0,0,0,0.05)',
                  letterSpacing: '0.1em'
                }}
              >
                {customization.watermarkText}
              </div>
            )}
            
            <div className="p-6">
              <h2 
                className="text-lg font-bold mb-4 pb-2 border-b"
                style={{ color: colors.primary, borderColor: colors.light }}
              >
                {section.title}
              </h2>
              
              {/* Render different content based on section type */}
              {section.type === 'table' && (
                <div className="space-y-1">
                  {/* Sample table header */}
                  <div 
                    className="flex text-xs font-medium p-1.5 rounded"
                    style={{ backgroundColor: colors.light, color: colors.text }}
                  >
                    <span className="flex-1">Column 1</span>
                    <span className="flex-1">Column 2</span>
                    <span className="flex-1">Column 3</span>
                  </div>
                  {/* Sample rows */}
                  {[1, 2, 3, 4].map(row => (
                    <div key={row} className="flex text-xs p-1.5 border-b border-muted/50">
                      <span className="flex-1 text-muted-foreground">Data {row}A</span>
                      <span className="flex-1 text-muted-foreground">Data {row}B</span>
                      <span className="flex-1 text-muted-foreground">Data {row}C</span>
                    </div>
                  ))}
                </div>
              )}
              
              {section.type === 'kpi' && (
                <div className="grid grid-cols-2 gap-3">
                  {['Total', 'Compliant', 'Pending', 'Issues'].map((label, i) => (
                    <div 
                      key={label}
                      className="p-3 rounded text-center"
                      style={{ backgroundColor: colors.light }}
                    >
                      <div 
                        className="text-lg font-bold"
                        style={{ color: colors.primary }}
                      >
                        {[42, 38, 3, 1][i]}
                      </div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {(section.type === 'text' || section.type === 'summary') && (
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.</p>
                  <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.</p>
                </div>
              )}
              
              {section.type === 'chart' && (
                <div className="flex items-end justify-center gap-2 h-32 pt-4">
                  {[60, 80, 45, 90, 70].map((height, i) => (
                    <div
                      key={i}
                      className="w-8 rounded-t"
                      style={{ 
                        height: `${height}%`,
                        backgroundColor: i === 3 ? colors.primary : colors.light
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            
            {customization.includePageNumbers && (
              <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
                {idx + (customization.includeTableOfContents ? 2 : 1) + (customization.executiveSummary ? 1 : 0)}
              </div>
            )}
          </div>
        ))}

        {/* Notes Page (if has content) */}
        {customization.customNotes && (
          <div 
            className="flex-shrink-0 w-[280px] bg-white rounded shadow-lg overflow-hidden border relative"
            style={{ aspectRatio: '210/297' }}
          >
            <div className="p-6">
              <h2 
                className="text-lg font-bold mb-4 pb-2 border-b"
                style={{ color: colors.primary, borderColor: colors.light }}
              >
                Notes
              </h2>
              
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-[20]">
                {customization.customNotes}
              </p>
            </div>
            
            {customization.includePageNumbers && (
              <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
                {enabledSections.length + (customization.includeTableOfContents ? 2 : 1) + (customization.executiveSummary ? 1 : 0)}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Page indicator */}
      <div className="flex justify-center gap-2 pt-2">
        <span className="text-xs text-muted-foreground">
          {1 + (customization.includeTableOfContents ? 1 : 0) + (customization.executiveSummary ? 1 : 0) + enabledSections.length + (customization.customNotes ? 1 : 0)} pages
        </span>
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-xs text-muted-foreground">Scroll to see all pages →</span>
      </div>
    </div>
  );
};
