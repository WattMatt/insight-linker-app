-- Add risk level and cost fields to snags table
ALTER TABLE public.snags 
ADD COLUMN risk_level text,
ADD COLUMN estimated_cost numeric(10, 2);

-- Add a comment to describe the risk levels
COMMENT ON COLUMN public.snags.risk_level IS 'Risk level: Low, Medium, High, Critical';
COMMENT ON COLUMN public.snags.estimated_cost IS 'Estimated cost to resolve the snag in ZAR';