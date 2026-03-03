# Настройка Google Cloud Scheduler для Авто-Выкладки

Для того чтобы приложение автоматически выкладывало новые посты из Instagram каждый час, мы настроили периодическую задачу (Cron Job) через Google Cloud Scheduler.

## Параметры задачи:
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
gcloud scheduler jobs list --location=europe-west1
```

**Принудительный запуск (для проверки прямо сейчас):**
```bash
gcloud scheduler jobs run instagram-autopost-job --location=europe-west1
```

**Удалить задачу:**
```bash
gcloud scheduler jobs delete instagram-autopost-job --location=europe-west1
```

*(Замените `europe-west1` на ваш регион, если он отличается).*
