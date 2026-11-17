# PRODUCT.md

## Product

**Draft Assist** es una aplicación de escritorio para equipos amateur y competitivos de League of Legends que necesitan decidir picks y bans durante el draft con criterio de composición, matchup y comfort del jugador.

## User

- **Primary:** jugador, capitán o coach de un equipo de 5 que draft-ea con roster fijo.
- **Scene:** sala de juego o scrim, luz baja, ventana de champion select abierta, poco tiempo por turno.
- **Job to be done:** registrar el estado real del draft y obtener una respuesta corta y confiable: “¿a quién pickeamos ahora y por qué?”.
- **Decision under pressure:** el usuario necesita escanear, entender y actuar en segundos; no está explorando ni leyendo documentación.

## Product truth

- El estado del draft se introduce manualmente o se sincroniza en **solo lectura** desde el LCU local.
- El modo automático es **seguimiento**, no auto-pick: lee lobby, formato, lado, posiciones, bans y picks; nunca envía acciones al cliente.
- El motor es local, determinista y explicable. Combina comfort, matchup, sinergia, carencias de composición, prioridad estática y momento del draft.
- El pool del jugador manda por defecto sobre el meta desconocido.
- Los datos de campeones salen de Data Dragon 16.21.1 y están empaquetados. Counters y sinergias son un seed curado editable.
- La app persiste el draft y el roster en JSON local; se puede exportar e importar.
- El **historial** guarda partidas, picks, bans, resultados y pools rivales. Se importa desde el TXT viejo de Clash o se guarda desde el draft actual.
- El **scouting** agrega rivales por nombre, muestra sus pools y permite corregir nombres con alias.
- Las estadísticas son locales y descriptivas: winrate, picks, bans, lados y amenazas, con tamaño de muestra.
- No hay Riot API, scraping ni recomendaciones en vivo. El LCU solo se usa para leer el cliente local.

## Product principles

1. **The board is the truth.** El tablero debe reflejar exactamente el draft; las acciones manuales se pueden deshacer y el seguimiento LCU es de solo lectura.
2. **Explain the pick, not the model.** Cada recomendación lleva una razón legible: comfort, counter, sinergia o carencia.
3. **Pool first.** Un pick cómodo y bien puntuado gana a un meta que el jugador no domina.
4. **Fast under pressure.** Densa pero escaneable; acciones a un clic; sin modales innecesarios.
5. **Local and editable.** El equipo puede ajustar pools, datos, pesos e historial sin depender de un servicio.
6. **Scout memory.** Los pools rivales que el equipo ya anotó no se pierden: se importan, se corrigen y se consultan en segundos.

## Non-goals

- No es un tracker automático de partidas en vivo: el historial se importa o se guarda desde el draft.
- No automatiza picks ni bans; todas las acciones en el cliente las confirma el usuario.
- No promete winrates reales ni tier lists vivas.
- No sustituye la decisión del coach: ordena opciones y expone el porqué.
- No usa scraping de terceros. La estadística personal es local y descriptiva, no una verdad competitiva.
- En 0.3.0 el historial no altera las recomendaciones; esa integración queda para 0.3.1.
