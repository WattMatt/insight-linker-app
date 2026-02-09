
# View-Only Inspection Details for Client Portal

## Summary
Add a view-only inspection details capability to the Client Portal's subsection page, matching the existing functionality in the Public Review portal. This allows clients to view full inspection details (summary, section results, signatures) without any edit capabilities.

## Current State Analysis

| Feature | Public Review (`PublicSubsectionReview.tsx`) | Client Portal (`ClientPortalSubsectionDetail.tsx`) |
|---------|----------------------------------------------|---------------------------------------------------|
| Inspection List | Shows list with View button | Shows list without View button |
| Inspection Dialog | Full read-only dialog with sections | Not implemented |
| Section Results | Accordion with pass/fail items | N/A |
| Signatures | Displays all signers | N/A |

## Implementation Approach

The existing inspection view dialog in `PublicSubsectionReview.tsx` provides a proven pattern. We will replicate this in the Client Portal with matching read-only behaviour.

## Technical Implementation

### Step 1: Add State and Fetch Logic to ClientPortalSubsectionDetail.tsx

**New state variables:**
- `selectedInspection` - tracks which inspection is selected for viewing
- `inspectionDetails` - holds the full inspection data fetched from database
- `loadingInspection` - loading state for the fetch operation

**New function:**
- `fetchInspectionDetails(inspectionId)` - fetches complete inspection data including:
  - All inspection fields
  - Template sections (`inspection_templates.sections`)
  - Signatures (`inspection_signatures`)

### Step 2: Add View Button to Inspection List

Update the Inspections Tab to include a "View" button for each inspection card that triggers the dialog.

### Step 3: Create the Inspection Details Dialog

Add a Dialog component that displays:
1. **Header**: Inspection title and template name
2. **Summary Grid**: Status, date, inspector, quality rating
3. **Description**: If available
4. **Section Results**: Accordion showing each section with items and pass/fail badges
5. **Signatures**: List of signers with signed dates

All content is strictly read-only with no edit, save, or delete actions.

### Step 4: Add Required Imports

Add missing imports:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` from ui/dialog
- `ScrollArea` from ui/scroll-area
- `Loader2` icon from lucide-react

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ClientPortalSubsectionDetail.tsx` | Add state, fetch function, View button, and Dialog component |

## UI/UX Details

- **View Button**: Outlined button with Eye icon, positioned on the right side of each inspection card
- **Dialog**: Max width 3xl, max height 85vh with scrollable content
- **Consistent Styling**: Uses existing color scheme for status badges (green for completed/pass, amber for in-progress, red for fail)

## Security Considerations

- Read-only access enforced - no mutation queries
- Access validation already handled by existing `ClientProtectedRoute` and client ownership check in the subsection query
- No sensitive data exposure - only showing inspection results that belong to the client's subsections
