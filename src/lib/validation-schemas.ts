import { z } from 'zod';

// Client validation
export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(255),
  email: z.string().email("Invalid email").max(255).optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[0-9\s-()]{7,20}$/, "Invalid phone").max(20).optional().or(z.literal('')),
  contact_person: z.string().max(255).optional(),
  company_name: z.string().max(255).optional(),
  primary_contact_email: z.string().email("Invalid email").max(255).optional().or(z.literal('')),
});

// Site validation
export const siteSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(255),
  address: z.string().max(500).optional(),
  site_type: z.string().max(100).optional(),
  client_id: z.string().uuid("Invalid client ID"),  // Required!
  consultant_name: z.string().max(255).optional(),
  consultant_contact: z.string().max(255).optional(),
  consultant_company: z.string().max(255).optional(),
  supply_authority: z.string().max(255).optional(),
  nominated_max_demand: z.string().max(100).optional(),
});

// Inspection validation
export const inspectionSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(255),
  description: z.string().max(2000).optional(),
  site_id: z.string().uuid("Invalid site ID"),  // Required!
  inspection_date: z.string().optional(),
  // Status no longer drives compliance/health (existence-based model). The per-inspection
  // status markers have been removed from all inspection inputs/displays, so status is no
  // longer collected by the create form; the optional enum is retained for any legacy callers.
  status: z.enum(['Pending', 'In Progress', 'Completed', 'Cancelled']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  project_name: z.string().max(255).optional(),
  location: z.string().max(500).optional(),
  testing_party: z.string().max(255).optional(),
  inspector_name: z.string().max(255).optional(),
  client_rep: z.string().max(255).optional(),
  consultant: z.string().max(255).optional(),
  contractor: z.string().max(255).optional(),
  shop_number: z.string().max(100).optional(),
  shop_name: z.string().max(255).optional(),
});

// User profile validation
export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1, "Name required").max(255).optional(),
  phone: z.string().regex(/^\+?[0-9\s-()]{7,20}$/, "Invalid phone").max(20).optional().or(z.literal('')),
  job_title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  company: z.string().max(255).optional(),
  bio: z.string().max(1000).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
});

// User invite validation
export const userInviteSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  fullName: z.string().trim().min(1, "Name required").max(255),
  role: z.enum(['Admin', 'Client', 'Contractor'], {
    errorMap: () => ({ message: "Invalid role" })
  }),
  clientId: z.string().uuid("Invalid client ID").optional(),
  temporaryPassword: z.string().min(8, "Password must be at least 8 characters").max(72).optional(),
});

// Document upload validation
export const documentUploadSchema = z.object({
  file_name: z.string().trim().min(1, "Filename required").max(255),
  category: z.string().trim().min(1, "Category required").max(100),
  file_url: z.string().url("Invalid file URL").max(1000),
});

// Subsection validation
export const subsectionSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(255),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  tenant_name: z.string().max(255).optional(),
  coc_number: z.string().max(100).optional(),
  coc_type: z.string().max(100).optional(),
  meter_serial_number: z.string().max(100).optional(),
  ct_ratio: z.string().max(100).optional(),
});

// =============================================================================
// Auth schemas (used by /auth/login, /signup, /forgot-password, /reset-password,
// /set-password). Min length 8 enforced here; entropy + breach check (EC-2)
// happens in src/lib/password-strength.ts at form submit time.
// =============================================================================

export const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(255),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
