import {
  app,
  addLcuChampions,
  addPoolEntry,
  cancelHistoryImport,
  cancelPendingMatch,
  cancelRenameRival,
  checkForUpdates,
  commitHistoryImport,
  confirmLiveMatch,
  confirmPendingMatch,
  confirmRenameRival,
  currentTurn,
  deleteHistoryMatch,
  dismissLiveSave,
  dismissUpdate,
  emit,
  exportHistory,
  exportState,
  importHistoryFile,
  importState,
  init,
  installUpdate,
  loadExample,
  loadHistory,
  openDataDir,
  openHistoryDir,
  openLiveSaveDialog,
  prepareMatchFromDraft,
  recordBan,
  recordPick,
  refresh,
  refreshActiveScouting,
  refreshClash,
  refreshLobbyScouting,
  refreshRivalScouting,
  reloadData,
  removePoolEntry,
  renamePlayer,
  resetHistoryFilters,
  selectHistoryMatch,
  setCurrentPlayer,
  setHistoryFilter,
  setHistoryTab,
  setPickOrder,
  setPoolComfort,
  setPoolWinrate,
  setRivalRole,
  setRivalSearch,
  setSettings,
  setStepIndex,
  setView,
  startLcuTracking,
  startNewDraft,
  startRenameRival,
  stopLcuTracking,
  subscribe,
  refreshLcuStatus,
  toast,
  togglePriority,
  undo,
  updateHistoryMatch,
} from "./js/state.js";
import {
  championDialogBody,
  render,
  renderChampionRoleFilter,
  renderEnemyRoleExtra,
  renderHistoryDialogs,
  renderLiveDialogs,
  renderNewDraftOptions,
  renderStepOptions,
  renderUpdateDialog,
} from "./js/render.js";

const picker = {
  mode: "pick",
  side: "our",
  playerId: null,
  role: null,
  search: "",
  roleFilter: "ALL",
};

document.addEventListener("DOMContentLoaded", () => {
  subscribe(render);
  subscribe((view) => {
    if (!view.live?.openSaveDialog || !view.live?.pendingMatch) return;
    renderLiveDialogs(view);
    const dialog = document.getElementById("live-save-dialog");
    if (dialog && !dialog.open) dialog.showModal();
    app.live.openSaveDialog = false;
  });

  document.getElementById("undo-button")?.addEventListener("click", undo);
  bindGlobalEvents();
  const updateDialog = document.getElementById("update-dialog");
  updateDialog?.addEventListener("cancel", (event) => {
    if (app.update.installing) event.preventDefault();
  });
  renderChampionRoleFilter("ALL");
  render(app);
  void init();

  window.addEventListener("focus", () => {
    if (!app.lcu.auto) void refreshLcuStatus();
    void refreshActiveScouting();
  });

  document.getElementById("new-draft-confirm")?.addEventListener("click", confirmNewDraft);
  document.getElementById("step-confirm")?.addEventListener("click", confirmStep);
  document.getElementById("lcu-confirm")?.addEventListener("click", async () => {
    document.getElementById("lcu-dialog")?.close();
    await startLcuTracking();
  });
  document.getElementById("import-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importState(file);
    event.target.value = "";
  });
  document.getElementById("history-import-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const preview = await importHistoryFile(file);
      if (preview) {
        renderHistoryDialogs(app);
        document.getElementById("history-import-dialog")?.showModal();
      }
    }
    event.target.value = "";
  });

  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.closest("[data-champion-avatar]")) {
        return;
      }
      image.hidden = true;
      const fallback = image.nextElementSibling;
      if (fallback) fallback.hidden = false;
    },
    true,
  );
});

function bindGlobalEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleKeydown);

  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      if (dialog.id === "update-dialog" && app.update.installing) return;
      dialog.close();
    });
  }

  document.getElementById("history-import-dialog")?.addEventListener("close", () => {
    if (app.history.importPreview) cancelHistoryImport();
  });
  document.getElementById("history-save-dialog")?.addEventListener("close", () => {
    if (app.history.pendingMatch) cancelPendingMatch();
  });
  document.getElementById("live-save-dialog")?.addEventListener("close", () => {
    if (app.live.openSaveDialog) app.live.openSaveDialog = false;
  });
  document.getElementById("history-rename-dialog")?.addEventListener("close", () => {
    if (app.history.renameRival) cancelRenameRival();
  });
}

function handleClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;

  switch (action) {
    case "view":
      setView(trigger.dataset.view);
      break;
    case "undo":
      undo();
      break;
    case "new-draft":
      openNewDraftDialog();
      break;
    case "load-example":
      if (
        hasDraftProgress() &&
        !window.confirm("Se reemplazará el draft actual por el ejemplo. ¿Continuar?")
      ) {
        break;
      }
      closeDialogs();
      loadExample();
      break;
    case "open-step-dialog":
      openStepDialog();
      break;
    case "close-dialog":
      trigger.closest("dialog")?.close();
      break;
    case "start-lcu":
      openLcuDialog();
      break;
    case "stop-lcu":
      void stopLcuTracking();
      break;
    case "refresh-lcu":
      void refreshLcuStatus();
      break;
    case "refresh-clash":
      void refreshClash();
      break;
    case "refresh-lobby-scouting":
      void refreshLobbyScouting();
      break;
    case "refresh-rival-scouting":
      void refreshRivalScouting();
      break;
    case "lcu-add-champion":
      addLcuChampions(
        trigger.dataset.player,
        [trigger.dataset.champion].filter(Boolean),
        Number(trigger.dataset.comfort) || 5,
      );
      break;
    case "lcu-add-masteries":
      addLcuChampions(
        trigger.dataset.player,
        (trigger.dataset.champions ?? "").split(",").filter(Boolean),
        5,
      );
      break;
    case "history-tab":
      setHistoryTab(trigger.dataset.tab);
      break;
    case "history-import":
      document.getElementById("history-import-file")?.click();
      break;
    case "history-export":
      void exportHistory();
      break;
    case "history-open-dir":
      void openHistoryDir();
      break;
    case "history-retry":
      void loadHistory();
      break;
    case "history-reset-filters":
      resetHistoryFilters();
      break;
    case "history-save-draft":
      void openHistorySaveDialog();
      break;
    case "history-open-match":
      openHistoryMatchDialog(trigger.dataset.match);
      break;
    case "history-delete-match":
      void deleteHistoryMatch(app.history.selectedMatchId);
      document.getElementById("history-match-dialog")?.close();
      break;
    case "history-save-match":
      void saveHistoryMatchEdits();
      break;
    case "history-confirm-save":
      void confirmHistorySave();
      break;
    case "history-import-all":
      void confirmHistoryImport("all");
      break;
    case "history-import-high":
      void confirmHistoryImport("high");
      break;
    case "history-rename-rival":
      openHistoryRenameDialog(trigger.dataset.name);
      break;
    case "live-open-save":
      openLiveSaveDialog();
      break;
    case "live-dismiss-save":
      dismissLiveSave();
      document.getElementById("live-save-dialog")?.close();
      break;
    case "live-confirm-save":
      void (async () => {
        await confirmLiveMatch();
        document.getElementById("live-save-dialog")?.close();
      })();
      break;
    case "history-confirm-rename":
      void confirmHistoryRename();
      break;
    case "history-filter-rival":
      setHistoryFilter("search", trigger.dataset.name);
      setHistoryTab("matches");
      break;
    case "retry":
      void init();
      break;
    case "pick":
      if (trigger.dataset.champion) recordPick(trigger.dataset.champion);
      break;
    case "ban":
      if (trigger.dataset.champion) recordBan(trigger.dataset.champion, "our");
      break;
    case "open-picker":
      openPickerFromTrigger(trigger);
      break;
    case "open-pool-picker":
      openPoolPicker(trigger.dataset.player);
      break;
    case "choose-champion":
      chooseChampion(trigger.dataset.champion);
      break;
    case "filter-role":
      picker.roleFilter = trigger.dataset.role ?? "ALL";
      renderChampionRoleFilter(picker.roleFilter);
      updateChampionGrid();
      break;
    case "toggle-priority":
      togglePriority(trigger.dataset.need);
      break;
    case "move-order":
      setPickOrder(trigger.dataset.player, Number(trigger.dataset.direction));
      break;
    case "remove-pool":
      removePoolEntry(trigger.dataset.player, trigger.dataset.champion);
      break;
    case "set-comfort":
      setPoolComfort(
        trigger.dataset.player,
        trigger.dataset.champion,
        Number(trigger.dataset.comfort),
      );
      break;
    case "export":
      exportState();
      break;
    case "import":
      document.getElementById("import-file")?.click();
      break;
    case "open-data-dir":
      void openDataDir();
      break;
    case "reload-data":
      void reloadData();
      break;
    case "check-update":
      void checkForUpdates();
      break;
    case "open-update-dialog":
      openUpdateDialog();
      break;
    case "install-update":
      void installUpdate();
      break;
    case "dismiss-update":
      dismissUpdate();
      document.getElementById("update-dialog")?.close();
      break;
    case "dismiss-toast":
      app.toasts = app.toasts.filter(
        (toastItem) => String(toastItem.id) !== trigger.dataset.toast,
      );
      emit();
      break;
    default:
      break;
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.id === "current-player-select") {
    setCurrentPlayer(target.value || null);
    return;
  }
  const action = target.dataset.action;
  if (!action) return;

  switch (action) {
    case "set-top-n":
      setSettings({ top_n: Math.max(1, Math.min(10, Number(target.value) || 5)) });
      break;
    case "toggle-pool-precedence":
      setSettings({ pool_precedence: target.checked });
      break;
    case "toggle-offrole-flex":
      setSettings({ allow_offrole_flex: target.checked });
      break;
    case "toggle-use-history":
      setSettings({ use_history: target.checked });
      break;
    case "rename-player":
      renamePlayer(target.dataset.player, target.value.trim() || "Jugador");
      break;
    case "set-winrate":
      setPoolWinrate(target.dataset.player, target.dataset.champion, target.value);
      break;
    case "history-search":
      setHistoryFilter("search", target.value);
      break;
    case "history-filter":
      setHistoryFilter(target.dataset.filter, target.value);
      break;
    case "history-only-complete":
      setHistoryFilter("onlyComplete", target.checked);
      break;
    case "rival-search":
      setRivalSearch(target.value);
      break;
    case "rival-role":
      setRivalRole(target.value);
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.id === "champion-search") {
    picker.search = target.value;
    updateChampionGrid();
  }
}

function handleKeydown(event) {
  const target = event.target;
  const editingText =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "z" &&
    !editingText
  ) {
    event.preventDefault();
    undo();
    return;
  }
  if (event.key === "/" && document.getElementById("champion-dialog")?.open) {
    event.preventDefault();
    document.getElementById("champion-search")?.focus();
  }
}

function openLcuDialog() {
  if (app.preview) {
    toast("El seguimiento LCU solo está disponible en la app de escritorio.", "warning");
    return;
  }
  if (app.lcu.auto) {
    void stopLcuTracking();
    return;
  }
  const dialog = document.getElementById("lcu-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function openUpdateDialog() {
  if (!app.update?.available) {
    toast("No hay actualizaciones disponibles.", "info");
    return;
  }
  renderUpdateDialog(app);
  const dialog = document.getElementById("update-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function openNewDraftDialog() {
  if (app.lcu.auto) {
    toast("Detén el seguimiento LCU para crear otro draft.", "warning");
    return;
  }
  if (!app.bootstrap) return;
  renderNewDraftOptions(app);
  const currentSide = app.state?.draft?.side ?? "BLUE";
  const sideInput = document.querySelector(`input[name="new-side"][value="${currentSide}"]`);
  if (sideInput) sideInput.checked = true;
  const exampleCheckbox = document.getElementById("new-draft-example-roster");
  if (exampleCheckbox) exampleCheckbox.checked = true;
  const dialog = document.getElementById("new-draft-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function confirmNewDraft() {
  const templateId = document.getElementById("new-draft-template")?.value;
  const side =
    document.querySelector('input[name="new-side"]:checked')?.value ?? "BLUE";
  const useExampleRoster =
    document.getElementById("new-draft-example-roster")?.checked ?? true;
  if (!templateId) return;
  startNewDraft({ templateId, side, useExampleRoster });
  document.getElementById("new-draft-dialog")?.close();
}

function openStepDialog() {
  if (app.lcu.auto) {
    toast("Detén el seguimiento LCU para cambiar de turno.", "warning");
    return;
  }
  if (!app.state) return;
  renderStepOptions(app);
  const dialog = document.getElementById("step-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function confirmStep() {
  const value = Number(document.getElementById("step-select")?.value ?? 0);
  setStepIndex(value);
  document.getElementById("step-dialog")?.close();
}

async function openHistorySaveDialog() {
  const match = await prepareMatchFromDraft();
  if (!match) return;
  renderHistoryDialogs(app);
  document.getElementById("history-save-dialog")?.showModal();
}

function openHistoryMatchDialog(matchId) {
  const match = selectHistoryMatch(matchId);
  if (!match) return;
  renderHistoryDialogs(app);
  document.getElementById("history-match-dialog")?.showModal();
}

function openHistoryRenameDialog(name) {
  startRenameRival(name);
  renderHistoryDialogs(app);
  document.getElementById("history-rename-dialog")?.showModal();
}

async function saveHistoryMatchEdits() {
  const matchId = app.history.selectedMatchId;
  if (!matchId) return;
  const result = document.getElementById("history-match-result")?.value ?? "unknown";
  const queue = document.getElementById("history-match-queue")?.value ?? "unknown";
  const side = document.getElementById("history-match-side")?.value ?? "";
  const firstBan = document.getElementById("history-match-first-ban")?.value ?? "";
  const notes = (document.getElementById("history-match-notes")?.value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  await updateHistoryMatch(matchId, {
    result,
    queue,
    side: side || null,
    side_inferred: false,
    first_ban: firstBan || null,
    first_ban_inferred: false,
    notes,
  });
  document.getElementById("history-match-dialog")?.close();
}

async function confirmHistorySave() {
  const result = document.getElementById("history-save-result")?.value ?? "unknown";
  const notes = document.getElementById("history-save-notes")?.value ?? "";
  await confirmPendingMatch({ result, notes });
  document.getElementById("history-save-dialog")?.close();
}

async function confirmHistoryImport(mode) {
  await commitHistoryImport(mode);
  document.getElementById("history-import-dialog")?.close();
}

async function confirmHistoryRename() {
  const name = document.getElementById("history-rename-input")?.value ?? "";
  if (!name.trim()) return;
  await confirmRenameRival(name);
  document.getElementById("history-rename-dialog")?.close();
}

function openPickerFromTrigger(trigger) {
  if (app.lcu.auto) {
    toast("El tablero es de solo lectura durante el seguimiento LCU.", "warning");
    return;
  }
  const { mode, side } = trigger.dataset;
  const turn = currentTurn();
  if (!mode || !side) return;

  if (mode === "pick") {
    if (!turn || turn.phase !== "PICK") {
      toast("Ahora no toca un pick.", "warning");
      return;
    }
    if (side === "our" && !turn.isOurTurn) {
      toast("El turno actual es del rival.", "warning");
      return;
    }
    if (side === "enemy" && turn.isOurTurn) {
      toast("El turno actual es nuestro.", "warning");
      return;
    }
  }

  if (mode === "ban") {
    if (!turn || turn.phase !== "BAN") {
      toast("Ahora no toca un ban.", "warning");
      return;
    }
  }

  const player =
    side === "our" && mode === "pick"
      ? turn?.currentPlayer ?? app.state.roster.players.find((item) => item.id === trigger.dataset.player)
      : null;

  openChampionPicker({
    mode,
    side,
    playerId: player?.id ?? null,
    role: trigger.dataset.role ?? player?.role ?? null,
  });
}

function openPoolPicker(playerId) {
  const player = app.state?.roster.players.find((item) => item.id === playerId);
  if (!player) return;
  openChampionPicker({
    mode: "pool",
    side: "our",
    playerId,
    role: player.role,
  });
}

function openChampionPicker({ mode, side, playerId, role }) {
  picker.mode = mode;
  picker.side = side;
  picker.playerId = playerId;
  picker.role = role;
  picker.search = "";
  picker.roleFilter = "ALL";

  const dialog = document.getElementById("champion-dialog");
  const search = document.getElementById("champion-search");
  const title = document.getElementById("champion-dialog-title");
  if (search) search.value = "";

  if (title) {
    if (mode === "ban") title.textContent = "Banear campeón";
    else if (mode === "pool") title.textContent = "Añadir al pool";
    else if (side === "enemy") title.textContent = "Registrar pick enemigo";
    else title.textContent = "Elegir campeón";
  }

  renderChampionRoleFilter("ALL");
  renderEnemyRoleExtra(picker);
  updateChampionGrid();
  if (dialog && !dialog.open) dialog.showModal();
  window.setTimeout(() => search?.focus(), 40);
}

function updateChampionGrid() {
  if (!app.state) return;
  const body = championDialogBody(app, picker, picker.search, picker.roleFilter);
  const grid = document.getElementById("champion-grid");
  const subtitle = document.getElementById("champion-dialog-subtitle");
  if (grid) grid.innerHTML = body.html;
  if (subtitle) {
    const player = picker.playerId
      ? app.state.roster.players.find((item) => item.id === picker.playerId)
      : currentTurn()?.currentPlayer;
    const where = player ? ` · ${player.name}` : "";
    subtitle.textContent = `${body.count} campeones${where}`;
  }
}

function chooseChampion(championId) {
  if (!championId) return;
  if (app.lcu.auto) {
    toast("Detén el seguimiento LCU para editar el draft.", "warning");
    return;
  }
  const dialog = document.getElementById("champion-dialog");
  if (picker.mode === "pool") {
    addPoolEntry(picker.playerId, championId);
    dialog?.close();
    return;
  }
  if (picker.mode === "ban") {
    recordBan(championId, picker.side);
    dialog?.close();
    return;
  }
  const enemyRole = document.getElementById("enemy-role-select")?.value || null;
  recordPick(championId, enemyRole);
  dialog?.close();
}

function hasDraftProgress() {
  const draft = app.state?.draft;
  if (!draft) return false;
  return (
    draft.our_bans.length > 0 ||
    draft.enemy_bans.length > 0 ||
    draft.our_picks.length > 0 ||
    draft.enemy_picks.length > 0
  );
}

function closeDialogs() {
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    dialog.close();
  }
}
