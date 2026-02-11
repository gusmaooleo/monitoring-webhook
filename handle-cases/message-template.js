const DEFAULT_TIMEZONE = process.env.ALERT_TIMEZONE || "America/Sao_Paulo";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DEFAULT_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

const STATUS_LABELS = {
  firing: "Ativo (falha detectada)",
  resolved: "Resolvido (servico recuperado)",
};

const SEVERITY_LABELS = {
  critical: "Critico",
  warning: "Atencao",
  info: "Informativo",
};

function normalizeValue(value, fallback = "nao informado") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

function normalizeFieldLines(fields = []) {
  return fields
    .filter((field) => field && field.label)
    .map((field) => `- ${field.label}: ${normalizeValue(field.value)}`);
}

export function formatPtBrDateTime(value) {
  if (!value) {
    return "nao informado";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizeValue(value);
  }

  return DATE_TIME_FORMATTER.format(date).replace(",", "");
}

function formatStatus(status) {
  return STATUS_LABELS[status] || normalizeValue(status);
}

function formatSeverity(severity) {
  return SEVERITY_LABELS[severity] || normalizeValue(severity);
}

export function buildAlertMessage({
  title,
  data,
  resourceFields = [],
  extraFields = [],
}) {
  const firstAlert = data?.alerts?.[0] || {};
  const contextFields = [
    { label: "Cliente", value: process.env.CLIENT || "Dev" },
    { label: "IP do cliente", value: process.env.CLIENT_IP || "localhost" },
    { label: "Status", value: formatStatus(data?.status) },
    { label: "Criticidade", value: formatSeverity(data?.commonLabels?.severity) },
    { label: "Gerado em", value: formatPtBrDateTime(new Date()) },
    { label: "Fuso horario", value: DEFAULT_TIMEZONE },
  ];

  const incidentWindowFields = [
    { label: "Inicio", value: formatPtBrDateTime(firstAlert?.startsAt) },
    {
      label: "Fim",
      value:
        data?.status === "firing"
          ? "Em andamento"
          : formatPtBrDateTime(firstAlert?.endsAt),
    },
  ];

  const lines = [
    "SAFFIRA - ALERTA DE MONITORAMENTO",
    "=================================",
    `Tipo de incidente: ${normalizeValue(title)}`,
    "",
    "Contexto:",
    ...normalizeFieldLines(contextFields),
    "",
    "Janela do incidente:",
    ...normalizeFieldLines(incidentWindowFields),
  ];

  const normalizedResourceFields = normalizeFieldLines(resourceFields);
  if (normalizedResourceFields.length) {
    lines.push("", "Recurso monitorado:", ...normalizedResourceFields);
  }

  const normalizedExtraFields = normalizeFieldLines(extraFields);
  if (normalizedExtraFields.length) {
    lines.push("", "Detalhes adicionais:", ...normalizedExtraFields);
  }

  return lines.join("\n");
}

export function appendTextSection(message, title, content) {
  if (!content) {
    return message;
  }

  return `${message}\n\n${title}:\n${content}`;
}
