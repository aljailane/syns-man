# SYNS Man — نظام التحديثات الفورية ومزامنة الإصدارات

هذا الدليل يشرح:

- إصلاح خطأ التشغيل `SyntaxError: Unexpected end of input`.
- تشغيل نظام **تحديث فوري** (Realtime Updates) داخل التطبيق.
- مزامنة الإصدارات بين ملفات المشروع.
- بناء ونشر الإصدارات مع `electron-builder`.

> سجل التغييرات الرسمي متوفر هنا: [`CHANGELOG.md`](./CHANGELOG.md)
>
> دليل الرفع إلى GitHub: [`GITHUB_UPLOAD_GUIDE.md`](./GITHUB_UPLOAD_GUIDE.md)
>
> فهرس التوثيق الكامل: [`docs/README.md`](./docs/README.md) و [`docs/index.html`](./docs/index.html)

---

## 1) إصلاح الخطأ الحالي

تم إصلاح ملف `main.js` وإعادة بناءه بالكامل بشكل صحيح مع:

- ربط نوافذ التطبيق (`minimize / maximize / close`).
- ربط جميع نداءات IPC الأساسية (`app:getVersion` + dialogs).
- إضافة مسار كامل لنظام التحديثات (`update:getState`, `update:check`, `update:install`).

> بعد التعديل، فحص الصياغة (`node --check`) نجح بدون أخطاء.

---

## 2) ما الذي تم إضافته في نظام التحديثات؟

### في Main Process (`main.js`)

تم إضافة دورة تحديث كاملة باستخدام `electron-updater`:

- `checking-for-update`
- `update-available`
- `download-progress`
- `update-downloaded`
- `update-not-available`
- `error`

مع بث الحالة مباشرة إلى الواجهة عبر:

- `update:status`
- `update:progress`

ومهام إضافية:

- فحص أولي تلقائي بعد تشغيل التطبيق.
- فحص دوري كل 15 دقيقة في الخلفية.
- أمر تثبيت مباشر بعد تنزيل التحديث (`quitAndInstall`).

### في Preload (`preload.js`)

تم إضافة API آمن للواجهة:

- `updateGetState()`
- `updateCheck()`
- `updateInstall()`
- `onUpdateStatus(cb)`
- `onUpdateProgress(cb)`

### في Renderer (`renderer/js/app.js` + `renderer/index.html`)

تم تفعيل واجهة About لتصبح تفاعلية بالكامل:

- زر `Check for Updates` يعمل فعليًا.
- زر `Install Update` يتفعل فقط عند جاهزية التحديث.
- عرض مباشر لحالة التحديث الحالية.
- شريط تقدم مع نسبة التحميل وسرعة التحميل.

---

## 3) مزامنة الإصدارات (Version Sync)

تم إضافة سكربت جديد:

- `scripts/sync-version.js`

وظيفته:

- مزامنة `version` في `package-lock.json` من `package.json`.
- تحديث نسخة العرض الافتراضية في صفحة About.
- تحديث أمثلة أسماء الملفات في `README.md` (مثل `SYNS Man Setup x.y.z.exe`).

### أوامر الإصدارات الجديدة

من `package.json`:

- `npm run version:sync`
- `npm run release:patch`
- `npm run release:minor`
- `npm run release:major`

كل أمر Release يقوم بـ:

1. رفع الإصدار في `package.json`.
2. تشغيل مزامنة الإصدارات تلقائيًا.

---

## 4) البناء والنشر

### أوامر البناء

- Windows فقط:

```/dev/null/cmd.txt#L1-1
npm run dist
```

- Linux فقط:

```/dev/null/cmd.txt#L1-1
npm run dist:linux
```

- Windows + Linux مع مزامنة إصدار قبل البناء:

```/dev/null/cmd.txt#L1-1
npm run build:all
```

### أوامر التحديث/النشر

- بناء اختباري بدون نشر:

```/dev/null/cmd.txt#L1-1
npm run update:dry
```

- نشر الإصدار إلى مزود النشر (GitHub):

```/dev/null/cmd.txt#L1-1
npm run release:publish
```

> تمت إضافة إعداد `publish` داخل `build` في `package.json` ليشير إلى:
>
> - owner: `syns`
> - repo: `syns`

---

## 5) ملاحظات مهمة للتحديث التلقائي

1. التحديث التلقائي يعمل في النسخ **المبنية** (`app.isPackaged === true`) وليس أثناء `npm start` التطويري.
2. عند النشر على GitHub Releases، يجب توفير متغير البيئة:

```/dev/null/cmd.txt#L1-1
GH_TOKEN=your_github_token
```

3. لا تضع أي Token داخل الكود مباشرة.

---

## 6) طريقة العمل المقترحة لكل إصدار جديد

1. رفع الإصدار:

```/dev/null/cmd.txt#L1-1
npm run release:patch
```

2. بناء الحزم:

```/dev/null/cmd.txt#L1-1
npm run build:all
```

3. نشر التحديث:

```/dev/null/cmd.txt#L1-1
npm run release:publish
```

بهذا يصبح لديك:

- نسخة تطبيق جديدة.
- مزامنة إصدار صحيحة.
- نظام تحديث فوري داخل التطبيق يعرض الحالة والتقدم للمستخدم.
