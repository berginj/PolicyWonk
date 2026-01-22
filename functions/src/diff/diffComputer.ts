// Diff computation engine

import { Section } from '../types/section';
import {
  DiffRecord,
  DiffSummary,
  SectionChange,
  ModifiedSection,
  DiffStats,
} from '../types/diff';
import { sectionMatcher } from './sectionMatcher';
import { logger } from '../utils/logger';
const diff = require('diff');

export class DiffComputer {
  async computeDiff(
    policyId: string,
    fromVersionId: string,
    toVersionId: string,
    oldSections: Section[],
    newSections: Section[],
    _oldText: string,
    _newText: string
  ): Promise<Omit<DiffRecord, 'diffId' | 'computedAt' | 'changeScore' | 'changeType' | 'llmExplanation'>> {
    logger.info('Computing diff', { policyId, fromVersionId, toVersionId });

    // Match sections between versions
    const matches = await sectionMatcher.matchSections(oldSections, newSections);

    // Categorize changes
    const addedSections: SectionChange[] = [];
    const removedSections: SectionChange[] = [];
    const modifiedSections: ModifiedSection[] = [];

    let charsAdded = 0;
    let charsRemoved = 0;

    for (const match of matches) {
      if (!match.oldSection && match.newSection) {
        // Added section
        addedSections.push({
          headingPath: match.newSection.headingPath,
          preview: this.getPreview(match.newSection.text),
        });
        charsAdded += match.newSection.text.length;
      } else if (match.oldSection && !match.newSection) {
        // Removed section
        removedSections.push({
          headingPath: match.oldSection.headingPath,
          preview: this.getPreview(match.oldSection.text),
        });
        charsRemoved += match.oldSection.text.length;
      } else if (match.oldSection && match.newSection) {
        // Potentially modified section
        if (match.oldSection.text !== match.newSection.text) {
          const { changePercent, beforeSnippet, afterSnippet, added, removed } =
            this.computeTextDiff(match.oldSection.text, match.newSection.text);

          modifiedSections.push({
            headingPath: match.newSection.headingPath,
            changePercent,
            beforeSnippet,
            afterSnippet,
            preview: this.getPreview(match.newSection.text),
          });

          charsAdded += added;
          charsRemoved += removed;
        }
      }
    }

    const stats: DiffStats = {
      totalSections: oldSections.length,
      sectionsChanged: addedSections.length + removedSections.length + modifiedSections.length,
      charsAdded,
      charsRemoved,
    };

    const summaryJson: DiffSummary = {
      addedSections,
      removedSections,
      modifiedSections,
      stats,
    };

    // Generate full text diff (not currently used in output)
    // this.generateUnifiedDiff(oldText, newText);

    logger.info('Diff computation complete', {
      policyId,
      added: addedSections.length,
      removed: removedSections.length,
      modified: modifiedSections.length,
    });

    return {
      policyId,
      fromVersionId,
      toVersionId,
      summaryJson,
      diffTextBlobPath: '', // Will be set after uploading to blob
    };
  }

  private computeTextDiff(
    oldText: string,
    newText: string
  ): {
    changePercent: number;
    beforeSnippet: string;
    afterSnippet: string;
    added: number;
    removed: number;
  } {
    const changes = diff.diffChars(oldText, newText);

    let added = 0;
    let removed = 0;
    let addedSnippets: string[] = [];
    let removedSnippets: string[] = [];

    for (const change of changes) {
      if (change.added) {
        added += change.value.length;
        if (addedSnippets.length < 3) {
          addedSnippets.push(change.value.substring(0, 100));
        }
      } else if (change.removed) {
        removed += change.value.length;
        if (removedSnippets.length < 3) {
          removedSnippets.push(change.value.substring(0, 100));
        }
      }
    }

    const totalChars = Math.max(oldText.length, newText.length);
    const changePercent = ((added + removed) / totalChars) * 100;

    return {
      changePercent: Math.round(changePercent * 10) / 10,
      beforeSnippet: removedSnippets.join(' ... ') || oldText.substring(0, 100),
      afterSnippet: addedSnippets.join(' ... ') || newText.substring(0, 100),
      added,
      removed,
    };
  }

  private getPreview(text: string, maxLength = 150): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }
}

export const diffComputer = new DiffComputer();
