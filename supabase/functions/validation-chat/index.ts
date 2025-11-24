import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message, validationData } = await req.json();
    
    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    console.log('Starting validation chat for conversation:', conversationId);

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('validation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      throw messagesError;
    }

    // Build conversation context
    const systemPrompt = `You are an expert electrical compliance assistant specializing in South African SANS 10142-1 standards for Certificates of Compliance (COCs).

You are helping users understand and discuss COC validation results. Your role is to:

1. **Explain Validation Findings**: Clarify why certain violations were flagged
2. **Provide Context**: Explain SANS 10142-1 clauses in practical terms
3. **Answer Questions**: Address user concerns about specific findings
4. **Suggest Solutions**: Recommend how to resolve compliance issues
5. **Gather Feedback**: Note when users provide insights about edge cases or industry-specific interpretations

When discussing violations:
- Reference specific clause numbers
- Explain the safety/compliance reason behind each requirement
- Provide practical examples
- Note any nuances or common misunderstandings

Current Validation Context:
${validationData ? JSON.stringify(validationData, null, 2) : 'No validation data provided'}

Be conversational, helpful, and technically accurate. If you learn something new from the user (like an industry-specific interpretation or edge case), acknowledge it and suggest they may want to submit feedback to improve the system.`;

    // Prepare messages for AI
    const conversationMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      { role: 'user' as const, content: message }
    ];

    // Save user message
    const { error: saveUserMsgError } = await supabase
      .from('validation_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
        created_by: userId
      });

    if (saveUserMsgError) {
      console.error('Error saving user message:', saveUserMsgError);
    }

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview',
        messages: conversationMessages,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('AI chat failed');
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    const assistantMessage = aiData.choices[0].message.content;

    // Save assistant message
    const { error: saveAIMsgError } = await supabase
      .from('validation_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantMessage
      });

    if (saveAIMsgError) {
      console.error('Error saving assistant message:', saveAIMsgError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: assistantMessage
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in validation-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});