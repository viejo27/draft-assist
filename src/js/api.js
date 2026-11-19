const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;

export const isTauri = typeof invoke === "function";
export const isPreview = !isTauri;

let previewBootstrapCache = null;
let previewRecommendationCache = null;
let previewHistoryCache = null;
let previewClashCache = null;

async function loadPreviewJson(name) {
  const url = new URL(`../data/${name}`, import.meta.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `No se pudo cargar ${name}. Ejecuta la app con Tauri o genera los datos de vista previa.`,
    );
  }
  return response.json();
}

async function previewBootstrap() {
  previewBootstrapCache ??= await loadPreviewJson("preview-bootstrap.json");
  return previewBootstrapCache;
}

async function previewRecommendation() {
  previewRecommendationCache ??= await loadPreviewJson("preview-recommendation.json");
  return previewRecommendationCache;
}

async function previewHistory() {
  previewHistoryCache ??= await loadPreviewJson("preview-history.json");
  return previewHistoryCache;
}

export async function bootstrap() {
  if (isTauri) return invoke("bootstrap");
  return previewBootstrap();
}

export async function recommend(request) {
  if (isTauri) return invoke("recommend", { request });
  const response = await previewRecommendation();
  return {
    ...response,
    warnings: [
      "Vista previa estática sin Tauri: las recomendaciones no se recalculan.",
      ...(response.warnings ?? []),
    ],
  };
}

export async function loadAppState() {
  if (isTauri) return invoke("load_app_state");
  return null;
}

export async function saveAppState(appState) {
  if (isTauri) return invoke("save_app_state", { appState });
  return {
    path: "vista previa",
    validation: { valid: true, errors: [], warnings: [] },
  };
}

export async function loadExample() {
  if (isTauri) return invoke("load_example");
  const data = await previewBootstrap();
  return data.example_state;
}

export async function reloadData() {
  if (isTauri) return invoke("reload_data");
  const data = await previewBootstrap();
  return { data: data.data, warnings: data.warnings ?? [] };
}

export async function validateState(appState) {
  if (isTauri) return invoke("validate_state", { appState });
  return { valid: true, errors: [], warnings: [] };
}

export async function openDataDir() {
  if (isTauri) return invoke("open_data_dir");
  throw new Error("Abrir carpetas solo está disponible en la app de escritorio.");
}

const previewLcuStatus = {
  state: "preview",
  connected: false,
  phase: null,
  queue_id: null,
  queue_name: null,
  template_id: null,
  side: null,
  local_player: null,
  current_action: null,
  last_error: null,
  last_sync_ms: null,
  auto: false,
};

export async function lcuStatus() {
  if (isTauri) return invoke("lcu_status");
  return previewLcuStatus;
}

const previewClashStatus = {
  enabled: false,
  tournament: null,
  roster: null,
  bracket: null,
  next_match: null,
  opponent: null,
  message: "La vista de rival de Clash solo está disponible en la app de escritorio.",
  last_sync_ms: null,
};

async function previewClash() {
  previewClashCache ??= await loadPreviewJson("preview-clash.json").catch(
    () => previewClashStatus,
  );
  return previewClashCache;
}

export async function clashStatus() {
  if (isTauri) return invoke("clash_status");
  return previewClash();
}

export async function clashOverview() {
  if (isTauri) return invoke("clash_overview");
  const clash = await previewClash();
  return {
    enabled: clash.enabled,
    tournament: clash.tournament,
    team: clash.roster
      ? {
          id: clash.roster.id,
          name: clash.roster.name,
          short_name: clash.roster.short_name,
          is_registered: clash.roster.is_registered,
          state: clash.roster.state,
          state_label: clash.roster.state_label,
        }
      : null,
    message: clash.message,
    last_sync_ms: clash.last_sync_ms,
  };
}

export async function lcuStartTracking(appState) {
  if (isTauri) return invoke("lcu_start_tracking", { appState });
  throw new Error("El seguimiento LCU solo está disponible en la app de escritorio.");
}

export async function lcuStopTracking() {
  if (isTauri) return invoke("lcu_stop_tracking");
  return { ...previewLcuStatus, auto: false };
}

export async function listenLcuSnapshot(handler) {
  if (!isTauri) return () => {};
  return window.__TAURI__.event.listen("lcu-snapshot", (event) => {
    handler(event.payload);
  });
}

export async function historyLoad() {
  if (isTauri) return invoke("history_load");
  return previewHistory();
}

export async function historySave(history) {
  if (isTauri) return invoke("history_save", { history });
  return { path: "vista previa" };
}

export async function historyImportLegacy(text) {
  if (isTauri) return invoke("history_import_legacy", { text });
  throw new Error("Importar Clash solo está disponible en la app de escritorio.");
}

export async function historyExport(history) {
  if (isTauri) return invoke("history_export", { history });
  throw new Error("Exportar historial solo está disponible en la app de escritorio.");
}

export async function historyMatchFromDraft(appState) {
  if (isTauri) return invoke("history_match_from_draft", { appState });
  throw new Error("Guardar partidas solo está disponible en la app de escritorio.");
}

export async function openHistoryDir() {
  if (isTauri) return invoke("history_open_dir");
  throw new Error("Abrir carpetas solo está disponible en la app de escritorio.");
}
