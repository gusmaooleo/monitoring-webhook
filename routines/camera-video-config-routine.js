import DigestFetch from "digest-fetch";

const CAMERAS_COLLECTION = "cameras";
const VIDEO_CONFIG_ENDPOINT =
  "/cgi-bin/configManager.cgi?action=getConfig&name=Video";
const DEFAULT_INTERVAL_HOURS = 12;
const DEFAULT_TIMEOUT_MS = 15000;

function nowIso() {
  return new Date().toISOString();
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeError(error) {
  if (error?.name === "AbortError") {
    return "request timeout";
  }

  return error?.message || String(error);
}

function cameraLabel(camera) {
  const name = camera?.nome || camera?._id?.toString?.() || "camera-sem-nome";
  const ip = camera?.ip || "sem-ip";
  return `${name} (${ip})`;
}

function isDigestPreferred(camera) {
  const model = String(camera?.modelo || "").toLowerCase();
  const brand = String(camera?.marca || "").toLowerCase();
  return model.includes("digest") || brand.includes("dahua");
}

function buildCameraVideoConfigUrl(camera) {
  const ip = String(camera?.ip || "").trim();
  if (!ip) {
    return null;
  }

  const hasProtocol = ip.startsWith("http://") || ip.startsWith("https://");
  const baseUrl = hasProtocol ? ip : `http://${ip}`;
  return `${baseUrl}${VIDEO_CONFIG_ENDPOINT}`;
}

async function requestWithTimeout(fetcher, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithDigest(url, login, password, timeoutMs) {
  const client = new DigestFetch(login || "", password || "");
  return requestWithTimeout(
    (signal) => client.fetch(url, { method: "GET", signal }),
    timeoutMs
  );
}

async function fetchWithBasic(url, login, password, timeoutMs) {
  const headers = {};
  if (login || password) {
    const token = Buffer.from(`${login || ""}:${password || ""}`).toString(
      "base64"
    );
    headers.Authorization = `Basic ${token}`;
  }

  return requestWithTimeout(
    (signal) => fetch(url, { method: "GET", headers, signal }),
    timeoutMs
  );
}

async function requestVideoConfig(camera, timeoutMs) {
  const login = camera?.login;
  const password = camera?.password;
  const url = buildCameraVideoConfigUrl(camera);

  if (!url) {
    throw new Error("camera sem IP");
  }

  if (!login || !password) {
    throw new Error("camera sem login/password");
  }

  const strategies = isDigestPreferred(camera)
    ? [fetchWithDigest, fetchWithBasic]
    : [fetchWithBasic, fetchWithDigest];

  let lastError;
  for (const strategy of strategies) {
    try {
      const response = await strategy(url, login, password, timeoutMs);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("falha ao consultar configuracao da camera");
}

async function runCameraVideoConfigCycle(mongoose, timeoutMs) {
  const camerasCollection = mongoose.connection.collection(CAMERAS_COLLECTION);
  const cameras = await camerasCollection
    .find(
      {},
      {
        projection: {
          nome: 1,
          ip: 1,
          login: 1,
          password: 1,
          marca: 1,
          modelo: 1,
        },
      }
    )
    .toArray();

  console.log(
    `[${nowIso()}] [CAMERA_CONFIG] Ciclo iniciado. Cameras encontradas: ${cameras.length}`
  );

  for (const camera of cameras) {
    const label = cameraLabel(camera);
    try {
      const config = await requestVideoConfig(camera, timeoutMs);
      console.log(
        `[${nowIso()}] [CAMERA_CONFIG] Configuracao de video recebida para ${label}`
      );
      console.log(config);
    } catch (error) {
      console.error(
        `[${nowIso()}] [CAMERA_CONFIG] Falha ao consultar ${label}: ${normalizeError(error)}`
      );
    }
  }

  console.log(`[${nowIso()}] [CAMERA_CONFIG] Ciclo finalizado.`);
}

export function startCameraVideoConfigRoutine(mongoose) {
  const intervalHours = parsePositiveNumber(
    process.env.CAMERA_CONFIG_CHECK_INTERVAL_HOURS,
    DEFAULT_INTERVAL_HOURS
  );
  const timeoutMs = parsePositiveNumber(
    process.env.CAMERA_CONFIG_CHECK_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(
    `[${nowIso()}] [CAMERA_CONFIG] Rotina iniciada. Intervalo: ${intervalHours}h`
  );

  let isRunning = false;
  const run = async () => {
    if (isRunning) {
      console.log(
        `[${nowIso()}] [CAMERA_CONFIG] Ciclo anterior ainda em execucao. Pulando rodada.`
      );
      return;
    }

    isRunning = true;
    try {
      await runCameraVideoConfigCycle(mongoose, timeoutMs);
    } catch (error) {
      console.error(
        `[${nowIso()}] [CAMERA_CONFIG] Erro no ciclo: ${normalizeError(error)}`
      );
    } finally {
      isRunning = false;
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, intervalMs);
}
