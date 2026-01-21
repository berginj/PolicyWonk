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
