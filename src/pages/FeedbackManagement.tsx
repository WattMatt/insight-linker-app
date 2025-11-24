import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Lightbulb } from "lucide-react";
import IssueReports from "./IssueReports";
import Suggestions from "./Suggestions";

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
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="issues" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Issue Reports
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-6">
          <IssueReports />
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-6">
          <Suggestions />
        </TabsContent>
      </Tabs>
    </div>
  );
}
