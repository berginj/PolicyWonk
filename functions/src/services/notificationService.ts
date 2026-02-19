// Notification service using Azure Communication Services

import { EmailClient } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { escapeHtml, validateUrlSafe } from '../utils/validation';
import { NotificationPayload } from '../types/alert';

class NotificationService {
  private client: EmailClient | null = null;
  private senderAddress: string = 'DoNotReply@yourdomain.azurecomm.net';

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      const config = getConfig();

      // Get connection string from Key Vault
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = `https://${config.keyVault.name}.vault.azure.net`;
      const secretClient = new SecretClient(keyVaultUrl, credential);
      const secret = await secretClient.getSecret('CommunicationServicesConnectionString');

      this.client = new EmailClient(secret.value!);
      logger.info('Communication Services client initialized');
    } catch (error) {
      logger.error('Failed to initialize Communication Services client', error);
      throw new ExternalServiceError('CommunicationServices', error as Error);
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string
  ): Promise<void> {
    await this.initialize();

    try {
      const emailMessage = {
        senderAddress: this.senderAddress,
        content: {
          subject,
          html: htmlContent,
        },
        recipients: {
          to: [{ address: to }],
        },
      };

      const poller = await this.client!.beginSend(emailMessage);
      await poller.pollUntilDone();

      logger.info(`Email sent to ${to}`, { subject });
    } catch (error) {
      logger.error(`Failed to send email to ${to}`, error);
      throw new ExternalServiceError('CommunicationServices', error as Error);
    }
  }

  async sendPolicyUpdateNotification(
    to: string,
    payload: NotificationPayload
  ): Promise<void> {
    // Escape all user-provided content to prevent XSS
    const safeTitle = escapeHtml(payload.policyTitle || 'Untitled Policy');
    const safeSeverity = escapeHtml(payload.severity || 'UNKNOWN');
    const safeSourceUrl = validateUrlSafe(payload.sourceUrl) || '#';
    const safeDiffLink = validateUrlSafe(payload.diffLink) || '#';

    const subject = `Policy Update Alert: ${safeTitle} (${safeSeverity})`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${this.getSeverityColor(payload.severity!)}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .badge { display: inline-block; padding: 5px 10px; background-color: ${this.getSeverityColor(payload.severity!)}; color: white; border-radius: 3px; font-size: 12px; }
          .summary { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid ${this.getSeverityColor(payload.severity!)}; }
          .evidence { background-color: #fff3cd; padding: 10px; margin: 10px 0; border-radius: 3px; }
          .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Policy Update Detected</h2>
            <p>${safeTitle}</p>
          </div>
          <div class="content">
            <p><strong>Severity:</strong> <span class="badge">${safeSeverity}</span></p>
            <p><strong>Change Score:</strong> ${typeof payload.changeScore === 'number' ? payload.changeScore : 0}/100</p>
            <p><strong>Source:</strong> <a href="${safeSourceUrl}">${escapeHtml(payload.sourceUrl || 'N/A')}</a></p>

            ${payload.impactedTags && payload.impactedTags.length > 0 ? `
              <p><strong>Impacted Tags:</strong> ${payload.impactedTags.map(tag => escapeHtml(tag)).join(', ')}</p>
            ` : ''}

            <div class="summary">
              <h3>Summary of Changes</h3>
              <ul>
                ${payload.summaryBullets?.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('') || '<li>No summary available</li>'}
              </ul>
            </div>

            ${payload.evidenceSnippets && payload.evidenceSnippets.length > 0 ? `
              <h3>Evidence Snippets</h3>
              ${payload.evidenceSnippets.map((snippet) => `
                <div class="evidence">
                  <p><strong>Before:</strong> ${escapeHtml(snippet.before)}</p>
                  <p><strong>After:</strong> ${escapeHtml(snippet.after)}</p>
                </div>
              `).join('')}
            ` : ''}

            <a href="${safeDiffLink}" class="button">View Full Diff</a>

            <p style="margin-top: 20px; font-size: 12px; color: #666;">
              Timestamp: ${escapeHtml(new Date(payload.timestamp).toLocaleString())}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(to, subject, html);
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'MAJOR':
        return '#dc3545';
      case 'MODERATE':
        return '#ffc107';
      case 'MINOR':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  }
}

export const notificationService = new NotificationService();
