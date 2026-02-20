import sendMailMessage from "../api-connections/mail.js";
import sendTelegramMessage from "../api-connections/telegram.js";
import mongoose from "mongoose";
import { appendTextSection, buildAlertMessage } from "./message-template.js";

const LOG_CHAR_LIMIT = 1500;
const TELEGRAM_MARKDOWN_MODE = "Markdown";
const EXTERNAL_API_ALERT_WINDOW_MS = 2 * 60 * 60 * 1000;
const ALERT_STATE_COLLECTION = "alert_notification_state";
const EXTERNAL_API_ALERT_NAME = "external_api_down";

function formatLogAsCodeBlock(logContent) {
  return `\`\`\`\n${logContent}\n\`\`\``;
}

function resolveAlertContext(data) {
  const firstAlert = data?.alerts?.[0] || {};

  return {
    apiTag: data?.commonLabels?.api || firstAlert?.labels?.api,
    clientName:
      data?.commonLabels?.clientName ||
      firstAlert?.labels?.clientName ||
      process.env.CLIENT ||
      "Dev",
  };
}

async function shouldSendFiringAlert(apiTag, clientName) {
  if (!apiTag) {
    return { shouldSend: true };
  }

  const collection = mongoose.connection.collection(ALERT_STATE_COLLECTION);
  const query = {
    alertname: EXTERNAL_API_ALERT_NAME,
    api: apiTag,
    clientName,
  };

  const currentState = await collection.findOne(query);
  const now = new Date();
  const lastSentAt = currentState?.lastFiringNotificationAt
    ? new Date(currentState.lastFiringNotificationAt)
    : null;

  if (
    lastSentAt &&
    now.getTime() - lastSentAt.getTime() < EXTERNAL_API_ALERT_WINDOW_MS
  ) {
    return {
      shouldSend: false,
      nextNotificationAt: new Date(
        lastSentAt.getTime() + EXTERNAL_API_ALERT_WINDOW_MS,
      ),
    };
  }

  await collection.updateOne(
    query,
    {
      $set: {
        lastFiringNotificationAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return { shouldSend: true };
}

async function clearFiringThrottle(apiTag, clientName) {
  if (!apiTag) {
    return;
  }

  const collection = mongoose.connection.collection(ALERT_STATE_COLLECTION);
  const now = new Date();

  await collection.updateOne(
    {
      alertname: EXTERNAL_API_ALERT_NAME,
      api: apiTag,
      clientName,
    },
    {
      $set: {
        lastFiringNotificationAt: null,
        lastResolvedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function externalApiDown(data) {
  const { apiTag, clientName } = resolveAlertContext(data);
  const alertStatus = data?.status;

  if (alertStatus === "firing") {
    try {
      const { shouldSend, nextNotificationAt } = await shouldSendFiringAlert(
        apiTag,
        clientName,
      );

      if (!shouldSend) {
        console.log(
          `[EXTERNAL_API_DOWN] Alerta suprimido para ${apiTag || "api-nao-informada"} (${clientName}). Proximo envio em ${nextNotificationAt?.toISOString() || "2h"}.`,
        );
        return;
      }
    } catch (error) {
      console.error(
        "[EXTERNAL_API_DOWN] Nao foi possivel aplicar a janela de notificacao de 2h.",
        error,
      );
    }
  }

  if (alertStatus === "resolved") {
    try {
      await clearFiringThrottle(apiTag, clientName);
    } catch (error) {
      console.error(
        "[EXTERNAL_API_DOWN] Nao foi possivel limpar o estado de notificacao.",
        error,
      );
    }
  }

  let telegramOptions;
  let message = buildAlertMessage({
    title: "API externa indisponivel",
    data,
    resourceFields: [
      { label: "API monitorada", value: apiTag },
      { label: "Cliente da metrica", value: clientName },
    ],
    extraFields: [
      { label: "Regra de alerta", value: data?.commonLabels?.alertname },
      {
        label: "Intervalo minimo de repeticao (firing)",
        value: "2 horas",
      },
    ],
  });

  try {
    if (!apiTag) {
      message = appendTextSection(
        message,
        "Ultimo log registrado",
        "API monitorada nao informada no alerta.",
      );
      console.log("[MESSAGE SENT]\n", message);
      sendTelegramMessage(message);
      sendMailMessage(message);
      return;
    }

    const collection = mongoose.connection.collection("logs");
    const lastLog = await collection.findOne(
      { tags: apiTag },
      { sort: { _id: -1 } },
    );

    if (lastLog) {
      const serializedLog = JSON.stringify(lastLog, null, 2);
      const trimmedLog =
        serializedLog.length > LOG_CHAR_LIMIT
          ? `${serializedLog.slice(0, LOG_CHAR_LIMIT)}\n... (log truncado)`
          : serializedLog;

      message = appendTextSection(
        message,
        "Ultimo log registrado",
        formatLogAsCodeBlock(trimmedLog),
      );
      telegramOptions = { parseMode: TELEGRAM_MARKDOWN_MODE };
    } else {
      message = appendTextSection(
        message,
        "Ultimo log registrado",
        "Nenhum log associado encontrado.",
      );
    }
  } catch (error) {
    message = appendTextSection(
      message,
      "Ultimo log registrado",
      "Nao foi possivel consultar o banco de logs.",
    );
    console.error(error);
  }
  console.log("[MESSAGE SENT]\n", message);

  sendTelegramMessage(message, telegramOptions);
  sendMailMessage(message);
}
