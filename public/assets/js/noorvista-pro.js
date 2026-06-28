
(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const articles = {
    prk: {
      title: 'حذف دائمی عینک با لیزر چشم PRK',
      date: 'شهریور ۳۰، ۱۴۰۴',
      category: 'اصلاح عیوب انکساری',
      image: '/images/image_2.webp',
      excerpt: 'PRK روشی لیزری و بدون ایجاد فلپ برای اصلاح نزدیک‌بینی، دوربینی و آستیگماتیسم است و برای برخی قرنیه‌های نازک گزینه مناسب‌تری محسوب می‌شود.',
      sections: [
        ['PRK چیست؟', 'در روش PRK، سطح قرنیه با لیزر اگزایمر اصلاح می‌شود تا تمرکز نور روی شبکیه بهتر شود. این روش بدون ایجاد فلپ قرنیه انجام می‌شود و انتخاب آن باید پس از معاینه کامل و بررسی ضخامت قرنیه باشد.'],
        ['کاندید مناسب', 'افراد بالای ۱۸ سال با شماره چشم پایدار، ضخامت قرنیه مناسب و معاینه چشم‌پزشکی طبیعی می‌توانند کاندید بررسی برای PRK باشند.'],
        ['مراقبت‌ها', 'قطع لنز تماسی پیش از عمل، انجام تصویربرداری قرنیه، استفاده منظم از قطره‌ها و پرهیز از آرایش و ورزش سنگین در هفته‌های اول اهمیت دارد.']
      ]
    },
    smile: {
      title: 'فمتواسمایل SMILE؛ لیزر چشم با برش کوچک',
      date: 'شهریور ۲۸، ۱۴۰۴',
      category: 'اصلاح دید',
      image: '/images/bg_2.webp',
      excerpt: 'SMILE یکی از روش‌های نوین اصلاح دید است که با برش کوچک و بدون ایجاد فلپ بزرگ انجام می‌شود و برای برخی بیماران دوره ریکاوری راحت‌تری دارد.',
      sections: [
        ['مزیت اصلی', 'فمتواسمایل برای بیمارانی که به دنبال روش کم‌تهاجمی‌تر هستند مطرح می‌شود؛ اما مناسب بودن آن به شماره چشم، ضخامت و نقشه قرنیه بستگی دارد.'],
        ['قبل از تصمیم‌گیری', 'تصمیم نهایی باید پس از معاینه، توپوگرافی، بررسی خشکی چشم و ارزیابی سبک زندگی بیمار گرفته شود.']
      ]
    },
    icl: {
      title: 'کاشت لنز داخل چشمی ICL',
      date: 'شهریور ۲۸، ۱۴۰۴',
      category: 'جراحی درمانی',
      image: '/images/bg_3.webp',
      excerpt: 'ICL برای اصلاح نزدیک‌بینی بالا، آستیگماتیسم و برخی موارد قرنیه نازک مطرح می‌شود و در آن قرنیه تراش داده نمی‌شود.',
      sections: [
        ['ICL برای چه کسانی است؟', 'در بیمارانی که شماره چشم بالا یا قرنیه نازک دارند و روش‌های لیزری مناسب نیستند، کاشت لنز داخل چشمی می‌تواند گزینه بررسی باشد.'],
        ['مزایا', 'حفظ ساختار قرنیه، کیفیت دید مطلوب، امکان خارج‌سازی لنز در صورت نیاز و احتمال کمتر خشکی چشم از مزیت‌های مهم این روش است.'],
        ['پیگیری پس از عمل', 'کنترل فشار چشم، سلامت قرنیه و وضعیت لنز در ویزیت‌های بعد از عمل اهمیت زیادی دارد.']
      ]
    },
    amblyopia: {
      title: 'تنبلی چشم؛ علت، تشخیص و درمان',
      date: 'مهر ۱۲، ۱۴۰۴',
      category: 'آموزش بیماران',
      image: '/images/image_4.webp',
      excerpt: 'تنبلی چشم یکی از اختلالات مهم تکامل بینایی در کودکان است و تشخیص زودهنگام شانس درمان را بیشتر می‌کند.',
      sections: [
        ['علائم مهم', 'کاهش دید یک چشم، انحراف چشم، بستن یک چشم هنگام نگاه کردن یا ضعف عملکرد در تست بینایی می‌تواند نیازمند بررسی باشد.'],
        ['درمان', 'درمان ممکن است شامل عینک، بستن چشم سالم، تمرین‌های بینایی و پیگیری منظم باشد.']
      ]
    },
    glaucoma: {
      title: 'آب‌سیاه چشم؛ علائم، علل و پیشگیری',
      date: 'مهر ۱۲، ۱۴۰۴',
      category: 'بیماری‌های چشم',
      image: '/images/image_5.webp',
      excerpt: 'گلوکوم بیماری پیشرونده عصب بینایی است و چون در مراحل اول ممکن است بی‌علامت باشد، معاینه دوره‌ای اهمیت دارد.',
      sections: [
        ['چرا مهم است؟', 'آسیب عصب بینایی در گلوکوم معمولاً برگشت‌پذیر نیست؛ به همین دلیل تشخیص و کنترل فشار چشم اهمیت دارد.'],
        ['پیگیری', 'اندازه‌گیری فشار چشم، بررسی عصب بینایی و تست میدان دید از ارزیابی‌های رایج هستند.']
      ]
    },
    strabismus: {
      title: 'انحراف چشم؛ تشخیص و درمان',
      date: 'مهر ۱۲، ۱۴۰۴',
      category: 'درمان تخصصی',
      image: '/images/image_6.webp',
      excerpt: 'در انحراف چشم، دو چشم به طور هم‌زمان روی یک نقطه متمرکز نمی‌شوند و درمان بسته به سن، علت و شدت متفاوت است.',
      sections: [
        ['علائم', 'دو بینی، خستگی چشم، بستن یک چشم، کج گرفتن سر یا ظاهر نامتقارن چشم‌ها می‌تواند نشانه نیاز به بررسی باشد.'],
        ['درمان', 'عینک، تمرین، درمان تنبلی چشم و در برخی موارد جراحی عضلات چشم از گزینه‌های درمانی هستند.']
      ]
    },
    dryeye: {
      title: 'خشکی چشم؛ علائم و بهترین راهکارهای کنترل',
      date: 'فروردین ۱۴۰۴',
      category: 'آموزش بیماران',
      image: '/images/about.webp',
      excerpt: 'خشکی چشم با سوزش، احساس جسم خارجی، تاری دید نوسانی یا اشک‌ریزش واکنشی دیده می‌شود و نیازمند تشخیص علت زمینه‌ای است.',
      sections: [
        ['علت‌ها', 'کار طولانی با صفحه‌نمایش، بیماری‌های پلک، مصرف برخی داروها و شرایط محیطی می‌تواند خشکی چشم را تشدید کند.'],
        ['راهکارها', 'اصلاح عادت‌های کاری، پلک زدن آگاهانه، درمان التهاب پلک و استفاده از قطره مناسب طبق نظر پزشک کمک‌کننده است.']
      ]
    },
    sunscreen: {
      title: 'کرم ضدآفتاب دور چشم؛ انتخاب مناسب پوست حساس',
      date: 'مهر ۱۲، ۱۴۰۴',
      category: 'زیبایی و مراقبت',
      image: '/images/gallery-2.webp',
      excerpt: 'پوست اطراف چشم نازک و حساس است؛ انتخاب ضدآفتاب مناسب باید با توجه به حساسیت، چربی پوست و احتمال تحریک انجام شود.',
      sections: [
        ['نکته انتخاب', 'فرمول‌های سبک، بدون عطر و مناسب پوست حساس برای دور چشم بهتر تحمل می‌شوند.'],
        ['روش استفاده', 'مقدار کم و با فاصله از خط مژه استفاده شود تا وارد چشم نشود و باعث سوزش نگردد.']
      ]
    }
  };

  window.SadraArticles = articles;

  function normalizeDigits(value) {
    return String(value || '')
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }

  function getValue(form, name) {
    const el = form.elements[name] || form.querySelector(`[name="${name}"]`);
    return el ? String(el.value || '').trim() : '';
  }

  function setStatus(form, message, type) {
    let status = $('.nv-status', form);
    if (!status) {
      status = document.createElement('div');
      status.className = 'nv-status';
      form.appendChild(status);
    }
    status.className = `nv-status is-visible ${type || 'info'}`;
    status.textContent = message;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'ارسال اطلاعات با خطا روبه‌رو شد.');
    }
    return data;
  }

  function appointmentPayload(form) {
    return {
      full_name: getValue(form, 'full_name'),
      phone: normalizeDigits(getValue(form, 'phone')),
      email: getValue(form, 'email'),
      service: getValue(form, 'service'),
      preferred_date: normalizeDigits(getValue(form, 'preferred_date')),
      preferred_time: normalizeDigits(getValue(form, 'preferred_time')),
      message: getValue(form, 'message')
    };
  }

  function contactPayload(form) {
    return {
      full_name: getValue(form, 'full_name'),
      phone: normalizeDigits(getValue(form, 'phone')),
      email: getValue(form, 'email'),
      subject: getValue(form, 'subject'),
      message: getValue(form, 'message')
    };
  }

  function validateAppointment(payload) {
    if (!payload.full_name || payload.full_name.length < 3) return 'نام کامل را وارد کنید.';
    if (!payload.phone || payload.phone.replace(/\D/g, '').length < 10) return 'شماره تماس معتبر وارد کنید.';
    return '';
  }

  function validateContact(payload) {
    if (!payload.full_name || payload.full_name.length < 3) return 'نام کامل را وارد کنید.';
    if (!payload.message || payload.message.length < 6) return 'متن پیام را کامل‌تر وارد کنید.';
    if (!payload.phone && !payload.email) return 'حداقل شماره تماس یا ایمیل را وارد کنید.';
    return '';
  }

  async function handleSubmit(event) {
    const form = event.target;
    const isAppointment = form.matches('[data-public-form="appointment"], .appointment-form');
    const isContact = form.matches('[data-public-form="contact"], #contactForm');
    if (!isAppointment && !isContact) return;
    event.preventDefault();

    try {
      if (isAppointment) {
        const payload = appointmentPayload(form);
        const error = validateAppointment(payload);
        if (error) return setStatus(form, error, 'error');
        setStatus(form, 'در حال ثبت دریافت نوبت...', 'info');
        await postJson('/api/public/appointment-request', payload);
        form.reset();
        setStatus(form, 'دریافت نوبت ثبت شد. وضعیت نوبت از مسیر پیگیری یا مشاوره آنلاین قابل بررسی است.', 'success');
      } else {
        const payload = contactPayload(form);
        const error = validateContact(payload);
        if (error) return setStatus(form, error, 'error');
        setStatus(form, 'در حال ثبت سوال...', 'info');
        await postJson('/api/public/contact-message', payload);
        form.reset();
        setStatus(form, 'سوال شما ثبت شد. برای پاسخ سریع‌تر می‌توانید از مشاوره آنلاین استفاده کنید.', 'success');
      }
    } catch (error) {
      setStatus(form, error.message || 'خطا در ارسال اطلاعات. لطفاً دوباره تلاش کنید.', 'error');
    }
  }

  function setupNav() {
    const toggle = $('.nv-mobile-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      const open = !document.body.classList.contains('nav-open');
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.innerHTML = open ? '<span class="nv-close-icon nv-icon-close" aria-hidden="true"></span>' : '<span class="nv-menu-icon nv-icon-menu" aria-hidden="true"></span>';
    });
    $$('.nv-menu a').forEach(a => a.addEventListener('click', () => {
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span class="nv-menu-icon nv-icon-menu" aria-hidden="true"></span>';
    }));
    window.addEventListener('scroll', () => {
      const header = $('.nv-header');
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    }, { passive: true });
  }

  function setupCounters() {
    const counters = $$('[data-count]');
    if (!counters.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = el => {
      const target = Number(el.dataset.count || 0);
      if (!target || reduce) { el.textContent = target.toLocaleString('fa-IR'); return; }
      const start = performance.now();
      const duration = 900;
      const step = now => {
        const progress = Math.min((now - start) / duration, 1);
        const value = Math.floor(target * (1 - Math.pow(1 - progress, 3)));
        el.textContent = value.toLocaleString('fa-IR');
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .5 });
    counters.forEach(el => observer.observe(el));
  }


  function setupOpenChatLinks() {
    $$('[data-open-chat]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const widget = document.getElementById('ai-chat-widget');
        const toggle = document.getElementById('chat-toggle-btn');
        const windowEl = document.getElementById('chat-window');
        if (windowEl) {
          windowEl.style.display = 'flex';
          return;
        }
        if (toggle) toggle.click();
        if (widget) widget.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    });
  }

  function setupArticlePage() {
    const mount = $('#articleMount');
    if (!mount) return;
    const params = new URLSearchParams(location.search);
    const key = params.get('article') || 'prk';
    const article = articles[key] || articles.prk;
    document.title = `${article.title} | صدرا`;
    const sections = article.sections.map(([title, body]) => `<h2>${title}</h2><p>${body}</p>`).join('');
    mount.innerHTML = `
      <div class="nv-article-content">
        <div class="nv-tags"><span class="nv-tag">${article.category}</span><span class="nv-tag">${article.date}</span></div>
        <h1>${article.title}</h1>
        <p>${article.excerpt}</p>
        <img src="${article.image}" alt="${article.title}" style="width:100%;max-height:420px;object-fit:cover;border-radius:28px;margin:24px 0;">
        ${sections}
        <div class="nv-band" style="margin-top:28px;">
          <h2>برای انتخاب روش مناسب، معاینه تخصصی ضروری است</h2>
          <p>اطلاعات این صفحه آموزشی است و جایگزین تشخیص پزشک نیست. برای بررسی شرایط چشم و انتخاب روش مناسب، دریافت نوبت ثبت کنید.</p>
          <a class="nv-btn nv-btn-primary" href="/contact">دریافت نوبت</a>
        </div>
      </div>`;
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupNav();
    setupCounters();
    setupArticlePage();
    setupOpenChatLinks();
    document.addEventListener('submit', handleSubmit);
  });
})();
