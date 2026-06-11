import { useCallback } from 'react';
import { useOfflineSync } from './useOfflineSync';
import { 
  saveOfflinePin,
  getOfflinePin,
  getFloorPlanPins,
  deleteOfflinePin,
  saveMarkup,
  getFloorPlanMarkups,
  deleteMarkup,
  saveMeasurement,
  getFloorPlanMeasurements,
  deleteMeasurement
} from '@/lib/offlineFloorPlanDB';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { OfflineFloorPlanPin, OfflineMarkup, OfflineMeasurement } from '@/lib/offlineDB';

interface PinData {
  pin_type: 'snag' | 'observation';
  title: string;
  notes: string;
  detailed_description?: string;
  priority?: string;
  status: string;
  assigned_contractor?: string;
  stakeholders?: string;
  package?: string;
  due_date?: string;
  photo_url?: string;
}

export function useOfflineFloorPlanAnnotations() {
  const { isOnline, queueMutation } = useOfflineSync();

  const addPin = useCallback(async (
    floorPlanId: string,
    x: number,
    y: number,
    pinNumber: number,
    userId: string
  ) => {
    const pinId = `offline_pin_${Date.now()}_${Math.random()}`;
    
    if (isOnline) {
      try {
        const { data, error } = await supabase
          .from('floor_plan_pins')
          .insert({
            floor_plan_id: floorPlanId,
            pin_number: pinNumber,
            x_position: x,
            y_position: y,
            pin_type: 'snag',
            status: 'open',
            created_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Online pin creation failed, falling back to offline:', error);
      }
    }

    // Offline mode
    const offlinePin: OfflineFloorPlanPin = {
      id: pinId,
      floor_plan_id: floorPlanId,
      pin_number: pinNumber,
      x_position: x,
      y_position: y,
      pin_type: 'snag',
      title: null,
      notes: null,
      detailed_description: null,
      priority: null,
      status: 'open',
      assigned_contractor: null,
      stakeholders: null,
      package: null,
      due_date: null,
      photo_url: null,
      photo_blob: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      synced: false,
    };

    await saveOfflinePin(offlinePin);
    queueMutation('ADD_FLOOR_PLAN_PIN', { pin: offlinePin, floorPlanId });
    toast.success('Pin saved offline. Will sync when online.');
    return offlinePin;
  }, [isOnline, queueMutation]);

  const updatePin = useCallback(async (
    pinId: string,
    updates: PinData,
    photo?: File
  ) => {
    if (isOnline) {
      try {
        let photoUrl = updates.photo_url;

        // Upload photo if provided
        if (photo) {
          const fileName = `floor-plan-pins/${pinId}/${Date.now()}_${photo.name}`;
          const { error: uploadError } = await supabase.storage
            .from('inspection-photos')
            .upload(fileName, photo);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('inspection-photos')
            .getPublicUrl(fileName);

          photoUrl = publicUrl;
        }

        const { error } = await supabase
          .from('floor_plan_pins')
          .update({
            ...updates,
            photo_url: photoUrl,
          })
          .eq('id', pinId);

        if (error) throw error;
        toast.success('Pin updated successfully');
        return;
      } catch (error) {
        console.error('Online update failed, falling back to offline:', error);
      }
    }

    // Offline mode - save to IndexedDB
    const pin = await getOfflinePin(pinId);
    if (!pin) {
      toast.error('Pin not available offline');
      return;
    }

    const updatedPin: OfflineFloorPlanPin = {
      ...pin,
      ...updates,
      photo_blob: photo || pin.photo_blob,
      synced: false,
    };

    await saveOfflinePin(updatedPin);
    // Pass photoFileName separately: the File is externalized to queue_blobs as a bare
    // Blob (loses .name), so the flush handler builds the storage path from this instead.
    queueMutation('UPDATE_FLOOR_PLAN_PIN', { pinId, updates, photo, photoFileName: photo?.name });
    toast.success('Pin updated offline. Will sync when online.');
  }, [isOnline, queueMutation]);

  const deletePin = useCallback(async (pinId: string) => {
    if (isOnline) {
      try {
        const { error } = await supabase
          .from('floor_plan_pins')
          .delete()
          .eq('id', pinId);

        if (error) throw error;
        toast.success('Pin deleted successfully');
        return;
      } catch (error) {
        console.error('Online delete failed, falling back to offline:', error);
      }
    }

    // Offline mode
    await deleteOfflinePin(pinId);
    queueMutation('DELETE_FLOOR_PLAN_PIN', { pinId });
    toast.success('Pin deleted offline. Will sync when online.');
  }, [isOnline, queueMutation]);

  const addMarkup = useCallback(async (
    floorPlanId: string,
    markupType: OfflineMarkup['markup_type'],
    vectorData: any,
    color: string = '#ef4444',
    strokeWidth: number = 2
  ) => {
    const markupId = `offline_markup_${Date.now()}_${Math.random()}`;
    
    const markup: OfflineMarkup = {
      id: markupId,
      floor_plan_id: floorPlanId,
      markup_type: markupType,
      vector_data: JSON.stringify(vectorData),
      color,
      stroke_width: strokeWidth,
      created_at: new Date().toISOString(),
      synced: !isOnline,
    };

    await saveMarkup(markup);
    
    if (isOnline) {
      queueMutation('ADD_MARKUP', { markup, floorPlanId });
    }
    
    toast.success(isOnline ? 'Markup saved' : 'Markup saved offline. Will sync when online.');
    return markup;
  }, [isOnline, queueMutation]);

  const removeMarkup = useCallback(async (markupId: string) => {
    await deleteMarkup(markupId);
    
    if (isOnline) {
      queueMutation('DELETE_MARKUP', { markupId });
    }
    
    toast.success('Markup removed');
  }, [isOnline, queueMutation]);

  const addMeasurement = useCallback(async (
    floorPlanId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    value: number,
    unit: string = 'm',
    label?: string
  ) => {
    const measurementId = `offline_measurement_${Date.now()}_${Math.random()}`;
    
    const measurement: OfflineMeasurement = {
      id: measurementId,
      floor_plan_id: floorPlanId,
      start_x: startX,
      start_y: startY,
      end_x: endX,
      end_y: endY,
      value,
      unit,
      label: label || null,
      created_at: new Date().toISOString(),
      synced: !isOnline,
    };

    await saveMeasurement(measurement);
    
    if (isOnline) {
      queueMutation('ADD_MEASUREMENT', { measurement, floorPlanId });
    }
    
    toast.success(isOnline ? 'Measurement saved' : 'Measurement saved offline. Will sync when online.');
    return measurement;
  }, [isOnline, queueMutation]);

  const removeMeasurement = useCallback(async (measurementId: string) => {
    await deleteMeasurement(measurementId);
    
    if (isOnline) {
      queueMutation('DELETE_MEASUREMENT', { measurementId });
    }
    
    toast.success('Measurement removed');
  }, [isOnline, queueMutation]);

  const getOfflineAnnotations = useCallback(async (floorPlanId: string) => {
    try {
      const [pins, markups, measurements] = await Promise.all([
        getFloorPlanPins(floorPlanId),
        getFloorPlanMarkups(floorPlanId),
        getFloorPlanMeasurements(floorPlanId),
      ]);

      return { pins, markups, measurements };
    } catch (error) {
      console.error('Error loading offline annotations:', error);
      return { pins: [], markups: [], measurements: [] };
    }
  }, []);

  return {
    addPin,
    updatePin,
    deletePin,
    addMarkup,
    removeMarkup,
    addMeasurement,
    removeMeasurement,
    getOfflineAnnotations,
    isOnline,
  };
}
