import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Lightbulb, CheckSquare } from "lucide-react";
import IssueReports from "./IssueReports";
import Suggestions from "./Suggestions";
import VerificationManagement from "./VerificationManagement";

export default function FeedbackManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feedback Management</h1>
        <p className="text-muted-foreground">
          Manage user-reported issues and feature suggestions
        </p>
      </div>

      <Tabs defaultValue="issues" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="issues" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Issue Reports
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="verifications" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Verifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-6">
          <IssueReports />
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-6">
          <Suggestions />
        </TabsContent>

        <TabsContent value="verifications" className="space-y-6">
          <VerificationManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
