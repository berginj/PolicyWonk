// Structure extraction - convert document to sections

import { Section } from '../types/section';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class StructureProcessor {
  /**
   * Extract sections from normalized text
   */
  extractSections(text: string): Section[] {
    const sections: Section[] = [];
    const lines = text.split('\n');

    let currentSection: {
      headingPath: string[];
      level: number;
      lines: string[];
      startOffset: number;
    } | null = null;

    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const heading = this.detectHeading(line, i < lines.length - 1 ? lines[i + 1] : null);

      if (heading) {
        // Save previous section
        if (currentSection) {
          sections.push(this.createSection(currentSection, offset));
        }

        // Start new section
        currentSection = {
          headingPath: this.buildHeadingPath(heading.text, heading.level, sections),
          level: heading.level,
          lines: [],
          startOffset: offset,
        };
      } else if (currentSection && line.trim()) {
        currentSection.lines.push(line);
      }

      offset += line.length + 1; // +1 for newline
    }

    // Save last section
    if (currentSection) {
      sections.push(this.createSection(currentSection, offset));
    }

    // If no sections detected, treat entire text as one section
    if (sections.length === 0) {
      sections.push({
        sectionId: this.generateSectionId(['Document'], text),
        headingPath: ['Document'],
        level: 1,
        text: text.trim(),
        startOffset: 0,
        endOffset: text.length,
      });
    }

    logger.debug(`Extracted ${sections.length} sections from document`);
    return sections;
  }

  private detectHeading(
    line: string,
    nextLine: string | null
  ): { text: string; level: number } | null {
    // Pattern 1: Markdown-style headings (## Heading)
    const markdownMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (markdownMatch) {
      return {
        text: markdownMatch[2].trim(),
        level: markdownMatch[1].length,
      };
    }

    // Pattern 2: Numbered headings (1.2.3 Heading)
    const numberedMatch = line.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
    if (numberedMatch && line.length < 100) {
      const dotCount = (numberedMatch[1].match(/\./g) || []).length;
      return {
        text: numberedMatch[2].trim(),
        level: Math.min(dotCount + 1, 6),
      };
    }

    // Pattern 3: All caps line (HEADING)
    if (line === line.toUpperCase() && line.length > 3 && line.length < 100 && /[A-Z]/.test(line)) {
      return {
        text: line.trim(),
        level: 1,
      };
    }

    // Pattern 4: Underlined heading (next line is ===== or -----)
    if (nextLine && /^[=\-]{3,}$/.test(nextLine.trim())) {
      const level = nextLine.includes('=') ? 1 : 2;
      return {
        text: line.trim(),
        level,
      };
    }

    return null;
  }

  private buildHeadingPath(
    headingText: string,
    level: number,
    existingSections: Section[]
  ): string[] {
    // Find the most recent heading at level - 1 to build parent path
    if (level === 1) {
      return [headingText];
    }

    // Look backwards for parent heading
    for (let i = existingSections.length - 1; i >= 0; i--) {
      const section = existingSections[i];
      if (section.level < level) {
        return [...section.headingPath, headingText];
      }
    }

    // No parent found, start new path
    return [headingText];
  }

  private createSection(
    current: {
      headingPath: string[];
      level: number;
      lines: string[];
      startOffset: number;
    },
    endOffset: number
  ): Section {
    const text = current.lines.join('\n').trim();
    return {
      sectionId: this.generateSectionId(current.headingPath, text),
      headingPath: current.headingPath,
      level: current.level,
      text,
      startOffset: current.startOffset,
      endOffset,
    };
  }

  private generateSectionId(headingPath: string[], text: string): string {
    const combined = headingPath.join('/') + ':' + text.substring(0, 100);
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }
}

export const structureProcessor = new StructureProcessor();
