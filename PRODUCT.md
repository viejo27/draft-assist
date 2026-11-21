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
- Al abrir la app se consulta una vez si hay Clash; si hay torneo, el header muestra el día y horario de la próxima fase.
- La **vista Rival de Clash** lee el torneo, nuestro roster, el bracket, el próximo partido, el roster rival, rangos, maestrías e historial reciente desde el LCU local. Si no hay equipo, muestra la leyenda para crear uno o unirse.
- La **vista Juego en vivo** lee el Live Client Data local durante partidas de Ranked Solo/Duo, Flex, 5s, Torneo o Clash: muestra mapa, eventos, marcador y estadísticas. Al terminar una Clash propone guardar resultado y estadísticas en el historial.
- El **historial** guarda partidas, picks, bans, resultados y pools rivales. Se importa desde el TXT viejo de Clash o se guarda desde el draft actual o desde Juego en vivo.
- El panel **Equipo** combina el pool local con scouting LCU del lobby: posiciones, top maestrías, últimos campeones en la posición principal y rango. Es de solo lectura y best-effort.
- **Rival Live** aparece como tab junto a Draft durante el champ select y muestra el mismo scouting del equipo rival cuando el cliente expone sus identidades. Es de solo lectura y no modifica el pool.
- El **scouting** agrega rivales por nombre, muestra sus pools y permite corregir nombres con alias.
- Las estadísticas son locales y descriptivas: winrate, picks, bans, lados y amenazas, con tamaño de muestra.
- El historial se puede usar como **desempate opcional** de las recomendaciones: apagado por defecto, ±2 puntos y muestra mínima de 3 partidas.
- No hay Riot API ni scraping. Solo se leen el LCU y el Live Client Data locales.
- La vista Juego en vivo es de solo lectura y estima posiciones: el Live Client Data no expone coordenadas de campeones. No envía acciones al juego.

## Product principles

1. **The board is the truth.** El tablero debe reflejar exactamente el draft; las acciones manuales se pueden deshacer y el seguimiento LCU es de solo lectura.
2. **Explain the pick, not the model.** Cada recomendación lleva una razón legible: comfort, counter, sinergia o carencia.
3. **Pool first.** Un pick cómodo y bien puntuado gana a un meta que el jugador no domina.
4. **Fast under pressure.** Densa pero escaneable; acciones a un clic; sin modales innecesarios.
5. **Local and editable.** El equipo puede ajustar pools, datos, pesos e historial sin depender de un servicio.
6. **Scout memory.** Los pools rivales que el equipo ya anotó no se pierden: se importan, se corrigen y se consultan en segundos.
7. **History is a tiebreaker, not the model.** El historial solo desempata; el pool, el matchup y la composición siguen mandando.

## Non-goals

- No es un tracker competitivo ni un overlay oficial: la vista en vivo es local, de solo lectura y con posiciones estimadas.
- No automatiza picks ni bans; todas las acciones en el cliente las confirma el usuario.
- No promete winrates reales ni tier lists vivas.
- No sustituye la decisión del coach: ordena opciones y expone el porqué.
- No usa scraping de terceros. La estadística personal es local y descriptiva, no una verdad competitiva.
- El historial solo ajusta como máximo ±2 puntos y no cambia la prioridad estricta del pool ni el flex fuera de rol.
