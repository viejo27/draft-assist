# Draft Assist LoL

Asistente de draft para League of Legends, hecho con **Rust + Tauri v2** y frontend vanilla. Registra el estado real del champion select y devuelve un Top 5 explicado para el pick o ban actual.

![Draft Assist LoL](docs/screenshot.png)

- Datos locales de **Data Dragon 16.21.1** (173 campeones e iconos).
- Pool por jugador con comfort 1–5 y winrate opcional.
- Counters y sinergias en JSON editable.
- Plantillas **ranked solo** y **competitivo/Clash**.
- Recomendaciones con score, tier, razones y riesgos.
- Bans recomendados por amenaza y autoban.
- Próximos picks tentativos.
- Persistencia local con autosave, export/import.

## Requisitos

- Rust estable con edition 2024 (probado con 1.96).
- Tauri v2 prerequisites para Windows: MSVC, WebView2.
- Node.js 20+ solo para ejecutar el CLI de Tauri y los scripts de datos.

En PowerShell, si `npm` da error de execution policy, usa `npm.cmd` y `npx.cmd`.

## Instalación y arranque

```powershell
npm.cmd install
npm.cmd run dev
```

Equivalente sin instalar el CLI local:

```powershell
npx.cmd @tauri-apps/cli dev
```

Build de producción:

```powershell
npm.cmd run build
```

Genera el ejecutable en `target/release/draft-lol.exe` y los instaladores en `target/release/bundle/` (MSI y NSIS en Windows). Si solo quieres compilar sin empaquetar:

```powershell
npx.cmd @tauri-apps/cli build --no-bundle
```

Tests del motor:

```powershell
cargo test -p draft-engine
```

Ejemplo CLI con el draft completo del README:

```powershell
cargo run -p draft-engine --example demo
```

La primera vez se abre con un **draft de ejemplo** cargado. Desde ahí puedes editar el tablero, cambiar el roster o empezar uno nuevo.

> `lol-things/` ya no es necesaria para ejecutar la app: el catálogo y los 173 iconos están copiados en `crates/draft-engine/data/` y `src/assets/champions/`. Puedes borrar esa carpeta. El script `scripts/prepare-data.mjs` funciona con `scripts/vendor/champion.json` si quieres regenerar el catálogo.

## Uso rápido

1. **Nuevo draft** → elige `Ranked solo` o `Competitivo / Clash`, y tu lado (azul/rojo).
2. **Equipo** → revisa los 5 jugadores, su orden de picks y su pool. Ajusta comfort y winrate.
3. **Draft** → registra bans y picks. Si el turno es del rival, la app te pide registrar su acción.
4. En tu turno, el panel derecho muestra el Top 5. Cada carta indica:
   - campeón, rol y score 0–100;
   - tier S/A/B/C/D;
   - comfort y advertencia si está fuera del pool;
   - justificación de 2–3 líneas y riesgos.
5. Pulsa **Elegir** o **Banear** para bloquear la acción y avanzar el turno.
6. Usa **Deshacer** (`Ctrl/Cmd+Z`) para corregir, o **Cambiar turno** para saltar a otro paso de la plantilla.

El estado se guarda automáticamente en:

```text
%APPDATA%/com.elviejo27.draftlol/state.json
```

Los JSON editables se copian a `%APPDATA%/com.elviejo27.draftlol/data/`.

## Modelo de entrada

El comando `recommend` recibe:

```json
{
  "draft": {
    "version": 1,
    "side": "BLUE",
    "template_id": "tournament",
    "step_index": 17,
    "our_bans": ["Yuumi", "Smolder", "KSante", "Aurora", "Skarner"],
    "enemy_bans": ["Malphite", "Lulu", "Rakan", "Poppy", "Vi"],
    "our_picks": [
      { "player_id": "top", "champion_id": "Ornn", "role": "TOP" },
      { "player_id": "jungle", "champion_id": "Sejuani", "role": "JUNGLE" },
      { "player_id": "mid", "champion_id": "Orianna", "role": "MID" }
    ],
    "enemy_picks": [
      { "champion_id": "Rumble", "role": "TOP" },
      { "champion_id": "LeeSin", "role": "JUNGLE" },
      { "champion_id": "Azir", "role": "MID" },
      { "champion_id": "Caitlyn", "role": "ADC" }
    ],
    "priorities": [],
    "current_player_id": "adc",
    "manual": null
  },
  "roster": {
    "players": [
      {
        "id": "adc",
        "name": "Pablo",
        "role": "ADC",
        "pool": [
          { "champion_id": "Jinx", "comfort": 5, "winrate": 61.0 },
          { "champion_id": "Ashe", "comfort": 4, "winrate": 53.0 },
          { "champion_id": "Kaisa", "comfort": 3, "winrate": 51.0 },
          { "champion_id": "Sivir", "comfort": 2, "winrate": null }
        ]
      }
    ],
    "pick_order": ["top", "jungle", "mid", "adc", "support"]
  },
  "options": {
    "top_n": 5,
    "allow_offrole_flex": false,
    "pool_precedence": true,
    "include_next_picks": true
  }
}
```

> El roster de ejemplo completo está en [`examples/example-state.json`](examples/example-state.json). Incluye los 5 jugadores.

### Roles

`TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT`.

### Lados y fases

- `side`: `BLUE` o `RED`.
- `step_index` es 0-based dentro de la plantilla elegida.
- `priorities`: `frontline`, `engage`, `cc`, `peel`, `ap_damage`, `ad_damage`, `waveclear`, `poke`, `splitpush`, `early`, `scaling`, `anti_tank`.

### Plantillas

- **ranked**: bans simultáneos (5 por equipo) + picks `B1, R1, R2, B2, B3, R3, R4, B4, B5, R5`.
- **tournament**: bans por fases + picks `B1, R1, R2, B2, B3, R3`, segundo bloque de bans, `R4, B4, B5, R5`.

## Modelo de salida

```json
{
  "summary": {
    "side": "BLUE",
    "phase": "PICK",
    "turn_label": "Pick azul 4",
    "current_player": { "id": "adc", "name": "Pablo", "role": "ADC" },
    "composition": {
      "damage_split": { "physical": 0.0, "magic": 1.0, "mixed": 0.0 },
      "archetype_label": "Engage / wombo",
      "needs": [
        { "id": "ad_damage", "label": "Falta daño AD", "severity": 1.0 }
      ]
    }
  },
  "recommendations": [
    {
      "rank": 1,
      "champion": { "id": "Jinx", "name": "Jinx", "roles": ["ADC"] },
      "role": "ADC",
      "action": "PICK",
      "score": 71.7,
      "tier": "B",
      "in_pool": true,
      "comfort": 5,
      "off_pool_warning": null,
      "justification": "Comfort 5/5 en el pool de Pablo. Winrate personal: 61%. Sinergia con Ornn: Frontline sólida y engage a distancia para Jinx.",
      "reasons": ["..."],
      "risks": ["..."],
      "breakdown": {
        "matchup": 0.3,
        "synergy": 0.82,
        "needs": 1.0,
        "comfort": 1.0,
        "meta": 1.0,
        "flex": 0.24,
        "counter_risk": 0.4,
        "pool_penalty": 0.0
      }
    }
  ],
  "next_picks": [],
  "warnings": []
}
```

La salida completa del ejemplo está en [`examples/example-recommendation.json`](examples/example-recommendation.json).

## Ejemplo completo

Escenario: **azul**, plantilla competitiva, turno **B4** (nuestro ADC, Pablo).

- Bans propios: Yuumi, Smolder, K’Sante, Aurora, Skarner.
- Bans enemigos: Malphite, Lulu, Rakan, Poppy, Vi.
- Nuestros picks: Ornn (TOP), Sejuani (JUNGLE), Orianna (MID).
- Enemigos: Rumble (TOP), Lee Sin (JUNGLE), Azir (MID), Caitlyn (ADC).
- Pool ADC: Jinx 5, Ashe 4, Kai’Sa 3, Sivir 2.

Resultado real del motor con los datos incluidos:

| # | Campeón | Score | Tier | Pool | Lectura |
|---:|---|---:|---|---|---|
| 1 | **Jinx** | 71.7 | B | Comfort 5 | La mejor combinación de comfort y sinergia con Ornn/Sejuani/Orianna; Caitlyn castiga su early. |
| 2 | **Ashe** | 71.3 | B | Comfort 4 | Buen follow-up de engage y utilidad; menos DPS puro que Jinx. |
| 3 | **Sivir** | 68.7 | B | Comfort 2 | Spellshield y waveclear contra Caitlyn/Rumble/Azir; el comfort bajo la frena. |
| 4 | **Kai’Sa** | 56.7 | C | Comfort 3 | Dive con Sejuani/Ornn, pero sufre el rango de Caitlyn. |
| 5 | **Miss Fortune** | 41.2 | D | Fuera de pool | Buen matchup de lane, pero el motor la penaliza por no estar en el pool. |

Carencias detectadas: **falta daño AD sostenido** (Ornn, Sejuani y Orianna son AP). Frontline, engage y CC ya están cubiertos.
Próximo pick tentativo (support): **Nautilus** (pool, 72.8) como engage/peel; **Milio** aparece más abajo como opción de pool con comfort 2.

Los números pueden variar si editas `champion-meta.json`, `matchups.json`, `synergies.json` o `scoring.json`.

## Cómo decide

Componentes: comfort, matchup de línea, riesgo de counters, sinergia curada/estructural, carencias de composición, prioridad meta y flexibilidad.

- **Picks tempranos:** pesan más comfort, meta y flex/seguridad.
- **Picks tardíos:** pesan más matchup y counter directo.
- **Pool primero:** por defecto, todos los campeones del pool se ordenan antes que los off-pool. Los off-pool siguen visibles con advertencia.
- **Bans:** priorizan amenaza a tus picks/pools y penalizan autobans.

El detalle técnico está en [`docs/DESIGN.md`](docs/DESIGN.md). El sistema visual está en [`DESIGN.md`](DESIGN.md).

## Datos editables

```text
crates/draft-engine/data/
├─ champions.json        # catálogo DDragon (generado)
├─ champion-meta.json    # roles, flex, daño, traits, prioridad
├─ matchups.json         # counters con valor -1..1 y severidad 1..3
├─ synergies.json        # pares con valor 0..1
├─ templates.json        # ranked / tournament
├─ scoring.json          # pesos, umbrales y tiers
└─ example-state.json    # ejemplo ejecutable
```

La app copia estos archivos a `app_data_dir/data/` en el primer arranque. Edita ahí y pulsa **Ajustes → Recargar datos** sin recompilar.

Para regenerar el catálogo desde Data Dragon:

```powershell
node scripts/prepare-data.mjs
```

Usa `scripts/vendor/champion.json` (copia local) o `lol-things/16.21.1/...` si existe. `scripts/seed-meta.mjs` regenera la metadata heurística; **sobrescribe** `champion-meta.json`, así que úsalo solo si quieres volver al seed.

## Estructura del proyecto

```text
crates/draft-engine/      motor Rust puro + datos + tests + demo
src-tauri/                comandos Tauri, persistencia y ventana
src/                      UI vanilla, estilos e iconos
scripts/                  generación de datos y preview
examples/                 estado y salida de ejemplo
docs/DESIGN.md            arquitectura, modelo y scoring
DESIGN.md                 sistema visual
PRODUCT.md                contexto de producto
```

## Tests y calidad

```powershell
cargo test -p draft-engine
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
```

Tests cubiertos: dataset completo, exclusión de bans/picks, rol, carencias, prioridad de pool, off-pool, bans, matchups, serialización, flex fuera de rol y diferencia early/late.

## Problemas comunes

- **`npm.ps1 cannot be loaded`**: usa `npm.cmd`/`npx.cmd`.
- **No abre la ventana**: verifica WebView2 y los prerequisites de Tauri.
- **Datos editables inválidos**: la app cae a los datos embebidos y muestra un aviso. Corrige el JSON en `app_data_dir/data/` y pulsa Recargar datos.
- **Quiero volver al ejemplo**: botón **Cargar ejemplo** en la barra superior.
- **El build falla con “file is being used”**: cierra la app abierta antes de ejecutar `npm.cmd run build`; Windows no puede parchear el `.exe` en uso.

## Mejoras futuras

- Integración LCU para leer champion select automáticamente.
- Riot API para maestría, winrates y pools reales.
- Counters/sinergias desde datos estadísticos por parche.
- Draft fearless con bans acumulados por serie.
- Optimización conjunta de los 5 bans de ranked.
- Simulación de respuestas enemigas y Monte Carlo.
- Scouting de pools rivales.
- Historial de drafts/scrims y vista de coach.
- Tests E2E de UI y accesibilidad.

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
