
/* Sadra 2.1.129 — UI stability, Persian digits, money helpers, settings map picker */
(function(){
  'use strict';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  function toEnglishDigits(value){ return String(value ?? '').replace(/[۰-۹]/g, d => String(fa.indexOf(d))).replace(/[٠-٩]/g, d => String(ar.indexOf(d))); }
  function toPersianDigits(value){ return String(value ?? '').replace(/[0-9]/g, d => fa[Number(d)]).replace(/[٠-٩]/g, d => fa[ar.indexOf(d)]).replace(/[۰-۹]/g, d => d); }
  function onlyDigits(value){ return toEnglishDigits(value).replace(/[^0-9]/g,''); }
  window.toEnglishNumber = window.toEnglishNumber || toEnglishDigits;
  // Display Persian digits in UI; parsers still normalize before numeric use.
  window.toPersianNumber = function(value){ return toPersianDigits(value); };
  window.NVToEnglishDigits = toEnglishDigits;

  function formatThousands(value){ const d = onlyDigits(value); return d ? toPersianDigits(d.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : ''; }
  const small = ['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه','ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
  const tens = ['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
  const hundreds = ['','صد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
  const scales = ['','هزار','میلیون','میلیارد','هزار میلیارد'];
  function under1000(n){ const parts=[]; if(n>=100){parts.push(hundreds[Math.floor(n/100)]); n%=100;} if(n>=20){parts.push(tens[Math.floor(n/10)]); n%=10;} if(n>0){parts.push(small[n]);} return parts.join(' و '); }
  function amountToWords(num){
    let n = Number(onlyDigits(num));
    if(!Number.isFinite(n) || n<=0) return 'صفر تومان';
    const groups=[]; while(n>0){ groups.push(n%1000); n=Math.floor(n/1000); }
    const parts=[]; for(let i=groups.length-1;i>=0;i--){ if(groups[i]) parts.push(`${under1000(groups[i])}${scales[i] ? ' ' + scales[i] : ''}`); }
    return parts.join(' و ') + ' تومان';
  }
  window.NVMoneyWords = amountToWords;

  function isMoneyInput(input){
    if(!input || input.type === 'hidden' || input.type === 'date' || input.type === 'time' || input.type === 'password') return false;
    const idName = `${input.id || ''} ${input.name || ''} ${input.placeholder || ''}`.toLowerCase();
    const label = input.closest('.form-group,div,label')?.querySelector('label')?.textContent || input.parentElement?.textContent || '';
    return /(fee|price|amount|cost|payment|consultation|default_fee|ویزیت|هزینه|مبلغ|قیمت|تعرفه|پرداخت)/i.test(idName + ' ' + label);
  }
  function decorateMoneyInput(input){
    if(input.dataset.nvMoneyDecorated === '1') return;
    input.dataset.nvMoneyDecorated = '1';
    input.inputMode = 'numeric';
    input.autocomplete = input.autocomplete || 'off';
    const parent = input.parentElement;
    if(parent && !parent.classList.contains('nv-money-wrap')) parent.classList.add('nv-money-wrap');
    let helper = parent?.querySelector(':scope > .nv-money-helper');
    if(!helper && parent){ helper = document.createElement('div'); helper.className = 'nv-money-helper'; parent.appendChild(helper); }
    const update = () => {
      const digits = onlyDigits(input.value);
      input.value = formatThousands(digits);
      if(helper) helper.innerHTML = digits ? `<span>به حروف:</span><strong>${amountToWords(digits)}</strong>` : '<span>مبلغ را به تومان وارد کنید.</span>';
    };
    input.addEventListener('input', update);
    input.addEventListener('blur', update);
    update();
  }
  function initMoneyInputs(root=document){ root.querySelectorAll('input').forEach(input => { if(isMoneyInput(input)) decorateMoneyInput(input); }); }

  function normalizeNumericInputs(root=document){
    root.querySelectorAll('input[type="tel"],input[inputmode="numeric"],input[dir="ltr"],.nv-en-digits').forEach(el => {
      if(el.dataset.nvDigitsNorm === '1') return; el.dataset.nvDigitsNorm = '1';
      const shouldKeepEnglish = el.type === 'url' || el.type === 'email' || el.type === 'password' || el.id === 'clinic_latitude' || el.id === 'clinic_longitude' || el.id === 'clinic_map_url' || el.classList.contains('nv-keep-english-digits');
      const normalize = () => { el.value = shouldKeepEnglish ? toEnglishDigits(el.value) : toPersianDigits(el.value); };
      el.addEventListener('input', normalize);
      normalize();
    });
  }

  function improveApiConflict(){
    if(!window.apiRequest || window.apiRequest.__nvWrapped) return;
    const original = window.apiRequest;
    window.apiRequest = async function(endpoint, method='GET', data=null){
      try { return await original(endpoint, method, data); }
      catch(err){
        if(err && err.status === 409){
          err.message = err.message || 'این اطلاعات با رکورد دیگری تکراری است. نام کاربری، موبایل یا ایمیل را بررسی کنید.';
          if(typeof window.showToast === 'function') window.showToast(err.message, 'error');
        }
        throw err;
      }
    };
    window.apiRequest.__nvWrapped = true;
  }

  function currentUserIdFromStorage(){
    for(const key of ['user','currentUser','authUser','noorvista_user','nv_user']){
      try{ const raw = localStorage.getItem(key); if(!raw) continue; const obj = JSON.parse(raw); const id = Number(obj.id || obj.user_id || obj?.user?.id); if(id>0) return id; }catch(_){ }
    }
    return 0;
  }
  function protectCurrentUserActions(){
    if(!/\/dashboard\/panel\/admin\/users\.html/i.test(location.pathname)) return;
    const id = currentUserIdFromStorage();
    if(!id) return;
    document.querySelectorAll('button[onclick*="deleteUser"],button[onclick*="toggleUserStatus"]').forEach(btn => {
      const m = String(btn.getAttribute('onclick') || '').match(/\((\d+)/); if(!m) return;
      if(Number(m[1]) === id){ btn.disabled = true; btn.title = 'حذف یا غیرفعال‌سازی حساب جاری مجاز نیست'; btn.classList.add('is-disabled'); }
    });
  }

  function injectSettingsMapPreview(){
    if(!/\/settings\.html/i.test(location.pathname)) return;
    const lat = document.getElementById('clinic_latitude');
    const lng = document.getElementById('clinic_longitude');
    const mapUrl = document.getElementById('clinic_map_url');
    if(!lat || !lng || document.getElementById('nvSettingsMapPicker')) return;

    [lat,lng,mapUrl].forEach(el => {
      const group = el?.closest('.form-group');
      if(group) group.style.display = 'none';
    });
    const grid = lat.closest('.form-grid');
    if(grid && grid.querySelector('#clinic_longitude')) grid.style.display = 'none';

    const sectionTitle = Array.from(document.querySelectorAll('.settings-section-title')).find(el => /موقعیت|نقشه|موقعیت/.test(el.textContent || ''));
    const panel = document.createElement('div');
    panel.id = 'nvSettingsMapPicker';
    panel.className = 'nv-settings-map-picker';
    panel.innerHTML = `
      <div class="nv-settings-map-picker__head"><div><strong><i class="icon-location"></i> انتخاب موقعیت کلینیک</strong><small>روی نقشه کلیک کنید؛ همان نقطه به‌عنوان موقعیت کلینیک ذخیره می‌شود.</small></div></div>
      <div id="nvSettingsMapCanvas" class="nv-settings-map-picker__map"><div class="nv-settings-map-picker__fallback">در حال آماده‌سازی نقشه...</div></div>
      <div class="nv-settings-map-picker__meta"><span class="nv-settings-map-picker__coords" data-nv-map-coords>—</span><a href="#" target="_blank" rel="noopener" class="btn-sm btn-primary" data-nv-map-open>باز کردن در نشان</a></div>
    `;
    (sectionTitle || mapUrl?.closest('.form-group') || lng.closest('.form-group'))?.insertAdjacentElement('afterend', panel);
    const coordsEl = panel.querySelector('[data-nv-map-coords]');
    const open = panel.querySelector('[data-nv-map-open]');
    const DEFAULT = [35.6892, 51.3890];
    function parseNum(v){ const n = Number(toEnglishDigits(v)); return Number.isFinite(n) ? n : null; }
    function current(){ return [parseNum(lat.value) ?? DEFAULT[0], parseNum(lng.value) ?? DEFAULT[1]]; }
    function setLocation(la,lo,zoom=16){
      la = Number(la); lo = Number(lo); if(!Number.isFinite(la)||!Number.isFinite(lo)) return;
      lat.value = String(la); lng.value = String(lo);
      const url = `https://neshan.org/maps/@${la},${lo},${zoom}z,0p`;
      if(mapUrl) mapUrl.value = url;
      if(open) open.href = url;
      if(coordsEl) coordsEl.textContent = `${toPersianDigits(la.toFixed(6))} ، ${toPersianDigits(lo.toFixed(6))}`;
    }
    async function apiKey(){
      try{ const r=await fetch('/api/public/config/map',{cache:'no-store',credentials:'same-origin'}); const j=await r.json(); return j?.data?.apiKey || ''; }catch(_){ return ''; }
    }
    async function initMap(){
      const [la,lo] = current(); setLocation(la,lo);
      const canvas = document.getElementById('nvSettingsMapCanvas');
      if(!window.L || typeof window.L.map !== 'function'){
        canvas.innerHTML = '<div class="nv-settings-map-picker__fallback">کتابخانه نقشه بارگذاری نشد. صفحه را یک‌بار با Ctrl+F5 تازه‌سازی کنید.</div>';
        return;
      }
      canvas.innerHTML = '';
      let map;
      try {
        map = window.L.map('nvSettingsMapCanvas', { center:[la,lo], zoom:15, zoomControl:true, scrollWheelZoom:true });
      } catch (_) {
        try { map = new window.L.Map('nvSettingsMapCanvas', { center:[la,lo], zoom:15, zoomControl:true, scrollWheelZoom:true }); } catch (error) {
          canvas.innerHTML = '<div class="nv-settings-map-picker__fallback">نقشه آماده نشد. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.</div>';
          return;
        }
      }
      try {
        if (window.L.tileLayer) {
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);
        }
      } catch (_) {}
      const marker = window.L.marker([la,lo], { draggable:true }).addTo(map);
      const apply = e => { const p = e.latlng || marker.getLatLng(); marker.setLatLng(p); setLocation(p.lat,p.lng,16); };
      map.on('click', apply); marker.on('dragend', apply);
      setTimeout(()=>map.invalidateSize(),250);
      setTimeout(()=>map.invalidateSize(),800);
    }
    initMap();
  }

  function fixContactFallback(){
    if(!/\/contact(?:\.html)?$/i.test(location.pathname)) return;
    const shell = document.querySelector('.neshan-map-shell');
    const fallback = document.getElementById('neshanMapFallback');
    if(shell && fallback){
      setTimeout(() => {
        const hasCanvas = shell.querySelector('.leaflet-tile, canvas, .leaflet-marker-icon');
        if(!hasCanvas && fallback.hidden) fallback.hidden = false;
      }, 2200);
    }
  }



  function localizeVisibleDigits(root=document){
    try{
      const host = root.nodeType === 1 ? root : document.body;
      if(!host) return;
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode(node){
          const p = node.parentElement;
          if(!p) return NodeFilter.FILTER_REJECT;
          if(p.closest('script,style,textarea,input,select,option,code,pre,[contenteditable="true"],.nv-keep-english-digits')) return NodeFilter.FILTER_REJECT;
          return /[0-9٠-٩]/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => { const next = toPersianDigits(n.nodeValue); if(n.nodeValue !== next) n.nodeValue = next; });
      host.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
        if(el.matches('input[type="password"],textarea,select,option,.nv-keep-english-digits')) return;
        ['placeholder','title','aria-label'].forEach(attr => {
          const val = el.getAttribute(attr);
          if(val && /[0-9٠-٩]/.test(val)) el.setAttribute(attr, toPersianDigits(val));
        });
      });
    }catch(_){ }
  }

  function polishContactAddressBlocks(){
    document.querySelectorAll('.contact-quick-card .quick-item').forEach(item => {
      const label = item.querySelector('strong')?.textContent || '';
      if(/آدرس|ساعت|شماره|اینستاگرام/.test(label)) item.classList.add('nv-contact-info-polished');
    });
    document.querySelectorAll('.footer .contact-list a[href^="tel:"]').forEach(a => { a.textContent = toPersianDigits(a.textContent); });
  }

  function init(){
    improveApiConflict();
    normalizeNumericInputs();
    initMoneyInputs();
    injectSettingsMapPreview();
    fixContactFallback();
    protectCurrentUserActions();
    polishContactAddressBlocks();
    localizeVisibleDigits();
    const mo = new MutationObserver((muts)=>{ for(const m of muts){ m.addedNodes.forEach(n=>{ if(n.nodeType===1){ normalizeNumericInputs(n); initMoneyInputs(n); polishContactAddressBlocks(); localizeVisibleDigits(n); } }); } protectCurrentUserActions(); });
    mo.observe(document.body, {childList:true, subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
