import * as api from "./api.js";
import {
  buildHistorySignals,
  emptyHistoryFilters,
  isCompleteMatch,
} from "./history.js";
import { isLiveQueue } from "./live.js";

export const app = {
  bootstrap: null,
  state: null,
  response: null,
  view: "draft",
  busy: false,
  loading: true,
  fatalError: null,
  warnings: [],
  undo: [],
  toasts: [],
  picker: null,
  stepDialog: false,
  isExample: false,
  lastSaved: null,
  validation: null,
  preview: api.isPreview,
  update: {
    checking: false,
    available: false,
    installing: false,
    installed: false,
    error: null,
    currentVersion: null,
    version: null,
    notes: null,
    date: null,
    progress: null,
    dismissedVersion: null,
    lastCheckedAt: null,
  },
  lcu: {
    status: null,
    auto: false,
    connected: false,
    starting: false,
    lastError: null,
    signature: null,
  },
  live: {
    snapshot: null,
    sessionId: null,
    sessionQueueId: null,
    queueId: null,
    eligible: false,
    tabVisible: false,
    available: false,
    ended: false,
    pendingMatch: null,
    savePromptShown: false,
    saved: false,
    openSaveDialog: false,
    lastError: null,
  },
  clash: {
    data: null,
    loading: false,
    error: null,
  },
  clashOverview: {
    data: null,
    loading: false,
    error: null,
    attempted: false,
    retried: false,
  },
  lobbyScouting: {
    data: null,
    loading: false,
    error: null,
    phase: null,
    signature: null,
    lastLoaded: null,
  },
  rivalLive: {
    data: null,
    loading: false,
    error: null,
    signature: null,
    lastLoaded: null,
    tabVisible: false,
  },
  history: {
    store: null,
    loading: false,
    saving: false,
    error: null,
    tab: "summary",
    filters: emptyHistoryFilters(),
    selectedMatchId: null,
    rivalSearch: "",
    rivalRole: "ALL",
    importPreview: null,
    importSource: null,
    pendingMatch: null,
    renameRival: null,
    lastSaved: null,
  },
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let renderQueued = false;
export function emit() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    for (const listener of listeners) listener(app);
  });
}

let toastId = 0;
export function toast(message, tone = "info") {
  const id = ++toastId;
  app.toasts.push({ id, message, tone });
  emit();
  window.setTimeout(() => {
    app.toasts = app.toasts.filter((item) => item.id !== id);
    emit();
  }, 4200);
}

export function currentTemplate() {
  if (!app.bootstrap || !app.state) return null;
  return (
    app.bootstrap.templates.find(
      (template) => template.id === app.state.draft.template_id,
    ) ?? app.bootstrap.templates[0]
  );
}

export function currentStep() {
  const template = currentTemplate();
  const index = app.state?.draft?.step_index ?? 0;
  return template?.steps?.[index] ?? null;
}

export function orderedPlayers() {
  if (!app.state) return [];
  const players = app.state.roster.players;
  const order = app.state.roster.pick_order ?? [];
  const ordered = order.map((id) => players.find((player) => player.id === id)).filter(Boolean);
  for (const player of players) {
    if (!ordered.some((existing) => existing.id === player.id)) ordered.push(player);
  }
  return ordered;
}

export function playerForPick(pickNumber) {
  return orderedPlayers()[Math.max(0, Number(pickNumber) - 1)] ?? null;
}

export function currentTurn() {
  if (!app.state) return null;
  const draft = app.state.draft;
  if (draft.lcu_turn) {
    const lcuTurn = draft.lcu_turn;
    const isOurTurn = lcuTurn.acting_side === draft.side;
    const player = lcuTurn.player_id
      ? app.state.roster.players.find((item) => item.id === lcuTurn.player_id)
      : draft.current_player_id
        ? app.state.roster.players.find((item) => item.id === draft.current_player_id)
        : null;
    return {
      phase: lcuTurn.phase,
      actingSide: lcuTurn.acting_side,
      isOurTurn,
      pickNumber: lcuTurn.pick_number ?? null,
      label: lcuTurn.label || "Turno LCU",
      currentPlayer: player ?? null,
      manual: false,
      lcu: true,
    };
  }
  if (draft.manual) {
    const isOurTurn = draft.manual.acting_side === draft.side;
    return {
      phase: draft.manual.phase,
      actingSide: draft.manual.acting_side,
      isOurTurn,
      pickNumber:
        draft.manual.phase === "PICK" && isOurTurn ? draft.our_picks.length + 1 : null,
      label:
        draft.manual.phase === "BAN"
          ? "Turno manual · ban"
          : "Turno manual · pick",
      currentPlayer: draft.manual.player_id
        ? app.state.roster.players.find((player) => player.id === draft.manual.player_id)
        : null,
      manual: true,
    };
  }

  const step = currentStep();
  if (!step) return null;
  const isOurTurn = !step.team || step.team === draft.side;
  const player =
    step.kind === "PICK" && isOurTurn
      ? draft.current_player_id
        ? app.state.roster.players.find((player) => player.id === draft.current_player_id)
        : playerForPick(step.pick_number)
      : null;
  return {
    phase: step.kind,
    actingSide: step.team,
    isOurTurn,
    pickNumber: step.pick_number,
    label: step.label || (step.kind === "BAN" ? "Fase de bans" : "Turno de pick"),
    currentPlayer: player ?? null,
    manual: false,
    simultaneousBan: Boolean(step.simultaneous),
  };
}

export function championById(id) {
  return app.bootstrap?.champions.find((champion) => champion.id === id) ?? null;
}

export function metaFor(championId) {
  return championById(championId);
}

export function unavailableChampions() {
  if (!app.state) return new Set();
  const draft = app.state.draft;
  return new Set([
    ...draft.our_bans,
    ...draft.enemy_bans,
    ...draft.our_picks.map((pick) => pick.champion_id),
    ...draft.enemy_picks.map((pick) => pick.champion_id),
  ]);
}

export function nextStepIndex() {
  const template = currentTemplate();
  const step = currentStep();
  if (!template || !step) return app.state?.draft?.step_index ?? 0;
  if (step.kind === "BAN" && step.simultaneous) {
    const slots = step.ban_slots_per_team ?? 5;
    if (
      app.state.draft.our_bans.length >= slots &&
      app.state.draft.enemy_bans.length >= slots
    ) {
      return Math.min(template.steps.length, app.state.draft.step_index + 1);
    }
    return app.state.draft.step_index;
  }
  return Math.min(template.steps.length, app.state.draft.step_index + 1);
}

function advance() {
  app.state.draft.step_index = nextStepIndex();
  app.state.draft.current_player_id = null;
}

function clone(value) {
  return structuredClone(value);
}

function pushUndo() {
  if (!app.state) return;
  app.undo.push(clone(app.state.draft));
  if (app.undo.length > 40) app.undo.shift();
}

function afterDraftChange() {
  app.validation = null;
  scheduleSave();
  emit();
  void refresh();
}

let saveTimer = null;
function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    if (!app.state) return;
    try {
      const result = await api.saveAppState(app.state);
      app.lastSaved = result.path;
      app.validation = result.validation;
      if (result.validation?.errors?.length) {
        app.warnings = [...new Set([...app.warnings, ...result.validation.errors])];
      }
      emit();
    } catch (error) {
      toast(error.message ?? "No se pudo guardar el estado.", "error");
    }
  }, 260);
}

let refreshToken = 0;
export async function refresh() {
  if (!app.state) return;
  if (
    app.state.settings.use_history &&
    !app.history.store &&
    !app.history.error
  ) {
    if (!app.history.loading) void loadHistory();
    emit();
    return;
  }
  const token = ++refreshToken;
  app.busy = true;
  emit();
  try {
    const history =
      app.state.settings.use_history && app.history.store
        ? buildHistorySignals(app.history.store)
        : null;
    const response = await api.recommend({
      draft: app.state.draft,
      roster: app.state.roster,
      options: app.state.settings,
      history,
    });
    if (token !== refreshToken) return;
    app.response = response;
    app.warnings = response.warnings ?? [];
  } catch (error) {
    if (token !== refreshToken) return;
    app.response = null;
    app.warnings = [error.message ?? String(error)];
  } finally {
    if (token === refreshToken) {
      app.busy = false;
      emit();
    }
  }
}

export async function init() {
  app.loading = true;
  app.fatalError = null;
  emit();
  try {
    app.bootstrap = await api.bootstrap();
    let saved = null;
    try {
      saved = await api.loadAppState();
    } catch (error) {
      toast(
        `No se pudo cargar el estado guardado; se usa el ejemplo. ${error.message ?? error}`,
        "warning",
      );
    }
    app.state = saved ?? clone(app.bootstrap.example_state);
    if (app.state?.draft?.lcu_turn) {
      app.state.draft.lcu_turn = null;
    }
    app.isExample = !saved;
    app.view = "draft";
    app.undo = [];
    if (app.isExample) {
      app.lastSaved = null;
    }
    app.loading = false;
    emit();
    await refresh();
    void loadHistory();
    void loadClashOverview();
    if (api.isTauri) {
      void initUpdater();
      scheduleUpdateAutoCheck();
      ensureScoutingAutoRefresh();
      void initLcu();
    } else {
      void initLivePreview();
    }
    if (app.isExample) {
      toast("Draft de ejemplo cargado. Puedes editar todo o empezar uno nuevo.", "info");
    }
    if (app.preview) {
      toast("Vista previa sin Tauri: recomendaciones estáticas.", "warning");
    }
  } catch (error) {
    app.loading = false;
    app.fatalError = error.message ?? String(error);
    emit();
  }
}

async function initLcu() {
  try {
    await api.listenLcuSnapshot(applyLcuSnapshot);
  } catch (error) {
    app.lcu.lastError = error.message ?? String(error);
  }
  try {
    await api.listenLiveSnapshot(applyLiveSnapshot);
  } catch (error) {
    app.live.lastError = error.message ?? String(error);
  }

  try {
    const status = await api.lcuStatus();
    applyLcuStatus(status);
    emit();
  } catch (error) {
    app.lcu.lastError = error.message ?? String(error);
    emit();
  }

  try {
    const snapshot = await api.liveCurrent();
    if (snapshot) applyLiveSnapshot(snapshot);
  } catch (error) {
    app.live.lastError = error.message ?? String(error);
    emit();
  }
}

function applyLcuStatus(status) {
  if (!status) return;
  app.lcu.status = status;
  app.lcu.auto = Boolean(status.auto);
  app.lcu.connected = Boolean(status.connected);
  app.lcu.lastError = status.last_error ?? null;

  if (status.connected && status.queue_id !== null && status.queue_id !== undefined) {
    const wasEligible = app.live.eligible;
    const eligible = isLiveQueue(status.queue_id, status.template_id);
    app.live.eligible = eligible;
    app.live.queueId = eligible ? Number(status.queue_id) : null;

    if (!wasEligible && eligible && app.live.snapshot) {
      if (app.live.snapshot.ended || app.live.snapshot.available === false) {
        app.live.snapshot = null;
        app.live.sessionId = null;
        app.live.sessionQueueId = null;
      }
    }
    if (eligible && app.live.snapshot && app.live.sessionQueueId === null) {
      app.live.sessionQueueId = app.live.queueId;
    }
  }
  if (app.live.snapshot) {
    app.live.tabVisible =
      app.live.eligible &&
      app.live.sessionQueueId !== null &&
      app.live.sessionQueueId === app.live.queueId;
  } else {
    app.live.tabVisible = false;
  }
  if (!app.live.tabVisible && app.view === "live") {
    app.view = "draft";
  }

  const clashContext = isClashContext(status);
  const rivalVisible = Boolean(
    status.connected && (status.phase === "ChampSelect" || clashContext),
  );
  app.rivalLive.tabVisible = rivalVisible;
  if (!rivalVisible) {
    app.rivalLive.data = null;
    app.rivalLive.error = null;
    app.rivalLive.signature = null;
    if (app.view === "rival-live") app.view = "draft";
  } else if (status.phase !== "ChampSelect") {
    app.rivalLive.data = null;
    app.rivalLive.error = null;
    app.rivalLive.signature = null;
  }

  maybePromptLiveSave();

  if (
    status.connected &&
    !app.clashOverview.data &&
    app.clashOverview.error &&
    !app.clashOverview.retried
  ) {
    app.clashOverview.retried = true;
    void loadClashOverview({ force: true });
  }
}

export function applyLcuSnapshot(payload) {
  if (!payload?.status) return;
  applyLcuStatus(payload.status);

  app.lcu.signature = payload.lobby_signature ?? null;
  if (payload.status.auto && payload.status.connected) {
    syncScoutingSignature(payload);
  }

  if (payload.status.auto && payload.draft) {
    const current = JSON.stringify(app.state?.draft ?? null);
    const next = JSON.stringify(payload.draft);
    if (current !== next) {
      app.state.draft = payload.draft;
      app.validation = null;
      scheduleSave();
      emit();
      void refresh();
      return;
    }
  }

  emit();
}

export async function refreshLcuStatus() {
  if (!api.isTauri) return;
  try {
    const status = await api.lcuStatus();
    applyLcuStatus(status);
    emit();
  } catch (error) {
    app.lcu.lastError = error.message ?? String(error);
    emit();
  }
}

export function applyLiveSnapshot(payload) {
  if (!payload) return;
  const sessionChanged = Boolean(payload.session_id) && payload.session_id !== app.live.sessionId;
  if (sessionChanged) {
    app.live.sessionId = payload.session_id;
    app.live.sessionQueueId = null;
    app.live.pendingMatch = null;
    app.live.savePromptShown = false;
    app.live.saved = false;
    app.live.openSaveDialog = false;
  }

  app.live.snapshot = payload;
  app.live.available = payload.available !== false;
  app.live.ended = Boolean(payload.ended);
  if (app.live.eligible && app.live.sessionQueueId === null) {
    app.live.sessionQueueId = app.live.queueId;
  }
  app.live.tabVisible =
    app.live.eligible &&
    app.live.sessionQueueId !== null &&
    app.live.sessionQueueId === app.live.queueId;
  app.live.lastError = null;

  if (!app.live.tabVisible && app.view === "live") {
    app.view = "draft";
  }

  maybePromptLiveSave();
  emit();
}

function maybePromptLiveSave() {
  if (!api.isTauri) return;
  if (!app.live.snapshot?.ended) return;
  if (app.live.sessionQueueId !== 700) return;
  if (app.live.savePromptShown) return;
  app.live.savePromptShown = true;
  void prepareLiveMatch({ open: true });
}

async function initLivePreview() {
  try {
    const snapshot = await api.liveCurrent();
    if (!snapshot) return;
    app.live.eligible = true;
    app.live.queueId = 700;
    app.live.tabVisible = true;
    app.view = "live";
    applyLiveSnapshot(snapshot);
  } catch (error) {
    app.live.lastError = error.message ?? String(error);
  }
}

let updateEventsBound = false;
let updateAutoCheckTimer = null;

async function initUpdater() {
  if (!api.isTauri || updateEventsBound) return;
  updateEventsBound = true;
  try {
    await api.listenUpdateProgress((payload) => {
      app.update.progress = {
        downloaded: Number(payload?.downloaded) || 0,
        total: payload?.total == null ? null : Number(payload.total),
      };
      window.dispatchEvent(
        new CustomEvent("draft-assist:update-progress", {
          detail: app.update.progress,
        }),
      );
    });
    await api.listenUpdateInstalling(() => {
      app.update.installing = true;
      emit();
    });
  } catch (error) {
    app.update.error = error.message ?? String(error);
    emit();
  }
}

function scheduleUpdateAutoCheck() {
  if (!api.isTauri || updateAutoCheckTimer !== null) return;
  updateAutoCheckTimer = window.setTimeout(() => {
    updateAutoCheckTimer = null;
    void checkForUpdates({ silent: true });
  }, 2500);
}

export async function checkForUpdates({ silent = false } = {}) {
  if (!api.isTauri) {
    if (!silent) {
      toast("Las actualizaciones solo están disponibles en la app de escritorio.", "warning");
    }
    return;
  }
  if (app.update.checking || app.update.installing) return;

  app.update.checking = true;
  app.update.error = null;
  emit();
  try {
    const result = await api.updateCheck();
    app.update.currentVersion =
      result.current_version ?? app.bootstrap?.app_version ?? null;
    app.update.available = Boolean(result.available);
    app.update.version = result.version ?? null;
    app.update.notes = result.notes ?? null;
    app.update.date = result.date ?? null;
    app.update.lastCheckedAt = Date.now();
    if (!result.available) app.update.dismissedVersion = null;
    if (result.available && !silent) {
      toast(`Nueva versión ${result.version} disponible.`, "info");
    }
  } catch (error) {
    app.update.error = error.message ?? String(error);
    app.update.lastCheckedAt = Date.now();
    if (!silent) toast(app.update.error, "error");
  } finally {
    app.update.checking = false;
    emit();
  }
}

export async function installUpdate() {
  if (!api.isTauri || !app.update.available || app.update.installing) return;
  app.update.installing = true;
  app.update.error = null;
  app.update.progress = { downloaded: 0, total: null };
  emit();
  try {
    await api.updateInstall();
    app.update.installed = true;
    app.update.available = false;
    app.update.installing = false;
    app.update.progress = null;
    emit();
  } catch (error) {
    app.update.installing = false;
    app.update.progress = null;
    app.update.error = error.message ?? String(error);
    toast(app.update.error, "error");
    emit();
  }
}

export function dismissUpdate() {
  app.update.dismissedVersion = app.update.version;
  emit();
}

function resetLiveState() {
  app.live.snapshot = null;
  app.live.sessionId = null;
  app.live.sessionQueueId = null;
  app.live.queueId = null;
  app.live.eligible = false;
  app.live.tabVisible = false;
  app.live.available = false;
  app.live.ended = false;
  app.live.pendingMatch = null;
  app.live.savePromptShown = false;
  app.live.saved = false;
  app.live.openSaveDialog = false;
  app.live.lastError = null;
  if (app.view === "live") app.view = "draft";
}

export async function prepareLiveMatch({ open = false } = {}) {
  if (!app.state) return null;
  if (!api.isTauri) {
    toast(
      "Guardar partidas desde Juego en vivo solo está disponible en la app de escritorio.",
      "warning",
    );
    return null;
  }
  if (app.live.saved) {
    toast("La partida ya está guardada en el historial.", "info");
    return null;
  }
  if (app.live.pendingMatch) {
    if (open) {
      app.live.openSaveDialog = true;
      emit();
    }
    return app.live.pendingMatch;
  }

  try {
    const match = await api.liveMatchRecord(app.state, app.live.sessionQueueId);
    app.live.pendingMatch = match;
    app.live.lastError = null;
    if (open) app.live.openSaveDialog = true;
    emit();
    return match;
  } catch (error) {
    app.live.lastError = error.message ?? String(error);
    toast(app.live.lastError, "error");
    emit();
    return null;
  }
}

export function openLiveSaveDialog() {
  if (app.live.saved) {
    toast("La partida ya está guardada en el historial.", "info");
    return;
  }
  if (app.live.pendingMatch) {
    app.live.openSaveDialog = true;
    emit();
    return;
  }
  void prepareLiveMatch({ open: true });
}

export function dismissLiveSave() {
  app.live.openSaveDialog = false;
  emit();
}

export async function confirmLiveMatch() {
  if (!app.live.pendingMatch) {
    await prepareLiveMatch({ open: true });
  }
  const match = app.live.pendingMatch;
  if (!match) return;
  if (!app.history.store) {
    await loadHistory();
  }
  if (!app.history.store) {
    app.history.store = normalizeHistoryStore(null);
  }
  if (!match.played_at) {
    match.played_at = new Date().toISOString();
  }
  const previousMatches = app.history.store.matches ?? [];
  app.history.store.matches = [
    match,
    ...previousMatches.filter((item) => item.id !== match.id),
  ];
  await saveHistoryStore();
  if (app.history.error) {
    app.history.store.matches = previousMatches;
    emit();
    return;
  }
  app.live.saved = true;
  app.live.pendingMatch = null;
  app.live.openSaveDialog = false;
  emit();
  toast("Partida guardada en el historial.", "success");
}

export async function startLcuTracking() {
  if (!api.isTauri) {
    toast("El seguimiento LCU solo está disponible en la app de escritorio.", "warning");
    return;
  }
  if (!app.state) return;
  app.lcu.starting = true;
  resetLiveState();
  emit();
  try {
    const status = await api.lcuStartTracking(app.state);
    app.lcu.auto = true;
    applyLcuStatus(status);
    app.undo = [];
    toast("Seguimiento LCU activado. El tablero es de solo lectura.", "success");
    emit();
    void refresh();
  } catch (error) {
    toast(error.message ?? "No se pudo activar el seguimiento LCU.", "error");
  } finally {
    app.lcu.starting = false;
    emit();
  }
}

export async function stopLcuTracking() {
  if (!api.isTauri) return;
  try {
    const status = await api.lcuStopTracking();
    resetLiveState();
    app.lcu.auto = false;
    app.lcu.status = status;
    app.lcu.connected = Boolean(status.connected);
    if (app.state?.draft?.lcu_turn) {
      app.state.draft.lcu_turn = null;
    }
    scheduleSave();
    emit();
    void refresh();
    toast("Seguimiento LCU detenido. Ya puedes editar el draft.", "info");
  } catch (error) {
    toast(error.message ?? "No se pudo detener el seguimiento LCU.", "error");
  }
}

export function isLcuAuto() {
  return Boolean(app.lcu.auto);
}

function blockLcuEdit() {
  if (!app.lcu.auto) return false;
  toast("Detén el seguimiento LCU para editar el draft.", "warning");
  return true;
}

export async function loadClash({ silent = false } = {}) {
  if (app.clash.loading) return;
  app.clash.loading = true;
  if (!silent) app.clash.error = null;
  emit();
  try {
    app.clash.data = await api.clashStatus();
    app.clash.error = null;
  } catch (error) {
    app.clash.error = error.message ?? String(error);
  } finally {
    app.clash.loading = false;
    emit();
  }
}

export async function loadClashOverview({ force = false } = {}) {
  if (app.clashOverview.loading) return;
  if (app.clashOverview.attempted && !force) return;
  app.clashOverview.attempted = true;
  app.clashOverview.loading = true;
  if (force) app.clashOverview.error = null;
  emit();
  try {
    app.clashOverview.data = await api.clashOverview();
    app.clashOverview.error = null;
  } catch (error) {
    app.clashOverview.error = error.message ?? String(error);
  } finally {
    app.clashOverview.loading = false;
    emit();
  }
}

export function refreshClash() {
  return Promise.allSettled([
    loadClash(),
    loadClashOverview({ force: true }),
  ]);
}

export async function loadLobbyScouting({ silent = false } = {}) {
  if (app.lobbyScouting.loading) return;
  app.lobbyScouting.loading = true;
  app.lobbyScouting.error = null;
  emit();
  try {
    const data = await api.lobbyScouting();
    app.lobbyScouting.data = data;
    app.lobbyScouting.phase = data?.phase ?? app.lcu.status?.phase ?? app.lobbyScouting.phase;
    app.lobbyScouting.signature = data?.signature ?? null;
    app.lobbyScouting.lastLoaded = Date.now();
  } catch (error) {
    app.lobbyScouting.error = error.message ?? String(error);
    if (!silent) toast(app.lobbyScouting.error, "error");
  } finally {
    app.lobbyScouting.loading = false;
    emit();
  }
}

export function refreshLobbyScouting() {
  return loadLobbyScouting();
}

export async function loadRivalScouting({ silent = false } = {}) {
  if (app.rivalLive.loading || !app.rivalLive.tabVisible) return;
  app.rivalLive.loading = true;
  app.rivalLive.error = null;
  emit();
  try {
    const data = await api.rivalScouting();
    if (!app.rivalLive.tabVisible) return;
    app.rivalLive.data = data;
    app.rivalLive.signature = data?.signature ?? null;
    app.rivalLive.lastLoaded = Date.now();
  } catch (error) {
    if (!app.rivalLive.tabVisible) return;
    app.rivalLive.error = error.message ?? String(error);
    if (!silent) toast(app.rivalLive.error, "error");
  } finally {
    app.rivalLive.loading = false;
    emit();
  }
}

export function refreshRivalScouting() {
  if (!isChampSelectPhase() && isClashContext()) {
    return loadClash({ silent: false });
  }
  return loadRivalScouting();
}

export function isClashContext(status = app.lcu.status) {
  const tournament =
    app.clash.data?.tournament ?? app.clashOverview.data?.tournament;
  const team = app.clash.data?.roster ?? app.clashOverview.data?.team;
  const activeTournament = Boolean(
    tournament &&
      tournament.state !== "RESULTS" &&
      tournament.state !== "CANCELLED" &&
      (!tournament.end_time_ms || Number(tournament.end_time_ms) > Date.now()),
  );
  return Boolean(status?.queue_id === 700 || (activeTournament && team));
}

function isChampSelectPhase() {
  return app.lcu.status?.phase === "ChampSelect";
}

let scoutingRefreshTimer = null;

export function refreshActiveScouting() {
  if (app.view === "clash") {
    return loadClash({ silent: true });
  }
  if (app.view === "rival-live") {
    if (!isChampSelectPhase() && isClashContext()) {
      return loadClash({ silent: true });
    }
    if (isChampSelectPhase()) {
      return loadRivalScouting({ silent: true });
    }
  }
  return Promise.resolve();
}

function ensureScoutingAutoRefresh() {
  if (!api.isTauri || scoutingRefreshTimer !== null) return;
  scoutingRefreshTimer = window.setInterval(() => {
    void refreshActiveScouting();
  }, 30000);
}

function syncScoutingSignature(payload) {
  const signature = payload.lobby_signature ?? null;
  if (app.view === "roster" && !app.lobbyScouting.loading) {
    const state = app.lobbyScouting;
    if (signature && signature !== state.signature) {
      void loadLobbyScouting({ silent: true });
    } else if (!signature && state.data?.available && payload.status?.connected) {
      void loadLobbyScouting({ silent: true });
    }
    return;
  }
  if (app.view === "rival-live" && !app.rivalLive.loading) {
    if (!isChampSelectPhase() && isClashContext()) return;
    const state = app.rivalLive;
    if (signature && signature !== state.signature) {
      void loadRivalScouting({ silent: true });
    } else if (!signature && state.data?.available && payload.status?.connected) {
      void loadRivalScouting({ silent: true });
    }
  }
}

export function addLcuChampions(playerId, championIds, comfort = 5) {
  const player = app.state?.roster.players.find((item) => item.id === playerId);
  if (!player) return;
  const unique = [...new Set((championIds ?? []).filter(Boolean))];
  let changed = 0;

  for (const championId of unique) {
    if (!championById(championId)) continue;
    const entry = player.pool.find((item) => item.champion_id === championId);
    if (entry) {
      if (entry.comfort !== comfort) {
        entry.comfort = comfort;
        changed += 1;
      }
      continue;
    }
    player.pool.push({ champion_id: championId, comfort, winrate: null });
    changed += 1;
  }

  if (!changed) {
    toast("Esos campeones ya están en el pool con el mismo comfort.", "info");
    return;
  }

  scheduleSave();
  emit();
  void refresh();
  const noun = changed === 1 ? "campeón" : "campeones";
  const adjective = changed === 1 ? "agregado" : "agregados";
  toast(
    `${changed} ${noun} ${adjective} al pool con comfort ${comfort}.`,
    "success",
  );
}

export function setView(view) {
  if (view === "live" && !app.live.tabVisible) return;
  if (view === "rival-live" && !app.rivalLive.tabVisible) return;
  app.view = view;
  if (
    (view === "history" || view === "settings") &&
    !app.history.store &&
    !app.history.loading
  ) {
    void loadHistory();
  }
  if (view === "clash") {
    void loadClash({ silent: Boolean(app.clash.data) });
    if (!app.clashOverview.data && !app.clashOverview.loading) {
      void loadClashOverview({ force: true });
    }
  }
  if (view === "roster") {
    void loadLobbyScouting({ silent: true });
  }
  if (view === "rival-live") {
    if (!isChampSelectPhase() && isClashContext()) {
      void loadClash({ silent: Boolean(app.clash.data) });
    } else {
      const signature = app.lcu.signature;
      const stale =
        !app.rivalLive.data ||
        !signature ||
        signature !== app.rivalLive.signature;
      if (stale) {
        void loadRivalScouting({ silent: Boolean(app.rivalLive.data) });
      }
    }
  }
  emit();
}

function normalizeHistoryStore(store) {
  return {
    version: store?.version ?? 1,
    matches: Array.isArray(store?.matches) ? store.matches : [],
    name_aliases: Array.isArray(store?.name_aliases) ? store.name_aliases : [],
    updated_at: store?.updated_at ?? null,
  };
}

export async function loadHistory() {
  if (app.history.loading) return;
  app.history.loading = true;
  app.history.error = null;
  emit();
  try {
    app.history.store = normalizeHistoryStore(await api.historyLoad());
  } catch (error) {
    app.history.error = error.message ?? String(error);
    toast(app.history.error, "error");
  } finally {
    app.history.loading = false;
    emit();
    if (app.state?.settings?.use_history && app.history.store) {
      void refresh();
    }
  }
}

async function saveHistoryStore() {
  if (!app.history.store) return;
  app.history.store.updated_at = new Date().toISOString();
  app.history.saving = true;
  emit();
  try {
    const result = await api.historySave(app.history.store);
    app.history.lastSaved = result.path;
    app.history.error = null;
  } catch (error) {
    app.history.error = error.message ?? String(error);
    toast(app.history.error, "error");
  } finally {
    app.history.saving = false;
    emit();
    if (app.state?.settings?.use_history) {
      void refresh();
    }
  }
}

export function setHistoryTab(tab) {
  app.history.tab = tab;
  emit();
}

export function setHistoryFilter(key, value) {
  app.history.filters = {
    ...app.history.filters,
    [key]: key === "minGames" ? Math.max(1, Math.min(20, Number(value) || 3)) : value,
  };
  emit();
}

export function resetHistoryFilters() {
  app.history.filters = emptyHistoryFilters();
  emit();
}

export function setRivalSearch(value) {
  app.history.rivalSearch = value;
  emit();
}

export function setRivalRole(value) {
  app.history.rivalRole = value;
  emit();
}

export function historyMatchById(matchId) {
  return app.history.store?.matches.find((match) => match.id === matchId) ?? null;
}

export function selectHistoryMatch(matchId) {
  app.history.selectedMatchId = matchId;
  emit();
  return historyMatchById(matchId);
}

export async function updateHistoryMatch(matchId, patch) {
  const match = historyMatchById(matchId);
  if (!match) return;
  Object.assign(match, patch);
  await saveHistoryStore();
  emit();
  toast("Partida actualizada.", "success");
}

export async function deleteHistoryMatch(matchId) {
  if (!app.history.store) return;
  const match = historyMatchById(matchId);
  if (!match) return;
  const label = match.legacy_index
    ? `la partida #${String(match.legacy_index).padStart(3, "0")}`
    : "esta partida";
  if (!window.confirm(`¿Eliminar ${label} del historial?`)) return;
  app.history.store.matches = app.history.store.matches.filter(
    (item) => item.id !== matchId,
  );
  app.history.selectedMatchId = null;
  await saveHistoryStore();
  emit();
  toast("Partida eliminada.", "info");
}

export async function importHistoryFile(file) {
  try {
    const text = await file.text();
    if (text.trim().startsWith("{")) {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.matches)) {
        throw new Error("El JSON no tiene una lista de partidas.");
      }
      const importedAt = Date.now();
      const matches = parsed.matches.map((match, index) => ({
        ...match,
        id: match.id ?? `imported-${importedAt}-${index + 1}`,
        source: match.source ?? "manual",
        result: match.result ?? "unknown",
        queue: match.queue ?? "unknown",
        confidence: match.confidence ?? "low",
        rivals: match.rivals ?? [],
        our_bans: match.our_bans ?? [],
        enemy_bans: match.enemy_bans ?? [],
        our_picks: match.our_picks ?? [],
        enemy_picks: match.enemy_picks ?? [],
        notes: match.notes ?? [],
        warnings: match.warnings ?? [],
      }));
      const wins = matches.filter((match) => match.result === "win").length;
      const losses = matches.filter((match) => match.result === "loss").length;
      const preview = {
        matches,
        blocks: [],
        unknown_tokens: [],
        stats: {
          blocks: matches.length,
          matches: matches.length,
          wins,
          losses,
          unknown_results: matches.length - wins - losses,
          rebalanced_picks: 0,
          rebalanced_bans: 0,
          unknown_tokens: 0,
          missing_names: 0,
          fill_players: 0,
        },
      };
      app.history.importPreview = preview;
      app.history.importSource = file.name;
      emit();
      return preview;
    }
    const preview = await api.historyImportLegacy(text);
    app.history.importPreview = preview;
    app.history.importSource = file.name;
    emit();
    return preview;
  } catch (error) {
    toast(error.message ?? "No se pudo leer el archivo.", "error");
    return null;
  }
}

export async function commitHistoryImport(mode = "all") {
  const preview = app.history.importPreview;
  if (!preview) return;
  if (!app.history.store) {
    app.history.store = normalizeHistoryStore(null);
  }
  const incoming = (preview.matches ?? []).filter((match) =>
    mode === "high" ? match.confidence === "high" : true,
  );
  const aliases = app.history.store.name_aliases ?? [];
  for (const match of incoming) {
    for (const rival of match.rivals ?? []) {
      const alias = aliases.find(
        (item) => item.from.toLowerCase() === rival.name.toLowerCase(),
      );
      if (alias) rival.name = alias.to;
    }
  }
  const byId = new Map(app.history.store.matches.map((match) => [match.id, match]));
  for (const match of incoming) {
    byId.set(match.id, match);
  }
  app.history.store.matches = [...byId.values()];
  app.history.importPreview = null;
  app.history.importSource = null;
  app.history.tab = "matches";
  await saveHistoryStore();
  emit();
  toast(
    `Historial importado: ${incoming.length} partidas.${
      mode === "high" ? " Solo se incluyeron las de confianza alta." : ""
    }`,
    "success",
  );
}

export function cancelHistoryImport() {
  app.history.importPreview = null;
  app.history.importSource = null;
  emit();
}

export async function prepareMatchFromDraft() {
  if (!app.state) return null;
  try {
    const match = await api.historyMatchFromDraft(app.state);
    app.history.pendingMatch = match;
    emit();
    return match;
  } catch (error) {
    toast(error.message ?? "No se pudo preparar la partida.", "error");
    return null;
  }
}

export async function confirmPendingMatch({ result, notes }) {
  const match = app.history.pendingMatch;
  if (!match) return;
  if (!app.history.store) {
    app.history.store = normalizeHistoryStore(null);
  }
  match.result = result;
  match.result_note = null;
  match.played_at = new Date().toISOString();
  if (notes?.trim()) {
    match.notes = [...(match.notes ?? []), notes.trim()];
  }
  if (!isCompleteMatch(match) && !match.warnings.includes("Partida guardada con picks o bans incompletos.")) {
    match.warnings = [
      ...(match.warnings ?? []),
      "Partida guardada con picks o bans incompletos.",
    ];
    match.confidence = "medium";
  }
  app.history.store.matches = [match, ...app.history.store.matches];
  app.history.pendingMatch = null;
  app.history.tab = "matches";
  app.view = "history";
  await saveHistoryStore();
  emit();
  toast("Partida guardada en el historial.", "success");
}

export function cancelPendingMatch() {
  app.history.pendingMatch = null;
  emit();
}

export function startRenameRival(name) {
  app.history.renameRival = { from: name, to: name };
  emit();
}

export async function confirmRenameRival(newName) {
  const rename = app.history.renameRival;
  if (!rename || !app.history.store) return;
  const target = newName.trim();
  if (!target) return;
  const oldLower = rename.from.toLowerCase();
  for (const match of app.history.store.matches) {
    for (const rival of match.rivals ?? []) {
      if (rival.name.toLowerCase() === oldLower) {
        rival.name = target;
      }
    }
  }
  const aliases = app.history.store.name_aliases.filter(
    (alias) => alias.from.toLowerCase() !== oldLower,
  );
  aliases.push({ from: rename.from, to: target });
  app.history.store.name_aliases = aliases;
  app.history.renameRival = null;
  await saveHistoryStore();
  emit();
  toast("Rival renombrado.", "success");
}

export function cancelRenameRival() {
  app.history.renameRival = null;
  emit();
}

export async function exportHistory() {
  if (!app.history.store) return;
  if (app.preview) {
    const blob = new Blob([JSON.stringify(app.history.store, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "draft-assist-history.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast("Historial exportado.", "success");
    return;
  }
  try {
    const result = await api.historyExport(app.history.store);
    toast(`Historial exportado en ${result.dir}`, "success");
  } catch (error) {
    toast(error.message ?? "No se pudo exportar el historial.", "error");
  }
}

export async function openHistoryDir() {
  try {
    await api.openHistoryDir();
  } catch (error) {
    toast(error.message ?? "No se pudo abrir la carpeta de historial.", "error");
  }
}

export function undo() {
  if (blockLcuEdit()) return;
  if (!app.undo.length) return;
  app.state.draft = app.undo.pop();
  afterDraftChange();
}

export function startNewDraft({ templateId, side, useExampleRoster }) {
  if (blockLcuEdit()) return;
  if (!app.bootstrap) return;
  const example = app.bootstrap.example_state;
  if (useExampleRoster) {
    app.state.roster = clone(example.roster);
  }
  app.state.draft = {
    version: 1,
    side,
    template_id: templateId,
    step_index: 0,
    our_bans: [],
    enemy_bans: [],
    our_picks: [],
    enemy_picks: [],
    priorities: [],
    current_player_id: null,
    manual: null,
    lcu_turn: null,
  };
  app.undo = [];
  app.view = "draft";
  app.isExample = false;
  afterDraftChange();
  toast("Nuevo draft creado.", "success");
}

export function loadExample() {
  if (blockLcuEdit()) return;
  if (!app.bootstrap) return;
  app.state = clone(app.bootstrap.example_state);
  app.undo = [];
  app.view = "draft";
  app.isExample = true;
  afterDraftChange();
  toast("Ejemplo competitivo cargado.", "success");
}

export function setStepIndex(index) {
  if (blockLcuEdit()) return;
  const template = currentTemplate();
  if (!template) return;
  pushUndo();
  app.state.draft.step_index = Math.max(0, Math.min(template.steps.length, Number(index)));
  app.state.draft.current_player_id = null;
  afterDraftChange();
}

export function setCurrentPlayer(playerId) {
  if (blockLcuEdit()) return;
  app.state.draft.current_player_id = playerId || null;
  afterDraftChange();
}

function validateChampion(championId, side) {
  if (!championById(championId)) {
    toast("Ese campeón no existe en el catálogo.", "error");
    return false;
  }
  const draft = app.state.draft;
  const unavailable = unavailableChampions();
  if (unavailable.has(championId)) {
    toast("Ese campeón ya está baneado o pickeado.", "error");
    return false;
  }
  const maxBans = 5;
  if (side === "our" && draft.our_bans.length >= maxBans) {
    toast("Ya tienes los 5 bans.", "error");
    return false;
  }
  if (side === "enemy" && draft.enemy_bans.length >= maxBans) {
    toast("El rival ya tiene los 5 bans.", "error");
    return false;
  }
  return true;
}

export function recordPick(championId, role = null) {
  if (blockLcuEdit()) return;
  const turn = currentTurn();
  if (!turn || turn.phase !== "PICK") {
    toast("Ahora mismo no toca un pick.", "error");
    return;
  }
  if (unavailableChampions().has(championId)) {
    toast("Ese campeón ya está baneado o pickeado.", "error");
    return;
  }

  pushUndo();
  if (turn.isOurTurn) {
    const player = turn.currentPlayer;
    if (!player) {
      toast("No se pudo determinar el jugador actual. Revisa el orden de picks.", "error");
      app.undo.pop();
      return;
    }
    app.state.draft.our_picks.push({
      player_id: player.id,
      champion_id: championId,
      role: player.role,
    });
  } else {
    const champion = championById(championId);
    app.state.draft.enemy_picks.push({
      champion_id: championId,
      role: role || champion?.roles?.[0] || null,
    });
  }
  advance();
  afterDraftChange();
}

export function recordBan(championId, side = "our") {
  if (blockLcuEdit()) return;
  const turn = currentTurn();
  if (!turn || turn.phase !== "BAN") {
    toast("Ahora mismo no toca un ban.", "error");
    return;
  }
  if (!validateChampion(championId, side)) return;

  pushUndo();
  if (side === "our") {
    app.state.draft.our_bans.push(championId);
  } else {
    app.state.draft.enemy_bans.push(championId);
  }
  advance();
  afterDraftChange();
}

export function togglePriority(need) {
  if (blockLcuEdit()) return;
  pushUndo();
  const priorities = app.state.draft.priorities;
  const index = priorities.indexOf(need);
  if (index >= 0) priorities.splice(index, 1);
  else priorities.push(need);
  afterDraftChange();
}

export function setSettings(partial) {
  app.state.settings = { ...app.state.settings, ...partial };
  if (partial.use_history && !app.history.store) {
    void loadHistory();
  }
  scheduleSave();
  emit();
  void refresh();
}

export function setPickOrder(playerId, direction) {
  const order = [...(app.state.roster.pick_order ?? [])];
  for (const player of app.state.roster.players) {
    if (!order.includes(player.id)) order.push(player.id);
  }
  const index = order.indexOf(playerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  app.state.roster.pick_order = order;
  scheduleSave();
  emit();
  void refresh();
}

export function renamePlayer(playerId, name) {
  const player = app.state.roster.players.find((item) => item.id === playerId);
  if (!player) return;
  player.name = name;
  scheduleSave();
  emit();
  void refresh();
}

export function setPoolComfort(playerId, championId, comfort) {
  const player = app.state.roster.players.find((item) => item.id === playerId);
  const entry = player?.pool.find((item) => item.champion_id === championId);
  if (!entry) return;
  entry.comfort = Math.max(1, Math.min(5, Number(comfort) || 1));
  scheduleSave();
  emit();
  void refresh();
}

export function setPoolWinrate(playerId, championId, winrate) {
  const player = app.state.roster.players.find((item) => item.id === playerId);
  const entry = player?.pool.find((item) => item.champion_id === championId);
  if (!entry) return;
  const value = winrate === "" ? null : Number(winrate);
  entry.winrate = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  scheduleSave();
  emit();
  void refresh();
}

export function addPoolEntry(playerId, championId) {
  const player = app.state.roster.players.find((item) => item.id === playerId);
  if (!player || !championById(championId)) return;
  if (player.pool.some((entry) => entry.champion_id === championId)) {
    toast("Ese campeón ya está en el pool.", "warning");
    return;
  }
  player.pool.push({ champion_id: championId, comfort: 3, winrate: null });
  scheduleSave();
  emit();
  void refresh();
}

export function removePoolEntry(playerId, championId) {
  const player = app.state.roster.players.find((item) => item.id === playerId);
  if (!player) return;
  player.pool = player.pool.filter((entry) => entry.champion_id !== championId);
  scheduleSave();
  emit();
  void refresh();
}

export function exportState() {
  const json = JSON.stringify(app.state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `draft-assist-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast("Estado exportado.", "success");
}

export async function importState(file) {
  if (blockLcuEdit()) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const validation = await api.validateState(parsed);
    if (validation.errors?.length) {
      toast(`No se importó: ${validation.errors[0]}`, "error");
      return;
    }
    app.state = parsed;
    if (app.state?.draft?.lcu_turn) {
      app.state.draft.lcu_turn = null;
    }
    app.undo = [];
    app.view = "draft";
    afterDraftChange();
    toast("Estado importado.", "success");
  } catch (error) {
    toast(`No se pudo importar: ${error.message ?? error}`, "error");
  }
}

export async function reloadData() {
  try {
    const result = await api.reloadData();
    const fresh = await api.bootstrap();
    app.bootstrap = { ...fresh, data: result.data, warnings: result.warnings ?? [] };
    if (result.warnings?.length) {
      toast(result.warnings[0], "warning");
    } else {
      toast("Datos recargados.", "success");
    }
    await refresh();
  } catch (error) {
    toast(error.message ?? "No se pudieron recargar los datos.", "error");
  }
}

export async function openDataDir() {
  try {
    await api.openDataDir();
  } catch (error) {
    toast(error.message ?? "No se pudo abrir la carpeta.", "error");
  }
}
