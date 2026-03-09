import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Printer, FlaskConical } from "lucide-react";
import { COCDocumentationViewer } from "@/components/COCDocumentationViewer";

const COCDocumentation = () => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div className="hidden sm:block h-6 w-px bg-border" />
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold">COC Verification Engine</h1>
                <p className="text-sm text-muted-foreground">SANS 10142-1:2020 Compliance Documentation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a 
                  href="https://www.sabs.co.za" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  SABS
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="sm:hidden mb-6">
          <h1 className="text-xl font-semibold">COC Verification Engine</h1>
          <p className="text-sm text-muted-foreground">SANS 10142-1:2020 Compliance</p>
        </div>
        
        <COCDocumentationViewer />
      </div>
    </div>
  );
};

export default COCDocumentation;
