import sendMailMessage from "../api-connections/mail.js";
import sendTelegramMessage from "../api-connections/telegram.js";
import mongoose from "mongoose";
import { appendTextSection, buildAlertMessage } from "./message-template.js";

const LOG_CHAR_LIMIT = 1500;
const TELEGRAM_MARKDOWN_MODE = "Markdown";

function formatLogAsCodeBlock(logContent) {
  return `\`\`\`\n${logContent}\n\`\`\``;
}

export async function externalApiDown(data) {
  const apiTag = data?.commonLabels?.api;
  let telegramOptions;
  let message = buildAlertMessage({
    title: "API externa indisponivel",
    data,
    resourceFields: [{ label: "API monitorada", value: apiTag }],
    extraFields: [
      { label: "Regra de alerta", value: data?.commonLabels?.alertname },
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
