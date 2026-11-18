/** Pack reviewed browser evidence; retain original recordings outside the repository. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const dir='docs/qa/issue-32',archive='.tmp/qa/realm-recordings';
for(const name of fs.readdirSync(dir))if(name.endsWith('.png')){
 const file=path.join(dir,name),target=file.replace(/\.png$/,'.webp');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-quality','92',target]);fs.unlinkSync(file);
}
for(const name of ['victory','defeat']){
 const file=path.join(dir,name+'.webm');if(!fs.existsSync(file))continue;
 const opts=name==='victory'?['-vf','fps=10,scale=260:-2','-crf','35']:['-crf','25'];
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,...opts,'-c:v','libx264','-preset','slow','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,name+'.mp4')]);
}
fs.mkdirSync(archive,{recursive:true});for(const name of fs.readdirSync(dir))if(name.endsWith('.webm'))fs.renameSync(path.join(dir,name),path.join(archive,name));
