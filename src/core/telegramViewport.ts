import {tg} from './telegram';

const edges = ['top','right','bottom','left'] as const;
type Insets = Partial<Record<typeof edges[number],number>>;
type ViewportEvent = 'viewportChanged'|'safeAreaChanged'|'contentSafeAreaChanged'|'fullscreenChanged'|'fullscreenFailed';
type ViewportHandler = (event?: {isStateStable?: boolean;error?: string}) => void;
type ViewportBridge = NonNullable<ReturnType<typeof tg>> & {
  isFullscreen?: boolean;
  isOrientationLocked?: boolean;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  onEvent?: (event: ViewportEvent, handler: ViewportHandler) => void;
  offEvent?: (event: ViewportEvent, handler: ViewportHandler) => void;
};

export function observeTelegramViewport(onLayout: () => void) {
  const bridge = tg() as ViewportBridge | undefined;
  const style = document.documentElement.style;
  const portrait = window.matchMedia('(orientation: portrait)');
  const properties = new Map<string,string>();
  let frame = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let unstable = false;
  let expanded = false;
  let lockedHere = false;

  const write = (name: string, value: string) => {
    if (!properties.has(name)) properties.set(name,style.getPropertyValue(name));
    if (style.getPropertyValue(name) !== value) style.setProperty(name,value);
  };
  const apply = () => {
    frame = 0;
    if (unstable) return;
    if (bridge) {
      // Bound the stable height to the WebView's real space, including rotation and split-screen.
      const height = bridge.viewportStableHeight;
      if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
        write('--game-viewport-height',Math.min(height,window.innerHeight)+'px');
      }
      for (const edge of edges) {
        const system = bridge.safeAreaInset?.[edge];
        const content = bridge.contentSafeAreaInset?.[edge];
        if (Number.isFinite(system)) write('--game-system-'+edge,Math.max(0,system!)+ 'px');
        if (Number.isFinite(content)) write('--game-content-'+edge,Math.max(0,content!)+ 'px');
      }
    }
    onLayout();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  const unlock = () => {
    if (!lockedHere) return;
    lockedHere = false;
    try { bridge?.unlockOrientation?.(); } catch { /* Older clients can ignore orientation. */ }
  };
  const orientation = () => {
    const deviceMode = screen.orientation?.type;
    const vertical = deviceMode ? deviceMode.startsWith('portrait') : portrait.matches;
    if (!bridge?.isFullscreen || !portrait.matches || !vertical) unlock();
    else if (!lockedHere && !bridge.isOrientationLocked && bridge.lockOrientation) {
      try { bridge.lockOrientation(); lockedHere = true; } catch { /* The WebView remains usable. */ }
    }
    schedule();
  };
  const expand = () => {
    if (expanded || bridge?.isFullscreen) return;
    expanded = true;
    try { bridge?.expand(); } catch { /* Browser layout is still available. */ }
  };
  const fullChanged = () => {
    clearTimeout(deadline);
    unstable = false;
    if (!bridge?.isFullscreen) expand();
    orientation();
  };
  const fullFailed: ViewportHandler = ({error} = {}) => {
    clearTimeout(deadline);
    if (error !== 'ALREADY_FULLSCREEN') expand();
    unstable = false;
    orientation();
  };
  const viewportChanged: ViewportHandler = event => {
    unstable = event?.isStateStable === false;
    if (!unstable) orientation();
  };
  const listeners = [
    ['viewportChanged',viewportChanged],['safeAreaChanged',schedule],['contentSafeAreaChanged',schedule],
    ['fullscreenChanged',fullChanged],['fullscreenFailed',fullFailed],
  ] as const;
  if (bridge?.onEvent && bridge.offEvent) {
    for (const [event,listener] of listeners) bridge.onEvent(event,listener);
  }

  window.addEventListener('resize',schedule);
  window.addEventListener('pageshow',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  if(portrait.addEventListener)portrait.addEventListener('change',orientation);
  else portrait.addListener(orientation);
  screen.orientation?.addEventListener?.('change',orientation);
  if (bridge) {
    const supported = bridge.requestFullscreen && (bridge.isVersionAtLeast?.('8.0') ?? true);
    if (bridge.isFullscreen) orientation();
    else if (supported) {
      deadline = setTimeout(() => {
        unstable = false;
        expand();
        orientation();
      },1600);
      try { bridge.requestFullscreen!(); } catch { fullFailed(); }
    } else expand();
  }
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(deadline);
    if (bridge?.onEvent && bridge.offEvent) {
      for (const [event,listener] of listeners) bridge.offEvent(event,listener);
    }
    window.removeEventListener('resize',schedule);
    window.removeEventListener('pageshow',schedule);
    window.visualViewport?.removeEventListener('resize',schedule);
    if(portrait.removeEventListener)portrait.removeEventListener('change',orientation);
    else portrait.removeListener(orientation);
    screen.orientation?.removeEventListener?.('change',orientation);
    unlock();
    for (const [name,value] of properties) {
      if (value) style.setProperty(name,value);
      else style.removeProperty(name);
    }
  };
}
