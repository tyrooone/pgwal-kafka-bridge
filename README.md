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

### 2. Создать пользователя с правами репликации

```sql
CREATE ROLE replicator WITH LOGIN PASSWORD 'secret' REPLICATION;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;
```

### 3. Создать публикацию

Для конкретных таблиц:

```sql
CREATE PUBLICATION pgwal_bridge_pub FOR TABLE orders, users;
```

Для всех таблиц:

```sql
CREATE PUBLICATION pgwal_bridge_pub FOR ALL TABLES;
```

### 4. Включить REPLICA IDENTITY FULL

По умолчанию при `DELETE` в WAL попадают только значения primary key. Чтобы получать всю строку целиком:

```sql
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;
```

### 5. Создать слот репликации

```sql
SELECT pg_create_logical_replication_slot('pgwal_bridge', 'pgoutput');
```

Проверить существующие слоты:

```sql
SELECT * FROM pg_replication_slots;
```

Удалить слот (если нужно пересоздать):

```sql
SELECT pg_drop_replication_slot('pgwal_bridge');
```

## Подготовка Kafka

### Создать топики

```bash
kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic orders-by-user \
  --partitions 6 --replication-factor 1

kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic orders-by-region \
  --partitions 6 --replication-factor 1
```

Количество партиций выбирается исходя из требуемого параллелизма консьюмеров.

## Количество экземпляров

**Допускается только один экземпляр на один слот репликации.** PostgreSQL разрешает только одно активное соединение к слоту — второй процесс с тем же `PG_SLOT_NAME` получит ошибку.

Если нужно масштабировать:

- Создайте отдельный слот и публикацию для каждого экземпляра
- Разделите таблицы между экземплярами через `BRIDGE_TABLES`
- Каждый экземпляр использует свой `PG_SLOT_NAME`

```sql
-- Экземпляр 1: orders
CREATE PUBLICATION pub_orders FOR TABLE orders;
SELECT pg_create_logical_replication_slot('slot_orders', 'pgoutput');

-- Экземпляр 2: users
CREATE PUBLICATION pub_users FOR TABLE users;
SELECT pg_create_logical_replication_slot('slot_users', 'pgoutput');
```
