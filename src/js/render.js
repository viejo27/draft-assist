import {
  app,
  currentTemplate,
  currentTurn,
  orderedPlayers,
  championById,
  unavailableChampions,
} from "./state.js";
import {
  championAvatar,
  comfortMeter,
  damageLabel,
  escapeHtml,
  formatScore,
  roleBadge,
  roleLabel,
  roleShort,
  scoreWidth,
  sideLabel,
  tierClass,
} from "./format.js";
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

  if (view.fatalError) {
    root.innerHTML = fatalState(view.fatalError);
  } else if (view.loading || !view.state) {
    root.innerHTML = loadingState();
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

  renderHistoryDialogs(view);
  renderToasts(view);
}

function renderTopbar(view) {
  const context = document.getElementById("topbar-context");
  const undoButton = document.getElementById("undo-button");
  if (!context) return;

  if (!view.state) {
    context.innerHTML = `<span class="context-muted">Cargando draft…</span>`;
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
}

function renderViewbar(view) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view.view);
  });

  renderLcuControl(view);

  const note = document.getElementById("viewbar-note");
  if (!note) return;
  if (view.loading) {
    note.textContent = "";
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

function rosterView(view) {
  const players = orderedPlayers();
  return `
    <div class="page-head">
      <div>
        <h1>Roster y pools</h1>
        <p class="muted">El orden de la lista define el orden de picks. El comfort va de 1 a 5; el winrate es opcional.</p>
      </div>
      <div class="inline-actions">
        <button class="button button-ghost" type="button" data-action="import">Importar JSON</button>
        <button class="button button-ghost" type="button" data-action="export">Exportar JSON</button>
      </div>
    </div>

    <div class="roster-list">
      ${players.map((player, index) => rosterPlayer(player, index)).join("")}
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
  const seasonChampions = (scouting?.season_champions ?? []).slice(0, 3);
  const masteries = (scouting?.masteries ?? []).slice(0, 3);
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
