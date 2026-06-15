import React from "react";
import { Badge } from "@/components/ui/badge";

interface TemplateSection {
  id: string;
  name: string;
  order_index: number;
  items?: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
}

interface Tenant {
  id: string;
  shopNumber: string;
  shopName: string;
  breakerSize: string;
  breakerImage: string;
  ctSizeAndRatio: string;
  ctRatioImage: string;
}

interface InspectionTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sections_count: number;
  pages_count: number;
  sections?: TemplateSection[];
  tenants?: Tenant[];
  cover_page?: {
    title: string;
    subtitle: string;
    company_name: string;
    logo_url?: string;
  };
}

interface TemplatePreviewRendererProps {
  template: InspectionTemplate;
}

// Category-specific mock data generators
const getMockDataForCategory = (category: string, templateName: string) => {
  const baseData = {
    projectName: 'Evaton Mall',
    inspectorName: 'John Smith',
    clientRep: 'Mike Johnson',
    consultant: 'ABC Consulting',
    contractor: 'XYZ Electrical',
    location: 'Golden Highway, Evaton West',
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };

  switch (category) {
    case 'Medium Voltage':
      return {
        ...baseData,
        equipmentSerial: 'MV-2024-001',
        voltageRating: '11kV',
        currentRating: '630A',
        manufacturer: 'ABB',
        modelNumber: 'RMU-24',
        installationDate: '2024-01-15',
        testResults: {
          insulationResistance: '>1000MΩ',
          hiPotTest: 'PASS',
          contactResistance: '<50µΩ',
          operatingMechanism: 'PASS',
        },
      };
    case 'Low Voltage':
      return {
        ...baseData,
        boardDesignation: 'EMB-01',
        maxDemand: '400A',
        supplyVoltage: '400V 3-Phase',
        earthingSystem: 'TN-S',
        protectionType: 'MCCB/MCB',
        testResults: {
          earthContinuity: 'PASS',
          insulationResistance: '>1MΩ',
          polarity: 'Correct',
          rcdTrip: '28ms @ 30mA',
        },
        tenantCount: 24,
      };
    case 'Generator':
      return {
        ...baseData,
        gensetModel: 'Caterpillar C15',
        kvaRating: '500kVA',
        fuelType: 'Diesel',
        engineSerial: 'ENG-2024-001',
        alternatorSerial: 'ALT-2024-001',
        testResults: {
          loadBank: '100% @ 4hrs',
          transferTime: '<10s',
          frequencyStability: '±0.5Hz',
          voltageRegulation: '±2%',
        },
      };
    case 'Solar':
      return {
        ...baseData,
        systemSize: '100kWp',
        panelCount: 250,
        inverterModel: 'SMA Sunny Tripower',
        panelType: 'JA Solar JAM72S30-545',
        installationType: 'Rooftop',
        testResults: {
          stringVoltage: '580-620V',
          insulationResistance: '>1MΩ',
          earthBondTest: 'PASS',
          commissioningYield: '4.2kWh/kWp',
        },
      };
    case 'Progress':
      return {
        ...baseData,
        reportPeriod: 'Week 12',
        overallProgress: '65%',
        milestones: [
          { name: 'Foundation Work', progress: 100, status: 'Complete' },
          { name: 'Structural Steel', progress: 85, status: 'In Progress' },
          { name: 'Electrical First Fix', progress: 45, status: 'In Progress' },
          { name: 'Mechanical Install', progress: 30, status: 'In Progress' },
        ],
        issues: 2,
        delays: '3 days',
      };
    case 'Site Drawing':
      return {
        ...baseData,
        drawingNumber: 'DWG-2024-001',
        revision: 'Rev C',
        scale: '1:100',
        areas: ['Level 1', 'Level 2', 'Basement'],
        annotations: 45,
        defectsMarked: 12,
      };
    default:
      return {
        ...baseData,
        meterSerial: 'MTR-2024-001',
        ctRatio: '200/5A',
        meterType: 'EDMI Mk10E',
        readingAtCommission: '00000.00',
      };
  }
};

// Field renderer based on type and category
const renderField = (item: { id: string; name: string; type: string; options?: string[] }, category: string, index: number) => {
  const getStatusColor = (status: string) => {
    if (status === 'Pass' || status === 'Complete') return 'bg-green-50 text-green-800';
    if (status === 'Fail' || status === 'Critical') return 'bg-red-50 text-red-800';
    if (status === 'N/A') return 'bg-gray-50 text-gray-800';
    return 'bg-yellow-50 text-yellow-800';
  };

  // Get mock value based on field type and category
  const getMockValue = () => {
    const mockValues: Record<string, string[]> = {
      'Medium Voltage': ['PASS', '11kV', '>1000MΩ', 'ABB RMU-24', 'Operational'],
      'Low Voltage': ['PASS', '400V', '>1MΩ', '28ms', 'Correct'],
      'Generator': ['PASS', '500kVA', '100%', '<10s', 'Operational'],
      'Solar': ['PASS', '580V', '4.2kWh/kWp', 'Operational', 'Connected'],
      'Progress': ['Complete', 'In Progress', 'Pending', '85%', 'On Track'],
      'Site Drawing': ['Verified', 'Marked', 'Reviewed', 'Approved', 'Pending'],
      'General': ['Pass', 'N/A', 'Compliant', 'Verified', 'Operational'],
    };
    const values = mockValues[category] || mockValues['General'];
    return values[index % values.length];
  };

  switch (item.type) {
    case 'checklist':
    case 'checkbox':
      const status = getMockValue();
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">Status:</span>
            <span className={`text-xs px-3 py-1 rounded ${getStatusColor(status)}`}>
              {status}
            </span>
          </div>
          <div className="text-xs text-gray-600">
            Notes: {category === 'Medium Voltage' ? 'Tested at rated voltage, all parameters within specification.' :
                   category === 'Generator' ? 'Engine started on first attempt, load test completed successfully.' :
                   category === 'Solar' ? 'String voltage within expected range, no shading issues observed.' :
                   'Inspection completed as per specification.'}
          </div>
        </div>
      );

    case 'text':
    case 'number':
      return (
        <div className="text-xs text-gray-800">
          <span className="font-medium">Value: </span>
          {category === 'Medium Voltage' ? '11kV / 630A' :
           category === 'Low Voltage' ? '400V / 200A' :
           category === 'Generator' ? '500kVA @ 0.8pf' :
           category === 'Solar' ? '100kWp DC' :
           'Sample value'}
        </div>
      );

    case 'textarea':
      return (
        <div className="text-xs text-gray-600 space-y-1">
          <div className="font-medium text-gray-700">Notes:</div>
          <div className="bg-gray-50 p-2 rounded border">
            {category === 'Medium Voltage' ? 
              'Equipment tested in accordance with SANS 10142-1. All switching operations performed successfully. Oil levels checked and within specification. No visible damage or deterioration observed.' :
             category === 'Generator' ? 
              'Load bank test completed for 4 hours at 100% load. Fuel consumption within manufacturer specifications. Automatic transfer switch (ATS) response time measured at 8.5 seconds.' :
             category === 'Solar' ? 
              'All strings tested for open circuit voltage and short circuit current. DC isolators and surge protection verified. AC side commissioning completed with utility meter registration confirmed.' :
             'Inspection notes and observations documented here. All items verified against project specifications and client requirements.'}
          </div>
        </div>
      );

    case 'image':
      return (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-gray-700">Photo Evidence:</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-20 flex flex-col items-center justify-center rounded">
              <div className="text-gray-400 text-center text-[10px]">
                <div className="font-semibold">{category === 'Medium Voltage' ? 'EQUIPMENT' : category === 'Solar' ? 'PANEL ARRAY' : 'PHOTO 1'}</div>
                <div>Before</div>
              </div>
            </div>
            <div className="border-2 border-dashed border-gray-300 bg-gray-50 h-20 flex flex-col items-center justify-center rounded">
              <div className="text-gray-400 text-center text-[10px]">
                <div className="font-semibold">{category === 'Medium Voltage' ? 'NAMEPLATE' : category === 'Solar' ? 'INVERTER' : 'PHOTO 2'}</div>
                <div>After</div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'select':
      return (
        <div className="text-xs">
          <span className="font-medium text-gray-700">Selected: </span>
          <Badge variant="secondary" className="text-xs">
            {item.options?.[0] || getMockValue()}
          </Badge>
        </div>
      );

    default:
      return (
        <div className="text-xs text-gray-500 italic">
          Field type: {item.type}
        </div>
      );
  }
};

// Category-specific summary sections
const renderCategorySummary = (category: string, mockData: any) => {
  switch (category) {
    case 'Medium Voltage':
      return (
        <div className="border border-gray-300 p-4 mb-4">
          <h3 className="font-bold text-sm mb-3 text-gray-900 border-b pb-2">Equipment Summary</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div className="flex justify-between"><span className="font-medium">Serial No:</span> <span>{mockData.equipmentSerial}</span></div>
            <div className="flex justify-between"><span className="font-medium">Voltage Rating:</span> <span>{mockData.voltageRating}</span></div>
            <div className="flex justify-between"><span className="font-medium">Current Rating:</span> <span>{mockData.currentRating}</span></div>
            <div className="flex justify-between"><span className="font-medium">Manufacturer:</span> <span>{mockData.manufacturer}</span></div>
          </div>
        </div>
      );
    
    case 'Generator':
      return (
        <div className="border border-gray-300 p-4 mb-4">
          <h3 className="font-bold text-sm mb-3 text-gray-900 border-b pb-2">Generator Details</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div className="flex justify-between"><span className="font-medium">Model:</span> <span>{mockData.gensetModel}</span></div>
            <div className="flex justify-between"><span className="font-medium">Rating:</span> <span>{mockData.kvaRating}</span></div>
            <div className="flex justify-between"><span className="font-medium">Fuel Type:</span> <span>{mockData.fuelType}</span></div>
            <div className="flex justify-between"><span className="font-medium">Engine S/N:</span> <span>{mockData.engineSerial}</span></div>
          </div>
        </div>
      );

    case 'Solar':
      return (
        <div className="border border-gray-300 p-4 mb-4">
          <h3 className="font-bold text-sm mb-3 text-gray-900 border-b pb-2">System Overview</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div className="flex justify-between"><span className="font-medium">System Size:</span> <span>{mockData.systemSize}</span></div>
            <div className="flex justify-between"><span className="font-medium">Panel Count:</span> <span>{mockData.panelCount}</span></div>
            <div className="flex justify-between"><span className="font-medium">Inverter:</span> <span>{mockData.inverterModel}</span></div>
            <div className="flex justify-between"><span className="font-medium">Installation:</span> <span>{mockData.installationType}</span></div>
          </div>
        </div>
      );

    case 'Progress':
      return (
        <div className="border border-gray-300 p-4 mb-4">
          <h3 className="font-bold text-sm mb-3 text-gray-900 border-b pb-2">Progress Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium">Overall Progress:</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: mockData.overallProgress }}></div>
                </div>
                <span className="font-bold">{mockData.overallProgress}</span>
              </div>
            </div>
            <div className="space-y-2">
              {mockData.milestones?.map((m: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span>{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      m.status === 'Complete' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>{m.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'Low Voltage':
      return (
        <div className="border border-gray-300 p-4 mb-4">
          <h3 className="font-bold text-sm mb-3 text-gray-900 border-b pb-2">Board Details</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div className="flex justify-between"><span className="font-medium">Designation:</span> <span>{mockData.boardDesignation}</span></div>
            <div className="flex justify-between"><span className="font-medium">Max Demand:</span> <span>{mockData.maxDemand}</span></div>
            <div className="flex justify-between"><span className="font-medium">Supply:</span> <span>{mockData.supplyVoltage}</span></div>
            <div className="flex justify-between"><span className="font-medium">Earthing:</span> <span>{mockData.earthingSystem}</span></div>
          </div>
        </div>
      );

    default:
      return null;
  }
};

// Test results section for technical categories
const renderTestResults = (category: string, mockData: any) => {
  if (!mockData.testResults) return null;

  return (
    <div className="border border-gray-300 p-4 mb-4">
      <h3 className="font-bold text-sm mb-3 text-gray-900 border-b pb-2">Test Results</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left p-2 font-semibold">Test</th>
            <th className="text-left p-2 font-semibold">Result</th>
            <th className="text-center p-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(mockData.testResults).map(([key, value]: [string, any], i) => (
            <tr key={i} className="border-b">
              <td className="p-2 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</td>
              <td className="p-2">{value}</td>
              <td className="p-2 text-center">
                <Badge variant="outline" className="bg-green-50 text-green-700 text-[10px]">PASS</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const TemplatePreviewRenderer: React.FC<TemplatePreviewRendererProps> = ({ template }) => {
  const mockData = getMockDataForCategory(template.category, template.name);
  
  // Category-specific accent colors
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Medium Voltage': '#dc2626', // Red for high voltage
      'Low Voltage': '#2563eb',    // Blue
      'Generator': '#16a34a',      // Green
      'Solar': '#ea580c',          // Orange
      'Progress': '#7c3aed',       // Purple
      'Site Drawing': '#0891b2',   // Cyan
      'General': '#2980b9',        // Default blue
    };
    return colors[category] || colors['General'];
  };

  const accentColor = getCategoryColor(template.category);

  return (
    <div className="space-y-4 pb-4">
      {/* Cover Page */}
      <div className="bg-white aspect-[210/297] border shadow-lg relative">
        <div style={{ backgroundColor: accentColor }} className="h-3 w-full"></div>
        
        {/* Category badge */}
        <div className="absolute top-6 right-6">
          <Badge style={{ backgroundColor: accentColor }} className="text-white text-[10px]">
            {template.category}
          </Badge>
        </div>
        
        {/* Logo placeholder */}
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 border-2 border-gray-300 w-24 h-12 flex items-center justify-center">
          <span className="text-[10px] text-gray-400">COMPANY LOGO</span>
        </div>
        
        <div className="pt-24 px-12 flex flex-col items-center">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">{template.name}</h1>
          
          <div className="bg-gray-50 w-full py-3 text-center mb-6">
            <p className="text-sm text-gray-700">{template.cover_page?.subtitle || template.category}</p>
          </div>
          
          {/* Information box */}
          <div className="border border-gray-300 w-full p-4 space-y-2 text-xs">
            <div className="flex"><span className="font-bold w-28">Project:</span><span>{mockData.projectName}</span></div>
            <div className="flex"><span className="font-bold w-28">Report Date:</span><span>{mockData.date}</span></div>
            <div className="flex"><span className="font-bold w-28">Inspector:</span><span>{mockData.inspectorName}</span></div>
            <div className="flex"><span className="font-bold w-28">Location:</span><span>{mockData.location}</span></div>
            <div className="flex"><span className="font-bold w-28">Client Rep:</span><span>{mockData.clientRep}</span></div>
            <div className="flex"><span className="font-bold w-28">Contractor:</span><span>{mockData.contractor}</span></div>
          </div>
        </div>
        
        {/* Bottom section */}
        <div className="absolute bottom-10 left-0 right-0 px-12">
          <div className="border-t border-gray-300 pt-3 text-center">
            <p className="font-bold text-gray-900 text-xs">{template.cover_page?.company_name || 'Watson Mattheus'}</p>
            <p className="text-[10px] text-gray-600 mt-1">{template.category} Inspection Report</p>
          </div>
        </div>
        
        <div style={{ backgroundColor: accentColor }} className="h-3 w-full absolute bottom-0"></div>
      </div>

      {/* General Information Page */}
      <div className="bg-white aspect-[210/297] p-6 border shadow-lg relative">
        <div className="bg-gray-100 -mx-6 px-6 py-2 mb-4">
          <h2 className="text-base font-bold text-center">General Information</h2>
        </div>
        
        <div className="space-y-2 text-xs mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex"><span className="font-bold w-36">PROJECT NAME:</span><span>{mockData.projectName}</span></div>
            <div className="flex"><span className="font-bold w-36">INSPECTION DATE:</span><span>{mockData.date}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex"><span className="font-bold w-36">INSPECTOR:</span><span>{mockData.inspectorName}</span></div>
            <div className="flex"><span className="font-bold w-36">CLIENT REP:</span><span>{mockData.clientRep}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex"><span className="font-bold w-36">CONSULTANT:</span><span>{mockData.consultant}</span></div>
            <div className="flex"><span className="font-bold w-36">CONTRACTOR:</span><span>{mockData.contractor}</span></div>
          </div>
          <div className="flex"><span className="font-bold w-36">LOCATION:</span><span>{mockData.location}</span></div>
        </div>

        {/* Category-specific summary */}
        {renderCategorySummary(template.category, mockData)}
        
        {/* Test results for technical categories */}
        {renderTestResults(template.category, mockData)}
        
        <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-gray-500">
          {template.name} - Page 1
        </div>
      </div>

      {/* Section Pages */}
      {Array.isArray(template.sections) && template.sections.length > 0 ? (
        template.sections.map((section, sectionIdx) => (
          <div key={`section-${section.id}`} className="bg-white aspect-[210/297] p-6 border shadow-lg relative">
            <div style={{ backgroundColor: accentColor }} className="text-white -mx-6 px-6 py-2 mb-4">
              <h2 className="text-sm font-bold text-center uppercase">{section.name}</h2>
            </div>
            
            <div className="space-y-3">
              {section.items?.map((item, itemIdx) => (
                <div key={item.id} className="border border-gray-300 p-3">
                  <div className="font-bold text-xs mb-2 text-gray-900 flex items-center gap-2">
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px]">{itemIdx + 1}</span>
                    {item.name}
                    {item.required && <span className="text-red-500 text-[10px]">*</span>}
                  </div>
                  {renderField(item, template.category, itemIdx)}
                </div>
              ))}
              
              {(!section.items || section.items.length === 0) && (
                <div className="text-center text-gray-400 py-8 text-sm">
                  No fields defined for this section
                </div>
              )}
            </div>
            
            <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-gray-500">
              {template.name} - Page {sectionIdx + 2}
            </div>
          </div>
        ))
      ) : (
        <div className="bg-white aspect-[210/297] p-6 border shadow-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-base font-semibold mb-2">No Sections Defined</p>
            <p className="text-xs">Edit this template to add sections and fields.</p>
          </div>
        </div>
      )}

      {/* Tenants Page (for Low Voltage board templates) */}
      {template.tenants && template.tenants.length > 0 && (
        <div className="bg-white aspect-[210/297] p-6 border shadow-lg relative">
          <div style={{ backgroundColor: accentColor }} className="text-white -mx-6 px-6 py-2 mb-4">
            <h2 className="text-sm font-bold text-center uppercase">Tenant / Circuit Information</h2>
          </div>
          
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left font-semibold">#</th>
                <th className="border p-2 text-left font-semibold">Shop No.</th>
                <th className="border p-2 text-left font-semibold">Tenant Name</th>
                <th className="border p-2 text-left font-semibold">Breaker</th>
                <th className="border p-2 text-left font-semibold">CT Ratio</th>
              </tr>
            </thead>
            <tbody>
              {template.tenants.slice(0, 10).map((tenant, idx) => (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="border p-2">{idx + 1}</td>
                  <td className="border p-2">{tenant.shopNumber || '-'}</td>
                  <td className="border p-2">{tenant.shopName || '-'}</td>
                  <td className="border p-2">{tenant.breakerSize || '-'}</td>
                  <td className="border p-2">{tenant.ctSizeAndRatio || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {template.tenants.length > 10 && (
            <p className="text-[10px] text-gray-500 mt-2 text-center">
              Showing 10 of {template.tenants.length} tenants
            </p>
          )}
          
          <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-gray-500">
            {template.name} - Tenants
          </div>
        </div>
      )}

    </div>
  );
};

export default TemplatePreviewRenderer;
