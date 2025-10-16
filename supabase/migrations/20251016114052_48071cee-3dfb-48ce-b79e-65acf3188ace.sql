-- Create table for validation conversations
CREATE TABLE IF NOT EXISTS public.validation_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID NOT NULL REFERENCES public.coc_validations(id) ON DELETE CASCADE,
  subsection_id UUID NOT NULL REFERENCES public.subsections(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  title TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived'))
);

-- Create table for chat messages
CREATE TABLE IF NOT EXISTS public.validation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.validation_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create table for validation feedback (admin insights)
CREATE TABLE IF NOT EXISTS public.validation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.validation_conversations(id) ON DELETE CASCADE,
  validation_id UUID REFERENCES public.coc_validations(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('clarification', 'correction', 'enhancement', 'edge_case')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  original_finding TEXT,
  suggested_improvement TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'implemented', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  implementation_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_validation_conversations_validation ON public.validation_conversations(validation_id);
CREATE INDEX IF NOT EXISTS idx_validation_conversations_subsection ON public.validation_conversations(subsection_id);
CREATE INDEX IF NOT EXISTS idx_validation_messages_conversation ON public.validation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_validation_messages_created_at ON public.validation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_validation_feedback_status ON public.validation_feedback(status);
CREATE INDEX IF NOT EXISTS idx_validation_feedback_type ON public.validation_feedback(feedback_type);

-- Enable RLS
ALTER TABLE public.validation_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for validation_conversations
CREATE POLICY "Authenticated users can view conversations"
  ON public.validation_conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create conversations"
  ON public.validation_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own conversations"
  ON public.validation_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- RLS Policies for validation_messages
CREATE POLICY "Authenticated users can view messages"
  ON public.validation_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create messages"
  ON public.validation_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR role = 'assistant');

-- RLS Policies for validation_feedback
CREATE POLICY "Authenticated users can view feedback"
  ON public.validation_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create feedback"
  ON public.validation_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update feedback"
  ON public.validation_feedback FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'Admin'));

-- Add trigger for updating updated_at
CREATE TRIGGER update_validation_conversations_updated_at
  BEFORE UPDATE ON public.validation_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.validation_conversations IS 'Stores conversations about COC validations for learning and improvement';
COMMENT ON TABLE public.validation_messages IS 'Stores individual messages in validation conversations';
COMMENT ON TABLE public.validation_feedback IS 'Stores curated feedback from conversations for improving the validation AI';