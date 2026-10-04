export interface ShaderMessage {
  type: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  message: string;
}

export interface CompiledShader {
  module: GPUShaderModule;
  messages: ShaderMessage[];
}

export async function compileShader(
  device: GPUDevice,
  label: string,
  code: string,
): Promise<CompiledShader> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const messages = info.messages.map((message): ShaderMessage => ({
    type: message.type,
    line: message.lineNum,
    column: message.linePos,
    message: message.message,
  }));
  const errors = messages.filter((message) => message.type === 'error');
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(
      `shader ${label} failed to compile: ${first?.message ?? 'unknown error'} at line ${String(first?.line ?? 0)}`,
    );
  }
  return { module, messages };
}
