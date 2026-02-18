// Alert data model types

import { ChangeType } from './diff';

export type AlertType = 'new_document' | 'policy_update' | 'deprecation';
export type NotificationChannelType = 'email';

export interface NotificationChannel {
  type: NotificationChannelType;
  address: string;
}

export interface AlertCriteria {
  tags?: string[];
  keywords?: string[];
  docType?: 'policy' | 'contract';
  sourcePattern?: string; // Regex or glob
  minSeverity?: ChangeType;
  meaningfulChangeOnly?: boolean;
}

export interface Alert {
  alertId: string;
  userId: string;
  alertType: AlertType;
  name: string;
  criteria: AlertCriteria;
  notificationChannels: NotificationChannel[];
  enabled: boolean;
  lastTriggered?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertInput {
  alertType: AlertType;
  name: string;
  criteria: AlertCriteria;
  notificationChannels: NotificationChannel[];
}

export interface UpdateAlertInput {
  name?: string;
  criteria?: AlertCriteria;
  notificationChannels?: NotificationChannel[];
  enabled?: boolean;
}

export interface NotificationPayload {
  type: 'new_document' | 'policy_update' | 'deprecation';
  policyTitle?: string;
  sourceUrl?: string;
  severity?: ChangeType;
  changeScore?: number;
  summaryBullets?: string[];
  evidenceSnippets?: Array<{ before: string; after: string }>;
  diffLink?: string;
  impactedTags?: string[];
  timestamp: string;
  // Deprecation-specific fields
  deprecationNotice?: string;
  newVersionUrl?: string;
}

export interface Notification {
  notificationId: string;
  alertId: string;
  userId: string;
  entityId: string; // Document or diff ID
  entityType: 'document' | 'diff';
  payload: NotificationPayload;
  sentAt: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
}
