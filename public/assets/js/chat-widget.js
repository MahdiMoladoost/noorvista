// chat-widget.js
// ویجت چت بات حرفه ای هوش مصنوعی برای کلینیک چشم - بدون شکلک، طراحی به سبک انگلیسی

(function() {
    // ==================== تنظیمات ====================
    const CONFIG = {
        // چت بات فقط به بک‌اند همین سایت درخواست می‌زند.
        // هیچ آدرس یا API Key سرویس هوش مصنوعی نباید در فرانت قرار بگیرد.
        CHAT_API_URL: "/api/ai/chat",
        
        // اطلاعات کلینیک
        clinicName: "Sadra",
        clinicPhone: "",
        clinicEmail: "info@noorvista.ir",
        clinicHours: "شنبه تا پنجشنبه: ۹ تا ۲۳",
        clinicAddress: "",
        
        // تنظیمات رابط کاربری
        primaryColor: "#0284c7",
        secondaryColor: "#eef8ff",
        botAvatarIcon: "",
        widgetPosition: "right",
        language: "en"
    };

    // ==================== ساختار ویجت ====================
    function createWidgetHTML() {
        const positionStyle = CONFIG.widgetPosition === "right" 
            ? "bottom: 24px; right: 24px;" 
            : "bottom: 24px; left: 24px;";
        
        return `
            <div id="ai-chat-widget" style="position: fixed; ${positionStyle} z-index: 10000; font-family: Vazir, Shabnam, Tahoma, Arial, sans-serif; direction: rtl;">
                <button id="chat-toggle-btn" style="background: ${CONFIG.primaryColor}; width: 56px; height: 56px; border-radius: 28px; border: none; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; transition: all 0.25s ease; outline: none;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
                    </svg>
                </button>

                <div id="chat-window" style="display: none; position: absolute; bottom: 80px; ${CONFIG.widgetPosition === "right" ? "right: 0;" : "left: 0;"} width: min(380px, calc(100vw - 32px)); height: min(600px, calc(100vh - 120px)); background: white; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.05); flex-direction: column; overflow: hidden; font-size: 14px;">
                    
                    <div style="background: ${CONFIG.primaryColor}; padding: 20px 20px 16px 20px; color: white; text-align: center;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; font-size: 18px; letter-spacing: -0.2px; flex: 1; text-align: center;">${CONFIG.clinicName}</span>
                            <button id="close-chat" style="background: none; border: none; color: white; cursor: pointer; font-size: 24px; line-height: 1; opacity: 0.8; margin-left: auto;">&times;</button>
                        </div>
                        <p style="font-size: 13px; opacity: 0.85; margin-top: 6px; margin-bottom: 0; text-align: center;">اول FAQ، سپس پاسخ عمومی هوش مصنوعی</p>
                    </div>
                    
                    <div id="chat-messages" style="flex: 1; padding: 20px; overflow-y: auto; background: ${CONFIG.secondaryColor}; display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; gap: 10px; align-items: flex-start; justify-content: flex-start;">
                            <div style="background: ${CONFIG.primaryColor}; width: 32px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <span style="color: white; font-size: 14px; font-weight: 500;">AI</span>
                            </div>
                            <div style="background: white; padding: 10px 14px; border-radius: 18px; border-top-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); max-width: 80%; text-align: right;">
                                سلام! من دستیار آنلاین کلینیک هستم. اول پرسش‌های پرتکرار تأییدشده را بررسی می‌کنم و اگر پاسخ مناسبی نبود، راهنمایی عمومی هوش مصنوعی ارائه می‌شود. برای تشخیص یا درمان قطعی باید معاینه انجام شود.
                            </div>
                        </div>
                    </div>
                    
                    <div style="border-top: 1px solid #E2E8F0; background: white; padding: 16px 20px; display: flex; gap: 12px;">
                        <input type="text" id="chat-input" placeholder="پیام خود را تایپ کنید..." style="flex: 1; border: 1px solid #CBD5E1; border-radius: 40px; padding: 10px 16px; font-size: 14px; outline: none; transition: 0.2s; font-family: inherit; text-align: right;">
                        <button id="send-btn" style="background: ${CONFIG.primaryColor}; border: none; border-radius: 40px; padding: 0 20px; color: white; font-weight: 500; cursor: pointer; font-size: 14px; transition: 0.2s;">ارسال</button>
                    </div>
                </div>
            </div>
        `;
    }

    function addMessageToChat(text, isUser = false) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.style.display = 'flex';
        messageDiv.style.gap = '10px';
        messageDiv.style.alignItems = 'flex-start';
        messageDiv.style.animation = 'fadeInUp 0.2s ease';

        if (isUser) {
            messageDiv.style.justifyContent = 'flex-end';
            messageDiv.innerHTML = `
                <div style="background: ${CONFIG.primaryColor}; color: white; padding: 10px 14px; border-radius: 18px; border-top-right-radius: 4px; max-width: 80%; box-shadow: 0 1px 2px rgba(0,0,0,0.05); text-align: right;">
                    ${escapeHtml(text)}
                </div>
                <div style="width: 32px; flex-shrink: 0;"></div>
            `;
        } else {
            messageDiv.style.justifyContent = 'flex-start';
            messageDiv.innerHTML = `
                <div style="background: ${CONFIG.primaryColor}; width: 32px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <span style="color: white; font-size: 12px; font-weight: 500;">AI</span>
                </div>
                <div style="background: white; padding: 10px 14px; border-radius: 18px; border-top-left-radius: 4px; max-width: 80%; box-shadow: 0 1px 2px rgba(0,0,0,0.05); text-align: right;">
                    ${escapeHtml(text)}
                </div>
            `;
        }
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showTypingIndicator() {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const existing = document.getElementById('typing-indicator');
        if (existing) existing.remove();
        
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.style.display = 'flex';
        typingDiv.style.gap = '10px';
        typingDiv.style.alignItems = 'center';
        typingDiv.style.justifyContent = 'flex-start';
        typingDiv.innerHTML = `
            <div style="background: ${CONFIG.primaryColor}; width: 32px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 12px;">AI</span>
            </div>
            <div style="background: white; padding: 12px 18px; border-radius: 18px; border-top-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); text-align: center;">
                <span style="display: flex; gap: 4px; justify-content: center;">
                    <span style="width: 6px; height: 6px; background: #94A3B8; border-radius: 50%; display: inline-block; animation: pulse 1.2s infinite;"></span>
                    <span style="width: 6px; height: 6px; background: #94A3B8; border-radius: 50%; display: inline-block; animation: pulse 1.2s infinite 0.2s;"></span>
                    <span style="width: 6px; height: 6px; background: #94A3B8; border-radius: 50%; display: inline-block; animation: pulse 1.2s infinite 0.4s;"></span>
                </span>
            </div>
        `;
        container.appendChild(typingDiv);
        container.scrollTop = container.scrollHeight;
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    async function getBotResponse(userMessage) {
        try {
            const response = await fetch(CONFIG.CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    message: userMessage,
                    history: [],
                    consent_to_external_ai: true
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.success === false) {
                throw new Error(data.message || `API returned ${response.status}`);
            }

            if (data.reply) {
                return data.reply;
            }

            throw new Error("Invalid API response structure");
        } catch (error) {
            console.error("Chat backend error:", error);
            return await getFallbackResponse(userMessage);
        }
    }
    
    async function getFallbackResponse(userMessage) {
        return `پاسخ مشاوره آنلاین در این لحظه دریافت نشد. لطفاً دوباره تلاش کنید یا برای راهنمایی دقیق‌تر با کلینیک تماس بگیرید. این پاسخ جایگزین معاینه، تشخیص یا تجویز پزشک نیست.`;
    }
    
    async function sendMessage() {
        const inputField = document.getElementById('chat-input');
        const messageText = inputField.value.trim();
        if (!messageText) return;

        inputField.value = '';
        addMessageToChat(messageText, true);
        
        showTypingIndicator();
        const botReply = await getBotResponse(messageText);
        hideTypingIndicator();
        addMessageToChat(botReply, false);
    }

    function bindEvents() {
        const toggleBtn = document.getElementById('chat-toggle-btn');
        const chatWindow = document.getElementById('chat-window');
        const closeBtn = document.getElementById('close-chat');
        const sendButton = document.getElementById('send-btn');
        const chatInput = document.getElementById('chat-input');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (chatWindow.style.display === 'none' || chatWindow.style.display === '') {
                    chatWindow.style.display = 'flex';
                } else {
                    chatWindow.style.display = 'none';
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                chatWindow.style.display = 'none';
            });
        }

        if (sendButton) {
            sendButton.addEventListener('click', sendMessage);
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') sendMessage();
            });
        }
        
        // اطمینان از بسته بودن ویجت هنگام بارگذاری
        if (chatWindow) {
            chatWindow.style.display = 'none';
        }
    }

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            @keyframes pulse {
                0%, 100% { opacity: 0.3; transform: scale(0.9); }
                50% { opacity: 1; transform: scale(1.2); }
            }
            #chat-messages::-webkit-scrollbar {
                width: 5px;
            }
            #chat-messages::-webkit-scrollbar-track {
                background: #E2E8F0;
                border-radius: 10px;
            }
            #chat-messages::-webkit-scrollbar-thumb {
                background: #94A3B8;
                border-radius: 10px;
            }
            #chat-input:focus {
                border-color: ${CONFIG.primaryColor};
                box-shadow: 0 0 0 2px rgba(47, 137, 252, 0.1);
            }
            #chat-toggle-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 12px 24px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        if (document.getElementById('ai-chat-widget')) return;
        document.body.insertAdjacentHTML('beforeend', createWidgetHTML());
        addStyles();
        bindEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();