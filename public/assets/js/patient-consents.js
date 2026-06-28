(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const labels = { treatment:'درمان', surgery:'جراحی', image:'تصویر و رسانه', sms:'پیامک', data_processing:'پردازش داده', ai_processing:'پردازش با هوش مصنوعی' };
  async function api(url, options) {
    const response = await fetch(url, options); const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href='/login'; throw new Error('نشست منقضی شده است.'); }
    if (!response.ok) throw new Error(data.message || 'عملیات انجام نشد.'); return data;
  }
  function date(value){ if(!value)return '—'; try{return new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch(_){return String(value);} }
  function el(tag, text, cls){ const node=document.createElement(tag); if(text!=null)node.textContent=text; if(cls)node.className=cls; return node; }
  async function loadDocuments(){
    try{
      const data=await api('/api/consents/documents'); const root=$('documents'); root.replaceChildren();
      if(!data.documents?.length){root.textContent='در حال حاضر متن رضایت‌نامه فعالی منتشر نشده است.';return;}
      for(const doc of data.documents){
        const card=el('article',null,'session'); card.append(el('h3',`${labels[doc.consent_type]||doc.consent_type} — نسخه ${doc.version}`));
        card.append(el('p',doc.title)); const details=document.createElement('details'); details.append(el('summary','مشاهده متن کامل'));
        const content=el('div',doc.content); content.style.whiteSpace='pre-wrap'; details.append(content); card.append(details);
        const hash=el('small',`اثر انگشت متن: ${doc.content_hash}`,'muted'); hash.dir='ltr'; card.append(hash);
        const label=el('label','نام و نام خانوادگی تأییدکننده'); const input=document.createElement('input'); input.autocomplete='name';
        const button=el('button','مطالعه کردم و می‌پذیرم'); button.type='button';
        button.addEventListener('click',async()=>{ try{button.disabled=true; await api(`/api/consents/${doc.id}/accept`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signed_name:input.value})}); await Promise.all([loadDocuments(),loadHistory()]);}catch(e){$('documentError').textContent=e.message;}finally{button.disabled=false;} });
        card.append(label,input,button); root.append(card);
      }
    }catch(e){$('documentError').textContent=e.message;}
  }
  async function loadHistory(){
    try{
      const data=await api('/api/consents/me'); const root=$('history'); root.replaceChildren();
      if(!data.consents?.length){root.textContent='هنوز رضایتی ثبت نشده است.';return;}
      for(const consent of data.consents){
        const card=el('article',null,`session${consent.revoked_at?'':' current'}`); card.append(el('strong',`${labels[consent.consent_type]||consent.consent_type} — نسخه ${consent.document_version}`));
        card.append(el('p',consent.revoked_at?`لغوشده در ${date(consent.revoked_at)}`:`فعال از ${date(consent.accepted_at)}`));
        if(consent.revocation_reason)card.append(el('p',`دلیل لغو: ${consent.revocation_reason}`));
        if(!consent.revoked_at){ const button=el('button','لغو رضایت'); button.type='button'; button.addEventListener('click',async()=>{ const reason=window.prompt('دلیل لغو رضایت را وارد کنید:'); if(!reason)return; try{await api(`/api/consents/${consent.id}/revoke`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})}); await loadHistory();}catch(e){$('historyError').textContent=e.message;} }); card.append(button); }
        root.append(card);
      }
    }catch(e){$('historyError').textContent=e.message;}
  }
  Promise.all([loadDocuments(),loadHistory()]);
})();
