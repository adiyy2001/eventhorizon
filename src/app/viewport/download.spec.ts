import { downloadPng } from './download';

describe('downloadPng', () => {
  it('clicks a temporary link that carries the data and the file name', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    downloadPng('QUJD', 'frame.png');
    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('frame.png');
    expect(link.href).toBe('data:image/png;base64,QUJD');
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
  });
});
