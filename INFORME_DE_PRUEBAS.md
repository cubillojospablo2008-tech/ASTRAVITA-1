# ASTRAVITA v5.0.0 — Informe de pruebas

Fecha: 15 de noviembre de 2026. Navegador de prueba: Google Chrome (headless, Playwright) abriendo `ASTRAVITA.html` desde `file://`, **sin internet** (fuentes, MediaPipe y CDN bloqueados a propósito para comprobar que nada se rompe sin conexión).

Participaron tres revisores: yo (construcción y pruebas de humo) y dos agentes independientes que no vieron la construcción: uno de **pruebas funcionales (QA)** y otro de **revisión de código (seguridad, rendimiento, accesibilidad)**. Ambos corrigieron errores; después se repitió toda la batería.

## 1. Resultado final

| Batería | Resultado |
|---|---|
| `tests/qa_flow.py` (cuentas, aislamiento, vinculación, notas, contramedidas, revocación, sesión completa, seguridad, exportaciones) | **42/42** |
| `tests/qa_kbd.py` (teclado, diálogos, rutas manipuladas, menú, sesión corta) | **18/18** |
| `tests/qa_layout.py` (desbordes y solapamientos a 375, 768 y 1440 px en 9 pantallas) | **0 fallos** |
| `tests/e2e.py` (sesión demo de 70 s → cuestionario → resultados → médico) | **OK**, sin errores de consola |
| `node tests/engine_test.js` (casos del motor) | **OK** |
| `node tests/demo_engine.js` (6 perfiles × 8 semanas) | **OK** |
| Búsqueda de nombres prohibidos y español en el HTML | **0** |

## 2. Lista de verificación del Prompt 1 (sección 13)

| Prueba | Resultado | Evidencia |
|---|---|---|
| Nombres prohibidos (APOLYNEX, Órbita Vital, Aura Med, Atelier, straVita, Stitch): 0 | ✅ | Búsqueda sensible a mayúsculas: 0 coincidencias (el logo «straVita» solo existe dentro de la imagen) |
| Caracteres y palabras en español en el HTML: 0 | ✅ | 0 `á é í ó ú ñ ¿ ¡`; las citas a tus PDFs se renombraron a `medical-data/...` en inglés |
| Paciente A no ve datos de B (interfaz, URL, almacenamiento) | ✅ | URL de una sesión de B → «Session not found»; iniciar como A tras B en la misma pestaña muestra solo A; los datos de cada cuenta están cifrados con su propia clave |
| Paciente no abre rutas de médico | ✅ | `#/doctor/...` redirige al panel del tripulante con aviso |
| Médico no ve pacientes sin vinculación aceptada; al revocar deja de verlos | ✅ | Solicitud pendiente → nada visible; tras revocar, triage vacío y URL de la ficha bloqueada |
| Nota para X aparece solo en X; la privada no aparece | ✅ | A ve solo la nota compartida; la privada queda en la bóveda del médico |
| Sesión demo → resultados → gráfica de sesión → semanal → historial con duración | ✅ | 4 gráficas por minuto, resumen semanal con comparación, historial con duración y tiempo total |
| Respuesta de seguridad positiva → protocolo de apoyo | ✅ | Diálogo sereno + alerta en la bandeja del médico vinculado |
| Sin errores en consola; teclado completo; 3 anchos | ✅ | Ver baterías anteriores |
| Todo resultado muestra «not a clinical diagnosis» | ✅ | Aviso en cada panel de resultados, pie de página e informes impresos |

## 3. Motor de orientación (casos de prueba)

| Caso | Resultado esperado | Resultado |
|---|---|---|
| Sano sin cuestionario | «No significant findings» | ✅ nominal |
| Sano con cuestionario | «No significant findings» | ✅ nominal (máximo 20/100) |
| Fatiga (cámara + cuestionario) | fatiga/sueño primero | ✅ Sleep deprivation 95, Insomnia 88… |
| Fatiga solo cámara | patrón de sueño, confianza adecuada | ✅ Sleep deprivation 40 (worth watching) |
| Estrés | estrés agudo/ansiedad primero | ✅ Acute stress response 93, Anxiety 84 |
| Aislamiento | aislamiento/anhedonia | ✅ Apathy/anhedonia 81, Loneliness 79 |
| Señal baja | «Insufficient signal quality», sin falsos positivos | ✅ sin hallazgos de cámara |
| Pregunta de seguridad = sí | protocolo de apoyo, estado alerta | ✅ |

Ajustes hechos tras probar: los patrones inespecíficos (nutricionales, endocrinos, medicación, entorno) necesitan un signo específico y pesan menos; la línea base móvil excluye sesiones con hallazgos para que una deriva lenta no se convierta en «lo normal»; los porcentajes frente a la línea base tienen un denominador mínimo para evitar cifras absurdas.

## 4. Errores encontrados y corregidos

**Revisión de código**
- La sesión podía caducar (30 min sin clics) durante una grabación larga y perderse al guardar → la grabación activa renueva la sesión.
- Si fallaba la reproducción tras dar permiso, la cámara seguía encendida → se detiene y se muestra el error.
- Calibración que podía quedar colgada; oyentes de «video terminado» acumulados; avisos engañosos al salir mientras cargaba el modelo.
- Permisos del canal de notas comprobados contra el registro almacenado (no contra el objeto recibido); bloqueo de mezcla demo/real también del lado del paciente; validación de nombre y email al registrarse; mensaje claro si una bóveda fue manipulada.
- Resumen correcto cuando solo se responde «sí» a la pregunta de seguridad.
- CSV protegido contra inyección de fórmulas; rutas como `#/constructor` ya no dejan la página en blanco; política de seguridad de contenido (CSP).

**Pruebas funcionales**
- La animación de cambio de página podía tapar el diálogo de apoyo → se omite mientras hay un diálogo abierto.
- El enlace «saltar al contenido» cambiaba la ruta; en el aviso de sesión corta, Esc descartaba la grabación (ahora la conserva).
- Desbordes de 334 px en historial y ficha del médico a 375 px; pantalla de acceso recortada en móvil; objetivos táctiles elevados a 44 px.
- Las fichas de tripulantes del médico ahora se descifran en paralelo.
- Las gráficas se redibujan al ancho real del contenedor (no se estiran textos ni puntos) y los ejes usan los decimales correctos.

## 5. Lo que no se pudo probar aquí

- **Cámara real y modelo facial MediaPipe**: el entorno de prueba no tiene cámara ni internet. El mismo procesamiento se probó con el guion demo y con la región fija de la frente. Pruébalo en tu Mac sirviendo la carpeta por http (ver README).
- **Fuentes Inter / JetBrains Mono**: sin internet se usan las fuentes del sistema; con conexión se cargan de Google Fonts.
- **Safari y Firefox**: se usaron solo APIs con soporte amplio y alternativas (por ejemplo, `requestVideoFrameCallback` cae a `requestAnimationFrame`), pero no se probaron en esos navegadores.

## 6. Limitaciones de diseño conocidas

- Prototipo del lado del cliente: alguien con acceso al perfil del navegador no puede leer los datos, pero sí borrarlos.
- Médico y paciente comparten una clave simétrica por vínculo; un paciente con conocimientos técnicos podría falsificar una «nota del médico». Firmar notas (ECDSA) o el backend .NET lo resolvería.
- Las grabaciones de más de 4 horas conservan solo las últimas 4 horas de muestras por segundo (los minutos y el resumen sí cubren toda la sesión).
