import {useEffect, useRef, useState} from 'react';
import {communityEnabled,CommunityError,readW066Snapshot,storeW066Snapshot} from '../community/client';
import {stageLabel} from '../core/formulas';
import {LEGACY_SAVE_KEY, telegramProfile} from '../core/profile';
import {acknowledgeCloud, exportSave, isolatedProfile, parseSave, SAVE_KEY, unreadableSave, useGame} from '../core/store';
import {readCloud} from '../core/telegram';
import type {Player} from '../core/types';
import {DialogShell} from './SagaUI';

const MAX_SAVE_TEXT = 4_000_000;
const number = new Intl.NumberFormat('ru-RU');
const reveal = (element:HTMLElement|null) => {element?.scrollIntoView({block:'nearest'})};

export function SaveTools() {
  const [candidate,setCandidate] = useState<{player:Player;cloud?:string}>();
  const [backupText,setBackupText] = useState<string>();
  const [pasteOpen,setPasteOpen] = useState(false);
  const [serverRevision,setServerRevision] = useState<number>();
  const [serverBusy,setServerBusy] = useState(false);
  const paste = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const notice = useGame(state=>state.notice);
  const open = useGame(state=>state.open);
  useEffect(()=>()=>{request.current++},[]);
  const current = (id:number) => id===request.current && useGame.getState().panel==='save-tools';
  const beginPreview = () => {
    setCandidate(undefined);
    setServerRevision(undefined);
    setServerBusy(false);
    return ++request.current;
  };
  const saveText = () => useGame.getState().recoveryRequired ? unreadableSave() : exportSave();
  const download = () => {
    const url = URL.createObjectURL(new Blob([saveText()],{type:'application/json'}));
    const link = document.createElement('a');
    link.href=url;
    link.download='viking-vs-rome-save.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    const id=request.current;
    const text=saveText();
    setBackupText(text);
    try{
      await navigator.clipboard.writeText(text);
      if(current(id))notice('Резервная копия скопирована · сохраните её в «Избранном» Telegram или в заметках');
    }catch{
      if(current(id))notice('Выделите текст копии ниже и выберите «Копировать»');
    }
  };
  const previewCloud = async () => {
    const id=beginPreview();
    const result=await readCloud();
    if(!current(id))return;
    if(result.status!=='found'){
      notice(result.status==='empty'?'В Telegram пока нет резервной копии':'Копия Telegram недоступна · попробуйте ещё раз');
      return;
    }
    const player=parseSave(result.raw,true);
    if(player)setCandidate({player,cloud:result.raw});
    else notice('Копия Telegram повреждена · можно восстановиться из файла');
  };
  const previewServer = async (previous:boolean) => {
    const id=beginPreview();
    setServerBusy(true);
    try {
      const snapshot=await readW066Snapshot(previous);
      if(!current(id))return;
      if(!snapshot){
        if(!previous)setServerRevision(0);
        notice(previous?'Предыдущей копии W066 пока нет':'В W066 пока нет копии');
        return;
      }
      if(!previous)setServerRevision(snapshot.revision);
      const player=parseSave(snapshot.raw,true);
      if(player)setCandidate({player});
      else notice('Копия W066 повреждена · откройте предыдущую версию');
    }catch{
      if(current(id))notice('Копия W066 недоступна · попробуйте ещё раз');
    }finally{if(current(id))setServerBusy(false)}
  };
  const saveServer = async () => {
    if(serverRevision===undefined||useGame.getState().recoveryRequired)return;
    const id=request.current;
    setServerBusy(true);
    try{
      const revision=await storeW066Snapshot(serverRevision,crypto.randomUUID(),exportSave());
      if(!current(id))return;
      setServerRevision(revision);
      setCandidate(undefined);
      notice('Копия W066 сохранена');
    }catch(error){
      if(!current(id))return;
      setServerRevision(undefined);
      notice(error instanceof CommunityError&&error.status===409
        ?'Копия W066 обновлена на другом устройстве · откройте её заново'
        :'Не удалось сохранить копию W066');
    }finally{if(current(id))setServerBusy(false)}
  };
  const previewLocal = (key:string, missing:string, strict:boolean) => {
    beginPreview();
    try{
      const player=parseSave(localStorage.getItem(key),strict);
      if(player)setCandidate({player});
      else notice(missing);
    }catch{notice('Хранилище недоступно')}
  };
  const previewFile = async (input:HTMLInputElement) => {
    const selected=input.files?.[0];
    input.value='';
    if(!selected)return;
    const id=beginPreview();
    if(selected.size>MAX_SAVE_TEXT){notice('Файл слишком большой');return}
    try{
      const raw=await selected.text();
      if(!current(id))return;
      const player=parseSave(raw,true);
      if(player)setCandidate({player});
      else notice('Некорректное сохранение');
    }catch{if(current(id))notice('Не удалось прочитать файл сохранения')}
  };
  const previewText = () => {
    const text=paste.current?.value.trim()??'';
    beginPreview();
    if(!text){notice('Вставьте текст резервной копии');return}
    if(text.length>MAX_SAVE_TEXT){notice('Копия слишком большая');return}
    const player=parseSave(text,true);
    if(player){setCandidate({player});setPasteOpen(false)}
    else notice('Некорректное сохранение');
  };
  const restore = () => {
    if(!candidate || !useGame.getState().importSave(candidate.player))return;
    if(candidate.cloud)acknowledgeCloud(candidate.cloud);
    setCandidate(undefined);
  };
  return <DialogShell panel="save-tools" title="Сохранение и восстановление" onBack={()=>open('menu')} backLabel="К меню" footer={null}>
    <div className="save-actions">
      <button type="button" className="action" onClick={download}>Экспорт сохранения</button>
      <button type="button" className="action secondary" onClick={copy}>Скопировать резервную копию</button>
    </div>
    {backupText!==undefined&&<label>Резервная копия · {number.format(backupText.length)} знаков
      <textarea readOnly rows={3} value={backupText} onFocus={event=>event.currentTarget.select()}/>
    </label>}
    <div className="save-actions">
      <button type="button" className="action" onClick={()=>file.current?.click()}>Импорт сохранения</button>
      <button type="button" className="action secondary" aria-expanded={pasteOpen} onClick={()=>setPasteOpen(open=>!open)}>Вставить резервную копию</button>
      {telegramProfile&&<>
        <button type="button" className="action secondary" onClick={previewCloud}>Открыть копию из Telegram</button>
        <button type="button" className="action secondary" onClick={()=>previewLocal(LEGACY_SAVE_KEY,'На этом устройстве нет прежнего сохранения',true)}>Открыть прежнее сохранение на устройстве</button>
      </>}
      <button type="button" className="action secondary" onClick={()=>previewLocal(SAVE_KEY+':before-import','Резервной копии пока нет',false)}>Предыдущая резервная копия</button>
    </div>
    {communityEnabled&&telegramProfile&&<div className="save-actions">
      <button type="button" className="action secondary" disabled={serverBusy} onClick={()=>void previewServer(false)}>Открыть копию W066</button>
      <button type="button" className="action secondary" disabled={serverBusy} onClick={()=>void previewServer(true)}>Предыдущая копия W066</button>
      {serverRevision!==undefined&&!useGame.getState().recoveryRequired&&<button type="button" className="action secondary"
        disabled={serverBusy} onClick={()=>void saveServer()}>Сохранить текущую игру в W066</button>}
    </div>}
    {pasteOpen&&<label>Текст резервной копии
      <textarea ref={paste} rows={3} spellCheck={false} autoComplete="off"/>
      <button type="button" className="action" onClick={previewText}>Проверить копию</button>
    </label>}
    <input ref={file} type="file" accept="application/json" hidden onChange={event=>void previewFile(event.currentTarget)}/>
    {candidate&&<div className="import-preview" ref={reveal}>
      <h3>Восстановить сохранение?</h3>
      <p>Уровень {candidate.player.level} · этап {stageLabel(candidate.player.stage)} · волна {candidate.player.wave}/5<br/>
        Предметов: {candidate.player.inventory.length} · золото {number.format(candidate.player.gold)}<br/>
        Самоцветы {number.format(candidate.player.gems)} · Хаосит {number.format(candidate.player.chaosite)}</p>
      <p>Текущий прогресс сначала сохранится в резервную копию на этом устройстве.</p>
      <button type="button" className="action" onClick={restore}>Восстановить этот прогресс</button>
      <button type="button" className="action secondary" onClick={()=>setCandidate(undefined)}>Отмена</button>
    </div>}
    <p className="hint">Прогресс сохраняется автоматически. {isolatedProfile?'Дополнительный герой хранится локально.':telegramProfile?'Прогресс Telegram хранится отдельно. Играйте на одном устройстве за раз. При расхождении копий выберите нужную вручную.':'Прогресс браузера хранится на этом устройстве.'} Для переноса используйте экспорт.</p>
  </DialogShell>;
}
