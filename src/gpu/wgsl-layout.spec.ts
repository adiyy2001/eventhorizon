import { layoutStruct, parseStructDefinition, parseU32Constants, typeLayout } from './wgsl-layout';

describe('layoutStruct', () => {
  it('aligns a vec3f to 16 bytes and lets a following f32 fill its tail', () => {
    const layout = layoutStruct([
      { name: 'direction', type: 'vec3f' },
      { name: 'weight', type: 'f32' },
      { name: 'count', type: 'u32' },
    ]);
    expect(layout.fields.map((field) => field.offset)).toEqual([0, 12, 16]);
    expect(layout.size).toBe(32);
    expect(layout.align).toBe(16);
  });

  it('pads a leading scalar before a vec3f', () => {
    const layout = layoutStruct([
      { name: 'flag', type: 'u32' },
      { name: 'position', type: 'vec3f' },
    ]);
    expect(layout.fields.map((field) => field.offset)).toEqual([0, 16]);
    expect(layout.size).toBe(32);
  });

  it('aligns a vec2f to 8 bytes', () => {
    const layout = layoutStruct([
      { name: 'first', type: 'f32' },
      { name: 'pair', type: 'vec2f' },
    ]);
    expect(layout.fields.map((field) => field.offset)).toEqual([0, 8]);
    expect(layout.size).toBe(16);
  });

  it('reports the size and alignment of every type', () => {
    expect(typeLayout('vec3u')).toEqual({ align: 16, size: 12, components: 3 });
    expect(typeLayout('vec4f')).toEqual({ align: 16, size: 16, components: 4 });
    expect(typeLayout('i32')).toEqual({ align: 4, size: 4, components: 1 });
  });
});

describe('WGSL source parsing', () => {
  const source = `
    const A: u32 = 1u;
    const B: u32 = 16u;
    const C: f32 = 2.0;
    struct Sample {
      first: f32,
      second: vec3f,
      third: u32,
    }
  `;

  it('reads struct fields in order', () => {
    expect(parseStructDefinition(source, 'Sample')).toEqual([
      { name: 'first', type: 'f32' },
      { name: 'second', type: 'vec3f' },
      { name: 'third', type: 'u32' },
    ]);
  });

  it('rejects a missing struct and an unsupported type', () => {
    expect(() => parseStructDefinition(source, 'Missing')).toThrow(RangeError);
    expect(() => parseStructDefinition('struct Odd { m: mat4x4f, }', 'Odd')).toThrow(RangeError);
  });

  it('collects u32 constants only', () => {
    expect(parseU32Constants(source)).toEqual({ A: 1, B: 16 });
  });
});
