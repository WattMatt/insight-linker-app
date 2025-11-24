import { toast } from 'sonner';

// File validation constants
export const FILE_LIMITS = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB for images
  MAX_DOCUMENT_SIZE: 50 * 1024 * 1024, // 50MB for documents
} as const;

// Allowed MIME types by category
export const ALLOWED_MIME_TYPES = {
  images: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
  cad: [
    'application/acad',
    'application/x-acad',
    'application/autocad_dwg',
    'image/x-dwg',
    'application/dwg',
    'application/x-dwg',
    'application/x-autocad',
    'image/vnd.dwg',
  ],
} as const;

export interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  category?: keyof typeof ALLOWED_MIME_TYPES;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  file?: File;
}

/**
 * Validates a file based on size and type constraints
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): FileValidationResult {
  const {
    maxSize = FILE_LIMITS.MAX_SIZE,
    allowedTypes,
    category,
  } = options;

  // Check file size
  if (file.size > maxSize) {
    const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
    const error = `File size exceeds maximum allowed size of ${sizeMB}MB`;
    toast.error(error);
    return { valid: false, error };
  }

  // Check file type if specified
  if (allowedTypes || category) {
    const acceptedTypes: string[] = allowedTypes || (category ? [...ALLOWED_MIME_TYPES[category]] : []);
    
    if (!acceptedTypes.includes(file.type)) {
      const error = `File type "${file.type}" is not allowed`;
      toast.error(error);
      return { valid: false, error };
    }
  }

  // Check for malicious file names
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // Script tags
    /\.exe$/i,  // Executables
    /\.bat$/i,  // Batch files
    /\.cmd$/i,  // Command files
    /\.com$/i,  // COM files
    /\.scr$/i,  // Screen savers
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(file.name)) {
      const error = 'File name contains suspicious patterns';
      toast.error(error);
      return { valid: false, error };
    }
  }

  return { valid: true, file };
}

/**
 * Validates multiple files at once
 */
export function validateFiles(
  files: FileList | File[],
  options: FileValidationOptions = {}
): { valid: boolean; validFiles: File[]; errors: string[] } {
  const fileArray = Array.from(files);
  const validFiles: File[] = [];
  const errors: string[] = [];

  for (const file of fileArray) {
    const result = validateFile(file, options);
    if (result.valid && result.file) {
      validFiles.push(result.file);
    } else if (result.error) {
      errors.push(`${file.name}: ${result.error}`);
    }
  }

  return {
    valid: errors.length === 0,
    validFiles,
    errors,
  };
}

/**
 * Gets human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Checks if file is an image
 */
export function isImageFile(file: File): boolean {
  const imageTypes: string[] = [...ALLOWED_MIME_TYPES.images];
  return imageTypes.includes(file.type);
}

/**
 * Checks if file is a document
 */
export function isDocumentFile(file: File): boolean {
  const docTypes: string[] = [...ALLOWED_MIME_TYPES.documents];
  return docTypes.includes(file.type);
}
