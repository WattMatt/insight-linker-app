import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  BookOpen, 
  Code, 
  FileText, 
  Search, 
  Zap, 
  Shield, 
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Target,
  FolderOpen
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// Skill categories aligned with electrical compliance work
const SKILL_CATEGORIES = [
  { id: "compliance", label: "SANS Compliance", icon: Shield, color: "bg-blue-500" },
  { id: "inspection", label: "Inspection Procedures", icon: CheckCircle2, color: "bg-green-500" },
  { id: "documentation", label: "Documentation Standards", icon: FileText, color: "bg-purple-500" },
  { id: "technical", label: "Technical Guidelines", icon: Code, color: "bg-orange-500" },
  { id: "safety", label: "Safety Protocols", icon: AlertTriangle, color: "bg-red-500" },
];

// Base skills structure - these will be stored in the database
const BASE_SKILLS = [
  {
    id: "pdf-generation-pipeline",
    name: "PDF Generation Pipeline",
    category: "technical",
    description: "Architecture and best practices for high-fidelity inspection report PDF generation",
    version: "2.0.0",
    content: `# PDF Generation Pipeline

## Architecture Overview

The system uses a **pre-embedding strategy** where all images are downloaded and converted to Base64 data URIs BEFORE sending to the PDF renderer. This eliminates timeout issues and ensures 100% image reliability.

## Pipeline Phases

1. **Data Collection** - Client-side inspection data gathering
2. **Image URL Extraction** - All sections, snags, tenants
3. **Parallel Image Download** - Batches of 5 concurrent downloads
4. **Base64 Embedding** - With compression fallback
5. **HTML Template Generation** - Embedded images
6. **Browserless Render** - waitUntil: 'load' (no network wait)
7. **Upload to Supabase Storage**

## Key Improvements

### Image Pre-embedding
- All images downloaded via Supabase Storage API
- Converted to data:image/jpeg;base64 format
- No network requests during Chrome render

### Parallel Processing
- Images processed in batches of 5 concurrently
- 3-5x faster than sequential processing
- Graceful fallback to placeholder for failures

### Retry Logic
- 2 retry attempts per image with exponential backoff
- 15-second timeout per download
- Detailed logging for debugging

## Configuration
- MAX_IMAGE_WIDTH: 800px
- JPEG_QUALITY: 0.75
- MAX_IMAGE_SIZE_KB: 300
- PARALLEL_BATCH_SIZE: 5
- DOWNLOAD_TIMEOUT_MS: 15000

## Timing Benchmarks
| Phase | Typical Time |
|-------|--------------|
| URL Extraction | <10ms |
| Image Processing (20 images) | 3-8 seconds |
| HTML Generation | <100ms |
| Browserless Render | 2-5 seconds |
| Upload | 500ms-2s |
| **TOTAL** | 8-15 seconds |
`,
  },
  {
    id: "sans-10142-compliance",
    name: "SANS 10142-1 Compliance Checklist",
    category: "compliance",
    description: "Standard checklist for verifying compliance with SANS 10142-1 electrical installation regulations",
    version: "1.0.0",
    content: `# SANS 10142-1 Compliance Verification

## Overview
This skill provides a systematic approach to verifying electrical installations comply with SANS 10142-1 requirements.

## Prerequisites
- Access to current SANS 10142-1 documentation
- Appropriate testing equipment (insulation tester, earth continuity tester, RCD tester)
- Valid electrical contractor registration

## Verification Steps

### 1. Documentation Review
- [ ] Verify COC is present and valid
- [ ] Check installation drawings match as-built
- [ ] Confirm circuit schedules are accurate

### 2. Visual Inspection
- [ ] DB board labeling complete
- [ ] Cable sizing appropriate for load
- [ ] Earth bonding visible and secure

### 3. Testing Requirements
- [ ] Earth continuity < 1Ω
- [ ] Insulation resistance > 1MΩ
- [ ] RCD trip time < 300ms at In
- [ ] RCD trip time < 40ms at 5×In

## Common Non-Conformances
1. Missing or incorrect circuit identification
2. Inadequate earth bonding
3. Incorrect breaker sizing for cable
4. Missing or faulty RCDs

## Reference Documents
- SANS 10142-1:2020
- SANS 10142-2:2020 (Low-voltage installations)
`,
  },
  {
    id: "coc-validation-procedure",
    name: "COC Validation Procedure",
    category: "inspection",
    description: "Step-by-step procedure for validating Certificate of Compliance documents",
    version: "1.0.0",
    content: `# COC Validation Procedure

## Purpose
Ensure all uploaded Certificates of Compliance meet regulatory requirements and contain accurate information.

## Validation Workflow

### Phase 1: Document Authenticity
1. Verify issuing contractor is registered
2. Check certificate number format
3. Validate issue date is not future-dated

### Phase 2: Technical Compliance
1. **Earth Continuity Check**
   - Maximum threshold: 1Ω
   - Auto-fail if exceeded

2. **Insulation Resistance**
   - Minimum threshold: 1MΩ
   - Test between phases and earth

3. **RCD Testing**
   - 1× rated current: ≤300ms
   - 5× rated current: ≤40ms

### Phase 3: Hierarchy Verification
1. Confirm initial COC reference exists
2. Verify amendment chain is complete
3. Check no gaps in coverage

## Automated Checks
The system automatically validates:
- Certificate number format
- Date validity
- Signature presence
- Test value thresholds

## Manual Review Required
- Complex installations
- Historical certificates
- Non-standard configurations
`,
  },
  {
    id: "inspection-report-standards",
    name: "Inspection Report Standards",
    category: "documentation",
    description: "Guidelines for creating consistent, professional inspection reports",
    version: "1.0.0",
    content: `# Inspection Report Documentation Standards

## Report Structure

### 1. Cover Page Requirements
- Site name and address
- Inspection date
- Inspector credentials
- Client reference

### 2. Executive Summary
- Overall compliance status
- Critical findings count
- Recommended actions

### 3. Detailed Findings
Each finding must include:
- Location identifier
- Description of issue
- Photographic evidence
- Risk classification
- Remediation recommendation

## Photography Guidelines

### General Requirements
- Minimum resolution: 1920×1080
- Clear focus on subject
- Include reference markers
- Capture before/after states

### Naming Convention
\`[Site]_[Location]_[Type]_[Date].jpg\`

Example: \`Sandton_DB01_EarthBond_20240115.jpg\`

## Quality Thresholds
- All photos must be geotagged
- Minimum 2 photos per finding
- Include measurement reference where applicable

## Report Generation
- Use PDF format for final reports
- Include table of contents for 10+ pages
- Digital signatures required
`,
  },
  {
    id: "electrical-testing-guide",
    name: "Electrical Testing Guide",
    category: "technical",
    description: "Technical guide for conducting electrical installation tests per SANS requirements",
    version: "1.0.0",
    content: `# Electrical Testing Technical Guide

## Required Equipment
1. Insulation Resistance Tester (Megger)
2. Earth Continuity Tester
3. RCD Tester
4. Loop Impedance Tester
5. Phase Rotation Tester

## Test Procedures

### Earth Continuity Test
**Purpose:** Verify protective conductors provide low-resistance path

**Method:**
1. Disconnect supply
2. Connect test leads between earth bar and furthest point
3. Apply test current (typically 200mA)
4. Record resistance

**Pass Criteria:** R ≤ 1Ω

### Insulation Resistance Test
**Purpose:** Verify insulation integrity between conductors

**Method:**
1. Disconnect all loads
2. Link all phase conductors
3. Test between phases and earth at 500V DC
4. Maintain test for minimum 1 minute

**Pass Criteria:** R ≥ 1MΩ

### RCD Test
**Purpose:** Verify RCD operates within time limits

**Test Points:**
| Current | Max Trip Time |
|---------|---------------|
| 0.5×In  | No trip       |
| 1×In    | ≤300ms        |
| 5×In    | ≤40ms         |

## Documentation
Record all test results with:
- Test equipment serial numbers
- Calibration dates
- Ambient conditions
- Circuit identification
`,
  },
  {
    id: "safety-isolation-procedure",
    name: "Safe Isolation Procedure",
    category: "safety",
    description: "Mandatory safety procedure for isolating electrical installations before work",
    version: "1.0.0",
    content: `# Safe Isolation Procedure

## ⚠️ CRITICAL SAFETY PROCEDURE
This procedure MUST be followed before any work on electrical installations.

## The Safe Isolation Process

### Step 1: Identify
- Confirm correct circuit/equipment to be isolated
- Verify isolation point location
- Check for multiple supplies

### Step 2: Isolate
- Switch off circuit breaker/isolator
- Remove fuses if applicable
- Apply lock-out/tag-out device

### Step 3: Secure
- Lock isolation device in OFF position
- Attach warning notice
- Retain key

### Step 4: Verify
- Test voltage indicator on known live source
- Test circuit for dead (all phases + neutral)
- Test voltage indicator again on known live source

### Step 5: Document
- Record isolation details
- Note time of isolation
- Identify person responsible

## Lock-Out/Tag-Out Requirements
- One lock per person working
- Tags must include:
  - Worker name
  - Date and time
  - Reason for isolation
  - Contact number

## Re-Energization Checklist
- [ ] All workers accounted for
- [ ] All tools and materials removed
- [ ] Guards and covers replaced
- [ ] Lock and tag removed by installer only
- [ ] Warning given before re-energization

## Emergency Contacts
- Site Manager: [As per site]
- Emergency Services: 10111
- Poison Control: 0800 333 444
`,
  },
];

export default function DevelopmentSkills() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSkill, setSelectedSkill] = useState<typeof BASE_SKILLS[0] | null>(null);

  // In future, this could fetch from database
  const skills = BASE_SKILLS;

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch = 
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || skill.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryInfo = (categoryId: string) => {
    return SKILL_CATEGORIES.find((c) => c.id === categoryId);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="border-b px-4 py-3 flex items-center gap-4">
            <SidebarTrigger />
            <Breadcrumbs
              items={[
                { label: "Documentation", href: "/coc-documentation" },
                { label: "Development Skills" },
              ]}
            />
          </div>

          <div className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-3">
                    <BookOpen className="h-8 w-8 text-primary" />
                    Development Skills
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Structured guidelines and procedures for SANS-compliant electrical documentation
                  </p>
                </div>
                <Badge variant="outline" className="text-sm">
                  {skills.length} Skills Available
                </Badge>
              </div>

              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search skills..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    {SKILL_CATEGORIES.map((cat) => (
                      <TabsTrigger key={cat.id} value={cat.id} className="hidden sm:flex">
                        <cat.icon className="h-4 w-4 mr-1" />
                        {cat.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {/* Main Content */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Skills List */}
                <div className="lg:col-span-1 space-y-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <FolderOpen className="h-5 w-5" />
                    Available Skills
                  </h2>
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-3">
                      {filteredSkills.map((skill) => {
                        const category = getCategoryInfo(skill.category);
                        return (
                          <Card
                            key={skill.id}
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedSkill?.id === skill.id
                                ? "ring-2 ring-primary"
                                : ""
                            }`}
                            onClick={() => setSelectedSkill(skill)}
                          >
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between">
                                <CardTitle className="text-base">{skill.name}</CardTitle>
                                <Badge
                                  variant="secondary"
                                  className={`${category?.color} text-white text-xs`}
                                >
                                  {category?.label}
                                </Badge>
                              </div>
                              <CardDescription className="text-sm">
                                {skill.description}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>v{skill.version}</span>
                                <span className="flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  Active
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Skill Detail */}
                <div className="lg:col-span-2">
                  {selectedSkill ? (
                    <Card className="h-[650px] flex flex-col">
                      <CardHeader className="border-b">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Target className="h-5 w-5 text-primary" />
                              {selectedSkill.name}
                            </CardTitle>
                            <CardDescription>{selectedSkill.description}</CardDescription>
                          </div>
                          <Badge variant="outline">v{selectedSkill.version}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full p-6">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{selectedSkill.content}</ReactMarkdown>
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="h-[650px] flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Select a skill to view details</p>
                        <p className="text-sm">
                          Choose from the available skills to see guidelines and procedures
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
