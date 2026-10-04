import { type Vec3, dot, normalize, vec3 } from '../physics/vec3';

export interface CubeFace {
  forward: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
}

export const CUBE_FACES: readonly CubeFace[] = [
  { forward: vec3(1, 0, 0), uAxis: vec3(0, 0, -1), vAxis: vec3(0, -1, 0) },
  { forward: vec3(-1, 0, 0), uAxis: vec3(0, 0, 1), vAxis: vec3(0, -1, 0) },
  { forward: vec3(0, 1, 0), uAxis: vec3(1, 0, 0), vAxis: vec3(0, 0, 1) },
  { forward: vec3(0, -1, 0), uAxis: vec3(1, 0, 0), vAxis: vec3(0, 0, -1) },
  { forward: vec3(0, 0, 1), uAxis: vec3(1, 0, 0), vAxis: vec3(0, -1, 0) },
  { forward: vec3(0, 0, -1), uAxis: vec3(-1, 0, 0), vAxis: vec3(0, -1, 0) },
];

export const FACE_COUNT = CUBE_FACES.length;

export function cubeFace(index: number): CubeFace {
  const face = CUBE_FACES[index];
  if (face === undefined) {
    throw new RangeError(`cube face ${String(index)} does not exist`);
  }
  return face;
}

export function faceDirection(faceIndex: number, u: number, v: number): Vec3 {
  const face = cubeFace(faceIndex);
  return normalize(
    vec3(
      face.forward.x + u * face.uAxis.x + v * face.vAxis.x,
      face.forward.y + u * face.uAxis.y + v * face.vAxis.y,
      face.forward.z + u * face.uAxis.z + v * face.vAxis.z,
    ),
  );
}

export interface FaceCoordinates {
  u: number;
  v: number;
  depth: number;
}

export function faceCoordinates(faceIndex: number, direction: Vec3): FaceCoordinates {
  const face = cubeFace(faceIndex);
  const depth = dot(direction, face.forward);
  return { u: dot(direction, face.uAxis) / depth, v: dot(direction, face.vAxis) / depth, depth };
}

export function dominantFace(direction: Vec3): number {
  let best = 0;
  let bestDepth = -Infinity;
  CUBE_FACES.forEach((face, index) => {
    const depth = dot(direction, face.forward);
    if (depth > bestDepth) {
      bestDepth = depth;
      best = index;
    }
  });
  return best;
}

export function texelCenterCoordinate(index: number, size: number): number {
  return (2 * (index + 0.5)) / size - 1;
}

export function texelDirection(faceIndex: number, column: number, row: number, size: number): Vec3 {
  return faceDirection(
    faceIndex,
    texelCenterCoordinate(column, size),
    texelCenterCoordinate(row, size),
  );
}
