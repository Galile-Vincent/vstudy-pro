/**
 * Strip terminal control strings before setup output reaches xterm.
 * Retain text, C0 execution, ANSI CSI, and ordinary ESC commands across arbitrary chunks.
 * Buffer incomplete commands with a fixed bound and never retain string payloads.
 * @packageDocumentation
 */
type State =
  | { kind: 'text' | 'escape' | 'osc' | 'string' | 'string-escape' | 'escape-ignore' | 'csi-ignore' }
  | { kind: 'escape-intermediate' | 'csi-entry' | 'csi-param' | 'csi-intermediate'; sequence: string };

const ESC = '\x1b';
const MAX_SEQUENCE = 4096;

export class TerminalText {
  private state: State = { kind: 'text' };

  filter(value: string): string {
    let output = '';
    for (const char of value) {
      const code = char.charCodeAt(0);
      if (code === 0x18 || code === 0x1a || code === 0x9c) {
        this.state = { kind: 'text' };
        continue;
      }
      if (code === 0x1b) {
        const inString = this.state.kind === 'osc' || this.state.kind === 'string' || this.state.kind === 'string-escape';
        this.state = { kind: inString ? 'string-escape' : 'escape' };
        continue;
      }
      if (code >= 0x80 && code <= 0x9f) {
        switch (code) {
          case 0x9b: this.state = { kind: 'csi-entry', sequence: `${ESC}[` }; break;
          case 0x9d: this.state = { kind: 'osc' }; break;
          case 0x90: case 0x98: case 0x9e: case 0x9f: this.state = { kind: 'string' }; break;
          default: this.state = { kind: 'text' };
        }
        continue;
      }
      if (this.state.kind === 'osc' || this.state.kind === 'string') {
        if (code === 0x07 && this.state.kind === 'osc') this.state = { kind: 'text' };
        continue;
      }
      if (this.state.kind === 'string-escape') {
        // xterm treats a non-ST escape as cancellation followed by a fresh ESC command.
        this.state = { kind: char === '\\' ? 'text' : 'escape' };
        if (char === '\\') continue;
      }
      if (code < 0x20) {
        output += char;
        continue;
      }
      if (code === 0x7f) continue;

      const state = this.state;
      switch (state.kind) {
        case 'text':
          output += char;
          break;
        case 'escape':
          switch (char) {
            case '[': this.state = { kind: 'csi-entry', sequence: `${ESC}[` }; break;
            case ']': this.state = { kind: 'osc' }; break;
            case 'P': case 'X': case '^': case '_': this.state = { kind: 'string' }; break;
            case '\\': this.state = { kind: 'text' }; break;
            default:
              if (code >= 0x20 && code <= 0x2f) {
                this.state = { kind: 'escape-intermediate', sequence: ESC + char };
              } else {
                if (code >= 0x30 && code <= 0x7e) output += ESC + char;
                this.state = { kind: 'text' };
              }
          }
          break;
        case 'escape-intermediate':
          if (code >= 0x30 && code <= 0x7e) {
            output += state.sequence + char;
            this.state = { kind: 'text' };
          } else if (code >= 0x20 && code <= 0x2f) {
            this.state = state.sequence.length < MAX_SEQUENCE
              ? { kind: state.kind, sequence: state.sequence + char }
              : { kind: 'escape-ignore' };
          } else {
            this.state = { kind: 'text' };
          }
          break;
        case 'csi-entry': case 'csi-param': case 'csi-intermediate':
          if (code >= 0x40 && code <= 0x7e) {
            output += state.sequence + char;
            this.state = { kind: 'text' };
          } else if (state.sequence.length >= MAX_SEQUENCE) {
            this.state = { kind: 'csi-ignore' };
          } else if (code >= 0x20 && code <= 0x2f) {
            this.state = { kind: 'csi-intermediate', sequence: state.sequence + char };
          } else if (state.kind !== 'csi-intermediate' && code >= 0x30 && code <= (state.kind === 'csi-entry' ? 0x3f : 0x3b)) {
            this.state = { kind: 'csi-param', sequence: state.sequence + char };
          } else {
            this.state = { kind: code >= 0x30 && code <= 0x3f ? 'csi-ignore' : 'text' };
          }
          break;
        case 'escape-ignore': case 'csi-ignore':
          if (code >= (state.kind === 'escape-ignore' ? 0x30 : 0x40) && code <= 0x7e) this.state = { kind: 'text' };
          break;
      }
    }
    return output;
  }
}
