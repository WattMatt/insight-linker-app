import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationRequest {
  type: 'issue' | 'suggestion';
  description: string;
  title?: string;
  category: string;
  severity?: string;
  priority?: string;
  pageUrl: string;
  browserInfo?: any;
  fixDescription: string;
}

interface VerificationReport {
  status: 'pass' | 'warning' | 'fail';
  confidenceScore: number;
  analysis: string;
  potentialIssues: string[];
  recommendations: string[];
  edgeCasesIdentified: string[];
  testSuggestions: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: VerificationRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const effectiveFixDescription = request.fixDescription?.trim() || '';
    
    if (!effectiveFixDescription) {
      return new Response(JSON.stringify({ 
        error: 'No fix description provided. Please add admin notes describing what was fixed.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Testing fix with description:', effectiveFixDescription.substring(0, 100) + '...');

    const systemPrompt = `You are an expert software QA engineer and code reviewer. Your task is to analyze bug fixes and feature implementations to predict whether they will actually solve the reported issue.

You will receive:
1. The original issue/suggestion description
2. The fix/implementation description provided by the developer
3. Optionally, code changes that were made

Analyze whether the described fix properly addresses the root cause of the issue. Be critical but fair. Look for:
- Does the fix address the actual root cause, not just symptoms?
- Are there edge cases that might not be covered?
- Could this fix introduce new issues?
- Is the fix complete, or might users encounter similar issues in related areas?
- Based on the browser info and page URL, are there platform-specific concerns?

You MUST respond using the verify_fix function.`;

    const userPrompt = `## ${request.type === 'issue' ? 'Issue Report' : 'Feature Suggestion'}

**${request.type === 'issue' ? 'Description' : 'Title'}:** ${request.title || request.description}

${request.title ? `**Description:** ${request.description}` : ''}

**Category:** ${request.category}
${request.severity ? `**Severity:** ${request.severity}` : ''}
${request.priority ? `**Priority:** ${request.priority}` : ''}
**Page URL:** ${request.pageUrl}
${request.browserInfo ? `**Browser Info:** ${JSON.stringify(request.browserInfo)}` : ''}

---

## Proposed Fix/Implementation

**Fix Description:** ${effectiveFixDescription}

---

Analyze this fix and determine if it will actually resolve the reported ${request.type}. Be thorough in your analysis.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'verify_fix',
              description: 'Provide the verification analysis for the proposed fix',
              parameters: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['pass', 'warning', 'fail'],
                    description: 'pass = fix looks good (>70% confidence), warning = some concerns (50-70%), fail = likely won\'t work (<50%)'
                  },
                  confidenceScore: {
                    type: 'number',
                    description: 'Confidence that this fix will work, 0-100'
                  },
                  analysis: {
                    type: 'string',
                    description: 'Detailed analysis of whether the fix addresses the root cause'
                  },
                  potentialIssues: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of potential problems with the fix'
                  },
                  recommendations: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Recommendations to improve the fix'
                  },
                  edgeCasesIdentified: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Edge cases that might not be covered'
                  },
                  testSuggestions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Suggested tests to verify the fix works'
                  }
                },
                required: ['status', 'confidenceScore', 'analysis', 'potentialIssues', 'recommendations', 'edgeCasesIdentified', 'testSuggestions'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'verify_fix' } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again in a few moments.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI credits exhausted. Please add credits to continue using AI features.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response:', JSON.stringify(data, null, 2));

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'verify_fix') {
      throw new Error('Invalid response from AI - no tool call found');
    }

    const verificationReport: VerificationReport = JSON.parse(toolCall.function.arguments);
    
    // Ensure confidence score is within bounds
    verificationReport.confidenceScore = Math.max(0, Math.min(100, verificationReport.confidenceScore));
    
    // Ensure status matches confidence score
    if (verificationReport.confidenceScore >= 70 && verificationReport.status !== 'pass') {
      verificationReport.status = 'pass';
    } else if (verificationReport.confidenceScore >= 50 && verificationReport.confidenceScore < 70 && verificationReport.status !== 'warning') {
      verificationReport.status = 'warning';
    } else if (verificationReport.confidenceScore < 50 && verificationReport.status !== 'fail') {
      verificationReport.status = 'fail';
    }

    return new Response(JSON.stringify(verificationReport), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in verify-fix function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
