// One short-lived animation per scroller. No polling after arrival or extra reads.
export function createChatScroller(container) {
  let operation=null;
  const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function cancel(){operation?.finish(false);}
  function to(resolveTarget,{active=()=>true,instant=false}={}){
    cancel();
    return new Promise(resolve=>{
      let frame=null,start=null,previous=null,settled=0;
      const oldBehavior=container.style.scrollBehavior;
      container.style.scrollBehavior='auto';
      const interrupted=event=>{if(event.type!=='keydown'||['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();};
      const events=['wheel','touchstart','pointerdown','keydown'];
      const current={finish(ok){if(operation!==current)return;operation=null;cancelAnimationFrame(frame);for(const name of events)container.removeEventListener(name,interrupted);container.style.scrollBehavior=oldBehavior;resolve(ok);}};
      operation=current;
      for(const name of events)container.addEventListener(name,interrupted,{passive:true});
      const tick=now=>{
        if(operation!==current)return;
        if(!active()||!container.isConnected){current.finish(false);return;}
        let target=resolveTarget();
        if(!Number.isFinite(target)){current.finish(false);return;}
        target=Math.max(0,Math.min(container.scrollHeight-container.clientHeight,target));
        if(start===null){start=now;previous=now;}
        const elapsed=now-start,dt=Math.min(40,Math.max(1,now-previous));previous=now;
        const delta=target-container.scrollTop;
        const snap=instant||reduced()||elapsed>=650;
        container.scrollTop=snap?target:container.scrollTop+delta*(1-Math.exp(-dt/65));
        // Allow virtual row measurements and delayed media layout to settle, but
        // never install permanent image callbacks that can pull a reader back.
        settled=Math.abs(delta)<=0.6?settled+1:0;
        if((elapsed>=180&&settled>=4)||elapsed>=950){container.scrollTop=target;current.finish(true);return;}
        frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
    });
  }
  return {to,cancel,get running(){return operation!==null;}};
}
