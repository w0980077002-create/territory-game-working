/** A one-cell BOC with a text comment (op 0); TON wallets show it and the treasury sync reads it. */
export function commentBoc(text:string){
 const body=[0,0,0,0,...new TextEncoder().encode(text)];
 if(body.length>127)throw new Error('comment too long');
 const cell=[0,body.length*2,...body];
 const boc=[0xb5,0xee,0x9c,0x72,0x01,0x01,0x01,0x01,0x00,cell.length,0x00,...cell];
 return btoa(String.fromCharCode(...boc));
}
