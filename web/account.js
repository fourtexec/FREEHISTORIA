import {account,apiUrl,authenticate,challenge,signOut,saveSettings,theme} from './store.js';

let turnstileScript;
async function turnstile(){
  if(!turnstileScript)turnstileScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload=()=>window.turnstile.ready(()=>resolve(window.turnstile));
    script.onerror=()=>{script.remove();turnstileScript=null;reject(Error('Не удалось загрузить Turnstile.'));};
    document.head.append(script);
  });
  return turnstileScript;
}
export function accountDialog({open,settings,done}){
  if(!apiUrl()){
    open('Аккаунт','<p>Для входа и синхронизации подключите сервер FreeHISTORIA.</p><button class="primary" id="account-connect">Подключить сервер</button>');
    document.querySelector('#account-connect').onclick=settings;return;
  }
  if(account){
    open('Ваш аккаунт','<p id="account-name"></p><form id="preferences"><label>Тема<select name="theme"><option value="dark">Тёмная</option><option value="light">Светлая</option><option value="system">Системная</option></select></label><label>Одиночные кампании<select name="storage"><option value="server">В аккаунте на сервере</option><option value="local">На этом устройстве</option></select></label><p class="error"></p><button class="primary">Сохранить</button><button type="button" class="text-action" id="logout">Выйти</button></form>');
    document.querySelector('#account-name').textContent=account.username;
    const form=document.querySelector('#preferences'),f=form.elements;
    f.theme.value=theme();f.storage.value=account.settings.storage;
    form.onsubmit=async e=>{
      e.preventDefault();
      try{await saveSettings({theme:f.theme.value,storage:f.storage.value});done();}
      catch(err){form.querySelector('.error').textContent=err.message;}
    };
    document.querySelector('#logout').onclick=async()=>{
      try{await signOut();done();}catch(err){form.querySelector('.error').textContent=err.message;}
    };
    return;
  }
  let mode='login',widget;
  function render(){
    open(mode==='login'?'Вход в аккаунт':'Создать аккаунт',`<form id="auth-form"><label>Имя пользователя<input name="username" autocomplete="username" minlength="3" maxlength="32" required></label><label>Пароль<input name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="10" maxlength="128" required></label><div class="captcha"></div><p class="error" role="alert"></p><button class="primary" type="submit" disabled>${mode==='login'?'Войти':'Зарегистрироваться'}</button><button class="text-action" type="button" id="auth-switch">${mode==='login'?'Создать аккаунт':'Уже есть аккаунт'}</button></form>`);
    const form=document.querySelector('#auth-form'),area=form.querySelector('.captcha'),error=form.querySelector('.error'),submit=form.querySelector('[type=submit]');
    let read,sequence=0;
    function clearWidget(){if(widget!=null){window.turnstile?.remove(widget);widget=null;}}
    document.querySelector('#dialog').addEventListener('close',clearWidget,{once:true});
    async function refresh(){
      const n=++sequence;submit.disabled=true;read=null;clearWidget();area.textContent='Загрузка капчи…';
      try{
        const c=await challenge();
        if(!form.isConnected||sequence!==n)return;
        area.replaceChildren();
        if(c.type==='turnstile'){
          const api=await turnstile();
          if(!form.isConnected||sequence!==n)return;
          widget=api.render(area,{sitekey:c.siteKey,action:'account',callback:token=>{read=()=>({token});submit.disabled=false;},'expired-callback':()=>{read=null;submit.disabled=true;api.reset(widget);}});
        }else{
          const img=new Image();img.src=c.image;img.alt='Пять цифр проверочного кода';area.append(img);
          const label=document.createElement('label');label.textContent='Цифры с картинки';const input=document.createElement('input');
          input.required=true;input.inputMode='numeric';input.pattern='[0-9]{5}';input.maxLength=5;input.autocomplete='off';label.append(input);area.append(label);
          read=()=>({id:c.id,answer:input.value});submit.disabled=false;
        }
      }catch(err){error.textContent=err.message;area.replaceChildren();}
      if(form.isConnected && sequence===n){const b=document.createElement('button');b.type='button';b.className='text-action';b.textContent='Обновить капчу';b.onclick=refresh;area.append(b);}
    }
    document.querySelector('#auth-switch').onclick=()=>{clearWidget();mode=mode==='login'?'register':'login';render();};
    form.onsubmit=async e=>{
      e.preventDefault();if(!read)return;submit.disabled=true;
      try{await authenticate(mode,{username:form.elements.username.value,password:form.elements.password.value,captcha:read()});done();}
      catch(err){error.textContent=err.message;await refresh();}
    };
    refresh();
  }
  render();
}
