import { 
  Store, 
  Zap, 
  Sun, 
  Gauge, 
  CloudLightning, 
  Users,
  type LucideIcon 
} from "lucide-react";

export interface SubsectionCategory {
  value: string;
  label: string;
  icon: LucideIcon;
  color: {
    bg: string;
    text: string;
    border: string;
  };
  abbreviation: string;
}

export const SUBSECTION_CATEGORIES: SubsectionCategory[] = [
  {
    value: "Line Shop",
    label: "Line Shop",
    icon: Store,
    color: {
      bg: "bg-blue-50",
      text: "text-blue-600",
      border: "border-blue-200"
    },
    abbreviation: "LS"
  },
  {
    value: "Electrical Equipment",
    label: "Electrical Equipment",
    icon: Zap,
    color: {
      bg: "bg-red-50",
      text: "text-red-600",
      border: "border-red-200"
    },
    abbreviation: "EE"
  },
  {
    value: "Solar",
    label: "Solar",
    icon: Sun,
    color: {
      bg: "bg-yellow-50",
      text: "text-yellow-600",
      border: "border-yellow-200"
    },
    abbreviation: "SOL"
  },
  {
    value: "Metering",
    label: "Metering",
    icon: Gauge,
    color: {
      bg: "bg-green-50",
      text: "text-green-600",
      border: "border-green-200"
    },
    abbreviation: "MTR"
  },
  {
    value: "Lightning Protection",
    label: "Lightning Protection",
    icon: CloudLightning,
    color: {
      bg: "bg-purple-50",
      text: "text-purple-600",
      border: "border-purple-200"
    },
    abbreviation: "LP"
  },
  {
    value: "Common Area",
    label: "Common Area",
    icon: Users,
    color: {
      bg: "bg-gray-50",
      text: "text-gray-600",
      border: "border-gray-200"
    },
    abbreviation: "CA"
  }
];

export const getCategoryConfig = (category: string): SubsectionCategory => {
  return SUBSECTION_CATEGORIES.find(c => c.value === category) || SUBSECTION_CATEGORIES[0];
};

export const getCategoryIcon = (category: string): LucideIcon => {
  return getCategoryConfig(category).icon;
};

export const getCategoryColor = (category: string) => {
  return getCategoryConfig(category).color;
};

export const getCategoryAbbreviation = (category: string): string => {
  return getCategoryConfig(category).abbreviation;
};
