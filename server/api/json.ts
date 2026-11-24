import type {IncomingMessage,ServerResponse} from 'node:http';

export class JsonInputError extends Error {}

export function sendJson(res:ServerResponse,status:number,body:unknown){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
 res.end(JSON.stringify(body));
}

export async function readJsonObject(req:IncomingMessage,maxBytes:number):Promise<Record<string,unknown>>{
 if((req.headers['content-type']??'').split(';')[0].trim().toLowerCase()!=='application/json')throw new JsonInputError();
 const chunks:Buffer[]=[];
 let length=0;
 for await(const chunk of req.iterator({destroyOnReturn:false})){
  length+=chunk.length;
  if(length>maxBytes){req.resume();throw new JsonInputError();}
  chunks.push(chunk);
 }
 let body:unknown;
 try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new JsonInputError();}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new JsonInputError();
 return body as Record<string,unknown>;
}
