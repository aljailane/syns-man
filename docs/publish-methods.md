# طرق النشر (Publishing Methods)

هذه الصفحة تغطي كل الطرق العملية لنشر SYNS Man.

## 1) نشر الكود فقط

يناسب تحديثات المصدر بدون إصدار تنفيذي.

- `git add .`
- `git commit -m "update source"`
- `git push`

## 2) نشر إصدار Windows يدويًا

1. بناء ملفات Windows:
   - `npm run dist`
2. افتح GitHub Releases.
3. أنشئ Release جديد وارفع الملفات:
   - `SYNS Man Setup <version>.exe`
   - `SYNS Man Setup <version>.exe.blockmap`
   - `SYNS Man <version>.exe`
   - `latest.yml`

## 3) نشر إصدار Linux

1. بناء Linux:
   - `npm run dist:linux`
2. ارفع حزمة Linux في Release:
   - `.deb`

## 4) نشر متعدد الأنظمة

- `npm run build:all`

يبني Windows + Linux بعد مزامنة الإصدار.

## 5) النشر الآلي عبر electron-builder

- `npm run release:publish`

يتطلب:

- `GH_TOKEN`
- إعداد `build.publish` صحيح في `package.json`

## 6) استراتيجية tags

يفضل استخدام تنسيق:

- `v1.0.2`
- `v1.0.3`

حتى يتم ربط الإصدارات بوضوح مع سجلات التغيير.

## 7) فحص قبل النشر

- تأكد من رقم النسخة في `package.json`
- تأكد من تحديث `CHANGELOG.md`
- نفذ `npm run version:sync`
- جرّب تشغيل التطبيق محليًا

## 8) بعد النشر

- راقب صفحة Releases.
- اختبر التثبيت والتشغيل.
- اختبر زر التحديث داخل التطبيق.
