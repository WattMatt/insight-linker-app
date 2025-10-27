import { useState, useEffect } from "react";
import { FloorPlanViewer } from "./FloorPlanViewer";
import { FloorPlanPinModal } from "./FloorPlanPinModal";
import { FloorPlanPinsList } from "./FloorPlanPinsList";
import { Button } from "./ui/button";
import { Upload, FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateFloorPlanReport } from "@/lib/floorPlanReportGenerator";
import html2canvas from "html2canvas";

interface InteractiveFloorPlanProps {
  subsectionId: string;
  projectName: string;
  siteName: string;
  subsectionName: string;
}

export const InteractiveFloorPlan = ({
  subsectionId,
  projectName,
  siteName,
  subsectionName,
}: InteractiveFloorPlanProps) => {
  const [floorPlan, setFloorPlan] = useState<any>(null);
  const [pins, setPins] = useState<any[]>([]);
  const [selectedPin, setSelectedPin] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    loadFloorPlan();
  }, [subsectionId]);

  useEffect(() => {
    if (floorPlan) {
      console.log("Floor plan state updated, file_url:", floorPlan.file_url);
    }
  }, [floorPlan]);

  const loadFloorPlan = async () => {
    try {
      setIsLoading(true);

      // Fetch floor plan
      const { data: floorPlanData, error: floorPlanError } = await supabase
        .from("subsection_floor_plans")
        .select("*")
        .eq("subsection_id", subsectionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (floorPlanError) throw floorPlanError;

      setFloorPlan(floorPlanData);
      console.log("Floor plan loaded:", floorPlanData);

      if (floorPlanData) {
        // Fetch pins for this floor plan
        const { data: pinsData, error: pinsError } = await supabase
          .from("floor_plan_pins")
          .select("*")
          .eq("floor_plan_id", floorPlanData.id)
          .order("pin_number", { ascending: true });

        if (pinsError) throw pinsError;
        setPins(pinsData || []);
      }
    } catch (error) {
      console.error("Error loading floor plan:", error);
      toast.error("Failed to load floor plan");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    try {
      setIsUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload to storage
      const fileName = `${subsectionId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(fileName);

      // Save floor plan record
      const { data: newFloorPlan, error: insertError } = await supabase
        .from("subsection_floor_plans")
        .insert({
          subsection_id: subsectionId,
          file_url: publicUrl,
          file_name: file.name,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setFloorPlan(newFloorPlan);
      setPins([]);
      console.log("Floor plan uploaded successfully:", newFloorPlan);
      toast.success("Floor plan uploaded successfully");
    } catch (error) {
      console.error("Error uploading floor plan:", error);
      toast.error("Failed to upload floor plan");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddPin = async (x: number, y: number) => {
    if (!floorPlan) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newPinNumber = pins.length > 0 ? Math.max(...pins.map(p => p.pin_number)) + 1 : 1;

      const { data: newPin, error } = await supabase
        .from("floor_plan_pins")
        .insert({
          floor_plan_id: floorPlan.id,
          pin_number: newPinNumber,
          x_position: x,
          y_position: y,
          pin_type: 'snag', // Default to snag, user can change in modal
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setPins([...pins, newPin]);
      setSelectedPin(newPin);
      setIsModalOpen(true);
    } catch (error) {
      console.error("Error adding pin:", error);
      toast.error("Failed to add pin");
    }
  };

  const handleSavePin = async (pinData: any, photo?: File) => {
    try {
      let photoUrl = pinData.photo_url;

      // Upload photo if provided
      if (photo) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileName = `floor-plan-pins/${floorPlan.id}/${Date.now()}_${photo.name}`;
        const { error: uploadError } = await supabase.storage
          .from("inspection-photos")
          .upload(fileName, photo);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      // Update the pin with all data including pin_type
      const { error } = await supabase
        .from("floor_plan_pins")
        .update({
          pin_type: pinData.pin_type,
          title: pinData.title,
          notes: pinData.notes,
          priority: pinData.priority,
          status: pinData.status,
          assigned_contractor: pinData.assigned_contractor,
          due_date: pinData.due_date,
          photo_url: photoUrl,
        })
        .eq("id", selectedPin.id);

      if (error) throw error;

      // Refresh pins
      await loadFloorPlan();
      setIsModalOpen(false);
      setSelectedPin(null);
      toast.success("Pin saved successfully");
    } catch (error) {
      console.error("Error saving pin:", error);
      toast.error("Failed to save pin");
      throw error;
    }
  };

  const handleDeletePin = async () => {
    try {
      const { error } = await supabase
        .from("floor_plan_pins")
        .delete()
        .eq("id", selectedPin.id);

      if (error) throw error;

      setPins(pins.filter(p => p.id !== selectedPin.id));
      setSelectedPin(null);
      setIsModalOpen(false);
      toast.success("Pin deleted successfully");
    } catch (error) {
      console.error("Error deleting pin:", error);
      toast.error("Failed to delete pin");
      throw error;
    }
  };

  const handleGenerateReport = async () => {
    if (!floorPlan) return;

    try {
      setIsGeneratingReport(true);
      toast.info("Generating report...");

      // Capture canvas with pins
      const canvas = document.querySelector('canvas');
      let canvasDataUrl;
      if (canvas) {
        canvasDataUrl = canvas.toDataURL('image/png');
      }

      const report = await generateFloorPlanReport({
        projectName,
        siteName,
        subsectionName,
        floorPlanUrl: floorPlan.file_url,
        pins,
        canvasDataUrl,
      });

      report.save(`floor-plan-report-${subsectionName}-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Report generated successfully");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!floorPlan) {
    return (
      <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-lg">
        <Upload className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Floor Plan Uploaded</h3>
        <p className="text-muted-foreground mb-4">Upload a PDF floor plan to start adding pins</p>
        <label>
          <Button disabled={isUploading} asChild>
            <span>
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Floor Plan
                </>
              )}
            </span>
          </Button>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Interactive Floor Plan</h2>
        <div className="flex gap-2">
          <label>
            <Button variant="outline" disabled={isUploading} asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Replace Plan
              </span>
            </Button>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
          <Button
            onClick={handleGenerateReport}
            disabled={isGeneratingReport || pins.length === 0}
          >
            {isGeneratingReport ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 mr-2" />
            )}
            Export Report
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[700px]">
        <div className="lg:col-span-2">
          <FloorPlanViewer
            pdfUrl={floorPlan?.file_url || ""}
            pins={pins}
            onAddPin={handleAddPin}
            onPinClick={(pin) => {
              setSelectedPin(pin);
              setIsModalOpen(true);
            }}
            addMode={null}
            onAddModeChange={() => {}}
          />
        </div>
        <div>
          <FloorPlanPinsList
            pins={pins}
            onPinClick={(pin) => {
              setSelectedPin(pin);
              setIsModalOpen(true);
            }}
          />
        </div>
      </div>

      {/* Pin Modal */}
      {selectedPin && (
        <FloorPlanPinModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedPin(null);
          }}
          onSave={handleSavePin}
          onDelete={selectedPin?.id ? handleDeletePin : undefined}
          initialData={selectedPin}
          pinNumber={selectedPin.pin_number}
        />
      )}
    </div>
  );
};