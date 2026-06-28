(function () {
  'use strict';

  const articles = {
    prk: {
      title: 'حذف عینک با روش پی‌آرکی (PRK)',
      date: '۳۰ شهریور ۱۴۰۴',
      category: 'اصلاح دید و لیزر',
      categoryKey: 'laser',
      image: '/images/image_2.webp',
      excerpt: 'پی‌آرکی روشی لیزری و بدون ایجاد فلپ برای اصلاح نزدیک‌بینی، دوربینی و آستیگماتیسم است و برای برخی قرنیه‌های نازک گزینه مناسب‌تری محسوب می‌شود.',
      sections: [
        ['پی‌آرکی چیست؟', 'در روش پی‌آرکی، سطح قرنیه با لیزر اگزایمر اصلاح می‌شود تا تمرکز نور روی شبکیه بهتر شود. این روش بدون ایجاد فلپ قرنیه انجام می‌شود و انتخاب آن باید پس از معاینه کامل و بررسی ضخامت قرنیه باشد.'],
        ['چه کسانی ممکن است مناسب باشند؟', 'افراد بالای ۱۸ سال با شماره چشم پایدار، ضخامت قرنیه مناسب و معاینه چشم‌پزشکی طبیعی می‌توانند برای این روش بررسی شوند.'],
        ['مراقبت‌های مهم', 'قطع لنز تماسی پیش از عمل، تصویربرداری قرنیه، استفاده منظم از قطره‌ها و پرهیز از آرایش و ورزش سنگین در هفته‌های نخست اهمیت دارد.']
      ]
    },
    smile: {
      title: 'فمتواسمایل (SMILE)؛ اصلاح دید با برش کوچک',
      date: '۲۸ شهریور ۱۴۰۴',
      category: 'اصلاح دید و لیزر',
      categoryKey: 'laser',
      image: '/images/image_3.webp',
      excerpt: 'فمتواسمایل یکی از روش‌های نوین اصلاح دید است که با برش کوچک و بدون ایجاد فلپ بزرگ انجام می‌شود و برای بعضی بیماران دوره بهبود راحت‌تری دارد.',
      sections: [
        ['مزیت اصلی', 'فمتواسمایل برای بیمارانی که به دنبال روش کم‌تهاجمی‌تر هستند مطرح می‌شود؛ اما مناسب بودن آن به شماره چشم، ضخامت و نقشه قرنیه بستگی دارد.'],
        ['پیش از تصمیم‌گیری', 'تصمیم نهایی باید پس از معاینه، تصویربرداری قرنیه، بررسی خشکی چشم و ارزیابی سبک زندگی بیمار گرفته شود.']
      ]
    },
    icl: {
      title: 'کاشت لنز داخل چشمی (ICL)',
      date: '۲۸ شهریور ۱۴۰۴',
      category: 'اصلاح دید و لیزر',
      categoryKey: 'laser',
      image: '/images/device_1.webp',
      excerpt: 'کاشت لنز داخل چشمی برای اصلاح نزدیک‌بینی بالا، آستیگماتیسم و بعضی موارد قرنیه نازک مطرح می‌شود و در آن قرنیه تراش داده نمی‌شود.',
      sections: [
        ['این روش برای چه کسانی مطرح است؟', 'در بیمارانی که شماره چشم بالا یا قرنیه نازک دارند و روش‌های لیزری مناسب نیستند، کاشت لنز داخل چشمی می‌تواند گزینه بررسی باشد.'],
        ['مزایا و محدودیت‌ها', 'حفظ ساختار قرنیه و امکان خارج‌سازی لنز از مزیت‌های مهم است؛ با این حال انتخاب بیمار باید دقیق و بر اساس اندازه‌های داخل چشم انجام شود.'],
        ['پیگیری پس از عمل', 'کنترل فشار چشم، سلامت قرنیه و وضعیت لنز در ویزیت‌های بعد از عمل اهمیت زیادی دارد.']
      ]
    },
    amblyopia: {
      title: 'تنبلی چشم؛ علت، تشخیص و درمان',
      date: '۱۲ مهر ۱۴۰۴',
      category: 'بیماری‌های چشم',
      categoryKey: 'disease',
      image: '/images/image_4.webp',
      excerpt: 'تنبلی چشم یکی از اختلالات مهم تکامل بینایی در کودکان است و تشخیص زودهنگام، شانس درمان و تکامل بهتر بینایی را افزایش می‌دهد.',
      sections: [
        ['تنبلی چشم چیست؟', 'تنبلی چشم زمانی رخ می‌دهد که مغز در سال‌های حساس رشد، تصویر یکی از چشم‌ها را به‌درستی پردازش نکند. این مشکل ممکن است در ظاهر چشم مشخص نباشد و فقط با سنجش دقیق دید تشخیص داده شود.'],
        ['علائم مهم', 'کاهش دید یک چشم، انحراف چشم، بستن یک چشم هنگام نگاه کردن، نزدیک‌شدن بیش از حد به اشیا یا نتیجه غیرطبیعی غربالگری بینایی می‌تواند نیازمند بررسی تخصصی باشد.'],
        ['علت‌های رایج', 'اختلاف شماره دو چشم، انحراف چشم، عیوب انکساری اصلاح‌نشده و کدورت مسیر بینایی از علت‌های مهم هستند. تعیین علت برای انتخاب درمان مناسب ضروری است.'],
        ['روش‌های درمان', 'درمان ممکن است شامل عینک، بستن چشم سالم، درمان علت زمینه‌ای، تمرین‌های بینایی و پیگیری منظم باشد. نوع و مدت درمان بر اساس سن کودک و شدت کاهش دید تعیین می‌شود.'],
        ['اهمیت پیگیری', 'بهبود بینایی معمولاً تدریجی است و نیاز به همکاری خانواده و پیگیری منظم دارد. قطع خودسرانه درمان می‌تواند نتیجه را کاهش دهد.']
      ]
    },
    glaucoma: {
      title: 'آب‌سیاه؛ علائم و اهمیت پیگیری',
      date: '۱۲ مهر ۱۴۰۴',
      category: 'بیماری‌های چشم',
      categoryKey: 'disease',
      image: '/images/image_1.webp',
      excerpt: 'آب‌سیاه بیماری پیشرونده عصب بینایی است و چون در مراحل نخست ممکن است بی‌علامت باشد، معاینه دوره‌ای اهمیت زیادی دارد.',
      sections: [
        ['چرا مهم است؟', 'آسیب عصب بینایی در آب‌سیاه معمولاً برگشت‌پذیر نیست؛ به همین دلیل تشخیص زودهنگام و کنترل فشار چشم اهمیت دارد.'],
        ['ارزیابی و پیگیری', 'اندازه‌گیری فشار چشم، بررسی عصب بینایی، تصویربرداری و آزمون میدان دید از ارزیابی‌های رایج هستند.']
      ]
    },
    strabismus: {
      title: 'انحراف چشم؛ تشخیص و مسیر درمان',
      date: '۱۲ مهر ۱۴۰۴',
      category: 'بیماری‌های چشم',
      categoryKey: 'disease',
      image: '/images/image_6.webp',
      excerpt: 'در انحراف چشم، دو چشم به‌طور هم‌زمان روی یک نقطه متمرکز نمی‌شوند و درمان بر اساس سن، علت و شدت متفاوت است.',
      sections: [
        ['علائم', 'دوبینی، خستگی چشم، بستن یک چشم، کج گرفتن سر یا ظاهر نامتقارن چشم‌ها می‌تواند نشانه نیاز به بررسی باشد.'],
        ['روش‌های درمان', 'عینک، درمان تنبلی چشم، تمرین و در بعضی موارد جراحی عضلات چشم از گزینه‌های درمانی هستند.']
      ]
    },
    dryeye: {
      title: 'خشکی چشم؛ نشانه‌ها و راه‌های کنترل',
      date: 'فروردین ۱۴۰۴',
      category: 'بیماری‌های چشم',
      categoryKey: 'disease',
      image: '/images/eye-exam_1.webp',
      excerpt: 'خشکی چشم با سوزش، احساس جسم خارجی، تاری دید نوسانی یا اشک‌ریزش واکنشی دیده می‌شود و نیازمند تشخیص علت زمینه‌ای است.',
      sections: [
        ['علت‌ها', 'کار طولانی با صفحه‌نمایش، بیماری‌های پلک، مصرف بعضی داروها و شرایط محیطی می‌تواند خشکی چشم را تشدید کند.'],
        ['راهکارهای کنترل', 'اصلاح عادت‌های کاری، پلک‌زدن آگاهانه، درمان التهاب پلک و استفاده از قطره مناسب طبق نظر پزشک کمک‌کننده است.']
      ]
    },
    sunscreen: {
      title: 'راهنمای انتخاب ضدآفتاب دور چشم',
      date: '۱۲ مهر ۱۴۰۴',
      category: 'زیبایی و مراقبت پلک',
      categoryKey: 'beauty',
      image: '/images/gallery-4.webp',
      excerpt: 'پوست اطراف چشم نازک و حساس است؛ انتخاب ضدآفتاب مناسب باید با توجه به حساسیت، چربی پوست و احتمال تحریک انجام شود.',
      sections: [
        ['نکات انتخاب', 'فرمول‌های سبک، بدون عطر و مناسب پوست حساس معمولاً برای اطراف چشم بهتر تحمل می‌شوند.'],
        ['روش استفاده', 'مقدار کم و با فاصله از خط مژه استفاده شود تا وارد چشم نشود و باعث سوزش نگردد.']
      ]
    }
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
  }

  function slugify(index) {
    return `article-section-${index + 1}`;
  }

  function currentClinicName() {
    return window.SadraBranding?.get?.().clinicName || document.documentElement.dataset.clinicName || 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست';
  }

  function updateMeta(article) {
    document.title = `${article.title} | ${currentClinicName()}`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', article.excerpt);
  }

  function renderRelated(currentKey, article) {
    const mount = document.getElementById('relatedArticles');
    if (!mount) return;
    const sameCategory = Object.entries(articles).filter(([key, item]) => key !== currentKey && item.categoryKey === article.categoryKey);
    const others = Object.entries(articles).filter(([key, item]) => key !== currentKey && item.categoryKey !== article.categoryKey);
    const related = [...sameCategory, ...others].slice(0, 3);
    mount.innerHTML = related.map(([key, item]) => `
      <article class="nv-related-card">
        <a class="nv-related-image" href="/blog-single?article=${encodeURIComponent(key)}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy"></a>
        <div><span>${escapeHtml(item.category)}</span><h3><a href="/blog-single?article=${encodeURIComponent(key)}">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.excerpt)}</p><a class="nv-related-more" href="/blog-single?article=${encodeURIComponent(key)}">مطالعه مقاله <span aria-hidden="true">←</span></a></div>
      </article>`).join('');
  }

  function renderNotFound() {
    const mount = document.getElementById('articleMount');
    if (!mount) return;
    document.getElementById('articleHeroTitle').textContent = 'مقاله پیدا نشد';
    document.getElementById('articleHeroExcerpt').textContent = 'نشانی مقاله معتبر نیست یا این مطلب در دسترس قرار ندارد.';
    document.getElementById('articleBreadcrumbTitle').textContent = 'مقاله پیدا نشد';
    document.getElementById('articleCategory').textContent = 'خطای نشانی';
    document.getElementById('articleDate').textContent = '—';
    document.getElementById('articleToc').innerHTML = '<a href="/blog">بازگشت به فهرست مقالات</a>';
    mount.innerHTML = '<div class="nv-article-empty"><h2>مطلب موردنظر در دسترس نیست</h2><p>از فهرست مقالات، مطلب دیگری را انتخاب کنید.</p><a class="btn btn-primary" href="/blog">مشاهده مقالات</a></div>';
    const related = document.getElementById('relatedArticles');
    if (related) related.innerHTML = '';
  }

  function renderArticle(key, article) {
    updateMeta(article);
    document.getElementById('articleBreadcrumbTitle').textContent = article.title;
    document.getElementById('articleCategory').textContent = article.category;
    document.getElementById('articleHeroTitle').textContent = article.title;
    document.getElementById('articleHeroExcerpt').textContent = article.excerpt;
    document.getElementById('articleDate').textContent = article.date;

    const mount = document.getElementById('articleMount');
    const toc = document.getElementById('articleToc');
    if (!mount || !toc) return;

    const sections = article.sections.map(([title, body], index) => {
      const id = slugify(index);
      return `<section class="nv-article-copy-section" id="${id}"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></section>`;
    }).join('');

    mount.innerHTML = `
      <figure class="nv-article-cover"><img src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}" loading="eager"><figcaption>تصویر آموزشی مرتبط با موضوع مقاله</figcaption></figure>
      <div class="nv-article-lead"><strong>خلاصه مقاله</strong><p>${escapeHtml(article.excerpt)}</p></div>
      ${sections}
      <div class="nv-article-notice"><strong>توجه پزشکی</strong><p>اطلاعات این صفحه برای آگاهی عمومی است و جایگزین معاینه، تشخیص یا برنامه درمانی پزشک نیست.</p></div>`;

    toc.innerHTML = article.sections.map(([title], index) => `<a href="#${slugify(index)}"><span>${(index + 1).toLocaleString('fa-IR')}</span>${escapeHtml(title)}</a>`).join('');
    renderRelated(key, article);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const key = String(params.get('article') || '').trim().toLowerCase();
    const article = articles[key];
    if (!article) {
      renderNotFound();
      return;
    }
    renderArticle(key, article);
  });
})();
