export interface Site {
    id: string;
    name: string;
    address: string | null;
    site_type: string | null;
    client_id: string;
    supply_authority: string | null;
    nominated_max_demand: string | null;
    consultant_name: string | null;
    consultant_company: string | null;
    consultant_contact: string | null;
    site_image_url: string | null;
    client_logo_url: string | null;
    clients: {
        id: string;
        name: string;
    };
}

export interface Subsection {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    coc_status: string;
    metering_status: string;
    is_compliant: boolean;
    is_coc_required: boolean;
    tenant_name: string | null;
    coc_number: string | null;
    meter_serial_number: string | null;
    ct_ratio: string | null;
    qr_code_url: string | null;
}

export interface SiteStats {
    totalSubsections: number;
    cocApprovedCount: number;
    cocRequiredCount: number;
    meteringInstalledCount: number;
    openSnags: number;
}
