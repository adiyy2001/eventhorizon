export const rowAlignment = 256;

export function paddedBytesPerRow(width: number, bytesPerPixel: number): number {
  return Math.ceil((width * bytesPerPixel) / rowAlignment) * rowAlignment;
}

export function removeRowPadding(
  padded: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
): Uint8Array {
  const rowBytes = width * bytesPerPixel;
  const stride = paddedBytesPerRow(width, bytesPerPixel);
  const packed = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    packed.set(padded.subarray(row * stride, row * stride + rowBytes), row * rowBytes);
  }
  return packed;
}

export function workgroupCount(elements: number, workgroupSize: number): number {
  return Math.ceil(elements / workgroupSize);
}

export function rayBuffer(
  rays: readonly {
    position: readonly [number, number, number];
    direction: readonly [number, number, number];
  }[],
): Float32Array {
  const values = new Float32Array(rays.length * 8);
  rays.forEach((ray, index) => {
    values.set(ray.position, index * 8);
    values.set(ray.direction, index * 8 + 4);
  });
  return values;
}
