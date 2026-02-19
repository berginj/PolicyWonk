// Input validation utilities

import { ValidationError } from './errors';

export function validateRequired(value: any, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
}

export function validateUrl(url: string, fieldName = 'url'): void {
  validateRequired(url, fieldName);
  try {
    new URL(url);
  } catch {
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

export function validateEmail(email: string, fieldName = 'email'): void {
  validateRequired(email, fieldName);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(`${fieldName} must be a valid email address`);
  }
}

export function validateEnum<T>(
  value: any,
  enumValues: T[],
  fieldName: string
): void {
  if (!enumValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${enumValues.join(', ')}`
    );
  }
}

export function validateStringLength(
  value: string,
  min: number,
  max: number,
  fieldName: string
): void {
  if (value.length < min || value.length > max) {
    throw new ValidationError(
      `${fieldName} must be between ${min} and ${max} characters`
    );
  }
}

export function validateArray(
  value: any,
  fieldName: string,
  options?: { minLength?: number; maxLength?: number }
): void {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  if (options?.minLength && value.length < options.minLength) {
    throw new ValidationError(
      `${fieldName} must have at least ${options.minLength} items`
    );
  }
  if (options?.maxLength && value.length > options.maxLength) {
    throw new ValidationError(
      `${fieldName} must have at most ${options.maxLength} items`
    );
  }
}

/**
 * Validate and clamp a numeric limit parameter
 * Prevents SQL injection and ensures reasonable bounds
 */
export function validateLimit(
  value: string | null,
  defaultValue: number = 20,
  maxValue: number = 100
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  // Check for NaN or non-integer values
  if (isNaN(parsed) || !Number.isInteger(parsed)) {
    return defaultValue;
  }

  // Clamp to valid range
  if (parsed < 1) {
    return 1;
  }

  if (parsed > maxValue) {
    return maxValue;
  }

  return parsed;
}

/**
 * Validate and clamp a numeric offset/skip parameter
 */
export function validateOffset(
  value: string | null,
  defaultValue: number = 0,
  maxValue: number = 10000
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || !Number.isInteger(parsed)) {
    return defaultValue;
  }

  if (parsed < 0) {
    return 0;
  }

  if (parsed > maxValue) {
    return maxValue;
  }

  return parsed;
}

/**
 * Validate a document ID (alphanumeric with hyphens)
 */
export function validateDocumentId(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }

  // Allow alphanumeric, hyphens, and underscores
  const sanitized = id.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return null;
  }

  // Reasonable max length
  if (sanitized.length > 128) {
    return null;
  }

  return sanitized;
}

/**
 * Validate URL and return sanitized URL or null
 */
export function validateUrlSafe(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url.trim());

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Type guard for ProcessingJob queue messages
 */
export interface ProcessingJobMessage {
  documentId: string;
  rawBlobPath: string;
  contentType: string;
  docType?: string;
  isUpdate?: boolean;
  versionId?: string;
}

export function isProcessingJobMessage(obj: unknown): obj is ProcessingJobMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.documentId === 'string' &&
    candidate.documentId.length > 0 &&
    typeof candidate.rawBlobPath === 'string' &&
    candidate.rawBlobPath.length > 0 &&
    typeof candidate.contentType === 'string' &&
    candidate.contentType.length > 0
  );
}

/**
 * Type guard for DiffJob queue messages
 */
export interface DiffJobMessage {
  policyId: string;
  fromVersionId: string;
  toVersionId: string;
}

export function isDiffJobMessage(obj: unknown): obj is DiffJobMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.policyId === 'string' &&
    candidate.policyId.length > 0 &&
    typeof candidate.fromVersionId === 'string' &&
    candidate.fromVersionId.length > 0 &&
    typeof candidate.toVersionId === 'string' &&
    candidate.toVersionId.length > 0
  );
}
