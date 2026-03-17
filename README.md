# pgwal-kafka-bridge

Сервис для стриминга изменений из PostgreSQL WAL в Apache Kafka через логическую репликацию. Поддерживает фильтрацию по таблицам и маршрутизацию одной таблицы в несколько топиков с разным партицированием.

## Требования

- Node.js 24+
- PostgreSQL 14+ с включённой логической репликацией (`wal_level = logical`)
- Apache Kafka

## Сборка

```bash
npm ci
npm run build
```

## Docker

```bash
docker build -t pgwal-kafka-bridge .
docker run --env-file .env pgwal-kafka-bridge
```

## Запуск

```bash
cp .env.example .env
# отредактировать .env
npm start
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `PG_URL` | Строка подключения к PostgreSQL | — |
| `KAFKA_BROKERS` | Брокеры Kafka через запятую | — |
| `KAFKA_USERNAME` | SASL username | — |
| `KAFKA_PASSWORD` | SASL password | — |
| `KAFKA_BATCH_SIZE` | Количество сообщений в батче | `100` |
| `KAFKA_BATCH_TIME` | Таймаут сброса батча (мс) | `100` |
| `KAFKA_PARTITIONS_COUNT` | Количество партиций при создании топиков | `undefined` |
| `BRIDGE_TABLES` | JSON-массив таблиц и маршрутов (см. ниже) | — |

### Формат BRIDGE_TABLES

```json
[
  {
    "schema": "public",
    "table": "orders",
    "targets": [
      { "topic": "orders-by-user", "partitionKey": "user_id" },
      { "topic": "orders-by-region", "partitionKey": "region_id" }
    ]
  }
]
```

Каждая таблица может иметь несколько `targets` — одно и то же WAL-событие будет отправлено во все указанные топики. Поле `partitionKey` определяет, какой столбец из строки использовать как ключ партицирования в Kafka.

## Подготовка PostgreSQL

### 1. Включить логическую репликацию

В `postgresql.conf`:

```
wal_level = logical
max_replication_slots = 4
max_wal_senders = 4
```

Перезапустить PostgreSQL после изменений.

### 2. Создать пользователя с правами репликации (опционально)

```sql
CREATE ROLE replicator WITH LOGIN PASSWORD 'secret' REPLICATION;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;
```

## Автоматические миграции

При запуске сервис автоматически создаёт и обновляет всю необходимую инфраструктуру на основе `BRIDGE_TABLES`, `PG_PUB_NAME` и `PG_SLOT_NAME`:

**PostgreSQL:**
- Создаёт публикацию (`CREATE PUBLICATION`) для таблиц из конфига
- Если публикация уже существует — добавляет новые и убирает лишние таблицы (`ADD TABLE` / `DROP TABLE`)
- Устанавливает `REPLICA IDENTITY FULL` для добавленных таблиц
- Создаёт слот логической репликации, если его ещё нет

**Kafka:**
- Создаёт недостающие топики с количеством партиций из `KAFKA_PARTITIONS_COUNT` (или значение по умолчанию из настройки брокера `KAFKA_NUM_PARTITIONS`)

## Количество экземпляров

**Допускается только один экземпляр на один слот репликации.** PostgreSQL разрешает только одно активное соединение к слоту — второй процесс с тем же `PG_SLOT_NAME` получит ошибку.

Если нужно масштабировать:

- Запустите отдельный экземпляр с уникальными `PG_SLOT_NAME` и `PG_PUB_NAME`
- Разделите таблицы между экземплярами через `BRIDGE_TABLES`
- Публикации, слоты и топики создадутся автоматически при старте
