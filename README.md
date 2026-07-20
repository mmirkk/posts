# Informe de cumplimiento de publicaciones

Aplicación web que cruza la planificación oficial de Google Sheets con las publicaciones reales de PostgreSQL, preservando la trazabilidad de cada decisión de emparejamiento.

## Puesta en marcha

1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL`.
2. Instalar dependencias con `pnpm install` o `npm install`.
3. Ejecutar `npm run dev` para desarrollo.
4. Abrir `http://localhost:5173`.

Para producción:

```bash
npm run build
npm start
```

La aplicación de producción queda disponible en el puerto definido por `PORT` (por defecto `3001`).

## Fuentes y mapeo actual

- Planificación: exportación XLSX pública del Google Sheet configurado.
- Publicaciones reales: `public.vs_posts_detalle` (parametrizable con `POSTS_TABLE`).
- Descripción planificada: `Copy`.
- Descripción real: `message`.
- Fecha planificada: `Fecha`.
- Fecha real: `publish_at`.
- Campaña o temática real: `topics`.

La hoja actual no tiene columna `Tipo`. En consecuencia, todas sus filas se interpretan como planificación `OFICIAL`. La columna `type` de la base no representa oficialidad sino formato (`VIDEO`, `IMAGE`, etc.).

Las publicaciones reales se limitan mediante una lista estricta de `profile_id` en `OFFICIAL_PROFILE_IDS`. La configuración inicial auditada incluye:

- Manuel Passaglia: Facebook `566907`, Instagram `560926`, TikTok `757523` y X `560927`.
- Hermanos Passaglia: TikTok `560932` y YouTube `743322`.

Las cuentas Fans, Fandom, Passaglia Hechos y otras cuentas de apoyo quedan excluidas salvo que se agreguen expresamente a la variable de entorno.

La columna `Red` puede contener varios destinos. Cada fila se expande a objetivos por red —por ejemplo, `Meta Manuel` se convierte en Facebook e Instagram— para mantener una relación uno-a-uno con los posts reales.

## Criterios de comparación

- Se normalizan mayúsculas, tildes, espacios, saltos, puntuación, URLs, emojis y prefijos de canal.
- Cuando el Sheet contiene un enlace publicado, se usa como coincidencia directa si la URL canónica, la red y la cuenta son compatibles. En YouTube, `watch`, `shorts`, `youtu.be`, `embed` y `live` se comparan por el identificador del video.
- Una coincidencia exacta exige igualdad de la descripción normalizada y compatibilidad de red y cuenta.
- El título del Sheet se compara siempre, exista o no un Copy. Puede confirmarse una coincidencia `por_titulo` cuando el título aparece como frase o alcanza una similitud alta con el texto publicado, la red y la cuenta coinciden y la diferencia temporal no supera 14 días. Si había Copy y difiere, el resultado queda como `modificada`. Los títulos de una sola palabra o demasiado genéricos no se asignan automáticamente.
- Cuando el mismo contenido aparece en otra red de la cuenta planificada, se informa como `publicada_otra_red`. Esta evidencia no cumple el destino original, no incrementa el cumplimiento y no reutiliza el post real si ya está asignado a otra fila.
- Las coincidencias aproximadas combinan similitud de bigramas, vocabulario compartido y contención textual.
- La URL y la cercanía temporal actúan como criterios secundarios; red y perfil delimitan el destino para evitar candidatos cruzados.
- Un post real nunca se asigna a más de una publicación planificada.
- Los enlaces repetidos o compatibles con más de un plan se consideran ambiguos y quedan para revisión manual.
- Los empates, duplicados no resolubles y similitudes intermedias se marcan para revisión manual.
- Las filas sin `Copy` o fecha válida se clasifican como datos incompletos y nunca se emparejan automáticamente.

Los umbrales y la tolerancia de fechas se modifican desde `.env`.

## Corte semanal e insights

El informe muestra por defecto la semana actual, de lunes a domingo, aun cuando todavía esté en curso. Las métricas se calculan sólo con fechas transcurridas hasta el día de consulta y la planificación de los días restantes se mantiene en “Próximamente”, sin penalizar el cumplimiento. El selector permite volver a semanas completas cerradas sin superponer días entre períodos.

La aplicación ofrece dos niveles de lectura:

- `/ejecutivo`: resumen simple por contenido planificado, con estados publicada o no publicada y resultado por red. Un contenido se considera publicado cuando tiene al menos una coincidencia real; la cobertura total de destinos se informa por separado.
- `/`: tablero analítico completo con métricas, gráficos, engagement, filtros y trazabilidad detallada.

Ambas vistas reconcilian sus unidades: una fila del Sheet representa un contenido y puede expandirse a varios destinos por red y cuenta. La vista ejecutiva cuenta contenidos; la analítica cuenta destinos y posts reales.

La vista ejecutiva incluye una comparación diaria interactiva de posts programados y realizados. Al seleccionar un día, el detalle consolida cada fila del Sheet como un único contenido y resume debajo sus redes y cuentas; los copies completos se despliegan sólo al pedir la comparación. Ambas vistas también muestran la planificación con fecha futura en una sección separada, que no afecta el cumplimiento antes de su fecha programada.

La sección de insights usa exclusivamente las cuentas oficiales configuradas:

- Alcance: suma de `impressions`.
- Engagement: suma de `engagement`; cuando el campo es nulo, la consulta utiliza likes + comentarios + compartidos.
- Top engagement: agrupación por `topics` y red social, con alcance, likes, comentarios, compartidos y enlace al post con mayor engagement.

La comparación de temáticas programadas ya admite columnas `Temática`, `Tema` o `Campaña` en el Sheet. Como la hoja actual no posee ninguna de ellas, las filas planificadas aparecen bajo `Sin temática planificada`; el informe lo advierte explícitamente para no atribuir temáticas sin evidencia.

## Validación

```bash
npm run check
npm test
```

El script `scripts/check-report.ts` ejecuta el cruce completo y verifica, entre otras reconciliaciones, que no existan asignaciones duplicadas.
