import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const { codeFiles, reviewType = 'full', focusAreas = [] } = await req.json();
    const ABACUS_API_KEY = Deno.env.get("ABACUS_AI_API_KEY");
    if (!ABACUS_API_KEY) {
      throw new Error("ABACUS_AI_API_KEY is not configured");
    }
    if (!codeFiles || codeFiles.length === 0) {
      throw new Error("No code files provided for review");
    }
    // Build review-specific system prompts
    const reviewPrompts = {
      'full': `You are an expert senior software engineer and code reviewer. Provide a comprehensive code review covering:

## Review Categories

### 1. Code Quality & Best Practices
- Clean code principles adherence
- DRY (Don't Repeat Yourself) violations
- SOLID principles compliance
- Code readability and maintainability
- Naming conventions consistency
- Comment quality and necessity

### 2. Architecture & Design Patterns
- Component structure and organization
- Separation of concerns
- Coupling and cohesion analysis
- Design pattern usage appropriateness
- Scalability considerations

### 3. Performance Optimization
- Inefficient algorithms or data structures
- Memory leaks or excessive memory usage
- Unnecessary re-renders (React)
- Bundle size impact
- Database query optimization opportunities

### 4. Security Vulnerabilities
- Input validation gaps
- XSS vulnerabilities
- SQL injection risks
- Sensitive data exposure
- Authentication/authorization weaknesses

### 5. Error Handling & Resilience
- Exception handling coverage
- Edge case handling
- Graceful degradation
- Error messaging quality

### 6. Testing & Testability
- Code testability assessment
- Missing test coverage areas
- Test quality if tests provided

### 7. TypeScript Best Practices
- Type safety issues
- Any/unknown usage
- Interface vs type usage
- Generics opportunities

Provide actionable recommendations with code examples where helpful.`,
      'security': `You are a senior security engineer specializing in web application security. Focus exclusively on security aspects:

## Security Review Focus

### 1. Input Validation & Sanitization
- User input handling
- SQL/NoSQL injection vectors
- Command injection risks
- Path traversal vulnerabilities

### 2. Authentication & Authorization
- Session management
- Token handling (JWT, etc.)
- Access control implementation
- Privilege escalation risks

### 3. Data Protection
- Sensitive data exposure
- Encryption implementation
- Secrets management
- PII handling

### 4. API Security
- Rate limiting
- CORS configuration
- API key exposure
- Request validation

### 5. Client-Side Security
- XSS vulnerabilities
- CSRF protection
- Clickjacking risks
- DOM-based attacks

### 6. Dependency Security
- Known vulnerable packages
- Outdated dependencies
- Supply chain risks

Rate each finding by severity (Critical/High/Medium/Low/Info).`,
      'performance': `You are a performance optimization specialist. Focus exclusively on performance aspects:

## Performance Review Focus

### 1. Rendering Performance (React)
- Unnecessary re-renders
- Missing memoization (useMemo, useCallback, React.memo)
- Virtual DOM optimization
- Component splitting opportunities

### 2. Data Fetching
- N+1 query patterns
- Over-fetching
- Missing pagination
- Caching opportunities
- Request waterfall issues

### 3. Bundle Size
- Tree-shaking opportunities
- Code splitting needs
- Unnecessary dependencies
- Dynamic import opportunities

### 4. Memory Management
- Memory leak risks
- Object reference handling
- Event listener cleanup
- Large data structure handling

### 5. Algorithm Efficiency
- Time complexity issues
- Space complexity concerns
- Optimization opportunities

### 6. Loading Performance
- Lazy loading opportunities
- Resource prioritization
- Critical rendering path

Provide benchmarking suggestions and estimated impact where possible.`,
      'architecture': `You are a software architect reviewing code structure. Focus exclusively on architecture:

## Architecture Review Focus

### 1. Code Organization
- Folder structure appropriateness
- Module boundaries
- Feature vs layer organization
- Shared code management

### 2. Component Design
- Single responsibility adherence
- Component size and complexity
- Props drilling vs context/state management
- Composition patterns

### 3. State Management
- State placement decisions
- Local vs global state
- State synchronization
- Derived state handling

### 4. API Design
- Interface contracts
- Error handling patterns
- Versioning considerations
- Backward compatibility

### 5. Dependency Management
- Coupling assessment
- Dependency inversion
- Circular dependencies
- External dependency abstraction

### 6. Scalability
- Horizontal scaling readiness
- Feature extensibility
- Technical debt assessment

Provide refactoring recommendations with architectural diagrams where helpful.`,
      'sans-compliance': `You are an electrical compliance expert familiar with SANS 10142-1 (South African National Standards for electrical installations). Review code related to Certificate of Compliance (COC) processing:

## SANS Compliance Review Focus

### 1. COC Data Validation
- Required field enforcement
- Data format compliance
- Value range validation (e.g., earth continuity ≤1Ω, insulation resistance ≥1MΩ)
- Test result interpretation

### 2. Safety-Critical Checks
- RCD trip time validation (≤300ms at 1x, ≤40ms at 5x)
- Earth fault loop impedance
- Protective conductor integrity
- Circuit protection coordination

### 3. Certificate Hierarchy
- Initial vs periodic inspection handling
- Previous certificate referencing
- Amendment tracking

### 4. Signature & Authentication
- Digital signature validation
- Responsible person verification
- Date integrity checks

### 5. Regulatory Compliance Logic
- Expiry date calculations (2 years domestic, 3 years commercial)
- Mandatory check enforcement
- Auto-fail condition handling

### 6. Audit Trail
- Decision logging completeness
- Traceability requirements
- Document versioning

Provide SANS regulation references for each finding.`
    };
    const systemPrompt = reviewPrompts[reviewType] || reviewPrompts['full'];
    const focusAreasText = focusAreas.length > 0 ? `\n\n## Additional Focus Areas\nPay special attention to: ${focusAreas.join(', ')}` : '';
    const codeContent = codeFiles.map((file)=>`
### File: ${file.path}
\`\`\`typescript
${file.content}
\`\`\`
`).join('\n\n');
    const userPrompt = `Review the following code files:

${codeContent}

${focusAreasText}

Provide a structured review with:
1. **Executive Summary** - Overall assessment and key findings
2. **Critical Issues** - Must-fix problems (if any)
3. **Recommendations** - Prioritized improvement suggestions
4. **Code Examples** - Refactored code snippets where helpful
5. **Quality Score** - Rate overall quality (1-10) with breakdown by category

IMPORTANT: At the end of your review, generate a **Development Prompt** section formatted as:

\`\`\`prompt
[A comprehensive, actionable development prompt that can be copied directly into a development platform like Lovable, Cursor, or similar AI-assisted development tools. This prompt should:
- Summarize the key issues found
- Provide specific, step-by-step instructions for fixes
- Include code patterns or examples where helpful
- Be structured for immediate use by a developer or AI assistant]
\`\`\`

This development prompt should be self-contained and actionable without needing to reference the original review.`;
    // Call Abacus AI RouteLLM API (OpenAI-compatible interface)
    // Documentation: https://abacus.ai/help/developer-platform/route-llm/api
    const response = await fetch("https://routellm.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ABACUS_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "route-llm",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 8000
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Abacus AI error:", response.status, errorText);
      if (response.status === 401) {
        return new Response(JSON.stringify({
          error: "Invalid Abacus AI API key. Please check your configuration."
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      if (response.status === 429) {
        return new Response(JSON.stringify({
          error: "Rate limit exceeded. Please try again later."
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      if (response.status === 400) {
        return new Response(JSON.stringify({
          error: "Bad request. Code may be too long or contain invalid characters."
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      throw new Error(`Abacus AI API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log("Abacus AI response structure:", JSON.stringify(Object.keys(data)));
    // OpenAI-compatible response format: choices[0].message.content
    const review = data.choices?.[0]?.message?.content || data.response || data.content || JSON.stringify(data);
    // Parse quality score if present in the review
    let qualityScore = null;
    const scoreMatch = review.match(/Quality Score[:\s]*(\d+(?:\.\d+)?)\s*\/?\s*10/i);
    if (scoreMatch) {
      qualityScore = parseFloat(scoreMatch[1]);
    }
    // Extract development prompt from the review
    let developmentPrompt = null;
    const promptMatch = review.match(/```prompt\n([\s\S]*?)```/);
    if (promptMatch) {
      developmentPrompt = promptMatch[1].trim();
    }
    // Extract model used if available
    const modelUsed = data.model || data.choices?.[0]?.model || "route-llm";
    return new Response(JSON.stringify({
      review,
      developmentPrompt,
      qualityScore,
      reviewType,
      filesReviewed: codeFiles.map((f)=>f.path),
      modelUsed,
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Abacus code review error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
