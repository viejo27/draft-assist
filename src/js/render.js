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
  } else if (view.view === "settings") {
    root.innerHTML = settingsView(view);
  } else {
    root.innerHTML = draftView(view);
  }

  renderToasts(view);
}

function renderTopbar(view) {
  const context = document.getElementById("topbar-context");
  const undoButton = document.getElementById("undo-button");
  if (!context) return;

  if (!view.state) {
    context.innerHTML = `<span class="context-muted">Cargando draft…</span>`;
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

  root.innerHTML = `
    <span class="lcu-dot ${dot}"></span>
    <span class="lcu-label" title="${escapeHtml(status?.last_error ?? label)}">${escapeHtml(label)}</span>
    <button class="button button-small ${auto ? "button-danger-ghost" : "button-ghost"}" type="button"
      data-action="${auto ? "stop-lcu" : "start-lcu"}" ${disabled}>
      ${auto ? "Detener" : "Seguimiento"}
    </button>
  `;
}

function lcuDotClass(status, auto) {
  if (auto && !status?.connected) return "is-waiting";
  if (status?.state === "error") return "is-error";
  if (status?.connected) return "is-on";
  return "is-off";
}

function lcuShortLabel(status, auto) {
  if (!status) return auto ? "Buscando LCU…" : "LCU";
  if (status.state === "not_found") return "Sin cliente";
  if (status.state === "reconnecting") return "Reconectando…";
  if (status.state === "error") return "Error LCU";
  if (!status.connected) return auto ? "Buscando LCU…" : "LCU";
  if (status.phase === "ChampSelect" && status.current_action) {
    return status.current_action.label;
  }
  if (status.phase === "Lobby") {
    return status.queue_name ? `Lobby · ${status.queue_name}` : "Lobby";
  }
  if (status.phase === "InProgress") return "Partida en curso";
  if (status.phase === "EndOfGame") return "Fin de partida";
  return status.queue_name ? `LCU · ${status.queue_name}` : "LCU conectado";
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
  const notices = [...new Set([...(view.warnings ?? []), status?.last_error].filter(Boolean))];
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
        <p>${status?.last_error ? escapeHtml(status.last_error) : "League of Legends no está disponible."}</p>
        <p>Abre el cliente y entra a un lobby. La app seguirá intentando conectarse.</p>
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
          ? `<div class="notice-list">${notices.slice(0, 3).map((warning) => `<p class="notice ${warning === status?.last_error ? "notice-error" : ""}">${escapeHtml(warning)}</p>`).join("")}</div>`
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

function lcuSettingsSection(view) {
  const status = view.lcu?.status;
  const auto = Boolean(view.lcu?.auto);
  const template = view.bootstrap?.templates?.find(
    (item) => item.id === status?.template_id,
  );
  const disabled = view.preview ? "disabled" : "";
  const statusText = lcuStatusText(status);
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
        status?.last_error
          ? `<p class="notice notice-error">${escapeHtml(status.last_error)}</p>`
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
      </div>
    </section>
  `;
}

function lcuStatusText(status) {
  if (!status) return "Sin comprobar";
  if (status.state === "preview") return "No disponible en la vista previa";
  if (status.state === "not_found") return "Cliente no encontrado";
  if (status.state === "connecting") return "Conectando";
  if (status.state === "reconnecting") return "Reconectando";
  if (status.state === "error") return "Error";
  if (status.connected) return "Conectado";
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
      </section>

      ${lcuSettingsSection(view)}

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
        <p class="muted">Los datos son locales y editables. No hay llamadas a la Riot API ni scraping; el seguimiento LCU solo habla con el cliente local de League of Legends. En una próxima versión se podrán guardar datos de uso localmente para estadística personal.</p>
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
