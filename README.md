# ASTRAVITA — versión definitiva (v5.0.0)

ASTRAVITA es una web de una sola página que ayuda a **prevenir crisis psicológicas** (ansiedad, ánimo bajo, estrés agudo, fatiga cognitiva, problemas de sueño y aislamiento) en tripulantes de misiones largas y aisladas. Analiza el rostro con la cámara **dentro del propio navegador**, lo compara con la línea base personal y con una base de conocimiento precargada, y entrega una **orientación exploratoria, no un diagnóstico clínico**.

Toda la interfaz está en inglés. Este README está en español porque es para ti.

---

## 1. Archivos

| Archivo | Qué es |
|---|---|
| `ASTRAVITA.html` | La aplicación completa (HTML + CSS + JS + base de conocimiento + logo en base64). |
| `README.md` | Este documento. |
| `INFORME_DE_PRUEBAS.md` | Qué se probó, cómo y con qué resultado. |
| `src/` | Código fuente por módulos (`js/`, `styles.css`, `template.html`), base de conocimiento `kb.json` y logo en base64. |
| `build.py` | `python3 build.py` vuelve a generar `ASTRAVITA.html` a partir de `src/`. |
| `tests/` | Pruebas automáticas: motor en Node (`node tests/engine_test.js` desde `src/..`) y flujos con Playwright (ajusta la ruta `URL` al inicio de cada script). |
| `screenshots/` | Capturas de las pantallas probadas. |

## 2. Cómo abrirla

**Opción rápida:** doble clic en `ASTRAVITA.html` (Chrome, Edge, Safari o Firefox recientes). Funciona sin servidor: cuentas, cifrado, modo demo, gráficas y motor de orientación.

**Opción recomendada (cámara y modelo facial):** servir la carpeta por http local:

```bash
cd "NASA/web/ASTRAVITA final"
python3 -m http.server 8080
# abrir http://localhost:8080/ASTRAVITA.html
```

La cámara necesita `https`, `localhost` o archivo local. La primera vez que se usa la cámara o un video, la página descarga el modelo facial MediaPipe (≈ 4 MB) y las fuentes Inter/JetBrains Mono. Sin internet, el modo demo funciona igual y la frecuencia cardíaca se mide en una región fija de la frente.

### MediaPipe sin conexión
1. Descarga `@mediapipe/tasks-vision@0.10.14` (`vision_bundle.mjs` y la carpeta `wasm/`) y el modelo `face_landmarker.task` (float16).
2. Cópialos en `./mediapipe/` junto a `ASTRAVITA.html`:
   ```
   mediapipe/vision_bundle.mjs
   mediapipe/wasm/...
   mediapipe/face_landmarker.task
   ```
3. Sirve la carpeta por http (no funciona desde `file://`). La página intenta primero el CDN y luego `./mediapipe/`.

## 3. Cuentas de demostración

Aparecen en la pantalla de acceso con su botón **Use**. Todo su contenido está marcado como **SIMULATED DATA**.

| Rol | Nombre | Perfil | Email | Contraseña |
|---|---|---|---|---|
| Médico | Dr. Maya Thornton | Flight surgeon | maya.thornton@demo.astravita | Demo-Surgeon-2026! |
| Paciente | Elena Vance | Estable | elena.vance@demo.astravita | Demo-Crew-2026! |
| Paciente | Marcus Chen | Estrés creciente | marcus.chen@demo.astravita | Demo-Crew-2026! |
| Paciente | Tarek Al-Mansoor | Fatiga crónica | tarek.almansoor@demo.astravita | Demo-Crew-2026! |
| Paciente | Sarah Jenkins | Recuperación | sarah.jenkins@demo.astravita | Demo-Crew-2026! |
| Paciente | Kenji Watanabe | Aislamiento progresivo | kenji.watanabe@demo.astravita | Demo-Crew-2026! |
| Paciente | Amara Okafor | Calidad de señal baja | amara.okafor@demo.astravita | Demo-Crew-2026! |

- Los datos se generan de forma determinista (semilla fija) la primera vez que abres la pantalla de acceso: 8 semanas de historial por paciente.
- **Reset demo data** los regenera. Las cuentas reales no se tocan.
- Las cuentas reales empiezan vacías y nunca ven datos de demo; un médico real no puede vincular pacientes de demo ni al revés.

## 4. Flujo de uso

1. **Portada** → *Enter ASTRAVITA*.
2. **Sign in / Create account**: al crear la cuenta se elige el rol (*Patient (crew member)* o *Doctor (flight surgeon)*); no se puede cambiar después.
3. **Paciente**: Dashboard → *Monitoring center* → consentimiento → pre-chequeo (semáforo cámara/luz/encuadre/señal) → calibración de 30 s la primera vez → sesión en vivo → cuestionario breve opcional → **Results & guidance** (hallazgos, confianza, contribuciones por indicador, causas probables, contramedidas, cuándo escalar, fuentes, gráficas por minuto y resumen semanal) → *History* con duración y tiempo total.
4. **Vinculación**: el paciente comparte su código de 8 caracteres (*Care team*); el médico lo escribe en *Add crew member*; el paciente acepta o rechaza; puede revocar cuando quiera. Un paciente solo puede estar vinculado a un médico a la vez.
5. **Médico**: *Crew triage* (tarjetas nominal/observación/alerta), ficha de cada tripulante (indicadores, orientación, gráficas, historial, alertas), **notas compartidas o privadas**, **prescripción de contramedidas**, *Alert inbox* (revisar/validar con nota) y exportación CSV / impresión.
6. **Seguridad**: si el tripulante responde «sí» a la pregunta de seguridad, aparece de inmediato un protocolo de apoyo sereno (contactar al médico de vuelo o al equipo de salud conductual; en la Tierra, número de emergencias local, 988 en EE. UU., findahelpline.com) y el médico vinculado recibe una alerta.

## 5. Cómo funciona por dentro

- **Captura**: cámara, archivo de video o guion demo de 150 s (nominal → estrés → fatiga → recuperación) que pasa por el mismo procesamiento.
- **Rostro (c2 / MediaPipe Face Landmarker)**: malla de 478 puntos con blendshapes; expresiones en % (neutral, alegría, tristeza, enojo, miedo, sorpresa, asco) mediante una tabla explícita AU→emoción, suavizado exponencial y normalización a 100 %; microexpresiones = ráfagas de 40–500 ms en unidades de acción respecto a la línea base.
- **Fatiga**: parpadeo; PERCLOS P80 en ventana de 60 s; bostezo por MAR > 0,7 sostenido 1,5 s; cierres ≥ 1 s; estabilidad y cabeceo de la cabeza.
- **rPPG (c3 / pyVHR)**: POS, CHROM y GREEN portados a JavaScript, filtro pasabanda 0,7–3,5 Hz (pre-filtro 0,5–5 Hz), SNR, RMSSD experimental y respiración (movimiento de cabeza + modulación del verde). Se calcula en un **Web Worker**.
- **Índices en vivo (c1 / InterpretML)**: estrés, fatiga y bienestar como modelos aditivos tipo EBM; cada término muestra sus puntos.
- **Motor de orientación (sin IA ni APIs)**: 35 patrones y 59 contramedidas en `<script id="astravita-kb">`. Normaliza contra la línea base personal (promedio móvil de sesiones sin hallazgos de 7 días, ampliable a 28; si no hay, la calibración) → reglas ponderadas → puntuación 0–100 → confianza (calidad de señal, duración, cobertura y concordancia cámara/cuestionario) → contramedidas y criterios de escalamiento. Los patrones inespecíficos (nutricionales, endocrinos, medicación, entorno) solo se muestran si hay un signo más específico. Con señal insuficiente no se usan los indicadores de cámara («Insufficient signal quality»).
- **Base de conocimiento**: construida con tus archivos de «datos medicos» y fuentes verificadas en la web (NASA HRP y NASA-STD-3001, NIMH, MedlinePlus, CDC, NIH ODS, PHQ-2, GAD-2, KSS, Mars-500, HI-SEAS, Antártida, normas de HRV de Nunan/Shaffer, PERCLOS de la FHWA). Cada dato lleva su fuente; donde no existe un umbral validado se usa una regla relativa a la línea base y se indica.

## 6. Privacidad y seguridad (prototipo del lado del cliente)

- El video **nunca sale del dispositivo**; solo se guardan números (1 fila por segundo).
- Contraseñas: **PBKDF2-SHA-256, 600 000 iteraciones**, sal por usuario; nunca se guardan.
- Datos de cada usuario cifrados con **AES-GCM 256** con una clave derivada de su contraseña. Al recargar la página se pide la contraseña de nuevo (las claves solo viven en memoria). La sesión caduca tras 30 min de inactividad.
- Médico–paciente: canal cifrado de extremo a extremo con **ECDH P-256 + HKDF**. El paciente publica una copia cifrada para su médico; al revocar se borra. Las notas privadas quedan en la bóveda del médico.
- Integridad: si alguien cambia el rol en el almacenamiento, el inicio de sesión se bloquea (el rol también está dentro de la bóveda cifrada).
- **Importante**: esto es un prototipo en el navegador. Quien tenga acceso al perfil del navegador no puede leer los datos, pero sí borrarlos. La seguridad real exige el backend .NET (siguiente etapa).

## 7. Exportaciones (pandas / Power BI / Fabric)

- Paciente: muestras 1 Hz por sesión (CSV), sesiones (CSV), minutos (CSV) y JSON completo.
- Médico: sesiones y minutos de cada tripulante vinculado, y CSV de la cohorte.
- Columnas 1 Hz: `timestamp, session_id, subject_id, hr_bpm, rr_rpm, rmssd_ms, blink_rate_min, perclos_pct, yawn_count, facial_tension, head_stability_pct, microexpr_min, emotion_*_pct, fatigue_level, stress_index, wellbeing_index, signal_quality, snr_db, rppg_method, face_detected, source`.
- Los CSV usan punto decimal: en Power BI con configuración es-CR, importa con la configuración regional «Inglés (Estados Unidos)».

```python
import pandas as pd
df = pd.read_csv('astravita-samples-....csv', encoding='utf-8-sig')
```

## 8. Siguientes pasos hacia .NET (Kiro, Fabric, Power BI)

La capa `ASTRAVITA.store` (IndexedDB + Web Crypto) está aislada. Para pasar a un backend:

| Función actual | Endpoint sugerido |
|---|---|
| `auth.register / signIn` | `POST /api/auth/register`, `POST /api/auth/login` (ASP.NET Identity, JWT) |
| `auth.saveVault`, `data.saveSession` | `POST /api/sessions` (+ `POST /api/sessions/{id}/samples` en lote) |
| `links.request / respond / revoke` | `POST /api/links`, `PATCH /api/links/{id}` |
| `links.readShare` | `GET /api/doctor/patients/{id}` (autorización por vínculo aceptado) |
| `links.readCare / writeCare` | `GET/PUT /api/patients/{id}/care` (notas, contramedidas, revisiones) |
| exportaciones | vistas en Fabric / modelo estrella en Power BI (`samples`, `sessions`, `minutes`) |

El motor (`ASTRAVITA.engine`) y la base de conocimiento son JSON puro y pueden ejecutarse igual en el servidor.

## 9. Limitaciones conocidas

- Es una herramienta **exploratoria**: no diagnostica, puede equivocarse y no sustituye al médico de vuelo.
- rPPG, HRV y respiración ópticos son experimentales; dependen mucho de la luz y del movimiento.
- Las expresiones se estiman a partir de blendshapes; no leen emociones internas.
- Los patrones psicológicos dependen sobre todo del cuestionario; la cámara sola no puede sustentarlos (cada patrón lo indica).
- Sin conexión no se carga el modelo facial (ver MediaPipe sin conexión).
- Los datos viven en este navegador: si borras los datos del sitio, se pierden. Exporta con frecuencia.
- Decisiones tomadas: las gráficas se dibujan con un módulo SVG propio en lugar de Chart.js para que funcionen sin internet y sean accesibles (tabla alternativa en cada gráfica); el logo se incrusta como PNG con fondo transparente generado a partir de tu `logo.jpeg`, sin redibujarlo.
