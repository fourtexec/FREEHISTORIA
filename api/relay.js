const known=new Set(['https://api.openai.com/v1/chat/completions','https://api.anthropic.com/v1/messages',
  'https://openrouter.ai/api/v1/chat/completions','https://api.deepseek.com/chat/completions',
  'https://api.groq.com/openai/v1/chat/completions','https://api.mistral.ai/v1/chat/completions',
  ...(process.env.PROVIDER_ENDPOINTS||'').split(',').map(s=>s.trim()).filter(Boolean)]);
export async function providerRelay({url,headers,body}) {
  const gemini=/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[a-zA-Z0-9._-]+:generateContent$/;
  if(typeof url!=='string' || !(known.has(url)||gemini.test(url)))throw Object.assign(Error('Этот endpoint отсутствует в PROVIDER_ENDPOINTS сервера. Доступно прямое подключение.'),{status:403});
  const clean=new Headers({'Content-Type':'application/json'});
  for(const [k,v] of Object.entries(headers||{})){
    if(!/^[a-z0-9-]+$/i.test(k) || /^(host|connection|accept-encoding|cookie|proxy-.*|sec-.*|forwarded|x-forwarded-.*|transfer-encoding|content-length)$/i.test(k))throw Error('Недопустимый заголовок.');
    if(typeof v!=='string' || v.length>4096)throw Error('Недопустимое значение заголовка.');
    clean.set(k,v);
  }
  let response;
  try {response=await fetch(url,{method:'POST',redirect:'error',headers:clean,body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});}
  catch{throw Object.assign(Error('Нет ответа от провайдера.'),{status:502});}
  if(!response.ok)throw Object.assign(Error('Провайдер вернул HTTP '+response.status+'.'),{status:502});
  return response.json();
}
