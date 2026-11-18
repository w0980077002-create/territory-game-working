import {CLOUD_CHUNK_BYTES,CLOUD_MAX_CHUNKS,measureCloudSave} from './telegram';

// Reserve room for the results of a fight already in progress and subsequent checkpoints.
const warningChunks=CLOUD_MAX_CHUNKS-16;
const sampleStep=CLOUD_CHUNK_BYTES;
// Three UTF-8 bytes per UTF-16 code unit, four base64 bytes per three gzip bytes,
// and a margin for gzip overhead. Small saves need no encoding or compression here.
const uncheckedLength=Math.floor((warningChunks-1)*CLOUD_CHUNK_BYTES/4)-1024;
let sampledLength=0;
let blocked=false;
let checking=false;
let pending:string|undefined;
let generation=0;

export function observeLootSave(raw:string,replaced=false){
 if(replaced||sampledLength&&raw.length<=uncheckedLength){
  generation++;
  pending=undefined;
  sampledLength=0;
  blocked=false;
 }
 if(raw.length<=uncheckedLength)return;
 const change=raw.length-sampledLength;
 if(sampledLength&&Math.abs(change)<sampleStep&&!(blocked&&change<0))return;
 sampledLength=raw.length;
 pending=raw;
 if(!checking)void measurePendingSave();
}

async function measurePendingSave(){
 checking=true;
 while(pending!==undefined){
  const raw=pending,currentGeneration=generation;
  pending=undefined;
  const {chunks}=await measureCloudSave(raw);
  if(currentGeneration===generation)blocked=chunks>=warningChunks;
 }
 checking=false;
}

export function lootStorageNotice(){
 if(blocked)return 'Сохранение близко к пределу копии Telegram · распылите ненужные вещи в рюкзаке или на складе';
 if(checking&&sampledLength)return 'Проверяем размер сохранения · повторите через мгновение';
 return undefined;
}
