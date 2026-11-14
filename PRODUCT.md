# PRODUCT.md

## Product

**Draft Assist LoL** es una aplicación de escritorio para equipos amateur y competitivos de League of Legends que necesitan decidir picks y bans durante el draft con criterio de composición, matchup y comfort del jugador.

## User

- **Primary:** jugador, capitán o coach de un equipo de 5 que draft-ea con roster fijo.
- **Scene:** sala de juego o scrim, luz baja, ventana de champion select abierta, poco tiempo por turno.
- **Job to be done:** registrar el estado real del draft y obtener una respuesta corta y confiable: “¿a quién pickeamos ahora y por qué?”.
- **Decision under pressure:** el usuario necesita escanear, entender y actuar en segundos; no está explorando ni leyendo documentación.

## Product truth

- El estado del draft se introduce manualmente: lado, formato, bans, picks, roles y pools.
- El motor es local, determinista y explicable. Combina comfort, matchup, sinergia, carencias de composición, prioridad estática y momento del draft.
- El pool del jugador manda por defecto sobre el meta desconocido.
- Los datos de campeones salen de Data Dragon 16.21.1 y están empaquetados. Counters y sinergias son un seed curado editable.
- La app persiste el draft y el roster en JSON local; se puede exportar e importar.
- No hay Riot API, LCU, scraping ni recomendaciones en vivo en la v1.

## Product principles

1. **The board is the truth.** El tablero debe reflejar exactamente el draft; cada acción se puede deshacer.
2. **Explain the pick, not the model.** Cada recomendación lleva una razón legible: comfort, counter, sinergia o carencia.
3. **Pool first.** Un pick cómodo y bien puntuado gana a un meta que el jugador no domina.
4. **Fast under pressure.** Densa pero escaneable; acciones a un clic; sin modales innecesarios.
5. **Local and editable.** El equipo puede ajustar pools, datos y pesos sin depender de un servicio.

## Non-goals

- No es un tracker automático de partidas.
- No promete winrates reales ni tier lists vivas.
- No sustituye la decisión del coach: ordena opciones y expone el porqué.
