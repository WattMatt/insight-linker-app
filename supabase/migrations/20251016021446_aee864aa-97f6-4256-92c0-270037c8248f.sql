-- Remove all existing "05 Photos" document categories
DELETE FROM public.document_categories 
WHERE name = '05 Photos';