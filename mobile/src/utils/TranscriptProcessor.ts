export class TranscriptProcessor {
  private maxCharsPerLine: number;
  private maxLines: number;
  private lastUserTranscript: string = '';
  private lines: string[] = [];
  private partialText: string = '';
  private finalTranscriptHistory: string[] = [];
  private maxFinalTranscripts: number;
  private isChinese: boolean;
  private currentDisplayLines: string[] = [];
  private lastPartialUpdateTime: number = 0;
  private readonly throttleInterval: number = 300; // 300ms throttle interval

  constructor(maxCharsPerLine: number, maxLines: number, maxFinalTranscripts: number = 3, isChinese: boolean = false) {
    this.maxCharsPerLine = maxCharsPerLine;
    this.maxLines = maxLines;
    this.maxFinalTranscripts = maxFinalTranscripts;
    this.isChinese = isChinese;
  }

  public processString(newText: string | null, isFinal: boolean): string | null {
    const text = (newText || '').trim();

    if (!isFinal) {
      // Store this as the current partial text (overwriting old partial)
      this.partialText = text;
      this.lastUserTranscript = text;

      // Combine final history with new partial text
      const combinedText = this.getCombinedTranscriptHistory() + ' ' + text;
      this.currentDisplayLines = this.wrapText(combinedText, this.maxCharsPerLine);

      // Ensure we have exactly maxLines
      while (this.currentDisplayLines.length < this.maxLines) {
        this.currentDisplayLines.push('');
      }
      while (this.currentDisplayLines.length > this.maxLines) {
        this.currentDisplayLines.shift();
      }

      const currentTime = Date.now();
      const timeSinceLastUpdate = currentTime - this.lastPartialUpdateTime;

      // If less than throttle interval has passed, return null
      if (timeSinceLastUpdate < this.throttleInterval) {
        return null;
      }

      // Update the last update time
      this.lastPartialUpdateTime = currentTime;

      // Return the processed text
      return this.currentDisplayLines.join('\n');
    } else {
      // We have a final text -> clear out the partial text to avoid duplication
      this.partialText = '';

      // Add to transcript history when it's a final transcript
      this.addToTranscriptHistory(text);

      // Use the same wrapping logic as partial to maintain consistency
      const combinedText = this.getCombinedTranscriptHistory();
      this.currentDisplayLines = this.wrapText(combinedText, this.maxCharsPerLine);

      // Ensure we have exactly maxLines
      while (this.currentDisplayLines.length < this.maxLines) {
        this.currentDisplayLines.push('');
      }
      while (this.currentDisplayLines.length > this.maxLines) {
        this.currentDisplayLines.shift();
      }

      return this.currentDisplayLines.join('\n');
    }
  }

  private wrapText(text: string, maxLength: number): string[] {
    const result: string[] = [];
    let remainingText = text;

    while (remainingText.length > 0) {
      if (remainingText.length <= maxLength) {
        result.push(remainingText);
        break;
      }

      let splitIndex = maxLength;

      if (this.isChinese) {
        // For Chinese text, just split at maxLength
        splitIndex = maxLength;
      } else {
        // For non-Chinese text, find the last space before maxLength
        const searchSpace = remainingText.substring(0, maxLength);
        const lastSpaceIndex = searchSpace.lastIndexOf(' ');
        
        if (lastSpaceIndex > 0) {
          splitIndex = lastSpaceIndex;
        } else {
          // If no space found, force split at maxLength
          splitIndex = maxLength;
        }
      }

      const chunk = remainingText.substring(0, splitIndex).trim();
      if (chunk) {
        result.push(chunk);
      }
      remainingText = remainingText.substring(splitIndex).trim();
    }

    return result;
  }

  private addToTranscriptHistory(transcript: string): void {
    const trimmed = transcript.trim();
    if (!trimmed) return; // Don't add empty transcripts

    this.finalTranscriptHistory.push(trimmed);

    // Ensure we don't exceed maxFinalTranscripts
    while (this.finalTranscriptHistory.length > this.maxFinalTranscripts) {
      this.finalTranscriptHistory.shift(); // Remove oldest transcript
    }
  }

  // Get the transcript history
  public getFinalTranscriptHistory(): string[] {
    return [...this.finalTranscriptHistory]; // Return a copy to prevent external modification
  }

  // Get combined transcript history as a single string
  public getCombinedTranscriptHistory(): string {
    return this.finalTranscriptHistory.join(' ');
  }

  // Method to set max final transcripts
  public setMaxFinalTranscripts(maxFinalTranscripts: number): void {
    this.maxFinalTranscripts = maxFinalTranscripts;
    // Trim history if needed after changing the limit
    while (this.finalTranscriptHistory.length > this.maxFinalTranscripts) {
      this.finalTranscriptHistory.shift();
    }
  }

  // Get max final transcripts
  public getMaxFinalTranscripts(): number {
    return this.maxFinalTranscripts;
  }

  public getLastUserTranscript(): string {
    return this.lastUserTranscript;
  }

  public clear(): void {
    this.lines = [];
    this.partialText = '';
    this.finalTranscriptHistory = [];
    this.currentDisplayLines = [];
    this.lastPartialUpdateTime = 0;
  }

  public getMaxCharsPerLine(): number {
    return this.maxCharsPerLine;
  }

  public getMaxLines(): number {
    return this.maxLines;
  }

  /**
   * Change the language mode for text processing
   * @param isChinese - Set to true for Chinese text, false for non-Chinese
   * @param reset - If true, clears the current display and history
   */
  public changeLanguage(langauge: string): void {
    const isChinese = langauge === "zh-CN";
    if (this.isChinese !== isChinese) {
      this.isChinese = isChinese;
      if (isChinese) {
        this.maxCharsPerLine = 10;
      } else {
        this.maxCharsPerLine = 30;
      }
      this.clear();
    }
  }
}

export default TranscriptProcessor;