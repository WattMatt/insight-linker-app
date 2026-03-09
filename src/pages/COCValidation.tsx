import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { COCValidationForm } from '@/components/compliance/COCValidationForm';
import { Breadcrumbs } from '@/components/Breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';

type ViewMode = 'list' | 'new' | 'edit';

function statusBadge(status: string) {
  switch (status) {
    case 'VALID':
      return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">VALID</Badge>;
    case 'INVALID':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30">INVALID</Badge>;
    case 'REQUIRES_REVIEW':
      return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">REQUIRES REVIEW</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function fraudBadge(score: string) {
  switch (score) {
    case 'LOW':
      return <Badge variant="outline" className="text-emerald-700 border-emerald-500/30">Low Risk</Badge>;
    case 'MEDIUM':
      return <Badge variant="outline" className="text-amber-700 border-amber-500/30">Medium Risk</Badge>;
    case 'HIGH':
      return <Badge variant="outline" className="text-destructive border-destructive/30">High Risk</Badge>;
    default:
      return null;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'VALID': return <ShieldCheck className="h-5 w-5 text-emerald-600" />;
    case 'INVALID': return <ShieldX className="h-5 w-5 text-destructive" />;
    case 'REQUIRES_REVIEW': return <ShieldAlert className="h-5 w-5 text-amber-600" />;
    default: return <FileText className="h-5 w-5 text-muted-foreground" />;
  }
}

export default function COCValidation() {
  const [view, setView] = useState<ViewMode>('list');
  const [editId, setEditId] = useState<string | null>(null);

  const { data: validations, isLoading, refetch } = useQuery({
    queryKey: ['coc-local-validations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coc_local_validations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const handleSaved = () => {
    refetch();
    setView('list');
    setEditId(null);
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setView('edit');
  };

  if (view === 'new' || view === 'edit') {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'COC Validation', href: '/coc-validation' },
            { label: view === 'new' ? 'New Validation' : 'Edit Validation' },
          ]}
        />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView('list'); setEditId(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {view === 'new' ? 'New COC Validation' : 'Edit COC Validation'}
          </h1>
        </div>
        <p className="text-muted-foreground">
          SANS 10142-1:2020/2024 strict empirical validation — all measurements must be numeric
        </p>
        <COCValidationForm editId={editId} onSaved={handleSaved} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'COC Validation' },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">COC Validation Engine</h1>
          <p className="text-muted-foreground">
            SANS 10142-1:2020/2024 strict empirical validation records
          </p>
        </div>
        <Button onClick={() => setView('new')} className="h-11">
          <Plus className="h-4 w-4 mr-2" /> New Validation
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !validations || validations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-medium">No COC Validations Yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Create your first COC validation to verify electrical certificates against SANS 10142-1 requirements.
            </p>
            <Button className="mt-4" onClick={() => setView('new')}>
              <Plus className="h-4 w-4 mr-2" /> Create First Validation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {validations.map((v) => (
            <Card
              key={v.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => handleEdit(v.id)}
            >
              <CardContent className="flex items-center gap-4 py-4">
                <StatusIcon status={v.validation_status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{v.coc_reference_number}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {v.certificate_type?.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {v.installation_address} • {v.registered_person_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(v.validation_status)}
                  {fraudBadge(v.fraud_risk_score)}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                  {v.created_at ? format(new Date(v.created_at), 'dd MMM yyyy') : ''}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
