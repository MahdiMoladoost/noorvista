
(function () {
  if (window.__NV_COMPREHENSIVE_AUDIT_2146__) return;
  window.__NV_COMPREHENSIVE_AUDIT_2146__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';

  function toFa(value) {
    return String(value ?? '').replace(/\d/g, d => faDigits[Number(d)]);
  }
  function normalizeDigits(value) {
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(faDigits.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(arDigits.indexOf(d)));
  }

  function localizeTextNumbers(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || ['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-nv-no-digit-localize], input, textarea, select, code, pre')) return NodeFilter.FILTER_REJECT;
        return /\d/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { node.nodeValue = toFa(node.nodeValue); });
  }

  function prepareApiPayload(payload) {
    if (payload == null) return payload;
    if (typeof payload === 'string') return normalizeDigits(payload);
    if (Array.isArray(payload)) return payload.map(prepareApiPayload);
    if (typeof payload === 'object') {
      const out = {};
      Object.keys(payload).forEach(k => { out[k] = prepareApiPayload(payload[k]); });
      return out;
    }
    return payload;
  }

  // Normalize Persian digits before JSON API requests.
  const nativeFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    try {
      if (init && typeof init.body === 'string' && /application\/json/i.test(String(init.headers && (init.headers['Content-Type'] || init.headers['content-type']) || ''))) {
        const parsed = JSON.parse(init.body);
        init = Object.assign({}, init, { body: JSON.stringify(prepareApiPayload(parsed)) });
      }
    } catch (_) {}
    return nativeFetch.call(this, input, init);
  };

  function cleanupModals() {
    document.querySelectorAll('.modal-overlay, .forgot-modal, .nv-public-booking').forEach(modal => {
      if (modal.dataset.nvModalAuditReady) return;
      modal.dataset.nvModalAuditReady = '1';
      modal.addEventListener('wheel', event => {
        const scrollable = event.target.closest('.modal-body,.nv-modal-body,.nv-public-booking__body,.forgot-dialog');
        if (!scrollable) return;
      }, { passive: true });
    });
  }

  function cleanupMoneyHelpers() {
    const groups = new Map();
    document.querySelectorAll('.nv-money-helper, .nv-money-words, .money-words').forEach(el => {
      const input = el.closest('.form-group,.nv-form-field,.input-group')?.querySelector('input') || el.previousElementSibling;
      const key = input ? input : el.parentElement;
      const arr = groups.get(key) || [];
      arr.push(el);
      groups.set(key, arr);
    });
    groups.forEach(arr => {
      arr.forEach((el, idx) => { if (idx < arr.length - 1) el.remove(); });
    });
  }

  function fixChatbotFloating() {
    const panel = document.querySelector('.chatbot-panel');
    if (!panel) return;
    const open = panel.classList.contains('open') || document.body.classList.contains('chatbot-open');
    document.querySelectorAll('.floating-actions,.site-floating-actions,.nv-floating-actions').forEach(el => {
      el.style.display = open ? 'none' : '';
      el.style.pointerEvents = open ? 'none' : '';
    });
  }


  function clearZeroAccountDefaults2147() {
    document.querySelectorAll('#patientAccountCreateFields input#username, #patientAccountCreateFields input#password').forEach(el => {
      if (/^0+$/.test(String(el.value || '').trim())) el.value = '';
      el.required = false;
    });
  }


  function enforcePatientBookingIdentity214150() {
    const body = document.body;
    const path = String(location.pathname || '').replace(/\/+/g, '/');
    const patientMode = body?.dataset?.panelRole === 'patient' || body?.dataset?.patientPage || body?.classList?.contains('nv3-role-patient') || path.includes('/dashboard/panel/patient/');
    if (!patientMode) return;
    const modal = document.getElementById('nvPublicBooking');
    if (!modal) return;
    modal.classList.add('is-patient-panel-booking');
    ['nvBookingFirstName','nvBookingLastName','nvBookingPhone'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.required = false;
      input.disabled = true;
      input.value = '';
      const field = input.closest('.nv-booking-field');
      if (field) {
        field.hidden = true;
        field.classList.add('nv-patient-identity-hidden');
        field.style.display = 'none';
      }
    });
    const label = modal.querySelector('[data-nv-progress="6"] span:last-child');
    if (label) label.textContent = 'توضیحات';
    const desc = modal.querySelector('[data-nv-booking-step="6"] .nv-booking-step__head p');
    if (desc) desc.textContent = 'شما وارد حساب بیمار شده‌اید؛ نیازی به نام، نام خانوادگی و شماره موبایل نیست.';
  }

  function run() {
    enforcePatientBookingIdentity214150();
    clearZeroAccountDefaults2147();
    localizeTextNumbers();
    cleanupModals();
    cleanupMoneyHelpers();
    fixChatbotFloating();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
