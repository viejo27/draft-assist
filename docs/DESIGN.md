# Diseño técnico — Draft Assist

## 1. Alcance

Aplicación de escritorio Tauri v2 con motor de recomendación en Rust y UI en HTML/CSS/JS sin bundler. Todo el conocimiento de campeones, counters, sinergias y plantillas vive en JSON local. No hay llamadas a servicios externos en runtime: solo se leen las APIs locales del cliente (LCU y Live Client Data).

## 2. Arquitectura

```text
src/ (WebView)
  index.html, styles.css, main.js
  js/api.js       -> invoke() o preview estática
  js/state.js     -> estado, undo, autosave
  js/render.js    -> vistas y tarjetas
  js/history.js   -> estadísticas, filtros y perfiles de rivales
  js/format.js    -> helpers de presentación
        |
        | comandos Tauri
        v
src-tauri/
  commands.rs     -> bootstrap, recommend, save/load, reload, validate, LCU, historial
  persistence.rs  -> state.json + history/history.json
  lcu/            -> credenciales, cliente HTTP, mapeo y tracker LCU
  lcu/scouting.rs -> maestrías, rango, historial y champion mapping compartidos
  lcu/lobby.rs    -> scouting de lobby, champ select y Rival Live
  live/           -> Live Client Data, eventos, mapa y MatchRecord de partida
  lib.rs          -> RuntimeState + carga de datos
        |
        | path dependency
        v
crates/draft-engine/
  model.rs        -> tipos serde
  data.rs         -> catálogo + validación + carga embebida/editable
  templates.rs    -> turno actual, avance y pasos futuros
  scoring.rs      -> componentes, needs, sinergia, bans
  recommend.rs    -> ranking, resumen, próximos picks
  history/        -> modelos, parser de TXT, normalización y texto limpio
  data/*.json     -> dataset 16.21.1
  tests/          -> integración del motor
```

### Por qué un crate separado

El motor no importa Tauri. Se testea con `cargo test -p draft-engine` en menos de un segundo y el ejemplo CLI (`cargo run -p draft-engine --example demo`) no abre la ventana.

## 3. Modelo de datos

### Estado persistente

`AppState`:

```rust
pub struct AppState {
    pub version: u32,
    pub roster: Roster,
    pub draft: DraftState,
    pub settings: Settings,
}
```

- `Roster { players: Vec<Player>, pick_order: Vec<PlayerId> }`
- `Player { id, name, role, pool: Vec<PoolEntry> }`
- `PoolEntry { champion_id, comfort: 1..5, winrate: Option<f32> }`
- `DraftState { side, template_id, step_index, our_bans, enemy_bans, our_picks, enemy_picks, priorities, current_player_id, manual, lcu_turn }`
- `LcuTurn { phase, acting_side, player_id, pick_number, label }` (turno autoritativo del cliente, opcional)
- `TeamPick { player_id, champion_id, role }`
- `EnemyPick { champion_id, role: Option<Role> }`
- `ManualTurn { phase, acting_side, player_id }` (soporte de motor; la UI usa plantillas y salto de turno)
- `Settings { top_n, allow_offrole_flex, pool_precedence }`

### Catálogo

`champions.json` se genera desde Data Dragon 16.21.1 y guarda `id`, `key`, `name`, `title`, `image`, `tags` e `info`. Los 173 iconos se copian a `src/assets/champions/`.

`champion-meta.json` añade:

```json
{
  "roles": ["TOP"],
  "flex": false,
  "damage": "MAGIC",
  "priority": 4,
  "traits": {
    "frontline": 5, "engage": 4, "peel": 2, "cc": 5, "carry": 0.5,
    "scaling": 4, "early": 2, "splitpush": 2, "poke": 0,
    "sustain": 2, "waveclear": 3, "mobility": 1, "anti_tank": 2,
    "anti_heal": 0, "shield": 0.5, "utility": 2, "aoe": 3
  }
}
```

Los traits van de 0 a 5 y son editables. `flex` indica que el campeón puede ocupar más de una línea; el motor solo permite fuera de rol si `allow_offrole_flex` está activo.

### Matchups y sinergias

`matchups.json` usa `value` de -1 a 1 (positivo = el campeón gana la línea) y `severity` 1–3. `synergies.json` usa `value` 0–1. Si falta un matchup, el componente es neutral (0.5) y la UI lo advierte. Los datos se validan al arrancar: IDs existentes, sin autos, rangos correctos.

### Plantillas

`templates.json` contiene:

- **ranked**: un paso de bans simultáneos (5 por equipo) + picks `B1, R1, R2, B2, B3, R3, R4, B4, B5, R5`.
- **tournament**: bans `B,R,B,R,B,R`, picks `B1,R1,R2,B2,B3,R3`, bans `R,B,R,B`, picks `R4,B4,B5,R5`.

Cada `DraftStep` declara `kind` (`BAN`/`PICK`), `team` (`BLUE`/`RED`/null), `pick_number`, `simultaneous`, `ban_slots_per_team` y `label`.

El motor valida 5 picks y 5 bans por equipo en cada plantilla.

## 4. Flujo de recomendación

1. Cargar `GameData` embebida o desde `app_data_dir/data/`.
2. Validar el estado y calcular el turno desde `step_index` o `manual`.
3. Construir el resumen de composición aliada:
   - reparto AD/AP/mixed;
   - suma de traits;
   - carencias;
   - arquetipo.
4. Si el turno es enemigo, devolver resumen y un aviso; no inventar picks.
5. Si es ban propio, puntuar objetivos de ban.
6. Si es pick propio:
   - filtrar baneados, pickeados y roles no elegibles;
   - evaluar cada candidato;
   - ordenar;
   - devolver Top N y próximos picks tentativos.

## 5. Scoring de picks

Componentes normalizados 0..1:

| Componente | Cálculo |
|---|---|
| `comfort` | Comfort 1–5 → 0.2, 0.4, 0.6, 0.8, 1.0. Si hay winrate: 80% comfort + 20% normalización de 40–60%. Fuera de pool: 0.1. |
| `matchup` | `0.5 + 0.5 * value` contra el rival de línea. Neutral 0.5 si no hay dato. |
| `counter_risk` | Desventaja contra enemigos confirmados + counters conocidos que siguen libres. Si el rival de línea ya está pickeado, los counters de esa línea pesan mucho menos. |
| `synergy` | 60% mejor par curado + 40% sinergia estructural (frontline+carry, engage+AoE, peel+inmóvil, balance AD/AP, splitpush). |
| `needs` | Media ponderada de `severity * fit` para cada carencia. `fit` sale de traits o del tipo de daño. |
| `meta` | `priority / 5`. |
| `flex` | 40% nº de roles + 40% seguridad ciega + 20% prioridad meta. |

### Pesos

`scoring.json`:

| Perfil | matchup | synergy | needs | comfort | meta | flex | risk |
|---|---:|---:|---:|---:|---:|---:|---:|
| EARLY (picks 1–2) | 0.05 | 0.15 | 0.15 | 0.25 | 0.20 | 0.20 | 0.05 |
| MID (pick 3) | 0.15 | 0.20 | 0.20 | 0.20 | 0.10 | 0.15 | 0.10 |
| LATE (picks 4–5) | 0.22 | 0.22 | 0.18 | 0.22 | 0.06 | 0.10 | 0.12 |

Los pesos positivos se normalizan a 1; el riesgo se resta. Score final 0–100. Si el campeón está fuera del pool: `score * 0.72 - 6`.

### Prioridad estricta del pool

Con `pool_precedence = true` (default), la ordenación es:

```text
in_pool (true primero) -> score descendente -> prioridad meta -> nombre
```

Así se cumple “pool antes que meta”. Con el ajuste desactivado se ordena solo por score; el off-pool sigue penalizado y marcado.

### Carencias

Umbrales en `scoring.json`:

- frontline < 4; engage < 2; CC < 5; peel < 2; waveclear < 3.
- AP < 30% o AD < 30% del reparto.
- anti-tanque si el rival tiene 2+ frontline.
- prioridades manuales suman severidad 0.55.

`severity = (min - total) / min`, clamp 0..1. Las carencias se ordenan por severidad.

### Arquetipo

- Engage: engage ≥ 6 y AoE ≥ 5.
- Front-to-back: frontline ≥ 6 y carry ≥ 6.
- Poke: poke ≥ 6 y engage < 4.
- Splitpush: splitpush ≥ 5 y frontline < 4.
- Pick: CC ≥ 6 y movilidad ≥ 6.
- Balanced: resto.

## 6. Bans

Score de ban:

```text
100 * (
  0.30 * meta
+ 0.30 * threat
+ 0.15 * flex
+ 0.15 * denial
+ 0.10 * contested
- 0.25 * self_ban
)
```

- `threat`: cuánto counterea a nuestros picks y a los pools restantes (ponderado por comfort).
- `denial`: neutral 0.5 en v1 (no hay pools enemigos).
- `self_ban`: comfort máximo del campeón en nuestro roster; evita los bans propios.
- Se excluyen baneados y pickeados.

## 7. Próximos picks

Se simula el pick actual con la recomendación top, se avanza a los siguientes pasos propios (máximo 2) y se recalcula con `top_n = 3`. No se asumen picks enemigos futuros; la UI lo marca como tentativo.

## 8. Persistencia y datos editables

- Estado: `app_data_dir/state.json`, autosave con debounce de 260 ms.
- Historial: `app_data_dir/history/history.json`, guardado explícito con backup.
- Backups: `history.backup-<timestamp>.json`, se conservan los últimos 5.
- Exportaciones: `app_data_dir/exports/history-<timestamp>.json` y `.txt`.
- Datos: en el primer arranque se copian los JSON embebidos a `app_data_dir/data/`.
- Si un JSON editable falla, el motor cae a los datos embebidos y muestra un aviso.
- “Recargar datos” reconstruye el motor desde disco.
- Export/import de estado completo desde la UI.

## 9. Seguimiento LCU

Módulo `src-tauri/src/lcu/`:

- `credentials.rs`: lockfile de League y argumentos de `LeagueClientUx.exe`.
- `client.rs`: HTTP local con TLS autofirmado aceptado solo para `127.0.0.1` y Basic Auth `riot:<token>`.
- `model.rs`: DTOs de gameflow, lobby y champ select.
- `mapping.rs`: LCU → `DraftState`; es la parte pura y testeable.
- `tracker.rs`: polling cada segundo, estado en memoria y evento Tauri `lcu-snapshot`.

El modo es **solo lectura**. No se llama a ningún `PATCH`/`POST` del champ select.

### Detección

1. Busca `LeagueClientUx.exe` y lee `--app-port` + `--remoting-auth-token`.
2. Si falla, prueba lockfiles conocidos:
   - `C:\Riot Games\League of Legends\lockfile`
   - `%ProgramFiles%\Riot Games\League of Legends\lockfile`
   - `%ProgramFiles(x86)%\...`
   - `%LOCALAPPDATA%\...`
3. Parsea `name:pid:port:token:protocol`.

Si el cliente se reinicia, el tracker descarta el cliente HTTP y vuelve a resolver credenciales.

### Endpoints

| Endpoint | Uso |
|---|---|
| `GET /lol-gameflow/v1/gameflow-phase` | Fase actual. |
| `GET /lol-gameflow/v1/session` | Cola y datos de partida. |
| `GET /lol-lobby/v2/lobby` | Lobby y miembros. |
| `GET /lol-champ-select/v1/session` | Equipos, posiciones, acciones y bans. |

### Rival de Clash

`clash.rs` consulta el plugin de Clash bajo demanda desde la vista **Rival**:

| Endpoint | Uso |
|---|---|
| `GET /lol-clash/v1/enabled` | Clash habilitado en la región. |
| `GET /lol-clash/v1/currentTournamentIds` y `/all-tournaments` | Torneo actual o próximo. |
| `GET /lol-clash/v1/tournament-summary` | Torneo, roster y bracket del jugador. |
| `GET /lol-clash/v1/player/chat-rosters` | Equipo, estado y registro para el chequeo del header. |
| `GET /lol-clash/v1/tournament/{id}` y `/stateInfo` | Nombre, fases, lock-in, scouting y próximo cambio. |
| `GET /lol-clash/v1/bracket/{bracketId}` | Partidos, rosters y rival asignado. |
| `GET /lol-clash/v1/roster/{rosterId}` | Miembros del roster rival. |
| `GET /lol-summoner/v2/summoners?ids=...` | `summonerId` → PUUID, nombre y nivel. |
| `GET /lol-clash/v1/scouting/champions?puuids=...` | Maestrías y campeones de la temporada. |
| `GET /lol-ranked/v1/cached-ranked-stats/{puuid}` y `/ranked-stats/{puuid}` | Rango, LP, victorias y derrotas. |
| `GET /lol-match-history/v1/products/lol/{puuid}/matches` | Últimas 5 partidas. |

El bracket puede traer `rosterId` como UUID o como número; la app intenta el ID numérico y cae al nombre del roster cuando hace falta. El historial y el rango son best-effort: si el cliente no los tiene cacheados, la ficha sigue mostrando el resto.

La vista es de solo lectura. Al abrir la app se hace una única consulta liviana (`clash_overview`) para el chip del header; no hay polling automático. La vista Rival consulta el detalle al abrirse y al pulsar **Actualizar**. No usa Riot API ni proxy externo. `clash_overview` devuelve torneo y equipo; `clash_status` devuelve el `ClashView` completo con nuestro roster y el rival.

### Formato y lado

La cola se detecta con `gameData.queue.id`. En champ select, `hasSimultaneousBans` corrige la plantilla:

- 420/440/400 → `ranked`
- 700 → `tournament`
- custom + bans simultáneos → `ranked`
- custom + bans secuenciales → `tournament`
- desconocida → `hasSimultaneousBans`; fallback `ranked`

El lado se toma del campo `team` del jugador local (`1` azul, `2` rojo). Si falta, se infiere por el actor de la primera acción de pick.

### Mapeo de jugadores

`assignedPosition`:

| LCU | Rol |
|---|---|
| `top` | TOP |
| `jungle` | JUNGLE |
| `middle` | MID |
| `bottom` | ADC |
| `utility` | SUPPORT |

Se exige un roster con un jugador por rol. Los nombres, pools, comfort y winrate se conservan. Los picks enemigos se guardan sin rol si el LCU no lo expone; el motor lo infiere.

### Turno y estado

Cada snapshot construye un `DraftState` nuevo:

- bans de `bans.myTeamBans` y `bans.theirTeamBans`, más acciones de ban completadas como fallback;
- picks de `myTeam`/`theirTeam` con `championId > 0`;
- acción activa con `isInProgress`;
- `lcu_turn` con fase, lado, jugador, pick number y etiqueta.

`DraftState.lcu_turn` tiene prioridad sobre `manual` y sobre la plantilla. Así el motor no depende de que `step_index` coincida exactamente. Al detener el seguimiento, la UI limpia `lcu_turn` y deja el último draft como snapshot editable.

La tarea emite `lcu-snapshot` solo cuando cambia el estado o el draft. El frontend aplica el draft, conserva prioridades y settings, y recalcula recomendaciones.

Los errores de red del LCU se clasifican a mensajes amigables (`Cliente no disponible`, `Reconectando`, `Sesión cambiada`) y nunca incluyen URL, puerto ni detalles de `reqwest` en la UI. Los endpoints opcionales (`lobby`, `gameflow session`, `champ-select session`) son best-effort: un fallo puntual no invalida la fase ni fuerza una reconexión.

### UI

- Indicador LCU en la barra de vistas con estado, cola y acción actual.
- Diálogo de activación que aclara: solo lectura, sin acciones al cliente, sin cambios de pool/flex.
- Banner de seguimiento y botón **Detener**.
- Tablero de solo lectura mientras está activo.
- Chip **Clash** en el header cuando hay torneo, con día/horario de la próxima fase; se calcula al abrir la app.
- Vista **Juego en vivo**: tab efímero solo para colas elegibles; mapa `map11`, tokens por campeón, evento actual, feed, marcador y estadísticas. Al terminar una Clash, modal con resultado y guardado al historial.
- Vista **Rival**: bracket, próximo partido, roster propio, roster rival, rangos, maestrías y últimas partidas; se actualiza al abrirla o con **Actualizar**.
- Sección **Cliente de League** en Ajustes con estado, cola, plantilla, lado, acción y última sincronización.

### Scouting de lobby

El comando `lobby_scouting` alimenta la columna derecha de **Equipo** sin depender del seguimiento LCU:

| Endpoint | Uso |
|---|---|
| `GET /lol-lobby/v2/lobby` | Miembros, PUUID, nivel, icono y preferencias de posición. |
| `GET /lol-champ-select/v1/session` | `myTeam`/`theirTeam`, `assignedPosition`, PUUID y jugador local. |
| `GET /lol-summoner/v2/summoners?ids=...` y `/lol-summoner/v1/summoners/{id}` | Nombres, tag y PUUID cuando el lobby no los expone. |
| `GET /lol-summoner/v1/summoners-by-puuid-cached/{puuid}` | Fallback de nombre cuando el rival solo expone PUUID. |
| `GET /lol-clash/v1/scouting/champions?puuids=[...]` | Top maestrías y campeones de temporada. |
| `GET /lol-champion-mastery/v1/{puuid}/champion-mastery` | Fallback de maestrías si el scouting de Clash no devuelve datos. |
| `GET /lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=20` | Partidas recientes filtradas por cola y posición. |
| `GET /lol-ranked/v1/cached-ranked-stats/{puuid}` y `/ranked-stats/{puuid}` | Rango de Solo/Duo y Flex. |

Posiciones de lobby: `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM` (ADC) y `UTILITY` (Support); `FILL`/`UNSELECTED` no cuentan. La primera preferencia es la principal y la segunda solo se muestra como alternativa. En champ select se usa `assignedPosition`.

El match history se filtra a Ranked Solo/Duo (`420`), Ranked Flex (`440`), Ranked 5s (`42`, `710`) y Clash (`700`), y el rol se resuelve con `timeline.lane` + `timeline.role` para distinguir ADC de Support. Se muestran hasta 5 campeones distintos por jugador. Para las maestrías se consulta la lista completa de `/lol-champion-mastery/v1/{puuid}/champion-mastery` y se filtran los campeones cuyo rol local incluye la posición principal; se muestran las 3 mejores y se ofrecen con comfort 5 para pasarlas al pool.

El tracker LCU incluye una firma de lobby/champ select (PUUID/summonerId + posiciones). Cuando cambia, el frontend recarga `lobby_scouting` automáticamente; no hace falta pulsar **Actualizar LCU**. Todo es best-effort: si el cliente no tiene cacheadas las maestrías o partidas, la tarjeta muestra el vacío correspondiente.

El comando `rival_scouting` reutiliza la misma hidratación sobre `theirTeam` y alimenta el tab efímero **Rival Live**, visible solo en `ChampSelect`. Las tarjetas son de solo lectura y no ofrecen pasar campeones al pool. La firma de champ select incluye `myTeam` y `theirTeam`, así que un cambio de identidad o posición rival refresca la vista con seguimiento activo. Si el cliente oculta las identidades, se muestran tarjetas con la posición y un aviso, sin inventar nombres ni estadísticas. Si expone los nombres pero no `assignedPosition`, la tarjeta muestra maestrías y recientes globales, sin filtro de rol.

## 10. Juego en vivo

Módulo `src-tauri/src/live/`:

- `model.rs`: DTOs de `https://127.0.0.1:2999/liveclientdata/allgamedata` y snapshot serializable para la UI.
- `mapping.rs`: jugadores, champion ids, eventos, textos, ubicaciones y marcador. Es puro y testeable.
- `runtime.rs`: poll cada segundo, evento Tauri `live-snapshot` y detección de partida nueva por reinicio de `gameTime`.
- `match_record.rs`: convierte el último snapshot en `MatchRecord` de historial.

El runtime arranca y se detiene junto con el seguimiento LCU. No usa credenciales del cliente: el Live Client Data es local y su certificado autofirmado se acepta solo para `127.0.0.1`. Comandos: `live_current` y `live_match_record`.

### Colas

La UI solo muestra el tab **Juego en vivo** para:

- Ranked Solo/Duo (`420`), Ranked Flex (`440`), Ranked 5s (`42`, `710`), Clash (`700`) y custom/torneo (`0` con plantilla `tournament`).

Quedan fuera Normal Draft (`400`), Blind (`430`), ARAM y el resto.

### Eventos y posiciones

- Estructuras: coordenadas reales del mapa para torretas e inhibidores. `L0` = bot, `L1` = mid, `L2` = top; `P3` = torre exterior, `P2` = interior, `P1` = torre de inhibidor, `P4`/`P5` = torres del nexo.
- Objetivos: Dragón, Barón, Heraldo y larvas del Vacío en sus fosos.
- Kills: killer, víctima y asistentes se mueven a la línea/jungla de la víctima.
- FirstBlood, Multikill y Ace reutilizan la ubicación del `ChampionKill` con el que comparten tiempo, o el último combate.
- GameStart lleva a todos a la fuente; MinionsSpawning los coloca en su posición inicial por rol.

El Live Client Data no expone coordenadas de campeones. La vista lo declara y muestra una nota permanente.

### Guardado de Clash

Al `GameEnd` de una Clash, la UI pide el `MatchRecord` al backend y abre un modal con resultado, duración, marcador y estadísticas. Si el draft seguido por LCU tiene los mismos 10 picks, reutiliza bans y primer ban; si no, guarda picks, resultado y estadísticas con un aviso. El `MatchRecord` agrega campos opcionales compatibles con historiales viejos: `duration_seconds`, `our_stats`, `enemy_stats` y `player_stats`.

## 11. Historial y scouting

### Modelo

`crates/draft-engine/src/history/`:

- `model.rs`: `HistoryStore`, `MatchRecord`, `MatchPlayerStat`, `MatchTeamStats`, `HistoryPick`, `RivalPlayer`, enums de cola/resultado/primer ban/confianza.
- `normalize.rs`: resolución de campeones, alias, roles, secciones y nombres con rango.
- `parse.rs`: parser del TXT viejo de Clash y clasificación de bloques.
- `text.rs`: exportación a TXT limpio y reporte de revisión.

`HistoryStore`:

```rust
pub struct HistoryStore {
    pub version: u32,
    pub matches: Vec<MatchRecord>,
    pub name_aliases: Vec<NameAlias>,
    pub updated_at: Option<String>,
}
```

`MatchRecord` guarda:

- `source`: `legacy_text`, `manual` o `lcu`.
- `played_at`: fecha ISO opcional; null en el historial viejo.
- `queue`: `clash`, `ranked_solo`, `ranked_flex`, `normal_draft`, `custom`, `unknown`.
- `result`: `win`, `loss`, `unknown`; `result_note` para `ff`, `afk`, `se rompió`.
- `side`, `side_inferred`, `first_ban`, `first_ban_inferred`.
- `our_bans`, `enemy_bans`, `our_picks`, `enemy_picks` en orden.
- `rivals`: nombre, rol o etiqueta flex, grupos de pool (`main`, `last`), rango, notas.
- `warnings`, `confidence`, `rebalanced`, `legacy_index`.
- Opcionales en partidas de Juego en vivo: `duration_seconds`, `our_stats`/`enemy_stats` (kills, torres, dragones, barones, heraldos) y `player_stats` (KDA, CS, nivel, visión por jugador).

### Parser legacy

1. Los bloques se separan por líneas de 3+ barras (`////`).
2. Una máquina de estados recorre rol → nombre → pool, y bans/picks → resultado.
3. Roles aceptados: `top`, `jungle`, `mid`, `adc`, `support`, `fill`, `comodin`, `random`, `aram`, `autofill`, `nada`; también `jungle x`/`support x`.
4. El primer renglón tras un rol es el nombre; si trae varios campeones, se marca “rol sin nombre” y se usa como pool.
5. Los pools se separan por `/` o `|` en grupos; el primero es `main`, el segundo `last`, el resto `extra`.
6. Los campeones se resuelven con nombre de Data Dragon, ID y una tabla de alias: `fiddlestick`, `evelyn`, `renata`, `yummi`, `bardo`, `leblanck`, `lysandra`, `chogat`, `lilia`, `zaheen`, `huawei`, `negra`, `loca`, `cantautora`, etc.
7. Los nombres se conservan; solo se recortan espacios y se separa un rango con división (`Nombre Plata II`). No se renombra a ciegas.
8. Si hay varios `pick ellos` y ningún `pick nos`, el último se interpreta como nuestro. Lo mismo al revés.
9. Los picks/bans 6/4 se rebalancean a 5/5 moviendo la última entrada del lado con 6; queda `rebalanced` y un aviso con el campeón movido.
10. El lado se infiere por la primera sección de pick (el que pickea primero es azul). El primer ban se infiere por la primera sección de bans.
11. `win`/`won` → victoria; `loss`/`lost`/`ff` → derrota; `se rompió` → desconocido. Los motivos se guardan como nota.
12. Cada bloque se clasifica como `match`, `incomplete`, `scratch` o `broken`; la confianza es alta/media/baja según resultado, picks, bans y avisos.

El CLI `cargo run -p draft-engine --example import_history -- <txt> <out>` genera:

- `clash-history.json`;
- `clash-history.clean.txt`;
- `clash-history.review.md`;
- `clash-import-report.json`.

### Persistencia y comandos

- `history_load` / `history_save`: leen y escriben `history/history.json`; antes de guardar copian a `history.backup-<timestamp>.json`.
- `history_import_legacy`: parser puro; devuelve preview, no guarda.
- `history_export`: escribe JSON + TXT limpio en `exports/` y abre la carpeta.
- `history_match_from_draft`: convierte el draft actual en `MatchRecord` con jugadores del roster.
- `history_open_dir`: abre la carpeta del historial.

### Estadísticas

`src/js/history.js` es puro y testeable:

- `filterHistoryMatches`: cola, resultado, lado, primer ban, completas, búsqueda por rival/campeón.
- `computeHistorySummary`: winrate, racha, picks propios/rivales, bans propios/rivales, primer ban, lados, mejor campeón y amenaza.
- `buildRivalProfiles`: agrega por nombre, deduplica partidas, roles vistos, pools ponderados (`main` pesa 3, `last` 1), récord y notas.
- Las tablas muestran tamaño de muestra; el winrate de bans/lados es contextual, no causal.
- `buildHistorySignals`: señal compacta por campeón; no se envía el historial completo al motor.

### Historial como desempate

- `Settings.use_history` está apagado por defecto.
- `RecommendRequest.history` es opcional y lleva `HistorySignals { sample_matches, our_picks, enemy_picks, our_bans, enemy_bans }`.
- `scoring.json` define `history_weight` (0.02) y `history_min_games` (3).
- Pick: winrate propio centrado en 50%, con al menos 3 partidas; ajuste máximo ±2 puntos.
- Ban: 70% amenaza rival (winrate en contra) + 30% frecuencia de bans rivales; máximo ±2 puntos.
- Si el campeón está en nuestro pool, el ajuste de ban nunca es positivo.
- El ajuste se aplica después del score base y antes de ordenar. El comparador de picks sigue comprobando `in_pool` primero, así que el historial no rompe la prioridad estricta del pool.
- `Recommendation.history` devuelve puntos, récord y nota; la carta muestra `Historial · ...` solo cuando aporta.
- El historial viejo no atribuye nuestros picks a jugadores concretos; la señal es global por campeón.

### UI

- Pestaña **Historial** con Resumen, Partidas, Rivales y Bans.
- Resumen: KPIs + tablas de picks, amenazas, bans, primer ban y lados.
- Partidas: lista filtrable; detalle editable (resultado, cola, lado, primer ban, notas) y borrado.
- Rivales: búsqueda, filtro por rol, pool principal, récord, “Ver partidas” y “Renombrar”.
- Importación: preview con bloques, confianza, rebalanceos, nombres faltantes y tokens; importar todo o solo confianza alta.
- Guardar partida actual: crea un `MatchRecord` desde el draft, con resultado y notas.
- El ejemplo público usa nombres falsos; `private/` y `ban-clash.txt` están en `.gitignore`.

## 12. UI

Vistas: Draft, Rival Live, Juego en vivo, Equipo, Rival, Historial, Ajustes.

- **Draft:** tablero enemigo/aliado, bans, resumen de composición, recomendaciones Top N, próximos picks.
- **Rival Live:** tab efímero durante `ChampSelect`. Grid de tarjetas de solo lectura para el equipo rival con posición, rango, top 3 maestrías de la posición y recientes en Ranked Solo/Duo, Flex, 5s y Clash. Las identidades ocultas se muestran como tales, sin inventar datos.
- **Juego en vivo:** tab efímero para colas elegibles; mapa `map11`, tokens, evento actual, feed, marcador y estadísticas. Modal de guardado al terminar una Clash.
- **Equipo:** cinco filas emparejadas. Izquierda: roster y pool guardado, orden de picks, comfort y winrate. Derecha: tarjeta LCU del jugador del lobby con posiciones principal/secundaria, rango, top 3 maestrías con comfort 5 y recientes en la posición. La tarjeta LCU incluye una nota de datos locales / best-effort.
- **Historial:** resumen, partidas, rivales y bans; importación de Clash, guardado del draft actual o de Juego en vivo, exportación y edición.
- **Ajustes:** Top N, prioridad de pool, flex fuera de rol, desempate por historial, cliente de League, historial local, datos, export/import, explicación del scoring.

La UI está descrita en `DESIGN.md` (sistema visual) y sigue modo Operate: densidad escaneable, acciones a un clic, estados vacío/error/loading.

## 13. Tests

`crates/draft-engine/tests/engine_tests.rs`:

- dataset completo válido (173 campeones);
- resolución del turno y jugador;
- exclusión de baneados/pickeados;
- filtro de rol;
- carencia de daño AD;
- próximos picks;
- Top N configurable;
- prioridad de pool y advertencia off-pool;
- bans y exclusión de baneados;
- dirección e inversión de matchups;
- round-trip JSON;
- flex fuera de rol con opción explícita;
- early vs late (meta/flex vs counter);
- `lcu_turn` sobreescribiendo el turno de plantilla;
- muestra mínima y dirección del ajuste por historial;
- protección de bans propios y prioridad de pool con historial activo.

`crates/draft-engine/src/history/`:

- parseo de bloques completos, 6/4, doble `pick ellos`, rangos, fill/comodín, alias y notas;
- detección de lado y primer ban;
- rebalanceo a 5/5 y avisos;
- clasificación y confianza;
- exportación a TXT limpio.

`src-tauri/src/lcu/`:

- parseo de lockfile y argumentos del proceso;
- mapeo de posiciones a roles;
- detección de plantilla ranked/competitivo;
- mapeo de picks, bans y lado;
- validación de roster;
- acción LCU actual y fallback sin acción.

`src/js/history.test.js`:

- resumen, winrate, picks, bans, primer ban y lados;
- filtros por resultado, lado, primer ban y búsqueda;
- perfiles de rivales, pools, roles y récord;
- detección de partidas completas;
- señales compactas de historial (`buildHistorySignals`).

`src-tauri/src/live/`:

- parseo de `allgamedata`, champion mapping y equipo propio;
- colas soportadas;
- coordenadas de estructuras y movimiento de FirstBlood/Multikill/Ace;
- estadísticas por equipo;
- `MatchRecord` con y sin bans reutilizados.

`src/js/live.test.js`:

- colas aceptadas y rechazadas;
- formato de tiempo y resultado;
- posiciones de fuente, líneas iniciales y eventos;
- separación de campeones que comparten zona.

`src-tauri/src/lcu/lobby.rs` y `scouting.rs`:

- posiciones de lobby a roles;
- rol exacto desde `timeline.lane`/`role`;
- colas soportadas para recientes;
- emparejamiento por nombre y posición en JavaScript (`lobby.test.js`).

Además: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` (si clippy está instalado), `node --test src/js/history.test.js src/js/live.test.js src/js/lobby.test.js` y los ejemplos CLI.

## 14. Limitaciones

- Prioridad meta estática del parche 16.21.1; no es un tier list vivo.
- Counters/sinergias son un seed curado, no estadística agregada.
- El motor aún no usa los pools rivales del historial; `denial` sigue neutral.
- El desempate por historial es global por campeón, no por jugador, en el historial viejo.
- El desempate por historial está limitado a ±2 puntos y no es un modelo predictivo.
- El rol enemigo se infiere si no se registra.
- La UI no expone el modo manual completo; el motor lo soporta y la UI permite saltar de turno.
- El seguimiento LCU usa polling de 1 s, no WebSocket.
- LCU es una API local no oficial y puede cambiar por parche.
- El LCU debe estar abierto en el mismo PC y con la misma sesión.
- No hay Riot API ni scraping de terceros.
- El modo es solo lectura: no hay auto-hover ni auto-lock.
- El historial viejo no tiene fechas ni nuestros nombres; la estadística por jugador solo está completa en partidas nuevas.
- El Live Client Data no expone coordenadas de campeones: Juego en vivo usa posiciones estimadas por evento.
- El endpoint de Live Client Data puede desaparecer al cerrar la partida; la app conserva el último snapshot para el guardado de Clash.
- Juego en vivo solo guarda automáticamente propuestas de Clash; ranked y otros modos quedan para una versión futura.
- El scouting de lobby y Rival Live es best-effort: el LCU puede no tener maestrías, rango o partidas cacheadas para todos los jugadores.
- En Ranked Solo/Duo y Flex el cliente puede ocultar las identidades del rival; Rival Live muestra la posición y el aviso, pero no puede obtener maestrías ni historial.
- El emparejamiento del lobby usa nombre y, como fallback, la posición principal. Si los nombres del roster no coinciden y las posiciones están repetidas, una fila puede quedar sin tarjeta LCU.
- El rebalanceo 6/4 → 5/5 es una reconstrucción: queda marcado y se puede corregir.
- `ff` se interpreta como derrota; `se rompió` como desconocido.
- La importación de TXT es heurística: los bloques de confianza baja deben revisarse.

## 15. Mejoras futuras

- Guardado automático de partidas ranked y de otros modos.
- Captura de estadísticas EOG del LCU para enriquecer el cierre de partida.
- LCU por WebSocket para menor latencia.
- Auto-hover/auto-lock opcional con confirmación explícita, overrides temporales de pool/flex y botón de emergencia.
- Riot API para maestría y estadísticas propias (futuro, no implementado; requiere production key y aprobación de Riot).
- Draft fearless con bans acumulados.
- Optimización conjunta de los 5 bans.
- Simulación Monte Carlo de respuestas enemigas.
- Historial de drafts/scrims y comparación de composiciones.
- Multiusuario/cloud para coaches.
- Tests E2E de la UI y accesibilidad.
