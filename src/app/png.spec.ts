import { bytesToBase64, rgbaToPngBase64 } from './png';

describe('bytesToBase64', () => {
  it('encodes short input', () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe('SGk=');
  });

  it('encodes input longer than one chunk', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 5).fill(65);
    expect(atob(bytesToBase64(bytes))).toBe('A'.repeat(bytes.length));
  });
});

describe('rgbaToPngBase64', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws the pixels on an offscreen canvas and encodes the blob', async () => {
    const putImageData = vi.fn();
    const convertToBlob = vi.fn(() => Promise.resolve(new Blob([new Uint8Array([72, 105])])));
    class FakeCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { putImageData };
      }
      convertToBlob = convertToBlob;
    }
    class FakeImageData {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    vi.stubGlobal('ImageData', FakeImageData);
    const encoded = await rgbaToPngBase64(new Uint8Array([1, 2, 3, 4]), 1, 1);
    expect(encoded).toBe('SGk=');
    expect(putImageData).toHaveBeenCalledOnce();
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
  });

  it('fails when no 2d context exists', async () => {
    class NoContextCanvas {
      getContext() {
        return null;
      }
    }
    vi.stubGlobal('OffscreenCanvas', NoContextCanvas);
    await expect(rgbaToPngBase64(new Uint8Array(4), 1, 1)).rejects.toThrow('2d canvas context');
  });
});
