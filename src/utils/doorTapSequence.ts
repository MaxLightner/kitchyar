/** An open front closes on one tap. A closed front opens only on two taps on the same part. */
export class DoorTapSequence {
  private first: { id: string; type: string; at: number; x: number; y: number } | null = null;

  reset() { this.first = null; }

  next(id: string, open: boolean, type: string, at: number, x: number, y: number): 0 | 1 | null {
    const previous = this.first;
    if (open) {
      this.reset();
      return 0;
    }
    if (previous?.id === id && previous.type === type && at >= previous.at && at - previous.at <= 450 &&
        Math.hypot(x - previous.x, y - previous.y) <= (type === 'touch' ? 28 : 16)) {
      this.reset();
      return 1;
    }
    this.first = { id, type, at, x, y };
    return null;
  }
}
