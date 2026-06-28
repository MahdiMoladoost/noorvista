
(function(){
  function $(s,r){return (r||document).querySelector(s);}
  function $$(s,r){return Array.from((r||document).querySelectorAll(s));}
  function init(){
    const toggles = $$('.mobile-toggle,.nv-mobile-toggle,.nav-toggle,.menu-toggle');
    const menus = $$('.menu,.nav-menu,.main-menu');
    toggles.forEach(btn=>{
      if(btn.dataset.nvMobileMenuReady) return;
      btn.dataset.nvMobileMenuReady='1';
      btn.setAttribute('aria-label', btn.getAttribute('aria-label') || 'باز کردن منو');
      btn.addEventListener('click', function(e){
        e.preventDefault();
        const menu = menus[0];
        if(!menu) return;
        const open = menu.classList.toggle('open');
        menu.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
