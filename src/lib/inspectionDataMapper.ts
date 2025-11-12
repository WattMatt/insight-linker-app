/**
 * Utility to map inspection json_data between numeric and string key formats
 * Handles legacy numeric format (e.g., json_data["0"]["1"]) and 
 * modern string format (e.g., json_data["sectionId"]["itemId"])
 */

export interface InspectionTemplate {
  sections: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      name: string;
      [key: string]: any;
    }>;
  }>;
}

/**
 * Maps inspection json_data to consistent string key format
 * @param rawJsonData - Raw json_data from database (may be numeric or string keys)
 * @param template - Inspection template with sections and items
 * @returns Mapped data with string keys matching template structure
 */
export const mapInspectionData = (
  rawJsonData: any,
  template: InspectionTemplate | null
): any => {
  if (!rawJsonData || typeof rawJsonData !== 'object') {
    return {};
  }

  // Check if data is in numeric format by looking for numeric keys at top level
  const topLevelKeys = Object.keys(rawJsonData);
  const isNumericFormat = topLevelKeys.some(key => !isNaN(Number(key)));

  console.log('🔍 Data format:', isNumericFormat ? 'NUMERIC' : 'STRING KEYS');
  console.log('🔍 RAW json_data keys:', topLevelKeys);

  // If data already uses string keys, return as-is
  if (!isNumericFormat) {
    console.log('✅ Using string key data directly');
    return rawJsonData;
  }

  // Data uses numeric indices - need template to map to string keys
  if (!template || !Array.isArray(template.sections)) {
    console.warn('⚠️ Numeric format detected but no template available for mapping');
    return rawJsonData; // Return as-is if no template
  }

  // Map numeric indices to string keys using template
  const mappedData: any = {};

  template.sections.forEach((section, sectionIndex) => {
    const sectionId = section.id;
    const sectionItems = section.items || [];

    mappedData[sectionId] = {};

    if (Array.isArray(sectionItems)) {
      sectionItems.forEach((item, itemIndex) => {
        const itemId = item.id;

        // Look up data using numeric indices: json_data["0"]["0"]
        const numericSectionData = rawJsonData?.[sectionIndex.toString()];
        const itemData = numericSectionData?.[itemIndex.toString()];

        if (itemData && typeof itemData === 'object') {
          mappedData[sectionId][itemId] = itemData;
          console.log(`✅ Mapped [${sectionIndex}][${itemIndex}] → [${sectionId}][${itemId}]`);
        } else {
          // Initialize empty to maintain structure
          mappedData[sectionId][itemId] = {};
        }
      });
    }
  });

  console.log('✅ Mapped data to string keys');
  return mappedData;
};

/**
 * Safely extracts general info from inspection data
 * Works with both mapped and unmapped data
 */
export const extractGeneralInfo = (inspectionData: any): any => {
  // Try different possible locations for general info
  return (
    inspectionData?.jsonData?.generalInfo ||
    inspectionData?.generalInfo ||
    {}
  );
};
