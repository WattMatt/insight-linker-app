import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Shield, Users } from "lucide-react";
import AdminClientPreview from "./AdminClientPreview";
import AdminContractorPreview from "./AdminContractorPreview";
import ContractorAccessSimulator from "./ContractorAccessSimulator";

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
            Client Preview
          </TabsTrigger>
          <TabsTrigger value="contractor" className="gap-2">
            <Eye className="h-4 w-4" />
            Contractor Preview
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-2">
            <Shield className="h-4 w-4" />
            Access Simulator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client" className="space-y-6">
          <AdminClientPreview />
        </TabsContent>

        <TabsContent value="contractor" className="space-y-6">
          <AdminContractorPreview />
        </TabsContent>

        <TabsContent value="simulator" className="space-y-6">
          <ContractorAccessSimulator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
