import { useState, useEffect } from "react";
import { FloorPlanViewer } from "./FloorPlanViewer";
import { FloorPlanPinModal } from "./FloorPlanPinModal";
import { FloorPlanPinsList } from "./FloorPlanPinsList";
import { FloorPlanStatsWidget } from "./FloorPlanStatsWidget";
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
  const [moveMode, setMoveMode] = useState<string | null>(null); // Pin ID being moved

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

    // If in move mode, update existing pin position
    if (moveMode) {
      try {
        const { error } = await supabase
          .from("floor_plan_pins")
          .update({
            x_position: x,
            y_position: y,
          })
          .eq("id", moveMode);

        if (error) throw error;

        await loadFloorPlan();
        setMoveMode(null);
        toast.success("Pin moved successfully");
      } catch (error) {
        console.error("Error moving pin:", error);
        toast.error("Failed to move pin");
      }
      return;
    }

    // Otherwise, create new pin
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
    console.log("handleSavePin called with:", { pinData, photo, selectedPin });
    
    if (!selectedPin?.id) {
      console.error("No selectedPin.id found");
      toast.error("Cannot save: Pin ID is missing");
      return;
    }

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
      console.log("Updating pin with:", {
        pin_type: pinData.pin_type,
        title: pinData.title,
        notes: pinData.notes,
        priority: pinData.priority,
        status: pinData.status,
        assigned_contractor: pinData.assigned_contractor,
        due_date: pinData.due_date,
        photo_url: photoUrl,
      });

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

      console.log("Update result:", { error });
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
    if (!selectedPin?.id) return;
    
    if (!confirm(`Are you sure you want to delete Pin #${selectedPin.pin_number}?`)) {
      return;
    }

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

  const handleMovePin = () => {
    setMoveMode(selectedPin.id);
    setIsModalOpen(false);
    toast.info("Click on the floor plan to move this pin");
  };

  const handleGenerateReport = async () => {
    if (!floorPlan) return;

    try {
      setIsGeneratingReport(true);
      toast.info("Generating comprehensive report...");

      // Fetch comments for all pins
      const pinsWithComments = await Promise.all(
        pins.map(async (pin) => {
          const { data: comments } = await supabase
            .from('floor_plan_pin_comments')
            .select('user_name, comment, created_at')
            .eq('pin_id', pin.id)
            .order('created_at', { ascending: true });
          
          return {
            ...pin,
            comments: comments || [],
          };
        })
      );

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
        pins: pinsWithComments,
        canvasDataUrl,
      });

      report.save(`floor-plan-report-${subsectionName}-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Professional report generated successfully!");
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg sm:text-2xl font-bold">Interactive Floor Plan</h2>
        <div className="flex gap-2">
          <label className="flex-1 sm:flex-initial">
            <Button variant="outline" disabled={isUploading} size="sm" className="w-full sm:w-auto" asChild>
              <span>
                <Upload className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Replace Plan</span>
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
            size="sm"
            className="flex-1 sm:flex-initial"
          >
            {isGeneratingReport ? (
              <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Export Report</span>
          </Button>
        </div>
      </div>

      {/* Statistics Dashboard */}
      {pins.length > 0 && (
        <FloorPlanStatsWidget subsectionId={subsectionId} />
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[500px] lg:h-[700px]">
        <div className="lg:col-span-2 relative min-h-[500px] lg:h-auto">
          {moveMode && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-primary text-primary-foreground px-3 py-2 sm:px-6 sm:py-3 rounded-lg shadow-lg flex flex-col sm:flex-row items-center gap-2 sm:gap-3 max-w-[90%]">
              <span className="font-medium text-xs sm:text-sm text-center">
                Click to move Pin #{pins.find(p => p.id === moveMode)?.pin_number}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setMoveMode(null);
                  toast.info("Move cancelled");
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
          <FloorPlanViewer
            pdfUrl={floorPlan?.file_url || ""}
            pins={pins}
            onAddPin={handleAddPin}
            onPinClick={(pin) => {
              if (moveMode) return; // Don't open modal in move mode
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
          onMove={handleMovePin}
          initialData={selectedPin}
          pinNumber={selectedPin.pin_number}
        />
      )}
    </div>
  );
};