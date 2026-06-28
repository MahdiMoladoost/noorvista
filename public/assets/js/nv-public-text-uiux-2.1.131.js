(function(){
  'use strict';
  var fa='۰۱۲۳۴۵۶۷۸۹';
  var ar={'٠':'۰','١':'۱','٢':'۲','٣':'۳','٤':'۴','٥':'۵','٦':'۶','٧':'۷','٨':'۸','٩':'۹'};
  var digit=/[0-9٠-٩]/g;
  function toFa(v){return String(v==null?'':v).replace(digit,function(d){return ar[d]||fa[Number(d)]||d;});}
  function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
  function skip(el){return !el||el.closest('script,style,noscript,code,pre,textarea,select,svg,canvas,[data-no-fa-digits],.no-fa-digits,.nv-final-topbar,.nv-topbar169');}
  function refresh(root){
    root=root||document.body;
    if(!root) return;
    root.querySelectorAll('.quick-item small,.footer .contact-list .nv-contact-value,.footer .contact-list .nv-address-text,.footer .contact-list .nv-contact-label,.topbar .nv-topbar-text').forEach(function(el){
      if(skip(el)) return;
      var next=toFa(clean(el.textContent));
      if(el.textContent!==next) el.textContent=next;
    });
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function(el){
      if(skip(el)) return;
      ['placeholder','title','aria-label'].forEach(function(attr){var v=el.getAttribute(attr); if(v) el.setAttribute(attr,toFa(v));});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){refresh(document.body);},{once:true}); else refresh(document.body);
  document.addEventListener('noorvista:public-settings',function(){setTimeout(function(){refresh(document.body);},60);});
  window.SadraUIFix131={refresh:refresh,toFa:toFa};
})();
