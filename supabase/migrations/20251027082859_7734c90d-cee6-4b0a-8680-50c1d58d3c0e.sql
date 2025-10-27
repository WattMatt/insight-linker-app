-- Make the documents bucket public so generated URLs work
UPDATE storage.buckets 
SET public = true 
WHERE id = 'documents';