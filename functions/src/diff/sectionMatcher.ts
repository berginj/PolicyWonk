// Section matching algorithm for diff computation

import { Section, SectionMatch } from '../types/section';
import { openaiService } from '../services/openaiService';
import { logger } from '../utils/logger';
const stringSimilarity = require('string-similarity');

export class SectionMatcher {
  private similarityThreshold = 0.7;
  private embeddingThreshold = 0.85;

  async matchSections(
    oldSections: Section[],
    newSections: Section[]
  ): Promise<SectionMatch[]> {
    const matches: SectionMatch[] = [];
    const matchedNewIndices = new Set<number>();

    // Phase 1: Exact matches (same sectionId)
    for (const oldSection of oldSections) {
      const exactMatchIndex = newSections.findIndex(
        (ns, idx) => ns.sectionId === oldSection.sectionId && !matchedNewIndices.has(idx)
      );

      if (exactMatchIndex !== -1) {
        matches.push({
          oldSection,
          newSection: newSections[exactMatchIndex],
          matchType: 'exact',
          matchScore: 1.0,
        });
        matchedNewIndices.add(exactMatchIndex);
      }
    }

    // Phase 2: Fuzzy heading path matches
    for (const oldSection of oldSections) {
      if (matches.some((m) => m.oldSection === oldSection)) continue;

      let bestMatch: { index: number; score: number } | null = null;

      for (let i = 0; i < newSections.length; i++) {
        if (matchedNewIndices.has(i)) continue;

        const newSection = newSections[i];
        const score = this.compareHeadingPaths(
          oldSection.headingPath,
          newSection.headingPath
        );

        if (score > this.similarityThreshold && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { index: i, score };
        }
      }

      if (bestMatch) {
        matches.push({
          oldSection,
          newSection: newSections[bestMatch.index],
          matchType: 'fuzzy',
          matchScore: bestMatch.score,
        });
        matchedNewIndices.add(bestMatch.index);
      }
    }

    // Phase 3: Semantic matches using embeddings (for renamed/moved sections)
    const unmatchedOld = oldSections.filter(
      (os) => !matches.some((m) => m.oldSection === os)
    );
    const unmatchedNew = newSections.filter((_, idx) => !matchedNewIndices.has(idx));

    if (unmatchedOld.length > 0 && unmatchedNew.length > 0) {
      const semanticMatches = await this.matchSemanticSections(unmatchedOld, unmatchedNew);
      matches.push(...semanticMatches);

      semanticMatches.forEach((m) => {
        const idx = newSections.indexOf(m.newSection!);
        if (idx !== -1) matchedNewIndices.add(idx);
      });
    }

    // Phase 4: Mark unmatched sections
    for (const oldSection of oldSections) {
      if (!matches.some((m) => m.oldSection === oldSection)) {
        matches.push({
          oldSection,
          newSection: null,
          matchType: 'unmatched',
          matchScore: 0,
        });
      }
    }

    for (let i = 0; i < newSections.length; i++) {
      if (!matchedNewIndices.has(i)) {
        matches.push({
          oldSection: null,
          newSection: newSections[i],
          matchType: 'unmatched',
          matchScore: 0,
        });
      }
    }

    logger.debug(`Section matching complete: ${matches.length} matches`);
    return matches;
  }

  private compareHeadingPaths(path1: string[], path2: string[]): number {
    const str1 = path1.join(' > ');
    const str2 = path2.join(' > ');
    return stringSimilarity.compareTwoStrings(str1, str2);
  }

  private async matchSemanticSections(
    oldSections: Section[],
    newSections: Section[]
  ): Promise<SectionMatch[]> {
    try {
      // Generate embeddings for unmatched sections
      const oldTexts = oldSections.map((s) =>
        this.getSectionSummary(s.headingPath, s.text)
      );
      const newTexts = newSections.map((s) =>
        this.getSectionSummary(s.headingPath, s.text)
      );

      const oldEmbeddings = await openaiService.generateEmbeddings(oldTexts);
      const newEmbeddings = await openaiService.generateEmbeddings(newTexts);

      const matches: SectionMatch[] = [];
      const matchedNewIndices = new Set<number>();

      for (let i = 0; i < oldSections.length; i++) {
        let bestMatch: { index: number; score: number } | null = null;

        for (let j = 0; j < newSections.length; j++) {
          if (matchedNewIndices.has(j)) continue;

          const similarity = this.cosineSimilarity(oldEmbeddings[i], newEmbeddings[j]);

          if (
            similarity > this.embeddingThreshold &&
            (!bestMatch || similarity > bestMatch.score)
          ) {
            bestMatch = { index: j, score: similarity };
          }
        }

        if (bestMatch) {
          matches.push({
            oldSection: oldSections[i],
            newSection: newSections[bestMatch.index],
            matchType: 'semantic',
            matchScore: bestMatch.score,
          });
          matchedNewIndices.add(bestMatch.index);
        }
      }

      logger.debug(`Semantic matching found ${matches.length} matches`);
      return matches;
    } catch (error) {
      logger.warn('Semantic matching failed, skipping', error);
      return [];
    }
  }

  private getSectionSummary(headingPath: string[], text: string): string {
    const heading = headingPath.join(' > ');
    const preview = text.substring(0, 200);
    return `${heading}\n${preview}`;
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

export const sectionMatcher = new SectionMatcher();
