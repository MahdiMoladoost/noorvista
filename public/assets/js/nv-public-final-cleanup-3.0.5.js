(function(){
  'use strict';
  function run(){
    try { if (window.NVRenderFinalTopbar) window.NVRenderFinalTopbar(); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  [0, 80, 240, 700, 1400].forEach(function(ms){ setTimeout(run, ms); });
  document.addEventListener('noorvista:public-settings', function(){ setTimeout(run, 40); setTimeout(run, 180); });
})();
