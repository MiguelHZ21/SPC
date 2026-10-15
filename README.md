# ✈️ MISIÓN BAJO CONTROL · Rumbo a ±3σ

Simulador de vuelo y control estadístico de procesos (SPC) en 3D para la **Semana de la Calidad**.

Este proyecto ha sido reforzado con una arquitectura cliente-servidor segura en **Node.js / Express**, eliminando todas las vulnerabilidades del frontend para garantizar la integridad pedagógica de la yincana y la competencia.

---

## 🔒 Mejoras de Seguridad Implementadas

1. **Códigos Secretos de Yincana Protegidos:**
   - La validación se realiza 100% en el servidor (`/api/levels/unlock`).
   - Los hashes y las palabras clave ya no existen en el código del navegador.
   - Los códigos se pueden configurar o cambiar fácilmente desde variables de entorno.

2. **Cuestionario SPC sin Respuestas en Cliente:**
   - El navegador solo recibe la pregunta y las opciones barajadas de forma aleatoria (la respuesta correcta ya no es siempre la 'B').
   - La respuesta se valida en el servidor mediante un token criptográfico firmado con JWT.

3. **Panel de Control de Calidad Autenticado:**
   - Autenticación con JWT y PIN seguro con hash bcrypt en el servidor.
   - Las acciones críticas (crear equipo, eliminar equipo, desbloquear niveles, reiniciar intentos) requieren cabecera `Authorization: Bearer <token>`.

4. **Validación de Puntaje e Intentos Anti-Trampas:**
   - El servidor exige un token de inicio de intento (`/api/attempts/start`) antes de registrar un resultado.
   - Se aplican límites matemáticos lógicos (sanity checks) para impedir que un usuario envíe puntajes inflados desde la consola.

5. **Protección contra Inyección de Fórmulas CSV:**
   - Todas las celdas exportables para Excel que comiencen con `=`, `+`, `-`, `@`, `\t` o `\r` se escapan automáticamente con un apóstrofe inicial `'`.

6. **Protección contra Prototype Pollution:**
   - Las funciones de fusión de objetos bloquean explícitamente `__proto__`, `constructor` y `prototype`.

---

## 🚀 Ejecución Local

1. Instala las dependencias:
   ```bash
   npm install
   ```

2. Configura las variables de entorno:
   - Copia `.env.example` a `.env` si deseas personalizar valores.

3. Inicia el servidor:
   ```bash
   npm start
   ```

4. Abre tu navegador en [http://localhost:3000](http://localhost:3000).

---

## ☁️ Guía de Despliegue en Render (Onrender)

Para desplegar este proyecto en **Render**:

### Paso 1: Subir el proyecto a GitHub
1. Inicializa el repositorio si no lo has hecho:
   ```bash
   git init
   git add .
   git commit -m "feat: implementar arquitectura segura y backend Node.js"
   ```
2. Crea un repositorio en GitHub y sube los cambios:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

### Paso 2: Crear el servicio en Render
1. Ve a [dashboard.render.com](https://dashboard.render.com/) e inicia sesión.
2. Haz clic en **New +** y selecciona **Web Service**.
3. Conecta tu repositorio de GitHub recién creado.
4. Configura los siguientes campos:
   - **Name:** `mision-bajo-control` (o el nombre que prefieras).
   - **Region:** Selecciona la más cercana (ej. Oregon o Frankfurt).
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan Type:** `Free` (o el plan deseado).

### Paso 3: Configurar Variables de Entorno en Render
En la pestaña **Environment** del panel de Render, añade las siguientes variables:

| Variable | Descripción | Valor Recomendado |
| :--- | :--- | :--- |
| `NODE_ENV` | Entorno de ejecución | `production` |
| `JWT_SECRET` | Clave secreta para tokens | *Genera una cadena larga aleatoria* |
| `ADMIN_PIN` | PIN para acceder a Control de Calidad | `2026` *(o tu propio PIN)* |
| `CODE_LEVEL_1` | Código ficha Lunes (Nivel 1) | `SPC-WBY7` |
| `CODE_LEVEL_2` | Código ficha Martes (Nivel 2) | `SPC-NGKK` |
| `CODE_LEVEL_3` | Código ficha Miércoles (Nivel 3) | `SPC-XDA6` |
| `CODE_LEVEL_4` | Código ficha Jueves (Nivel 4) | `SPC-TXKR` |
| `CODE_LEVEL_5` | Código ficha Viernes (Nivel 5) | `SPC-AHA5` |

5. Haz clic en **Deploy Web Service**.
6. Render generará una URL pública (ejemplo: `https://mision-bajo-control.onrender.com`).

---

## 🛠️ Panel de Control de Calidad

- Para acceder al panel administrativo desde el juego, haz clic en **CONTROL DE CALIDAD**.
- Ingresa el PIN configurado (`ADMIN_PIN`, por defecto `2026`).
- Desde allí podrás registrar equipos por turno, reiniciar intentos, desbloquear niveles y exportar los resultados a Excel de forma segura.
