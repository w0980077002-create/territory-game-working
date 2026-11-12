/** Compatibility facade: Codex's `sound(kind, enabled)` calls now go through the single AudioDirector. */
import {audio,type Sfx} from './AudioDirector';
export function unlockAudio(enabled=true){audio.unlock(enabled)}
export function sound(kind:Sfx,enabled:boolean){if(enabled)audio.play(kind)}
