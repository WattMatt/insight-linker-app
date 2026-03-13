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
  MoreVertical,
  RefreshCw,
  Replace,
  ScanSearch,
  Loader2
} from "lucide-react";
import { FullscreenImageViewer } from "@/components/FullscreenImageViewer";

// Initialize PDF.js worker for rendering PDF documents
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface SchematicDiagramProps {
  siteId: string;
  siteName: string;
  readOnly?: boolean;
  accessToken?: string; // For public review navigation
  clientPortalMode?: boolean; // For authenticated client portal navigation
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
  detected_regions?: DetectedRegion[];
  detection_status?: string;
  regions_detected_at?: string;
  // Calibration fields
  calibrated_width?: number | null;
  calibrated_height?: number | null;
  is_calibrated?: boolean;
}

interface DetectedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  confidence?: number;
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

// Minimum container height; actual height adapts to PDF
const MIN_CONTAINER_HEIGHT = 400;

// Size presets
const SIZE_PRESETS = {
  small: { width: 80, height: 50, label: "Small", description: "80 × 50 px" },
  medium: { width: 150, height: 100, label: "Medium", description: "150 × 100 px" },
  large: { width: 220, height: 140, label: "Large", description: "220 × 140 px" },
  wide: { width: 200, height: 80, label: "Wide", description: "200 × 80 px" },
  tall: { width: 100, height: 150, label: "Tall", description: "100 × 150 px" },
  custom: { width: 0, height: 0, label: "Custom", description: "Set your own" },
};

export const SchematicDiagram: React.FC<SchematicDiagramProps> = ({ siteId, siteName, readOnly = false, accessToken, clientPortalMode = false }) => {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
  const [originalPdfDimensions, setOriginalPdfDimensions] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dimensionsLoaded, setDimensionsLoaded] = useState(false);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<SchematicBlock | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);
  
  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStart, setCalibrationStart] = useState<{ x: number; y: number } | null>(null);
  const [calibrationRect, setCalibrationRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  

  // Pan state - transform-based (like FloorPlanViewer)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panOffsetRef = useRef(panOffset);
  panOffsetRef.current = panOffset;
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Snap state - values are percentages now
  const [snapLines, setSnapLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const SNAP_THRESHOLD = 1; // percentage threshold for snapping (~1% of page)

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

  // Measure container width on mount and resize
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    
    // Initial measurement with delay
    const timeoutId = setTimeout(updateContainerWidth, 50);
    
    // Update on resize
    window.addEventListener('resize', updateContainerWidth);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, []);

  // Shift key tracking for pan mode (like FloorPlanViewer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Wheel zoom (zoom-to-cursor) for both View and Edit modes
  // PDF is re-rendered at zoom resolution so no CSS scale needed - only pan offset
  const handleWheelZoom = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!schematic) return;
    if (e.ctrlKey || e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const delta = -e.deltaY;
    const zoomSpeed = 0.002;
    const zoomChange = delta * zoomSpeed;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setScale((prevScale) => {
      const newScale = Math.max(0.5, Math.min(5, prevScale + zoomChange));
      const scaleRatio = newScale / prevScale;

      // Zoom toward cursor: adjust pan so the point under cursor stays in place
      const currentPan = panOffsetRef.current;
      const newPanX = mouseX - scaleRatio * (mouseX - currentPan.x);
      const newPanY = mouseY - scaleRatio * (mouseY - currentPan.y);

      setPanOffset({ x: newPanX, y: newPanY });

      return newScale;
    });
  }, [schematic]);

  // Calculate the display scale to fit the PDF into the container
  const displayScale = useMemo(() => {
    if (!containerWidth || originalPdfDimensions.width === 0 || originalPdfDimensions.height === 0) {
      return 1;
    }
    
    const padding = 48;
    const availableWidth = containerWidth - padding;
    
    // Fit to width only - let height be natural
    return availableWidth / originalPdfDimensions.width;
  }, [containerWidth, originalPdfDimensions]);

  // Calculate the page width at current zoom - PDF is re-rendered at zoom resolution for sharpness
  const calculatedPageWidth = useMemo(() => {
    if (dimensionsLoaded && originalPdfDimensions.width > 0) {
      return originalPdfDimensions.width * displayScale * scale;
    }
    if (containerWidth > 0) {
      return (containerWidth - 32) * scale;
    }
    return 800 * scale;
  }, [originalPdfDimensions.width, displayScale, dimensionsLoaded, containerWidth, scale]);

  // Base page width (at scale=1) for container sizing
  const basePageWidth = useMemo(() => {
    if (dimensionsLoaded && originalPdfDimensions.width > 0) {
      return originalPdfDimensions.width * displayScale;
    }
    if (containerWidth > 0) return containerWidth - 32;
    return 800;
  }, [originalPdfDimensions.width, displayScale, dimensionsLoaded, containerWidth]);

  // Calculate the page height at current zoom
  const calculatedPageHeight = useMemo(() => {
    if (dimensionsLoaded && originalPdfDimensions.height > 0) {
      return originalPdfDimensions.height * displayScale * scale;
    }
    return (MIN_CONTAINER_HEIGHT - 32) * scale;
  }, [originalPdfDimensions.height, displayScale, dimensionsLoaded, scale]);

  // Base page height (at scale=1) for container sizing
  const basePageHeight = useMemo(() => {
    if (dimensionsLoaded && originalPdfDimensions.height > 0) {
      return originalPdfDimensions.height * displayScale;
    }
    return MIN_CONTAINER_HEIGHT - 32;
  }, [originalPdfDimensions.height, displayScale, dimensionsLoaded]);

  // Dynamic container height based on base PDF size (not zoomed)
  const containerHeight = useMemo(() => {
    if (dimensionsLoaded && basePageHeight > 0) {
      const needed = basePageHeight + 48;
      return Math.max(MIN_CONTAINER_HEIGHT, needed);
    }
    return MIN_CONTAINER_HEIGHT;
  }, [dimensionsLoaded, basePageHeight]);

  // Handle PDF page render to get original dimensions and capture canvas reference
  const handlePageRenderSuccess = useCallback((page: any) => {
    // Capture the canvas element for smart snap functionality
    // react-pdf renders to a canvas inside the Page component
    setTimeout(() => {
      const canvas = contentRef.current?.querySelector('canvas');
      if (canvas) {
        pdfCanvasRef.current = canvas;
        console.log('[SchematicDiagram] PDF canvas captured for smart snap');
      }
    }, 100);
    
    // Only capture dimensions once - when we don't have them yet
    if (dimensionsLoaded) return;
    
    // Use originalWidth/originalHeight for the true PDF dimensions
    const originalWidth = page.originalWidth || page.width;
    const originalHeight = page.originalHeight || page.height;
    
    console.log('PDF original dimensions captured:', { originalWidth, originalHeight });
    
    if (originalWidth > 0 && originalHeight > 0) {
      setOriginalPdfDimensions({
        width: originalWidth,
        height: originalHeight,
      });
      setDimensionsLoaded(true);
    }
  }, [dimensionsLoaded]);

  // Reset dimensions when page number changes (for multi-page PDFs)
  useEffect(() => {
    setDimensionsLoaded(false);
  }, [pageNumber]);

  // Reset pan/zoom when schematic changes (but preserve across mode toggles)
  useEffect(() => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, [schematic?.id]);

  // Pan handlers: Shift+drag / right-click drag in all modes, plus left-drag in View mode when zoomed
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const canModifierPan = isShiftPressed || e.button === 2;
    const canViewPan = !isEditMode && scale > 1 && e.button === 0;

    if (canModifierPan || canViewPan) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  // Prevent middle-click auto-scroll and context menu
  const handleAuxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Handle panning (works in all modes)
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }
    
    // Block dragging/resizing only in edit mode
    if (!isEditMode) return;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      e.preventDefault();
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
    
    console.log('[Schematic] Block drag start:', blockId);
    setDragging({ blockId });
    setDragStart({ x: e.clientX, y: e.clientY });
    setOriginalBlock({ x: block.x_position, y: block.y_position, width: block.width, height: block.height });
  };

  // Helper to find snap points from other blocks
  // Find snap points - coordinates are TOP-LEFT based
  const findSnapPoints = (currentBlockId: string, newX: number, newY: number, width: number, height: number) => {
    const otherBlocks = blocks.filter(b => b.id !== currentBlockId);
    let snapX: number | null = null;
    let snapY: number | null = null;
    let snappedX = newX;
    let snappedY = newY;

    // Calculate edges of current block (x,y is top-left)
    const currentLeft = newX;
    const currentRight = newX + width;
    const currentTop = newY;
    const currentBottom = newY + height;
    const currentCenterX = newX + width / 2;
    const currentCenterY = newY + height / 2;

    for (const other of otherBlocks) {
      // Other block edges (x_position, y_position is top-left)
      const otherLeft = other.x_position;
      const otherRight = other.x_position + other.width;
      const otherTop = other.y_position;
      const otherBottom = other.y_position + other.height;
      const otherCenterX = other.x_position + other.width / 2;
      const otherCenterY = other.y_position + other.height / 2;

      // Horizontal snapping (X axis)
      // Left edge to left edge
      if (Math.abs(currentLeft - otherLeft) < SNAP_THRESHOLD) {
        snappedX = otherLeft;
        snapX = otherLeft;
      }
      // Right edge to right edge
      else if (Math.abs(currentRight - otherRight) < SNAP_THRESHOLD) {
        snappedX = otherRight - width;
        snapX = otherRight;
      }
      // Left edge to right edge
      else if (Math.abs(currentLeft - otherRight) < SNAP_THRESHOLD) {
        snappedX = otherRight;
        snapX = otherRight;
      }
      // Right edge to left edge
      else if (Math.abs(currentRight - otherLeft) < SNAP_THRESHOLD) {
        snappedX = otherLeft - width;
        snapX = otherLeft;
      }
      // Center to center (X)
      else if (Math.abs(currentCenterX - otherCenterX) < SNAP_THRESHOLD) {
        snappedX = otherCenterX - width / 2;
        snapX = otherCenterX;
      }

      // Vertical snapping (Y axis)
      // Top edge to top edge
      if (Math.abs(currentTop - otherTop) < SNAP_THRESHOLD) {
        snappedY = otherTop;
        snapY = otherTop;
      }
      // Bottom edge to bottom edge
      else if (Math.abs(currentBottom - otherBottom) < SNAP_THRESHOLD) {
        snappedY = otherBottom - height;
        snapY = otherBottom;
      }
      // Top edge to bottom edge
      else if (Math.abs(currentTop - otherBottom) < SNAP_THRESHOLD) {
        snappedY = otherBottom;
        snapY = otherBottom;
      }
      // Bottom edge to top edge
      else if (Math.abs(currentBottom - otherTop) < SNAP_THRESHOLD) {
        snappedY = otherTop - height;
        snapY = otherTop;
      }
      // Center to center (Y)
      else if (Math.abs(currentCenterY - otherCenterY) < SNAP_THRESHOLD) {
        snappedY = otherCenterY - height / 2;
        snapY = otherCenterY;
      }
    }

    return { snappedX, snappedY, snapX, snapY };
  };

  // Handle resize and drag - coordinates are PERCENTAGES (0-100)
  const handleBlockResizeMove = (e: React.MouseEvent) => {
    if (!originalBlock || !isEditMode || !contentRef.current) return;
    
    // Get container dimensions to convert pixels to percentages
    const containerRect = contentRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Convert pixel delta to percentage delta
    const dxPercent = ((e.clientX - dragStart.x) / containerWidth) * 100;
    const dyPercent = ((e.clientY - dragStart.y) / containerHeight) * 100;

    if (resizing) {
      const block = blocks.find(b => b.id === resizing.blockId);
      if (!block) return;

      let newWidth = originalBlock.width;
      let newHeight = originalBlock.height;
      let newX = originalBlock.x;
      let newY = originalBlock.y;

      // East handle: expand width to the right
      if (resizing.corner.includes('e')) {
        newWidth = Math.max(2, originalBlock.width + dxPercent);
      }
      // West handle: expand width to the left
      if (resizing.corner.includes('w')) {
        newWidth = Math.max(2, originalBlock.width - dxPercent);
        newX = originalBlock.x + dxPercent;
      }
      // South handle: expand height downward
      if (resizing.corner.includes('s')) {
        newHeight = Math.max(2, originalBlock.height + dyPercent);
      }
      // North handle: expand height upward
      if (resizing.corner.includes('n')) {
        newHeight = Math.max(2, originalBlock.height - dyPercent);
        newY = originalBlock.y + dyPercent;
      }

      setBlocks(blocks.map(b => 
        b.id === resizing.blockId
          ? { ...b, width: newWidth, height: newHeight, x_position: newX, y_position: newY }
          : b
      ));
      setSnapLines({ x: null, y: null });
    } else if (dragging) {
      const block = blocks.find(b => b.id === dragging.blockId);
      if (!block) return;

      const rawX = originalBlock.x + dxPercent;
      const rawY = originalBlock.y + dyPercent;
      
      // Find snap points (now using percentages)
      const { snappedX, snappedY, snapX, snapY } = findSnapPoints(
        dragging.blockId, 
        rawX, 
        rawY, 
        block.width, 
        block.height
      );

      setBlocks(blocks.map(b => 
        b.id === dragging.blockId 
          ? { ...b, x_position: snappedX, y_position: snappedY }
          : b
      ));
      setSnapLines({ x: snapX, y: snapY });
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
    setSnapLines({ x: null, y: null });
  };

  // Load data
  useEffect(() => {
    loadData();
  }, [siteId]);

  const loadData = async () => {
    setLoading(true);
    setDimensionsLoaded(false);
    setOriginalPdfDimensions({ width: 0, height: 0 });
    try {
      const { data: schematicData, error: schematicError } = await supabase
        .from("site_schematics")
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();

      if (schematicError) throw schematicError;
      if (schematicData) {
        setSchematic({
          ...schematicData,
          detected_regions: Array.isArray(schematicData.detected_regions) 
            ? (schematicData.detected_regions as unknown as DetectedRegion[]) 
            : [],
          calibrated_width: schematicData.calibrated_width,
          calibrated_height: schematicData.calibrated_height,
          is_calibrated: schematicData.is_calibrated,
        });
      } else {
        setSchematic(null);
      }

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

      const newSchematic: Schematic = {
        id: schematicData.id,
        site_id: schematicData.site_id,
        file_name: schematicData.file_name,
        file_url: schematicData.file_url,
        detected_regions: [],
        detection_status: schematicData.detection_status || 'pending',
      };
      setSchematic(newSchematic);
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

  // Handle clicking on schematic to add block with smart snap
  // All coordinates are stored as PERCENTAGES (0-100) for consistent alignment
  const handleSchematicClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingBlock || !schematic || !isEditMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    // Convert click to percentage of container
    const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    // Use calibrated size if available, otherwise use defaults
    const defaultWidthPercent = schematic.calibrated_width ?? 8;
    const defaultHeightPercent = schematic.calibrated_height ?? 12;

    // Skip AI detection entirely - just use calibrated or default size
    let finalWidth = defaultWidthPercent;
    let finalHeight = defaultHeightPercent;

    // Position is ALWAYS centered on click - this is deterministic and reliable
    let finalX = clickXPercent - (finalWidth / 2);
    let finalY = clickYPercent - (finalHeight / 2);
    
    // Clamp to page bounds
    finalX = Math.max(0, Math.min(100 - finalWidth, finalX));
    finalY = Math.max(0, Math.min(100 - finalHeight, finalY));

    const blockNumber = blocks.length + 1;
    const blockIdentifier = `DB-${String(blockNumber).padStart(3, '0')}`;
    
    try {
      const { data, error } = await supabase
        .from("schematic_blocks")
        .insert({
          schematic_id: schematic.id,
          block_identifier: blockIdentifier,
          block_name: null,
          x_position: finalX,
          y_position: finalY,
          width: finalWidth,
          height: finalHeight,
        })
        .select()
        .single();

      if (error) throw error;

      setBlocks([...blocks, data]);
      setSelectedBlock(data);
      setEditForm({
        block_identifier: data.block_identifier,
        block_name: data.block_name || "",
        subsection_id: "",
        width: data.width,
        height: data.height,
      });
      setEditDialogOpen(true);
      setIsAddingBlock(false);
      
      if (schematic.is_calibrated) {
        toast.success("Block placed with calibrated size");
      } else {
        toast.info("Block placed - consider calibrating for accurate sizing");
      }
    } catch (error) {
      console.error("Error adding block:", error);
      toast.error("Failed to add block");
    }
  };

  // Handle clicking a block
  const handleBlockClick = (block: SchematicBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isEditMode && block.subsection_id) {
      // If readOnly with accessToken, navigate to public subsection view
      if (readOnly && accessToken) {
        navigate(`/review/${accessToken}/subsection/${block.subsection_id}`);
      } else if (clientPortalMode) {
        // Authenticated client portal - use client portal routes
        navigate(`/client-portal/subsections/${block.subsection_id}`);
      } else {
        // Admin routes
        const basePath = clientId 
          ? `/clients/${clientId}/sites/${siteId}/subsections/${block.subsection_id}`
          : `/sites/${siteId}/subsections/${block.subsection_id}`;
        navigate(basePath);
      }
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
      setIsEditMode(false);
      setIsAddingBlock(false);
      setIsCalibrating(false);
      setCalibrationStart(null);
      setCalibrationRect(null);
      setScale(1);
    } else {
      setIsEditMode(true);
    }
  };

  // Calibration handlers
  const startCalibration = () => {
    setIsCalibrating(true);
    setIsAddingBlock(false);
    setCalibrationStart(null);
    setCalibrationRect(null);
    toast.info("Draw a rectangle over one distribution board table to calibrate block size");
  };

  // Get the PDF wrapper element (the div with calculatedPageWidth/Height)
  // This accounts for the CSS transform applied in edit mode
  const getPdfWrapperRect = () => {
    // Find the innermost wrapper with explicit width/height
    const wrapper = contentRef.current?.querySelector('div.relative') as HTMLElement;
    return wrapper?.getBoundingClientRect();
  };

  const handleCalibrationMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCalibrating) return;
    
    const rect = getPdfWrapperRect();
    if (!rect) return;
    
    // The rect already accounts for CSS transform scale, so just use it directly
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Only start if click is within PDF bounds
    if (xPercent >= 0 && xPercent <= 100 && yPercent >= 0 && yPercent <= 100) {
      setCalibrationStart({ x: xPercent, y: yPercent });
      setCalibrationRect({ x: xPercent, y: yPercent, width: 0, height: 0 });
    }
  };

  const handleCalibrationMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCalibrating || !calibrationStart) return;
    
    const rect = getPdfWrapperRect();
    if (!rect) return;
    
    // The rect already accounts for CSS transform scale
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Clamp to PDF bounds
    const clampedX = Math.max(0, Math.min(100, xPercent));
    const clampedY = Math.max(0, Math.min(100, yPercent));
    
    const width = Math.abs(clampedX - calibrationStart.x);
    const height = Math.abs(clampedY - calibrationStart.y);
    const x = Math.min(clampedX, calibrationStart.x);
    const y = Math.min(clampedY, calibrationStart.y);
    
    setCalibrationRect({ x, y, width, height });
  };

  const handleCalibrationMouseUp = async () => {
    if (!isCalibrating || !calibrationRect || !schematic) return;
    
    // Minimum size check (at least 1% in each direction)
    if (calibrationRect.width < 1 || calibrationRect.height < 1) {
      toast.error("Rectangle too small - please draw a larger area");
      setCalibrationStart(null);
      setCalibrationRect(null);
      return;
    }
    
    try {
      const { error } = await supabase
        .from("site_schematics")
        .update({
          calibrated_width: calibrationRect.width,
          calibrated_height: calibrationRect.height,
          is_calibrated: true,
        })
        .eq("id", schematic.id);

      if (error) throw error;

      setSchematic({
        ...schematic,
        calibrated_width: calibrationRect.width,
        calibrated_height: calibrationRect.height,
        is_calibrated: true,
      });

      toast.success(`Calibrated! Block size: ${calibrationRect.width.toFixed(1)}% × ${calibrationRect.height.toFixed(1)}%`);
    } catch (error) {
      console.error("Error saving calibration:", error);
      toast.error("Failed to save calibration");
    }
    
    setIsCalibrating(false);
    setCalibrationStart(null);
    setCalibrationRect(null);
  };

  const clearCalibration = async () => {
    if (!schematic) return;
    
    try {
      const { error } = await supabase
        .from("site_schematics")
        .update({
          calibrated_width: null,
          calibrated_height: null,
          is_calibrated: false,
        })
        .eq("id", schematic.id);

      if (error) throw error;

      setSchematic({
        ...schematic,
        calibrated_width: null,
        calibrated_height: null,
        is_calibrated: false,
      });

      toast.success("Calibration cleared");
    } catch (error) {
      console.error("Error clearing calibration:", error);
      toast.error("Failed to clear calibration");
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
            {readOnly 
              ? "No schematic diagram has been uploaded for this site yet."
              : "Upload a schematic distribution diagram to visualize the electrical layout"
            }
          </CardDescription>
        </CardHeader>
        {!readOnly && (
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
        )}
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
            {/* Calibration button - prominently shown if not calibrated */}
            {!schematic.is_calibrated ? (
              <Button
                variant={isCalibrating ? "secondary" : "default"}
                size="sm"
                onClick={isCalibrating ? () => setIsCalibrating(false) : startCalibration}
                className={!isCalibrating ? "animate-pulse" : ""}
              >
                <ScanSearch className="h-4 w-4 mr-1" />
                {isCalibrating ? "Cancel Calibration" : "Calibrate Block Size"}
              </Button>
            ) : (
              <>
                <Button
                  variant={isAddingBlock ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => { setIsAddingBlock(!isAddingBlock); setIsCalibrating(false); }}
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
              </>
            )}

            <div className="h-4 w-px bg-border mx-1" />

            {/* Calibration status indicator */}
            {schematic.is_calibrated ? (
              <div className="flex items-center gap-1.5 text-xs">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  ✓ Calibrated: {schematic.calibrated_width?.toFixed(1)}% × {schematic.calibrated_height?.toFixed(1)}%
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startCalibration}
                  className="h-6 px-2 text-xs"
                >
                  Recalibrate
                </Button>
              </div>
            ) : isCalibrating ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <span>Draw a rectangle over a distribution board table</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>⚠️ Not calibrated - block sizes may be inaccurate</span>
              </div>
            )}

            <div className="flex-1" />

            {/* Zoom controls */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Zoom: {Math.round(scale * 100)}%</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2"
                onClick={() => setScale(1)}
                disabled={scale === 1}
              >
                Reset
              </Button>
              <span className="hidden md:inline text-muted-foreground/70">
                Scroll to zoom • Shift+drag or right-click to pan
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteSchematic}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Schematic Viewer - Fixed Height */}
      <CardContent className="p-0 relative">
        {/* Controls Overlay - Visible when not editing */}
        {!isEditMode && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {/* Zoom indicator and reset */}
            <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 shadow-md text-xs">
              <span className="text-muted-foreground">{Math.round(scale * 100)}%</span>
              {scale !== 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => { setScale(1); setPanOffset({ x: 0, y: 0 }); }}
                >
                  Reset
                </Button>
              )}
            </div>
            
            {!readOnly && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleEditMode}
                  className="shadow-md"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="shadow-md px-2">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={loadData}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reload Schematic
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <label htmlFor="schematic-replace" className="flex items-center cursor-pointer">
                        <Replace className="h-4 w-4 mr-2" />
                        Replace PDF
                      </label>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleDeleteSchematic}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Schematic
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Hidden file input for replace */}
                <input
                  id="schematic-replace"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </>
            )}
          </div>
        )}
        
        {/* Pan/Zoom hint - visible when viewing */}
        {!isEditMode && scale === 1 && (
          <div className="absolute bottom-3 left-3 z-10 text-xs text-muted-foreground/70 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
            Scroll to zoom • Shift+drag to pan
          </div>
        )}
        
        <div 
          ref={containerRef}
          className={`relative bg-muted/30 overflow-auto ${
            isEditMode 
              ? `${isCalibrating ? 'cursor-crosshair' : isAddingBlock ? 'cursor-crosshair' : isShiftPressed || isPanning ? 'cursor-grabbing' : 'cursor-default'}`
              : `${isPanning ? 'cursor-grabbing' : scale > 1 ? 'cursor-grab' : 'cursor-default'}`
          }`}
          style={{ height: containerHeight }}
          onMouseDown={(e) => {
            if (isCalibrating) {
              handleCalibrationMouseDown(e);
            } else {
              handleMouseDown(e);
            }
          }}
          onAuxClick={handleAuxClick}
          onMouseMove={(e) => {
            if (isCalibrating && calibrationStart) {
              handleCalibrationMouseMove(e);
            } else {
              handleMouseMove(e);
              if (isEditMode && (resizing || dragging)) handleBlockResizeMove(e);
            }
          }}
          onMouseUp={(e) => {
            if (isCalibrating && calibrationStart) {
              handleCalibrationMouseUp();
            } else {
              handleMouseUp(e);
              if (isEditMode && (resizing || dragging)) handleBlockResizeEnd();
            }
          }}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheelZoom}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div 
            ref={contentRef}
            className="relative"
            onClick={isEditMode && !isCalibrating ? handleSchematicClick : undefined}
            style={{
              // Pan via translate, zoom via CSS scale
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
              transformOrigin: 'top left',
              width: 'fit-content',
              margin: '24px',
              position: 'relative',
              cursor: isPanning ? 'grabbing' : ((!isEditMode && scale > 1) || isShiftPressed ? 'grab' : 'default'),
            }}
          >
            {/* PDF and blocks wrapper - positioned relative for block overlay */}
            <div 
              className="relative"
              style={{
                width: calculatedPageWidth,
                height: calculatedPageHeight,
              }}
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
                  width={calculatedPageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onRenderSuccess={handlePageRenderSuccess}
                />
              </Document>

              {/* Render blocks - using percentage-based positioning for consistent alignment */}
              {blocks.map(block => {
                const isLinked = !!block.subsection_id;
                const photos = getAssetPhotos(block.subsection_id);
                const hasPhotos = photos && (photos.meterImage || photos.ctRatioImage || photos.breakerImage);

                // Block positions are stored as percentages (0-100)
                // Use CSS % positioning for resolution-independent alignment

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
                      left: `${block.x_position}%`,
                      top: `${block.y_position}%`,
                      width: `${block.width}%`,
                      height: `${block.height}%`,
                      cursor: isEditMode 
                        ? (dragging?.blockId === block.id ? 'grabbing' : 'grab')
                        : (isLinked ? 'pointer' : 'default'),
                    }}
                    onMouseDown={(e) => isEditMode && handleBlockDragStart(e, block.id)}
                    onClick={(e) => {
                      if (!dragging && !resizing) handleBlockClick(block, e);
                    }}
                  >
                  {/* Block label - show subsection name if linked, otherwise block identifier */}
                  <p className="text-[10px] font-bold text-foreground/80 pointer-events-none text-center px-1 truncate w-full">
                    {block.subsection_id 
                      ? subsections.find(s => s.id === block.subsection_id)?.name || block.block_identifier
                      : block.block_identifier}
                  </p>

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

              {/* Snap guide lines - using percentage positioning */}
              {/* Snap lines for block alignment */}
              {isEditMode && dragging && (
                <>
                  {snapLines.x !== null && (
                    <div 
                      className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none z-40"
                      style={{ left: `${snapLines.x}%` }}
                    />
                  )}
                  {snapLines.y !== null && (
                    <div 
                      className="absolute left-0 right-0 h-px bg-primary pointer-events-none z-40"
                      style={{ top: `${snapLines.y}%` }}
                    />
                  )}
                </>
              )}

              {/* Calibration rectangle overlay */}
              {isCalibrating && calibrationRect && calibrationRect.width > 0 && (
                <div 
                  className="absolute border-2 border-dashed border-amber-500 bg-amber-500/20 pointer-events-none z-50"
                  style={{
                    left: `${calibrationRect.x}%`,
                    top: `${calibrationRect.y}%`,
                    width: `${calibrationRect.width}%`,
                    height: `${calibrationRect.height}%`,
                  }}
                >
                  <div className="absolute -top-6 left-0 bg-amber-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                    {calibrationRect.width.toFixed(1)}% × {calibrationRect.height.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
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

        {/* Legend - Only visible in Edit Mode */}
        {isEditMode && (
          <div className="px-6 py-2 border-t bg-muted/30 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded border-2 border-primary bg-primary/20" />
              <span>Linked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded border-2 border-destructive bg-destructive/20" />
              <span>Not linked</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {schematic.is_calibrated ? (
                <span>Calibrated block size: {schematic.calibrated_width?.toFixed(1)}% × {schematic.calibrated_height?.toFixed(1)}%</span>
              ) : (
                <span className="text-amber-600">⚠️ Click "Calibrate Block Size" to set accurate block dimensions</span>
              )}
            </div>
          </div>
        )}
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

      {/* Fullscreen Image Viewer Modal */}
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

export default SchematicDiagram;
