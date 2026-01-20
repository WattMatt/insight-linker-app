import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Document, Page, pdfjs } from "react-pdf";
import { toast } from "sonner";
import { 
  Upload, 
  Plus, 
  Trash2, 
  Eye, 
  Link2, 
  Unlink, 
  ZoomIn, 
  ZoomOut,
  Move,
  Camera,
  Gauge,
  Zap,
  Pencil,
  X,
  Maximize2,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  MoreVertical
} from "lucide-react";
import { FullscreenImageViewer } from "@/components/FullscreenImageViewer";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface SchematicDiagramProps {
  siteId: string;
  siteName: string;
}

interface Subsection {
  id: string;
  name: string;
  tenant_name?: string;
  meter_serial_number?: string;
}

interface SchematicBlock {
  id: string;
  schematic_id: string;
  subsection_id: string | null;
  block_identifier: string;
  block_name: string | null;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  is_auto_matched: boolean;
}

interface Schematic {
  id: string;
  site_id: string;
  file_name: string;
  file_url: string;
}

interface InspectionTenantMatch {
  inspectionId: string;
  inspectionTitle: string;
  subsectionId: string | null;
  subsectionName?: string;
  shopName?: string;
  shopNumber?: string;
  meterSerialNumber: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
  meterImage?: string;
  ctRatioImage?: string;
  breakerImage?: string;
}

// Fixed container dimensions
const CONTAINER_HEIGHT = 500;

// Size presets
const SIZE_PRESETS = {
  small: { width: 80, height: 50, label: "Small", description: "80 × 50 px" },
  medium: { width: 150, height: 100, label: "Medium", description: "150 × 100 px" },
  large: { width: 220, height: 140, label: "Large", description: "220 × 140 px" },
  wide: { width: 200, height: 80, label: "Wide", description: "200 × 80 px" },
  tall: { width: 100, height: 150, label: "Tall", description: "100 × 150 px" },
  custom: { width: 0, height: 0, label: "Custom", description: "Set your own" },
};

export const SchematicDiagram: React.FC<SchematicDiagramProps> = ({ siteId, siteName }) => {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // State
  const [schematic, setSchematic] = useState<Schematic | null>(null);
  const [blocks, setBlocks] = useState<SchematicBlock[]>([]);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<SchematicBlock | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  // Resize/drag state
  const [resizing, setResizing] = useState<{ blockId: string; corner: string } | null>(null);
  const [dragging, setDragging] = useState<{ blockId: string } | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [originalBlock, setOriginalBlock] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Form state for editing block
  const [editForm, setEditForm] = useState({
    block_identifier: "",
    block_name: "",
    subsection_id: "",
    width: 150,
    height: 100,
  });

  // Block size configuration dialog
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false);
  const [selectedSizePreset, setSelectedSizePreset] = useState<string>("medium");
  const [customSize, setCustomSize] = useState({ width: 150, height: 100 });

  // Calculate fit-to-container scale
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current || pdfDimensions.width === 0) return 1;
    
    const containerWidth = containerRef.current.clientWidth - 32; // padding
    const containerHeight = CONTAINER_HEIGHT - 32;
    
    const scaleX = containerWidth / pdfDimensions.width;
    const scaleY = containerHeight / pdfDimensions.height;
    
    return Math.min(scaleX, scaleY, 1); // Cap at 100%
  }, [pdfDimensions]);

  // Auto-fit on PDF load
  useEffect(() => {
    if (pdfDimensions.width > 0 && !isEditMode) {
      const fitScale = calculateFitScale();
      setScale(fitScale);
    }
  }, [pdfDimensions, calculateFitScale, isEditMode]);

  // Handle PDF page load to get dimensions
  const handlePageLoad = (page: any) => {
    setPdfDimensions({
      width: page.width,
      height: page.height,
    });
  };

  // Handle mouse wheel zoom (only in edit mode)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isEditMode) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.min(Math.max(s + delta, 0.25), 3));
  };

  // Handle middle mouse button pan (only in edit mode)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return;
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      if (containerRef.current) {
        setScrollStart({ 
          x: containerRef.current.scrollLeft, 
          y: containerRef.current.scrollTop 
        });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !isEditMode) return;
    
    e.preventDefault();
    if (containerRef.current) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      containerRef.current.scrollLeft = scrollStart.x - dx;
      containerRef.current.scrollTop = scrollStart.y - dy;
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      setIsPanning(false);
    }
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
    if (resizing || dragging) {
      handleBlockResizeEnd();
    }
  };

  // Block resize handlers
  const handleBlockResizeStart = (e: React.MouseEvent, blockId: string, corner: string) => {
    if (!isEditMode) return;
    e.stopPropagation();
    e.preventDefault();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    
    setResizing({ blockId, corner });
    setDragStart({ x: e.clientX, y: e.clientY });
    setOriginalBlock({ x: block.x_position, y: block.y_position, width: block.width, height: block.height });
  };

  const handleBlockDragStart = (e: React.MouseEvent, blockId: string) => {
    if (!isEditMode || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    
    setDragging({ blockId });
    setDragStart({ x: e.clientX, y: e.clientY });
    setOriginalBlock({ x: block.x_position, y: block.y_position, width: block.width, height: block.height });
  };

  const handleBlockResizeMove = (e: React.MouseEvent) => {
    if (!originalBlock || !isEditMode) return;
    
    const dx = (e.clientX - dragStart.x) / scale;
    const dy = (e.clientY - dragStart.y) / scale;

    if (resizing) {
      const block = blocks.find(b => b.id === resizing.blockId);
      if (!block) return;

      let newWidth = originalBlock.width;
      let newHeight = originalBlock.height;
      let newX = originalBlock.x;
      let newY = originalBlock.y;

      if (resizing.corner.includes('e')) newWidth = Math.max(40, originalBlock.width + dx);
      if (resizing.corner.includes('w')) {
        newWidth = Math.max(40, originalBlock.width - dx);
        newX = originalBlock.x + dx;
      }
      if (resizing.corner.includes('s')) newHeight = Math.max(30, originalBlock.height + dy);
      if (resizing.corner.includes('n')) {
        newHeight = Math.max(30, originalBlock.height - dy);
        newY = originalBlock.y + dy;
      }

      setBlocks(blocks.map(b => 
        b.id === resizing.blockId 
          ? { ...b, width: newWidth, height: newHeight, x_position: newX, y_position: newY }
          : b
      ));
    } else if (dragging) {
      setBlocks(blocks.map(b => 
        b.id === dragging.blockId 
          ? { ...b, x_position: originalBlock.x + dx, y_position: originalBlock.y + dy }
          : b
      ));
    }
  };

  const handleBlockResizeEnd = async () => {
    const blockId = resizing?.blockId || dragging?.blockId;
    if (!blockId) {
      setResizing(null);
      setDragging(null);
      setOriginalBlock(null);
      return;
    }

    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    try {
      const { error } = await supabase
        .from("schematic_blocks")
        .update({
          x_position: block.x_position,
          y_position: block.y_position,
          width: block.width,
          height: block.height,
        })
        .eq("id", blockId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating block:", error);
      toast.error("Failed to update block position");
    }

    setResizing(null);
    setDragging(null);
    setOriginalBlock(null);
  };

  // Load data
  useEffect(() => {
    loadData();
  }, [siteId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: schematicData, error: schematicError } = await supabase
        .from("site_schematics")
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();

      if (schematicError) throw schematicError;
      setSchematic(schematicData);

      if (schematicData) {
        const { data: blocksData, error: blocksError } = await supabase
          .from("schematic_blocks")
          .select("*")
          .eq("schematic_id", schematicData.id)
          .order("block_identifier");

        if (blocksError) throw blocksError;
        setBlocks(blocksData || []);
      }

      const { data: subsData, error: subsError } = await supabase
        .from("subsections")
        .select("id, name, tenant_name, meter_serial_number")
        .eq("site_id", siteId)
        .order("name");

      if (subsError) throw subsError;
      setSubsections(subsData || []);

      const { data: inspData, error: inspError } = await supabase
        .from("inspections")
        .select("id, title, subsection_id, json_data")
        .eq("site_id", siteId);

      if (inspError) throw inspError;
      setInspections(inspData || []);
    } catch (error) {
      console.error("Error loading schematic data:", error);
      toast.error("Failed to load schematic data");
    } finally {
      setLoading(false);
    }
  };

  // Build inspection meter matches for asset photos
  const inspectionMeterMatches = useMemo(() => {
    const matches = new Map<string, InspectionTenantMatch>();
    
    inspections.forEach(inspection => {
      const jsonData = inspection.json_data as { 
        tenants?: Array<{ 
          id: string;
          shopName?: string;
          shopNumber?: string;
          meterSerialNumber?: string;
          ctSizeAndRatio?: string;
          breakerSize?: string;
          meterImage?: string;
          ctRatioImage?: string;
          breakerImage?: string;
        }> 
      };
      
      const tenants = jsonData?.tenants || [];
      tenants.forEach(tenant => {
        if (!tenant.meterSerialNumber) return;
        
        const normalizedSerial = tenant.meterSerialNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
        if (!normalizedSerial || normalizedSerial === 'NA' || normalizedSerial === 'TBC') return;
        
        const subsection = subsections.find(s => s.id === inspection.subsection_id);
        
        const existing = matches.get(normalizedSerial);
        const hasMoreImages = (tenant.meterImage || tenant.ctRatioImage || tenant.breakerImage) && 
                              !(existing?.meterImage || existing?.ctRatioImage || existing?.breakerImage);
        
        if (!existing || hasMoreImages) {
          matches.set(normalizedSerial, {
            inspectionId: inspection.id,
            inspectionTitle: inspection.title,
            subsectionId: inspection.subsection_id,
            subsectionName: subsection?.name,
            shopName: tenant.shopName,
            shopNumber: tenant.shopNumber,
            meterSerialNumber: tenant.meterSerialNumber,
            ctSizeAndRatio: tenant.ctSizeAndRatio,
            breakerSize: tenant.breakerSize,
            meterImage: tenant.meterImage,
            ctRatioImage: tenant.ctRatioImage,
            breakerImage: tenant.breakerImage,
          });
        }
      });
    });
    
    return matches;
  }, [inspections, subsections]);

  // Get asset photos for a subsection
  const getAssetPhotos = (subsectionId: string | null): InspectionTenantMatch | null => {
    if (!subsectionId) return null;
    
    const subsection = subsections.find(s => s.id === subsectionId);
    if (!subsection?.meter_serial_number) return null;
    
    const normalizedSerial = subsection.meter_serial_number.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    return inspectionMeterMatches.get(normalizedSerial) || null;
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Please upload a PDF file");
      return;
    }

    setUploading(true);
    try {
      const fileName = `${siteId}/schematic-${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(uploadData.path);

      const { data: schematicData, error: schematicError } = await supabase
        .from("site_schematics")
        .insert({
          site_id: siteId,
          file_name: file.name,
          file_url: urlData.publicUrl,
        })
        .select()
        .single();

      if (schematicError) throw schematicError;

      setSchematic(schematicData);
      toast.success("Schematic uploaded successfully");
    } catch (error: any) {
      console.error("Error uploading schematic:", error);
      toast.error(error.message || "Failed to upload schematic");
    } finally {
      setUploading(false);
    }
  };

  // Handle deleting schematic
  const handleDeleteSchematic = async () => {
    if (!schematic) return;

    const confirmed = window.confirm("Are you sure you want to delete this schematic and all its blocks?");
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("site_schematics")
        .delete()
        .eq("id", schematic.id);

      if (error) throw error;

      setSchematic(null);
      setBlocks([]);
      toast.success("Schematic deleted");
    } catch (error) {
      console.error("Error deleting schematic:", error);
      toast.error("Failed to delete schematic");
    }
  };

  // Handle clicking on schematic to add block
  const handleSchematicClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingBlock || !schematic || !isEditMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    try {
      const blockNumber = blocks.length + 1;
      const { data, error } = await supabase
        .from("schematic_blocks")
        .insert({
          schematic_id: schematic.id,
          block_identifier: `DB-${String(blockNumber).padStart(3, '0')}`,
          block_name: null,
          x_position: x,
          y_position: y,
          width: 150,
          height: 100,
        })
        .select()
        .single();

      if (error) throw error;

      setBlocks([...blocks, data]);
      setSelectedBlock(data);
      setEditForm({
        block_identifier: data.block_identifier,
        block_name: "",
        subsection_id: "",
        width: data.width,
        height: data.height,
      });
      setEditDialogOpen(true);
      setIsAddingBlock(false);
      toast.success("Block added - now configure it");
    } catch (error) {
      console.error("Error adding block:", error);
      toast.error("Failed to add block");
    }
  };

  // Handle clicking a block
  const handleBlockClick = (block: SchematicBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isEditMode && block.subsection_id) {
      const basePath = clientId 
        ? `/clients/${clientId}/sites/${siteId}/subsections/${block.subsection_id}`
        : `/sites/${siteId}/subsections/${block.subsection_id}`;
      navigate(basePath);
    }
  };

  // Handle viewing photos
  const handleViewPhoto = (type: 'meter' | 'ct' | 'breaker', photos: InspectionTenantMatch) => {
    const photoMap = {
      meter: { url: photos.meterImage, title: "Meter Photo" },
      ct: { url: photos.ctRatioImage, title: "CT Ratio Photo" },
      breaker: { url: photos.breakerImage, title: "Breaker Photo" },
    };

    const photo = photoMap[type];
    if (photo.url) {
      setViewerImage({ url: photo.url, title: photo.title });
      setImageViewerOpen(true);
    }
  };

  // Save block changes
  const handleSaveBlock = async () => {
    if (!selectedBlock) return;

    try {
      let matchedSubsectionId = (editForm.subsection_id && editForm.subsection_id !== "none") ? editForm.subsection_id : null;
      let isAutoMatched = false;

      if (!matchedSubsectionId && editForm.block_identifier) {
        const identifier = editForm.block_identifier.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        const matchedSub = subsections.find(s => {
          const subName = s.name.toUpperCase().replace(/[^A-Z0-9-]/g, '');
          return subName.includes(identifier) || identifier.includes(subName);
        });
        if (matchedSub) {
          matchedSubsectionId = matchedSub.id;
          isAutoMatched = true;
        }
      }

      const { error } = await supabase
        .from("schematic_blocks")
        .update({
          block_identifier: editForm.block_identifier,
          block_name: editForm.block_name || null,
          subsection_id: matchedSubsectionId,
          is_auto_matched: isAutoMatched,
          width: editForm.width,
          height: editForm.height,
        })
        .eq("id", selectedBlock.id);

      if (error) throw error;

      setBlocks(blocks.map(b => 
        b.id === selectedBlock.id 
          ? { 
              ...b, 
              block_identifier: editForm.block_identifier, 
              block_name: editForm.block_name || null, 
              subsection_id: matchedSubsectionId, 
              is_auto_matched: isAutoMatched,
              width: editForm.width,
              height: editForm.height,
            }
          : b
      ));

      setEditDialogOpen(false);
      setLinkDialogOpen(false);
      toast.success(matchedSubsectionId ? "Block linked to subsection" : "Block updated");
    } catch (error) {
      console.error("Error saving block:", error);
      toast.error("Failed to save block");
    }
  };

  // Apply size preset to all blocks
  const handleApplySizePreset = async () => {
    if (blocks.length === 0) {
      toast.info("No blocks to resize");
      return;
    }

    const size = selectedSizePreset === "custom" 
      ? customSize 
      : SIZE_PRESETS[selectedSizePreset as keyof typeof SIZE_PRESETS];

    try {
      const { error } = await supabase
        .from("schematic_blocks")
        .update({ width: size.width, height: size.height })
        .eq("schematic_id", schematic?.id);

      if (error) throw error;

      setBlocks(blocks.map(b => ({ ...b, width: size.width, height: size.height })));
      setSizeDialogOpen(false);
      toast.success(`Applied ${SIZE_PRESETS[selectedSizePreset as keyof typeof SIZE_PRESETS]?.label || 'custom'} size to all ${blocks.length} blocks`);
    } catch (error) {
      console.error("Error applying size to blocks:", error);
      toast.error("Failed to apply size to blocks");
    }
  };

  // Delete block
  const handleDeleteBlock = async () => {
    if (!selectedBlock) return;

    try {
      const { error } = await supabase
        .from("schematic_blocks")
        .delete()
        .eq("id", selectedBlock.id);

      if (error) throw error;

      setBlocks(blocks.filter(b => b.id !== selectedBlock.id));
      setEditDialogOpen(false);
      toast.success("Block deleted");
    } catch (error) {
      console.error("Error deleting block:", error);
      toast.error("Failed to delete block");
    }
  };

  // Unlink block from subsection
  const handleUnlinkBlock = async (block: SchematicBlock) => {
    try {
      const { error } = await supabase
        .from("schematic_blocks")
        .update({ subsection_id: null, is_auto_matched: false })
        .eq("id", block.id);

      if (error) throw error;

      setBlocks(blocks.map(b => 
        b.id === block.id ? { ...b, subsection_id: null, is_auto_matched: false } : b
      ));

      toast.success("Block unlinked");
    } catch (error) {
      console.error("Error unlinking block:", error);
      toast.error("Failed to unlink block");
    }
  };

  // Auto-match all blocks
  const handleAutoMatch = async () => {
    if (!schematic) return;

    let matchedCount = 0;
    const updates: { id: string; subsection_id: string }[] = [];

    blocks.forEach(block => {
      if (block.subsection_id) return;

      const identifier = block.block_identifier.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const matchedSub = subsections.find(s => {
        const subName = s.name.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        return subName.includes(identifier) || identifier.includes(subName);
      });

      if (matchedSub) {
        updates.push({ id: block.id, subsection_id: matchedSub.id });
        matchedCount++;
      }
    });

    if (updates.length === 0) {
      toast.info("No new matches found");
      return;
    }

    try {
      for (const update of updates) {
        await supabase
          .from("schematic_blocks")
          .update({ subsection_id: update.subsection_id, is_auto_matched: true })
          .eq("id", update.id);
      }

      setBlocks(blocks.map(b => {
        const update = updates.find(u => u.id === b.id);
        return update ? { ...b, subsection_id: update.subsection_id, is_auto_matched: true } : b;
      }));

      toast.success(`Auto-matched ${matchedCount} blocks`);
    } catch (error) {
      console.error("Error auto-matching:", error);
      toast.error("Failed to auto-match blocks");
    }
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    if (isEditMode) {
      // Exit edit mode - reset to fit view
      setIsEditMode(false);
      setIsAddingBlock(false);
      const fitScale = calculateFitScale();
      setScale(fitScale);
    } else {
      setIsEditMode(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // No schematic uploaded yet
  if (!schematic) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Schematic Diagram
          </CardTitle>
          <CardDescription>
            Upload a schematic distribution diagram to visualize the electrical layout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Upload Schematic PDF</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your electrical distribution diagram
            </p>
            <label htmlFor="schematic-upload">
              <Button asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? "Uploading..." : "Select PDF File"}
                </span>
              </Button>
            </label>
            <input
              id="schematic-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  const linkedCount = blocks.filter(b => b.subsection_id).length;
  const unlinkedCount = blocks.length - linkedCount;

  return (
    <Card className="overflow-hidden">
      {/* Header - Only visible in Edit Mode */}
      {isEditMode && (
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5" />
                {schematic.file_name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{blocks.length} blocks</Badge>
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {linkedCount} linked
                </Badge>
                {unlinkedCount > 0 && (
                  <Badge variant="destructive" className="bg-destructive/10 text-destructive">
                    {unlinkedCount} unlinked
                  </Badge>
                )}
              </div>
            </div>
            
            <Button
              variant="default"
              size="sm"
              onClick={toggleEditMode}
            >
              <X className="h-4 w-4 mr-1" />
              Exit Edit
            </Button>
          </div>
        </CardHeader>
      )}

      {/* Edit Mode Toolbar */}
      {isEditMode && (
        <div className="px-6 py-3 bg-muted/50 border-b flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant={isAddingBlock ? "secondary" : "outline"}
              size="sm"
              onClick={() => setIsAddingBlock(!isAddingBlock)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {isAddingBlock ? "Click to place..." : "Add Block"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSizeDialogOpen(true)}
              disabled={blocks.length === 0}
            >
              <Maximize2 className="h-4 w-4 mr-1" />
              Block Size
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoMatch}
            >
              <Link2 className="h-4 w-4 mr-1" />
              Auto-Match
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteSchematic}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale(s => Math.max(s - 0.25, 0.25))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale(s => Math.min(s + 0.25, 3))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Schematic Viewer - Fixed Height */}
      <CardContent className="p-0 relative">
        {/* Edit Button Overlay - Visible when not editing */}
        {!isEditMode && (
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleEditMode}
            className="absolute top-3 right-3 z-10 shadow-md"
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
        
        <div 
          ref={containerRef}
          className={`relative overflow-auto bg-muted/30 ${
            isEditMode 
              ? (isAddingBlock ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab')
              : 'cursor-default'
          }`}
          style={{ height: CONTAINER_HEIGHT }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => {
            handleMouseMove(e);
            if (isEditMode && (resizing || dragging)) handleBlockResizeMove(e);
          }}
          onMouseUp={(e) => {
            handleMouseUp(e);
            if (isEditMode && (resizing || dragging)) handleBlockResizeEnd();
          }}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => { if (isPanning) e.preventDefault(); }}
        >
          <div 
            ref={contentRef}
            className="relative inline-block p-4"
            onClick={isEditMode ? handleSchematicClick : undefined}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <Document
              file={schematic.file_url}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              loading={
                <div className="flex items-center justify-center h-64">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              }
            >
              <Page 
                pageNumber={pageNumber} 
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={handlePageLoad}
              />
            </Document>

            {/* Render blocks */}
            {blocks.map(block => {
              const isLinked = !!block.subsection_id;
              const photos = getAssetPhotos(block.subsection_id);
              const hasPhotos = photos && (photos.meterImage || photos.ctRatioImage || photos.breakerImage);

              return (
                <div
                  key={block.id}
                  className={`absolute flex items-center justify-center border-2 rounded-sm select-none transition-colors ${
                    isLinked 
                      ? 'bg-primary/10 border-primary hover:bg-primary/20' 
                      : 'bg-destructive/10 border-destructive'
                  } ${(dragging?.blockId === block.id || resizing?.blockId === block.id) ? 'z-50' : ''} ${
                    isEditMode ? 'group' : ''
                  }`}
                  style={{
                    left: block.x_position - block.width / 2,
                    top: block.y_position - block.height / 2,
                    width: block.width,
                    height: block.height,
                    cursor: isEditMode 
                      ? (dragging?.blockId === block.id ? 'grabbing' : 'grab')
                      : (isLinked ? 'pointer' : 'default'),
                  }}
                  onMouseDown={(e) => isEditMode && handleBlockDragStart(e, block.id)}
                  onClick={(e) => {
                    if (!dragging && !resizing) handleBlockClick(block, e);
                  }}
                >
                  {/* Block identifier */}
                  <p className="text-[10px] font-bold text-foreground/80 pointer-events-none">{block.block_identifier}</p>

                  {/* Resize handles - only in edit mode */}
                  {isEditMode && (
                    <>
                      <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-sm cursor-nw-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'nw')} />
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-sm cursor-ne-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'ne')} />
                      <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-sm cursor-sw-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'sw')} />
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'se')} />
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-primary/70 rounded-sm cursor-n-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'n')} />
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-primary/70 rounded-sm cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 's')} />
                      <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-4 bg-primary/70 rounded-sm cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'w')} />
                      <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-4 bg-primary/70 rounded-sm cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleBlockResizeStart(e, block.id, 'e')} />
                    </>
                  )}

                  {/* Action buttons for linked blocks with photos */}
                  {isLinked && hasPhotos && !isEditMode && (
                    <div className="absolute -top-3 -right-3 z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/80 shadow-sm">
                            <Eye className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {photos.meterImage && (
                            <DropdownMenuItem onClick={() => handleViewPhoto('meter', photos)}>
                              <Gauge className="h-4 w-4 mr-2" />
                              Meter Photo
                            </DropdownMenuItem>
                          )}
                          {photos.breakerImage && (
                            <DropdownMenuItem onClick={() => handleViewPhoto('breaker', photos)}>
                              <Zap className="h-4 w-4 mr-2" />
                              Breaker Photo
                            </DropdownMenuItem>
                          )}
                          {photos.ctRatioImage && (
                            <DropdownMenuItem onClick={() => handleViewPhoto('ct', photos)}>
                              <Camera className="h-4 w-4 mr-2" />
                              CT Ratio Photo
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  {/* Edit mode action menus */}
                  {isEditMode && (
                    <div className="absolute -top-3 -right-3 z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button className={`h-5 w-5 rounded-full flex items-center justify-center shadow-sm ${
                            isLinked 
                              ? 'bg-primary text-primary-foreground hover:bg-primary/80' 
                              : 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
                          }`}>
                            <MoreVertical className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {!isLinked && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedBlock(block);
                              setEditForm({
                                block_identifier: block.block_identifier,
                                block_name: block.block_name || "",
                                subsection_id: "",
                                width: block.width,
                                height: block.height,
                              });
                              setLinkDialogOpen(true);
                            }}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Link to Subsection
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => {
                            setSelectedBlock(block);
                            setEditForm({
                              block_identifier: block.block_identifier,
                              block_name: block.block_name || "",
                              subsection_id: block.subsection_id || "",
                              width: block.width,
                              height: block.height,
                            });
                            setEditDialogOpen(true);
                          }}>
                            <Move className="h-4 w-4 mr-2" />
                            Edit Block
                          </DropdownMenuItem>
                          {isLinked && (
                            <DropdownMenuItem onClick={() => handleUnlinkBlock(block)}>
                              <Unlink className="h-4 w-4 mr-2" />
                              Unlink
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pagination */}
        {numPages && numPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-3 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pageNumber} of {numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}

        {/* Legend - compact footer */}
        <div className="px-6 py-2 border-t bg-muted/30 flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded border-2 border-primary bg-primary/20" />
            <span>Linked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded border-2 border-destructive bg-destructive/20" />
            <span>Not linked</span>
          </div>
          {!isEditMode && (
            <div className="flex items-center gap-1.5">
              <Eye className="h-3 w-3" />
              <span>Click block to view subsection</span>
            </div>
          )}
        </div>
      </CardContent>

      {/* Edit Block Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Block</DialogTitle>
            <DialogDescription>
              Configure this block and link it to a subsection
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="block_identifier">Block Identifier</Label>
              <Input
                id="block_identifier"
                value={editForm.block_identifier}
                onChange={(e) => setEditForm({ ...editForm, block_identifier: e.target.value })}
                placeholder="e.g., DB-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="block_name">Block Name (Optional)</Label>
              <Input
                id="block_name"
                value={editForm.block_name}
                onChange={(e) => setEditForm({ ...editForm, block_name: e.target.value })}
                placeholder="e.g., SHOPRITE"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subsection">Link to Subsection</Label>
              <Select 
                value={editForm.subsection_id} 
                onValueChange={(value) => setEditForm({ ...editForm, subsection_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a subsection..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No Link --</SelectItem>
                  {subsections.filter(sub => sub.id).map(sub => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name} {sub.tenant_name ? `(${sub.tenant_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button variant="destructive" onClick={handleDeleteBlock}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBlock}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Block Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Block to Subsection</DialogTitle>
            <DialogDescription>
              Block: {selectedBlock?.block_identifier}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-subsection">Select Subsection</Label>
              <Select 
                value={editForm.subsection_id} 
                onValueChange={(value) => setEditForm({ ...editForm, subsection_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a subsection..." />
                </SelectTrigger>
                <SelectContent>
                  {subsections.filter(sub => sub.id).map(sub => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name} {sub.tenant_name ? `(${sub.tenant_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveBlock} disabled={!editForm.subsection_id}>
              <Link2 className="h-4 w-4 mr-1" />
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Size Configuration Dialog */}
      <Dialog open={sizeDialogOpen} onOpenChange={setSizeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5" />
              Configure Block Size
            </DialogTitle>
            <DialogDescription>
              Set a uniform size for all {blocks.length} blocks
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(SIZE_PRESETS).filter(([key]) => key !== 'custom').map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedSizePreset(key);
                    setCustomSize({ width: preset.width, height: preset.height });
                  }}
                  className={`p-3 rounded-lg border-2 transition-all hover:border-primary/50 ${
                    selectedSizePreset === key 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div 
                      className="border-2 border-current rounded flex items-center justify-center"
                      style={{ 
                        width: Math.min(preset.width / 4, 50), 
                        height: Math.min(preset.height / 4, 35) 
                      }}
                    >
                      {key === 'small' && <Square className="h-3 w-3 opacity-50" />}
                      {key === 'medium' && <Square className="h-4 w-4 opacity-50" />}
                      {key === 'large' && <Square className="h-5 w-5 opacity-50" />}
                      {key === 'wide' && <RectangleHorizontal className="h-4 w-4 opacity-50" />}
                      {key === 'tall' && <RectangleVertical className="h-4 w-4 opacity-50" />}
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm">{preset.label}</p>
                      <p className="text-xs text-muted-foreground">{preset.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div 
              onClick={() => setSelectedSizePreset("custom")}
              className={`p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-primary/50 ${
                selectedSizePreset === "custom" 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <Maximize2 className="h-4 w-4" />
                <span className="font-medium">Custom Size</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="custom_width" className="text-xs text-muted-foreground">Width (px)</Label>
                  <Input
                    id="custom_width"
                    type="number"
                    min={40}
                    max={500}
                    value={customSize.width}
                    onChange={(e) => {
                      setSelectedSizePreset("custom");
                      setCustomSize({ ...customSize, width: Math.max(40, Math.min(500, Number(e.target.value))) });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="custom_height" className="text-xs text-muted-foreground">Height (px)</Label>
                  <Input
                    id="custom_height"
                    type="number"
                    min={30}
                    max={500}
                    value={customSize.height}
                    onChange={(e) => {
                      setSelectedSizePreset("custom");
                      setCustomSize({ ...customSize, height: Math.max(30, Math.min(500, Number(e.target.value))) });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSizeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplySizePreset}>
              <Maximize2 className="h-4 w-4 mr-1" />
              Apply to All Blocks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Viewer */}
      {imageViewerOpen && viewerImage && (
        <FullscreenImageViewer
          src={viewerImage.url}
          onClose={() => setImageViewerOpen(false)}
          alt={viewerImage.title}
        />
      )}
    </Card>
  );
};
