import {art} from '../data/catalog';

let loadedRevision = 0;
const decoding = new WeakSet<HTMLImageElement>();
export const sceneImageRevision = () => loadedRevision;
export const sceneImageReady = (image: HTMLImageElement | undefined): image is HTMLImageElement =>
  !!image && image.complete && !!image.naturalWidth && !decoding.has(image);

export function sceneImage(id: string, priority: 'high'|'auto' = 'auto') {
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = priority;
  const ready = () => { decoding.delete(image); loadedRevision++; };
  const canDecode = typeof image.decode === 'function';
  if (canDecode) decoding.add(image);
  else image.onload = ready;
  image.src = art(id);
  if(canDecode) void image.decode().then(ready,ready);
  return image;
}
