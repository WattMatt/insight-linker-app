import { useState, useEffect, useRef } from "react";
import { FloorPlanViewer } from "./FloorPlanViewer";
import { FloorPlanPinModal } from "./FloorPlanPinModal";
import { FloorPlanPinsList } from "./FloorPlanPinsList";
import { FloorPlanStatsWidget } from "./FloorPlanStatsWidget";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Upload, Eye, Loader2, WifiOff, Zap, Undo2 } from "lucide-react";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateFloorPlanReport } from "@/lib/floorPlanReportGenerator";
import html2canvas from "html2canvas";
import { useOfflineFloorPlanAnnotations } from "@/hooks/useOfflineFloorPlanAnnotations";
import { useUndoStack, UndoAction } from "@/hooks/useUndoStack";

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
  const [pdfPreview, setPdfPreview] = useState<{ url: string; blob: Blob; filename: string } | null>(null);
  const [savingToDocuments, setSavingToDocuments] = useState(false);
  const [moveMode, setMoveMode] = useState<string | null>(null); // Pin ID being moved
  const [quickAddMode, setQuickAddMode] = useState(false);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const {
    addPin,
    updatePin,
    deletePin,
    getOfflineAnnotations,
    isOnline,
  } = useOfflineFloorPlanAnnotations();

  const {
    pendingUndo,
    pushAction,
    popAction,
    clearPendingUndo,
    canUndo,
  } = useUndoStack();

  useEffect(() => {
    loadFloorPlan();

    // Set up real-time subscription for floor plan pins
    const pinsChannel = supabase
      .channel('floor-plan-pins-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'floor_plan_pins',
          // Scope to THIS floor plan's pins; without it the channel fires for
          // every subsection's pin changes app-wide.
          ...(floorPlan?.id ? { filter: `floor_plan_id=eq.${floorPlan.id}` } : {})
        },
        (payload) => {
          
          // Reload pins to reflect changes
          if (floorPlan) {
            supabase
              .from("floor_plan_pins")
              .select("*")
              .eq("floor_plan_id", floorPlan.id)
              .order("pin_number", { ascending: true })
              .then(({ data, error }) => {
                if (!error && data) {
                  setPins(data);
                  toast.success("Floor plan updated", { duration: 2000 });
                }
              });
          }
        }
      )
      .subscribe();

    // Set up real-time subscription for floor plans
    const floorPlanChannel = supabase
      .channel('floor-plan-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subsection_floor_plans',
          filter: `subsection_id=eq.${subsectionId}`
        },
        (payload) => {
          loadFloorPlan();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(pinsChannel);
      supabase.removeChannel(floorPlanChannel);
    };
  }, [subsectionId, floorPlan?.id]);

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

      if (floorPlanData) {
        // Fetch pins for this floor plan
        if (isOnline) {
          const { data: pinsData, error: pinsError } = await supabase
            .from("floor_plan_pins")
            .select("*")
            .eq("floor_plan_id", floorPlanData.id)
            .order("pin_number", { ascending: true });

          if (pinsError) throw pinsError;
          
          // Merge with offline pins
          const offlineData = await getOfflineAnnotations(floorPlanData.id);
          const allPins = [...(pinsData || []), ...offlineData.pins];
          setPins(allPins);
        } else {
          // Offline - load from IndexedDB only
          const offlineData = await getOfflineAnnotations(floorPlanData.id);
          setPins(offlineData.pins as any);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error loading floor plan:", error);
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
      toast.success("Floor plan uploaded successfully");
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error uploading floor plan:", error);
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
        if (isOnline) {
          const { error } = await supabase
            .from("floor_plan_pins")
            .update({
              x_position: x,
              y_position: y,
            })
            .eq("id", moveMode);

          if (error) throw error;
        }
        
        await loadFloorPlan();
        setMoveMode(null);
        toast.success("Pin moved successfully");
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error("Error moving pin:", error);
        toast.error("Failed to move pin");
      }
      return;
    }

    // Otherwise, create new pin
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newPinNumber = pins.length > 0 ? Math.max(...pins.map(p => p.pin_number)) + 1 : 1;

      const newPin = await addPin(floorPlan.id, x, y, newPinNumber, user.id);
      
      setPins([...pins, newPin as any]);
      
      // In quick-add mode, don't open modal - just show success
      if (quickAddMode) {
        setSelectedPin(newPin);
        toast.success(`Pin #${newPinNumber} added`, { duration: 2000 });
      } else {
        setSelectedPin(newPin);
        setIsModalOpen(true);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error adding pin:", error);
      toast.error("Failed to add pin");
    }
  };

  const handleSavePin = async (pinData: any, photo?: File) => {
    
    if (!selectedPin?.id) {
      if (process.env.NODE_ENV === 'development') console.error("No selectedPin.id found");
      toast.error("Cannot save: Pin ID is missing");
      return;
    }

    try {
      await updatePin(selectedPin.id, pinData, photo);
      
      // Refresh pins
      await loadFloorPlan();
      setIsModalOpen(false);
      setSelectedPin(null);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error saving pin:", error);
      throw error;
    }
  };

  const handleDeletePin = async (pinToDelete?: any) => {
    const pin = pinToDelete || selectedPin;
    if (!pin?.id) return;
    
    try {
      await deletePin(pin.id);
      
      setPins(pins.filter(p => p.id !== pin.id));
      if (selectedPin?.id === pin.id) {
        setSelectedPin(null);
        setIsModalOpen(false);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error deleting pin:", error);
      throw error;
    }
  };

  // Quick delete with undo support
  const handleQuickDelete = (pin: any) => {
    // Store pin data for potential undo
    const pinData = { ...pin };
    
    // Optimistically remove from UI
    setPins(prevPins => prevPins.filter(p => p.id !== pin.id));
    
    // Push to undo stack
    pushAction({
      type: 'delete',
      pinId: pin.id,
      previousData: pinData,
      description: `Pin #${pin.pin_number} deleted`,
    });
    
    // Clear any existing timeout
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    
    // Show undo toast
    toast.info(`Pin #${pin.pin_number} deleted`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => handleUndoDelete(pinData),
      },
    });
    
    // Actually delete after 5 seconds if not undone
    undoTimeoutRef.current = setTimeout(async () => {
      try {
        await deletePin(pin.id);
        clearPendingUndo();
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error("Error deleting pin:", error);
        // Restore the pin if delete failed
        setPins(prevPins => [...prevPins, pinData].sort((a, b) => a.pin_number - b.pin_number));
        toast.error("Failed to delete pin");
      }
    }, 5000);
  };

  const handleUndoDelete = (pinData: any) => {
    // Cancel the pending delete
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    
    // Restore pin to the list
    setPins(prevPins => [...prevPins, pinData].sort((a, b) => a.pin_number - b.pin_number));
    clearPendingUndo();
    toast.success(`Pin #${pinData.pin_number} restored`);
  };

  const handleSaveRectification = async (pinId: string, photoUrl: string, notes: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("floor_plan_pins")
        .update({
          rectification_photo_url: photoUrl,
          rectification_notes: notes,
          rectified_at: new Date().toISOString(),
          rectified_by: user?.email || 'Unknown',
        })
        .eq("id", pinId);

      if (error) throw error;
      
      await loadFloorPlan();
      toast.success("Rectification photo saved");
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error saving rectification:", error);
      toast.error("Failed to save rectification photo");
      throw error;
    }
  };

  const handleRemoveRectification = async (pinId: string) => {
    try {
      const { error } = await supabase
        .from("floor_plan_pins")
        .update({
          rectification_photo_url: null,
          rectification_notes: null,
          rectified_at: null,
          rectified_by: null,
        })
        .eq("id", pinId);

      if (error) throw error;
      
      await loadFloorPlan();
      toast.success("Rectification photo removed");
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error removing rectification:", error);
      toast.error("Failed to remove rectification photo");
      throw error;
    }
  };

  const handleQuickStatusChange = async (pinId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("floor_plan_pins")
        .update({ status: newStatus })
        .eq("id", pinId);

      if (error) throw error;
      
      // Update local state immediately for snappy UI
      setPins(prevPins => 
        prevPins.map(pin => 
          pin.id === pinId ? { ...pin, status: newStatus } : pin
        )
      );
      
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error updating status:", error);
      toast.error("Failed to update status");
      throw error;
    }
  };

  const handleMovePin = () => {
    setMoveMode(selectedPin.id);
    setIsModalOpen(false);
    toast.info("Click on the floor plan to move this pin");
  };

  const handlePreviewReport = async () => {
    if (!floorPlan) return;

    try {
      setIsGeneratingReport(true);
      toast.info("Generating report preview...");

      const pinsWithComments = await Promise.all(
        pins.map(async (pin) => {
          const { data: comments } = await supabase
            .from('floor_plan_pin_comments')
            .select('user_name, comment, created_at')
            .eq('pin_id', pin.id)
            .order('created_at', { ascending: true });
          
          return { ...pin, comments: comments || [] };
        })
      );

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

      const blob = report.blob;
      const url = URL.createObjectURL(blob);
      const filename = `floor-plan-report-${subsectionName}-${new Date().toISOString().split('T')[0]}.pdf`;
      setPdfPreview({ url, blob, filename });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!pdfPreview) return;
    
    setSavingToDocuments(true);
    try {
      const result = await savePDFToDocuments({
        blob: pdfPreview.blob,
        fileName: pdfPreview.filename,
        subsectionId,
        categoryName: getReportCategoryName("floor-plan"),
      });

      if (result.success) {
        toast.success("Floor plan report saved to documents!");
        URL.revokeObjectURL(pdfPreview.url);
        setPdfPreview(null);
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error saving report:", error);
      toast.error("Failed to save report");
    } finally {
      setSavingToDocuments(false);
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-2xl font-bold">Interactive Floor Plan</h2>
          {!isOnline && (
            <Badge variant="secondary" className="gap-1">
              <WifiOff className="w-3 h-3" />
              Offline Mode
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Quick Add Mode Toggle */}
          <Button
            variant={quickAddMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setQuickAddMode(!quickAddMode);
              toast.info(quickAddMode 
                ? "Quick add mode disabled" 
                : "Quick add mode enabled - click to add pins rapidly"
              );
            }}
            className="gap-2"
          >
            <Zap className={`w-4 h-4 ${quickAddMode ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Quick Add</span>
          </Button>
          
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
            onClick={handlePreviewReport}
            disabled={isGeneratingReport || pins.length === 0}
            size="sm"
            className="flex-1 sm:flex-initial"
          >
            {isGeneratingReport ? (
              <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Preview Report</span>
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
            selectedPinId={selectedPin?.id}
            quickAddMode={quickAddMode}
          />
        </div>
        <div className="hidden lg:block">
          <FloorPlanPinsList
            pins={pins}
            onPinClick={(pin) => {
              setSelectedPin(pin);
              setIsModalOpen(true);
            }}
            onQuickStatusChange={handleQuickStatusChange}
            onQuickDelete={handleQuickDelete}
            selectedPinId={selectedPin?.id}
          />
        </div>
        {/* Mobile pins list is rendered inside FloorPlanPinsList as a bottom sheet */}
        <div className="lg:hidden">
          <FloorPlanPinsList
            pins={pins}
            onPinClick={(pin) => {
              setSelectedPin(pin);
              setIsModalOpen(true);
            }}
            onQuickStatusChange={handleQuickStatusChange}
            onQuickDelete={handleQuickDelete}
            selectedPinId={selectedPin?.id}
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
          onSaveRectification={handleSaveRectification}
          onRemoveRectification={handleRemoveRectification}
          onDelete={selectedPin?.id ? handleDeletePin : undefined}
          onMove={handleMovePin}
          initialData={selectedPin}
          pinNumber={selectedPin.pin_number}
        />
      )}

      {/* PDF Preview Dialog */}
      {pdfPreview && (
        <DocumentPreviewDialog
          open={!!pdfPreview}
          onOpenChange={(open) => {
            if (!open) {
              URL.revokeObjectURL(pdfPreview.url);
              setPdfPreview(null);
            }
          }}
          fileUrl={pdfPreview.url}
          fileName={pdfPreview.filename}
          onSaveToDocuments={handleSaveToDocuments}
          saveLocation="subsection"
          contextName={subsectionName}
          isSaving={savingToDocuments}
        />
      )}
    </div>
  );
};