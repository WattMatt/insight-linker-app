import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { codeFiles } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert code reviewer specializing in offline-first Progressive Web Apps (PWAs) and IndexedDB implementations. 

Analyze the provided offline functionality code and provide a comprehensive review covering:

1. **Architecture & Design Patterns**
   - Offline-first approach effectiveness
   - Sync queue implementation quality
   - Data consistency strategies
   - Conflict resolution mechanisms

2. **IndexedDB Usage**
   - Schema design appropriateness
   - Index optimization
   - Transaction management
   - Error handling robustness

3. **Sync Logic**
   - Online/offline detection reliability
   - Queue management efficiency
   - Retry mechanisms
   - Data reconciliation approach

4. **Storage Management**
   - Quota handling
   - Blob storage strategy
   - Cache eviction policies
   - Storage quota monitoring

5. **Error Handling & Edge Cases**
   - Network failures
   - Partial syncs
   - Duplicate data prevention
   - Race conditions

6. **User Experience**
   - Loading states
   - Sync feedback
   - Offline indicators
   - Data availability

7. **Performance Considerations**
   - Batch operations
   - Memory management
   - Large file handling
   - Background sync opportunities

8. **Security & Data Integrity**
   - Data validation
   - Sync authentication
   - Data corruption prevention
   - Sensitive data handling

Provide:
- Overall assessment (Excellent/Good/Needs Improvement/Poor)
- Key strengths (3-5 bullet points)
- Critical issues that must be fixed (prioritized list)
- Recommended improvements (prioritized list)
- Best practice violations
- Potential bugs or edge cases not handled
- Performance optimization opportunities

Be specific, cite code examples where relevant, and provide actionable recommendations.`;

    const userPrompt = `Review the following offline functionality implementation:

${codeFiles.map((file: any) => `
File: ${file.path}
\`\`\`typescript
${file.content}
\`\`\`
`).join('\n\n')}

Provide a thorough, expert-level code review following the guidelines in the system prompt.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const review = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ review }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Offline review error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
