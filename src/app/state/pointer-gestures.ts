export type GestureMode = 'camera' | 'split';

export interface PointerSample {
  x: number;
  y: number;
  fractionX: number;
}

export type GestureDelta =
  | { kind: 'orbit'; azimuth: number; inclination: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'split'; position: number };

export const dragRadiansPerPixel = 0.008;
export const wheelZoomPerUnit = 0.001;
export const splitGrabFraction = 0.03;

interface Tracked {
  last: PointerSample;
  mode: GestureMode;
}

function distance(first: PointerSample, second: PointerSample): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function gestureModeAt(
  fractionX: number,
  split: { enabled: boolean; position: number },
): GestureMode {
  return split.enabled && Math.abs(fractionX - split.position) <= splitGrabFraction
    ? 'split'
    : 'camera';
}

export class PointerGestures {
  private readonly pointers = new Map<number, Tracked>();

  get active(): boolean {
    return this.pointers.size > 0;
  }

  down(id: number, sample: PointerSample, mode: GestureMode): void {
    this.pointers.set(id, { last: sample, mode });
  }

  up(id: number): void {
    this.pointers.delete(id);
  }

  cancel(): void {
    this.pointers.clear();
  }

  move(id: number, sample: PointerSample): GestureDelta | null {
    const tracked = this.pointers.get(id);
    if (tracked === undefined) {
      return null;
    }
    const previous = tracked.last;
    const others = [...this.pointers.entries()].filter(([key]) => key !== id);
    const delta = this.deltaFor(tracked, previous, sample, others[0]?.[1]);
    tracked.last = sample;
    return delta;
  }

  wheel(deltaY: number): GestureDelta {
    return { kind: 'zoom', factor: Math.exp(deltaY * wheelZoomPerUnit) };
  }

  private deltaFor(
    tracked: Tracked,
    previous: PointerSample,
    sample: PointerSample,
    other: Tracked | undefined,
  ): GestureDelta | null {
    if (tracked.mode === 'split') {
      return { kind: 'split', position: sample.fractionX };
    }
    if (other !== undefined) {
      const before = distance(previous, other.last);
      const after = distance(sample, other.last);
      return before > 0 && after > 0 ? { kind: 'zoom', factor: before / after } : null;
    }
    const dx = sample.x - previous.x;
    const dy = sample.y - previous.y;
    if (dx === 0 && dy === 0) {
      return null;
    }
    return {
      kind: 'orbit',
      azimuth: -dx * dragRadiansPerPixel,
      inclination: -dy * dragRadiansPerPixel,
    };
  }
}
