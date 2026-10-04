import { impactParameter } from '../physics/geodesic';
import { pixelDirection, staticObserverRay, type ViewportSize } from '../physics/observer';
import { traceRay } from '../physics/trace';
import { OUTCOME_CODES } from '../validation/parity';
import { checkerShade, diskShade } from './placeholder-shade';
import { viewBasis, viewDisk, viewTraceOptions, type ViewDescription } from './view';

export interface ReferenceImage {
  size: ViewportSize;
  outcomes: Uint8Array;
  hitRadius: Float32Array;
  shade: Float32Array;
  impactParameters: Float32Array;
}

export function renderReferenceImage(view: ViewDescription, size: ViewportSize): ReferenceImage {
  const pixelCount = size.width * size.height;
  const image: ReferenceImage = {
    size,
    outcomes: new Uint8Array(pixelCount),
    hitRadius: new Float32Array(pixelCount),
    shade: new Float32Array(pixelCount),
    impactParameters: new Float32Array(pixelCount),
  };
  const basis = viewBasis(view);
  const options = viewTraceOptions(view);
  const disk = viewDisk(view);
  const switches = { gravitational: view.gravitationalRedshift, doppler: view.doppler };

  for (let row = 0; row < size.height; row += 1) {
    for (let column = 0; column < size.width; column += 1) {
      const index = row * size.width + column;
      const direction = pixelDirection(
        basis,
        view.verticalFieldOfView,
        size,
        column + 0.5,
        row + 0.5,
      );
      const start = staticObserverRay(basis.position, direction);
      const result = traceRay(start, options);
      image.outcomes[index] = OUTCOME_CODES[result.outcome];
      image.impactParameters[index] = impactParameter(start);
      if (result.diskHit !== null) {
        image.hitRadius[index] = result.diskHit.radius;
        image.shade[index] = diskShade(
          result.diskHit.radius,
          result.diskHit.lambda,
          view.distance,
          disk.innerRadius,
          switches,
        );
      } else if (result.outcome === 'escaped') {
        const { x, y, z } = result.finalDirection;
        image.shade[index] = checkerShade(x, y, z);
      }
    }
  }
  return image;
}
