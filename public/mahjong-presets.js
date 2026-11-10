(()=>{
  const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  window.createMahjongPresetsUI=({api,readRules,renderRules,openRoom,ask})=>{
    let epoch=0,requestId=0,presets=[],cursor=null,loading=false,publishing=false,opening=false,pending=null,draftRules=null;
    const status=(text='')=>$('mjPresetStatus').textContent=text;
    const summary=r=>[r.hands+'局','底分'+r.base,r.selfDrawOnly?'只自摸':'可点胡',r.sevenPairs?'可胡七对':'不胡七对'];
    function render(){
      const list=$('mjPresetList');list.replaceChildren();
      if(!presets.length)list.append(node('p','mj-preset-empty','还没有公开方案。调好家规后，可以分享你的第一套规则。'));
      for(const p of presets){const card=node('article','mj-preset-card'),head=node('div','mj-preset-card-head'),title=node('h3','',p.description||p.author.username+'的麻将规则'),by=node('p','mj-preset-author',p.author.username+' 发布');card.dataset.presetId=p.id;head.append(title,by);
        const tags=node('div','mj-preset-tags');for(const text of summary(p.rules))tags.append(node('span','',text));
        const actions=node('div','mj-preset-actions'),view=node('button','','查看规则'),use=node('button','mj-preset-use','套用开房');view.type=use.type='button';view.dataset.presetAction='view';use.dataset.presetAction='use';view.onclick=()=>viewRules(p.id);use.disabled=opening;use.onclick=()=>usePreset(p.id);actions.append(view,use);
        if(p.canRemove){const remove=node('button','mj-preset-remove','下架');remove.type='button';remove.dataset.presetAction='remove';remove.onclick=()=>ask('下架这个规则方案？','大厅里将不再显示此方案，已经按它创建的牌室可以继续游戏。',()=>removePreset(p.id));actions.append(remove);}
        card.append(head,tags,actions);list.append(card);
      }
      $('mjPresetsMore').hidden=cursor===null;$('mjPresetsMore').disabled=loading;$('mjPresetsRefresh').disabled=loading;
    }
    async function load(append=false){
      if(append&&loading)return;const rev=epoch,id=++requestId;loading=true;$('mjPresetsRefresh').disabled=true;$('mjPresetsMore').disabled=true;
      try{const value=await api('/presets'+(append&&cursor?'?before='+cursor:''));if(rev!==epoch||id!==requestId)return;presets=append?[...presets,...value.presets.filter(p=>!presets.some(q=>q.id===p.id))]:value.presets;cursor=value.nextCursor;status();}
      catch(e){if(rev===epoch&&id===requestId)status(e.message);}
      finally{if(rev===epoch&&id===requestId){loading=false;render();}}
    }
    async function viewRules(id){const rev=epoch;try{const {preset}=await api('/presets/'+id);if(rev!==epoch)return;$('mjPresetViewTitle').textContent=preset.description||preset.author.username+'的麻将规则';$('mjPresetViewBy').textContent=preset.author.username+' 发布 · 可套用这些规则创建自己的牌室';renderRules($('mjPresetViewRules'),preset.rules,true);$('mjPresetViewUse').onclick=()=>{$('mjPresetViewDialog').close();usePreset(id);};$('mjPresetViewDialog').showModal();}catch(e){if(rev===epoch)status(e.message);}}
    async function usePreset(id){if(opening)return;opening=true;const rev=epoch;render();try{const {preset}=await api('/presets/'+id);if(rev!==epoch)return;await openRoom(preset.rules);}catch(e){if(rev===epoch)status(e.message);}finally{if(rev===epoch){opening=false;render();}}}
    function countDescription(){const n=[...$('mjPresetDescription').value.trim().normalize('NFC')].length;$('mjPresetCount').textContent=n+' / 20';$('mjPresetDescription').setCustomValidity(n>20?'文字说明最多20字':'');}
    function openPublisher(){
      if(!window.SJAuth.user){window.SJAuth.open({purpose:'登录后可以把规则方案分享给其他牌友。',resume:openPublisher});return;}
      draftRules=readRules($('mjCreateRules'));renderRules($('mjPresetPublishRules'),draftRules,true);$('mjPresetPublishSummary').textContent=summary(draftRules).join(' · ');$('mjPresetPublishError').textContent='';countDescription();$('mjPresetPublishDialog').showModal();
    }
    async function publish(e){e.preventDefault();if(publishing||!draftRules)return;countDescription();if(!$('mjPresetPublishForm').reportValidity())return;
      const description=$('mjPresetDescription').value.trim().normalize('NFC'),key=JSON.stringify([description,draftRules]);if(pending?.key!==key)pending={key,opId:Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')};const rev=epoch;publishing=true;$('mjPresetPublishSubmit').disabled=true;$('mjPresetPublishError').textContent='';
      try{await api('/presets',{opId:pending.opId,description,rules:draftRules});if(rev!==epoch)return;pending=null;$('mjPresetPublishDialog').close();$('mjPresetDescription').value='';await load();if(rev===epoch)status('规则方案已公开，其他牌友可以套用开房。');}
      catch(e){if(rev===epoch)$('mjPresetPublishError').textContent=e.message;}
      finally{if(rev===epoch){publishing=false;$('mjPresetPublishSubmit').disabled=false;}}
    }
    async function removePreset(id){const rev=epoch;try{await api('/presets/'+id+'/remove',{});if(rev!==epoch)return;await load();if(rev===epoch)status('规则方案已下架。');}catch(e){if(rev===epoch)status(e.message);}}
    $('mjPublishPreset').onclick=openPublisher;$('mjPresetDescription').oninput=countDescription;$('mjPresetPublishForm').onsubmit=publish;$('mjPresetsRefresh').onclick=()=>load();$('mjPresetsMore').onclick=()=>load(true);
    function reset(){epoch++;requestId++;presets=[];cursor=null;loading=publishing=opening=false;pending=draftRules=null;$('mjPresetDescription').value='';$('mjPresetPublishSubmit').disabled=false;$('mjPresetViewRules').replaceChildren();$('mjPresetPublishRules').replaceChildren();$('mjPresetPublishError').textContent='';status();render();}
    return {load,reset};
  };
})();
