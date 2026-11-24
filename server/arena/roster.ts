export const DEFAULT_ARENA_LEVEL=1;

// Deployment-owned assignments for staging. Telegram identity selects the row;
// neither the browser nor a Solo save can write one.
export function readArenaLevels(json:string|undefined,allowedUsers?:ReadonlySet<string>){
 const levels=new Map<string,number>();
 if(json===undefined)return levels;
 let input:unknown;
 try{input=JSON.parse(json)}catch{throw new Error('ARENA_TEST_LEVELS must be a JSON object')}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('ARENA_TEST_LEVELS must be a JSON object');
 for(const [id,level] of Object.entries(input)){
  if((allowedUsers&&!allowedUsers.has(id))||!/^\d{1,16}$/.test(id)||typeof level!=='number'||!Number.isInteger(level)||level<1||level>100)
   throw new Error('ARENA_TEST_LEVELS requires allowlisted IDs and integer Arena levels from 1 to 100');
  levels.set(id,level);
 }
 return levels;
}
