import {randomBytes,randomInt,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

const glyphs=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001010010010','111101111101111','111101111001111'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>Object.assign(Error(message),{status});

function image(code) {
  const width=168,height=56,stride=width+1, pixels=Buffer.alloc(stride*height,240);
  for(let y=0;y<height;y++)pixels[y*stride]=0;
  for(let i=0;i<320;i++)pixels[randomInt(height)*stride+1+randomInt(width)]=randomInt(120,220);
  [...code].forEach((digit,i)=>{
    const top=randomInt(6,14),left=9+i*32+randomInt(4),lean=(randomInt(9)-4)/18;
    for(let y=0;y<35;y++)for(let x=0;x<21;x++){
      if(glyphs[digit][Math.floor(y/7)*3+Math.floor(x/7)]==='1'){
        pixels[(top+y)*stride+1+left+x+Math.round((y-17)*lean)]=randomInt(20,75);
      }
    }
  });
  function chunk(type,data){
    const body=Buffer.concat([Buffer.from(type),data]),size=Buffer.alloc(4),sum=Buffer.alloc(4);
    let crc=0xffffffff;
    for(const byte of body){crc^=byte;for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([size,body,sum]);
  }
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width);hdr.writeUInt32BE(height,4);hdr[8]=8;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
  return 'data:image/png;base64,'+png.toString('base64');
}

export function captchaService(db){
  const siteKey=process.env.TURNSTILE_SITE_KEY,secret=process.env.TURNSTILE_SECRET_KEY;
  if(Boolean(siteKey)!==Boolean(secret))throw Error('Задайте оба ключа Turnstile.');
  db.exec('CREATE TABLE IF NOT EXISTS captcha(id TEXT PRIMARY KEY, digest TEXT, ip TEXT, expires INTEGER)');
  function issue(ip){
    if(siteKey)return {type:'turnstile',siteKey};
    const id=randomBytes(20).toString('hex'),code=String(randomInt(100000)).padStart(5,'0');
    db.prepare('DELETE FROM captcha WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO captcha VALUES(?,?,?,?)').run(id,hash(id+code),ip,Date.now()+300000);
    return {type:'image',id,image:image(code)};
  }
  async function verify(input,ip){
    if(secret){
      if(typeof input?.token!=='string'||!input.token||input.token.length>2048)throw fail(403,'Пройдите капчу.');
      let result;
      try{
        const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:input.token}),signal:AbortSignal.timeout(8000)});
        result=await response.json();
      }catch{throw fail(503,'Сервис капчи недоступен. Попробуйте ещё раз.');}
      if(result.success && result.action==='account')return;
    }else if(typeof input?.id==='string' && typeof input.answer==='string'){
      const row=db.prepare('DELETE FROM captcha WHERE id=? AND ip=? RETURNING digest,expires').get(input.id,ip);
      if(row && row.expires>Date.now() && hash(input.id+input.answer.trim())===row.digest)return;
    }
    throw fail(403,'Капча неверна или устарела. Решите новую.');
  }
  return {issue,verify};
}
