import nodemailer from "nodemailer";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function parseRegisteredMails(rawRegisteredMails) {
  if (!rawRegisteredMails) {
    return [];
  }

  const normalized = rawRegisteredMails.trim();

  try {
    const parsed = JSON.parse(normalized.replaceAll("'", '"'));
    if (Array.isArray(parsed)) {
      return parsed.map((mail) => String(mail).trim()).filter(Boolean);
    }
  } catch (_) {
  }

  return normalized
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((mail) => mail.replace(/['"]/g, "").trim())
    .filter(Boolean);
}

function createTransporter() {
  const host = process.env.EMAIL_PROVIDER_HOST;
  const user = process.env.EMAIL_PROVIDER_USER;
  const password = process.env.EMAIL_PROVIDER_PASSWORD;

  if (!host || !user || !password) {
    console.log("SMTP não configurado: verifique EMAIL_PROVIDER_HOST/USER/PASSWORD.");
    return null;
  }

  const port = Number(process.env.EMAIL_PROVIDER_PORT || 587);
  const secure = parseBoolean(process.env.EMAIL_PROVIDER_SECURE, port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: password,
    },
  });
}

export default async function sendMailMessage(text) {
  try {
    const recipients = parseRegisteredMails(process.env.REGISTERED_MAILS);
    if (!recipients.length) {
      console.log("Nenhum destinatário em REGISTERED_MAILS.");
      return;
    }

    const transporter = createTransporter();
    if (!transporter) {
      return;
    }

    const subject = process.env.EMAIL_SUBJECT || "Saffira Monitoring Alert";
    const from = process.env.EMAIL_PROVIDER_USER || process.env.EMAIL_PROVIDER_USER;

    const response = await transporter.sendMail({
      from,
      to: recipients.join(", "),
      subject,
      text,
    });

    console.log(`Email enviado (${response.messageId}) para: ${recipients.join(", ")}`);
  } catch (error) {
    console.log("Falha ao enviar email.");
    console.error(error);
  }
}
