// Change classification and scoring with noise profile support

import crypto from 'crypto';
import { DiffSummary, ChangeType } from '../types/diff';
import { Section } from '../types/section';
import { cosmosService } from '../services/cosmosService';
import { openaiService } from '../services/openaiService';
import { logger } from '../utils/logger';

// Constants for tuning
const MINOR_THRESHOLD_DEFAULT = 15;
const MODERATE_THRESHOLD_DEFAULT = 40;
const MAX_HISTORY_SIZE = 20;
const NOISY_SOURCE_RATIO = 0.7;
const MIN_CHANGES_FOR_ADJUSTMENT = 5;
const MAX_MINOR_THRESHOLD = 25;

interface NoiseProfile {
  id: string; // Hash of sourceUrl for deterministic ID
  type: 'noise_profile';
  sourceUrl: string;
  historicalChanges: Array<{
    changeScore: number;
    changeType: ChangeType;
    timestamp: string;
  }>;
  formattingChangeCount: number;
  totalChangeCount: number;
  adjustedMinorThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export class ChangeClassifier {
  /**
   * Generate a deterministic ID for a noise profile based on sourceUrl
   */
  private generateNoiseProfileId(sourceUrl: string): string {
    return `noise_${crypto.createHash('sha256').update(sourceUrl).digest('hex').substring(0, 16)}`;
  }

  async classifyChange(
    policyId: string,
    sourceUrl: string | undefined,
    summaryJson: DiffSummary,
    oldSections: Section[],
    newSections: Section[]
  ): Promise<{ changeScore: number; changeType: ChangeType }> {
    // Calculate base change score
    const changeScore = await this.calculateChangeScore(summaryJson, oldSections, newSections);

    // Get noise profile for this source
    const noiseProfile = sourceUrl
      ? await this.getOrCreateNoiseProfile(sourceUrl)
      : null;

    // Apply noise profile adjustments
    const adjustedThresholds = this.getAdjustedThresholds(noiseProfile);

    // Classify based on adjusted thresholds
    const changeType = this.determineChangeType(changeScore, adjustedThresholds);

    // Update noise profile
    if (noiseProfile && sourceUrl) {
      await this.updateNoiseProfile(sourceUrl, changeScore, changeType);
    }

    logger.info('Change classified', {
      policyId,
      changeScore,
      changeType,
      adjustedMinorThreshold: adjustedThresholds.minor,
    });

    return { changeScore, changeType };
  }

  private async calculateChangeScore(
    summaryJson: DiffSummary,
    oldSections: Section[],
    newSections: Section[]
  ): Promise<number> {
    const { stats } = summaryJson;

    // Component 1: Structural changes (40%)
    const structuralScore =
      stats.totalSections > 0 ? (stats.sectionsChanged / stats.totalSections) * 100 : 0;

    // Component 2: Textual changes (30%)
    const totalOldChars = oldSections.reduce((sum, s) => sum + s.text.length, 0);
    const charsChanged = stats.charsAdded + stats.charsRemoved;
    const textualScore = totalOldChars > 0 ? (charsChanged / totalOldChars) * 100 : 0;

    // Component 3: Semantic changes (30%)
    const semanticScore = await this.calculateSemanticScore(oldSections, newSections);

    // Weighted composite score
    const compositeScore =
      structuralScore * 0.4 + textualScore * 0.3 + semanticScore * 0.3;

    return Math.min(Math.round(compositeScore), 100);
  }

  private async calculateSemanticScore(
    oldSections: Section[],
    newSections: Section[]
  ): Promise<number> {
    try {
      // Sample a few sections for embedding comparison
      const sampleSize = Math.min(5, oldSections.length, newSections.length);
      if (sampleSize === 0) return 0;

      const oldSample = this.sampleSections(oldSections, sampleSize);
      const newSample = this.sampleSections(newSections, sampleSize);

      const oldTexts = oldSample.map((s) => s.text.substring(0, 500));
      const newTexts = newSample.map((s) => s.text.substring(0, 500));

      const oldEmbeddings = await openaiService.generateEmbeddings(oldTexts);
      const newEmbeddings = await openaiService.generateEmbeddings(newTexts);

      // Calculate average embedding distance
      let totalDistance = 0;
      for (let i = 0; i < sampleSize; i++) {
        const similarity = this.cosineSimilarity(oldEmbeddings[i], newEmbeddings[i]);
        totalDistance += 1 - similarity;
      }

      const avgDistance = totalDistance / sampleSize;
      return avgDistance * 100; // Convert to 0-100 scale
    } catch (error) {
      logger.warn('Failed to calculate semantic score, using 0', error);
      return 0;
    }
  }

  private sampleSections(sections: Section[], count: number): Section[] {
    if (sections.length <= count) return sections;

    const step = Math.floor(sections.length / count);
    return Array.from({ length: count }, (_, i) => sections[i * step]);
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

  private async getOrCreateNoiseProfile(sourceUrl: string): Promise<NoiseProfile> {
    const profileId = this.generateNoiseProfileId(sourceUrl);

    try {
      // Try to get existing profile by ID (more efficient than query)
      const existing = await cosmosService.getDocument<NoiseProfile>(
        'documents',
        profileId,
        profileId // Using ID as partition key for noise profiles
      );

      if (existing) {
        return existing;
      }

      // Create new noise profile with proper ID
      const newProfile: NoiseProfile = {
        id: profileId,
        type: 'noise_profile',
        sourceUrl,
        historicalChanges: [],
        formattingChangeCount: 0,
        totalChangeCount: 0,
        adjustedMinorThreshold: MINOR_THRESHOLD_DEFAULT,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await cosmosService.createDocument('documents', newProfile);
      logger.info('Created noise profile', { sourceUrl, profileId });

      return newProfile;
    } catch (error) {
      logger.warn('Failed to get/create noise profile, using defaults', { sourceUrl, error });
      // Return a transient profile that won't be persisted
      return {
        id: profileId,
        type: 'noise_profile',
        sourceUrl,
        historicalChanges: [],
        formattingChangeCount: 0,
        totalChangeCount: 0,
        adjustedMinorThreshold: MINOR_THRESHOLD_DEFAULT,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private async updateNoiseProfile(
    sourceUrl: string,
    changeScore: number,
    changeType: ChangeType
  ): Promise<void> {
    const profileId = this.generateNoiseProfileId(sourceUrl);

    try {
      const profile = await this.getOrCreateNoiseProfile(sourceUrl);

      // Add to history
      profile.historicalChanges.push({
        changeScore,
        changeType,
        timestamp: new Date().toISOString(),
      });

      // Keep last N changes
      if (profile.historicalChanges.length > MAX_HISTORY_SIZE) {
        profile.historicalChanges = profile.historicalChanges.slice(-MAX_HISTORY_SIZE);
      }

      profile.totalChangeCount++;
      if (changeType === 'MINOR') {
        profile.formattingChangeCount++;
      }

      // Auto-adjust threshold if source has frequent minor changes
      const minorChangeRatio = profile.formattingChangeCount / profile.totalChangeCount;
      if (minorChangeRatio > NOISY_SOURCE_RATIO && profile.totalChangeCount >= MIN_CHANGES_FOR_ADJUSTMENT) {
        // Raise the MINOR threshold for noisy sources
        profile.adjustedMinorThreshold = Math.min(
          MINOR_THRESHOLD_DEFAULT + 10,
          MAX_MINOR_THRESHOLD
        );
        logger.info('Adjusted MINOR threshold for noisy source', {
          sourceUrl,
          newThreshold: profile.adjustedMinorThreshold,
          minorChangeRatio,
        });
      }

      profile.updatedAt = new Date().toISOString();

      // Use proper ID and partition key
      await cosmosService.updateDocument('documents', profileId, profileId, profile);
    } catch (error) {
      logger.warn('Failed to update noise profile', { sourceUrl, profileId, error });
    }
  }

  private getAdjustedThresholds(
    noiseProfile: NoiseProfile | null
  ): { minor: number; moderate: number } {
    return {
      minor: noiseProfile?.adjustedMinorThreshold || MINOR_THRESHOLD_DEFAULT,
      moderate: MODERATE_THRESHOLD_DEFAULT,
    };
  }

  private determineChangeType(
    changeScore: number,
    thresholds: { minor: number; moderate: number }
  ): ChangeType {
    if (changeScore === 0) return 'NO_CHANGE';
    if (changeScore < thresholds.minor) return 'MINOR';
    if (changeScore < thresholds.moderate) return 'MODERATE';
    return 'MAJOR';
  }
}

export const changeClassifier = new ChangeClassifier();
