(function(){'use strict';
const root=document.querySelector('[data-payment-status]');if(!root)return;
const status=root.dataset.paymentStatus;
const params=new URLSearchParams(location.search);
const definitions={
 success:['','پرداخت با موفقیت تأیید شد','پرداخت تأیید شد و نوبت شما به‌صورت قطعی ثبت گردید.'],
 fail:['×','پرداخت ناموفق بود','پرداخت تأیید نشد. اگر وجهی کسر شده است، با شماره پیگیری بانک با کلینیک تماس بگیرید.'],
 cancel:['↩','پرداخت انجام نشد','فرایند پرداخت تکمیل نشد و ظرفیت موقت نوبت آزاد شد.'],
 pending:['…','پرداخت در انتظار بررسی است','تا زمان تأیید سمت سرور، نوبت قطعی محسوب نمی‌شود.'],
 expired:['','مهلت پرداخت پایان یافت','ظرفیت موقت آزاد شده است؛ لطفاً زمان دیگری انتخاب کنید.']};
const [icon,title,defaultMessage]=definitions[status]||definitions.fail;
document.getElementById('statusIcon').textContent=icon;
document.getElementById('statusTitle').textContent=title;
const queryMessage=String(params.get('message')||'').slice(0,500);
document.getElementById('statusMessage').textContent=queryMessage||defaultMessage;
const reference=String(params.get('reference')||'');
const tracking=String(params.get('tracking')||'');
const values=[];
if(/^[A-Za-z0-9_-]{4,100}$/.test(reference))values.push(`شماره پیگیری پرداخت: ${reference}`);
if(/^[A-Za-z0-9_-]{4,100}$/.test(tracking))values.push(`کد رهگیری نوبت: ${tracking}`);
if(values.length){const box=document.getElementById('statusReference');box.hidden=false;box.textContent=values.join(' | ');}
const link=root.querySelector('a');
const context=String(params.get('context')||'patient');
const returns={public:['/','بازگشت به صفحه اصلی'],patient:['/dashboard/panel/patient/payments.html','بازگشت به پرداخت‌های من'],admin:['/dashboard/panel/admin/payments.html','بازگشت به امور مالی'],
  'clinic-manager':['/dashboard/panel/clinic-admin/payments.html','بازگشت به امور مالی کلینیک'],secretary:['/dashboard/panel/reception/payments.html','بازگشت به پرداخت‌ها']};
if(link){const target=returns[context]||returns.public;link.href=target[0];link.textContent=status==='success'?target[1]:(context==='public'?'بازگشت و دریافت دوباره':target[1]);}
})();
