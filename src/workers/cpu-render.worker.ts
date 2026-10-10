import { transferablesOf } from './protocol';
import { TileHandler } from './tile-handler';

const handler = new TileHandler(() => performance.now());
handler.warmUp();

addEventListener('message', (event: MessageEvent<unknown>) => {
  const response = handler.receive(event.data);
  postMessage(response, transferablesOf(response));
});
