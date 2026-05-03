# دليل رفع SYNS Man إلى GitHub

هذا الملف يشرح طريقة رفع المشروع إلى GitHub، ثم رفع إصدار التطبيق (EXE) كنشرة Release.

## 1) تجهيز المستودع المحلي

1. ادخل إلى مسار المشروع.
2. نفّذ أوامر Git الأساسية:
   - `git init`
   - `git add .`
   - `git commit -m "Initial commit"`

## 2) إنشاء مستودع على GitHub

1. افتح GitHub وأنشئ Repository جديد.
2. انسخ رابط المستودع (HTTPS أو SSH).
3. اربط المشروع المحلي بالمستودع:
   - `git remote add origin <REPO_URL>`
4. ارفع الفرع الرئيسي:
   - `git branch -M main`
   - `git push -u origin main`

## 3) بناء ملفات Windows قبل الرفع

لبناء ملفات EXE:

- `npm run dist`

الملفات المهمة تكون داخل `dist/` مثل:

- `SYNS Man Setup 1.0.2.exe`
- `SYNS Man Setup 1.0.2.exe.blockmap`
- `SYNS Man 1.0.2.exe`
- `latest.yml`

## 4) رفع إصدار جديد عبر GitHub Releases (يدوي)

1. افتح صفحة المستودع على GitHub.
2. اذهب إلى Releases ثم New release.
3. أنشئ Tag مثل `v1.0.2`.
4. اكتب عنوان وملاحظات الإصدار.
5. ارفع ملفات الإصدار من مجلد `dist` (يفضل رفع ملفات المثبّت + blockmap + latest.yml).
6. اضغط Publish release.

## 5) الرفع الآلي من خلال electron-builder

المشروع مجهز بأمر نشر:

- `npm run release:publish`

قبل التنفيذ:

1. تأكد أن بيانات `build.publish` في `package.json` تشير إلى المالك والمستودع الصحيحين.
2. عيّن متغير البيئة `GH_TOKEN` (توكن GitHub بصلاحية كتابة Releases).

مثال (PowerShell):

- `$env:GH_TOKEN="YOUR_TOKEN"`
- `npm run release:publish`

## 6) تحديث الإصدار قبل النشر

يمكنك رفع رقم الإصدار مع مزامنة الملفات:

- `npm run release:patch` أو `npm run release:minor` أو `npm run release:major`

ثم:

- `npm run build:all`
- `npm run release:publish`

## 7) ملاحظات مهمة للتحديث التلقائي داخل التطبيق

- التحديث التلقائي يعمل من النسخة المبنية (Packaged) وليس من `npm start`.
- وجود `latest.yml` وملفات الإصدار في Release مهم ليعمل فحص التحديثات بشكل صحيح.
- لا تضع `GH_TOKEN` داخل الكود أو داخل ملفات المشروع.

## 8) التحقق بعد النشر

1. افتح صفحة Releases وتأكد من وجود الملفات.
2. ثبّت الإصدار على جهاز اختبار.
3. جرّب زر `Check for Updates` من صفحة About.
4. تأكد من ظهور حالة التحديث وشريط التقدم.
