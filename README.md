# Institutional Trading System — Bybit Platform Engine

هذا المستودع يحتوي على محرك جمع بيانات سوق Bybit مخصص للتشغيل السحابي 24/7.

## المبدأ

GitHub يحفظ الكود فقط. بيئة التشغيل السحابية (مثل Oracle Cloud Always Free) هي التي تشغّل Collector. Collector يتصل بـ Bybit عبر REST وWebSocket، يطبّع البيانات، يتحقق منها، يكشف الفجوات ويعيد الاتصال، ثم يكتب البيانات إلى Supabase.

## النطاق الافتراضي

- منصة: Bybit V5
- المنتج الافتراضي: Linear / ETHUSDT
- الشموع: 1m, 5m, 15m, 1h, 4h, 1D
- التاريخ الأولي: حتى 1000 شمعة لكل إطار
- WebSocket: kline, publicTrade, orderbook, tickers, allLiquidation
- بيانات مشتقات REST: funding, open interest, long/short account ratio
- بيانات السوق المساندة: instruments, mark/index/premium klines, price limit, risk limit, delivery price, server time, insurance
- التعافي: reconnect + recent REST reconciliation + gap backfill
- التخزين: Supabase/PostgreSQL عبر service-role key في الخادم فقط
- API قراءة داخلية: health/live/recent candles/ticker

## دقة البيانات

النظام مصمم لتقليل أخطاء النقل والتكرار والفجوات، لكنه لا يستطيع ضمان «0% أخطاء» حرفيًا لأن المصدر والشبكة والخدمات الخارجية قد تتعطل. الهدف هنا هو كشف الخطأ، منع تمريره، وإعادة البناء من REST عند الحاجة.

## التشغيل

1. انسخ `.env.example` إلى `.env`.
2. ضع مفاتيح Supabase للخادم فقط.
3. ثبّت Node.js 22 LTS أو أحدث.
4. شغّل migration الموجود في `محرك المنصات/sql/schema.sql`.
5. ثبّت الحزم: `npm install`.
6. ابنِ المشروع: `npm run build`.
7. ابدأ: `npm start`.
8. للتشغيل الدائم على Ubuntu استخدم `محرك المنصات/deploy/systemd/collector.service`.

## الوصول من ChatGPT

يوجد API قراءة فقط داخل المحرك، ويمكن نشره لاحقًا خلف طبقة وصول آمنة. لا يتم وضع مفاتيح Bybit الخاصة أو service-role داخل GitHub أو داخل العميل.

## وثائق المصدر

Bybit V5:
- https://bybit-exchange.github.io/docs/v5/market/kline
- https://bybit-exchange.github.io/docs/v5/websocket/public/kline
- https://bybit-exchange.github.io/docs/v5/websocket/public/trade
- https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook
- https://bybit-exchange.github.io/docs/v5/websocket/public/ticker
- https://bybit-exchange.github.io/docs/v5/websocket/public/all-liquidation
