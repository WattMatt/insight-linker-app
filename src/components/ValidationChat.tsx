import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, MessageSquare, Loader2, ThumbsUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface ValidationChatProps {
  validationId: string;
  subsectionId: string;
  documentId: string;
  validationData: any;
}

export function ValidationChat({ validationId, subsectionId, documentId, validationData }: ValidationChatProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeConversation();
  }, [validationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initializeConversation = async () => {
    try {
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('validation_conversations')
        .select('id')
        .eq('validation_id', validationId)
        .eq('subsection_id', subsectionId)
        .single();

      if (existing) {
        setConversationId(existing.id);
        await loadMessages(existing.id);
      } else {
        // Create new conversation
        const { data: { session } } = await supabase.auth.getSession();
        const { data: newConv, error } = await supabase
          .from('validation_conversations')
          .insert({
            validation_id: validationId,
            subsection_id: subsectionId,
            document_id: documentId,
            created_by: session?.user.id,
            title: 'COC Validation Discussion'
          })
          .select()
          .single();

        if (error) throw error;
        setConversationId(newConv.id);
      }
    } catch (error) {
      console.error('Error initializing conversation:', error);
      toast.error('Failed to initialize chat');
    } finally {
      setInitializing(false);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('validation_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !conversationId) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('validation-chat', {
        body: {
          conversationId,
          message: userMessage,
          validationData
        }
      });

      if (error) throw error;

      // Reload messages to get both user and assistant messages
      await loadMessages(conversationId);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (initializing) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Initializing chat...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle className="text-lg">Ask About This Validation</CardTitle>
          </div>
          <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ThumbsUp className="h-4 w-4 mr-2" />
                Submit Feedback
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Feedback</DialogTitle>
              </DialogHeader>
              <FeedbackForm 
                conversationId={conversationId!}
                validationId={validationId}
                onSuccess={() => {
                  setFeedbackDialogOpen(false);
                  toast.success('Feedback submitted successfully');
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Discuss SANS 10142-1 compliance, ask about violations, or request clarification
        </p>
      </CardHeader>

      <Separator />

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet. Start by asking a question!</p>
              <p className="text-sm mt-2">For example:</p>
              <ul className="text-sm mt-2 space-y-1">
                <li>"Why was clause 10 flagged?"</li>
                <li>"How do I fix the voltage issue?"</li>
                <li>"What does earth leakage instrument test mean?"</li>
              </ul>
            </div>
          )}
          
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={msg.role === 'user' ? 'secondary' : 'outline'} className="text-xs">
                    {msg.role === 'user' ? 'You' : 'AI Assistant'}
                  </Badge>
                  <span className="text-xs opacity-70">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your question..."
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FeedbackForm({ 
  conversationId, 
  validationId, 
  onSuccess 
}: { 
  conversationId: string; 
  validationId: string; 
  onSuccess: () => void;
}) {
  const [type, setType] = useState<'clarification' | 'correction' | 'enhancement' | 'edge_case'>('clarification');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [originalFinding, setOriginalFinding] = useState('');
  const [suggestedImprovement, setSuggestedImprovement] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase
        .from('validation_feedback')
        .insert({
          conversation_id: conversationId,
          validation_id: validationId,
          feedback_type: type,
          title,
          description,
          original_finding: originalFinding,
          suggested_improvement: suggestedImprovement,
          created_by: session?.user.id
        });

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Feedback Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as any)}
          className="w-full mt-1 border rounded-md px-3 py-2"
        >
          <option value="clarification">Clarification Needed</option>
          <option value="correction">Incorrect Finding</option>
          <option value="enhancement">Suggested Enhancement</option>
          <option value="edge_case">Edge Case / Special Situation</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief description"
          required
        />
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain the issue or suggestion"
          className="w-full mt-1 border rounded-md px-3 py-2 min-h-[100px]"
          required
        />
      </div>

      <div>
        <label className="text-sm font-medium">Original Finding (Optional)</label>
        <textarea
          value={originalFinding}
          onChange={(e) => setOriginalFinding(e.target.value)}
          placeholder="What did the validation say?"
          className="w-full mt-1 border rounded-md px-3 py-2"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Suggested Improvement (Optional)</label>
        <textarea
          value={suggestedImprovement}
          onChange={(e) => setSuggestedImprovement(e.target.value)}
          placeholder="How should it be improved?"
          className="w-full mt-1 border rounded-md px-3 py-2"
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Feedback'
        )}
      </Button>
    </form>
  );
}