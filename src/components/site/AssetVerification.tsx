import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle2, Camera, ShieldCheck, Sparkles } from "lucide-react";

interface AssetVerificationProps {
  siteId: string;
  siteName: string;
}

const features = [
  {
    icon: ClipboardList,
    title: "Asset Registry",
    description: "Track and catalog all site assets with categories, locations, and detailed specifications.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: CheckCircle2,
    title: "Verification Workflow",
    description: "Systematic asset verification process with scheduled checks and audit trails.",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    icon: Camera,
    title: "Condition Assessment",
    description: "Document asset conditions with photos, ratings, and detailed inspection notes.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Compliance Tracking",
    description: "Monitor asset compliance status and generate verification reports.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
];

export const AssetVerification = ({ siteId, siteName }: AssetVerificationProps) => {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border p-8 md:p-12">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="h-3 w-3" />
              Coming Soon
            </Badge>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
            Asset Verification
          </h2>
          <p className="text-muted-foreground max-w-2xl text-base md:text-lg">
            Comprehensive asset management and verification system for <span className="font-medium text-foreground">{siteName}</span>. 
            Track, verify, and maintain compliance for all site assets in one centralized platform.
          </p>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.title} className="group hover:shadow-md transition-shadow border-muted/50">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl ${feature.bgColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="mt-1.5">
                    {feature.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Placeholder for future content */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Ready for Development</h3>
          <p className="text-muted-foreground max-w-md">
            This feature area is prepared and ready for the next phase of development. 
            Asset verification capabilities will be built here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
