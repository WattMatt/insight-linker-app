import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Image as ImageIcon,
  ExternalLink,
  MoreVertical,
  Camera,
  Gauge,
  Zap
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

  // Form state for editing block
  const [editForm, setEditForm] = useState({
    block_identifier: "",
    block_name: "",
    subsection_id: "",
  });

  // Handle mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(s => Math.min(Math.max(s + delta, 0.25), 3));
    }
  };

  // Handle middle mouse button pan
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Middle mouse button (button === 1)
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
    if (!isPanning) return;
    
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
  };

  // Load data
  useEffect(() => {
    loadData();
  }, [siteId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch schematic
      const { data: schematicData, error: schematicError } = await supabase
        .from("site_schematics")
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();

      if (schematicError) throw schematicError;
      setSchematic(schematicData);

      // Fetch blocks if schematic exists
      if (schematicData) {
        const { data: blocksData, error: blocksError } = await supabase
          .from("schematic_blocks")
          .select("*")
          .eq("schematic_id", schematicData.id)
          .order("block_identifier");

        if (blocksError) throw blocksError;
        setBlocks(blocksData || []);
      }

      // Fetch subsections
      const { data: subsData, error: subsError } = await supabase
        .from("subsections")
        .select("id, name, tenant_name, meter_serial_number")
        .eq("site_id", siteId)
        .order("name");

      if (subsError) throw subsError;
      setSubsections(subsData || []);

      // Fetch inspections for asset photos
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
      // Upload to storage
      const fileName = `${siteId}/schematic-${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(uploadData.path);

      // Create schematic record
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
    if (!isAddingBlock || !schematic) return;

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
          width: 120,
          height: 80,
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
    
    if (block.subsection_id) {
      // Navigate to subsection
      const basePath = clientId 
        ? `/clients/${clientId}/sites/${siteId}/subsections/${block.subsection_id}`
        : `/sites/${siteId}/subsections/${block.subsection_id}`;
      navigate(basePath);
    } else {
      // Open link dialog
      setSelectedBlock(block);
      setEditForm({
        block_identifier: block.block_identifier,
        block_name: block.block_name || "",
        subsection_id: "",
      });
      setLinkDialogOpen(true);
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
      // Try to auto-match subsection by identifier
      let matchedSubsectionId = editForm.subsection_id || null;
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
        })
        .eq("id", selectedBlock.id);

      if (error) throw error;

      setBlocks(blocks.map(b => 
        b.id === selectedBlock.id 
          ? { ...b, block_identifier: editForm.block_identifier, block_name: editForm.block_name || null, subsection_id: matchedSubsectionId, is_auto_matched: isAutoMatched }
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
      if (block.subsection_id) return; // Already linked

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

  // Get linked subsection name
  const getSubsectionName = (subsectionId: string | null): string => {
    if (!subsectionId) return "";
    const sub = subsections.find(s => s.id === subsectionId);
    return sub?.name || "";
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
            Upload a schematic distribution diagram to visualize the electrical layout and link blocks to subsections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Upload Schematic PDF</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your electrical distribution diagram to link DB blocks to subsections
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

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{schematic.file_name}</h3>
              <Badge variant="outline">{blocks.length} blocks</Badge>
              <Badge variant="secondary">
                {blocks.filter(b => b.subsection_id).length} linked
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={isAddingBlock ? "default" : "outline"}
                size="sm"
                onClick={() => setIsAddingBlock(!isAddingBlock)}
              >
                <Plus className="h-4 w-4 mr-1" />
                {isAddingBlock ? "Click on diagram..." : "Add Block"}
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
                variant="outline"
                size="sm"
                onClick={() => setScale(s => Math.min(s + 0.25, 2))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>

              <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteSchematic}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schematic Viewer */}
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-4">
            <span>🖱️ Ctrl+Scroll to zoom</span>
            <span>🖱️ Middle-click + drag to pan</span>
          </div>
          <div 
            ref={containerRef}
            className={`relative overflow-auto border rounded-lg bg-muted/50 ${isAddingBlock ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ maxHeight: '70vh' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={(e) => { if (isPanning) e.preventDefault(); }}
          >
            <div 
              ref={contentRef}
              className="relative inline-block"
              onClick={handleSchematicClick}
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
                    className={`absolute flex items-center justify-center transition-all cursor-pointer border-2 rounded-md ${
                      isLinked 
                        ? 'bg-primary/20 border-primary hover:bg-primary/30' 
                        : 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30'
                    }`}
                    style={{
                      left: block.x_position - block.width / 2,
                      top: block.y_position - block.height / 2,
                      width: block.width,
                      height: block.height,
                    }}
                    onClick={(e) => handleBlockClick(block, e)}
                  >
                    <div className="text-center px-1">
                      <p className="text-xs font-bold truncate">{block.block_identifier}</p>
                      {block.block_name && (
                        <p className="text-[10px] truncate text-muted-foreground">{block.block_name}</p>
                      )}
                      {isLinked && (
                        <p className="text-[9px] text-primary truncate">{getSubsectionName(block.subsection_id)}</p>
                      )}
                    </div>

                    {/* Action buttons - Eye icon for photos */}
                    {isLinked && (
                      <div className="absolute -top-2 -right-2 flex gap-0.5">
                        {hasPhotos && (
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
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80 shadow-sm">
                              <MoreVertical className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => {
                              setSelectedBlock(block);
                              setEditForm({
                                block_identifier: block.block_identifier,
                                block_name: block.block_name || "",
                                subsection_id: block.subsection_id || "",
                              });
                              setEditDialogOpen(true);
                            }}>
                              <Move className="h-4 w-4 mr-2" />
                              Edit Block
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUnlinkBlock(block)}>
                              <Unlink className="h-4 w-4 mr-2" />
                              Unlink
                            </DropdownMenuItem>
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
            <div className="flex items-center justify-center gap-4 mt-4">
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
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-primary bg-primary/20" />
              <span>Linked to subsection</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-orange-500 bg-orange-500/20" />
              <span>Not linked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Eye className="h-3 w-3" />
              </div>
              <span>Has asset photos</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <SelectItem value="">-- No Link --</SelectItem>
                  {subsections.map(sub => (
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

      {/* Link Block Dialog (when clicking unlinked block) */}
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
                  {subsections.map(sub => (
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

      {/* Image Viewer */}
      {imageViewerOpen && viewerImage && (
        <FullscreenImageViewer
          src={viewerImage.url}
          onClose={() => setImageViewerOpen(false)}
          alt={viewerImage.title}
        />
      )}
    </div>
  );
};
