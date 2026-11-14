const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;

export const isTauri = typeof invoke === "function";
export const isPreview = !isTauri;

let previewBootstrapCache = null;
let previewRecommendationCache = null;

async function loadPreviewJson(name) {
  const url = new URL(`../data/${name}`, import.meta.url);
  const response = await fetch(url);
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
