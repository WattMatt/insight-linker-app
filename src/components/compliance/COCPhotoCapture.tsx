import { OfflinePhotoGallery } from '@/components/OfflinePhotoGallery';

interface COCPhotoCaptureProps {
  subsectionId: string;
  cocValidationId?: string;
}

export function COCPhotoCapture({ subsectionId, cocValidationId }: COCPhotoCaptureProps) {
  return (
    <OfflinePhotoGallery
      contextType="coc"
      contextId={subsectionId}
      secondaryContextId={cocValidationId}
      photoTypes={['coc_document', 'test_equipment_reading', 'db_board', 'installation_overview', 'signature', 'general_evidence']}
      title="Evidence Photos"
      description="Capture photos of COC documents, equipment, and installations"
    />
  );
}
