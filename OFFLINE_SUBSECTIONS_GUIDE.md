# Offline Subsections Implementation Guide

## Overview

This guide explains how to integrate offline functionality into the SubsectionDetail page for viewing and editing subsection data, uploading floor plans, and managing documents while offline.

## Implementation Steps

### 1. Update SubsectionDetail Page Imports

```typescript
import { useOfflineSubsections } from '@/hooks/useOfflineSubsections';
import { getSubsectionDocuments, getSubsectionFloorPlans } from '@/lib/offlineDBExtensions';
import { WifiOff } from 'lucide-react';
import { OfflineSubsectionEnhancements, OfflineDocumentBadge } from '@/components/OfflineSubsectionEnhancements';
```

### 2. Add Offline State and Hook

```typescript
const SubsectionDetail = () => {
  // ... existing state ...
  
  const [offlineDocuments, setOfflineDocuments] = useState<any[]>([]);
  const [offlineFloorPlans, setOfflineFloorPlans] = useState<any[]>([]);
  
  // Offline capabilities
  const { updateSubsection, uploadDocument, uploadFloorPlan, getOfflineData, isOnline } = useOfflineSubsections();
  
  // ... rest of component ...
};
```

### 3. Load Offline Data on Mount

```typescript
useEffect(() => {
  if (subsectionId && subsectionId !== "new") {
    fetchSubsectionData();
    // ... other fetch calls ...
    
    // Load offline data if offline
    if (!isOnline) {
      loadOfflineData();
    }
  }
}, [subsectionId, isOnline]);

const loadOfflineData = async () => {
  if (!subsectionId) return;
  
  try {
    const offlineData = await getOfflineData(subsectionId);
    
    if (offlineData.documents.length > 0) {
      setOfflineDocuments(offlineData.documents);
      toast.info(`${offlineData.documents.length} offline document(s) available`);
    }
    
    if (offlineData.floorPlans.length > 0) {
      setOfflineFloorPlans(offlineData.floorPlans);
    }
  } catch (error) {
    console.error('Error loading offline data:', error);
  }
};
```

### 4. Update Edit/Save Function

Replace the existing save function with the offline-capable version:

```typescript
const handleEditSave = async () => {
  if (!subsectionId) return;
  
  setSaving(true);
  try {
    const updates = {
      name: editFormData.name,
      tenant_name: editFormData.tenant_name || null,
      category: editFormData.category,
      is_coc_required: editFormData.is_coc_required,
    };
    
    await updateSubsection(subsectionId, updates);
    
    // Update local state
    setSubsection(prev => prev ? { ...prev, ...updates as any } : null);
    setIsEditDialogOpen(false);
    
    if (isOnline) {
      fetchSubsectionData(); // Refresh from server
    }
  } catch (error) {
    console.error('Error saving subsection:', error);
    toast.error('Failed to save changes');
  } finally {
    setSaving(false);
  }
};
```

### 5. Update Document Upload Handler

```typescript
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files || e.target.files.length === 0 || !uploadCategoryId || !subsectionId) return;
  
  const file = e.target.files[0];
  setUploadingFile(true);
  
  try {
    await uploadDocument(subsectionId, uploadCategoryId, file);
    
    setUploadFile(null);
    setUploadCategoryId(null);
    
    if (isOnline) {
      await fetchSupabaseDocuments();
    } else {
      await loadOfflineData();
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    toast.error('Failed to upload file');
  } finally {
    setUploadingFile(false);
  }
};
```

### 6. Update Floor Plan Upload Handler

```typescript
const handleFloorPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files || e.target.files.length === 0 || !subsectionId) return;
  
  const file = e.target.files[0];
  setUploadingFile(true);
  
  try {
    await uploadFloorPlan(subsectionId, file);
    
    if (isOnline) {
      // Refresh floor plans from server
      await fetchFloorPlans();
    } else {
      await loadOfflineData();
    }
    
    toast.success('Floor plan uploaded');
  } catch (error) {
    console.error('Error uploading floor plan:', error);
    toast.error('Failed to upload floor plan');
  } finally {
    setUploadingFile(false);
  }
};
```

### 7. Add Offline Status Banner

Add this near the top of your JSX, after the back button:

```tsx
{/* Offline Status Banner */}
<OfflineSubsectionEnhancements
  isOnline={isOnline}
  offlineDocumentCount={offlineDocuments.length}
  offlineFloorPlanCount={offlineFloorPlans.length}
  onSyncClick={() => {
    // Trigger manual sync
    window.dispatchEvent(new Event('online'));
  }}
/>
```

### 8. Update Document List Rendering

In your documents section, merge offline and online documents:

```tsx
const allDocuments = [
  ...supabaseDocuments,
  ...offlineDocuments.map(doc => ({
    id: doc.id,
    file_name: doc.file_name,
    file_url: URL.createObjectURL(doc.blob), // Create temporary URL
    category_id: doc.category_id,
    uploaded_at: doc.uploaded_at,
    isOffline: true,
  }))
];

{allDocuments.map((doc) => (
  <div key={doc.id} className="flex items-center justify-between p-2">
    <div className="flex items-center gap-2">
      <FileText className="h-4 w-4" />
      <span>{doc.file_name}</span>
      {doc.isOffline && <OfflineDocumentBadge isOffline={true} />}
    </div>
    {/* ... rest of document item UI ... */}
  </div>
))}
```

### 9. Update Floor Plan Rendering

Similarly for floor plans:

```tsx
const allFloorPlans = [
  ...onlineFloorPlans, // your existing floor plans
  ...offlineFloorPlans.map(fp => ({
    id: fp.id,
    file_name: fp.file_name,
    file_url: URL.createObjectURL(fp.blob),
    subsection_id: fp.subsection_id,
    uploaded_at: fp.uploaded_at,
    isOffline: true,
  }))
];
```

### 10. Add Offline Mode Badge to Header

```tsx
<div className="flex items-center gap-2">
  <h1 className="text-3xl font-bold">{subsection?.name || 'Loading...'}</h1>
  {!isOnline && (
    <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
      <WifiOff className="h-3 w-3 mr-1" />
      Offline Mode
    </Badge>
  )}
</div>
```

## Features

### What Works Offline

✅ **View subsection data** - Cached data available
✅ **Edit subsection fields** - Changes saved to IndexedDB
✅ **Upload documents** - Blobs saved locally
✅ **Upload floor plans** - Blobs saved locally
✅ **View offline documents** - Via blob URLs
✅ **View offline floor plans** - Via blob URLs

### What Requires Online

❌ **COC validation** - Requires AI processing
❌ **QR code generation** - Requires server
❌ **Document download** - Requires storage access
❌ **Real-time updates** - Requires database connection

## Sync Behavior

### Automatic Sync
- Triggers when connection restored
- Processes all queued mutations
- Updates from IndexedDB to Supabase
- Clears offline data after successful sync

### Manual Sync
- User can trigger via "Sync Now" button
- Shows progress indicator
- Reports success/failure per item

## Testing

### Test Offline Mode

```bash
# 1. Open Chrome DevTools
# 2. Network tab → Offline
# 3. Edit subsection fields
# 4. Upload document
# 5. Check IndexedDB in Application tab
# 6. Switch back to Online
# 7. Verify auto-sync
```

### Verify IndexedDB Storage

```bash
# Chrome DevTools → Application → IndexedDB → wm_compliance_offline
# Check subsections, documents, floor_plans stores
```

## Error Handling

### Connection Loss During Upload

```typescript
// Automatically falls back to offline mode
try {
  await supabase.storage.from('documents').upload(path, file);
} catch (error) {
  // Falls back to IndexedDB
  await saveDocument({...});
  queueMutation('UPLOAD_DOCUMENT', {...});
}
```

### Sync Failures

```typescript
// Retries up to 3 times
// Shows toast notification on final failure
// Keeps in queue for manual retry
```

## Best Practices

1. **Always check online status** before network operations
2. **Provide visual feedback** for offline state
3. **Cache critical data** on first load
4. **Invalidate queries** after successful sync
5. **Handle blob URLs carefully** (they expire on navigation)
6. **Test with slow connections** (not just offline)

## Troubleshooting

### Documents not showing offline
- Check IndexedDB contains the blobs
- Verify blob URLs are created correctly
- Check browser console for errors

### Sync not triggering
- Verify online event listener is active
- Check mutation queue in localStorage
- Test manual sync button

### Data inconsistency
- Clear IndexedDB and reload
- Force manual sync
- Check for concurrent edits

## Performance Tips

1. **Lazy load blobs** - Only create URLs when needed
2. **Limit cache size** - Clean old offline data periodically
3. **Compress images** - Before saving to IndexedDB
4. **Batch syncs** - Don't sync one-by-one

## Security Considerations

- Offline data stored in browser (not encrypted)
- Clear sensitive data on logout
- Don't cache confidential documents
- Validate all data before sync
