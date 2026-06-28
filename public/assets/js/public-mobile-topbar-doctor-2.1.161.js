
(function () {
  if (window.__NV_PUBLIC_MOBILE_TOPBAR_DOCTOR_2161__) return;
  window.__NV_PUBLIC_MOBILE_TOPBAR_DOCTOR_2161__ = true;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function normalizeLoginText() {
    qsa('a, button').forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text === 'ورود پنل' || text === 'ورود به پنل') el.textContent = 'ورود';
    });
  }

  function ensureDoctorGlassCard() {
    const hero = qs('.hero-content') || qs('.hero .container') || qs('.hero');
    if (!hero || qs('.nv-mobile-doctor-glass', hero)) return;
    const anchor = qs('.eyebrow', hero) || hero.firstElementChild;
    const card = document.createElement('div');
    card.className = 'nv-mobile-doctor-glass';
    card.innerHTML = '<img src="/assets/images/doctor-1.webp" alt="دکتر محمدصادق حق‌پرست" loading="eager" decoding="async"><div class="nv-mobile-doctor-glass__text"><strong>دکتر محمدصادق حق‌پرست</strong><span>مشاوره و خدمات تخصصی کلینیک</span></div>';
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', card);
    else hero.prepend(card);
  }

  function moveSocialRowAfterContact() {
    const topbar = qs('.topbar');
    if (!topbar) return;
    const inner = qs('.topbar-inner', topbar) || qs('.container', topbar) || topbar;
    const info = qs('.topbar-info', topbar);
    const socials = qs('.socials', topbar);
    if (info && socials && socials.previousElementSibling !== info) {
      info.insertAdjacentElement('afterend', socials);
    }
  }

  function run() {
    normalizeLoginText();
    ensureDoctorGlassCard();
    moveSocialRowAfterContact();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const obs = new MutationObserver(() => {
    clearTimeout(obs._timer);
    obs._timer = setTimeout(run, 120);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
