const axios = require('axios');

exports.chatWithAI = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, message: 'پیام خود را وارد کنید' });
    }
    
    // System prompt for medical clinic
    const systemPrompt = `شما یک دستیار هوشمند برای کلینیک تخصصی چشم پزشکی NoorVista هستید.
شما باید به سوالات کاربران درباره خدمات کلینیک، بیماری‌های چشمی، جراحی‌های لیزری، 
نوبت‌دهی، هزینه‌ها و اطلاعات تماس پاسخ دهید.

اطلاعات کلینیک:
- نام: NoorVista - کلینیک تخصصی چشم پزشکی
- آدرس: تهران، خیابان ولیعصر، خیابان فاطمی، پلاک ۱۲۴
- تلفن: ۰۲۱-۲۲۳۳۴۴۵۵
- ساعات کاری: شنبه تا چهارشنبه ۸-۲۰، پنجشنبه ۹-۱۷
- خدمات: لیزیک، فمتولازیک، جراحی آب مروارید، درمان بیماری‌های شبکیه، اپتومتری

به زبان فارسی و مؤدبانه پاسخ دهید. اگر سوال خارج از این موارد بود، بگویید با پشتیبانی تماس بگیرند.`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];
    
    const response = await axios.post(
      `${process.env.GAPGPT_API_URL}/chat/completions`,
      {
        model: process.env.GAPGPT_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GAPGPT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const reply = response.data.choices[0].message.content;
    
    res.json({
      success: true,
      reply: reply
    });
  } catch (error) {
    console.error('AI Chat error:', error);
    
    // Fallback responses
    const fallbackResponses = [
      'متأسفم، در حال حاضر قادر به پاسخگویی نیستم. لطفاً با شماره ۰۲۱-۲۲۳۳۴۴۵۵ تماس بگیرید.',
      'در حال حاضر سرویس پاسخگویی با مشکل مواجه شده است. لطفاً بعداً تلاش کنید.',
      'برای دریافت پاسخ سوال خود، لطفاً با پشتیبانی کلینیک تماس بگیرید.'
    ];
    
    res.json({
      success: true,
      reply: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]
    });
  }
};