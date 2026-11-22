import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createArenaServer} from './http';

const local=process.env.ARENA_LOCAL==='1';
const mode=process.env.ARENA_MODE??(local?'staging':undefined);
if(mode!=='staging')throw new Error('Arena requires explicit staging mode');
const host=local?'127.0.0.1':process.env.HOST??'0.0.0.0';
const port=Number(process.env.PORT??8787);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid Arena port');
const allowedUsers=new Set((process.env.ARENA_TEST_USERS??'').split(',').map(value=>value.trim()).filter(Boolean));
const dbPath=resolve(process.env.ARENA_DB??(local?'.tmp/arena/local.sqlite':'/data/arena.sqlite'));
mkdirSync(dirname(dbPath),{recursive:true});
const server=createArenaServer({
 dbPath,webRoot:resolve(process.env.ARENA_WEB_ROOT??'.tmp/arena/web'),local,allowedUsers:local?undefined:allowedUsers,
 botToken:local?randomBytes(32).toString('hex'):process.env.ARENA_BOT_TOKEN??'',
 sessionKey:local?randomBytes(32).toString('hex'):process.env.ARENA_SESSION_SECRET??'',
});
server.listen(port,host,()=>console.log(`Arena listening at http://${host}:${port}`));
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>server.close());
