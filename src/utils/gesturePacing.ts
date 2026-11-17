export const TOOL_CYCLE_MIN_INTERVAL_MS = 400; // 400ms cooldown between item switches
export const TOOL_CYCLE_STEP_PX = 55; // Natural hand motion threshold per switch
export const TOOL_CYCLE_BURST_RESET_MS = 160; // Idle gap separating distinct gestures

export class PacedGestureStepper {
  private lastStepAt = -Infinity;
  private touchAccumY = 0;

  private lastWheelAt = -Infinity;
  private wheelAccumY = 0;
  private prevWheelAbs = 0;
  private wheelPeakAbs = 0;
  private wheelDecayCount = 0;
  private inDecayMomentum = false;

  constructor(
    private readonly minIntervalMs: number = TOOL_CYCLE_MIN_INTERVAL_MS,
    private readonly stepThresholdPx: number = TOOL_CYCLE_STEP_PX
  ) {}

  resetTouch(): void {
    this.touchAccumY = 0;
  }

  consumeTouchDelta(deltaY: number, now: number = performance.now()): 1 | -1 | 0 {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;

    if (now - this.lastStepAt < this.minIntervalMs) {
      // Never queue excess finger movement during the 400ms cooldown window
      this.touchAccumY = 0;
      return 0;
    }

    if (this.touchAccumY !== 0 && Math.sign(deltaY) !== Math.sign(this.touchAccumY)) {
      this.touchAccumY = 0;
    }

    this.touchAccumY += deltaY;
    if (Math.abs(this.touchAccumY) >= this.stepThresholdPx) {
      const dir: 1 | -1 = this.touchAccumY < 0 ? 1 : -1;
      this.touchAccumY = 0;
      this.lastStepAt = now;
      return dir;
    }
    return 0;
  }

  consumeWheelDelta(
    deltaY: number,
    deltaMode: number = 0,
    now: number = performance.now()
  ): 1 | -1 | 0 {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;

    const scaledY =
      deltaMode === 1 ? deltaY * 32 : deltaMode === 2 ? deltaY * 120 : deltaY;
    const absDelta = Math.abs(scaledY);
    const dt = now - this.lastWheelAt;
    this.lastWheelAt = now;

    if (dt > TOOL_CYCLE_BURST_RESET_MS) {
      // New gesture burst after idle pause
      this.wheelAccumY = 0;
      this.wheelDecayCount = 0;
      this.inDecayMomentum = false;
      this.prevWheelAbs = absDelta;
      this.wheelPeakAbs = absDelta;

      if (absDelta >= 50 && now - this.lastStepAt >= this.minIntervalMs) {
        this.lastStepAt = now;
        return scaledY < 0 ? 1 : -1;
      }
    } else {
      if (this.wheelAccumY !== 0 && Math.sign(scaledY) !== Math.sign(this.wheelAccumY)) {
        this.wheelAccumY = 0;
        this.wheelDecayCount = 0;
        this.inDecayMomentum = false;
        this.wheelPeakAbs = absDelta;
      }

      if (deltaMode === 0) {
        if (absDelta > this.prevWheelAbs * 1.25 + 3 && absDelta >= 16) {
          this.wheelDecayCount = 0;
          this.inDecayMomentum = false;
        } else if (absDelta < this.prevWheelAbs * 0.88 && absDelta < 38) {
          this.wheelDecayCount += 1;
          if (
            this.wheelDecayCount >= 2 ||
            (now - this.lastStepAt < this.minIntervalMs && absDelta < this.wheelPeakAbs * 0.65 && absDelta < 28)
          ) {
            this.inDecayMomentum = true;
          }
        }
      }

      this.prevWheelAbs = absDelta;
      if (absDelta > this.wheelPeakAbs) this.wheelPeakAbs = absDelta;
    }

    if (this.inDecayMomentum) {
      this.wheelAccumY = 0;
      return 0;
    }

    if (now - this.lastStepAt < this.minIntervalMs) {
      this.wheelAccumY = 0;
      return 0;
    }

    this.wheelAccumY += scaledY;
    if (Math.abs(this.wheelAccumY) >= this.stepThresholdPx) {
      const dir: 1 | -1 = this.wheelAccumY < 0 ? 1 : -1;
      this.wheelAccumY = 0;
      this.lastStepAt = now;
      return dir;
    }

    return 0;
  }
}
