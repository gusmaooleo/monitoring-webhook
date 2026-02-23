import DigestFetch from "digest-fetch";

const CAMERAS_COLLECTION = "cameras";
// Dahua costuma responder 400 para name=Video; Encode retorna os parametros de video.
const VIDEO_CONFIG_ENDPOINT =
  "/cgi-bin/configManager.cgi?action=getConfig&name=Encode";
const DEFAULT_INTERVAL_HOURS = 12;
const DEFAULT_TIMEOUT_MS = 15000;
const ERROR_BODY_PREVIEW_MAX = 160;

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

function strategyName(strategy) {
  return strategy === fetchWithDigest ? "digest" : "basic";
}

function compactErrorBody(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > ERROR_BODY_PREVIEW_MAX
    ? `${normalized.slice(0, ERROR_BODY_PREVIEW_MAX)}...`
    : normalized;
}

function parseConfigScalar(rawValue) {
  const value = String(rawValue || "").trim();
  const lower = value.toLowerCase();

  if (lower === "true") {
    return true;
  }

  if (lower === "false") {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (/^-?\d+\.\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

function tokenizeConfigPath(path) {
  const tokens = [];
  const tokenRegex = /([^[\]]+)|\[(\d+)\]/g;

  for (const part of String(path || "").split(".")) {
    tokenRegex.lastIndex = 0;

    let match;
    while ((match = tokenRegex.exec(part)) !== null) {
      if (match[1]) {
        tokens.push(match[1]);
      } else if (match[2] !== undefined) {
        tokens.push(Number(match[2]));
      }
    }
  }

  return tokens;
}

function setNestedConfigValue(target, tokens, value) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return;
  }

  let cursor = target;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const isLast = index === tokens.length - 1;
    const nextToken = tokens[index + 1];

    if (typeof token === "string") {
      if (isLast) {
        cursor[token] = value;
        return;
      }

      if (cursor[token] === undefined || cursor[token] === null) {
        cursor[token] = typeof nextToken === "number" ? [] : {};
      }

      cursor = cursor[token];
      continue;
    }

    if (!Array.isArray(cursor)) {
      return;
    }

    if (isLast) {
      cursor[token] = value;
      return;
    }

    if (cursor[token] === undefined || cursor[token] === null) {
      cursor[token] = typeof nextToken === "number" ? [] : {};
    }

    cursor = cursor[token];
  }
}

function parseCameraConfigText(configText) {
  const byPath = {};
  const tree = {};

  const lines = String(configText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const path = line.slice(0, separatorIndex).trim();
    if (!path) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    const parsedValue = parseConfigScalar(rawValue);

    byPath[path] = parsedValue;

    const tokens = tokenizeConfigPath(path);
    setNestedConfigValue(tree, tokens, parsedValue);
  }

  return {
    byPath,
    tree,
    totalItems: Object.keys(byPath).length,
  };
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
  const label = cameraLabel(camera);

  if (!url) {
    throw new Error("camera sem IP");
  }

  if (!login || !password) {
    throw new Error("camera sem login/password");
  }

  const strategies = isDigestPreferred(camera)
    ? [fetchWithDigest, fetchWithBasic]
    : [fetchWithBasic, fetchWithDigest];

  const attempts = [];

  for (const strategy of strategies) {
    const auth = strategyName(strategy);

    try {
      console.log(
        `[${nowIso()}] [CAMERA_CONFIG] ${label} tentativa auth=${auth} url=${url}`
      );

      const response = await strategy(url, login, password, timeoutMs);
      if (!response.ok) {
        const wwwAuthenticate = response.headers?.get?.("www-authenticate");
        let errorBody = "";

        try {
          errorBody = compactErrorBody(await response.text());
        } catch {
          errorBody = "";
        }

        const details = [
          `auth=${auth}`,
          `HTTP ${response.status} ${response.statusText}`,
          wwwAuthenticate
            ? `www-authenticate=${JSON.stringify(wwwAuthenticate)}`
            : null,
          errorBody ? `body=${JSON.stringify(errorBody)}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        throw new Error(details);
      }

      const config = await response.text();
      return { config, url, auth };
    } catch (error) {
      const normalized = normalizeError(error);
      attempts.push(`${auth}: ${normalized}`);
      console.warn(
        `[${nowIso()}] [CAMERA_CONFIG] ${label} falha auth=${auth}: ${normalized}`
      );
    }
  }

  throw new Error(`todas as tentativas falharam em ${url}: ${attempts.join(" || ")}`);
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
    const url = buildCameraVideoConfigUrl(camera);

    console.log(
      `[${nowIso()}] [CAMERA_CONFIG] Consultando ${label} em ${url || "url-invalida"}`
    );

    try {
      const { config, auth, url: resolvedUrl } = await requestVideoConfig(
        camera,
        timeoutMs
      );

      const parsedConfig = parseCameraConfigText(config);

      console.log(
        `[${nowIso()}] [CAMERA_CONFIG] Configuracao recebida para ${label} (auth=${auth}, url=${resolvedUrl}, campos=${parsedConfig.totalItems})`
      );

      if (parsedConfig.totalItems === 0) {
        console.warn(
          `[${nowIso()}] [CAMERA_CONFIG] ${label} resposta sem pares key=value; exibindo texto bruto.`
        );
        console.log(config);
        continue;
      }

      // byPath e ideal para comparar com campos predefinidos por chave completa.
      console.log(JSON.stringify(parsedConfig.byPath, null, 2));
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
    `[${nowIso()}] [CAMERA_CONFIG] Rotina iniciada. Intervalo: ${intervalHours}h | timeout=${timeoutMs}ms | endpoint=${VIDEO_CONFIG_ENDPOINT}`
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
