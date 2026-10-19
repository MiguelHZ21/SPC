'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mision_bajo_control_secret_2026_dev';
const ADMIN_PIN = process.env.ADMIN_PIN || '2026';

// Códigos secretos de desbloqueo configurables desde variables de entorno
const UNLOCK_CODES = {
  1: process.env.CODE_LEVEL_1 || 'SPC-WBY7',
  2: process.env.CODE_LEVEL_2 || 'SPC-NGKK',
  3: process.env.CODE_LEVEL_3 || 'SPC-XDA6',
  4: process.env.CODE_LEVEL_4 || 'SPC-TXKR',
  5: process.env.CODE_LEVEL_5 || 'SPC-AHA5'
};

// Preguntas y respuestas SPC (mantenidas en el servidor)
const QUESTIONS = {
  1: {
    t: 'Un operario ajusta la máquina cada vez que la densidad cambia un poco, aunque los puntos siguen dentro de los límites de control. ¿Qué está pasando?',
    o: [
      'Es un control proactivo excelente',
      'Es sobreajuste: reacciona a variación común y termina aumentando la variación',
      'Es una causa especial que hay que eliminar',
      'Es la única forma de cumplir la especificación'
    ],
    c: 1,
    e: 'La variación común es el ruido natural del proceso. Ajustar por cada pequeño cambio mete variación extra. Solo se reacciona ante señales de causa especial.'
  },
  2: {
    t: 'Un punto está DENTRO de la especificación del cliente pero POR FUERA del LSC. ¿Qué haces?',
    o: [
      'Nada: el cliente lo acepta',
      'Investigar la causa especial: el proceso cambió aunque el producto aún cumpla',
      'Ampliar los límites de control para que no vuelva a pasar',
      'Mover los límites de especificación'
    ],
    c: 1,
    e: 'Los límites de control son la voz del proceso; la especificación es la voz del cliente. Un punto fuera de control es una alarma temprana: actuar ahí evita producir no conforme.'
  },
  3: {
    t: 'Antes de llevar las lecturas de un espectrofotómetro a una carta de control, lo primero es:',
    o: [
      'Graficar de inmediato para no perder tiempo',
      'Asegurar que el sistema de medición sea confiable (calibración / MSA)',
      'Pedir al siguiente turno que mida de nuevo',
      'Ajustar la máquina con la primera lectura'
    ],
    c: 1,
    e: 'Si el sistema de medición tiene sesgo o mucha variación, la carta muestra un proceso que no existe. Primero se valida la medición (MSA), después se controla el proceso.'
  },
  4: {
    t: 'En una carta aparecen 7 puntos consecutivos por encima de la línea central, todos dentro de los límites de control. ¿Qué significa?',
    o: [
      'El proceso está estable: no hay puntos fuera de límites',
      'Es una señal de causa especial: posible desplazamiento de la media',
      'Es un error de medición seguro',
      'Hay que recalcular la especificación del cliente'
    ],
    c: 1,
    e: 'Las reglas de detección (Western Electric / Nelson) encuentran causas especiales aunque ningún punto cruce los límites. 7 seguidos de un lado indican un cambio sostenido en la media.'
  },
  5: {
    t: 'Un proceso está bajo control estadístico pero su Cpk es 0,9. ¿Qué concluyes?',
    o: [
      'Es capaz: está bajo control',
      'Es estable pero NO es capaz: producirá unidades fuera de especificación',
      'Está fuera de control',
      'Hay que ampliar los límites de control'
    ],
    c: 1,
    e: 'Estabilidad (control) y capacidad son cosas distintas. Cpk < 1,33 indica que la variación no cabe holgadamente en la especificación: hay que reducir σ o centrar el proceso.'
  }
};

/* ================= SEGURIDAD Y MIDDLEWARES ================= */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ================= PERSISTENCIA EN ARCHIVO ================= */
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let store = { version: 1, teams: [], config: {} };

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf8');
      store = JSON.parse(data);
      if (!Array.isArray(store.teams)) store.teams = [];
      if (!store.config) store.config = {};
      if (typeof store.version !== 'number') store.version = 1;
    }
    // Si la lista de equipos está vacía, inicializar con los 12 equipos predeterminados
    if (store.teams.length === 0) {
      const seedFile = path.join(DATA_DIR, 'seed_teams.json');
      if (fs.existsSync(seedFile)) {
        store.teams = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      }
      saveStore();
    }
  } catch (err) {
    console.error('Error al cargar base de datos local:', err);
    store = { version: 1, teams: [], config: {} };
  }
}

/* ---------- MongoDB Atlas (opcional, recomendado en Render) ---------- */
const MONGODB_URI = process.env.MONGODB_URI || '';
let mongoCol = null;
let mongoTimer = null;
let mongoPending = false;

async function initMongo() {
  if (!MONGODB_URI) {
    console.log('ℹ️  MONGODB_URI no definido: usando archivo local data/store.json');
    return;
  }
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const dbName = process.env.MONGODB_DB || 'mision_bajo_control';
  mongoCol = client.db(dbName).collection('store');
  const doc = await mongoCol.findOne({ _id: 'main' });
  if (doc && Array.isArray(doc.teams) && doc.teams.length) {
    store = { version: doc.version || 1, teams: doc.teams, config: doc.config || {} };
    console.log(`✅ MongoDB conectado: ${store.teams.length} equipos cargados`);
  } else {
    await flushMongo();
    console.log('✅ MongoDB conectado: base inicializada con los equipos locales');
  }
}

async function flushMongo() {
  if (!mongoCol) return;
  try {
    await mongoCol.replaceOne(
      { _id: 'main' },
      { _id: 'main', version: store.version, teams: store.teams, config: store.config, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (e) {
    console.error('Error al guardar en MongoDB:', e.message);
    mongoPending = true;
  }
}

function scheduleMongoSave() {
  if (!mongoCol) return;
  if (mongoTimer) clearTimeout(mongoTimer);
  mongoTimer = setTimeout(() => { mongoTimer = null; mongoPending = false; flushMongo(); }, 300);
}
setInterval(() => { if (mongoPending) { mongoPending = false; flushMongo(); } }, 10000);

function saveStore() {
  scheduleMongoSave();
  try {
    const tempFile = STORE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tempFile, STORE_FILE);
  } catch (err) {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (e2) {
      console.error('Error al guardar base de datos local:', e2);
    }
  }
}

loadStore();

/* ================= FUNCIONES DE UTILIDAD ================= */
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function sanitizeForCSV(str) {
  const val = String(str == null ? '' : str).trim();
  if (/^[=\+\-@\t\r]/.test(val)) {
    return "'" + val; // Escapar fórmulas para Excel
  }
  return val;
}

function calcTotal(team) {
  let s = 0;
  for (let n = 1; n <= 5; n++) {
    const attObj = team.attempts && (team.attempts[n] || team.attempts[String(n)]);
    const f = attObj && attObj.final;
    if (f && typeof f.score === 'number' && isFinite(f.score) && f.status === 'completado') {
      s += Math.max(0, Math.round(f.score));
    }
  }
  return s;
}

// Middleware de autenticación de Administrador (Control de Calidad)
function authAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: se requiere sesión de Calidad' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

/* ================= RUTAS DE LA API ================= */

// 0. Verificación de conectividad (requerido por Store.init)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// 1. Estado sincronizado completo (versión, equipos, configuración)
app.get('/api/state', (req, res) => {
  res.json({
    version: store.version || 1,
    teams: store.teams || [],
    config: store.config || {}
  });
});

// 2. Obtener un equipo individual por ID
app.get('/api/teams/:id', (req, res) => {
  const team = store.teams.find(t => t.id === req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Equipo no encontrado' });
  }
  res.json(team);
});

// 3. Crear o actualizar equipo por ID (sincronizado con Store.updateTeam / Store.addTeam)
app.put('/api/teams/:id', (req, res) => {
  const id = req.params.id;
  const doc = req.body;
  if (!doc || typeof doc !== 'object') {
    return res.status(400).json({ error: 'Cuerpo de petición inválido' });
  }
  doc.id = id;

  // Sanitización de textos para prevenir inyecciones y fórmulas
  if (doc.name) {
    doc.name = sanitizeForCSV(String(doc.name).slice(0, 50));
  }
  if (doc.shift) {
    doc.shift = sanitizeForCSV(String(doc.shift).slice(0, 50));
  }
  if (typeof doc.color !== 'number') {
    doc.color = 0;
  }

  // Validación de intentos y puntajes
  if (doc.attempts && typeof doc.attempts === 'object') {
    for (const lvl in doc.attempts) {
      const attObj = doc.attempts[lvl];
      if (attObj && typeof attObj === 'object') {
        ['practice', 'practice2', 'final'].forEach(type => {
          const a = attObj[type];
          if (a && typeof a === 'object') {
            if (typeof a.score === 'number' && isFinite(a.score)) {
              a.score = Math.max(0, Math.min(20000, Math.round(a.score)));
            }
          }
        });
      }
    }
  }
  doc.total = calcTotal(doc);

  const idx = store.teams.findIndex(t => t.id === id);
  if (idx >= 0) {
    store.teams[idx] = doc;
  } else {
    store.teams.push(doc);
  }

  store.version = (store.version || 1) + 1;
  saveStore();
  res.json(doc);
});

// 4. Eliminar equipo por ID
app.delete('/api/teams/:id', (req, res) => {
  const id = req.params.id;
  const idx = store.teams.findIndex(t => t.id === id);
  if (idx >= 0) {
    store.teams.splice(idx, 1);
    store.version = (store.version || 1) + 1;
    saveStore();
  }
  res.json({ ok: true });
});

// 5. Actualizar configuración global
app.put('/api/config', (req, res) => {
  const patch = req.body;
  if (patch && typeof patch === 'object') {
    store.config = Object.assign({}, store.config, patch);
    store.version = (store.version || 1) + 1;
    saveStore();
  }
  res.json({ ok: true, config: store.config });
});

// 6. Estado de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// 2. Obtener lista pública de equipos y estado
app.get('/api/teams', (req, res) => {
  // Retornar solo los datos necesarios
  const safeTeams = store.teams.map(t => ({
    id: t.id,
    name: t.name,
    shift: t.shift,
    unlocked: t.unlocked || {},
    attempts: t.attempts || {},
    total: calcTotal(t)
  }));
  res.json(safeTeams);
});

// 3. Desbloquear nivel con código de la yincana (Validación 100% en servidor)
app.post('/api/levels/unlock', (req, res) => {
  const { teamId, code } = req.body;
  if (!teamId || !code) {
    return res.status(400).json({ error: 'teamId y code requeridos' });
  }
  const team = store.teams.find(t => t.id === teamId);
  if (!team) {
    return res.status(404).json({ error: 'Equipo no encontrado' });
  }

  const cleanInput = normCode(code);
  let matchedLevel = null;

  for (let lvl = 1; lvl <= 5; lvl++) {
    const correctClean = normCode(UNLOCK_CODES[lvl]);
    if (cleanInput === correctClean) {
      matchedLevel = lvl;
      break;
    }
  }

  if (!matchedLevel) {
    return res.status(400).json({ success: false, message: 'Código no válido. Revisa la ficha encontrada en planta.' });
  }

  if (team.unlocked && team.unlocked[matchedLevel]) {
    return res.json({
      success: true,
      alreadyUnlocked: true,
      level: matchedLevel,
      message: `El código corresponde al nivel ${matchedLevel}, que ya estaba desbloqueado.`
    });
  }

  if (!team.unlocked) team.unlocked = {};
  team.unlocked[matchedLevel] = true;
  saveStore();

  res.json({
    success: true,
    alreadyUnlocked: false,
    level: matchedLevel,
    message: `¡Nivel ${matchedLevel} desbloqueado exitosamente!`
  });
});

// 4. Obtener pregunta SPC con opciones barajadas (Sin revelar la respuesta)
app.get('/api/quiz/:level', (req, res) => {
  const level = parseInt(req.params.level, 10);
  const qData = QUESTIONS[level];
  if (!qData) {
    return res.status(404).json({ error: 'Nivel no encontrado' });
  }

  // Barajar las opciones aleatoriamente para evitar que siempre sea la misma posición
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const shuffledOptions = indices.map(idx => qData.o[idx]);

  // Generar token firmado con el mapeo para verificar posteriormente
  const quizToken = jwt.sign(
    {
      level,
      map: indices,
      correctOriginalIndex: qData.c
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  res.json({
    level,
    questionText: qData.t,
    options: shuffledOptions,
    quizToken
  });
});

// 5. Validar respuesta de pregunta SPC en servidor
app.post('/api/quiz/submit', (req, res) => {
  const { quizToken, selectedIndex } = req.body;
  if (!quizToken || typeof selectedIndex !== 'number') {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const payload = jwt.verify(quizToken, JWT_SECRET);
    const chosenOriginalIndex = payload.map[selectedIndex];
    const isCorrect = chosenOriginalIndex === payload.correctOriginalIndex;
    const qData = QUESTIONS[payload.level];

    // Encontrar en qué posición barajada quedó la respuesta correcta para mostrar feedback
    const correctShuffledIndex = payload.map.indexOf(payload.correctOriginalIndex);

    res.json({
      correct: isCorrect,
      correctShuffledIndex,
      explanation: qData ? qData.e : ''
    });
  } catch (e) {
    return res.status(400).json({ error: 'Token de pregunta expirado o inválido' });
  }
});

// 6. Iniciar intento (Registra consumo de intento definitivo si se sale)
app.post('/api/attempts/start', (req, res) => {
  const { teamId, level, attemptType } = req.body;
  const lvl = parseInt(level, 10);
  if (!teamId || !lvl || !['practice', 'practice2', 'final'].includes(attemptType)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const team = store.teams.find(t => t.id === teamId);
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  if (!team.unlocked || !team.unlocked[lvl]) {
    return res.status(403).json({ error: 'Nivel bloqueado para este equipo' });
  }

  if (!team.attempts) team.attempts = {};
  if (!team.attempts[lvl]) team.attempts[lvl] = { practice: null, practice2: null, final: null };

  const currentAtt = team.attempts[lvl][attemptType];
  if (currentAtt && currentAtt.status === 'completado') {
    return res.status(400).json({ error: 'Este intento ya fue completado previamente' });
  }

  // Marcar intento en curso
  team.attempts[lvl][attemptType] = {
    status: 'en curso',
    startedAt: new Date().toISOString()
  };
  saveStore();

  // Generar token de intento firmado para evitar manipulación de puntaje al finalizar
  const attemptToken = jwt.sign(
    {
      teamId,
      level: lvl,
      attemptType,
      startedAt: Date.now()
    },
    JWT_SECRET,
    { expiresIn: '30m' }
  );

  res.json({ success: true, attemptToken });
});

// 7. Finalizar intento y registrar puntaje con validación matemática
app.post('/api/attempts/finish', (req, res) => {
  const { attemptToken, stats } = req.body;
  if (!attemptToken || !stats) {
    return res.status(400).json({ error: 'Faltan datos del intento' });
  }

  let tokenData;
  try {
    tokenData = jwt.verify(attemptToken, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token de intento inválido o expirado' });
  }

  const { teamId, level, attemptType } = tokenData;
  const team = store.teams.find(t => t.id === teamId);
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  // Sanity check y cálculo seguro de puntaje
  const inCtrlN = Math.max(0, Math.min(200, parseInt(stats.inCtrlN, 10) || 0));
  const pCtrl = inCtrlN * 15;

  const cpkVal = typeof stats.cpk === 'number' && isFinite(stats.cpk) ? stats.cpk : null;
  const pCpk = (cpkVal && stats.tookOff) ? Math.round(Math.max(0, Math.min(3, cpkVal)) * 200) : 0;

  const pTake = stats.tookOff ? 500 : 0;
  const pQuiz = stats.quizCorrect ? 500 : 0;
  const pRings = (parseInt(stats.ringsHit, 10) || 0) * 100;
  const pFlight = Math.max(0, Math.min(1500, Math.round(stats.stab || 0)));
  const pSignalsHit = (parseInt(stats.signalsHit, 10) || 0) * 150;
  const pSignalsMiss = (parseInt(stats.signalsMiss, 10) || 0) * -50;
  const pSignalsFa = (parseInt(stats.signalsFa, 10) || 0) * -30;
  const pFinish = stats.success ? 300 : 0;

  const totalScore = Math.max(0, pCtrl + pCpk + pTake + pQuiz + pRings + pFlight + pSignalsHit + pSignalsMiss + pSignalsFa + pFinish);

  if (!team.attempts) team.attempts = {};
  if (!team.attempts[level]) team.attempts[level] = {};

  const record = {
    status: 'completado',
    score: totalScore,
    success: !!stats.success,
    reason: String(stats.reason || 'ok').slice(0, 30),
    cpk: cpkVal != null ? Math.round(cpkVal * 100) / 100 : null,
    cp: typeof stats.cp === 'number' && isFinite(stats.cp) ? Math.round(stats.cp * 100) / 100 : null,
    inCtrl: typeof stats.inCtrl === 'number' ? Math.round(stats.inCtrl) : null,
    quiz: pQuiz > 0,
    endedAt: new Date().toISOString()
  };

  team.attempts[level][attemptType] = record;
  if (attemptType === 'final') {
    team.total = calcTotal(team);
  }

  saveStore();

  res.json({
    success: true,
    score: totalScore,
    totalTeamScore: team.total
  });
});

/* ================= RUTAS DE CONTROL DE CALIDAD (ADMIN) ================= */

// 8. Login de Administrador (PIN verificado en servidor)
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN requerido' });

  let isValid = false;

  // Comparar con hash almacenado en config o con variable de entorno
  if (store.config.pinHash) {
    isValid = bcrypt.compareSync(String(pin), store.config.pinHash);
  } else {
    // Si aún no hay hash en BD, usar el ADMIN_PIN por defecto y guardar su hash
    isValid = (String(pin).trim() === String(ADMIN_PIN).trim());
    if (isValid) {
      store.config.pinHash = bcrypt.hashSync(String(pin).trim(), 10);
      saveStore();
    }
  }

  if (!isValid) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  // Generar token JWT de administrador (12 horas de duración)
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token });
});

// 9. Registrar nuevo equipo (Solo Admin)
app.post('/api/admin/teams', authAdmin, (req, res) => {
  const { name, shift } = req.body;
  const cleanName = sanitizeForCSV(name);
  const cleanShift = sanitizeForCSV(shift || 'Turno 1');

  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: 'Nombre de equipo inválido (mínimo 2 caracteres)' });
  }

  if (store.teams.some(t => t.name.toLowerCase() === cleanName.toLowerCase() && t.shift === cleanShift)) {
    return res.status(400).json({ error: 'Ya existe un equipo con ese nombre en ese turno' });
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const newTeam = {
    id,
    name: cleanName.slice(0, 40),
    shift: cleanShift,
    unlocked: {},
    attempts: {},
    total: 0,
    created: new Date().toISOString()
  };

  store.teams.push(newTeam);
  saveStore();

  res.json({ success: true, team: newTeam });
});

// 10. Eliminar equipo (Solo Admin)
app.delete('/api/admin/teams/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  const idx = store.teams.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Equipo no encontrado' });

  const deleted = store.teams.splice(idx, 1)[0];
  saveStore();
  res.json({ success: true, message: `Equipo ${deleted.name} eliminado` });
});

// 11. Reiniciar intentos de un nivel (Solo Admin)
app.post('/api/admin/teams/:id/reset-attempt', authAdmin, (req, res) => {
  const { id } = req.params;
  const { level } = req.body;
  const lvl = parseInt(level, 10);

  const team = store.teams.find(t => t.id === id);
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  if (team.attempts && team.attempts[lvl]) {
    team.attempts[lvl] = { practice: null, practice2: null, final: null };
    team.total = calcTotal(team);
    saveStore();
  }

  res.json({ success: true, message: `Intentos del nivel ${lvl} reiniciados para ${team.name}` });
});

// 12. Desbloquear nivel manualmente (Solo Admin)
app.post('/api/admin/teams/:id/unlock', authAdmin, (req, res) => {
  const { id } = req.params;
  const { level } = req.body;
  const lvl = parseInt(level, 10);

  const team = store.teams.find(t => t.id === id);
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  if (!team.unlocked) team.unlocked = {};
  team.unlocked[lvl] = true;
  saveStore();

  res.json({ success: true, message: `Nivel ${lvl} desbloqueado para ${team.name}` });
});

// 13. Cambiar PIN de Calidad (Solo Admin)
app.post('/api/admin/set-pin', authAdmin, (req, res) => {
  const { newPin } = req.body;
  if (!/^\d{4,8}$/.test(String(newPin || ''))) {
    return res.status(400).json({ error: 'El nuevo PIN debe tener entre 4 y 8 dígitos numéricos' });
  }

  store.config.pinHash = bcrypt.hashSync(String(newPin).trim(), 10);
  saveStore();
  res.json({ success: true, message: 'PIN actualizado exitosamente' });
});

// Fallback a frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor (primero carga datos desde MongoDB si está configurado)
initMongo()
  .catch(err => console.error('❌ No se pudo conectar a MongoDB, usando archivo local:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`🚀 MISIÓN BAJO CONTROL - Servidor Seguro Activo`);
      console.log(`📡 Puerto: ${PORT}`);
      console.log(`💾 Almacenamiento: ${mongoCol ? 'MongoDB Atlas' : 'Archivo local'}`);
      console.log(`===============================================`);
    });
  });
