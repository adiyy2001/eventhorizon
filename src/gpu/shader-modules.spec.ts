import {
  blitShader,
  composeShader,
  declaredNames,
  duplicateDeclarations,
  imageShader,
  parityShader,
  shaderSources,
  tracerModules,
} from './shader-modules';

describe('composeShader', () => {
  it('joins modules in the order given', () => {
    const composed = composeShader(['constants', 'geodesic']);
    expect(composed.indexOf('struct TraceParams')).toBeLessThan(composed.indexOf('fn rk4Step'));
    expect(composed).toBe(`${shaderSources.constants}\n${shaderSources.geodesic}`);
  });

  it('refuses a module listed twice', () => {
    expect(() => composeShader(['constants', 'constants'])).toThrow(RangeError);
  });

  it('puts the shared tracer modules in a fixed order', () => {
    expect(tracerModules).toEqual(['constants', 'geodesic', 'observer', 'disk', 'trace']);
  });
});

describe('composed shaders', () => {
  it.each([
    ['image', imageShader],
    ['parity', parityShader],
    ['blit', blitShader],
  ])('%s declares no name twice', (_, source) => {
    expect(duplicateDeclarations(source)).toEqual([]);
  });

  it('exposes one compute entry point per kernel', () => {
    expect(imageShader).toContain('fn renderImage(');
    expect(parityShader).toContain('fn traceParity(');
    expect(blitShader).toContain('fn vertexMain(');
    expect(blitShader).toContain('fn fragmentMain(');
  });

  it('shares the tracer code between the image and the parity kernel', () => {
    for (const source of [imageShader, parityShader]) {
      expect(source).toContain('fn traceRay(');
      expect(source).toContain('fn rk4Step(');
      expect(source).toContain('fn staticObserverRay(');
    }
  });

  it('contains no comments', () => {
    for (const source of Object.values(shaderSources)) {
      expect(source).not.toMatch(/\/\/|\/\*/);
    }
  });
});

describe('declaredNames', () => {
  it('finds functions, structs, constants and module variables', () => {
    const names = declaredNames(`
      const LIMIT: u32 = 4u;
      struct Pair { a: f32, }
      @group(0) @binding(0) var<uniform> params: Pair;
      fn helper(x: f32) -> f32 { return x; }
    `);
    expect(names).toEqual(['LIMIT', 'Pair', 'params', 'helper']);
  });

  it('reports repeated names', () => {
    expect(duplicateDeclarations('fn a() {}\nfn b() {}\nfn a() {}')).toEqual(['a']);
  });
});
