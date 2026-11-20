import {difficulties,objectives,yearName} from './shared/game.js';
import {presetData} from './shared/preset.js';
import {account,apiUrl,draftKey,presetRequest,requestId} from './store.js';

export function workshop({main,esc,open,setup}){
  const root=document.createElement('section');root.className='catalog workshop';main.append(root);
  root.innerHTML='<div class="section-head"><h2>Мастерская сценариев</h2><button class="secondary" data-new>Создать сценарий</button></div><div class="library-controls"><input aria-label="Поиск в мастерской" type="search" placeholder="Название или автор"><select aria-label="Сценарии мастерской"><option value="all">Все сценарии</option><option value="mine">Мои сценарии</option><option value="stars">Избранные</option></select></div><div class="workshop-list"></div><p class="hint" role="status"></p>';
  const list=root.querySelector('.workshop-list'),status=root.querySelector('[role=status]'),search=root.querySelector('input'),filter=root.querySelector('select');
  const drafts=()=>JSON.parse(localStorage.getItem(draftKey())||'[]');
  let published=[];
  function button(parent,label,fn){
    const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.onclick=async()=>{try{await fn();}catch(e){status.textContent=e.message;}};parent.append(b);return b;
  }
  function show(){
    list.replaceChildren();const term=search.value.trim().toLocaleLowerCase('ru');
    for(const p of [...drafts(),...published]){
      if(filter.value==='mine'&&!p.mine||filter.value==='stars'&&!p.starred||!(p.title+' '+(p.author||'')).toLocaleLowerCase('ru').includes(term))continue;
      const row=document.createElement('article');row.className='preset-row';list.append(row);
      row.innerHTML='<h3>'+esc(p.title)+'</h3><small>'+yearName(p.year)+' · '+(p.version?esc(p.author)+' · версия '+p.version:'Личный черновик')+'</small><p>'+esc(p.description)+'</p><p>'+esc(objectives[p.objective])+'</p>';
      button(row,'Играть',()=>setup(p.year,p.nation,p));
      if(p.version>1){
        const versions=document.createElement('select');versions.setAttribute('aria-label','Версия сценария');
        for(let v=p.version;v>=1;v--)versions.add(new Option('Версия '+v,v));
        row.append(versions);button(row,'Открыть версию',async()=>{const chosen=await presetRequest('/'+p.id+'?version='+versions.value);setup(chosen.year,chosen.nation,chosen);});
      }
      if(p.mine)button(row,'Редактировать',()=>edit(p));
      if(p.version)button(row,'Копировать',()=>edit({...p,id:requestId(),version:0,title:p.title.slice(0,88)+' (копия)'}));
      if(p.version && account)button(row,p.starred?'★ В избранном':'☆ В избранное',async()=>{
        const result=await presetRequest('/'+p.id+'/star',{starred:!p.starred});p.starred=result.starred;show();
      });
    }
    if(!list.children.length)list.textContent='Сценариев пока нет.';
  }
  async function refresh(){
    show();if(!apiUrl())return;
    try{published=await presetRequest();if(root.isConnected)show();}
    catch(e){status.textContent=e.message;}
  }
  function edit(p={id:requestId(),version:0,title:'',description:'',nation:'',year:2026,difficulty:'normal',objective:'free'}){
    open('Редактор сценария','<form id="preset-editor"><label>Название<input name="title" required maxlength="100"></label><label>Начальная ситуация<textarea name="description" rows="3" maxlength="1500"></textarea></label><label>Стартовый год<input type="number" name="year" required min="-999999" max="999999"></label><label>Рекомендуемая держава<input name="nation" maxlength="100" placeholder="Например, Germany"></label><label>Сложность<select name="difficulty">'+Object.entries(difficulties).map(([v,[n]])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select></label><label>Цель<select name="objective">'+Object.entries(objectives).map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select></label><p class="error" role="alert"></p>'+(!p.version?'<button class="secondary" value="draft">Сохранить черновик</button>':'')+(account&&apiUrl()?'<button class="primary" value="publish">Опубликовать версию на сервере</button>':'<small>Для публикации на общем сервере войдите в аккаунт.</small>')+'</form>');
    const form=document.querySelector('#preset-editor');
    for(const k of ['title','description','year','nation','difficulty','objective'])form.elements[k].value=p[k]||'';
    form.onsubmit=async e=>{
      e.preventDefault();const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      try{
        const data=presetData({...Object.fromEntries(new FormData(form)),year:form.elements.year.valueAsNumber});
        const other=drafts().filter(d=>d.id!==p.id);
        if(e.submitter?.value==='publish'){
          await presetRequest('/'+p.id,{...data,version:p.version||0});
          localStorage.setItem(draftKey(),JSON.stringify(other));
        }else localStorage.setItem(draftKey(),JSON.stringify([{...data,id:p.id,version:0,mine:true},...other]));
        form.closest('dialog').close();await refresh();
      }catch(e){form.querySelector('.error').textContent=e.message;}
      finally{buttons.forEach(b=>b.disabled=false);}
    };
  }
  search.oninput=show;filter.onchange=show;root.querySelector('[data-new]').onclick=()=>edit();refresh();
}
