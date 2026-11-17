# Diseño técnico — Draft Assist

## 1. Alcance

Aplicación de escritorio Tauri v2 con motor de recomendación en Rust y UI en HTML/CSS/JS sin bundler. Todo el conocimiento de campeones, counters, sinergias y plantillas vive en JSON local. No hay llamadas de red en runtime.

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
- Sección **Cliente de League** en Ajustes con estado, cola, plantilla, lado, acción y última sincronización.

## 10. Historial y scouting

### Modelo

`crates/draft-engine/src/history/`:

- `model.rs`: `HistoryStore`, `MatchRecord`, `HistoryPick`, `RivalPlayer`, enums de cola/resultado/primer ban/confianza.
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

### UI

- Pestaña **Historial** con Resumen, Partidas, Rivales y Bans.
- Resumen: KPIs + tablas de picks, amenazas, bans, primer ban y lados.
- Partidas: lista filtrable; detalle editable (resultado, cola, lado, primer ban, notas) y borrado.
- Rivales: búsqueda, filtro por rol, pool principal, récord, “Ver partidas” y “Renombrar”.
- Importación: preview con bloques, confianza, rebalanceos, nombres faltantes y tokens; importar todo o solo confianza alta.
- Guardar partida actual: crea un `MatchRecord` desde el draft, con resultado y notas.
- El ejemplo público usa nombres falsos; `private/` y `ban-clash.txt` están en `.gitignore`.

## 11. UI

Vistas: Draft, Equipo, Historial, Ajustes.

- **Draft:** tablero enemigo/aliado, bans, resumen de composición, recomendaciones Top N, próximos picks.
- **Equipo:** 5 jugadores, orden de picks, pools con comfort y winrate.
- **Historial:** resumen, partidas, rivales y bans; importación de Clash, guardado del draft actual, exportación y edición.
- **Ajustes:** Top N, prioridad de pool, flex fuera de rol, cliente de League, historial local, datos, export/import, explicación del scoring.

La UI está descrita en `DESIGN.md` (sistema visual) y sigue modo Operate: densidad escaneable, acciones a un clic, estados vacío/error/loading.

## 12. Tests

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
- `lcu_turn` sobreescribiendo el turno de plantilla.

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
- detección de partidas completas.

Además: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` (si clippy está instalado), `node --test src/js/history.test.js` y los ejemplos CLI.

## 13. Limitaciones

- Prioridad meta estática del parche 16.21.1; no es un tier list vivo.
- Counters/sinergias son un seed curado, no estadística agregada.
- El motor aún no usa los pools rivales del historial; `denial` sigue neutral en las recomendaciones de 0.3.0.
- El rol enemigo se infiere si no se registra.
- La UI no expone el modo manual completo; el motor lo soporta y la UI permite saltar de turno.
- El seguimiento LCU usa polling de 1 s, no WebSocket.
- LCU es una API local no oficial y puede cambiar por parche.
- El LCU debe estar abierto en el mismo PC y con la misma sesión.
- No hay Riot API ni scraping de terceros.
- El modo es solo lectura: no hay auto-hover ni auto-lock.
- El historial viejo no tiene fechas ni nuestros nombres; la estadística por jugador solo está completa en partidas nuevas.
- El rebalanceo 6/4 → 5/5 es una reconstrucción: queda marcado y se puede corregir.
- `ff` se interpreta como derrota; `se rompió` como desconocido.
- La importación de TXT es heurística: los bloques de confianza baja deben revisarse.

## 14. Mejoras futuras

- 0.3.1: usar historial como desempate opcional en las recomendaciones, con peso bajo y apagado por defecto.
- 0.3.1: capturar partidas desde el LCU al terminar el champ select, con resultado desde el fin de partida.
- LCU por WebSocket para menor latencia.
- Auto-hover/auto-lock opcional con confirmación explícita, overrides temporales de pool/flex y botón de emergencia.
- Riot API para maestría y estadísticas propias (futuro, no implementado; requiere production key y aprobación de Riot).
- Draft fearless con bans acumulados.
- Optimización conjunta de los 5 bans.
- Simulación Monte Carlo de respuestas enemigas.
- Historial de drafts/scrims y comparación de composiciones.
- Multiusuario/cloud para coaches.
- Tests E2E de la UI y accesibilidad.
