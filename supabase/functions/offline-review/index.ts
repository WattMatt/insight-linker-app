import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // G-SEC-12: require an authenticated user. The anon key is a valid JWT but resolves
    // to no user, so anon/anon-key-only callers are rejected. App callers send a real
    // user JWT via functions.invoke, so this does not affect legitimate use.
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const __authHeader = req.headers.get('Authorization') || '';
    const __jwt = __authHeader.replace('Bearer ', '');
    const { data: { user: __caller } = { user: null }, error: __authErr } =
      __jwt ? await supabaseAuth.auth.getUser(__jwt) : { data: { user: null }, error: new Error('missing token') } as any;
    if (__authErr || !__caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { codeFiles, reviewType = 'full', focusAreas = [] } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI Gateway not configured. Please ensure Lovable Cloud is enabled." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!codeFiles || codeFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No code files provided for review" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting ${reviewType} review for ${codeFiles.length} files`);

    // Build review-type specific system prompts
    let systemPrompt = `You are an expert code reviewer specializing in React, TypeScript, and Supabase applications for electrical compliance documentation systems (SANS 10142-1).

You must provide a structured review with:
1. **Executive Summary** - Brief overview of code quality and main findings
2. **Critical Issues** - Security vulnerabilities, bugs, performance problems that MUST be fixed
3. **Code Quality** - Best practices, maintainability, readability concerns  
4. **Architecture** - Design pattern suggestions, component organization
5. **Specific Recommendations** - Actionable improvements with code examples
6. **Quality Score** - Rate overall quality as "Quality Score: X/10"

CRITICAL: At the end of your review, you MUST include a **Development Prompt** section in this exact format:
\`\`\`prompt
[Write a complete, detailed prompt that a developer can copy-paste into Lovable or another AI development platform to implement the recommended changes. Include:
- Specific files to modify
- Exact changes to make
- Code patterns to follow
- Any new files to create
Be specific and actionable - this should be ready to use immediately.]
\`\`\`

`;

    if (reviewType === 'security') {
      systemPrompt += `\nFocus specifically on SECURITY concerns:
- Input validation and sanitization
- Authentication/authorization vulnerabilities  
- Data exposure risks in RLS policies
- SQL injection and XSS prevention
- Secure API patterns
- Sensitive data handling`;
    } else if (reviewType === 'performance') {
      systemPrompt += `\nFocus specifically on PERFORMANCE concerns:
- React rendering optimization (useMemo, useCallback, memo)
- Bundle size and code splitting
- Database query efficiency
- Memory leaks and cleanup
- Lazy loading opportunities
- Caching strategies`;
    } else if (reviewType === 'architecture') {
      systemPrompt += `\nFocus specifically on ARCHITECTURE concerns:
- Component structure and separation of concerns
- State management patterns
- Reusable hooks and utilities
- File organization and naming
- Dependency management
- Scalability considerations`;
    } else if (reviewType === 'sans-compliance') {
      systemPrompt += `\nFocus specifically on SANS 10142-1 COMPLIANCE:
- Electrical Certificate of Compliance validation
- Safety-critical validation logic
- Audit trail implementation
- Regulatory requirement coverage
- Test result validation (RCD, earth continuity, insulation)
- Document hierarchy compliance`;
    }

    // Build code content
    const codeContent = codeFiles.map((file: { path: string; content: string }) => `
### File: ${file.path}
\`\`\`typescript
${file.content}
\`\`\`
`).join('\n\n');

    const focusAreasText = focusAreas?.length > 0 
      ? `\n\nPay special attention to these areas: ${focusAreas.join(', ')}`
      : '';

    const userPrompt = `Review the following code files from an electrical compliance documentation system:
${focusAreasText}

${codeContent}

Provide a comprehensive review following the structure in the system prompt. Remember to include the Development Prompt section at the end with a complete, actionable prompt for implementing improvements.`;

    // Call Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few minutes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const review = data.choices?.[0]?.message?.content || "";

    // Extract development prompt from the review
    const promptMatch = review.match(/```prompt\n([\s\S]*?)```/);
    const developmentPrompt = promptMatch ? promptMatch[1].trim() : null;

    // Parse quality score if present
    let qualityScore = null;
    const scoreMatch = review.match(/(?:Quality|Overall)\s*Score[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    if (scoreMatch) {
      qualityScore = parseFloat(scoreMatch[1]);
    }

    console.log(`Review completed. Quality score: ${qualityScore}, Has dev prompt: ${!!developmentPrompt}`);

    return new Response(
      JSON.stringify({ 
        review,
        developmentPrompt,
        qualityScore,
        reviewType,
        filesReviewed: codeFiles.map((f: { path: string }) => f.path),
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Review error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});