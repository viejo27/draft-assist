import {
  app,
  currentTemplate,
  currentTurn,
  orderedPlayers,
  championById,
  unavailableChampions,
  isClashContext,
} from "./state.js";
import {
  championAvatar,
  comfortMeter,
  damageLabel,
  escapeHtml,
  formatScore,
  initials,
  roleBadge,
  roleLabel,
  roleShort,
  scoreWidth,
  sideLabel,
  tierClass,
} from "./format.js";
import {
  computeLivePositions,
  formatGameTime,
  layoutLivePositions,
  liveClusterSizes,
  liveResultLabel,
} from "./live.js";
import { matchLobbyMembers, orderEnemyMembers } from "./lobby.js";
import {
  banStarterLabel,
  buildRivalProfiles,
  confidenceLabel,
  computeHistorySummary,
  filterHistoryMatches,
  filterRivalProfiles,
  formatHistoryDate,
  historySideLabel,
  isCompleteMatch,
  queueLabel,
  recordText,
  resultLabel,
  winrateText,
} from "./history.js";

const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

const NEED_OPTIONS = [
  ["frontline", "Frontline"],
  ["engage", "Engage"],
  ["cc", "CC"],
  ["peel", "Peel"],
  ["ap_damage", "Daño AP"],
  ["ad_damage", "Daño AD"],
  ["waveclear", "Waveclear"],
  ["poke", "Poke"],
  ["splitpush", "Splitpush"],
  ["early", "Early"],
  ["scaling", "Escalado"],
  ["anti_tank", "Anti-tanque"],
];

export function render(view) {
  renderTopbar(view);
  renderViewbar(view);

  const root = document.getElementById("view-root");
  if (!root) return;
  if (view.view !== "live") {
    root.dataset.liveSession = "";
  }

  if (view.fatalError) {
    root.innerHTML = fatalState(view.fatalError);
  } else if (view.loading || !view.state) {
    root.innerHTML = loadingState();
  } else if (view.view === "live") {
    const snapshot = view.live?.snapshot;
    if (!snapshot) {
      root.innerHTML = liveEmpty();
    } else if (
      root.querySelector("#live-root") &&
      root.dataset.liveSession === String(view.live.sessionId ?? snapshot.session_id ?? "")
    ) {
      updateLiveView(view);
    } else {
      root.innerHTML = liveView(view);
      root.dataset.liveSession = String(view.live.sessionId ?? snapshot.session_id ?? "");
      updateLiveView(view);
    }
  } else if (view.view === "rival-live") {
    root.innerHTML = rivalLiveView(view);
  } else if (view.view === "roster") {
    root.innerHTML = rosterView(view);
  } else if (view.view === "clash") {
    root.innerHTML = clashView(view);
  } else if (view.view === "history") {
    root.innerHTML = historyView(view);
  } else if (view.view === "settings") {
    root.innerHTML = settingsView(view);
  } else {
    root.innerHTML = draftView(view);
  }

  renderLiveDialogs(view);
  renderHistoryDialogs(view);
  renderUpdateDialog(view);
  renderToasts(view);
}

function renderTopbar(view) {
  const context = document.getElementById("topbar-context");
  const undoButton = document.getElementById("undo-button");
  if (!context) return;

  if (!view.state) {
    context.innerHTML = `<span class="context-muted">Cargando draft…</span>`;
  } else if (view.view === "live") {
    const snapshot = view.live?.snapshot;
    const queue = view.lcu?.status?.queue_name ?? "Partida en vivo";
    context.innerHTML = `
      <span class="context-chip context-live"><span class="live-state-dot ${liveStateClass(view)}"></span>Juego en vivo</span>
      <span class="context-separator"></span>
      <span class="context-chip">${escapeHtml(queue)}</span>
      <span class="context-turn">${formatGameTime(snapshot?.game_time ?? 0)}</span>
      ${snapshot?.ended ? `<span class="live-result-pill ${liveResultTone(snapshot.result)}">${escapeHtml(liveResultLabel(snapshot.result))}</span>` : ""}
      ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
      ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
    `;
  } else if (view.view === "rival-live") {
    if (view.lcu?.status?.phase !== "ChampSelect" && isClashContext(view.lcu?.status)) {
      const opponent = view.clash?.data?.opponent;
      context.innerHTML = `
        <span class="context-chip context-rival"><span class="rival-dot"></span>Rival Live</span>
        <span class="context-separator"></span>
        <span class="context-chip">Clash</span>
        <span class="context-turn">${escapeHtml(opponent?.name ?? "Esperando rival")}</span>
        ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
        ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
      `;
    } else {
      const data = view.rivalLive?.data;
      const members = data?.members ?? [];
      const hidden = members.filter((member) => !member.puuid && !member.summoner_id).length;
      const summary = members.length
        ? hidden
          ? `${members.length} rivales · ${hidden} con identidad oculta`
          : `${members.length} rivales visibles`
        : "Solo lectura";
      context.innerHTML = `
        <span class="context-chip context-rival"><span class="rival-dot"></span>Rival Live</span>
        <span class="context-separator"></span>
        <span class="context-chip">${escapeHtml(data?.queue_name ?? view.lcu?.status?.queue_name ?? "Champ select")}</span>
        <span class="context-turn">${escapeHtml(summary)}</span>
        ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
        ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
      `;
    }
  } else if (view.view === "clash") {
    context.innerHTML = `
      <span class="context-chip">Rival</span>
      <span class="context-separator"></span>
      ${clashHeaderChip(view, true)}
      ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
      ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
    `;
  } else if (view.view === "history") {
    const count = view.history?.store?.matches?.length ?? 0;
    context.innerHTML = `
      <span class="context-chip">Historial</span>
      <span class="context-separator"></span>
      <span class="context-turn">${count} partida${count === 1 ? "" : "s"}</span>
      ${clashHeaderChip(view)}
      ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
      ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
    `;
  } else if (view.view === "roster") {
    const count = view.state.roster?.players?.length ?? 0;
    context.innerHTML = `
      <span class="context-chip">Equipo</span>
      <span class="context-separator"></span>
      <span class="context-turn">${count} jugador${count === 1 ? "" : "es"}</span>
      ${clashHeaderChip(view)}
      ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
      ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
    `;
  } else if (view.view === "settings") {
    context.innerHTML = `
      <span class="context-chip">Ajustes</span>
      ${clashHeaderChip(view)}
      ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
      ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
    `;
  } else {
    const template = currentTemplate();
    const turn = currentTurn();
    context.innerHTML = `
      <span class="context-chip">${escapeHtml(template?.name ?? "Draft")}</span>
      <span class="context-separator"></span>
      <span class="side-indicator ${view.state.draft.side === "BLUE" ? "side-blue" : "side-red"}">
        ${sideLabel(view.state.draft.side)}
      </span>
      <span class="context-turn">${escapeHtml(turn?.label ?? "Draft completo")}</span>
      ${clashHeaderChip(view)}
      ${view.preview ? `<span class="context-chip context-preview">Vista previa</span>` : ""}
      ${view.isExample ? `<span class="context-chip context-example">Ejemplo</span>` : ""}
      ${view.lcu?.auto ? `<span class="context-chip context-auto">AUTO LCU</span>` : ""}
    `;
  }

  const auto = Boolean(view.lcu?.auto);
  if (undoButton) undoButton.disabled = !view.undo?.length || auto;
  for (const action of ["open-step-dialog", "new-draft", "load-example"]) {
    const button = document.querySelector(`.topbar-actions [data-action="${action}"]`);
    if (button) button.disabled = auto;
  }

  const updateButton = document.getElementById("update-button");
  if (updateButton) {
    const update = view.update;
    const visible = Boolean(
      update?.available &&
        update.version &&
        update.version !== update.dismissedVersion,
    );
    updateButton.hidden = !visible;
    const label = document.getElementById("update-button-label");
    if (label && update?.version) {
      label.textContent = `Actualización ${update.version}`;
    }
  }
}

function renderViewbar(view) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view.view);
  });

  const rivalTab = document.getElementById("rival-live-tab");
  if (rivalTab) {
    rivalTab.hidden = !view.rivalLive?.tabVisible;
  }

  const liveTab = document.getElementById("live-tab");
  if (liveTab) {
    liveTab.hidden = !view.live?.tabVisible;
    liveTab.classList.toggle("is-ended", Boolean(view.live?.tabVisible && view.live?.ended));
    liveTab.classList.toggle(
      "is-offline",
      Boolean(view.live?.tabVisible && !view.live?.available),
    );
    liveTab.classList.toggle(
      "is-blinking",
      Boolean(view.live?.tabVisible && view.live?.available && !view.live?.ended),
    );
  }

  renderLcuControl(view);

  const note = document.getElementById("viewbar-note");
  if (!note) return;
  if (view.loading) {
    note.textContent = "";
  } else if (view.view === "live") {
    note.textContent = view.live?.ended
      ? "Partida finalizada"
      : view.live?.available
        ? "Datos en vivo · solo lectura"
        : "Datos detenidos";
  } else if (view.view === "rival-live") {
    if (view.lcu?.status?.phase !== "ChampSelect" && isClashContext(view.lcu?.status)) {
      note.textContent = view.clash?.loading
        ? "Leyendo rival de Clash…"
        : "Rival Live · Clash";
    } else {
      note.textContent = view.rivalLive?.loading
        ? "Leyendo el equipo rival…"
        : "Rival Live · solo lectura";
    }
  } else if (view.preview) {
    note.textContent = "Modo demostración sin backend Tauri";
  } else if (view.lastSaved) {
    note.textContent = "Guardado automático activo";
  } else {
    note.textContent = "Los cambios se guardan en tu equipo";
  }
}

function renderLcuControl(view) {
  const root = document.getElementById("lcu-control");
  if (!root) return;

  if (view.preview) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.hidden = false;
  const status = view.lcu?.status;
  const auto = Boolean(view.lcu?.auto);
  const dot = lcuDotClass(status, auto);
  const label = lcuShortLabel(status, auto);
  const disabled = view.lcu?.starting ? "disabled" : "";

  const dotTitle = auto
    ? "Seguimiento LCU activo"
    : status?.connected
      ? "Cliente detectado; el seguimiento está apagado"
      : "Cliente no detectado";
  root.innerHTML = `
    <span class="lcu-dot ${dot}" title="${dotTitle}"></span>
    <span class="lcu-label">${escapeHtml(label)}</span>
    <button class="button button-small ${auto ? "button-danger-ghost" : "button-ghost"}" type="button"
      data-action="${auto ? "stop-lcu" : "start-lcu"}" ${disabled}>
      ${auto ? "Detener" : "Seguimiento"}
    </button>
  `;
}

function lcuDotClass(status, auto) {
  if (status?.state === "error") return "is-error";
  if (auto) return status?.connected ? "is-on" : "is-waiting";
  if (status?.connected) return "is-idle";
  return "is-off";
}

function lcuShortLabel(status, auto) {
  if (!auto) {
    if (!status) return "LCU";
    if (status.state === "not_found") return "Sin cliente";
    if (status.state === "reconnecting" || status.state === "error") {
      return "Reconectando…";
    }
    return status.connected ? "LCU detectado" : "LCU";
  }

  if (!status) return "Buscando LCU…";
  if (status.state === "not_found") return "Sin cliente";
  if (status.state === "reconnecting" || status.state === "error") return "Reconectando…";
  if (!status.connected) return "Buscando LCU…";
  if (status.phase === "ChampSelect" && status.current_action) {
    return status.current_action.label;
  }
  if (status.phase === "Lobby") {
    return status.queue_name ? `Lobby · ${status.queue_name}` : "Lobby";
  }
  if (status.phase === "InProgress") return "Partida en curso";
  if (status.phase === "EndOfGame") return "Fin de partida";
  return status.queue_name ? `LCU · ${status.queue_name}` : "Seguimiento activo";
}

function loadingState() {
  return `
    <div class="loading-layout" aria-label="Cargando">
      <div class="loading-board skeleton"></div>
      <div class="loading-advice skeleton"></div>
    </div>
  `;
}

function fatalState(message) {
  return `
    <section class="fatal-state">
      <h1>No se pudo cargar el draft</h1>
      <p class="muted">${escapeHtml(message)}</p>
      <button class="button button-primary" type="button" data-action="retry">Reintentar</button>
    </section>
  `;
}

function draftView(view) {
  const draft = view.state.draft;
  const summary = view.response?.summary;
  const turn = currentTurn();
  const template = currentTemplate();
  const completed = (draft.step_index ?? 0) >= (template?.steps?.length ?? Infinity);

  return `
    <div class="draft-layout">
      <div class="board-column">
        ${view.lcu?.auto ? lcuBanner(view) : ""}
        <section class="board-panel" aria-label="Tablero de draft">
          ${teamBlock(view, "enemy", summary)}
          <div class="board-divider">
            <span class="board-divider-line"></span>
            <span class="board-divider-label">${completed ? "Draft completo" : escapeHtml(turn?.label ?? "Turno")}</span>
            <span class="board-divider-line"></span>
          </div>
          ${teamBlock(view, "our", summary)}
        </section>
        ${compositionPanel(view, summary)}
      </div>
      <aside class="advice-column" aria-label="Recomendaciones">
        ${advicePanel(view, turn, completed)}
        ${nextPicksPanel(view)}
      </aside>
    </div>
  `;
}

function lcuBanner(view) {
  const status = view.lcu?.status;
  const label = lcuShortLabel(status, true);
  const detail = status?.current_action
    ? `${status.current_action.seconds_left ?? "—"} s restantes`
    : !status?.connected
      ? "Buscando cliente de League"
      : status?.phase === "Lobby"
        ? "Esperando champ select"
        : "Sincronizando desde el cliente";
  return `
    <div class="lcu-banner" role="status">
      <span class="lcu-dot ${lcuDotClass(status, true)}"></span>
      <div class="lcu-banner-copy">
        <strong>Seguimiento LCU activo</strong>
        <span>${escapeHtml(label)} · ${escapeHtml(detail)} · tablero de solo lectura</span>
      </div>
      ${
        status?.queue_id === 700
          ? `<button class="button button-small button-ghost" type="button" data-action="view" data-view="clash">Ver rival</button>`
          : ""
      }
      <button class="button button-small button-danger-ghost" type="button" data-action="stop-lcu">Detener</button>
    </div>
  `;
}

function liveEmpty() {
  return `
    <section class="live-empty">
      <h1>Juego en vivo</h1>
      <p class="muted">Esperando los datos de la partida en el Live Client Data.</p>
    </section>
  `;
}

function liveStateClass(view) {
  if (!view.live?.available) return "is-offline";
  if (view.live?.ended) return "is-ended";
  return "is-live";
}

function liveStateText(view) {
  if (!view.live?.available) return "Datos detenidos";
  if (view.live?.ended) return "Finalizada";
  return "En vivo";
}

function liveResultTone(result) {
  if (result === "Win" || result === "win") return "is-win";
  if (result === "Lose" || result === "Loss" || result === "loss") return "is-loss";
  return "is-unknown";
}

function liveTeamName(team) {
  return team === "ORDER" ? "Azul" : "Rojo";
}

function liveTeamLabel(team) {
  return team === "ORDER" ? "Equipo azul" : "Equipo rojo";
}

function liveLatestEvent(snapshot) {
  return snapshot?.events?.at(-1) ?? null;
}

function livePingEvent(snapshot) {
  const events = snapshot?.events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].location) return events[index];
  }
  return null;
}

function liveStatsFromPlayers(players, team) {
  return {
    kills: players
      .filter((player) => player.team === team)
      .reduce((total, player) => total + player.kills, 0),
    towers: 0,
    dragons: 0,
    barons: 0,
    heralds: 0,
  };
}

function liveChampionAvatar(player, className) {
  const champion = player.champion_id ? championById(player.champion_id) : null;
  if (champion) return championAvatar(champion, className);
  const label = initials(player.champion_name || player.player_name);
  return `<span class="champion-avatar ${className}"><span class="champion-avatar-fallback">${escapeHtml(label)}</span></span>`;
}

function liveObjectives(stats) {
  const value = stats ?? {};
  return [
    ["Torres", value.towers ?? 0],
    ["Dragones", value.dragons ?? 0],
    ["Barones", value.barons ?? 0],
    ["Heraldos", value.heralds ?? 0],
  ]
    .map(
      ([label, count]) =>
        `<span class="live-objective"><span>${label}</span><b>${count}</b></span>`,
    )
    .join("");
}

function livePlayerRow(player) {
  const role = player.role ? roleShort(player.role) : player.position || "—";
  return `
    <div class="live-player-row ${player.is_dead ? "is-dead" : ""} ${player.is_active ? "is-active" : ""}" data-live-player="${escapeHtml(player.key)}">
      ${liveChampionAvatar(player, "live-player-avatar")}
      <span class="live-player-identity">
        <strong>${escapeHtml(player.player_name)}${player.is_active ? `<span class="live-you">TÚ</span>` : ""}</strong>
        <span>${escapeHtml(player.champion_name)} · ${escapeHtml(role)}</span>
      </span>
      <span class="live-player-kda" data-live-kda>${player.kills} / ${player.deaths} / ${player.assists}</span>
      <span class="live-player-cs" data-live-cs>${player.creep_score} CS</span>
      <span class="live-player-level" data-live-level>Nv ${player.level}</span>
    </div>
  `;
}

function liveTeamPanel(snapshot, team, label, sideKey) {
  const players = snapshot.players.filter((player) => player.team === team);
  const stats =
    (sideKey === "our" ? snapshot.our_stats : snapshot.enemy_stats) ??
    liveStatsFromPlayers(snapshot.players, team);
  return `
    <section class="live-team-panel live-team-${sideKey}">
      <header class="live-team-head">
        <div class="live-team-id">
          <span class="live-team-dot ${team === "ORDER" ? "is-blue" : "is-red"}"></span>
          <div>
            <strong>${escapeHtml(label)}</strong>
            <span class="muted">${liveTeamName(team)}</span>
          </div>
        </div>
        <span class="live-team-kills" data-live-team-total="${sideKey}">${stats.kills} kills</span>
      </header>
      <div class="live-objectives" data-live-team-objectives="${sideKey}">
        ${liveObjectives(stats)}
      </div>
      <div class="live-player-list">
        ${players.map((player) => livePlayerRow(player)).join("")}
      </div>
    </section>
  `;
}

function liveToken(player, position, clusterSize) {
  const role = player.role ? roleShort(player.role) : player.position || "";
  return `
    <span class="live-token ${player.team === "ORDER" ? "is-blue" : "is-red"} ${player.is_dead ? "is-dead" : ""} ${player.is_active ? "is-active" : ""} ${clusterSize > 1 ? "is-clustered" : ""}"
      data-live-token="${escapeHtml(player.key)}"
      style="--x:${position.x};--y:${position.y}"
      title="${escapeHtml(`${player.player_name} · ${player.champion_name} · ${player.kills}/${player.deaths}/${player.assists}`)}">
      <span class="live-token-avatar">${liveChampionAvatar(player, "live-token-img")}</span>
      <span class="live-token-role">${escapeHtml(role)}</span>
      <span class="live-token-name">${escapeHtml(player.player_name)}</span>
      <span class="live-token-dead">MUERTO</span>
    </span>
  `;
}

function liveEventStrip(snapshot) {
  const latest = liveLatestEvent(snapshot);
  if (!latest) return `<span class="muted">Esperando el primer evento…</span>`;
  return `
    <span class="live-event-time">${formatGameTime(latest.time)}</span>
    <strong>${escapeHtml(latest.text)}</strong>
  `;
}

function liveResultBanner(snapshot) {
  return `
    <div class="live-result-banner ${liveResultTone(snapshot.result)}">
      <strong>${escapeHtml(liveResultLabel(snapshot.result))}</strong>
      <span>Partida finalizada · ${formatGameTime(snapshot.duration_seconds)}</span>
    </div>
  `;
}

function liveSaveCallout(view) {
  const snapshot = view.live?.snapshot;
  if (!snapshot?.ended) return "";
  if (view.live.sessionQueueId !== 700) {
    return `<div class="live-end-note">Partida finalizada. El guardado en el historial solo está disponible para Clash.</div>`;
  }
  if (view.live.saved) {
    return `
      <div class="live-save-callout is-saved">
        <strong>Partida guardada</strong>
        <span>Ya está en el historial local.</span>
      </div>
    `;
  }
  return `
    <div class="live-save-callout">
      <div class="live-save-copy">
        <strong>${view.live.pendingMatch ? "Partida pendiente de guardar" : "Partida Clash finalizada"}</strong>
        <span>${escapeHtml(liveResultLabel(snapshot.result))} · ${formatGameTime(snapshot.duration_seconds)}</span>
      </div>
      <div class="live-save-actions">
        <button class="button button-primary button-small" type="button" data-action="live-open-save">Guardar en historial</button>
      </div>
    </div>
  `;
}

function liveEventFeed(snapshot) {
  const events = (snapshot.events ?? []).slice(-8).reverse();
  const rows = events
    .map(
      (event, index) => `
        <li class="${index === 0 ? "is-current" : ""}">
          <span class="live-event-row-time">${formatGameTime(event.time)}</span>
          <span>${escapeHtml(event.text)}</span>
        </li>
      `,
    )
    .join("");
  return `
    <section class="live-events-panel">
      <header class="panel-head">
        <div>
          <h2>Últimos eventos</h2>
          <p class="muted" id="live-event-count">${events.length} eventos recientes</p>
        </div>
      </header>
      <ol class="live-event-list" id="live-event-list" data-event-id="${events[0]?.id ?? ""}">
        ${rows || `<li class="muted">Sin eventos todavía.</li>`}
      </ol>
    </section>
  `;
}

function liveView(view) {
  const snapshot = view.live.snapshot;
  const ourTeam = snapshot.our_team ?? "ORDER";
  const enemyTeam = ourTeam === "ORDER" ? "CHAOS" : "ORDER";
  const ourLabel = snapshot.our_team ? "Nosotros" : "Equipo azul";
  const enemyLabel = snapshot.our_team ? "Rival" : "Equipo rojo";
  const ourStats =
    snapshot.our_stats ?? liveStatsFromPlayers(snapshot.players, ourTeam);
  const enemyStats =
    snapshot.enemy_stats ?? liveStatsFromPlayers(snapshot.players, enemyTeam);
  const rawPositions = computeLivePositions(snapshot.players, snapshot.events);
  const clusterSizes = liveClusterSizes(rawPositions);
  const positions = layoutLivePositions(rawPositions);
  const tokens = snapshot.players
    .map((player) =>
      liveToken(
        player,
        positions.get(player.key) ?? { x: 50, y: 50 },
        clusterSizes.get(player.key) ?? 1,
      ),
    )
    .join("");
  const ping = livePingEvent(snapshot);
  const queue = view.lcu?.status?.queue_name ?? "Partida en vivo";

  return `
    <div class="live-root" id="live-root" data-session="${escapeHtml(snapshot.session_id ?? "")}">
      <header class="live-head">
        <div class="live-head-copy">
          <h1>Juego en vivo</h1>
          <p class="live-head-meta">
            <span class="live-state-chip ${liveStateClass(view)}" id="live-state-chip">
              <span class="live-state-dot"></span>
              <span id="live-state-text">${liveStateText(view)}</span>
            </span>
            <span class="live-head-sep">·</span>
            <span>${escapeHtml(queue)}</span>
            <span class="live-head-sep">·</span>
            <span>${escapeHtml(liveTeamLabel(ourTeam))} vs ${escapeHtml(liveTeamLabel(enemyTeam))}</span>
          </p>
        </div>
        <div class="live-scoreline" aria-label="Marcador">
          <span class="live-score-team is-our">${escapeHtml(ourLabel)}</span>
          <span class="live-score-value" id="live-our-kills">${ourStats.kills}</span>
          <span class="live-score-sep">—</span>
          <span class="live-score-value" id="live-enemy-kills">${enemyStats.kills}</span>
          <span class="live-score-team">${escapeHtml(enemyLabel)}</span>
        </div>
        <div class="live-head-clock">
          <span class="field-label">Tiempo</span>
          <strong id="live-clock">${formatGameTime(snapshot.game_time)}</strong>
        </div>
      </header>
      <div id="live-result-slot" data-state="${snapshot.ended ? String(snapshot.result ?? "unknown") : ""}">
        ${snapshot.ended ? liveResultBanner(snapshot) : ""}
      </div>
      <div class="live-layout">
        <section class="live-map-panel">
          <div class="live-map" id="live-map" role="img" aria-label="Mapa de la Grieta con la posición estimada de los campeones" style="background-image:url('assets/map/map11.png')">
            <div class="live-map-ping" id="live-map-ping" ${ping ? `style="left:${ping.location.x}%;top:${ping.location.y}%" data-event-id="${ping.id}"` : "hidden"}>
              ${ping ? `<span class="live-map-ping-label">${escapeHtml(ping.location.label)}</span>` : ""}
            </div>
            ${tokens}
          </div>
          <div class="live-event-strip" id="live-event-strip" aria-live="polite" data-event-id="${liveLatestEvent(snapshot)?.id ?? ""}">
            ${liveEventStrip(snapshot)}
          </div>
          <p class="live-map-footnote">Posiciones estimadas por evento. El Live Client Data no expone coordenadas de los campeones.</p>
        </section>
        <aside class="live-side">
          <div id="live-save-slot" data-state="${snapshot.ended}:${view.live.sessionQueueId}:${view.live.saved}:${Boolean(view.live.pendingMatch)}">
            ${liveSaveCallout(view)}
          </div>
          ${liveTeamPanel(snapshot, ourTeam, ourLabel, "our")}
          ${liveTeamPanel(snapshot, enemyTeam, enemyLabel, "enemy")}
          ${liveEventFeed(snapshot)}
        </aside>
      </div>
    </div>
  `;
}

function updateLiveView(view) {
  const snapshot = view.live?.snapshot;
  const root = document.getElementById("live-root");
  if (!snapshot || !root) return;

  const ourTeam = snapshot.our_team ?? "ORDER";
  const enemyTeam = ourTeam === "ORDER" ? "CHAOS" : "ORDER";
  const ourStats =
    snapshot.our_stats ?? liveStatsFromPlayers(snapshot.players, ourTeam);
  const enemyStats =
    snapshot.enemy_stats ?? liveStatsFromPlayers(snapshot.players, enemyTeam);

  root.classList.toggle("is-offline", snapshot.available === false);
  const stateChip = root.querySelector("#live-state-chip");
  if (stateChip) {
    stateChip.className = `live-state-chip ${liveStateClass(view)}`;
    const stateText = stateChip.querySelector("#live-state-text");
    if (stateText) stateText.textContent = liveStateText(view);
  }

  const clock = root.querySelector("#live-clock");
  if (clock) clock.textContent = formatGameTime(snapshot.game_time);
  const ourKills = root.querySelector("#live-our-kills");
  if (ourKills) ourKills.textContent = String(ourStats.kills);
  const enemyKills = root.querySelector("#live-enemy-kills");
  if (enemyKills) enemyKills.textContent = String(enemyStats.kills);

  const rawPositions = computeLivePositions(snapshot.players, snapshot.events);
  const clusterSizes = liveClusterSizes(rawPositions);
  const positions = layoutLivePositions(rawPositions);
  const tokens = new Map(
    [...root.querySelectorAll("[data-live-token]")].map((element) => [
      element.dataset.liveToken,
      element,
    ]),
  );
  for (const player of snapshot.players) {
    const token = tokens.get(player.key);
    const position = positions.get(player.key);
    if (!token || !position) continue;
    token.style.setProperty("--x", position.x);
    token.style.setProperty("--y", position.y);
    token.classList.toggle("is-dead", Boolean(player.is_dead));
    token.classList.toggle("is-active", Boolean(player.is_active));
    token.classList.toggle("is-clustered", (clusterSizes.get(player.key) ?? 1) > 1);
  }

  const ping = livePingEvent(snapshot);
  const pingElement = root.querySelector("#live-map-ping");
  if (pingElement) {
    if (!ping || snapshot.available === false) {
      pingElement.hidden = true;
    } else {
      pingElement.hidden = false;
      pingElement.style.left = `${ping.location.x}%`;
      pingElement.style.top = `${ping.location.y}%`;
      const label = pingElement.querySelector(".live-map-ping-label");
      if (label) label.textContent = ping.location.label;
      if (pingElement.dataset.eventId !== String(ping.id)) {
        pingElement.dataset.eventId = String(ping.id);
        pingElement.classList.remove("is-pulsing");
        void pingElement.offsetWidth;
        pingElement.classList.add("is-pulsing");
      }
    }
  }

  const latest = liveLatestEvent(snapshot);
  const strip = root.querySelector("#live-event-strip");
  if (strip && strip.dataset.eventId !== String(latest?.id ?? "")) {
    strip.dataset.eventId = String(latest?.id ?? "");
    strip.innerHTML = liveEventStrip(snapshot);
  }

  const rows = new Map(
    [...root.querySelectorAll("[data-live-player]")].map((element) => [
      element.dataset.livePlayer,
      element,
    ]),
  );
  updateLiveTeamPanel(root, snapshot, ourTeam, "our", rows);
  updateLiveTeamPanel(root, snapshot, enemyTeam, "enemy", rows);

  const resultSlot = root.querySelector("#live-result-slot");
  if (resultSlot) {
    const key = snapshot.ended ? String(snapshot.result ?? "unknown") : "";
    if (resultSlot.dataset.state !== key) {
      resultSlot.dataset.state = key;
      resultSlot.innerHTML = snapshot.ended ? liveResultBanner(snapshot) : "";
    }
  }

  const saveSlot = root.querySelector("#live-save-slot");
  if (saveSlot) {
    const key = `${snapshot.ended}:${view.live.sessionQueueId}:${view.live.saved}:${Boolean(view.live.pendingMatch)}`;
    if (saveSlot.dataset.state !== key) {
      saveSlot.dataset.state = key;
      saveSlot.innerHTML = liveSaveCallout(view);
    }
  }

  const feed = root.querySelector("#live-event-list");
  if (feed) {
    const key = String(latest?.id ?? "");
    if (feed.dataset.eventId !== key) {
      feed.dataset.eventId = key;
      const events = (snapshot.events ?? []).slice(-8).reverse();
      const count = root.querySelector("#live-event-count");
      if (count) count.textContent = `${events.length} eventos recientes`;
      feed.innerHTML = events.length
        ? events
            .map(
              (event, index) => `
                <li class="${index === 0 ? "is-current" : ""}">
                  <span class="live-event-row-time">${formatGameTime(event.time)}</span>
                  <span>${escapeHtml(event.text)}</span>
                </li>
              `,
            )
            .join("")
        : `<li class="muted">Sin eventos todavía.</li>`;
    }
  }
}

function updateLiveTeamPanel(root, snapshot, team, sideKey, rows) {
  const stats =
    (sideKey === "our" ? snapshot.our_stats : snapshot.enemy_stats) ??
    liveStatsFromPlayers(snapshot.players, team);
  const total = root.querySelector(`[data-live-team-total="${sideKey}"]`);
  if (total) total.textContent = `${stats.kills} kills`;
  const objectives = root.querySelector(
    `[data-live-team-objectives="${sideKey}"]`,
  );
  if (objectives) objectives.innerHTML = liveObjectives(stats);

  for (const player of snapshot.players.filter((item) => item.team === team)) {
    const row = rows.get(player.key);
    if (!row) continue;
    row.classList.toggle("is-dead", Boolean(player.is_dead));
    row.classList.toggle("is-active", Boolean(player.is_active));
    const kda = row.querySelector("[data-live-kda]");
    if (kda) {
      kda.textContent = `${player.kills} / ${player.deaths} / ${player.assists}`;
    }
    const cs = row.querySelector("[data-live-cs]");
    if (cs) cs.textContent = `${player.creep_score} CS`;
    const level = row.querySelector("[data-live-level]");
    if (level) level.textContent = `Nv ${player.level}`;
  }
}

function liveSaveStatRow(stat) {
  const champion = championById(stat.champion_id);
  const avatar = champion
    ? championAvatar(champion, "live-save-avatar")
    : `<span class="champion-avatar live-save-avatar"><span class="champion-avatar-fallback">${escapeHtml(initials(stat.player_name ?? stat.champion_id))}</span></span>`;
  return `
    <div class="live-save-stat-row">
      ${avatar}
      <span class="live-save-stat-identity">
        <strong>${escapeHtml(stat.player_name ?? champion?.name ?? stat.champion_id)}</strong>
        <span class="muted">${escapeHtml(champion?.name ?? stat.champion_id)} · ${escapeHtml(stat.role ? roleShort(stat.role) : "—")}</span>
      </span>
      <span class="live-save-kda">${stat.kills} / ${stat.deaths} / ${stat.assists}</span>
      <span class="live-save-cs">${stat.creep_score} CS · ${Math.round(stat.ward_score ?? 0)} visión</span>
      <span class="live-save-level">Nv ${stat.level}</span>
    </div>
  `;
}

export function renderLiveDialogs(view) {
  const dialog = document.getElementById("live-save-dialog");
  const body = document.getElementById("live-save-body");
  if (!body) return;
  if (dialog?.open) return;

  const match = view.live?.pendingMatch;
  if (!match) {
    body.innerHTML = "";
    return;
  }

  const ourStats = match.our_stats ?? {};
  const enemyStats = match.enemy_stats ?? {};
  const stats = match.player_stats ?? [];
  const our = stats.filter((stat) => stat.team === "our");
  const enemy = stats.filter((stat) => stat.team === "enemy");
  const bans = [...(match.our_bans ?? []), ...(match.enemy_bans ?? [])];
  const tone =
    match.result === "win"
      ? "is-win"
      : match.result === "loss"
        ? "is-loss"
        : "is-unknown";

  body.innerHTML = `
    <div class="live-save-headline">
      <span class="live-result-pill ${tone}">${escapeHtml(resultLabel(match.result))}</span>
      <span class="muted">${escapeHtml(queueLabel(match.queue))} · ${escapeHtml(historySideLabel(match.side))} · ${formatGameTime(match.duration_seconds ?? 0)}</span>
    </div>
    <div class="live-save-score">
      <div>
        <span class="field-label">Nosotros</span>
        <strong>${ourStats.kills ?? 0}</strong>
        <span class="muted">kills · ${ourStats.towers ?? 0} torres · ${ourStats.dragons ?? 0} dragones</span>
      </div>
      <div>
        <span class="field-label">Rival</span>
        <strong>${enemyStats.kills ?? 0}</strong>
        <span class="muted">kills · ${enemyStats.towers ?? 0} torres · ${enemyStats.dragons ?? 0} dragones</span>
      </div>
    </div>
    <div class="history-detail-section">
      <h3>Estadísticas</h3>
      <div class="live-save-teams">
        <div>
          <p class="field-label">Nosotros</p>
          <div class="live-save-stats">${our.map(liveSaveStatRow).join("") || `<p class="muted">Sin datos.</p>`}</div>
        </div>
        <div>
          <p class="field-label">Rival</p>
          <div class="live-save-stats">${enemy.map(liveSaveStatRow).join("") || `<p class="muted">Sin datos.</p>`}</div>
        </div>
      </div>
    </div>
    ${
      bans.length
        ? `<p class="muted">Bans: ${historyChampionInline(bans)}</p>`
        : `<p class="notice">No se pudieron recuperar los bans del Live Client Data.</p>`
    }
    ${
      match.warnings?.length
        ? `<div class="notice-list">${match.warnings
            .map((warning) => `<p class="notice">${escapeHtml(warning)}</p>`)
            .join("")}</div>`
        : ""
    }
    <p class="callout">Se guardarán resultado, picks y estadísticas en el historial local. Podrás corregir el resultado o las notas después.</p>
  `;
}

function teamBlock(view, sideKey, summary) {
  const draft = view.state.draft;
  const ourSide = sideKey === "our";
  const side = ourSide ? draft.side : otherSide(draft.side);
  const picks = ourSide ? draft.our_picks : draft.enemy_picks;
  const bans = ourSide ? draft.our_bans : draft.enemy_bans;
  const picksByRole = ourSide ? ourPicksByRole(draft) : enemyPicksByRole(draft);
  const players = orderedPlayers();
  const turn = currentTurn();
  const auto = Boolean(view.lcu?.auto);
  const pickSlots = ROLES.map((role) => {
    const player = players.find((item) => item.role === role);
    const pick = picksByRole[role];
    const champion = pick ? championById(pick.champion_id) : null;
    const current =
      ourSide &&
      turn?.phase === "PICK" &&
      turn.isOurTurn &&
      turn.currentPlayer?.role === role;
    return championSlot({
      sideKey,
      side,
      role,
      champion,
      pick,
      player,
      current: current && !champion,
      canAdd:
        !auto &&
        ourSide &&
        turn?.phase === "PICK" &&
        turn.isOurTurn &&
        turn.currentPlayer?.role === role &&
        !champion,
      comfort: ourSide && player && champion
        ? comfortFor(player, champion.id)
        : null,
    });
  }).join("");

  const banSlots = Array.from({ length: 5 }, (_, index) => {
    const champion = bans[index] ? championById(bans[index]) : null;
    return banSlot({
      sideKey,
      side,
      index,
      champion,
      canAdd: !auto && canBan(view, sideKey),
    });
  }).join("");

  const label = ourSide ? "Nuestro equipo" : "Equipo rival";
  const sublabel = ourSide
    ? `${picks.length}/5 picks`
    : `${picks.length}/5 picks registrados`;

  return `
    <section class="team-block ${ourSide ? "team-our" : "team-enemy"}">
      <header class="team-head">
        <div class="team-id">
          <span class="side-tag ${side === "BLUE" ? "side-blue" : "side-red"}">${sideLabel(side)}</span>
          <h2>${label}</h2>
        </div>
        <div class="team-meta">
          <span>${sublabel}</span>
          <span class="team-meta-sep"></span>
          <span>${bans.length}/5 bans</span>
        </div>
      </header>
      <div class="champion-row">${pickSlots}</div>
      <div class="ban-row">
        <span class="row-label">Bans</span>
        <div class="ban-slots">${banSlots}</div>
      </div>
    </section>
  `;
}

function otherSide(side) {
  return side === "BLUE" ? "RED" : "BLUE";
}

function ourPicksByRole(draft) {
  const result = {};
  for (const role of ROLES) {
    const pick = draft.our_picks.find((item) => item.role === role);
    if (pick) result[role] = pick;
  }
  return result;
}

function enemyPicksByRole(draft) {
  const remaining = [...draft.enemy_picks];
  const result = {};

  for (const role of ROLES) {
    const index = remaining.findIndex((pick) => pick.role === role);
    if (index >= 0) {
      result[role] = remaining.splice(index, 1)[0];
    }
  }

  for (const role of ROLES) {
    if (result[role]) continue;
    const index = remaining.findIndex((pick) => {
      const champion = championById(pick.champion_id);
      return champion?.roles?.includes(role);
    });
    if (index >= 0) {
      result[role] = remaining.splice(index, 1)[0];
    }
  }

  for (const role of ROLES) {
    if (!result[role] && remaining.length) {
      result[role] = remaining.shift();
    }
  }

  return result;
}

function comfortFor(player, championId) {
  return player?.pool?.find((entry) => entry.champion_id === championId)?.comfort ?? null;
}

function championSlot({ sideKey, side, role, champion, pick, player, current, canAdd, comfort }) {
  if (champion) {
    const playerName = sideKey === "our" ? player?.name ?? "Jugador" : "Rival";
    return `
      <article class="champion-slot is-filled ${sideKey === "our" ? "is-our" : "is-enemy"}">
        <div class="slot-topline">
          ${roleBadge(role)}
          <span class="slot-player">${escapeHtml(playerName)}</span>
        </div>
        <div class="slot-champion">
          ${championAvatar(champion, "slot-avatar")}
          <div class="slot-name-wrap">
            <span class="slot-name">${escapeHtml(champion.name)}</span>
            <span class="slot-sub">${damageLabel(champion.damage)}</span>
          </div>
        </div>
        <div class="slot-footer">
          ${comfort ? comfortMeter(comfort) : `<span class="slot-sub">${escapeHtml(roleLabel(role))}</span>`}
        </div>
      </article>
    `;
  }

  const action = canAdd ? `data-action="open-picker" data-mode="pick" data-side="${sideKey}" data-role="${role}"` : "";
  const disabledClass = canAdd ? "is-empty is-actionable" : "is-empty";
  return `
    <button class="champion-slot ${disabledClass} ${current ? "is-current" : ""}" type="button" ${action}>
      ${canAdd ? `<span class="sr-only">Elegir campeón</span>` : ""}
      <span class="slot-topline">
        ${roleBadge(role)}
        <span class="slot-player">${sideKey === "our" ? escapeHtml(player?.name ?? "Jugador") : "Rival"}</span>
      </span>
      <span class="slot-empty-mark">${canAdd ? "+" : "—"}</span>
      <span class="slot-footer">
        <span class="slot-sub">${current ? "Turno actual" : canAdd ? "Elegir" : "Sin pick"}</span>
        ${sideKey === "our" && player ? `<span class="slot-sub">${player.pool?.length ?? 0} en pool</span>` : ""}
      </span>
    </button>
  `;
}

function banSlot({ sideKey, side, index, champion, canAdd }) {
  if (champion) {
    return `
      <span class="ban-slot is-filled" title="${escapeHtml(champion.name)}">
        ${championAvatar(champion, "ban-avatar")}
      </span>
    `;
  }
  return `
    <button class="ban-slot is-empty ${canAdd ? "is-actionable" : ""}" type="button"
      ${canAdd ? `data-action="open-picker" data-mode="ban" data-side="${sideKey}"` : ""}
      aria-label="Añadir ban ${sideLabel(side)} ${index + 1}">
      ${canAdd ? "+" : ""}
    </button>
  `;
}

function canBan(view, sideKey) {
  const turn = currentTurn();
  if (!turn || turn.phase !== "BAN") return false;
  const draft = view.state.draft;
  const bans = sideKey === "our" ? draft.our_bans : draft.enemy_bans;
  if (bans.length >= 5) return false;
  if (turn.simultaneousBan) return true;
  const side = sideKey === "our" ? draft.side : otherSide(draft.side);
  return turn.actingSide === side;
}

function compositionPanel(view, summary) {
  if (!summary) {
    return `<section class="composition-panel"><p class="muted">Calculando composición…</p></section>`;
  }
  if ((view.state.draft.our_picks?.length ?? 0) === 0) {
    return `
      <section class="composition-panel composition-empty" aria-label="Composición aliada">
        <div class="composition-empty-copy">
          <h2>Sin picks aliados todavía</h2>
          <p class="muted">Cuando registres los primeros picks verás el reparto AD/AP, el arquetipo y las carencias.</p>
        </div>
        <div class="priority-block">
          <span class="field-label">Prioridades del equipo</span>
          <div class="tag-row tag-row-tight">${priorityChips(view.state.draft.priorities ?? [], view.lcu?.auto)}</div>
        </div>
      </section>
    `;
  }
  const damage = summary.composition.damage_split;
  const physical = Math.round(damage.physical * 100);
  const magic = Math.round(damage.magic * 100);
  const needs = summary.composition.needs ?? [];
  const priorities = view.state.draft.priorities ?? [];

  return `
    <section class="composition-panel" aria-label="Composición aliada">
      <header class="panel-head">
        <div>
          <h2>${escapeHtml(summary.composition.archetype_label)}</h2>
        </div>
        <div class="damage-legend">
          <span class="damage-key damage-ad">AD ${physical}%</span>
          <span class="damage-key damage-ap">AP ${magic}%</span>
        </div>
      </header>
      <div class="damage-bar" role="img" aria-label="Reparto de daño: ${physical}% AD, ${magic}% AP">
        <span class="damage-bar-ad" style="width:${physical}%"></span>
        <span class="damage-bar-ap" style="width:${magic}%"></span>
      </div>
      <div class="composition-body">
        <div class="need-block">
          <span class="field-label">Carencias detectadas</span>
          <div class="tag-row">
            ${
              needs.length
                ? needs.map((need) => `<span class="need-chip severity-${severityClass(need.severity)}">${escapeHtml(need.label)}<i>${Math.round(need.severity * 100)}</i></span>`).join("")
                : `<span class="muted">Sin carencias críticas por ahora.</span>`
            }
          </div>
        </div>
        <div class="priority-block">
          <span class="field-label">Prioridades del equipo</span>
          <div class="tag-row tag-row-tight">${priorityChips(priorities, view.lcu?.auto)}</div>
        </div>
      </div>
    </section>
  `;
}

function priorityChips(priorities, disabled = false) {
  return NEED_OPTIONS.map(([id, label]) => `
    <button type="button" class="priority-chip ${priorities.includes(id) ? "is-on" : ""}" aria-pressed="${priorities.includes(id)}" data-action="toggle-priority" data-need="${id}" ${disabled ? "disabled" : ""}>
      ${label}
    </button>
  `).join("");
}

function severityClass(severity) {
  if (severity >= 0.7) return "high";
  if (severity >= 0.4) return "mid";
  return "low";
}

function advicePanel(view, turn, completed) {
  if (view.lcu?.auto) {
    return lcuAdvicePanel(view, turn, completed);
  }

  const response = view.response;
  const recs = response?.recommendations ?? [];
  const warnings = view.warnings ?? [];
  const player = turn?.currentPlayer;
  const draft = view.state.draft;

  if (completed) {
    return `
      <section class="advice-panel">
        <header class="advice-head">
          <h2>Los diez picks están cerrados</h2>
          <p class="muted">Puedes revisar la composición, exportar el estado o empezar otro draft.</p>
        </header>
        <div class="empty-advice">
          <p>El motor no genera más recomendaciones.</p>
          <div class="inline-actions">
            <button class="button button-primary" data-action="new-draft" type="button">Nuevo draft</button>
            <button class="button button-ghost" data-action="load-example" type="button">Cargar ejemplo</button>
          </div>
        </div>
      </section>
    `;
  }

  const banPhase = turn?.phase === "BAN";
  const ourTurn = turn?.isOurTurn;
  const isEnemyTurn = turn && !turn.isOurTurn;
  const simultaneousBan = Boolean(turn?.simultaneousBan);
  const bansComplete = draft.our_bans.length >= 5 && draft.enemy_bans.length >= 5;
  const banPhaseBlocked = banPhase && simultaneousBan && bansComplete;
  const ourBansDone = banPhase && simultaneousBan && draft.our_bans.length >= 5;
  const title = banPhase
    ? ourBansDone
      ? "Tus bans están completos"
      : "Objetivos de ban"
    : isEnemyTurn
      ? "Turno del rival"
      : player
        ? `${player.name} · ${roleLabel(player.role)}`
        : "Turno de pick";

  const subtitle = banPhase
    ? simultaneousBan
      ? `${draft.our_bans.length}/5 bans propios · ${draft.enemy_bans.length}/5 enemigos`
      : "Recomendaciones para negar una amenaza concreta."
    : isEnemyTurn
      ? "Registra su pick para que el motor actualice las recomendaciones."
      : "Top de campeones para el turno actual.";

  return `
    <section class="advice-panel ${view.busy ? "is-busy" : ""}" aria-busy="${view.busy}">
      <header class="advice-head">
        <div class="advice-head-top">
          <div>
            <h2>${escapeHtml(title)}</h2>
          </div>
          ${turn?.phase ? `<span class="phase-badge ${banPhase ? "phase-ban" : "phase-pick"}">${banPhase ? "BAN" : "PICK"}</span>` : ""}
        </div>
        <p class="advice-subtitle">${escapeHtml(subtitle)}</p>
        ${
          !banPhase && ourTurn && player
            ? `<label class="current-player-row">
                <span class="field-label">Pickeando</span>
                <select id="current-player-select" aria-label="Jugador que está pickeando">
                  ${orderedPlayers().map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === player.id ? "selected" : ""}>${escapeHtml(option.name)} · ${roleLabel(option.role)}</option>`).join("")}
                </select>
              </label>`
            : ""
        }
      </header>

      ${warnings.length ? `<div class="notice-list">${warnings.slice(0, 3).map((warning) => `<p class="notice">${escapeHtml(warning)}</p>`).join("")}</div>` : ""}

      ${
        banPhaseBlocked
          ? `<div class="empty-advice"><p>Ya hay 5 bans por equipo.</p><button class="button button-primary" type="button" data-action="open-step-dialog">Pasar a picks</button></div>`
          : isEnemyTurn
            ? enemyTurnPanel(turn)
            : banPhase && ourBansDone
              ? `<div class="empty-advice">
                  <p>Ya registraste tus cinco bans. Añade los bans enemigos que falten para avanzar.</p>
                  <button class="button button-ghost" type="button" data-action="open-picker" data-mode="ban" data-side="enemy">Añadir ban enemigo</button>
                </div>`
              : recs.length
                ? `<ol class="rec-list">${recs.map((rec, index) => recommendationCard(rec, index, banPhase)).join("")}</ol>`
                : `<div class="empty-advice">
                    <p>No hay recomendaciones con los filtros actuales.</p>
                    <button class="button button-ghost" type="button" data-action="open-picker" data-mode="${banPhase ? "ban" : "pick"}" data-side="${ourTurn ? "our" : "enemy"}">Elegir manualmente</button>
                  </div>`
      }
    </section>
  `;
}

function lcuAdvicePanel(view, turn, completed) {
  const status = view.lcu?.status;
  const action = status?.current_action ?? null;
  const recs = (view.response?.recommendations ?? []).filter(
    (rec) => !action || rec.action === action.phase,
  );
  const queueName = status?.queue_name ?? "";
  const connected = Boolean(status?.connected);
  const inChampSelect = status?.phase === "ChampSelect";
  const ourTurn = Boolean(turn?.isOurTurn && action);
  const notices = [...new Set((view.warnings ?? []).filter(Boolean))];
  const banPhase = action?.phase === "BAN";
  const title = completed
    ? "Draft completo"
    : !connected
      ? status?.state === "reconnecting"
        ? "Reconectando con League"
        : "Buscando League of Legends"
      : !inChampSelect
        ? status?.phase === "Lobby"
          ? "Lobby detectado"
          : status?.phase === "InProgress"
            ? "Partida en curso"
            : "Esperando champ select"
        : action
          ? action.label
          : "Esperando turno";
  const subtitle = completed
    ? "El champ select terminó."
    : !connected
      ? "Abre el cliente o espera a que la app lo detecte."
      : !inChampSelect
        ? status?.phase === "Lobby"
          ? `${queueName || "Lobby"} · preparando el draft`
          : "El seguimiento se reactivará en el próximo champ select."
        : action
          ? ourTurn
            ? `${queueName || "Champ select"} · recomendaciones para este turno`
            : "El rival está actuando; el tablero se actualizará solo."
          : "Esperando la próxima acción del cliente.";

  let body = "";
  if (!connected) {
    body = `
      <div class="empty-advice">
        <p>${status?.state === "not_found" ? "Abre League of Legends para activar el seguimiento." : "No se pudo conectar con el cliente. La app seguirá intentando."}</p>
        <p class="muted">El seguimiento se reanudará automáticamente cuando el cliente esté disponible.</p>
        <button class="button button-ghost" type="button" data-action="stop-lcu">Detener seguimiento</button>
      </div>
    `;
  } else if (completed) {
    body = `
      <div class="empty-advice">
        <p>El draft se sincronizó correctamente.</p>
        <button class="button button-danger-ghost" type="button" data-action="stop-lcu">Detener seguimiento</button>
      </div>
    `;
  } else if (!inChampSelect) {
    body = `
      <div class="empty-advice">
        <p>${status?.phase === "Lobby" ? "La app esperará a que empiece el champ select." : "Puedes dejar el seguimiento activo para la próxima partida."}</p>
        <button class="button button-danger-ghost" type="button" data-action="stop-lcu">Detener seguimiento</button>
      </div>
    `;
  } else if (!action) {
    body = `
      <div class="empty-advice">
        <p>El cliente está en champ select, pero todavía no expone una acción activa.</p>
        <p class="muted">En cuanto sea un turno real, aparecerá aquí la recomendación.</p>
      </div>
    `;
  } else if (!ourTurn) {
    body = `
      <div class="enemy-turn-panel">
        <div class="enemy-turn-icon">${banPhase ? "BAN" : "PICK"}</div>
        <div>
          <h3>${escapeHtml(action.label)}</h3>
          <p>El tablero se actualizará automáticamente cuando el rival confirme.</p>
        </div>
      </div>
    `;
  } else if (recs.length) {
    body = `
      <ol class="rec-list">
        ${recs.map((rec, index) => recommendationCard(rec, index, banPhase, false)).join("")}
      </ol>
    `;
  } else {
    body = `
      <div class="empty-advice">
        <p>No hay recomendaciones para este turno.</p>
        <p class="muted">El motor no devolvió candidatos con el estado actual del draft.</p>
      </div>
    `;
  }

  return `
    <section class="advice-panel is-lcu ${view.busy ? "is-busy" : ""}" aria-busy="${view.busy}">
      <header class="advice-head">
        <div class="advice-head-top">
          <div>
            <h2>${escapeHtml(title)}</h2>
          </div>
          ${action ? `<span class="phase-badge ${banPhase ? "phase-ban" : "phase-pick"}">${banPhase ? "BAN" : "PICK"}</span>` : ""}
        </div>
        <p class="advice-subtitle">${escapeHtml(subtitle)}</p>
        ${
          action && ourTurn && turn?.currentPlayer
            ? `<div class="current-player-row"><span class="field-label">${banPhase ? "Baneando" : "Pickeando"}</span><span class="lcu-current-player">${escapeHtml(turn.currentPlayer.name)} · ${roleLabel(turn.currentPlayer.role)}</span></div>`
            : ""
        }
      </header>
      ${
        notices.length
          ? `<div class="notice-list">${notices.slice(0, 3).map((warning) => `<p class="notice">${escapeHtml(warning)}</p>`).join("")}</div>`
          : ""
      }
      ${body}
      <footer class="lcu-readonly-note">
        Solo lectura · la app no envía picks ni bans al cliente.
      </footer>
    </section>
  `;
}

function enemyTurnPanel(turn) {
  const isBan = turn.phase === "BAN";
  return `
    <div class="enemy-turn-panel">
      <div class="enemy-turn-icon">${isBan ? "BAN" : "PICK"}</div>
      <div>
        <h3>${isBan ? "Ban enemigo" : "Pick enemigo"}</h3>
        <p>${isBan ? "Registra el campeón que acaba de banear el rival." : "Registra el campeón y su línea para ajustar los matchups."}</p>
      </div>
      <button class="button button-primary" type="button" data-action="open-picker" data-mode="${isBan ? "ban" : "pick"}" data-side="enemy">
        Registrar ${isBan ? "ban" : "pick"}
      </button>
    </div>
  `;
}

function recommendationCard(rec, index, banPhase, showAction = true) {
  const champion = rec.champion;
  const danger = rec.action === "BAN";
  const actionLabel = danger ? "Banear" : "Elegir";
  const roleText = rec.role ? roleLabel(rec.role) : "";
  const risk = (rec.risks ?? []).find(
    (item) =>
      !item.startsWith("Fuera del pool") &&
      !item.startsWith("Sin datos de matchup"),
  );

  return `
    <li class="rec-card ${rec.in_pool ? "" : "is-off-pool"} ${danger ? "is-ban" : ""} ${showAction ? "" : "is-readonly"}">
      <span class="rec-rank">${String(rec.rank).padStart(2, "0")}</span>
      ${championAvatar(champion, "rec-avatar")}
      <div class="rec-main">
        <div class="rec-titleline">
          <h3>${escapeHtml(champion.name)}</h3>
          ${
            danger
              ? rec.in_pool
                ? `<span class="off-pool-badge is-self">En tu pool</span>`
                : ""
              : rec.in_pool
                ? comfortMeter(rec.comfort)
                : `<span class="off-pool-badge">Fuera de pool</span>`
          }
        </div>
        <p class="rec-reason">${escapeHtml(rec.justification)}</p>
        <div class="rec-meta">
          <span>${escapeHtml(roleText)}</span>
          ${rec.comfort ? `<span>Comfort ${rec.comfort}/5</span>` : ""}
        </div>
        ${
          rec.history?.note
            ? `<p class="rec-history-line" title="Ajuste por historial: ${rec.history.points > 0 ? "+" : ""}${formatScore(rec.history.points)}">Historial · ${escapeHtml(rec.history.note)}</p>`
            : ""
        }
        ${risk ? `<p class="rec-risk-line" title="${escapeHtml(risk)}">Riesgo · ${escapeHtml(risk)}</p>` : ""}
      </div>
      <div class="rec-scorebox">
        <span class="tier-badge ${tierClass(rec.tier)}">${escapeHtml(rec.tier)}</span>
        <strong class="rec-score">${formatScore(rec.score)}</strong>
        <span class="score-track"><i style="width:${scoreWidth(rec.score)}"></i></span>
      </div>
      ${
        showAction
          ? `<button class="button ${danger ? "button-danger-ghost" : "button-primary"} rec-action" type="button" data-action="${danger ? "ban" : "pick"}" data-champion="${escapeHtml(champion.id)}">
              ${actionLabel}
            </button>`
          : ""
      }
    </li>
  `;
}

function nextPicksPanel(view) {
  if (view.lcu?.auto) return "";
  const groups = view.response?.next_picks ?? [];
  if (!groups.length) return "";
  return `
    <section class="next-panel">
      <header class="panel-head">
        <div>
          <h2>Próximos picks</h2>
        </div>
        <span class="muted small">Tentativo · asume que eliges la mejor opción actual</span>
      </header>
      <div class="next-groups">
        ${groups.map((group) => `
          <article class="next-group">
            <header>
              <span class="field-label">${escapeHtml(group.turn_label)}</span>
              <strong>${escapeHtml(group.player?.name ?? "Jugador")} · ${roleLabel(group.player?.role)}</strong>
            </header>
            <div class="next-list">
              ${group.suggestions.slice(0, 3).map((rec) => `
                <div class="next-item">
                  ${championAvatar(rec.champion, "next-avatar")}
                  <span class="next-name">${escapeHtml(rec.champion.name)}</span>
                  <span class="next-score">${formatScore(rec.score)}</span>
                  <span class="tier-badge ${tierClass(rec.tier)}">${escapeHtml(rec.tier)}</span>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function rivalLiveView(view) {
  if (view.lcu?.status?.phase !== "ChampSelect" && isClashContext(view.lcu?.status)) {
    return rivalLiveClashView(view);
  }
  const state = view.rivalLive ?? {};
  const data = state.data;
  const members = orderEnemyMembers(data?.members ?? []);
  const hidden = members.filter(rivalIdentityHidden).length;
  const visible = members.length - hidden;

  return `
    <div class="rival-live-root">
      <div class="page-head">
        <div>
          <h1>Rival Live</h1>
          <p class="muted">Scouting del equipo rival durante el champ select. Solo lectura; los datos salen del cliente local.</p>
        </div>
        <div class="inline-actions">
          <button class="button button-ghost" type="button" data-action="refresh-rival-scouting" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Leyendo LCU…" : "Actualizar rivales"}
          </button>
        </div>
      </div>
      ${rivalLiveStatus(state, data, visible, hidden)}
      ${
        members.length
          ? `<div class="rival-live-grid">${members.map((member, index) => rivalLiveCard(member, index)).join("")}</div>`
          : ""
      }
      <p class="lcu-note rival-live-footnote">Datos locales / best-effort. En Ranked Solo/Duo y Flex el cliente puede ocultar las identidades enemigas. En Ranked 5s, si no expone la posición, se estima por el rol principal del campeón elegido; sin pick, se muestran maestrías y recientes globales. En Clash se usa la posición marcada.</p>
    </div>
  `;
}

function rivalLiveStatus(state, data, visible, hidden) {
  if (state.loading && !data) {
    return `
      <div class="lobby-status is-loading">
        <span class="lobby-status-dot"></span>
        <span>Leyendo el equipo rival desde el LCU…</span>
      </div>
    `;
  }
  if (state.error) {
    return `
      <div class="lobby-status is-error">
        <span class="lobby-status-dot"></span>
        <div>
          <strong>No se pudo leer al rival</strong>
          <span class="muted">${escapeHtml(state.error)} Abrí League y volvé a intentar.</span>
        </div>
      </div>
    `;
  }
  if (!data) {
    return `
      <div class="lobby-status">
        <span class="lobby-status-dot"></span>
        <span>Entrá a champ select y pulsá <b>Actualizar rivales</b>.</span>
      </div>
    `;
  }
  if (!data.available) {
    return `
      <div class="lobby-status">
        <span class="lobby-status-dot"></span>
        <div>
          <strong>Sin rival visible</strong>
          <span class="muted">${escapeHtml(data.message ?? "El cliente no expone al equipo rival en este modo.")}</span>
        </div>
      </div>
    `;
  }
  const withoutPosition = (data.members ?? []).filter(
    (member) => !member.primary_position,
  ).length;
  const summary = hidden
    ? `${visible} visibles · ${hidden} con identidad oculta`
    : `${visible} rivales visibles`;
  const positionNote = withoutPosition ? ` · ${withoutPosition} sin posición` : "";
  return `
    <div class="lobby-status is-live">
      <span class="lobby-status-dot"></span>
      <div>
        <strong>LCU · ${escapeHtml(data.queue_name ?? "Champ select")} · ${escapeHtml(data.phase ?? "ChampSelect")}</strong>
        <span class="muted">${escapeHtml(`${summary}${positionNote}`)} · datos locales / best-effort.</span>
      </div>
    </div>
  `;
}

function rivalLiveClashView(view) {
  const clash = view.clash ?? {};
  const opponent = clash.data?.opponent ?? null;
  return `
    <div class="rival-live-root">
      <div class="page-head">
        <div>
          <h1>Rival Live</h1>
          <p class="muted">Rival de Clash desde el bracket, antes del champ select. Solo lectura; los datos salen del cliente local.</p>
        </div>
        <div class="inline-actions">
          <button class="button button-ghost" type="button" data-action="refresh-rival-scouting" ${clash.loading ? "disabled" : ""}>
            ${clash.loading && !opponent ? "Leyendo LCU…" : "Actualizar rivales"}
          </button>
        </div>
      </div>
      ${rivalLiveClashStatus(clash, opponent)}
      ${opponent ? clashOpponentPanel(opponent) : ""}
      <p class="lcu-note rival-live-footnote">Datos del bracket de Clash. El rival se actualiza automáticamente cuando el cliente lo expone; no se envían acciones al juego.</p>
    </div>
  `;
}

function rivalLiveClashStatus(clash, opponent) {
  if (clash.loading && !opponent) {
    return `
      <div class="lobby-status is-loading">
        <span class="lobby-status-dot"></span>
        <span>Leyendo el rival de Clash desde el LCU…</span>
      </div>
    `;
  }
  if (clash.error) {
    return `
      <div class="lobby-status is-error">
        <span class="lobby-status-dot"></span>
        <div>
          <strong>No se pudo leer el rival de Clash</strong>
          <span class="muted">${escapeHtml(clash.error)}</span>
        </div>
      </div>
    `;
  }
  if (!opponent) {
    return `
      <div class="lobby-status">
        <span class="lobby-status-dot"></span>
        <div>
          <strong>Clash activo</strong>
          <span class="muted">El bracket todavía no expone al rival. Se reintenta automáticamente.</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="lobby-status is-live">
      <span class="lobby-status-dot"></span>
      <div>
        <strong>Clash · antes del champ select</strong>
        <span class="muted">${opponent.players?.length ?? 0} jugadores · datos locales / best-effort.</span>
      </div>
    </div>
  `;
}

function rivalIdentityHidden(member) {
  return !member?.puuid && !member?.summoner_id;
}

function rivalLiveCard(member, index) {
  const primary = member.primary_position;
  const name =
    member.display_name ||
    (primary ? `Rival ${roleLabel(primary)}` : `Rival ${index + 1}`);
  const hidden = rivalIdentityHidden(member);
  const masteries = (member.scouting?.masteries ?? []).slice(0, 5);
  const recent = (member.recent_champions ?? []).slice(0, 5);
  const message =
    member.message ??
    (hidden
      ? "El cliente no expone la identidad de este rival. Sin maestrías ni historial."
      : null);

  return `
    <section class="roster-scouting rival-live-card ${hidden ? "is-hidden-identity" : ""}">
      <header class="roster-lcu-head">
        <div class="roster-lcu-id">
          <span class="lcu-chip">RIVAL</span>
          <div>
            <strong>${escapeHtml(name)}${member.tag_line ? `<span class="lcu-tag">#${escapeHtml(member.tag_line)}</span>` : ""}</strong>
            <span class="muted">
              ${member.level != null ? `Nv ${member.level}` : "Nivel —"}
              ${hidden ? " · Identidad oculta" : ""}
            </span>
          </div>
        </div>
        <div class="lcu-positions">
          ${
            primary
              ? `<span class="lcu-position"><span class="field-label">${member.position_inferred ? "Posición estimada" : "Posición"}</span>${roleBadge(primary)}</span>`
              : `<span class="muted">Sin posición</span>`
          }
        </div>
      </header>

      <div class="lcu-rank-row">
        ${
          hidden
            ? `<span class="muted">Identidad oculta por el cliente.</span>`
            : member.ranks?.length
              ? member.ranks.map(clashRankChip).join("")
              : `<span class="muted">Sin rango cacheado.</span>`
        }
      </div>

      ${
        hidden
          ? `
            <p class="notice">${escapeHtml(message)}</p>
            <p class="lcu-note">Solo lectura · datos locales / best-effort.</p>
          `
          : `
            <div class="lcu-section">
              <div class="lcu-section-head">
                <div>
                  <h3>Top 5 maestrías${primary ? ` · ${roleLabel(primary)}` : ""}</h3>
                </div>
              </div>
              ${
                masteries.length
                  ? `<div class="lcu-mastery-list">${masteries.map(rivalMasteryRow).join("")}</div>`
                  : `<p class="muted">Sin maestrías cacheadas${primary ? ` en ${roleLabel(primary)}` : ""}.</p>`
              }
            </div>

            <div class="lcu-section">
              <div class="lcu-section-head">
                <div>
                  <h3>${primary ? `Recientes en ${roleLabel(primary)}` : "Recientes (sin posición)"}</h3>
                  <span class="muted">Solo Ranked Solo/Duo, Flex, 5s y Clash.</span>
                </div>
              </div>
              ${
                recent.length
                  ? `<div class="lcu-recent-list">${recent.map(lobbyRecentRow).join("")}</div>`
                  : `<p class="muted">Sin partidas recientes en las colas soportadas.</p>`
              }
            </div>

            ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
            <p class="lcu-note">Solo lectura · datos locales / best-effort.</p>
          `
      }
    </section>
  `;
}

function rivalMasteryRow(entry) {
  const champion = championById(entry.champion_id);
  if (!champion) return "";
  return `
    <div class="lcu-mastery-row is-readonly">
      ${championAvatar(champion, "lcu-champion-avatar")}
      <div class="lcu-champion-copy">
        <strong>${escapeHtml(champion.name)}</strong>
        <span class="muted">Nv ${entry.level} · ${formatClashPoints(entry.points)} pts</span>
      </div>
      <span class="rival-mastery-badge">M${entry.level}</span>
    </div>
  `;
}

function rosterView(view) {
  const players = orderedPlayers();
  const scouting = view.lobbyScouting?.data;
  const members = scouting?.members ?? [];
  const matched = matchLobbyMembers(players, members);
  const loading = view.lobbyScouting?.loading;

  return `
    <div class="page-head">
      <div>
        <h1>Equipo</h1>
        <p class="muted">Izquierda: tu pool guardado. Derecha: lo que el LCU ve de cada jugador del lobby, según su posición principal.</p>
      </div>
      <div class="inline-actions">
        <button class="button button-ghost" type="button" data-action="refresh-lobby-scouting" ${loading ? "disabled" : ""}>
          ${loading ? "Leyendo LCU…" : "Actualizar LCU"}
        </button>
        <button class="button button-ghost" type="button" data-action="import">Importar JSON</button>
        <button class="button button-ghost" type="button" data-action="export">Exportar JSON</button>
      </div>
    </div>

    ${lobbyScoutingStatus(view)}

    <div class="roster-pairs">
      ${players
        .map(
          (player, index) => `
            <div class="roster-pair">
              ${rosterPlayer(player, index)}
              ${lobbyScoutingCard(view, player, matched.get(player.id) ?? null)}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function lobbyScoutingStatus(view) {
  const state = view.lobbyScouting ?? {};
  const data = state.data;
  if (state.loading && !data) {
    return `
      <div class="lobby-status is-loading">
        <span class="lobby-status-dot"></span>
        <span>Leyendo el lobby desde el LCU…</span>
      </div>
    `;
  }
  if (state.error) {
    return `
      <div class="lobby-status is-error">
        <span class="lobby-status-dot"></span>
        <div>
          <strong>No se pudo leer el lobby</strong>
          <span class="muted">${escapeHtml(state.error)} Abrí League y volvé a intentar.</span>
        </div>
      </div>
    `;
  }
  if (!data) {
    return `
      <div class="lobby-status">
        <span class="lobby-status-dot"></span>
        <span>Entrá a un lobby o champ select y pulsá <b>Actualizar LCU</b>.</span>
      </div>
    `;
  }
  if (!data.available) {
    return `
      <div class="lobby-status">
        <span class="lobby-status-dot"></span>
        <div>
          <strong>Sin lobby activo</strong>
          <span class="muted">${escapeHtml(data.message ?? "El LCU no tiene un lobby o champ select abierto.")}</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="lobby-status is-live">
      <span class="lobby-status-dot"></span>
      <div>
        <strong>LCU · ${escapeHtml(data.queue_name ?? "Lobby")} · ${escapeHtml(data.phase ?? "")}</strong>
        <span class="muted">${data.local_player ? `Vos: ${escapeHtml(data.local_player)} · ` : ""}Datos locales / best-effort.</span>
      </div>
    </div>
  `;
}

function lobbyScoutingCard(view, player, member) {
  if (!member) {
    return `
      <section class="roster-scouting is-empty">
        <header class="roster-lcu-head">
          <div class="roster-lcu-id">
            <span class="lcu-chip">LCU</span>
            <strong>Sin jugador emparejado</strong>
          </div>
        </header>
        <p class="muted">
          No encontré un jugador del lobby para ${escapeHtml(player.name)} (${roleLabel(player.role)}).
          Se empareja por nombre o posición principal.
        </p>
      </section>
    `;
  }

  const primary = member.primary_position;
  const secondary = member.secondary_position;
  const masteries = (member.scouting?.masteries ?? []).slice(0, 5);
  const recent = (member.recent_champions ?? []).slice(0, 5);
  const name = member.display_name || "Jugador LCU";
  const positions = `
    ${
      primary
        ? `<span class="lcu-position"><span class="field-label">Principal</span>${roleBadge(primary)}</span>`
        : `<span class="muted">Sin posición seleccionada</span>`
    }
    ${
      secondary
        ? `<span class="lcu-position"><span class="field-label">Secundaria</span>${roleBadge(secondary)}</span>`
        : ""
    }
  `;

  return `
    <section class="roster-scouting ${member.is_bot ? "is-bot" : ""}">
      <header class="roster-lcu-head">
        <div class="roster-lcu-id">
          <span class="lcu-chip">LCU</span>
          <div>
            <strong>${escapeHtml(name)}${member.tag_line ? `<span class="lcu-tag">#${escapeHtml(member.tag_line)}</span>` : ""}</strong>
            <span class="muted">
              ${member.level != null ? `Nv ${member.level}` : "Nivel —"}
              ${member.is_local ? " · TÚ" : ""}
              ${member.is_leader ? " · Líder" : ""}
            </span>
          </div>
        </div>
        <div class="lcu-positions">${positions}</div>
      </header>

      <div class="lcu-rank-row">
        ${
          member.ranks?.length
            ? member.ranks.map(clashRankChip).join("")
            : `<span class="muted">Sin rango cacheado.</span>`
        }
      </div>

      ${
        member.is_bot
          ? `<p class="lcu-note">Bot: sin maestrías ni historial.</p>`
          : `
            <div class="lcu-section">
              <div class="lcu-section-head">
                <div>
                  <h3>Top 5 maestrías${primary ? ` · ${roleLabel(primary)}` : ""}</h3>
                  <span class="muted">Al pasar al pool se guardan con comfort 5.</span>
                </div>
                ${
                  masteries.length
                    ? `<button class="button button-ghost button-small" type="button"
                        data-action="lcu-add-masteries"
                        data-player="${escapeHtml(player.id)}"
                        data-champions="${escapeHtml(masteries.map((entry) => entry.champion_id).join(","))}">
                        Pasar top 5
                      </button>`
                    : ""
                }
              </div>
              ${
                masteries.length
                  ? `<div class="lcu-mastery-list">${masteries.map((entry) => lobbyMasteryRow(player, entry)).join("")}</div>`
                  : `<p class="muted">Sin maestrías cacheadas${primary ? ` en ${roleLabel(primary)}` : ""}.</p>`
              }
            </div>

            <div class="lcu-section">
              <div class="lcu-section-head">
                <div>
                  <h3>${primary ? `Recientes en ${roleLabel(primary)}` : "Recientes (sin posición)"}</h3>
                  <span class="muted">Solo Ranked Solo/Duo, Flex, 5s y Clash.</span>
                </div>
              </div>
              ${
                recent.length
                  ? `<div class="lcu-recent-list">${recent.map(lobbyRecentRow).join("")}</div>`
                  : `<p class="muted">Sin partidas recientes en las colas soportadas.</p>`
              }
            </div>

            ${
              member.message
                ? `<p class="notice">${escapeHtml(member.message)}</p>`
                : ""
            }
            <p class="lcu-note">Datos locales / best-effort. El LCU puede no tener maestrías o partidas cacheadas.</p>
          `
      }
    </section>
  `;
}

function lobbyMasteryRow(player, entry) {
  const champion = championById(entry.champion_id);
  if (!champion) return "";
  return `
    <div class="lcu-mastery-row">
      ${championAvatar(champion, "lcu-champion-avatar")}
      <div class="lcu-champion-copy">
        <strong>${escapeHtml(champion.name)}</strong>
        <span class="muted">Nv ${entry.level} · ${formatClashPoints(entry.points)} pts</span>
      </div>
      ${comfortMeter(5)}
      <button class="button button-ghost button-small" type="button"
        data-action="lcu-add-champion"
        data-player="${escapeHtml(player.id)}"
        data-champion="${escapeHtml(champion.id)}"
        data-comfort="5">
        Añadir
      </button>
    </div>
  `;
}

function lobbyRecentRow(entry) {
  const champion = championById(entry.champion_id);
  const winrate = entry.games ? Math.round((entry.wins / entry.games) * 100) : 0;
  return `
    <div class="lcu-recent-row">
      ${
        champion
          ? championAvatar(champion, "lcu-champion-avatar")
          : `<span class="champion-avatar lcu-champion-avatar"><span class="champion-avatar-fallback">${escapeHtml(String(entry.champion_name ?? "?").slice(0, 2).toUpperCase())}</span></span>`
      }
      <div class="lcu-champion-copy">
        <strong>${escapeHtml(champion?.name ?? entry.champion_name ?? entry.champion_id)}</strong>
        <span class="muted">${entry.games} PJ · ${entry.wins} V · ${winrate}%${entry.last_kda ? ` · ${escapeHtml(entry.last_kda)}` : ""}</span>
      </div>
    </div>
  `;
}

function rosterPlayer(player, index) {
  const entries = player.pool ?? [];
  return `
    <section class="roster-player">
      <header class="roster-head">
        <div class="order-block">
          <span class="order-number">${String(index + 1).padStart(2, "0")}</span>
          <div class="order-buttons">
            <button type="button" class="mini-button" data-action="move-order" data-player="${escapeHtml(player.id)}" data-direction="-1" aria-label="Subir">↑</button>
            <button type="button" class="mini-button" data-action="move-order" data-player="${escapeHtml(player.id)}" data-direction="1" aria-label="Bajar">↓</button>
          </div>
        </div>
        <div class="roster-identity">
          ${roleBadge(player.role)}
          <label class="inline-field">
            <span class="sr-only">Nombre del jugador</span>
            <input type="text" value="${escapeHtml(player.name)}" data-action="rename-player" data-player="${escapeHtml(player.id)}" maxlength="24" />
          </label>
        </div>
        <div class="roster-meta">
          <span>${entries.length} campeones</span>
          <span class="team-meta-sep"></span>
          <span>${roleLabel(player.role)}</span>
        </div>
      </header>
      <div class="pool-list">
        ${
          entries.length
            ? entries.map((entry) => poolEntry(player, entry)).join("")
            : `<p class="muted pool-empty">Sin campeones en el pool. Añade al menos uno para que el motor priorice opciones cómodas.</p>`
        }
      </div>
      <footer class="roster-footer">
        <button class="button button-ghost button-small" type="button" data-action="open-pool-picker" data-player="${escapeHtml(player.id)}">Añadir campeón</button>
      </footer>
    </section>
  `;
}

function poolEntry(player, entry) {
  const champion = championById(entry.champion_id);
  if (!champion) return "";
  return `
    <div class="pool-entry">
      ${championAvatar(champion, "pool-avatar")}
      <div class="pool-name">
        <strong>${escapeHtml(champion.name)}</strong>
        <span>${escapeHtml(champion.roles.map(roleLabel).join(" / "))}</span>
      </div>
      <div class="comfort-control" role="group" aria-label="Comfort de ${escapeHtml(champion.name)}">
        ${[1, 2, 3, 4, 5].map((value) => `
          <button type="button" class="comfort-button ${entry.comfort >= value ? "is-on" : ""}" data-action="set-comfort" data-player="${escapeHtml(player.id)}" data-champion="${escapeHtml(champion.id)}" data-comfort="${value}" aria-label="Comfort ${value}">
            ${value}
          </button>
        `).join("")}
      </div>
      <label class="winrate-field">
        <span class="field-label">WR</span>
        <input type="number" min="0" max="100" step="1" placeholder="—" value="${entry.winrate ?? ""}" data-action="set-winrate" data-player="${escapeHtml(player.id)}" data-champion="${escapeHtml(champion.id)}" />
      </label>
      <button type="button" class="icon-button icon-button-small" data-action="remove-pool" data-player="${escapeHtml(player.id)}" data-champion="${escapeHtml(champion.id)}" aria-label="Quitar ${escapeHtml(champion.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </div>
  `;
}

function championNameOf(championId) {
  return championById(championId)?.name ?? championId;
}

function historyView(view) {
  const history = view.history ?? {};
  const store = history.store;
  if (history.loading && !store) return historyLoading();
  if (history.error && !store) return historyError(history.error);
  if (!store) return historyLoading();

  const matches = store.matches ?? [];
  if (!matches.length) return historyEmpty();

  const filtered = filterHistoryMatches(matches, history.filters, championNameOf);
  const summary = computeHistorySummary(filtered, championNameOf);

  return `
    ${historyPageHead(store, matches.length)}
    ${historyTabs(history.tab, matches.length, filtered.length)}
    ${
      history.tab === "matches"
        ? historyMatches(view, filtered)
        : history.tab === "rivals"
          ? historyRivals(view, store)
          : history.tab === "bans"
            ? historyBans(view, summary, filtered)
            : historySummary(view, summary, filtered)
    }
  `;
}

function historyPageHead(store, total) {
  return `
    <div class="page-head">
      <div>
        <h1>Historial y scouting</h1>
        <p class="muted">${total} partidas guardadas · picks, bans, resultados y pools rivales. Los datos son locales.</p>
      </div>
      <div class="inline-actions">
        <button class="button button-ghost" type="button" data-action="history-import">Importar Clash</button>
        <button class="button button-ghost" type="button" data-action="history-save-draft">Guardar partida actual</button>
        <button class="button button-ghost" type="button" data-action="history-export">Exportar</button>
        <button class="button button-ghost" type="button" data-action="history-open-dir">Carpeta</button>
      </div>
    </div>
    ${
      store?.updated_at
        ? `<p class="history-save-note muted">Última actualización: ${escapeHtml(formatHistoryDate({ played_at: store.updated_at }))}</p>`
        : ""
    }
  `;
}

function historyTabs(active, total, filtered) {
  const tabs = [
    ["summary", "Resumen", ""],
    ["matches", "Partidas", `${filtered}/${total}`],
    ["rivals", "Rivales", ""],
    ["bans", "Bans", ""],
  ];
  return `
    <div class="history-tabs" role="tablist" aria-label="Secciones del historial">
      ${tabs
        .map(
          ([id, label, count]) => `
          <button class="history-tab ${active === id ? "is-active" : ""}" type="button" role="tab" aria-selected="${active === id}"
            data-action="history-tab" data-tab="${id}">
            ${label}${count ? `<span>${count}</span>` : ""}
          </button>
        `,
        )
        .join("")}
    </div>
  `;
}

function historySummary(view, summary, matches) {
  if (!matches.length) return historyFilteredEmpty(view);
  return `
    <div class="history-kpi-grid">
      ${historyKpi("Partidas", matches.length, `${summary.wins}-${summary.losses} · ${summary.unknown} sin resultado`)}
      ${historyKpi("Winrate", winrateText(summary.winrate), `${summary.games} con resultado`, summary.winrate !== null && summary.winrate >= 50 ? "is-good" : "")}
      ${historyKpi("Racha", summary.streak.count ? `${summary.streak.count}${summary.streak.tone === "win" ? "V" : "D"}` : "—", "según el orden del historial", summary.streak.tone === "win" ? "is-good" : summary.streak.tone === "loss" ? "is-bad" : "")}
      ${historyKpi("Mejor campeón", summary.bestChampion?.name ?? "—", summary.bestChampion ? `${winrateText(summary.bestChampion.winrate)} · ${summary.bestChampion.games} PJ` : "muestra mínima: 3 PJ", "is-good")}
      ${historyKpi("Amenaza rival", summary.worstMatchup?.name ?? "—", summary.worstMatchup ? `${winrateText(summary.worstMatchup.winrate)} en contra · ${summary.worstMatchup.games} PJ` : "muestra mínima: 3 PJ", "is-bad")}
      ${historyKpi("Ban más repetido", summary.mostBannedAgainst?.name ?? "—", summary.mostBannedAgainst ? `${summary.mostBannedAgainst.count} bans rivales` : "sin datos", "is-gold")}
    </div>

    <div class="history-columns">
      ${historyOurPicksPanel(summary.topPicks)}
      ${historyEnemyPicksPanel(summary.topEnemyPicks)}
    </div>

    <div class="history-columns">
      ${historyBansPanel("Nuestros bans", "Lo que más baneamos.", summary.topOurBans)}
      ${historyBansPanel("Bans rivales", "Lo que más nos banearon.", summary.topEnemyBans, true)}
    </div>

    ${historyContextPanel(summary)}
    ${historyFilters(view)}
  `;
}

function historyKpi(label, value, detail, tone = "") {
  return `
    <article class="history-kpi ${tone}">
      <span class="field-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function historyOurPicksPanel(rows) {
  return `
    <section class="history-panel">
      <header class="panel-head">
        <div><h2>Nuestros picks</h2><p class="muted">Campeones con los que más jugamos.</p></div>
      </header>
      <table class="history-table">
        <thead><tr><th>Campeón</th><th>PJ</th><th>Récord</th><th>WR</th><th>Bans rivales</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                    <tr>
                      <td>${historyChampionCell(row.championId)}</td>
                      <td>${row.games}</td>
                      <td>${recordText(row.wins, row.losses)}</td>
                      <td>${winrateText(row.winrate)}</td>
                      <td>${row.bansAgainst}</td>
                    </tr>
                  `,
                  )
                  .join("")
              : `<tr><td colspan="5" class="history-empty-cell">Sin picks registrados.</td></tr>`
          }
        </tbody>
      </table>
    </section>
  `;
}

function historyEnemyPicksPanel(rows) {
  return `
    <section class="history-panel">
      <header class="panel-head">
        <div><h2>Amenazas rivales</h2><p class="muted">Campeones rivales y cómo nos fue contra ellos.</p></div>
      </header>
      <table class="history-table">
        <thead><tr><th>Campeón</th><th>PJ</th><th>Récord</th><th>WR contra</th><th>Nuestros bans</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                    <tr>
                      <td>${historyChampionCell(row.championId)}</td>
                      <td>${row.games}</td>
                      <td>${recordText(row.wins, row.losses)}</td>
                      <td>${winrateText(row.winrate)}</td>
                      <td>${row.ourBans}</td>
                    </tr>
                  `,
                  )
                  .join("")
              : `<tr><td colspan="5" class="history-empty-cell">Sin picks rivales registrados.</td></tr>`
          }
        </tbody>
      </table>
    </section>
  `;
}

function historyBansPanel(title, subtitle, rows, enemy = false) {
  const visibleRows = rows.filter((row) => row.count > 0);
  return `
    <section class="history-panel">
      <header class="panel-head">
        <div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(subtitle)}</p></div>
      </header>
      <table class="history-table">
        <thead><tr><th>Campeón</th><th>Bans</th><th>PJ</th><th>Récord</th><th>WR</th></tr></thead>
        <tbody>
          ${
            visibleRows.length
              ? visibleRows
                  .map(
                    (row) => `
                    <tr>
                      <td>${historyChampionCell(row.championId)}</td>
                      <td>${row.count}${
                        enemy
                          ? row.ourBans
                            ? `<span class="muted"> · ${row.ourBans} nuestros</span>`
                            : ""
                          : row.enemyBans
                            ? `<span class="muted"> · ${row.enemyBans} rival</span>`
                            : ""
                      }</td>
                      <td>${row.games}</td>
                      <td>${recordText(row.wins, row.losses)}</td>
                      <td>${winrateText(row.winrate)}</td>
                    </tr>
                  `,
                  )
                  .join("")
              : `<tr><td colspan="5" class="history-empty-cell">Sin bans registrados.</td></tr>`
          }
        </tbody>
      </table>
    </section>
  `;
}

function historyContextPanel(summary) {
  return `
    <div class="history-columns">
      <section class="history-panel">
        <header class="panel-head">
          <div><h2>Primer ban</h2><p class="muted">Quién abrió la fase de bans.</p></div>
        </header>
        <div class="history-mini-grid">
          ${historyMiniStat("Nosotros", summary.firstBan.us)}
          ${historyMiniStat("Ellos", summary.firstBan.them)}
          ${historyMiniStat("Sin dato", summary.firstBan.unknown)}
        </div>
      </section>
      <section class="history-panel">
        <header class="panel-head">
          <div><h2>Lado</h2><p class="muted">Inferido por el orden del primer pick.</p></div>
        </header>
        <div class="history-mini-grid">
          ${historyMiniStat("Azul", summary.sides.BLUE)}
          ${historyMiniStat("Rojo", summary.sides.RED)}
          ${historyMiniStat("Sin lado", summary.sides.unknown)}
        </div>
      </section>
    </div>
    <p class="history-footnote">El winrate asociado a bans y lados es contextual: muestra la relación con tus resultados, no una causalidad.</p>
  `;
}

function historyMiniStat(label, line) {
  const games = line.games;
  const known = line.wins + line.losses;
  const rate = known ? (line.wins / known) * 100 : null;
  return `
    <div class="history-mini-stat">
      <span class="field-label">${escapeHtml(label)}</span>
      <strong>${games}</strong>
      <small>${line.wins}-${line.losses} · ${winrateText(rate)}</small>
    </div>
  `;
}

function historyFilters(view) {
  const filters = view.history?.filters ?? {};
  const select = (name, value, options) => `
    <label class="history-filter-field">
      <span class="field-label">${escapeHtml(name)}</span>
      <select data-action="history-filter" data-filter="${options.filter}">
        ${options.items
          .map(
            ([id, label]) =>
              `<option value="${escapeHtml(id)}" ${value === id ? "selected" : ""}>${escapeHtml(label)}</option>`,
          )
          .join("")}
      </select>
    </label>
  `;
  return `
    <section class="history-filters" aria-label="Filtros del historial">
      <label class="search-field history-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input type="search" value="${escapeHtml(filters.search ?? "")}" placeholder="Buscar rival o campeón…" data-action="history-search" autocomplete="off" />
      </label>
      ${select("Cola", filters.queue, {
        filter: "queue",
        items: [
          ["ALL", "Todas"],
          ["clash", "Clash"],
          ["ranked_solo", "Ranked Solo"],
          ["ranked_flex", "Ranked Flex"],
          ["normal_draft", "Normal Draft"],
          ["custom", "Custom"],
          ["unknown", "Sin cola"],
        ],
      })}
      ${select("Resultado", filters.result, {
        filter: "result",
        items: [
          ["ALL", "Todos"],
          ["win", "Victoria"],
          ["loss", "Derrota"],
          ["unknown", "Sin resultado"],
        ],
      })}
      ${select("Lado", filters.side, {
        filter: "side",
        items: [
          ["ALL", "Todos"],
          ["BLUE", "Azul"],
          ["RED", "Rojo"],
        ],
      })}
      ${select("Primer ban", filters.firstBan, {
        filter: "firstBan",
        items: [
          ["ALL", "Todos"],
          ["us", "Nosotros"],
          ["them", "Ellos"],
          ["unknown", "Sin dato"],
        ],
      })}
      <label class="history-filter-field">
        <span class="field-label">Orden</span>
        <select data-action="history-filter" data-filter="order">
          <option value="desc" ${filters.order === "desc" ? "selected" : ""}>Recientes primero</option>
          <option value="asc" ${filters.order === "asc" ? "selected" : ""}>Antiguas primero</option>
        </select>
      </label>
      <label class="history-filter-check">
        <input type="checkbox" data-action="history-only-complete" ${filters.onlyComplete ? "checked" : ""} />
        <span>Solo completas</span>
      </label>
      <button class="button button-ghost button-small" type="button" data-action="history-reset-filters">Limpiar filtros</button>
    </section>
  `;
}

function historyMatches(view, matches) {
  if (!matches.length) return historyFilteredEmpty(view);
  return `
    ${historyFilters(view)}
    <section class="history-panel history-matches-panel">
      <header class="panel-head">
        <div><h2>Partidas</h2><p class="muted">${matches.length} partidas con los filtros actuales.</p></div>
      </header>
      <div class="history-match-list">
        ${matches.map(historyMatchRow).join("")}
      </div>
    </section>
  `;
}

function historyMatchRow(match) {
  const ourPicks = (match.our_picks ?? []).map((pick) => historyMiniAvatar(pick.champion_id)).join("");
  const enemyPicks = (match.enemy_picks ?? []).map((pick) => historyMiniAvatar(pick.champion_id)).join("");
  return `
    <button class="history-match-row" type="button" data-action="history-open-match" data-match="${escapeHtml(match.id)}">
      <span class="history-match-date">${escapeHtml(formatHistoryDate(match))}</span>
      <span class="history-result is-${escapeHtml(match.result)}">${escapeHtml(resultLabel(match.result))}</span>
      <span class="history-match-side">${escapeHtml(historySideLabel(match.side))}</span>
      <span class="history-match-picks">
        <span class="history-pick-group">${ourPicks || "—"}</span>
        <span class="history-vs">vs</span>
        <span class="history-pick-group">${enemyPicks || "—"}</span>
      </span>
      <span class="history-match-meta">
        ${escapeHtml(queueLabel(match.queue))}
        <span class="muted">Primer ban: ${escapeHtml(banStarterLabel(match.first_ban))}</span>
      </span>
      <span class="history-confidence is-${escapeHtml(match.confidence)}">${escapeHtml(confidenceLabel(match.confidence))}</span>
    </button>
  `;
}

function historyMiniAvatar(championId) {
  const champion = championById(championId);
  if (!champion) {
    return `<span class="history-mini-avatar is-missing" title="${escapeHtml(championId)}">?</span>`;
  }
  return `<span class="history-mini-avatar" title="${escapeHtml(champion.name)}">${championAvatar(champion, "history-mini-img")}</span>`;
}

function historyChampionCell(championId) {
  const champion = championById(championId);
  if (!champion) return `<span class="history-champion-cell">${escapeHtml(championId)}</span>`;
  return `
    <span class="history-champion-cell">
      ${championAvatar(champion, "history-table-avatar")}
      <span>${escapeHtml(champion.name)}</span>
    </span>
  `;
}

function historyRivals(view, store) {
  const history = view.history;
  const profiles = buildRivalProfiles(store.matches ?? [], championNameOf);
  const filtered = filterRivalProfiles(profiles, history.rivalSearch, history.rivalRole);
  const hasFilter = history.rivalSearch.trim() || history.rivalRole !== "ALL";
  const visible = hasFilter ? filtered : filtered.slice(0, 60);
  return `
    <section class="history-filters" aria-label="Filtros de rivales">
      <label class="search-field history-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input type="search" value="${escapeHtml(history.rivalSearch)}" placeholder="Buscar rival…" data-action="rival-search" autocomplete="off" />
      </label>
      <label class="history-filter-field">
        <span class="field-label">Rol</span>
        <select data-action="rival-role">
          ${[
            ["ALL", "Todos"],
            ["TOP", "Top"],
            ["JUNGLE", "Jungla"],
            ["MID", "Mid"],
            ["ADC", "ADC"],
            ["SUPPORT", "Support"],
            ["fill", "Fill"],
            ["comodin", "Comodín"],
            ["random", "Random"],
            ["aram", "ARAM"],
            ["autofill", "Autofill"],
            ["nada", "Sin rol"],
          ]
            .map(
              ([id, label]) =>
                `<option value="${id}" ${history.rivalRole === id ? "selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select>
      </label>
      <span class="history-filter-count">${filtered.length} rivales${!hasFilter && filtered.length > visible.length ? ` · mostrando ${visible.length}` : ""}</span>
    </section>
    ${
      visible.length
        ? `<div class="rival-grid">${visible.map(historyRivalCard).join("")}</div>`
        : `<div class="history-empty-panel"><p>No hay rivales que coincidan con el filtro.</p></div>`
    }
  `;
}

function historyRivalCard(profile) {
  const roles = [...new Set([...profile.roles.map(roleLabel), ...profile.roleLabels])];
  const pool = profile.champions
    .slice(0, 6)
    .map((champion) => historyMiniAvatar(champion.championId))
    .join("");
  return `
    <article class="rival-card">
      <header class="rival-card-head">
        <div>
          <h3>${escapeHtml(profile.name)}</h3>
          <p class="muted">${escapeHtml(roles.join(" / ") || "Flex")} · ${profile.games} partida${profile.games === 1 ? "" : "s"}</p>
        </div>
        <span class="history-result is-${profile.wins === 0 && profile.losses === 0 ? "unknown" : profile.wins >= profile.losses ? "win" : "loss"}">${recordText(profile.wins, profile.losses)}</span>
      </header>
      <div class="rival-pool">${pool || `<span class="muted">Sin pool registrado</span>`}</div>
      <div class="rival-card-meta">
        <span>${winrateText(profile.winrate)} vs. ellos</span>
        ${profile.ranks.length ? `<span>${escapeHtml(profile.ranks.join(" / "))}</span>` : ""}
      </div>
      ${
        profile.notes.length
          ? `<p class="rival-note">${escapeHtml(profile.notes.slice(0, 2).join(" · "))}</p>`
          : ""
      }
      <footer class="rival-card-actions">
        <button class="button button-ghost button-small" type="button" data-action="history-filter-rival" data-name="${escapeHtml(profile.name)}">Ver partidas</button>
        <button class="button button-ghost button-small" type="button" data-action="history-rename-rival" data-name="${escapeHtml(profile.name)}">Renombrar</button>
      </footer>
    </article>
  `;
}

function historyBans(view, summary, matches) {
  if (!matches.length) return historyFilteredEmpty(view);
  return `
    ${historyContextPanel(summary)}
    <div class="history-columns">
      ${historyBansPanel("Nuestros bans", "Lo que baneamos y cómo nos fue.", summary.topOurBans)}
      ${historyBansPanel("Bans rivales", "Lo que nos banearon y cómo nos fue.", summary.topEnemyBans, true)}
    </div>
    ${historyFilters(view)}
  `;
}

function historyFilteredEmpty(view) {
  return `
    <div class="history-empty-panel">
      <h2>Sin partidas con esos filtros</h2>
      <p class="muted">Prueba a limpiar el filtro o buscar otro rival o campeón.</p>
      <button class="button button-ghost" type="button" data-action="history-reset-filters">Limpiar filtros</button>
    </div>
  `;
}

function historyEmpty() {
  return `
    ${historyPageHead({}, 0)}
    <div class="history-empty-panel history-empty-hero">
      <div class="history-empty-mark">0</div>
      <h2>Aún no hay historial</h2>
      <p class="muted">Importa tu archivo de Clash o guarda una partida desde el draft actual. Los datos se quedan en tu equipo.</p>
      <div class="inline-actions">
        <button class="button button-primary" type="button" data-action="history-import">Importar Clash</button>
        <button class="button button-ghost" type="button" data-action="history-save-draft">Guardar partida actual</button>
      </div>
      <p class="callout">Formato aceptado: tu TXT de Clash, con bloques separados por barras, o un JSON de historial de Draft Assist.</p>
    </div>
  `;
}

function historyLoading() {
  return `
    <div class="page-head">
      <div><h1>Historial y scouting</h1><p class="muted">Cargando historial local…</p></div>
    </div>
    <div class="history-loading skeleton"></div>
  `;
}

function historyError(message) {
  return `
    <div class="page-head">
      <div><h1>Historial y scouting</h1><p class="muted">No se pudo cargar el historial.</p></div>
    </div>
    <div class="history-empty-panel">
      <p class="notice notice-error">${escapeHtml(message)}</p>
      <button class="button button-primary" type="button" data-action="history-retry">Reintentar</button>
    </div>
  `;
}

export function renderHistoryDialogs(view) {
  renderHistoryImportBody(view);
  renderHistoryMatchBody(view);
  renderHistorySaveBody(view);
  renderHistoryRenameBody(view);
}

function renderHistoryImportBody(view) {
  const dialog = document.getElementById("history-import-dialog");
  const body = document.getElementById("history-import-body");
  if (!body) return;
  if (dialog?.open) return;
  const preview = view.history?.importPreview;
  if (!preview) {
    body.innerHTML = "";
    return;
  }
  const stats = preview.stats ?? {};
  const confidence = { high: 0, medium: 0, low: 0 };
  for (const match of preview.matches ?? []) {
    confidence[match.confidence] = (confidence[match.confidence] ?? 0) + 1;
  }
  body.innerHTML = `
    <p class="muted">Archivo: ${escapeHtml(view.history?.importSource ?? "historial")}</p>
    <div class="lcu-status-grid">
      <div><span class="field-label">Bloques</span><strong>${stats.blocks ?? 0}</strong></div>
      <div><span class="field-label">Partidas</span><strong>${stats.matches ?? 0}</strong></div>
      <div><span class="field-label">Victorias / derrotas</span><strong>${stats.wins ?? 0} / ${stats.losses ?? 0}</strong></div>
      <div><span class="field-label">Sin resultado</span><strong>${stats.unknown_results ?? 0}</strong></div>
      <div><span class="field-label">Confianza alta</span><strong>${confidence.high}</strong></div>
      <div><span class="field-label">Confianza media / baja</span><strong>${confidence.medium} / ${confidence.low}</strong></div>
      <div><span class="field-label">Picks / bans rebalanceados</span><strong>${stats.rebalanced_picks ?? 0} / ${stats.rebalanced_bans ?? 0}</strong></div>
      <div><span class="field-label">Tokens por revisar</span><strong>${stats.unknown_tokens ?? 0}</strong></div>
    </div>
    ${
      preview.unknown_tokens?.length
        ? `<div class="history-token-row">${preview.unknown_tokens
            .slice(0, 16)
            .map(
              (token) =>
                `<span class="history-token" title="${escapeHtml((token.examples ?? []).join(" · "))}">${escapeHtml(token.token)} <b>${token.count}</b></span>`,
            )
            .join("")}</div>`
        : ""
    }
    ${
      preview.blocks?.filter((block) => block.warnings?.length).length
        ? `<div class="notice-list">${preview.blocks
            .filter((block) => block.warnings?.length)
            .slice(0, 6)
            .map(
              (block) =>
                `<p class="notice">Bloque ${block.index}: ${escapeHtml(block.warnings[0])}</p>`,
            )
            .join("")}</div>`
        : ""
    }
    <p class="callout">Se guardará una copia de seguridad del historial actual antes de importar. Los nombres se conservan; puedes renombrar rivales después.</p>
  `;
}

function renderHistoryMatchBody(view) {
  const dialog = document.getElementById("history-match-dialog");
  const body = document.getElementById("history-match-body");
  if (!body) return;
  if (dialog?.open) return;
  const match = view.history?.store?.matches?.find(
    (item) => item.id === view.history.selectedMatchId,
  );
  if (!match) {
    body.innerHTML = "";
    return;
  }
  const rivals = match.rivals ?? [];
  body.innerHTML = `
    <div class="history-dialog-headline">
      <span class="history-result is-${escapeHtml(match.result)}">${escapeHtml(resultLabel(match.result))}</span>
      <span class="muted">${escapeHtml(formatHistoryDate(match))} · ${escapeHtml(queueLabel(match.queue))} · confianza ${escapeHtml(confidenceLabel(match.confidence))}</span>
    </div>
    <div class="history-dialog-grid">
      <label class="field"><span class="field-label">Resultado</span>
        <select id="history-match-result">
          ${["win", "loss", "unknown"]
            .map(
              (value) =>
                `<option value="${value}" ${match.result === value ? "selected" : ""}>${resultLabel(value)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="field"><span class="field-label">Cola</span>
        <select id="history-match-queue">
          ${["clash", "ranked_solo", "ranked_flex", "normal_draft", "custom", "unknown"]
            .map(
              (value) =>
                `<option value="${value}" ${match.queue === value ? "selected" : ""}>${queueLabel(value)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="field"><span class="field-label">Lado</span>
        <select id="history-match-side">
          <option value="" ${!match.side ? "selected" : ""}>Sin lado</option>
          <option value="BLUE" ${match.side === "BLUE" ? "selected" : ""}>Azul</option>
          <option value="RED" ${match.side === "RED" ? "selected" : ""}>Rojo</option>
        </select>
      </label>
      <label class="field"><span class="field-label">Primer ban</span>
        <select id="history-match-first-ban">
          <option value="" ${!match.first_ban ? "selected" : ""}>Sin dato</option>
          <option value="us" ${match.first_ban === "us" ? "selected" : ""}>Nosotros</option>
          <option value="them" ${match.first_ban === "them" ? "selected" : ""}>Ellos</option>
        </select>
      </label>
    </div>
    <label class="field"><span class="field-label">Notas</span>
      <textarea id="history-match-notes" rows="3">${escapeHtml((match.notes ?? []).join("\n"))}</textarea>
    </label>
    <div class="history-detail-section">
      <h3>Nosotros</h3>
      <p class="muted">Bans: ${historyChampionInline(match.our_bans)}</p>
      <p class="muted">Picks: ${historyPickInline(match.our_picks)}</p>
    </div>
    <div class="history-detail-section">
      <h3>Rivales</h3>
      <p class="muted">Bans: ${historyChampionInline(match.enemy_bans)}</p>
      <p class="muted">Picks: ${historyPickInline(match.enemy_picks)}</p>
    </div>
    ${historyMatchStats(match)}
    ${
      rivals.length
        ? `<div class="history-detail-section">
            <h3>Scouting rival</h3>
            <div class="history-rival-list">
              ${rivals
                .map(
                  (rival) => `
                  <div class="history-rival-line">
                    <span class="role-badge">${escapeHtml(rival.role ? roleShort(rival.role) : rival.role_label ?? "FLEX")}</span>
                    <strong>${escapeHtml(rival.name)}</strong>
                    <span class="muted">${escapeHtml(
                      (rival.pool_groups ?? [])
                        .flat()
                        .slice(0, 6)
                        .map(championNameOf)
                        .join(", ") || "sin pool",
                    )}</span>
                  </div>
                `,
                )
                .join("")}
            </div>
          </div>`
        : ""
    }
    ${
      match.warnings?.length
        ? `<div class="notice-list">${match.warnings
            .map((warning) => `<p class="notice">${escapeHtml(warning)}</p>`)
            .join("")}</div>`
        : ""
    }
  `;
}

function historyMatchStats(match) {
  const stats = match.player_stats ?? [];
  if (!stats.length) return "";
  const ourStats = match.our_stats ?? {};
  const enemyStats = match.enemy_stats ?? {};
  const our = stats.filter((stat) => stat.team === "our");
  const enemy = stats.filter((stat) => stat.team === "enemy");
  return `
    <div class="history-detail-section">
      <h3>Estadísticas de la partida</h3>
      <p class="muted">Duración: ${formatGameTime(match.duration_seconds ?? 0)}</p>
      <div class="live-save-score">
        <div>
          <span class="field-label">Nosotros</span>
          <strong>${ourStats.kills ?? 0}</strong>
          <span class="muted">kills · ${ourStats.towers ?? 0} torres · ${ourStats.dragons ?? 0} dragones · ${ourStats.barons ?? 0} barones</span>
        </div>
        <div>
          <span class="field-label">Rival</span>
          <strong>${enemyStats.kills ?? 0}</strong>
          <span class="muted">kills · ${enemyStats.towers ?? 0} torres · ${enemyStats.dragons ?? 0} dragones · ${enemyStats.barons ?? 0} barones</span>
        </div>
      </div>
      <div class="live-save-teams">
        <div>
          <p class="field-label">Nosotros</p>
          <div class="live-save-stats">${our.map(liveSaveStatRow).join("")}</div>
        </div>
        <div>
          <p class="field-label">Rival</p>
          <div class="live-save-stats">${enemy.map(liveSaveStatRow).join("")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderHistorySaveBody(view) {
  const dialog = document.getElementById("history-save-dialog");
  const body = document.getElementById("history-save-body");
  if (!body) return;
  if (dialog?.open) return;
  const match = view.history?.pendingMatch;
  if (!match) {
    body.innerHTML = "";
    return;
  }
  const complete = isCompleteMatch(match);
  body.innerHTML = `
    <div class="history-dialog-headline">
      <span class="history-result is-unknown">Partida del draft actual</span>
      <span class="muted">${escapeHtml(queueLabel(match.queue))} · ${escapeHtml(historySideLabel(match.side))}</span>
    </div>
    <div class="history-detail-section">
      <p class="muted">Nuestros picks: ${historyPickInline(match.our_picks)}</p>
      <p class="muted">Picks rivales: ${historyPickInline(match.enemy_picks)}</p>
      <p class="muted">Bans: ${historyChampionInline([...(match.our_bans ?? []), ...(match.enemy_bans ?? [])])}</p>
    </div>
    ${
      complete
        ? ""
        : `<p class="notice">La partida está incompleta. Se guardará con confianza media y no contará para algunas estadísticas.</p>`
    }
    <div class="history-dialog-grid">
      <label class="field"><span class="field-label">Resultado</span>
        <select id="history-save-result">
          <option value="unknown">Sin resultado</option>
          <option value="win">Victoria</option>
          <option value="loss">Derrota</option>
        </select>
      </label>
    </div>
    <label class="field"><span class="field-label">Notas</span>
      <textarea id="history-save-notes" rows="3" placeholder="Ej.: ff, afk, remontada, draft raro…"></textarea>
    </label>
  `;
}

function renderHistoryRenameBody(view) {
  const dialog = document.getElementById("history-rename-dialog");
  const body = document.getElementById("history-rename-body");
  if (!body) return;
  if (dialog?.open) return;
  const rename = view.history?.renameRival;
  if (!rename) {
    body.innerHTML = "";
    return;
  }
  body.innerHTML = `
    <label class="field">
      <span class="field-label">Nombre del rival</span>
      <input id="history-rename-input" type="text" maxlength="48" value="${escapeHtml(rename.from)}" />
    </label>
    <p class="callout">Se actualizarán todas las partidas donde aparezca este nombre. También se guardará como alias para futuras importaciones.</p>
  `;
}

function historyChampionInline(champions) {
  if (!champions?.length) return "—";
  return champions
    .map((championId) => escapeHtml(championNameOf(championId)))
    .join(", ");
}

function historyPickInline(picks) {
  if (!picks?.length) return "—";
  return picks
    .map((pick) => escapeHtml(championNameOf(pick.champion_id)))
    .join(", ");
}

const CLASH_TIERS = {
  IRON: "Hierro",
  BRONZE: "Bronce",
  SILVER: "Plata",
  GOLD: "Oro",
  PLATINUM: "Platino",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Maestro",
  GRANDMASTER: "Gran Maestro",
  CHALLENGER: "Retador",
};

function clashHeaderChip(view, includeInClash = false) {
  if (view.view === "clash" && !includeInClash) return "";
  const live = view.clash?.data;
  const overview = view.clashOverview?.data;
  const enabled = live?.enabled ?? overview?.enabled ?? false;
  if (!enabled) return "";
  const tournament = live?.tournament ?? overview?.tournament;
  if (!tournament) return "";
  if (tournament.state === "RESULTS" || tournament.state === "CANCELLED") return "";
  if (tournament.end_time_ms && Number(tournament.end_time_ms) < Date.now()) return "";
  const team = live?.roster ?? overview?.team;
  const when =
    tournament.next_state_change_ms ??
    tournament.lockin_start_ms ??
    tournament.start_time_ms;
  const whenText = when
    ? formatClashHeaderTime(when)
    : tournament.state_label ?? "Clash";
  const teamText = team?.name ?? team?.short_name ?? "Sin equipo";
  const label = `Clash · ${tournament.subtitle ?? tournament.name} · ${whenText} · ${teamText}`;
  return `<button class="context-chip context-clash" type="button" data-action="view" data-view="clash" title="Abrir Rival de Clash">${escapeHtml(label)}</button>`;
}

function formatClashHeaderTime(ms) {
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return "Sin horario";
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (sameLocalDay(date, now)) return `hoy ${time}`;
  if (sameLocalDay(date, tomorrow)) return `mañana ${time}`;
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" })
    .format(date)
    .replace(/\.$/, "");
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${weekday} ${day}/${month} ${time}`;
}

function sameLocalDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function clashView(view) {
  const clash = view.clash ?? {};
  const data = clash.data;
  const loading = Boolean(clash.loading);
  let body = "";
  if (data) {
    body = clashBody(data);
  } else if (loading) {
    body = clashLoading();
  } else if (!clash.error) {
    body = clashEmpty("Abrí League of Legends y esperá a que el cliente esté disponible.");
  }

  return `
    ${clashPageHead(view)}
    ${clash.error ? clashError(clash.error) : ""}
    ${body}
  `;
}

function clashPageHead(view) {
  const clash = view.clash ?? {};
  const loading = Boolean(clash.loading);
  const enabled = Boolean(clash.data?.enabled);
  return `
    <div class="page-head">
      <div>
        <h1>Rival de Clash</h1>
        <p class="muted">Bracket, rival, rangos y últimas partidas leídos del cliente local. Todo es solo lectura.</p>
      </div>
      <div class="inline-actions clash-head-actions">
        <span class="status-dot ${enabled ? "is-ok" : ""}" title="${enabled ? "Clash habilitado" : "Clash no disponible"}"></span>
        <button class="button button-ghost" type="button" data-action="refresh-clash" ${loading ? "disabled" : ""}>
          ${loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
    </div>
  `;
}

function clashBody(data) {
  const hasInfo = Boolean(
    data.tournament || data.roster || data.bracket || data.next_match || data.opponent,
  );
  if (!hasInfo) {
    return clashEmpty(data.message ?? "No hay un torneo de Clash activo para tu cuenta.");
  }
  const showNotice = Boolean(
    data.message && (data.roster || data.opponent || data.bracket || data.next_match),
  );
  return `
    ${showNotice ? `<p class="notice clash-notice">${escapeHtml(data.message)}</p>` : ""}
    ${clashSummaryGrid(data)}
    ${data.tournament ? clashSchedulePanel(data.tournament) : ""}
    ${data.roster ? clashOurTeamPanel(data.roster) : data.tournament ? clashNoTeamPanel() : ""}
    ${data.next_match ? clashMatchPanel(data) : ""}
    ${data.opponent ? clashOpponentPanel(data.opponent) : ""}
    <p class="clash-footnote">Datos del cliente local de League of Legends. La app no envía picks, bans ni consultas a Riot.</p>
  `;
}

function clashSummaryGrid(data) {
  const tournament = data.tournament;
  const roster = data.roster;
  const bracket = data.bracket;
  const match = data.next_match;
  const tournamentDetail = tournament
    ? tournament.next_state_change_ms
      ? `${tournament.state_label} · ${formatClashTime(tournament.next_state_change_ms)}`
      : tournament.state_label
    : "Sin torneo";
  const rosterDetail = roster
    ? `Tier ${roster.tier ?? "—"} · ${roster.accepted_count ?? 0}/${roster.member_count ?? 5} aceptados${roster.pending_count ? ` · ${roster.pending_count} pendientes` : ""} · ${roster.wins}-${roster.losses}`
    : "Creá un equipo o unite a uno";
  const bracketDetail = bracket
    ? `${bracket.size ?? "?"} equipos · ${bracket.roster_count} rosters${bracket.is_complete ? " · completo" : ""}`
    : "Esperando que se forme";
  const matchDetail = match
    ? `${match.status_label}${match.game_start_time_ms ? ` · ${formatClashTime(match.game_start_time_ms)}` : ""}`
    : "Sin partido asignado";
  const tournamentSubtitle = tournament?.subtitle
    ? `${tournament.subtitle} · ${tournamentDetail}`
    : tournamentDetail;
  return `
    <section class="clash-summary-grid" aria-label="Resumen de Clash">
      ${clashSummaryCard("Torneo", tournament?.name ?? "Clash", tournamentSubtitle)}
      ${clashSummaryCard("Nuestro equipo", roster?.name ?? roster?.short_name ?? "Sin equipo", rosterDetail)}
      ${clashSummaryCard("Bracket", bracket ? `#${bracket.id}` : "Sin bracket", bracketDetail)}
      ${clashSummaryCard("Próximo partido", match?.opponent_name ? `vs ${match.opponent_name}` : "Sin rival", matchDetail)}
    </section>
  `;
}

function clashSummaryCard(label, value, detail) {
  return `
    <article class="clash-summary-card">
      <span class="field-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function clashSchedulePanel(tournament) {
  const now = Date.now();
  const items = [
    ["Lock-in", tournament.lockin_start_ms],
    ["Scouting", tournament.scouting_start_ms],
    ["Inicio", tournament.start_time_ms],
    ["Fin", tournament.end_time_ms],
  ].filter(([, ms]) => {
    if (!ms) return false;
    return ms >= now || ms === tournament.end_time_ms;
  });
  if (!items.length) return "";
  return `
    <section class="clash-panel clash-schedule-panel">
      <header class="panel-head">
        <div>
          <h2>Calendario de Clash</h2>
          <p class="muted">${escapeHtml(tournament.state_label ?? "Sin estado")}</p>
        </div>
      </header>
      <div class="clash-schedule-grid">
        ${items
          .map(
            ([label, ms]) => `
              <div class="clash-schedule-item">
                <span class="field-label">${escapeHtml(label)}</span>
                <strong>${escapeHtml(formatClashTime(ms))}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function clashOurTeamPanel(roster) {
  const members = roster.members ?? [];
  const state = roster.state_label ?? "Sin estado";
  const registered = roster.is_registered ? "Registrado" : "No registrado";
  return `
    <section class="clash-panel clash-team-panel">
      <header class="panel-head">
        <div>
          <h2>Nuestro equipo: ${escapeHtml(roster.name ?? "Sin nombre")}${roster.short_name ? ` <span class="clash-tag">(${escapeHtml(roster.short_name)})</span>` : ""}</h2>
          <p class="muted">
            ${escapeHtml(state)} · Tier ${roster.tier ?? "—"} · ${roster.accepted_count ?? 0}/${roster.member_count ?? 5} aceptados${roster.pending_count ? ` · ${roster.pending_count} pendientes` : ""} · ${roster.wins ?? 0}-${roster.losses ?? 0}
          </p>
        </div>
        <span class="context-chip ${roster.is_registered ? "is-ok" : ""}">${registered}</span>
      </header>
      ${
        members.length
          ? `<div class="clash-team-list">${members.map(clashMemberRow).join("")}</div>`
          : `<p class="muted clash-empty-note">El cliente no expuso los miembros del equipo.</p>`
      }
    </section>
  `;
}

function clashMemberRow(member) {
  const stateClass = member.is_pending
    ? "is-pending"
    : member.state === "READY"
      ? "is-ready"
      : "is-accepted";
  const tag = member.tag_line
    ? `<span class="clash-tag">#${escapeHtml(String(member.tag_line).replace(/^#/, ""))}</span>`
    : "";
  const captain = member.is_captain ? `<span class="clash-captain">Capitán</span>` : "";
  const readyNote =
    member.state === "NOT_READY" || member.state === "FORCED_NOT_READY"
      ? " · No listo"
      : "";
  return `
    <div class="clash-member-row">
      <span class="role-badge">${escapeHtml(member.position_label ?? "Flex")}</span>
      <div class="clash-member-copy">
        <strong>${escapeHtml(member.display_name ?? "Jugador")} ${tag} ${captain}</strong>
        <small>${member.tier ? `Tier ${member.tier}` : "Sin tier"}${readyNote}</small>
      </div>
      <span class="clash-member-state ${stateClass}">${escapeHtml(member.state_label ?? "Sin estado")}</span>
    </div>
  `;
}

function clashNoTeamPanel() {
  return `
    <section class="clash-panel clash-no-team">
      <h2>Todavía no tenés un equipo de Clash</h2>
      <p class="muted">Creá un equipo o unite a uno desde League of Legends. Cuando estés dentro, tocá <strong>Actualizar</strong>.</p>
      <div class="inline-actions">
        <button class="button button-primary" type="button" data-action="refresh-clash">Actualizar</button>
      </div>
    </section>
  `;
}

function clashMatchPanel(data) {
  const match = data.next_match;
  const ourName = match.our_roster_name ?? data.roster?.name ?? "Nuestro equipo";
  const opponentName = match.opponent_name ?? "Equipo rival";
  const result = match.result === "win" ? "Victoria" : match.result === "loss" ? "Derrota" : null;
  const title = match.is_completed
    ? "Partido finalizado"
    : match.status === "STARTED"
      ? "Partido en curso"
      : "Próximo partido";
  return `
    <section class="clash-panel clash-match-panel">
      <header class="panel-head">
        <div>
          <h2>${title}</h2>
          <p class="muted">
            ${match.round ? `Ronda ${match.round} · ` : ""}${escapeHtml(match.status_label)}
            ${match.game_start_time_ms ? ` · ${escapeHtml(formatClashTime(match.game_start_time_ms))}` : ""}
          </p>
        </div>
        ${result ? `<span class="clash-result is-${match.result}">${result}</span>` : ""}
      </header>
      <div class="clash-match-teams">
        <div class="clash-team">
          <span class="field-label">Nosotros</span>
          <strong>${escapeHtml(ourName)}</strong>
        </div>
        <span class="clash-vs">vs</span>
        <div class="clash-team is-opponent">
          <span class="field-label">Rival</span>
          <strong>${escapeHtml(opponentName)}</strong>
        </div>
      </div>
    </section>
  `;
}

function clashOpponentPanel(opponent) {
  const players = opponent.players ?? [];
  return `
    <section class="clash-panel">
      <header class="panel-head">
        <div>
          <h2>Rival: ${escapeHtml(opponent.name ?? "Equipo rival")}</h2>
          <p class="muted">
            ${opponent.short_name ? `${escapeHtml(opponent.short_name)} · ` : ""}${opponent.tier ? `Tier ${opponent.tier} · ` : ""}${opponent.wins ?? 0}-${opponent.losses ?? 0} · ${players.length} jugador${players.length === 1 ? "" : "es"} · datos del cliente
          </p>
        </div>
        <span class="context-chip">${players.length}/5</span>
      </header>
      ${
        players.length
          ? `<div class="clash-player-grid">${players.map(clashPlayerCard).join("")}</div>`
          : `<p class="muted clash-empty-note">El cliente todavía no expone los jugadores del rival. Reintentá cuando el bracket esté listo.</p>`
      }
    </section>
  `;
}

function clashPlayerCard(player) {
  const ranks = player.ranks ?? [];
  const scouting = player.scouting;
  const seasonChampions = (scouting?.season_champions ?? []).slice(0, 5);
  const masteries = (scouting?.masteries ?? []).slice(0, 5);
  const recentMatches = (player.recent_matches ?? []).slice(0, 5);
  const primaryRank = ranks[0];
  return `
    <article class="clash-player-card">
      <header class="clash-player-head">
        <span class="role-badge">${escapeHtml(player.position_label ?? "Flex")}</span>
        <div class="clash-player-identity">
          <h3>
            ${escapeHtml(player.display_name)}
            ${player.tag_line ? `<span class="clash-tag">#${escapeHtml(String(player.tag_line).replace(/^#/, ""))}</span>` : ""}
          </h3>
          <p class="muted">
            ${player.level ? `Nivel ${player.level}` : "Nivel —"}
            ${player.member_state ? ` · ${escapeHtml(clashMemberStateLabel(player.member_state))}` : ""}
          </p>
        </div>
        <span class="clash-rank-badge">${escapeHtml(primaryRank ? clashRankShort(primaryRank) : "Sin rank")}</span>
      </header>
      ${ranks.length ? `<div class="clash-rank-row">${ranks.map(clashRankChip).join("")}</div>` : ""}
      ${
        seasonChampions.length
          ? `<div class="clash-section">
              <span class="field-label">Campeones de la temporada</span>
              <div class="clash-champion-list">${seasonChampions.map(clashSeasonChampion).join("")}</div>
            </div>`
          : ""
      }
      ${
        masteries.length
          ? `<div class="clash-section">
              <span class="field-label">Maestría</span>
              <div class="clash-mastery-list">${masteries.map(clashMastery).join("")}</div>
            </div>`
          : ""
      }
      ${
        recentMatches.length
          ? `<div class="clash-section">
              <span class="field-label">Últimas partidas</span>
              <div class="clash-match-list">${recentMatches.map(clashRecentMatch).join("")}</div>
            </div>`
          : ""
      }
      ${
        !seasonChampions.length && !recentMatches.length
          ? `<p class="muted clash-empty-note">Sin datos de campeones o partidas para este jugador.</p>`
          : ""
      }
    </article>
  `;
}

function clashRankShort(rank) {
  const tierKey = String(rank?.tier ?? "").toUpperCase();
  const tier = CLASH_TIERS[tierKey] ?? rank?.tier ?? "Sin rank";
  return `${tier}${rank?.division ? ` ${rank.division}` : ""}`;
}

function clashRankChip(rank) {
  const parts = [rank.queue_label, clashRankShort(rank)];
  if (rank.league_points != null) parts.push(`${rank.league_points} LP`);
  if (rank.winrate != null) parts.push(`${Math.round(rank.winrate)}%`);
  if (rank.provisional) parts.push("Provisional");
  return `<span class="clash-rank-chip ${rank.provisional ? "is-provisional" : ""}">${escapeHtml(parts.join(" · "))}</span>`;
}

function clashSeasonChampion(entry) {
  const champion = championById(entry.champion_id);
  const name = champion?.name ?? entry.champion_name ?? entry.champion_id;
  const winrate = entry.winrate != null ? `${Math.round(entry.winrate)}%` : "—";
  return `
    <span class="clash-champion-chip">
      ${clashChampionAvatar(entry.champion_id, name, "clash-champion-avatar")}
      <span class="clash-chip-copy">
        <strong>${escapeHtml(name)}</strong>
        <small>${entry.games ?? 0} PJ · ${winrate}${entry.kda ? ` · ${escapeHtml(entry.kda)} KDA` : ""}</small>
      </span>
    </span>
  `;
}

function clashMastery(entry) {
  const champion = championById(entry.champion_id);
  const name = champion?.name ?? entry.champion_name ?? entry.champion_id;
  return `
    <span class="clash-mastery-chip">
      ${clashChampionAvatar(entry.champion_id, name, "clash-mastery-avatar")}
      <span class="clash-chip-copy">
        <strong>${escapeHtml(name)}</strong>
        <small>M${entry.level ?? 0} · ${formatClashPoints(entry.points)}</small>
      </span>
    </span>
  `;
}

function clashRecentMatch(match) {
  const champion = championById(match.champion_id);
  const name = champion?.name ?? match.champion_name ?? match.champion_id;
  const result = match.win === true ? "V" : match.win === false ? "D" : "?";
  const resultClass = match.win === true ? "win" : match.win === false ? "loss" : "unknown";
  return `
    <div class="clash-match-row">
      <span class="clash-result is-${resultClass}" title="${resultClass === "win" ? "Victoria" : resultClass === "loss" ? "Derrota" : "Sin resultado"}">${result}</span>
      ${clashChampionAvatar(match.champion_id, name, "clash-match-avatar")}
      <span class="clash-match-champion">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(match.queue_name ?? "Partida")}${match.role ? ` · ${escapeHtml(match.role)}` : ""}</small>
      </span>
      <span class="clash-match-kda">${match.kills ?? 0}/${match.deaths ?? 0}/${match.assists ?? 0}</span>
      <span class="clash-match-date">${escapeHtml(formatClashShortDate(match.played_at_ms))}</span>
    </div>
  `;
}

function clashChampionAvatar(championId, name, className) {
  const champion = championById(championId);
  if (!champion) {
    return `<span class="champion-avatar ${className} clash-avatar-missing" title="${escapeHtml(name)}">?</span>`;
  }
  return championAvatar(champion, className);
}

function clashMemberStateLabel(state) {
  return (
    {
      READY: "Listo",
      NOT_READY: "No listo",
      FORCED_NOT_READY: "No listo",
      PENDING: "Pendiente",
      DECLINED: "Rechazó",
    }[state] ?? state
  );
}

function formatClashPoints(points) {
  const value = Number(points) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function formatClashTime(ms) {
  if (!ms) return "Sin horario";
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return "Sin horario";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatClashShortDate(ms) {
  if (!ms) return "";
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function clashEmpty(message) {
  return `
    <div class="history-empty-panel clash-empty">
      <div class="history-empty-mark">C</div>
      <h2>Sin datos de Clash</h2>
      <p class="muted">${escapeHtml(message ?? "No hay un torneo activo para tu cuenta.")}</p>
      <div class="inline-actions">
        <button class="button button-primary" type="button" data-action="refresh-clash">Actualizar</button>
      </div>
    </div>
  `;
}

function clashError(message) {
  return `
    <div class="notice-list clash-error">
      <p class="notice notice-error">${escapeHtml(message)}</p>
      <button class="button button-ghost button-small" type="button" data-action="refresh-clash">Reintentar</button>
    </div>
  `;
}

function clashLoading() {
  return `
    <div class="clash-loading">
      <div class="clash-summary-grid">
        <div class="clash-summary-card skeleton"></div>
        <div class="clash-summary-card skeleton"></div>
        <div class="clash-summary-card skeleton"></div>
        <div class="clash-summary-card skeleton"></div>
      </div>
      <div class="clash-panel skeleton clash-panel-skeleton"></div>
    </div>
  `;
}

function lcuSettingsSection(view) {
  const status = view.lcu?.status;
  const auto = Boolean(view.lcu?.auto);
  const template = view.bootstrap?.templates?.find(
    (item) => item.id === status?.template_id,
  );
  const disabled = view.preview ? "disabled" : "";
  const statusText = lcuStatusText(status, auto);
  const side = status?.side ? sideLabel(status.side) : "—";
  const action = status?.current_action;
  return `
    <section class="settings-section settings-lcu">
      <header class="panel-head">
        <div>
          <h2>Cliente de League</h2>
        </div>
        <span class="lcu-dot ${lcuDotClass(status, auto)}"></span>
      </header>
      <div class="lcu-status-grid">
        <div><span class="field-label">Estado</span><strong>${escapeHtml(statusText)}</strong></div>
        <div><span class="field-label">Cola</span><strong>${escapeHtml(status?.queue_name ?? "—")}</strong></div>
        <div><span class="field-label">Plantilla</span><strong>${escapeHtml(template?.name ?? status?.template_id ?? "—")}</strong></div>
        <div><span class="field-label">Lado</span><strong>${escapeHtml(side)}</strong></div>
      </div>
      ${
        action
          ? `<div class="path-block">
              <span class="field-label">Acción actual</span>
              <code>${escapeHtml(action.label)} · ${action.seconds_left ?? "—"} s · acción ${action.action_id}</code>
            </div>`
          : ""
      }
      <div class="path-block">
        <span class="field-label">Última sincronización</span>
        <code>${escapeHtml(formatSyncTime(status?.last_sync_ms))}</code>
      </div>
      ${
        status?.state === "reconnecting" || status?.state === "error"
          ? `<p class="muted">La app reintentará automáticamente cuando el cliente esté disponible.</p>`
          : ""
      }
      <p class="muted lcu-settings-note">Solo lectura: la app no envía picks ni bans al cliente. Tampoco modifica la prioridad estricta del pool ni el flex fuera de rol.</p>
      <div class="inline-actions">
        <button class="button ${auto ? "button-danger-ghost" : "button-ghost"}" type="button"
          data-action="${auto ? "stop-lcu" : "start-lcu"}" ${disabled}>
          ${auto ? "Detener seguimiento" : "Activar seguimiento"}
        </button>
        <button class="button button-ghost" type="button" data-action="refresh-lcu" ${disabled}>
          Actualizar estado
        </button>
        <button class="button button-ghost" type="button" data-action="view" data-view="clash">
          Ver rival de Clash
        </button>
      </div>
    </section>
  `;
}

function historySettingsSection(view) {
  const data = view.bootstrap?.data;
  const count = view.history?.store?.matches?.length ?? 0;
  return `
    <section class="settings-section">
      <header class="panel-head">
        <div>
          <h2>Historial local</h2>
        </div>
        <span class="status-dot ${count ? "is-ok" : ""}"></span>
      </header>
      <div class="data-grid">
        <div><dt>Partidas</dt><dd>${count}</dd></div>
        <div><dt>Scouting</dt><dd>Rivales</dd></div>
        <div><dt>Formato</dt><dd>JSON</dd></div>
        <div><dt>Privado</dt><dd>Sí</dd></div>
      </div>
      <div class="path-block">
        <span class="field-label">Carpeta del historial</span>
        <code>${escapeHtml(data?.history_dir ?? "—")}</code>
      </div>
      <p class="muted">El historial se guarda en tu equipo. Puedes importar tu TXT de Clash, exportarlo a JSON/TXT y corregir nombres de rivales desde la pestaña Historial.</p>
      <div class="inline-actions">
        <button class="button button-ghost" type="button" data-action="history-import">Importar Clash</button>
        <button class="button button-ghost" type="button" data-action="history-export">Exportar historial</button>
        <button class="button button-ghost" type="button" data-action="history-open-dir">Abrir carpeta</button>
      </div>
    </section>
  `;
}

function updaterSettingsSection(view) {
  const update = view.update ?? {};
  const version = view.bootstrap?.app_version ?? "—";
  const busy = update.checking || update.installing;
  const disabled = view.preview || busy ? "disabled" : "";
  const status = updaterStatusText(update);
  return `
    <section class="settings-section settings-update">
      <header class="panel-head">
        <div>
          <h2>Aplicación</h2>
        </div>
        <span class="status-dot ${update.available ? "is-update" : update.error ? "is-error" : update.lastCheckedAt ? "is-ok" : ""}"></span>
      </header>
      <div class="setting-row">
        <div>
          <strong>Versión instalada</strong>
          <p>Draft Assist ${escapeHtml(version)}</p>
        </div>
        <button class="button button-ghost" type="button" data-action="check-update" ${disabled}>
          ${update.checking ? "Buscando…" : "Buscar actualizaciones"}
        </button>
      </div>
      <div class="setting-row">
        <div>
          <strong>Actualizaciones</strong>
          <p>${escapeHtml(status)}</p>
        </div>
        ${
          update.available
            ? `<button class="button button-primary button-small" type="button" data-action="open-update-dialog" ${update.installing ? "disabled" : ""}>
                ${update.installing ? "Instalando…" : "Actualizar"}
              </button>`
            : ""
        }
      </div>
      ${update.error ? `<p class="notice notice-error">${escapeHtml(update.error)}</p>` : ""}
      ${
        update.lastCheckedAt
          ? `<p class="muted update-checked">Última comprobación: ${escapeHtml(formatUpdateCheckTime(update.lastCheckedAt))}</p>`
          : ""
      }
      ${
        view.preview
          ? `<p class="muted update-checked">La vista previa estática no puede buscar actualizaciones.</p>`
          : ""
      }
    </section>
  `;
}

function updaterStatusText(update) {
  if (update.installing) return "Instalando la actualización…";
  if (update.checking) return "Buscando actualizaciones…";
  if (update.available) return `Versión ${update.version} disponible`;
  if (update.error) return "No se pudo comprobar";
  if (update.lastCheckedAt) return "Estás al día";
  return "Sin comprobar";
}

function formatUpdateCheckTime(milliseconds) {
  if (!milliseconds) return "—";
  return new Date(milliseconds).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lcuStatusText(status, auto = false) {
  if (!status) return "Sin comprobar";
  if (status.state === "preview") return "No disponible en la vista previa";
  if (status.state === "not_found") return "Cliente no encontrado";
  if (status.state === "connecting") return "Conectando";
  if (status.state === "reconnecting" || status.state === "error") return "Reconectando";
  if (status.connected) {
    return auto ? "Seguimiento activo" : "Cliente detectado · seguimiento apagado";
  }
  return "Desconectado";
}

function formatSyncTime(milliseconds) {
  if (!milliseconds) return "—";
  return new Date(milliseconds).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function settingsView(view) {
  const settings = view.state.settings;
  const data = view.bootstrap.data;
  const validation = view.validation;
  return `
    <div class="page-head">
      <div>
        <h1>Ajustes</h1>
        <p class="muted">Controla el peso del pool, los filtros de rol y la información local del motor.</p>
      </div>
      <div class="inline-actions">
        <button class="button button-ghost" type="button" data-action="export">Exportar estado</button>
        <button class="button button-ghost" type="button" data-action="import">Importar estado</button>
      </div>
    </div>

    <div class="settings-layout">
      <section class="settings-section">
        <header class="panel-head">
          <div>
            <h2>Recomendación</h2>
          </div>
        </header>
        <div class="setting-row">
          <div>
            <strong>Número de recomendaciones</strong>
            <p>Cuántas opciones devuelve el ranking.</p>
          </div>
          <input class="number-input" type="number" min="1" max="10" value="${settings.top_n}" data-action="set-top-n" />
        </div>
        <div class="setting-row">
          <div>
            <strong>Prioridad estricta del pool</strong>
            <p>Los campeones del pool siempre aparecen antes que los de fuera, aunque el meta tenga mejor score.</p>
          </div>
          <label class="switch">
            <input type="checkbox" data-action="toggle-pool-precedence" ${settings.pool_precedence ? "checked" : ""} />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <strong>Permitir flex fuera de rol</strong>
            <p>Incluye campeones flexibles aunque no sean de la línea principal del jugador.</p>
          </div>
          <label class="switch">
            <input type="checkbox" data-action="toggle-offrole-flex" ${settings.allow_offrole_flex ? "checked" : ""} />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <strong>Usar historial como desempate</strong>
            <p>Solo ajusta ±2 puntos con 3+ partidas. No cambia la prioridad estricta del pool ni el flex fuera de rol.</p>
          </div>
          <label class="switch">
            <input type="checkbox" data-action="toggle-use-history" ${settings.use_history ? "checked" : ""} />
            <span class="switch-track"></span>
          </label>
        </div>
      </section>

      ${lcuSettingsSection(view)}
      ${historySettingsSection(view)}
      ${updaterSettingsSection(view)}

      <section class="settings-section">
        <header class="panel-head">
          <div>
            <h2>Parche ${escapeHtml(data?.stats?.version ?? "—")}</h2>
          </div>
          <span class="status-dot ${validation?.valid === false ? "is-error" : "is-ok"}"></span>
        </header>
        <dl class="data-grid">
          <div><dt>Campeones</dt><dd>${data?.stats?.champions ?? "—"}</dd></div>
          <div><dt>Matchups</dt><dd>${data?.stats?.matchups ?? "—"}</dd></div>
          <div><dt>Sinergias</dt><dd>${data?.stats?.synergies ?? "—"}</dd></div>
          <div><dt>Plantillas</dt><dd>${data?.stats?.templates ?? "—"}</dd></div>
        </dl>
        <div class="path-block">
          <span class="field-label">Carpeta de datos editables</span>
          <code>${escapeHtml(data?.data_dir ?? "—")}</code>
        </div>
        <div class="path-block">
          <span class="field-label">Estado persistente</span>
          <code>${escapeHtml(data?.state_path ?? "—")}</code>
        </div>
        <div class="inline-actions">
          <button class="button button-ghost" type="button" data-action="open-data-dir">Abrir carpeta</button>
          <button class="button button-ghost" type="button" data-action="reload-data">Recargar datos</button>
        </div>
      </section>

      <section class="settings-section settings-about">
        <header class="panel-head">
          <div>
            <h2>Scoring explicado</h2>
          </div>
        </header>
        <p>El motor combina comfort, matchup de línea, sinergia estructural, carencias de composición, prioridad estática del parche y flexibilidad. En picks tempranos pesa más el pool y la seguridad; en picks tardíos gana peso el counter directo.</p>
        <p>Los bans se calculan por amenaza a tus picks y a los pools restantes, con penalización si el campeón está en tu propio pool (bans propios).</p>
        ${validation?.errors?.length ? `<div class="notice-list">${validation.errors.map((error) => `<p class="notice notice-error">${escapeHtml(error)}</p>`).join("")}</div>` : ""}
      </section>

      <section class="settings-section settings-about">
        <header class="panel-head">
          <div>
            <h2>Acerca de / Aviso legal</h2>
          </div>
        </header>
        <p>La app no automatiza picks ni bans; todas las acciones las confirma el usuario.</p>
        <p class="muted">Los datos son locales y editables. No hay llamadas a la Riot API ni scraping; el seguimiento LCU y la vista Rival solo hablan con el cliente local de League of Legends. El historial de partidas, picks, bans y resultados se guarda solo en tu equipo.</p>
        <p class="muted">Draft Assist isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p>
        <p class="muted">Los datos e imágenes de campeones son propiedad de Riot Games y se usan bajo la política de Riot/Data Dragon. No están cubiertos por la licencia MIT ni pueden usarse comercialmente.</p>
      </section>
    </div>
  `;
}

export function renderUpdateDialog(view) {
  const update = view.update ?? {};
  const dialog = document.getElementById("update-dialog");
  if (!dialog) return;

  const current = update.currentVersion ?? view.bootstrap?.app_version ?? "—";
  const next = update.version ?? "—";
  setElementText("update-current-version", current);
  setElementText("update-new-version", next);

  const subtitle = document.getElementById("update-dialog-subtitle");
  if (subtitle) {
    const date = formatUpdateDate(update.date);
    subtitle.textContent = date
      ? `Publicada el ${date}. La app se cerrará para instalar y volverá a abrirse.`
      : "La app se cerrará para instalar y volverá a abrirse.";
  }

  const notes = document.getElementById("update-notes");
  if (notes) {
    const text = (update.notes ?? "").trim();
    notes.textContent = text || "Sin notas para esta versión.";
    notes.classList.toggle("is-empty", !text);
  }

  const progress = document.getElementById("update-progress");
  if (progress) progress.hidden = !update.installing;

  const error = document.getElementById("update-error");
  if (error) {
    error.hidden = !update.error;
    error.textContent = update.error ?? "";
  }

  const installButton = document.getElementById("update-install-button");
  if (installButton) {
    installButton.disabled = Boolean(update.installing || update.checking);
    installButton.textContent = update.installing ? "Instalando…" : "Actualizar y reiniciar";
  }

  const dismissButton = dialog.querySelector('[data-action="dismiss-update"]');
  if (dismissButton) dismissButton.disabled = Boolean(update.installing);
  const closeButton = dialog.querySelector('.dialog-head button[value="cancel"]');
  if (closeButton) closeButton.disabled = Boolean(update.installing);

  if (update.installing) renderUpdateProgress(update.progress);
}

export function renderUpdateProgress(progress = app.update.progress) {
  const bar = document.getElementById("update-progress-bar");
  const label = document.getElementById("update-progress-label");
  const percentLabel = document.getElementById("update-progress-percent");
  if (!bar || !label) return;

  const downloaded = Number(progress?.downloaded) || 0;
  const total = Number(progress?.total) || 0;
  const percent =
    total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;

  if (percent === null) {
    bar.style.width = "35%";
    bar.classList.add("is-indeterminate");
    label.textContent =
      downloaded > 0 ? `Descargando… ${formatBytes(downloaded)}` : "Preparando la descarga…";
    if (percentLabel) percentLabel.textContent = "";
    return;
  }

  bar.style.width = `${percent}%`;
  bar.classList.remove("is-indeterminate");
  label.textContent = "Descargando…";
  if (percentLabel) {
    percentLabel.textContent = `${percent}% · ${formatBytes(downloaded)} de ${formatBytes(total)}`;
  }
}

function setElementText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function formatUpdateDate(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

if (typeof window !== "undefined") {
  window.addEventListener("draft-assist:update-progress", (event) => {
    renderUpdateProgress(event.detail);
  });
}

export function renderToasts(view) {
  const root = document.getElementById("toast-stack");
  if (!root) return;
  root.innerHTML = (view.toasts ?? []).map((toast) => `
    <div class="toast toast-${toast.tone}" role="status">
      <span>${escapeHtml(toast.message)}</span>
      <button type="button" class="icon-button icon-button-small" data-action="dismiss-toast" data-toast="${toast.id}" aria-label="Cerrar aviso">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </div>
  `).join("");
}

export function championDialogBody(view, picker, search = "", roleFilter = "ALL") {
  const player = picker.playerId
    ? view.state.roster.players.find((item) => item.id === picker.playerId)
    : currentTurn()?.currentPlayer;
  const role = picker.role ?? player?.role ?? null;
  const unavailable = unavailableChampions();
  const query = search.trim().toLowerCase();
  const allowFlex = Boolean(view.state.settings.allow_offrole_flex);

  let champions = view.bootstrap.champions.filter((champion) => {
    if (picker.mode === "pool") {
      if (player?.pool?.some((entry) => entry.champion_id === champion.id)) return false;
    }
    if (picker.mode === "pick" && picker.side === "our") {
      if (!role) return false;
      if (!champion.roles.includes(role)) {
        if (!allowFlex || champion.roles.length < 2) return false;
      }
    }
    if (roleFilter !== "ALL" && !champion.roles.includes(roleFilter)) return false;
    if (query && !`${champion.name} ${champion.id}`.toLowerCase().includes(query)) return false;
    return true;
  });

  champions = champions.sort((a, b) => {
    const aUnavailable = unavailable.has(a.id);
    const bUnavailable = unavailable.has(b.id);
    if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1;
    return a.name.localeCompare(b.name, "es");
  });

  const cards = champions.map((champion) => {
    const isUnavailable = unavailable.has(champion.id);
    const comfort = player ? comfortFor(player, champion.id) : null;
    const offRole = role && !champion.roles.includes(role);
    return `
      <button type="button" class="champion-card ${isUnavailable ? "is-unavailable" : ""} ${offRole ? "is-offrole" : ""}"
        ${isUnavailable ? "disabled" : `data-action="choose-champion" data-champion="${escapeHtml(champion.id)}"`}>
        ${championAvatar(champion, "champion-card-avatar")}
        <span class="champion-card-name">${escapeHtml(champion.name)}</span>
        <span class="champion-card-roles">${champion.roles.map(roleShort).join(" · ")}</span>
        ${comfort ? comfortMeter(comfort) : isUnavailable ? `<span class="champion-card-note">No disponible</span>` : ""}
      </button>
    `;
  }).join("");

  return {
    count: champions.length,
    role,
    html: cards || `<p class="empty-grid">No hay campeones que coincidan con el filtro.</p>`,
  };
}

export function renderChampionRoleFilter(active = "ALL") {
  const root = document.getElementById("champion-role-filter");
  if (!root) return;
  root.innerHTML = ["ALL", ...ROLES].map((role) => `
    <button type="button" class="filter-chip ${active === role ? "is-active" : ""}" aria-pressed="${active === role}" data-action="filter-role" data-role="${role}">
      ${role === "ALL" ? "Todos" : roleLabel(role)}
    </button>
  `).join("");
}

export function renderEnemyRoleExtra(picker) {
  const root = document.getElementById("champion-dialog-extra");
  if (!root) return;
  if (!(picker.mode === "pick" && picker.side === "enemy")) {
    root.innerHTML = "";
    return;
  }
  const preferred = picker.role;
  root.innerHTML = `
    <label class="field field-compact">
      <span class="field-label">Línea enemiga</span>
      <select id="enemy-role-select">
        <option value="" ${preferred ? "" : "selected"}>Inferida según campeón</option>
        ${ROLES.map((role) => `<option value="${role}" ${preferred === role ? "selected" : ""}>${roleLabel(role)}</option>`).join("")}
      </select>
    </label>
  `;
}

export function renderNewDraftOptions(view) {
  const templateSelect = document.getElementById("new-draft-template");
  if (templateSelect) {
    templateSelect.innerHTML = view.bootstrap.templates.map((template) => `
      <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)} — ${escapeHtml(template.description ?? "")}</option>
    `).join("");
  }
}

export function renderStepOptions(view) {
  const select = document.getElementById("step-select");
  if (!select) return;
  const template = currentTemplate();
  select.innerHTML = (template?.steps ?? []).map((step, index) => {
    const label = step.label || `${step.kind} ${step.team ?? "ambos"}`;
    return `<option value="${index}" ${index === view.state.draft.step_index ? "selected" : ""}>${String(index + 1).padStart(2, "0")} · ${escapeHtml(label)}</option>`;
  }).join("");
}
