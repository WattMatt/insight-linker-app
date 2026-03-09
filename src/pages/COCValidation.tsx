import { COCValidationForm } from '@/components/compliance/COCValidationForm';
import { Breadcrumbs } from '@/components/Breadcrumb';

export default function COCValidation() {
  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'COC Validation' },
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">COC Validation Engine</h1>
          <p className="text-muted-foreground">
            SANS 10142-1:2020/2024 strict empirical validation — all measurements must be numeric
          </p>
        </div>
      </div>
      <COCValidationForm />
    </div>
  );
}
