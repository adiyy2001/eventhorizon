fn finishTrace(result: TraceResult, ray: Ray, outcome: u32, steps: u32, crossings: u32, flags: u32) -> TraceResult {
  var finished = result;
  finished.outcome = outcome;
  finished.steps = steps;
  finished.crossings = crossings;
  finished.flags = flags;
  finished.direction = normalize(ray.velocity);
  return finished;
}

fn traceRay(initial: Ray, params: TraceParams) -> TraceResult {
  var ray = initial;
  var result: TraceResult;
  let lensing = hasFlag(params, FLAG_LENSING);
  let hasDisk = hasFlag(params, FLAG_DISK);
  let captureRadius = SCHWARZSCHILD_RADIUS * (1.0 + params.captureMargin);
  var crossingLimit = 1u;
  if (hasFlag(params, FLAG_HIGHER_ORDER)) {
    crossingLimit = params.maxCrossings;
  }
  var steps = 0u;
  var planeCrossings = 0u;

  loop {
    let radius = length(ray.position);
    let radialRate = dot(ray.position, ray.velocity);
    if (lensing && (radius < captureRadius || (radius < PHOTON_SPHERE_RADIUS && radialRate < 0.0))) {
      return finishTrace(result, ray, OUTCOME_CAPTURED, steps, planeCrossings, 0u);
    }
    if (radius > params.escapeRadius && radialRate > 0.0) {
      return finishTrace(result, ray, OUTCOME_ESCAPED, steps, planeCrossings, 0u);
    }
    if (steps >= params.maxSteps) {
      return finishTrace(result, ray, OUTCOME_CAPTURED, steps, planeCrossings, RESULT_STEP_LIMIT);
    }

    let previous = ray;
    let span = stepSize(ray, params, lensing);
    ray = rk4Step(ray, span, lensing);
    steps = steps + 1u;

    if (!lensing && segmentEntersSphere(previous, ray, captureRadius)) {
      return finishTrace(result, ray, OUTCOME_CAPTURED, steps, planeCrossings, 0u);
    }

    if (hasDisk && planeCrossings < crossingLimit && crossesPlane(previous.position.y, ray.position.y)) {
      planeCrossings = planeCrossings + 1u;
      let crossing = planeCrossing(previous, ray, span);
      if (isInsideAnnulus(crossing.radius, params)) {
        result.hitRadius = crossing.radius;
        result.hitLambda = crossing.lambda;
        result.hitX = crossing.x;
        result.hitZ = crossing.z;
        result.hitIndex = planeCrossings;
        return finishTrace(result, ray, OUTCOME_DISK, steps, planeCrossings, 0u);
      }
    }
  }
}
