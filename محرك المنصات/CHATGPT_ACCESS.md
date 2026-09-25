# ربط البيانات الحية مع ChatGPT

الـ API الموجود داخل المحرك مخصص للقراءة فقط.

## المسارات

GET /health
- حالة الاتصال والصحة العامة.

GET /live
- snapshot حي يحتوي ticker والحالة الحالية للشموع ودفتر الأوامر والصحة.

GET /ticker
- آخر ticker محفوظ في Supabase.

GET /candles?interval=15&limit=200
- آخر الشموع المطلوبة، بحد أقصى 1000.

## المصادقة

كل المسارات باستثناء /health تتطلب:
Authorization: Bearer <API_READ_TOKEN>

لا تضع SUPABASE_SERVICE_ROLE_KEY أو أي secret خاص بـ Bybit في العميل أو في GitHub.

## النشر الآمن

الافتراضي API_HOST=127.0.0.1، لذلك لا يكون مكشوفًا على الإنترنت.

عند الحاجة إلى وصول خارجي:
1. اجعل API يعمل على localhost فقط.
2. ضع Nginx أو طبقة HTTPS أمامه.
3. استخدم Access Control / OAuth أو token طويل عشوائي.
4. اسمح فقط بمسارات القراءة.
5. لا تعرّض منفذ Node مباشرة.

## حدود هذا الربط

هذا المستودع يوفّر endpoint قابلًا للقراءة، لكنه لا يمنح ChatGPT تلقائيًا قدرة جديدة على استدعاء الإنترنت. لكي يصبح الاستدعاء مباشرًا من ChatGPT، يجب إضافة طبقة Connector/Action/MCP متوافقة مع بيئة ChatGPT التي تستخدمها، وتوجيهها إلى HTTPS API هذا.
