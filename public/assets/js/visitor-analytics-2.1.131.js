
(function(){
  function fa(n){return (window.NVToPersianDigits||function(v){return String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);})(n==null?'۰':n);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function table(id, rows, cols){var el=document.getElementById(id); if(!el) return; rows=rows||[]; if(!rows.length){el.innerHTML='<tr><td>داده‌ای ثبت نشده است</td></tr>'; return;} el.innerHTML='<thead><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+fa(esc(r[c[1]]))+'</td>').join('')+'</tr>').join('')+'</tbody>';}
  async function load(){
    try{
      var res=await fetch('/api/admin/visitor-analytics/summary?days=30',{credentials:'same-origin',headers:{Accept:'application/json'}}); var json=await res.json(); if(!res.ok||json.success===false) throw new Error(json.message||'خطا'); var d=json.data||{}; var t=d.totals||{};
      var cards=document.querySelectorAll('#visitorStats .nv-visitor-card strong');
      [t.total_views,t.unique_visitors,t.today_views,t.today_unique].forEach((v,i)=>{if(cards[i]) cards[i].textContent=fa(v||0);});
      table('countryTable', d.by_country, [['کشور','label'],['بازدید','count'],['یکتا','unique_count']]);
      table('deviceTable', d.by_device, [['دستگاه','label'],['بازدید','count']]);
      table('osTable', d.by_os, [['سیستم عامل','label'],['بازدید','count']]);
      table('browserTable', d.by_browser, [['مرورگر','label'],['بازدید','count']]);
      table('pagesTable', d.top_pages, [['صفحه','label'],['بازدید','count']]);
      table('recentTable', (d.recent||[]).map(r=>({path:r.path,browser:(r.browser||'')+' / '+(r.os||''), country:(r.country||'')+' '+(r.city||''), created_at:r.created_at})), [['صفحه','path'],['مرورگر/سیستم','browser'],['مکان','country'],['زمان','created_at']]);
      if(window.SadraUIFix131) window.SadraUIFix131.refresh(document.body);
    }catch(e){ if(window.showToast) window.showToast('دریافت آمار بازدیدکنندگان انجام نشد','error'); }
  }
  document.addEventListener('DOMContentLoaded',function(){load(); var b=document.getElementById('refreshVisitors'); if(b)b.addEventListener('click',load);});
})();
