// API client for PolicyWonk backend

import axios, { AxiosInstance } from 'axios';

// Get API URL from environment variable, with fallback for development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getDocument(documentId: string) {
    const response = await this.client.get(`/documents/${documentId}`);
    return response.data;
  }

  async getDiff(diffId: string) {
    const response = await this.client.get(`/diffs/${diffId}`);
    return response.data;
  }

  async getPolicyDiffs(policyId: string) {
    const response = await this.client.get(`/policies/${policyId}/diffs`);
    return response.data;
  }

  async getPolicyVersions(policyId: string) {
    const response = await this.client.get(`/policies/${policyId}/versions`);
    return response.data;
  }

  async ingestUrl(url: string, docType: 'policy' | 'contract', metadata?: any) {
    const response = await this.client.post('/ingest/url', {
      url,
      docType,
      metadata,
    });
    return response.data;
  }

  async updateDocument(documentId: string, updates: {
    title?: string;
    tags?: string[];
    metadata?: any;
  }) {
    const response = await this.client.patch(`/documents/${documentId}`, updates);
    return response.data;
  }

  async searchDocuments(query: any) {
    const response = await this.client.get('/documents', { params: query });
    return response.data;
  }

  async getLogs(params: {
    correlationId?: string;
    functionName?: string;
    level?: string;
    startDate?: string;
    endDate?: string;
    skip?: number;
    take?: number;
  }) {
    const response = await this.client.get('/logs', { params });
    return response.data;
  }

  async getPolicies(params?: {
    monitored?: boolean;
    recent?: boolean;
    limit?: number;
  }) {
    const response = await this.client.get('/policies', { params });
    return response.data;
  }

  async getAlerts(params?: {
    active?: boolean;
    limit?: number;
  }) {
    const response = await this.client.get('/alerts', { params });
    return response.data;
  }

  async createAlert(data: {
    name: string;
    alertType: 'new_document' | 'policy_update' | 'deprecation';
    criteria?: {
      tags?: string[];
      keywords?: string[];
      docType?: 'policy' | 'contract';
      minSeverity?: 'MAJOR' | 'MODERATE' | 'MINOR';
      meaningfulChangeOnly?: boolean;
    };
    notificationChannels: Array<{
      type: 'email';
      address: string;
    }>;
  }) {
    const response = await this.client.post('/alerts', data);
    return response.data;
  }

  async deleteDocument(documentId: string) {
    const response = await this.client.delete(`/documents/${documentId}`);
    return response.data;
  }
}

export const api = new ApiClient();
