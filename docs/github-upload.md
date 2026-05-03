# دليل رفع المشروع إلى GitHub

## الهدف

نشر الكود + نشر ملفات التطبيق المبنية (EXE) على GitHub Releases.

## المتطلبات

- حساب GitHub
- Git مثبت على الجهاز
- Node.js و npm
- صلاحية إنشاء Repo و Releases

## الخطوات

1. رفع الكود الأساسي:
   - `git add .`
   - `git commit -m "prepare release"`
   - `git push`

2. بناء ملف EXE:
   - `npm run dist`

3. فتح Releases في GitHub وإنشاء نسخة جديدة `vX.Y.Z`.

4. رفع ملفات `dist` الخاصة بالإصدار:
   - ملف Setup
   - ملف Portable
   - ملف blockmap
   - ملف `latest.yml`

## النشر الآلي

يمكن استخدام:

- `npm run release:publish`

بعد ضبط:

- `GH_TOKEN`
- `build.publish.owner`
- `build.publish.repo`

## أخطاء شائعة

- عدم وجود `latest.yml` في Release يسبب تعطل التحديث التلقائي.
- استخدام توكن بدون صلاحيات كافية يمنع إنشاء Release.
- اختلاف رقم النسخة بين الملفات يسبب سلوك تحديث غير متوقع.

## تحقق سريع

- تأكد أن الإصدار ظاهر في GitHub Releases.
- تأكد أن اسم النسخة في التطبيق يطابق نفس Tag.
