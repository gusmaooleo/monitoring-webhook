# webhook

Servico responsavel por receber alertas do Alertmanager e distribuir notificacoes para Telegram/email.

## Documentacao completa

- Fluxo de alertas e casos: `docs/alert-flow.md`

## Execucao

```bash
npm install
npm start
```

O endpoint principal e:

- `POST /alert`

