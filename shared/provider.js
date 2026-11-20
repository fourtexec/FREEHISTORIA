function endpoint(config) {
  const url=new URL(config.url.replace('{model}',encodeURIComponent(config.model)));
  if ((url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) ||
      url.username || url.password || url.hash) throw Error('Нужен HTTPS endpoint или локальный адрес HTTP.');
  return url.href;
}
export function buildPayload(config,prompt) {
  const headers={'Content-Type':'application/json'};
  const model=config.model;
  let body, path;
  if(config.type==='anthropic'){
    Object.assign(headers,{'x-api-key':config.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'});
    body={model,max_tokens:700,messages:[{role:'user',content:prompt}]};path='content.0.text';
  }else if(config.type==='gemini'){
    headers['x-goog-api-key']=config.key;
    body={contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}};path='candidates.0.content.parts.0.text';
  }else if(config.type==='custom'){
    if(!/^[a-zA-Z0-9-]+$/.test(config.header))throw Error('Проверьте имя заголовка авторизации.');
    headers[config.header]=(config.prefix?config.prefix+' ':'')+config.key;
    body=JSON.parse(config.template,(_,v)=>typeof v==='string'?v.replace(/\{\{(prompt|model)\}\}/g,(_,key)=>key==='model'?model:prompt):v);
    path=config.path;
  }else{
    headers.Authorization='Bearer '+config.key;
    body={model,messages:[{role:'user',content:prompt}]};path='choices.0.message.content';
  }
  return {url:endpoint(config),headers,body,path};
}
