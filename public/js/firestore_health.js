// A failed Firestore async queue needs a fresh page, not deletion of device data.
export function isFatalFirestoreError(value) {
  const message=typeof value==='string'?value:String(value?.message||'');
  return /firestore/i.test(message)&&/INTERNAL ASSERTION FAILED/i.test(message);
}
export function installFirestoreRecovery({onLog,reload=()=>location.reload(),saveDraft=()=>window.saveCurrentDraft?.(),busy=()=>window.covoDesktopBusy?.()===true,confirm=(...args)=>window.showCustomConfirm?.(...args),notify=(text)=>window.alertMessage?.(text,'warning')}={}) {
  if(window.covoFirestoreRecovery?.observe)return window.covoFirestoreRecovery;
  let failed=false,restarting=false;
  const observe=value=>{
    if(failed||!isFatalFirestoreError(value))return false;
    failed=true;
    window.covoDiagnostics?.failure('firestore.internal');
    const panel=document.createElement('aside');panel.className='covo-firestore-recovery';panel.id='covoFirestoreRecovery';panel.setAttribute('role','alert');
    const title=document.createElement('strong');title.textContent='接続処理を再起動する必要があります';
    const text=document.createElement('p');text.textContent='会話の接続処理でエラーが発生しました。暗号鍵・保存履歴・送信待ちを消さずに、画面を読み込み直せます。';
    const button=document.createElement('button');button.type='button';button.className='covo-button covo-button-secondary';button.textContent='接続を再起動';
    button.onclick=async()=>{
      if(restarting)return;
      if(window.covoReinstalling||window.covoUpdater?.state?.phase==='installing'){notify('インストールの完了をお待ちください。');return;}
      restarting=true;button.disabled=true;
      let requested=false;
      try{
        if(busy()&&!await confirm('接続を再起動しますか？','再起動','キャンセル','通話・転送など進行中の処理は中断されます。保存済みの送信待ちと暗号鍵は保持します。'))return;
        if (await saveDraft() === false) throw new Error('draft storage unavailable');
        await reload();requested=true;
      }catch(_){notify('再起動できませんでした。入力中の文章を確認してから再試行してください。');}
      finally{if(!requested){restarting=false;button.disabled=false;}}
    };
    panel.append(title,text,button);document.body.append(panel);return true;
  };
  const api={observe,get failed(){return failed;}};window.covoFirestoreRecovery=api;
  onLog?.(entry=>observe(entry.message),{level:'error'});
  window.addEventListener('unhandledrejection',event=>observe(event.reason));
  window.addEventListener('error',event=>observe(event.error||event.message));
  return api;
}
