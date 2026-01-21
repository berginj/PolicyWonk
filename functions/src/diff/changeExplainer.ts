// LLM-based change explanation

import { DiffSummary, LLMExplanation, EvidenceSnippet, ChangeType } from '../types/diff';
import { openaiService } from '../services/openaiService';
import { logger } from '../utils/logger';

export class ChangeExplainer {
  async explainChanges(
    summaryJson: DiffSummary,
    changeType: ChangeType
  ): Promise<LLMExplanation | undefined> {
    // Only generate LLM explanation for MODERATE and MAJOR changes
    if (changeType !== 'MODERATE' && changeType !== 'MAJOR') {
      return undefined;
    }

    try {
      const prompt = this.buildPrompt(summaryJson);
      const explanation = await openaiService.chatWithJson<LLMExplanation>(
        prompt
      );

      logger.info('LLM explanation generated', {
        bullets: explanation.summaryBullets.length,
        impactedTags: explanation.impactedTags.length,
      });

      return explanation;
    } catch (error) {
      logger.error('Failed to generate LLM explanation', error);
      return undefined;
    }
  }

  private buildPrompt(summaryJson: DiffSummary): Array<{ role: string; content: string }> {
    const { addedSections, removedSections, modifiedSections } = summaryJson;

    // Build context
    const addedContext = addedSections
      .slice(0, 5)
      .map(
        (s) =>
          `Added: ${s.headingPath.join(' > ')}\n${s.preview}`
      )
      .join('\n\n');

    const removedContext = removedSections
      .slice(0, 5)
      .map(
        (s) =>
          `Removed: ${s.headingPath.join(' > ')}\n${s.preview}`
      )
      .join('\n\n');

    const modifiedContext = modifiedSections
      .slice(0, 10)
      .map(
        (s) =>
          `Modified: ${s.headingPath.join(' > ')} (${s.changePercent}% changed)\nBefore: ${s.beforeSnippet}\nAfter: ${s.afterSnippet}`
      )
      .join('\n\n');

    const systemPrompt = `You are analyzing a policy document update. Your task is to identify substantive changes that impact compliance, security, or operational requirements.

Focus on:
- New requirements, deadlines, or mandates
- Changed compliance frameworks or standards
- Modified security controls or encryption requirements
- Updated audit or certification requirements
- Changes to data handling or privacy requirements
- Scope expansions or reductions

Ignore:
- Purely formatting changes
- Date updates (unless they represent new deadlines)
- Minor wording changes that don't alter meaning`;

    const userPrompt = `Analyze the following policy document changes:

${addedContext ? `NEW SECTIONS:\n${addedContext}\n\n` : ''}
${removedContext ? `REMOVED SECTIONS:\n${removedContext}\n\n` : ''}
${modifiedContext ? `MODIFIED SECTIONS:\n${modifiedContext}\n\n` : ''}

Provide a structured analysis in the following JSON format:
{
  "summaryBullets": ["3-8 concise bullet points describing substantive changes"],
  "impactedTags": ["FedRAMP", "NIST", "ISO27001", "SOC2", etc.],
  "riskNotes": "Any compliance or operational risks introduced by these changes (optional)",
  "evidenceSnippets": [
    {"before": "excerpt from old version", "after": "excerpt from new version"}
  ]
}

Ensure evidenceSnippets contains 2-4 of the most significant changes with before/after text.`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }
}

export const changeExplainer = new ChangeExplainer();
