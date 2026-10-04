import { ISCO_RADIUS } from '../physics/constants';
import { cameraBasis, directionAtAngle, staticObserverRay } from '../physics/observer';
import { defaultTraceOptions, traceRay } from '../physics/trace';
import { staticObserverState32, traceRayFloat32 } from '../physics/trace-float32';
import { OUTCOME_CODES } from './parity';
import { recordFromFloat32, recordFromTrace } from './records';

const basis = cameraBasis({ distance: 30, inclination: 1.4, azimuth: 0, verticalFieldOfView: 1 });
const options = defaultTraceOptions(30, { innerRadius: ISCO_RADIUS, outerRadius: 20 });

describe('records', () => {
  it('turns a float64 trace into a record', () => {
    const direction = directionAtAngle(basis, 0.35);
    const record = recordFromTrace(traceRay(staticObserverRay(basis.position, direction), options));
    expect([OUTCOME_CODES.escaped, OUTCOME_CODES.disk]).toContain(record.outcome);
    expect(record.steps).toBeGreaterThan(0);
    expect(record.direction).toHaveLength(3);
  });

  it('turns a float32 trace into the same kind of record', () => {
    const direction = directionAtAngle(basis, 0.35);
    const reference = recordFromTrace(
      traceRay(staticObserverRay(basis.position, direction), options),
    );
    const record = recordFromFloat32(
      traceRayFloat32(staticObserverState32(basis.position, direction), options),
    );
    expect(record.outcome).toBe(reference.outcome);
    expect(record.hitIndex).toBe(reference.hitIndex);
  });

  it('records zero hit data for a ray that misses the disk', () => {
    const direction = directionAtAngle(basis, 0);
    const record = recordFromTrace(traceRay(staticObserverRay(basis.position, direction), options));
    expect(record.outcome).toBe(OUTCOME_CODES.captured);
    expect(record.hitRadius).toBe(0);
    expect(record.hitIndex).toBe(0);
  });
});
