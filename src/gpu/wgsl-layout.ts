export type WgslScalarType = 'f32' | 'u32' | 'i32';
export type WgslVectorType = 'vec2f' | 'vec3f' | 'vec4f' | 'vec2u' | 'vec3u' | 'vec4u';
export type WgslFieldType = WgslScalarType | WgslVectorType;

export interface TypeLayout {
  align: number;
  size: number;
  components: number;
}

export interface FieldDefinition {
  name: string;
  type: WgslFieldType;
}

export interface FieldLayout extends FieldDefinition {
  offset: number;
  align: number;
  size: number;
}

export interface StructLayout {
  fields: FieldLayout[];
  align: number;
  size: number;
}

const typeLayouts: Record<WgslFieldType, TypeLayout> = {
  f32: { align: 4, size: 4, components: 1 },
  u32: { align: 4, size: 4, components: 1 },
  i32: { align: 4, size: 4, components: 1 },
  vec2f: { align: 8, size: 8, components: 2 },
  vec3f: { align: 16, size: 12, components: 3 },
  vec4f: { align: 16, size: 16, components: 4 },
  vec2u: { align: 8, size: 8, components: 2 },
  vec3u: { align: 16, size: 12, components: 3 },
  vec4u: { align: 16, size: 16, components: 4 },
};

export function isWgslFieldType(name: string): name is WgslFieldType {
  return name in typeLayouts;
}

export function typeLayout(type: WgslFieldType): TypeLayout {
  return typeLayouts[type];
}

function roundUp(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

export function layoutStruct(definitions: readonly FieldDefinition[]): StructLayout {
  let offset = 0;
  let structAlign = 1;
  const fields = definitions.map((definition) => {
    const { align, size } = typeLayout(definition.type);
    offset = roundUp(offset, align);
    const field: FieldLayout = { ...definition, offset, align, size };
    offset += size;
    structAlign = Math.max(structAlign, align);
    return field;
  });
  return { fields, align: structAlign, size: roundUp(offset, structAlign) };
}

export function parseStructDefinition(source: string, structName: string): FieldDefinition[] {
  const declaration = new RegExp(`struct\\s+${structName}\\s*\\{([^}]*)\\}`).exec(source);
  const body = declaration?.[1];
  if (body === undefined) {
    throw new RangeError(`struct ${structName} not found`);
  }
  return body
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [name = '', type = ''] = entry.split(':').map((part) => part.trim());
      if (!isWgslFieldType(type)) {
        throw new RangeError(`unsupported type ${type} in ${structName}.${name}`);
      }
      return { name, type };
    });
}

export function parseU32Constants(source: string): Record<string, number> {
  const constants: Record<string, number> = {};
  for (const match of source.matchAll(/const\s+(\w+)\s*:\s*u32\s*=\s*(\d+)u\s*;/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      constants[name] = Number(value);
    }
  }
  return constants;
}
