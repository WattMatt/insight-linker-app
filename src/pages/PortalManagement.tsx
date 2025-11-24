import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Briefcase } from "lucide-react";
import ClientAccessSimulator from "./ClientAccessSimulator";
import ContractorAccessSimulator from "./ContractorAccessSimulator";
import SiteAssignments from "./SiteAssignments";

export default function PortalManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Portal Management</h1>
        <p className="text-muted-foreground">
          Preview and test client/contractor portal access and permissions
        </p>
      </div>

      <Tabs defaultValue="client" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="client" className="gap-2">
            <Users className="h-4 w-4" />
            Client Simulator
          </TabsTrigger>
          <TabsTrigger value="contractor" className="gap-2">
            <Shield className="h-4 w-4" />
            Contractor Simulator
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Site Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client" className="space-y-6">
          <ClientAccessSimulator />
        </TabsContent>

        <TabsContent value="contractor" className="space-y-6">
          <ContractorAccessSimulator />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <SiteAssignments />
        </TabsContent>
      </Tabs>
    </div>
  );
}
