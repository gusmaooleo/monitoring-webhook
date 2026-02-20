# Fluxo de alertas do webhook Saffira

Atualizado em: 2026-02-20

## 1. Arquivos centrais do fluxo

### Stack Prometheus/Alertmanager (projeto `saffira_back-end`)

- `/home/leonardo/saffira/saffira_back-end/src/config/prom-middleware.ts`
  - Define os gauges `external_api_down` e `camera_offline`.
  - Expoe metricas em `/metrics`.
- `/home/leonardo/saffira/saffira_back-end/alert-rules/rules.yml`
  - Regras `backend_down`, `external_api_down` e `camera_offline`.
- `/home/leonardo/saffira/saffira_back-end/prometheus.yml`
  - Scrape do backend (`saffira_backend:3000`) e envio para Alertmanager.
- `/home/leonardo/saffira/saffira_back-end/alertmanager.yml`
  - Envio de alertas para `http://webhook:6000/alert` com `send_resolved: true`.
- `/home/leonardo/saffira/saffira_back-end/docker-compose.yml`
  - Sobe os servicos `prometheus`, `alertmanager` e `webhook`.

### Tratamento (projeto `webhook`)

- `/home/leonardo/saffira/webhook/index.js`
  - Endpoint `POST /alert`.
- `/home/leonardo/saffira/webhook/handle-cases/handle-cases.js`
  - Router por `commonLabels.alertname`.
- `/home/leonardo/saffira/webhook/handle-cases/backend-down.js`
  - Caso `backend_down`.
- `/home/leonardo/saffira/webhook/handle-cases/api-down.js`
  - Caso `external_api_down` com throttling de 2 horas para `firing`.
- `/home/leonardo/saffira/webhook/handle-cases/camera-off.js`
  - Caso `camera_offline`.
- `/home/leonardo/saffira/webhook/handle-cases/message-template.js`
  - Template padrao de mensagem.
- `/home/leonardo/saffira/webhook/api-connections/telegram.js`
  - Envio Telegram.
- `/home/leonardo/saffira/webhook/api-connections/mail.js`
  - Envio email.
- `/home/leonardo/saffira/webhook/config/database-config.js`
  - Conexao Mongo usada para logs e estado de notificacao.

## 2. Onde os gauges sao atualizados no backend

### Gauge `external_api_down`

- `/home/leonardo/saffira/saffira_back-end/src/features/vehicles/services/VehiclesService.ts`
  - `set(..., 0)` no sucesso de `getVehicles()`.
  - `set(..., 1)` no `catch` de `getVehicles()`.
- `/home/leonardo/saffira/saffira_back-end/src/features/map/services/SatelliteService.ts`
  - `set(..., 0)` no sucesso de `fetchSatellites()`.
  - `set(..., 1)` no `catch` de `fetchSatellites()`.
- `/home/leonardo/saffira/saffira_back-end/src/features/alarms/jobs/YoloInferenceService.ts`
  - `set(..., 0)` quando inferencia YOLO responde.
  - `set(..., 1)` no erro da chamada de inferencia.
- `/home/leonardo/saffira/saffira_back-end/src/config/setup-redis.ts`
  - Usa `externalApiDown` via `setRedisMetric(0|1)`.
  - Marca indisponibilidade de Redis em reconexao, erro, end e falha de startup.

### Gauge `camera_offline`

- `/home/leonardo/saffira/saffira_back-end/src/features/cameras/jobs/ListenCameraStateJob.ts`
  - `set(labels, 1)` quando camera esta offline ou ocorre excecao.
  - `set(labels, 0)` quando camera esta online.

## 3. Fluxo ponta a ponta

1. Backend atualiza gauges (`external_api_down`, `camera_offline`).
2. Endpoint `/metrics` expoe valores para o Prometheus.
3. Prometheus faz scrape (5s no job `saffira_backend`) e avalia regras.
4. Regras em `alert-rules/rules.yml` entram em `firing` apos janela `for`:
   - `backend_down`: `for: 5s`
   - `external_api_down`: `for: 30s`
   - `camera_offline`: `for: 5m`
5. Alertmanager recebe alertas do Prometheus e publica no webhook.
6. Webhook recebe payload em `/alert` e roteia por `alertname`.
7. Handler do caso monta mensagem padrao e envia para Telegram/email conforme tipo.

## 4. Casos tratados no webhook

- `backend_down`
  - Arquivo: `/home/leonardo/saffira/webhook/handle-cases/backend-down.js`
  - Canais: Telegram + email.
- `external_api_down`
  - Arquivo: `/home/leonardo/saffira/webhook/handle-cases/api-down.js`
  - Canais: Telegram + email.
  - Enriquecimento: ultimo log da API via collection `logs` filtrando por `tags`.
  - Regra nova: notifica em `firing` no maximo 1 vez a cada 2 horas por API/cliente.
- `camera_offline`
  - Arquivo: `/home/leonardo/saffira/webhook/handle-cases/camera-off.js`
  - Canais: Telegram.

## 5. Regra de repeticao de 2 horas para `external_api_down`

Implementada em `/home/leonardo/saffira/webhook/handle-cases/api-down.js`.

### Chave de controle

- `alertname = external_api_down`
- `api` (label da metrica)
- `clientName` (label da metrica)

### Persistencia

- Collection Mongo: `alert_notification_state`.
- Campos usados:
  - `lastFiringNotificationAt`
  - `lastResolvedAt`
  - `updatedAt`
  - `createdAt`

### Comportamento

- Quando `data.status === "firing"`:
  - Se nao existe envio recente, envia mensagem e grava `lastFiringNotificationAt = now`.
  - Se ultimo envio foi ha menos de 2h, suprime o alerta.
- Quando `data.status === "resolved"`:
  - Limpa o throttle (`lastFiringNotificationAt = null`) para permitir envio imediato no proximo incidente.

## 6. Payload minimo consumido do Alertmanager

- `data.status` (`firing` ou `resolved`)
- `data.commonLabels.alertname`
- `data.commonLabels.severity`
- `data.commonLabels.api` ou `data.alerts[0].labels.api`
- `data.commonLabels.clientName` ou `data.alerts[0].labels.clientName`
- `data.alerts[0].startsAt`
- `data.alerts[0].endsAt`

## 7. Cenarios operacionais esperados

### Cenario A: API cai e permanece offline por 6 horas

1. Primeiro alerta `firing` e enviado.
2. Repeticoes antes de 2h sao suprimidas.
3. Novo envio em torno de +2h, +4h, +6h enquanto continuar `firing`.
4. Quando recuperar, alerta `resolved` e enviado.

### Cenario B: API cai, recupera e cai novamente em 30 minutos

1. Queda 1: envia `firing`.
2. Recuperacao: envia `resolved` e limpa estado de throttle.
3. Queda 2 (novo incidente): envia `firing` imediatamente, mesmo em menos de 2h.

### Cenario C: camera_offline

1. Gauge `camera_offline` sobe para `1`.
2. Regra espera 5 minutos (`for: 5m`).
3. Webhook envia mensagem Telegram com nome/IP da camera.

## 8. Observacoes importantes

- O `repeat_interval` global do Alertmanager continua configurado em 1 hora.
- A cadencia de 2 horas para `external_api_down` eh aplicada no webhook (camada de entrega), sem afetar os demais alertas.
- Se o label `api` nao vier no payload, o webhook ainda envia alerta, mas sem chave especifica de throttle por API.
