'use strict';

const crypto = require('crypto');
const settingsService = require('./settingsService');
const faqService = require('./faqService');

const DISCLAIMER = 'این پاسخ اطلاعات عمومی است و جایگزین معاینه، تشخیص یا تجویز پزشک نیست.';
const EMERGENCY_REPLY = 'علائمی که گفتید می‌تواند نیازمند ارزیابی فوری باشد. رزرو عادی یا گفت‌وگوی آنلاین کافی نیست؛ همین حالا با اورژانس یا چشم‌پزشک کشیک تماس بگیرید. در تماس با مواد شیمیایی، چشم را فوراً با آب تمیز فراوان شست‌وشو دهید.';
const MEDICATION_REPLY = 'برای شروع، قطع یا تغییر دارو و قطره چشم باید پزشک پرونده شما تصمیم بگیرد. لطفاً نام دارو و علائم را به کلینیک اعلام کنید؛ در صورت درد شدید، کاهش ناگهانی دید یا بدترشدن سریع، مراجعه فوری لازم است.';
const DIAGNOSIS_REPLY = 'از روی پیام کوتاه، عکس یا نتیجه آزمایش نمی‌شود تشخیص قطعی داد. می‌توانم اطلاعات عمومی بدهم، اما برای تشخیص، تعیین شدت مشکل یا انتخاب درمان باید معاینه چشم‌پزشکی انجام شود. لطفاً برای بررسی دقیق‌تر با کلینیک هماهنگ کنید.';
const FALLBACK_REPLY = 'در حال حاضر پاسخ تأییدشده‌ای برای این پرسش ندارم. لطفاً با کلینیک تماس بگیرید.';


const INTENT_PROFILES = {
  vision_correction: {
    label: 'ضعیفی چشم، شماره چشم، حذف عینک، لیزیک/لازک/PRK/SMILE/ICL',
    terms: [/لیزیک/i, /لازک/i, /فمتو\s*لیزیک/i, /فمتولیزیک/i, /اسمایل/i, /smile/i, /\bprk\b/i, /ترنس\s*پی\s*آر\s*کی/i, /trans\s*prk/i, /حذف\s*عینک/i, /برداشتن\s*عینک/i, /اصلاح\s*دید/i, /عیب\s*انکساری/i, /ضعیف(?:ی|ه)?\s*چشم/i, /چشم(?:م|ام|امون|هام|هایم|ها)?\s*.*ضعیف/i, /چشمام.*ضعیف/i, /چشام.*ضعیف/i, /(چشم|دید|بینایی).*ضعیف/i, /ضعیف.*(چشم|دید|بینایی)/i, /شماره\s*چشم/i, /شماره.*(چشم|دید)/i, /نمره\s*چشم/i, /نمره.*(چشم|دید)/i, /برگشت\s*(شماره|نمره)/i, /نزدیک\s*بینی/i, /دور\s*بینی/i, /آستیگمات/i, /استیگمات/i],
    guidance: 'برای ضعیفی چشم یا تصمیم درباره لیزیک/لازک، مناسب بودن عمل فقط بعد از معاینه مشخص می‌شود؛ سن، ثبات شماره چشم، ضخامت و نقشه قرنیه، خشکی چشم، اندازه مردمک و سلامت شبکیه بررسی می‌شود. ممکن است بسته به شرایط PRK، فمتولیزیک، SMILE، ICL یا فقط عینک/لنز مناسب باشد. اگر کاهش دید ناگهانی یا درد دارید، مراجعه فوری لازم است.'
  },
  cataract: {
    label: 'آب مروارید و تاری دید تدریجی',
    terms: [/آب\s*مروارید/i, /کاتاراکت/i, /عدسی/i, /تاری\s*دید\s*تدریجی/i],
    guidance: 'آب مروارید معمولاً با تاری تدریجی دید، خیرگی نور و تغییر شماره عینک همراه است، اما تشخیص و زمان عمل فقط با معاینه و بررسی چشم‌پزشک مشخص می‌شود.'
  },
  dry_eye: {
    label: 'خشکی، سوزش، خارش و قرمزی چشم',
    terms: [/خشکی\s*چشم/i, /سوزش/i, /می\s*سوز(?:ه|د)?/i, /میسوز(?:ه|د)?/i, /چشم(?:م|ام|هام|هایم|ها)?\s*.*سوز/i, /خارش/i, /اشک/i, /اشک\s*ریزش/i, /قرمز(?:ی)?\s*چشم/i],
    guidance: 'خشکی یا التهاب چشم می‌تواند علت‌های مختلفی داشته باشد. چشم را نمالید، اگر لنز دارید خارج کنید و از مصرف خودسرانه قطره آنتی‌بیوتیک یا کورتون خودداری کنید. اگر درد شدید، کاهش دید، ترشح زیاد یا حساسیت شدید به نور دارید، ارزیابی فوری لازم است.'
  },
  dark_circle: {
    label: 'تیرگی، سیاهی یا گودی دور چشم',
    terms: [/(?:دور|زیر)\s*چشم(?:م|ام|هام|هایم|ها)?\s*.*(?:سیاه|تیره|کبود|گود)/i, /(?:سیاه|تیره|کبود|گود)\s*.*(?:دور|زیر)\s*چشم/i, /سیاهی\s*(?:دور|زیر)\s*چشم/i, /تیرگی\s*(?:دور|زیر)\s*چشم/i, /گودی\s*(?:دور|زیر)\s*چشم/i],
    guidance: 'تیرگی یا سیاهی دور چشم می‌تواند به ژنتیک، کم‌خوابی، حساسیت و مالش چشم، نازکی پوست، گودی زیر چشم، تغییرات رنگدانه‌ای یا مشکلات پلک و پوست اطراف چشم مربوط باشد. درمان به علت بستگی دارد و بدون معاینه نمی‌شود روش قطعی پیشنهاد داد. اگر همراه با ورم ناگهانی، درد، قرمزی شدید، ضربه یا کاهش دید است، مراجعه فوری لازم است.'
  },
  appointment: {
    label: 'رزرو نوبت و مراجعه',
    terms: [/نوبت/i, /رزرو/i, /وقت/i, /ویزیت/i, /مراجعه/i, /مشاوره/i],
    guidance: 'برای رزرو نوبت می‌توانید از دکمه رزرو نوبت سایت استفاده کنید یا با پذیرش کلینیک تماس بگیرید تا زمان مناسب بر اساس نوع خدمت و پزشک مشخص شود.'
  },
  cost_insurance: {
    label: 'هزینه، تعرفه و بیمه',
    terms: [/هزینه/i, /قیمت/i, /تعرفه/i, /مبلغ/i, /بیمه/i, /تکمیلی/i, /پرداخت/i],
    guidance: 'هزینه و بیمه به نوع خدمت، پزشک، قرارداد بیمه و بررسی‌های لازم بستگی دارد. برای اعلام دقیق‌تر باید با پذیرش کلینیک هماهنگ شود.'
  },
  clinic_info: {
    label: 'آدرس، ساعت کاری و تماس',
    terms: [/ساعت\s*کاری/i, /باز\s*هست/i, /تعطیل/i, /آدرس/i, /لوکیشن/i, /نقشه/i, /تلفن/i, /تماس/i],
    guidance: 'برای اطلاعات تماس، آدرس و ساعت کاری، از اطلاعات ثبت‌شده کلینیک در سایت استفاده کنید یا با پذیرش تماس بگیرید.'
  }
};

const TRUSTED_LOCAL_FAQS = [
  {
    id: 'local_refractive_what_is_glasses_removal',
    question: 'حذف عینک چیست؟',
    keywords: 'حذف عینک اصلاح عیب انکساری نزدیک بینی دوربینی آستیگماتیسم لیزیک فمتولیزیک PRK اسمایل قرنیه',
    answer: 'حذف عینک به روش‌هایی گفته می‌شود که با اصلاح عیب انکساری چشم، دید بدون عینک یا لنز واضح‌تر می‌شود. عیب انکساری یعنی نور دقیقاً روی شبکیه متمرکز نمی‌شود و تصویر تار دیده می‌شود؛ نزدیک‌بینی، دوربینی و آستیگماتیسم شایع‌ترین انواع آن هستند. در بیشتر روش‌های لیزری، شکل قرنیه اصلاح می‌شود تا نور بهتر روی شبکیه متمرکز شود. هدف اصلی، کاهش وابستگی به عینک و بهتر شدن کیفیت دید است. انتخاب روش مناسب فقط بعد از معاینه، بررسی شماره چشم، ضخامت و نقشه قرنیه، خشکی چشم و سلامت شبکیه مشخص می‌شود. برای بررسی شرایط خود می‌توانید از دکمه «رزرو نوبت» سایت استفاده کنید.'
  },
  {
    id: 'local_refractive_methods',
    question: 'انواع روش‌های حذف عینک چیست؟',
    keywords: 'روش حذف عینک لیزیک فمتولیزیک PRK ترنس PRK لازک اسمایل ICL',
    answer: 'برای حذف یا کاهش وابستگی به عینک روش‌های مختلفی وجود دارد. روش‌های رایج شامل لیزیک، فمتولیزیک، PRK، ترنس PRK، لازک و اسمایل هستند و در بعضی افراد با شماره‌های بالاتر یا شرایط خاص قرنیه، کاشت لنز داخل چشمی ICL هم مطرح می‌شود. تفاوت این روش‌ها در نحوه انجام، دوره نقاهت، میزان سوزش بعد عمل و مناسب بودن برای شرایط مختلف چشم است. انتخاب روش به شماره چشم، ضخامت و شکل قرنیه، خشکی چشم، سن و سبک زندگی بستگی دارد و فقط پس از معاینه کامل قابل تعیین است. برای انتخاب روش مناسب، از بخش رزرو نوبت سایت وقت معاینه بگیرید.'
  },
  {
    id: 'local_refractive_method_difference',
    question: 'تفاوت روش‌های لیزری حذف عینک چیست؟',
    keywords: 'تفاوت لیزیک فمتولیزیک PRK ترنس PRK لازک اسمایل فلپ قرنیه دوره نقاهت',
    answer: 'همه روش‌های لیزری حذف عینک برای اصلاح نزدیک‌بینی، دوربینی و آستیگماتیسم انجام می‌شوند، اما تکنیک و دوره بهبودی آن‌ها فرق دارد. در لیزیک و فمتولیزیک معمولاً یک لایه نازک به نام فلپ روی قرنیه ایجاد می‌شود و بهبود دید اغلب سریع‌تر است. در PRK، ترنس PRK و لازک فلپ ایجاد نمی‌شود و اصلاح روی سطح قرنیه انجام می‌گیرد؛ بنابراین چند روز اول ممکن است سوزش و حساسیت به نور بیشتر باشد. در اسمایل، فلپ ایجاد نمی‌شود و یک قطعه بسیار کوچک عدسی‌شکل داخل قرنیه با برش کوچک خارج می‌شود. اینکه کدام روش برای شما بهتر است فقط با معاینه و تصویربرداری قرنیه مشخص می‌شود؛ برای بررسی، نوبت رزرو کنید.'
  },
  {
    id: 'local_refractive_best_method_for_me',
    question: 'کدام روش حذف عینک برای من مناسب است؟',
    keywords: 'بهترین روش حذف عینک مناسب من لیزیک PRK فمتولیزیک اسمایل ضخامت قرنیه خشکی چشم شماره چشم',
    answer: 'بهترین روش حذف عینک برای همه یکسان نیست. انتخاب روش به شماره چشم، ثبات شماره، ضخامت و نقشه قرنیه، خشکی چشم، سن، شغل، ورزش و سبک زندگی بستگی دارد. فمتولیزیک برای بسیاری از افراد با قرنیه مناسب گزینه خوبی است، PRK یا ترنس PRK ممکن است برای قرنیه نازک‌تر یا سبک زندگی پرخطر مناسب‌تر باشد و اسمایل برای برخی موارد نزدیک‌بینی و آستیگماتیسم کاربرد دارد. بدون معاینه نمی‌شود روش قطعی پیشنهاد داد. برای تعیین روش مناسب، از طریق رزرو نوبت سایت وقت معاینه بگیرید.'
  },
  {
    id: 'local_refractive_corrects_what',
    question: 'عمل حذف عینک چه مشکلاتی را اصلاح می‌کند؟',
    keywords: 'حذف عینک نزدیک بینی دوربینی آستیگماتیسم شماره چشم تار دید اصلاح دید',
    answer: 'عمل‌های لیزری حذف عینک معمولاً برای اصلاح نزدیک‌بینی، دوربینی و آستیگماتیسم انجام می‌شوند. در نزدیک‌بینی اجسام دور تار دیده می‌شوند، در دوربینی دید نزدیک مشکل دارد و در آستیگماتیسم تصویر ممکن است کشیده یا تار دیده شود. روش‌هایی مثل فمتولیزیک، اسمایل، PRK و Trans-PRK با تکنیک‌های متفاوت، شکل قرنیه را اصلاح می‌کنند تا نور بهتر روی شبکیه متمرکز شود. مناسب بودن این روش‌ها به نتیجه معاینه و تصویربرداری قرنیه بستگی دارد. برای بررسی شرایط خود، نوبت معاینه رزرو کنید.'
  },
  {
    id: 'local_refractive_lasik_same_as_removal',
    question: 'آیا حذف عینک همان لیزیک است؟',
    keywords: 'حذف عینک همان لیزیک تفاوت لیزیک PRK فمتولیزیک لازک اسمایل',
    answer: 'لیزیک فقط یکی از روش‌های حذف عینک است. خیلی‌ها همه روش‌های حذف عینک را «لیزیک» می‌نامند، اما روش‌های دیگری مثل PRK، Trans-PRK، لازک، فمتولیزیک و اسمایل هم وجود دارد. بعضی روش‌ها فلپ قرنیه دارند و بعضی ندارند؛ دوره بهبودی و میزان سوزش بعد عمل هم متفاوت است. برای انتخاب روش مناسب باید معاینه کامل، شماره چشم و وضعیت قرنیه بررسی شود. برای دریافت خدمت مناسب می‌توانید از بخش رزرو نوبت سایت وقت بگیرید.'
  },
  {
    id: 'local_refractive_lasik_definition',
    question: 'لیزیک چیست؟',
    keywords: 'لیزیک چیست LASIK فلپ قرنیه لیزر اگزایمر شماره چشم',
    answer: 'لیزیک یک روش جراحی لیزری برای اصلاح شماره چشم است. در این روش با قطره بی‌حسی، یک لایه نازک روی قرنیه به نام فلپ ایجاد می‌شود، سپس با لیزر اگزایمر شکل قرنیه اصلاح می‌شود تا نور بهتر روی شبکیه متمرکز شود و در پایان فلپ به محل خود برمی‌گردد. لیزیک برای همه مناسب نیست و قبل از عمل باید ضخامت، شکل و سلامت قرنیه و همچنین خشکی چشم بررسی شود. برای اینکه بدانید لیزیک یا روش دیگری برای شما مناسب است، نوبت معاینه رزرو کنید.'
  },
  {
    id: 'local_refractive_smile_regression',
    question: 'آیا اسمایل برگشت شماره دارد؟',
    keywords: 'اسمایل برگشت شماره برگشت نمره SMILE ماندگاری اصلاح دید بعد عمل',
    answer: 'در روش اسمایل هدف اصلاح پایدار شماره چشم است، اما مثل همه روش‌های حذف عینک احتمال تغییر یا برگشت بخشی از شماره در بعضی افراد وجود دارد. این احتمال می‌تواند به شماره اولیه، ثابت نبودن شماره چشم، وضعیت قرنیه، سن، خشکی چشم و عوامل فردی بستگی داشته باشد. معمولاً قبل از عمل، ثبات شماره چشم، ضخامت و نقشه قرنیه بررسی می‌شود تا احتمال نتیجه نامناسب کمتر شود. اگر بعد از عمل تاری یا تغییر دید دارید، باید معاینه شوید. برای بررسی دقیق‌تر یا انتخاب روش مناسب، از طریق رزرو نوبت سایت وقت بگیرید.'
  },
  {
    id: 'local_refractive_weak_vision',
    question: 'چشمم ضعیف شده چیکار کنم؟',
    keywords: 'چشمم ضعیف شده ضعیفی چشم شماره چشم نمره چشم تار دید عینک لیزیک حذف عینک',
    answer: 'ضعیف شدن یا تار شدن دید می‌تواند به علت تغییر شماره چشم، آستیگماتیسم، خشکی چشم، مشکلات قرنیه، آب مروارید یا علت‌های دیگر باشد. اگر کاهش دید ناگهانی، درد چشم، جرقه نور، سایه در دید یا مگس‌پران جدید دارید، مراجعه فوری لازم است. اگر تغییر دید تدریجی است، باید معاینه شوید تا شماره چشم، قرنیه، فشار چشم و شبکیه بررسی شود. بعد از معاینه مشخص می‌شود عینک، لنز، درمان خشکی چشم یا روش‌هایی مثل PRK، فمتولیزیک، اسمایل یا ICL برای شما مناسب است یا نه. برای بررسی دقیق‌تر از دکمه «رزرو نوبت» سایت استفاده کنید.'
  },
  {
    id: 'local_dark_circle_under_eye',
    question: 'سیاهی یا تیرگی دور چشم چیست؟',
    keywords: 'سیاهی دور چشم تیرگی زیر چشم دور چشم سیاه زیر چشم سیاه گودی زیر چشم کبودی دور چشم هاله تیره پلک پوست اطراف چشم',
    answer: 'تیرگی یا سیاهی دور چشم معمولاً با «دوربینی» یا شماره چشم فرق دارد و می‌تواند به ژنتیک، کم‌خوابی، حساسیت و مالیدن چشم، نازکی پوست، گودی زیر چشم، تغییرات رنگدانه‌ای یا مشکلات پلک و پوست اطراف چشم مربوط باشد. درمان بسته به علت متفاوت است و بدون معاینه نمی‌شود روش قطعی پیشنهاد داد. اگر تیرگی همراه با ورم ناگهانی، درد، قرمزی شدید، ضربه، ترشح یا کاهش دید است، بهتر است سریع‌تر بررسی شوید. برای تشخیص علت و انتخاب درمان مناسب می‌توانید از بخش رزرو نوبت سایت وقت بگیرید.'
  },
  {
    id: 'local_dry_eye_burning',
    question: 'چشمم می‌سوزد چیکار کنم؟',
    keywords: 'چشمم میسوزه سوزش چشم خشکی چشم خارش قرمزی اشک ریزش لنز',
    answer: 'سوزش چشم اغلب می‌تواند به خشکی چشم، حساسیت، استفاده از لنز، کار طولانی با موبایل و کامپیوتر یا التهاب سطح چشم مربوط باشد، اما بدون معاینه علت قطعی مشخص نمی‌شود. چشم را نمالید، اگر لنز دارید آن را خارج کنید و از مصرف خودسرانه قطره آنتی‌بیوتیک یا کورتون خودداری کنید. اگر سوزش همراه با درد شدید، کاهش دید، ترشح زیاد، حساسیت شدید به نور، ضربه یا تماس با مواد شیمیایی است، باید فوری مراجعه کنید. اگر علائم ادامه دارد، برای معاینه از بخش رزرو نوبت سایت وقت بگیرید.'
  }
];

function findTrustedLocalFaq(message) {
  const ranked = TRUSTED_LOCAL_FAQS
    .map((row) => ({ row, score: faqService.scoreFaqMatch(message, row) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best) return null;
  const messageIntents = faqService.detectFaqIntents(message);
  const hasSpecificIntent = faqService.hasSpecificFaqIntent(messageIntents);
  const minimum = hasSpecificIntent ? 0.36 : 0.58;
  const separation = runnerUp ? best.score - runnerUp.score : best.score;
  if (best.score < minimum || (best.score < 0.64 && separation < 0.025)) return null;
  return {
    ...best.row,
    match_score: Number(best.score.toFixed(4)),
    is_local_trusted: true
  };
}

function detectPatientIntents(message) {
  const text = String(message || '');
  return Object.entries(INTENT_PROFILES)
    .filter(([, profile]) => profile.terms.some((pattern) => pattern.test(text)))
    .map(([key, profile]) => ({ key, label: profile.label, guidance: profile.guidance }));
}

function primaryIntent(message) {
  return detectPatientIntents(message)[0] || null;
}

function isBookingUseful(message, risk = null) {
  if (risk === 'emergency') return false;
  const intents = detectPatientIntents(message).map((item) => item.key);
  if (intents.some((key) => ['vision_correction', 'cataract', 'dry_eye', 'dark_circle', 'appointment', 'cost_insurance'].includes(key))) return true;
  return /(معاینه|ویزیت|پزشک|کلینیک|چشم|دید|بینایی|عمل|جراحی|لیزر|لیزیک|ضعیف)/i.test(String(message || ''));
}

function buildSuggestedActions(message, risk = null) {
  const actions = [];
  if (isBookingUseful(message, risk)) {
    actions.push({ type: 'booking', label: 'رزرو نوبت', description: 'برای بررسی دقیق‌تر، زمان مراجعه را انتخاب کنید.' });
  }
  return actions;
}

const emergencyPatterns = [
  /کاهش\s*(ناگهانی|یکدفعه).*دید/i, /از\s*دست\s*دادن.*دید/i, /درد\s*شدید.*چشم/i,
  /(ضربه|آسیب).*چشم/i, /(اسید|مواد\s*شیمیایی|وایتکس).*چشم/i,
  /(جرقه|فلاش).*نور/i, /(مگس\s*پران|فلوتر).*جدید/i, /(پرده|سایه).*دید/i,
  /قرمزی\s*شدید.*(تهوع|سردرد)/i, /(بعد|پس).*عمل.*(درد|کاهش.*دید|ترشح)/i
];
const medicationPatterns = [/(دوز|مقدار).*دارو/i, /(شروع|قطع|عوض|تغییر).*دارو/i, /(چه|کدام).*قطره/i, /تجویز/i];
const diagnosisPatterns = [/(تشخیص|بیماری).*من/i, /آیا.*دارم/i, /ایا.*دارم/i, /نتیجه.*آزمایش/i, /عکس.*چشم/i, /جواب.*آزمایش/i];
const unsafeOutputPatterns = [
  /(حتماً|قطعا|قطعاً)\s+(دارید|ندارید|بیماری|آب\s*مروارید|آب\s*سیاه|گلوکوم)/i,
  /(مصرف|استفاده)\s+کنید.*(هر\s*\d+\s*ساعت|روزی\s*\d+)/i,
  /(دوز|مقدار)\s+.*(قطره|دارو)/i
];

function getFallbackAIReply() {
  return `${FALLBACK_REPLY} ${DISCLAIMER}`;
}

function compactLines(lines) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean).join('\n');
}

function buildClinicContext(settings = {}, faqCandidates = [], patientIntents = []) {
  const phones = [settings.clinic_phone, settings.clinic_secondary_phone].map((item) => String(item || '').trim()).filter(Boolean).join('، ');
  const clinicLines = [
    `نام کلینیک: ${settings.clinic_name || settings.clinic_short_name || 'نورویستا'}`,
    phones ? `تلفن تماس: ${phones}` : '',
    settings.working_hours ? `ساعت کاری: ${settings.working_hours}` : '',
    settings.clinic_opening_note ? `توضیح مراجعه: ${settings.clinic_opening_note}` : '',
    settings.clinic_address ? `آدرس: ${settings.clinic_address}` : ''
  ];

  const hasClinicalIntent = (patientIntents || []).some((intent) => !['appointment', 'cost_insurance', 'clinic_info'].includes(intent.key));
  const usableFaqs = (faqCandidates || []).filter((faq) => !(hasClinicalIntent && faqService.isGenericFaq(faq)));
  const faqLines = usableFaqs.slice(0, 5).map((faq, index) => {
    const score = faq.match_score ? ` | امتیاز شباهت: ${faq.match_score}` : '';
    const question = String(faq.question || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    const answer = String(faq.answer || '').replace(/\s+/g, ' ').trim().slice(0, 900);
    return question && answer ? `FAQ ${index + 1}${score}: پرسش: ${question}\nپاسخ: ${answer}` : '';
  }).filter(Boolean);

  const intentLines = (patientIntents || []).slice(0, 2).map((intent) => `موضوع تشخیص‌داده‌شده: ${intent.label}\nراهنمای عمومی قابل استفاده: ${intent.guidance}`);

  return compactLines([
    'زمینه مجاز برای پاسخ:',
    compactLines(clinicLines),
    intentLines.length ? intentLines.join('\n') : '',
    faqLines.length ? `پرسش‌های پرتکرار نزدیک به سؤال کاربر؛ فقط اگر واقعاً مرتبط هستند از آن‌ها کمک بگیر و اگر فقط کلی/نامرتبط هستند پاسخ اصلی را روی آن‌ها نساز:\n${faqLines.join('\n')}` : ''
  ]);
}

function buildAISystemPrompt(settings = {}, faqCandidates = [], patientIntents = []) {
  const configured = String(settings.ai_system_prompt || '').trim();
  const context = buildClinicContext(settings, faqCandidates, patientIntents);
  const safety = `
قواعد پاسخ‌گویی و ایمنی غیرقابل‌چشم‌پوشی:
- اول سؤال واقعی بیمار را جواب بده؛ از پاسخ‌های کلی مثل «چه سوالی دارید؟» یا فهرست‌کردن همه خدمات خودداری کن.
- عبارت «دور چشم» یا «زیر چشم» را با «دوربینی» اشتباه نگیر؛ سیاهی دور چشم به حوزه پلک/پوست اطراف چشم مربوط است نه حذف عینک.
- اگر FAQ نزدیک و مرتبط وجود دارد، پاسخ همان FAQ را با زبان طبیعی و دقیق به سؤال بیمار تطبیق بده؛ اگر FAQ فقط کلی یا نامرتبط است، آن را به‌عنوان پاسخ اصلی استفاده نکن.
- اگر FAQ کافی نیست، پاسخ عمومی و محتاطانه چشم‌پزشکی بده و مشخص کن چه مواردی در معاینه بررسی می‌شود.
- در پایان هر پاسخ مرتبط با علائم چشم، عمل، خدمت، هزینه، آمادگی مراجعه یا انتخاب روش درمان، خیلی کوتاه و طبیعی بگو کاربر می‌تواند از دکمه «رزرو نوبت» سایت وقت بگیرد.
- تشخیص قطعی، تجویز، تعیین دوز یا توصیه به قطع/تغییر دارو ممنوع است.
- پاسخ فارسی، کوتاه، کاربردی، مستقیم و مناسب بیمار باشد؛ معمولاً ۳ تا ۶ جمله کافی است.
- اگر سؤال برای تشخیص، درمان اختصاصی، درد شدید، کاهش دید، ترشح، آسیب یا بدترشدن سریع است، کاربر را به مراجعه به کلینیک یا ارزیابی فوری هدایت کن.
- توضیح بده پاسخ قطعی پزشکی نیست، اما این جمله را کوتاه نگه دار و پاسخ اصلی را فدای هشدار نکن.
- فقط در محدوده چشم‌پزشکی، خدمات کلینیک، آمادگی مراجعه، نوبت‌دهی، بیمه و اطلاعات عمومی کلینیک پاسخ بده.`;
  return compactLines([
    configured || 'شما دستیار هوشمند کلینیک چشم\u200cپزشکی دکتر محمدصادق حق\u200cپرست هستید. فقط درباره چشم\u200cپزشکی، خدمات کلینیک، آمادگی مراجعه، هزینه، بیمه، ساعت کاری و نوبت\u200cدهی پاسخ دهید. پاسخ باید فارسی، محترمانه، کوتاه، کاربردی و مستقیم باشد. ابتدا سؤال واقعی بیمار را تشخیص بده و با بهترین پاسخ مرتبط از پرسش\u200cهای پرتکرار و دانش تأییدشده کلینیک جواب بده؛ اگر FAQ دقیق پیدا نشد، راهنمایی عمومی و ایمن بده. کلمات را با دقت معنا کن؛ «دور چشم» یا «زیر چشم» با «دوربینی» فرق دارد و نباید با حذف عینک اشتباه شود. از پاسخ\u200cهای کلی مثل «چه سوالی دارید؟» یا فهرست همه خدمات استفاده نکن، مگر اینکه خود کاربر درباره خدمات کلی پرسیده باشد. تشخیص قطعی، تجویز دارو، تعیین دوز یا تغییر دارو ممنوع است. در علائم هشدار مثل درد شدید، کاهش ناگهانی دید، ضربه، ترشح شدید، تماس مواد شیمیایی، جرقه نور یا سایه در دید، بیمار را به مراجعه فوری به پزشک یا اورژانس راهنمایی کن. در پایان پاسخ\u200cهای مرتبط با علائم، عمل، انتخاب خدمت یا معاینه، خیلی کوتاه بگو برای بررسی دقیق\u200cتر می\u200cتواند از دکمه «رزرو نوبت» سایت وقت بگیرد.',
    context,
    safety
  ]);
}

function redactSensitiveData(value) {
  let redacted = String(value || '');
  const before = redacted;
  redacted = redacted
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+98|0098|0)?9\d{9}/g, '[PHONE]')
    .replace(/\b\d{10}\b/g, '[NATIONAL_ID]')
    .replace(/\b(?:\d[ -]*?){16}\b/g, '[CARD]')
    .replace(/\b\d{6,}\b/g, '[IDENTIFIER]');
  return { text: redacted, changed: redacted !== before };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-6).map((item) => {
    const redacted = redactSensitiveData(item.content);
    return { role: item.role === 'assistant' ? 'assistant' : 'user', content: redacted.text.slice(0, 2000) };
  }).filter((item) => item.content);
}

function classifyRisk(message) {
  const text = String(message || '');
  if (emergencyPatterns.some((pattern) => pattern.test(text))) return 'emergency';
  if (medicationPatterns.some((pattern) => pattern.test(text))) return 'medication';
  if (diagnosisPatterns.some((pattern) => pattern.test(text))) return 'diagnosis_request';
  return null;
}

async function logSafetyEvent(pool, type, originalMessage, metadata = {}, userId = null) {
  try {
    await pool.query(
      `INSERT INTO ai_safety_events (user_id, event_type, message_hash, metadata_json)
       VALUES (?, ?, ?, ?)`,
      [userId, type, crypto.createHash('sha256').update(String(originalMessage || '')).digest('hex'), JSON.stringify(metadata)]
    );
  } catch (error) {
    console.warn('AI safety event could not be stored:', error.message);
  }
}

function safeReply(reply) {
  const text = String(reply || '').trim();
  if (!text) return getFallbackAIReply();
  const withoutDuplicateDisclaimer = text.replace(DISCLAIMER, '').trim();
  return `${withoutDuplicateDisclaimer}\n\n${DISCLAIMER}`;
}

function looksUnsafeReply(reply) {
  const text = String(reply || '');
  return unsafeOutputPatterns.some((pattern) => pattern.test(text));
}

function normalizeProviderBaseUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(raw)) raw = `https://${raw}`;
  return raw.replace(/\s+/g, '').replace(/\/+$/, '');
}

function isLocalProviderHost(hostname) {
  return /^(localhost|127\.0\.0\.1|::1)$/i.test(String(hostname || ''));
}

function resolveProviderConfig(settings = {}) {
  const apiKey = String(settings.ai_api_key || process.env.AI_API_KEY || '').trim();
  const baseUrl = normalizeProviderBaseUrl(settings.ai_base_url || process.env.AI_BASE_URL || '');
  const model = String(settings.ai_model || process.env.AI_MODEL || '').trim();
  const missing = [];
  if (!settingsService.normalizeBoolean(settings.ai_enabled, false)) missing.push('ai_disabled');
  if (!apiKey) missing.push('missing_api_key');
  if (!baseUrl) missing.push('missing_base_url');
  if (!model) missing.push('missing_model');

  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const isAllowedLocalHttp = url.protocol === 'http:' && isLocalProviderHost(url.hostname);
      if (url.protocol !== 'https:' && !isAllowedLocalHttp) missing.push('invalid_base_url');
    } catch (_) {
      missing.push('invalid_base_url');
    }
  }

  return { apiKey, baseUrl, model, missing };
}

function chatCompletionsUrl(baseUrl) {
  const clean = normalizeProviderBaseUrl(baseUrl);
  if (!clean) return '';
  const url = new URL(clean);
  const pathname = url.pathname.replace(/\/+$/, '');

  if (/\/chat\/completions$/i.test(pathname)) return url.toString();
  if (/\/(?:api\/)?v\d+$/i.test(pathname)) {
    url.pathname = `${pathname}/chat/completions`;
    return url.toString();
  }
  if (!pathname || pathname === '/') {
    url.pathname = isLocalProviderHost(url.hostname) ? '/chat/completions' : '/v1/chat/completions';
    return url.toString();
  }

  url.pathname = `${pathname}/chat/completions`;
  return url.toString();
}

function makeProviderError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.diagnostics = { code, message, ...extra };
  if (extra.status) error.status = extra.status;
  return error;
}

function sanitizeProviderDetail(detail) {
  return String(detail || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [API_KEY]')
    .replace(/api[_-]?key["'\s:=]+[A-Za-z0-9._-]+/gi, 'api_key=[API_KEY]')
    .slice(0, 300);
}

function explainFetchFailure(error, endpoint = '') {
  const cause = error?.cause || {};
  const code = String(cause.code || error?.code || '').trim();
  const causeMessage = String(cause.message || error?.message || '').trim();
  const lower = `${code} ${causeMessage}`.toLowerCase();

  if (error?.name === 'TimeoutError' || /timeout|timedout|und_err_connect_timeout/.test(lower)) {
    return {
      code: 'provider_timeout',
      message: 'اتصال به سرویس هوش مصنوعی در زمان مجاز پاسخ نداد.',
      hint: 'Base URL را بررسی کنید و مطمئن شوید سرور پروژه به اینترنت و دامنه سرویس AI دسترسی دارد.',
      endpoint,
      technical: compactLines([code, causeMessage])
    };
  }

  if (/enotfound|eai_again|getaddrinfo/.test(lower)) {
    return {
      code: 'provider_dns_error',
      message: 'دامنه سرویس هوش مصنوعی از روی سرور پروژه resolve نشد.',
      hint: 'DNS، اینترنت سرور، فیلتر/فایروال و درست بودن دامنه Base URL را بررسی کنید.',
      endpoint,
      technical: compactLines([code, causeMessage])
    };
  }

  if (/econnrefused/.test(lower)) {
    return {
      code: 'provider_connection_refused',
      message: 'سرور مقصد اتصال را نپذیرفت.',
      hint: 'آدرس، پورت، مسیر v1/chat/completions و فعال بودن سرویس مقصد را بررسی کنید.',
      endpoint,
      technical: compactLines([code, causeMessage])
    };
  }

  if (/econnreset|socket|network|fetch failed/.test(lower)) {
    return {
      code: 'provider_network_error',
      message: 'ارتباط شبکه با سرویس هوش مصنوعی برقرار نشد.',
      hint: 'این خطا معمولاً از اینترنت سرور، فایروال، پروکسی، TLS/SSL یا اشتباه بودن Base URL است؛ از روی همان سرور با curl endpoint را تست کنید.',
      endpoint,
      technical: compactLines([code, causeMessage])
    };
  }

  if (/certificate|tls|ssl|unable_to_verify|self.?signed|cert/.test(lower)) {
    return {
      code: 'provider_tls_error',
      message: 'اتصال امن TLS/SSL با سرویس هوش مصنوعی تأیید نشد.',
      hint: 'گواهی SSL مقصد، تاریخ سرور و تنظیمات فایروال/پروکسی را بررسی کنید.',
      endpoint,
      technical: compactLines([code, causeMessage])
    };
  }

  return {
    code: 'provider_error',
    message: causeMessage || 'خطای ناشناخته هنگام اتصال به سرویس هوش مصنوعی رخ داد.',
    hint: 'تنظیمات سرویس، دسترسی شبکه سرور و لاگ کامل Node.js را بررسی کنید.',
    endpoint,
    technical: compactLines([code, causeMessage])
  };
}

function explainHttpProviderError(status, detail, endpoint = '') {
  const cleanDetail = sanitizeProviderDetail(detail);
  if (status === 401 || status === 403) {
    return {
      code: 'provider_auth_error',
      message: 'سرویس هوش مصنوعی کلید دسترسی یا مجوز را قبول نکرد.',
      hint: 'API Key، فعال بودن اعتبار حساب و دسترسی مدل را بررسی کنید.',
      endpoint,
      status,
      technical: cleanDetail
    };
  }
  if (status === 404) {
    return {
      code: 'provider_endpoint_not_found',
      message: 'مسیر API سرویس هوش مصنوعی پیدا نشد.',
      hint: 'Base URL باید معمولاً شبیه https://.../v1 باشد؛ سیستم خودش /chat/completions را اضافه می‌کند.',
      endpoint,
      status,
      technical: cleanDetail
    };
  }
  if (status === 429) {
    return {
      code: 'provider_rate_limited',
      message: 'سرویس هوش مصنوعی محدودیت تعداد درخواست یا اعتبار مصرفی را اعلام کرد.',
      hint: 'اعتبار حساب، سقف درخواست‌ها و محدودیت‌های پنل ارائه‌دهنده را بررسی کنید.',
      endpoint,
      status,
      technical: cleanDetail
    };
  }
  if (status >= 500) {
    return {
      code: 'provider_server_error',
      message: 'خود سرویس هوش مصنوعی خطای داخلی برگرداند.',
      hint: 'چند دقیقه بعد دوباره تست کنید یا وضعیت سرویس ارائه‌دهنده را بررسی کنید.',
      endpoint,
      status,
      technical: cleanDetail
    };
  }
  return {
    code: `provider_http_${status}`,
    message: `سرویس هوش مصنوعی پاسخ ناموفق ${status} برگرداند.`,
    hint: 'Base URL، مدل، API Key و محدودیت حساب را بررسی کنید.',
    endpoint,
    status,
    technical: cleanDetail
  };
}

function clinicContactLine(settings = {}) {
  const phones = [settings.clinic_phone, settings.clinic_secondary_phone].map((item) => String(item || '').trim()).filter(Boolean).join(' یا ');
  const parts = [];
  if (phones) parts.push(`تماس با کلینیک: ${phones}`);
  if (settings.working_hours) parts.push(`ساعت کاری: ${settings.working_hours}`);
  return parts.join(' | ');
}

function buildOfflineGuidedReply(message, settings = {}, faqCandidates = [], diagnostics = {}) {
  const text = String(message || '');
  const contact = clinicContactLine(settings);
  const localFaq = findTrustedLocalFaq(text);
  if (localFaq) {
    return compactLines([
      localFaq.answer,
      contact ? contact : ''
    ]);
  }
  const intent = primaryIntent(text);
  // جزئیات خطای ارائه‌دهنده در فیلدهای diagnostics به پنل ادمین برگردانده می‌شود؛ متن پاسخ بیمار نباید فنی یا نگران‌کننده باشد.
  const intro = '';

  const specificFaqIntent = typeof faqService.hasSpecificFaqIntent === 'function'
    ? faqService.hasSpecificFaqIntent(faqService.detectFaqIntents(text))
    : Boolean(intent && !['appointment', 'cost_insurance', 'clinic_info'].includes(intent.key));
  const strongFaq = (faqCandidates || []).find((faq) => Number(faq.match_score || 0) >= 0.34 && faq.answer && !(specificFaqIntent && faqService.isGenericFaq(faq)));
  let guidance = intent?.guidance || 'برای سؤال شما می‌توانم راهنمایی عمومی بدهم، اما پاسخ قطعی به علائم یا انتخاب درمان بدون بررسی پرونده و معاینه ممکن نیست. اگر علامت جدید، مداوم یا نگران‌کننده است، بهتر است برای ارزیابی با کلینیک هماهنگ کنید.';

  if (strongFaq && Number(strongFaq.match_score || 0) >= 0.5) {
    guidance = String(strongFaq.answer || '').trim();
  } else if (strongFaq && intent) {
    guidance = `${intent.guidance} همچنین بر اساس پرسش پرتکرار نزدیک، این موضوع به شرایط فردی و نتیجه معاینه بستگی دارد.`;
  }

  if (/(تاری|تار|دید|بینایی|نمی\s*بینم|دوبینی)/i.test(text) && !intent) {
    guidance = 'تاری دید یا تغییر بینایی اگر ناگهانی، یک‌طرفه، همراه درد، جرقه نور، سایه در میدان دید یا مگس‌پران جدید باشد نیاز به بررسی فوری دارد. اگر تدریجی است هم برای تعیین علت، شماره عینک، آب مروارید، فشار چشم یا مشکلات شبکیه باید معاینه انجام شود.';
  } else if (/(کودک|بچه|تنبلی|انحراف|لوچی)/i.test(text)) {
    guidance = 'در مشکلات چشمی کودکان، مخصوصاً تنبلی چشم، انحراف چشم یا افت دید، زمان مراجعه مهم است. بهتر است معاینه کودک به تعویق نیفتد تا در صورت نیاز درمان زودتر شروع شود.';
  }

  const booking = isBookingUseful(text) ? 'برای بررسی دقیق‌تر می‌توانید از دکمه «رزرو نوبت» در سایت استفاده کنید.' : '';
  return compactLines([
    intro,
    guidance,
    booking,
    contact ? contact : ''
  ]);
}

async function callAIProvider(settings, messages) {
  const { apiKey, baseUrl, model, missing } = resolveProviderConfig(settings);
  if (missing.length) {
    throw makeProviderError('AI_PROVIDER_NOT_READY', `AI provider is not ready: ${missing.join(', ')}`, { missing });
  }

  const endpoint = chatCompletionsUrl(baseUrl);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(settingsService.normalizeNumber(settings.ai_temperature, 0.2, 0, 1), 0.4),
        max_tokens: settingsService.normalizeNumber(settings.ai_max_tokens, 400, 50, 1200),
        stream: false
      }),
      signal: AbortSignal.timeout(18000)
    });
  } catch (error) {
    const diagnostics = explainFetchFailure(error, endpoint);
    throw makeProviderError(diagnostics.code, diagnostics.message, diagnostics);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const diagnostics = explainHttpProviderError(response.status, detail, endpoint);
    throw makeProviderError(diagnostics.code, diagnostics.message, diagnostics);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw makeProviderError('provider_invalid_json', 'پاسخ سرویس هوش مصنوعی JSON معتبر نبود.', { endpoint, technical: error.message });
  }

  const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  if (!String(content || '').trim()) {
    throw makeProviderError('provider_empty_response', 'سرویس هوش مصنوعی پاسخ متنی قابل استفاده برنگرداند.', { endpoint });
  }
  return content;
}

async function chat(pool, { message, history = [], consent_to_external_ai = false, user_id = null } = {}) {
  const cleanMessage = String(message || '').trim().slice(0, 2000);
  if (!cleanMessage) {
    const error = new Error('پیام خود را وارد کنید');
    error.statusCode = 400;
    throw error;
  }

  const risk = classifyRisk(cleanMessage);
  const patientIntents = detectPatientIntents(cleanMessage);
  if (risk === 'emergency') {
    await logSafetyEvent(pool, risk, cleanMessage, {}, user_id);
    return { source: 'safety', risk, handoff: 'emergency', suggested_actions: buildSuggestedActions(cleanMessage, risk), reply: safeReply(EMERGENCY_REPLY) };
  }
  if (risk === 'medication') {
    await logSafetyEvent(pool, risk, cleanMessage, {}, user_id);
    return { source: 'safety', risk, handoff: 'clinic', suggested_actions: buildSuggestedActions(cleanMessage, risk), reply: safeReply(MEDICATION_REPLY) };
  }
  if (risk === 'diagnosis_request') {
    await logSafetyEvent(pool, risk, cleanMessage, {}, user_id);
    return { source: 'safety', risk, handoff: 'clinic', suggested_actions: buildSuggestedActions(cleanMessage, risk), reply: safeReply(DIAGNOSIS_REPLY) };
  }

  await faqService.ensureFaqTable(pool);
  await settingsService.ensureDefaultSettings(pool);
  const settings = await settingsService.getSettingsMap(pool);

  let faqCandidates = [];
  if (settingsService.normalizeBoolean(settings.ai_use_faq_first, true)) {
    const faq = await faqService.findFaqAnswer(pool, cleanMessage);
    if (faq) {
      return { source: 'faq', faq_id: faq.id, matched_question: faq.question, confidence: faq.match_score || null, source_version: faq.updated_at || null, detected_intents: patientIntents.map((item) => item.key), suggested_actions: buildSuggestedActions(cleanMessage), reply: safeReply(faq.answer) };
    }
    const trustedLocalFaq = findTrustedLocalFaq(cleanMessage);
    if (trustedLocalFaq) {
      return { source: 'trusted_local_faq', faq_id: trustedLocalFaq.id, matched_question: trustedLocalFaq.question, confidence: trustedLocalFaq.match_score || null, detected_intents: patientIntents.map((item) => item.key), suggested_actions: buildSuggestedActions(cleanMessage), reply: safeReply(trustedLocalFaq.answer) };
    }
    if (typeof faqService.findFaqCandidates === 'function') {
      faqCandidates = await faqService.findFaqCandidates(pool, cleanMessage, { limit: 5, minimumScore: patientIntents.length ? 0.08 : 0.16 });
    }
  }

  const provider = resolveProviderConfig(settings);
  if (provider.missing.length) {
    const diagnostics = { code: provider.missing.join(','), message: 'هوش مصنوعی فعال نیست یا Base URL، مدل یا API Key کامل نشده است.' };
    return {
      source: 'guided_fallback',
      external_ai_used: false,
      consent_required: false,
      faq_context_used: faqCandidates.length > 0,
      detected_intents: patientIntents.map((item) => item.key),
      fallback_reason: diagnostics.code,
      provider_hint: diagnostics.message,
      suggested_actions: buildSuggestedActions(cleanMessage),
      reply: safeReply(buildOfflineGuidedReply(cleanMessage, settings, faqCandidates, diagnostics))
    };
  }

  const redacted = redactSensitiveData(cleanMessage);
  if (redacted.changed) await logSafetyEvent(pool, 'pii_redacted', cleanMessage, {}, user_id);

  const messages = [
    { role: 'system', content: buildAISystemPrompt(settings, faqCandidates, patientIntents) },
    ...normalizeHistory(history),
    { role: 'user', content: redacted.text }
  ];

  try {
    const reply = await callAIProvider(settings, messages);
    if (looksUnsafeReply(reply)) {
      await logSafetyEvent(pool, 'unsafe_output', cleanMessage, { source: 'provider_guard' }, user_id);
      return { source: 'safety', external_ai_used: true, risk: 'unsafe_output', handoff: 'clinic', suggested_actions: buildSuggestedActions(cleanMessage), reply: safeReply(DIAGNOSIS_REPLY) };
    }
    return {
      source: 'ai',
      external_ai_used: true,
      pii_redacted: redacted.changed,
      consent_to_external_ai: consent_to_external_ai === true,
      faq_context_used: faqCandidates.length > 0,
      provider_endpoint: chatCompletionsUrl(provider.baseUrl),
      detected_intents: patientIntents.map((item) => item.key),
      suggested_actions: buildSuggestedActions(cleanMessage),
      reply: safeReply(reply)
    };
  } catch (error) {
    const diagnostics = error.diagnostics || { code: error.code || 'provider_error', message: error.message };
    await logSafetyEvent(pool, diagnostics.code || 'provider_error', cleanMessage, { diagnostics, missing: error.missing }, user_id);
    return {
      source: 'offline_guidance',
      external_ai_used: false,
      faq_context_used: faqCandidates.length > 0,
      fallback_reason: diagnostics.code || 'provider_error',
      provider_error: diagnostics.message || error.message,
      provider_hint: diagnostics.hint,
      provider_endpoint: diagnostics.endpoint || chatCompletionsUrl(provider.baseUrl),
      provider_technical: process.env.NODE_ENV === 'production' ? undefined : diagnostics.technical,
      detected_intents: patientIntents.map((item) => item.key),
      suggested_actions: buildSuggestedActions(cleanMessage),
      reply: safeReply(buildOfflineGuidedReply(cleanMessage, settings, faqCandidates, diagnostics))
    };
  }
}

module.exports = {
  DISCLAIMER,
  getFallbackAIReply,
  buildAISystemPrompt,
  buildClinicContext,
  redactSensitiveData,
  normalizeHistory,
  classifyRisk,
  detectPatientIntents,
  buildSuggestedActions,
  normalizeProviderBaseUrl,
  resolveProviderConfig,
  chatCompletionsUrl,
  explainFetchFailure,
  buildOfflineGuidedReply,
  findTrustedLocalFaq,
  chat
};
