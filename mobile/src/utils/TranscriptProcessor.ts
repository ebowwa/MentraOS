export class TranscriptProcessor {
  private maxCharsPerLine: number;
  private maxLines: number;
  private lines: string[] = [];
  private partialText: string = '';

  constructor(maxCharsPerLine: number, maxLines: number) {
    this.maxCharsPerLine = maxCharsPerLine;
    this.maxLines = maxLines;
  }

  public processString(newText: string | null, isFinal: boolean): string {
    newText = (newText || '').trim();

    if (!isFinal) {
      // Store this as the current partial text (overwriting old partial)
      this.partialText = newText;
      return this.buildPreview(this.partialText);
    } else {
      // We have a final text -> clear out the partial text to avoid duplication
      this.partialText = '';

      // Wrap this final text
      const wrapped = this.wrapText(newText, this.maxCharsPerLine);
      wrapped.forEach(chunk => this.appendToLines(chunk));

      // Return only the finalized lines
      return this.getTranscript();
    }
  }

  private buildPreview(partial: string): string {
    // Wrap the partial text
    const partialChunks = this.wrapText(partial, this.maxCharsPerLine);

    // Combine with finalized lines
    let combined = [...this.lines, ...partialChunks];

    // Truncate if necessary
    if (combined.length > this.maxLines) {
      combined = combined.slice(combined.length - this.maxLines);
    }

    // Add padding to ensure exactly maxLines are displayed
    const linesToPad = this.maxLines - combined.length;
    for (let i = 0; i < linesToPad; i++) {
      combined.push(''); // Add empty lines at the end
    }

    return combined.join('\n');
  }

  private appendToLines(chunk: string): void {
    if (this.lines.length === 0) {
      this.lines.push(chunk);
    } else {
      const lastLine = this.lines.pop() || '';
      const candidate = lastLine ? `${lastLine} ${chunk}` : chunk;

      if (candidate.length <= this.maxCharsPerLine) {
        this.lines.push(candidate);
      } else {
        // Put back the last line if it doesn't fit
        this.lines.push(lastLine);
        this.lines.push(chunk);
      }
    }

    // Ensure we don't exceed maxLines
    while (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
  }

  private wrapText(text: string, maxLineLength: number): string[] {
    const result: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLineLength) {
        result.push(remaining);
        break;
      }

      let splitIndex = maxLineLength;
      // Move splitIndex left until we find a space
      while (splitIndex > 0 && remaining[splitIndex] !== ' ') {
        splitIndex--;
      }

      // If no space found, force split at maxLineLength
      if (splitIndex === 0) {
        splitIndex = maxLineLength;
      }

      result.push(remaining.substring(0, splitIndex).trim());
      remaining = remaining.substring(splitIndex).trim();
    }

    return result;
  }

  private getTranscript(): string {
    // Ensure we have exactly maxLines of output
    const result = [...this.lines];
    while (result.length < this.maxLines) {
      result.push('');
    }
    return result.slice(0, this.maxLines).join('\n');
  }

  public clear(): void {
    this.lines = [];
    this.partialText = '';
  }
}

export default TranscriptProcessor;