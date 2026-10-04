export function downloadPng(base64: string, fileName: string, target: Document = document): void {
  const link = target.createElement('a');
  link.href = `data:image/png;base64,${base64}`;
  link.download = fileName;
  target.body.append(link);
  link.click();
  link.remove();
}
