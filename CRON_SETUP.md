# Настройка Google Cloud Scheduler для Авто-Выкладки

Для того чтобы приложение автоматически выкладывало новые посты из Instagram каждый час, мы настроили периодическую задачу (Cron Job) через Google Cloud Scheduler.

## Задача 1: Автоматический постинг из Instagram

### Параметры задачи:
*   **Частота:** `0 * * * *` (каждый час, в 0 минут).
*   **URL:** `https://<URL_вашего_Cloud_Run>/api/cron/autopost?secret=MySuperSecretToken2026`
*   **Метод:** `GET`

### Секретный ключ (CRON_SECRET)
Эндпоинт защищен секретным ключом. Он должен совпадать с `CRON_SECRET`, который находится в `.env.local`. 
При деплое на Cloud Run, не забудьте добавить `CRON_SECRET=MySuperSecretToken2026` в переменные окружения сервиса, иначе Scheduler будет получать ошибку `401 Unauthorized`.

### Управление через консоль Google Cloud (CLI)
Если вы захотите удалить, изменить или запустить задачу вручную через терминал, используйте следующие команды:

**Просмотр списка задач:**
```bash
gcloud scheduler jobs list --location=us-central1
```

**Принудительный запуск (для проверки прямо сейчас):**
```bash
gcloud scheduler jobs run instagram-autopost-job --location=us-central1
```

**Удалить задачу:**
```bash
gcloud scheduler jobs delete instagram-autopost-job --location=us-central1
```

*(Замените `us-central1` на ваш регион, если он отличается).*


## Задача 2: Автоматическая очистка старых файлов в Cloudinary

Для того чтобы приложение автоматически удаляло медиафайлы старше 24 часов из Cloudinary, мы настроили вторую периодическую задачу.

### Параметры задачи:
*   **Частота:** `0 3 * * *` (каждый день в 03:00 ночи).
*   **URL:** `https://<URL_вашего_Cloud_Run>/api/cron/cleanup?secret=MySuperSecretToken2026`
*   **Метод:** `GET`

### Создание задачи через gcloud:
```bash
gcloud scheduler jobs create http cloudinary-cleanup-job \
  --schedule="0 3 * * *" \
  --uri="https://instagram-automation-412412438508.us-central1.run.app/api/cron/cleanup?secret=MySuperSecretToken2026" \
  --http-method=GET \
  --location=us-central1
```

**Принудительный запуск (для ручной очистки прямо сейчас):**
```bash
gcloud scheduler jobs run cloudinary-cleanup-job --location=us-central1
```
