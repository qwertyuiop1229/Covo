// One bounded animation; no idle polling or network reads.
export function createChatScroller(container) {
  let operation=null;
  const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clamp=value=>Math.max(0,Math.min(Math.max(0,container.scrollHeight-container.clientHeight),value));
  function cancel(){operation?.finish(false);}
  function to(resolveTarget,{active=()=>true,instant=false,maxDistance=Infinity,prepare=()=>{}}={}){
    cancel();
    return new Promise(resolve=>{
      let frame=null,settled=0,from=container.scrollTop;
      const oldBehavior=container.style.scrollBehavior;
      container.style.scrollBehavior='auto';
      const interrupted=event=>{if(event.type!=='keydown'||['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();};
      const events=['wheel','touchstart','pointerdown','keydown'];
      const current={finish(ok){if(operation!==current)return;operation=null;container._covoProgrammaticScroll=false;cancelAnimationFrame(frame);for(const name of events)container.removeEventListener(name,interrupted);container.style.scrollBehavior=oldBehavior;container.dispatchEvent(new Event('covo-scroll-settled'));resolve(ok);}};
      operation=current;
      container._covoProgrammaticScroll=true;
      for(const name of events)container.addEventListener(name,interrupted,{passive:true});
      let initial;
      try{
        if(!active()||!container.isConnected){current.finish(false);return;}
        initial=resolveTarget();if(!Number.isFinite(initial)){current.finish(false);return;}
        initial=clamp(initial);
        // Distant replies need not render every intermediate history window.
        if(Number.isFinite(maxDistance)&&maxDistance>0&&Math.abs(initial-from)>maxDistance){container.scrollTop=clamp(initial-Math.sign(initial-from)*maxDistance);prepare();from=container.scrollTop;}
      }catch(_){current.finish(false);return;}
      const start=performance.now(),duration=instant||reduced()?0:Math.min(520,Math.max(240,180+Math.sqrt(Math.abs(initial-from))*8));
      const tick=now=>{
        if(operation!==current)return;
        if(!active()||!container.isConnected){current.finish(false);return;}
        let target;
        try{target=resolveTarget();}catch(_){current.finish(false);return;}
        if(!Number.isFinite(target)){current.finish(false);return;}
        target=clamp(target);
        const elapsed=Math.max(0,now-start),progress=duration===0?1:Math.min(1,elapsed/duration);
        // Time-based easing avoids accumulating rounded positions at low speeds.
        const ease=1-Math.pow(1-progress,3);
        container.scrollTop=progress===1?target:from+(target-from)*ease;
        const aligned=Math.abs(container.scrollTop-target)<=0.6;
        settled=progress===1&&aligned?settled+1:0;
        if(settled>=3||elapsed>=duration+240){current.finish(aligned);return;}
        frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
    });
  }
  return {to,cancel,get running(){return operation!==null;}};
}
