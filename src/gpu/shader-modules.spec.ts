import {
  compiledShaders,
  composeShader,
  declaredNames,
  duplicateDeclarations,
  imageShader,
  parityShader,
  presentShader,
  bloomShader,
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
    expect(tracerModules).toEqual([
      'constants',
      'geodesic',
      'observer',
      'disk',
      'overlay',
      'trace',
    ]);
  });
});

describe('composed shaders', () => {
  it.each(Object.entries(compiledShaders))('%s declares no name twice', (_, source) => {
    expect(duplicateDeclarations(source)).toEqual([]);
  });

  it('exposes one compute entry point per kernel', () => {
    expect(imageShader).toContain('fn renderImage(');
    expect(parityShader).toContain('fn traceParity(');
    expect(presentShader).toContain('fn vertexMain(');
    expect(presentShader).toContain('fn fragmentMain(');
    expect(bloomShader).toContain('fn downsampleFirst(');
    expect(bloomShader).toContain('fn downsample(');
    expect(bloomShader).toContain('fn upsample(');
    expect(compiledShaders.bake).toContain('fn bakeNebula(');
    expect(compiledShaders.accumulate).toContain('fn accumulate(');
    expect(compiledShaders.colorparity).toContain('fn colorParity(');
  });

  it('shares the tracer code between the image and the parity kernel', () => {
    for (const source of [imageShader, parityShader]) {
      expect(source).toContain('fn traceRay(');
      expect(source).toContain('fn rk4Step(');
      expect(source).toContain('fn staticObserverRay(');
    }
  });

  it('keeps the colour modules out of the tracer parity kernel', () => {
    expect(parityShader).not.toContain('fn starRadiance(');
    expect(parityShader).not.toContain('temperatureLut');
  });

  it('shares the sky code between the image kernel and the colour parity kernel', () => {
    for (const source of [imageShader, compiledShaders.colorparity]) {
      expect(source).toContain('fn starRadiance(');
      expect(source).toContain('fn blackbodyRadiance(');
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
