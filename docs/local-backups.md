# Локальные резервные копии на VPS

Скрипт сохраняет два источника данных приложения:

- PostgreSQL в формате `pg_dump -Fc`;
- загруженные через админ-панель фото из `/app/public/uploads/teas`.

Архивы лежат в `/var/backups/mf-tea/mf-tea-<дата-время-UTC>/`. По умолчанию хранятся 14 дней. Папка создаётся с правами `700`, файлы — только для владельца. В каждой копии есть `SHA256SUMS` для проверки целостности. Скрипт не архивирует `.env.staging` и не выводит значения секретов.

> Локальная копия помогает при ошибочном обновлении или удалении данных, но не защитит от потери самого VPS или его диска.

## Установка

1. Разместите проект на VPS. В примере каталог проекта — `/opt/mf-tea`; при другом пути замените его в unit-файле и командах ниже.
2. Убедитесь, что Docker Compose запущен, а `/opt/mf-tea/.env.staging` существует и доступен root.
3. Установите скрипт и unit-файлы:

   ```bash
   sudo chmod 700 /opt/mf-tea/scripts/backup-local.sh
   sudo cp /opt/mf-tea/deploy/mf-tea-backup.service /etc/systemd/system/
   sudo cp /opt/mf-tea/deploy/mf-tea-backup.timer /etc/systemd/system/
   ```

   Если проект находится не в `/opt/mf-tea`, поправьте `WorkingDirectory`, `ENV_FILE` и `ExecStart` в `/etc/systemd/system/mf-tea-backup.service`.

4. Запустите копирование вручную и убедитесь, что архивы появились:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start mf-tea-backup.service
   sudo systemctl status mf-tea-backup.service
   sudo ls -lah /var/backups/mf-tea
   ```

5. Включите ежедневный запуск около 03:20 по времени VPS:

   ```bash
   sudo systemctl enable --now mf-tea-backup.timer
   sudo systemctl list-timers mf-tea-backup.timer
   ```

   Журнал последнего запуска:

   ```bash
   sudo journalctl -u mf-tea-backup.service -n 100 --no-pager
   ```

Для ручного запуска без systemd скрипт принимает переменные окружения:

```bash
sudo ENV_FILE=/opt/mf-tea/.env.staging \
  BACKUP_DIR=/var/backups/mf-tea RETENTION_DAYS=14 \
  /opt/mf-tea/scripts/backup-local.sh
```

Нужны Docker Compose и `flock` (пакет `util-linux`). Утилита `tar` запускается внутри контейнера приложения.

## Проверка и восстановление

Для проверки перейдите в каталог нужной копии и проверьте контрольные суммы:

```bash
cd /var/backups/mf-tea/mf-tea-НУЖНАЯ-КОПИЯ
sudo sha256sum -c SHA256SUMS
```

Перед восстановлением откройте root shell (`sudo -i`) и остановите приложение, чтобы оно не записывало заказы во время возврата базы. Восстановление БД перезапишет существующие таблицы и данные — сначала убедитесь, что выбрана нужная копия.

```bash
cd /opt/mf-tea
docker compose --env-file .env.staging stop app
docker compose --env-file .env.staging exec -T db sh -ec 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < /var/backups/mf-tea/mf-tea-НУЖНАЯ-КОПИЯ/database.dump
docker compose --env-file .env.staging run --rm --no-deps --entrypoint sh app -ec 'tar -xzf - -C /app/public/uploads/teas' < /var/backups/mf-tea/mf-tea-НУЖНАЯ-КОПИЯ/tea-uploads.tar.gz
docker compose --env-file .env.staging up -d app
```

Сначала попробуйте восстановить копию в отдельной тестовой базе или на тестовом экземпляре. Периодически проверяйте архивы и само восстановление: успешное создание файла ещё не гарантирует, что восстановление пройдёт.

## Место на диске

Каждая точка содержит полный дамп БД и полный архив фото. Поэтому фото могут занимать примерно в 14 раз больше, чем текущий объём папки загрузок, плюс место для дампов базы. Проверяйте свободное место командой `df -h /var/backups/mf-tea`; при быстром росте числа фото уменьшите `RETENTION_DAYS` или перенесите копии на отдельный диск.
