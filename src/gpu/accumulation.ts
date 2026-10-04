const R2_FIRST = 0.7548776662466927;
const R2_SECOND = 0.5698402909980532;

export interface Jitter {
  x: number;
  y: number;
}

function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

export function jitterForFrame(frameIndex: number): Jitter {
  return {
    x: fractionalPart(0.5 + frameIndex * R2_FIRST) - 0.5,
    y: fractionalPart(0.5 + frameIndex * R2_SECOND) - 0.5,
  };
}

export function historyWeight(framesAccumulated: number): number {
  return 1 / (framesAccumulated + 1);
}
