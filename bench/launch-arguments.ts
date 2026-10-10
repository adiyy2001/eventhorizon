export const webGpuLaunchArguments = [
  '--enable-unsafe-webgpu',
  '--use-webgpu-adapter=swiftshader',
  '--use-angle=swiftshader',
  '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
];

export const hardwareGpuLaunchArguments = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

export function benchLaunchArguments(environment: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (environment['EVENTHORIZON_EXTRA_FLAGS'] ?? '').split(' ').filter(Boolean);
  return environment['EVENTHORIZON_HARDWARE_GPU'] === '1'
    ? [...hardwareGpuLaunchArguments, ...extra]
    : [...webGpuLaunchArguments, ...extra];
}
