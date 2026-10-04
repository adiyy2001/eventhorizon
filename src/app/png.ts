const chunkSize = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}

export async function rgbaToPngBase64(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<string> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2d canvas context is not available');
  }
  const pixels = new Uint8ClampedArray(rgba.length);
  pixels.set(rgba);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
