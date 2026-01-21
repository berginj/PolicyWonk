// Authentication and authorization helpers

import { HttpRequest } from '@azure/functions';
import { UnauthorizedError, ForbiddenError } from './errors';

export interface UserClaims {
  userId: string;
  email?: string;
  name?: string;
  roles: string[];
}

export enum Role {
  ADMIN = 'admin',
  ANALYST = 'analyst',
}

// Extract user claims from Azure Static Web Apps authentication
export function getUserFromRequest(request: HttpRequest): UserClaims | null {
  // Azure Static Web Apps injects user info in x-ms-client-principal header
  const clientPrincipalHeader = request.headers.get('x-ms-client-principal');

  if (!clientPrincipalHeader) {
    return null;
  }

  try {
    const clientPrincipal = JSON.parse(
      Buffer.from(clientPrincipalHeader, 'base64').toString('utf-8')
    );

    return {
      userId: clientPrincipal.userId || clientPrincipal.userDetails,
      email: clientPrincipal.userDetails,
      name: clientPrincipal.claims?.find((c: any) => c.typ === 'name')?.val,
      roles: clientPrincipal.userRoles || [],
    };
  } catch (error) {
    return null;
  }
}

export function requireAuth(request: HttpRequest): UserClaims {
  const user = getUserFromRequest(request);
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }
  return user;
}

export function requireRole(user: UserClaims, requiredRole: Role): void {
  if (!user.roles.includes(requiredRole)) {
    throw new ForbiddenError(`${requiredRole} role required`);
  }
}

export function requireAnyRole(user: UserClaims, requiredRoles: Role[]): void {
  const hasRole = requiredRoles.some((role) => user.roles.includes(role));
  if (!hasRole) {
    throw new ForbiddenError(
      `One of the following roles required: ${requiredRoles.join(', ')}`
    );
  }
}
