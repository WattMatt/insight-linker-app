// The canonical site type / sector list, shared by the site create and edit
// forms. site_type doubles as the sector the client portal groups by
// (Retail / Logistics / Office for agency-managed portfolios like Fortress).
export const SITE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "Retail", label: "Retail" },
  { value: "Logistics", label: "Logistics" },
  { value: "Office", label: "Office" },
  { value: "Commercial", label: "Commercial" },
  { value: "Industrial", label: "Industrial" },
  { value: "Residential", label: "Residential" },
  { value: "Mall", label: "Shopping Mall" },
];
