# Script to generate secured public/index.html from original game
import os, re

src_file = "MISIÓN BAJO CONTROL · Rumbo a ±3σ.html"
dest_file = "public/index.html"

os.makedirs("public", exist_ok=True)

with open(src_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Title and add Meta/CSP headers
# Replace CODE_HASH and checkCode with safe placeholder or remove
old_code_check = """const CODE_HASH=['820ca5bb35832a96eab5414dfd12f2bbee78db81cc4c5c13d9e24b474c4ffb5e','927398fc780b4536843e5b452287ffd934d8baeca0c6f5436c7f99bf32ba3fa7','ce734753f5449f8d432be90603c51f33a4fb94f844f143e4ace6911ace477ef5','4d0e52b045501371caf37b50a76d64e7c7a3c52fe4ebc24112ae0cd23b366ba7','25bd923c26fb7f6052fb41ea86fc1c82c53edeb94faeb3f372c61c6c938462ee'];
function checkCode(n,code){return sha256('mbc26:'+normCode(code))===CODE_HASH[n-1];}"""

new_code_check = """// Los códigos secretos de desbloqueo se validan 100% de forma segura en el servidor
async function checkCodeRemote(teamId, code){ return await Store.unlockLevel(teamId, code); }"""

if old_code_check in content:
    content = content.replace(old_code_check, new_code_check)
    print("Replaced code check hashes successfully.")
else:
    print("Warning: old_code_check not found exactly, using regex.")
    content = re.sub(r"const CODE_HASH=\[.*?\];\s*function checkCode\(n,code\)\{.*?\n", new_code_check + "\n", content, flags=re.DOTALL)

# 2. In LEVELS, remove hardcoded correct answers (c: 1)
# Replace q:{t:'...',o:[...],c:1,e:'...'} with empty or placeholder, as question is loaded from server
content = re.sub(r"q:\{t:'.*?',o:\[.*?\],c:1,e:'.*?'\},", "q:null,", content)
print("Sanitized LEVELS questions.")

# 3. Replace Store definition and deepMerge
old_store_pattern = re.compile(r"/\* ================= ALMACENAMIENTO \(cuenta Claude o local\) ================= \*/.*?/\* ================= ESTADO DEL JUEGO ================= \*/", re.DOTALL)

new_store = """/* ================= ALMACENAMIENTO SEGURO (Backend API) ================= */
const Store = {
  mode: 'remote',
  teams: [],
  canWrite: true,
  adminToken: null,
  attemptToken: null,
  listeners: [],
  async init() {
    await this.refresh();
  },
  async refresh() {
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        this.teams = await res.json();
        this.mode = 'remote';
        this.canWrite = true;
      } else {
        throw new Error('Error al conectar con servidor');
      }
    } catch (e) {
      this.mode = 'local';
      this.canWrite = false;
      toast('Sin conexión con el servidor de Calidad. Revisa la red.', 'warn', 4000);
    }
    this.emit();
  },
  emit() {
    this.listeners.forEach(f => { try { f(); } catch(e){} });
  },
  team(id) {
    return this.teams.find(t => t.id === id) || null;
  },
  async unlockLevel(teamId, code) {
    const res = await fetch('/api/levels/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, code })
    });
    const data = await res.json();
    if (data.success) await this.refresh();
    return data;
  },
  async startAttempt(teamId, level, attemptType) {
    const res = await fetch('/api/attempts/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, level, attemptType })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo iniciar el intento');
    }
    const data = await res.json();
    this.attemptToken = data.attemptToken;
    await this.refresh();
    return data;
  },
  async finishAttempt(stats) {
    if (!this.attemptToken) throw new Error('No hay sesión de intento activa');
    const res = await fetch('/api/attempts/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptToken: this.attemptToken, stats })
    });
    this.attemptToken = null;
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar resultado');
    }
    const data = await res.json();
    await this.refresh();
    return data;
  },
  async adminLogin(pin) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'PIN incorrecto');
    }
    const data = await res.json();
    this.adminToken = data.token;
    return data;
  },
  async addTeam(name, shift) {
    if (!this.adminToken) throw new Error('No autorizado');
    const res = await fetch('/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.adminToken
      },
      body: JSON.stringify({ name, shift })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo registrar equipo');
    }
    await this.refresh();
  },
  async deleteTeam(id) {
    if (!this.adminToken) throw new Error('No autorizado');
    const res = await fetch('/api/admin/teams/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + this.adminToken }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo eliminar equipo');
    }
    await this.refresh();
  },
  async resetAttempt(id, level) {
    if (!this.adminToken) throw new Error('No autorizado');
    const res = await fetch('/api/admin/teams/' + id + '/reset-attempt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.adminToken
      },
      body: JSON.stringify({ level })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo reiniciar');
    }
    await this.refresh();
  },
  async adminUnlock(id, level) {
    if (!this.adminToken) throw new Error('No autorizado');
    const res = await fetch('/api/admin/teams/' + id + '/unlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.adminToken
      },
      body: JSON.stringify({ level })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo desbloquear');
    }
    await this.refresh();
  }
};

function deepMerge(t,p){
  for(const k in p){
    if(k==='__proto__'||k==='constructor'||k==='prototype') continue;
    const v=p[k];
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      if(!t[k]||typeof t[k]!=='object')t[k]={};
      deepMerge(t[k],v);
    }else t[k]=v;
  }
  return t;
}
function att(team,n){return(team&&team.attempts&&team.attempts[n])||{};}
function isUnlocked(team,n){return!!(team&&team.unlocked&&team.unlocked[n]);}
function nextAttemptType(team,n){const a=att(team,n);if(!a.practice)return'practice';if(!a.final)return'final';return null;}
function calcTotal(team){let s=0;for(let n=1;n<=5;n++){const f=att(team,n).final;if(f&&typeof f.score==='number'&&f.status==='completado')s+=f.score;}return s;}

/* ================= ESTADO DEL JUEGO ================= */"""

content = old_store_pattern.sub(new_store, content)
print("Replaced Store implementation.")

# 4. Replace openQuestion and answer
old_quiz_pattern = re.compile(r"function openQuestion\(\)\{.*?/\* ------------- Ascenso \(acierto\) ------------- \*/", re.DOTALL)

new_quiz = """async function openQuestion(){
  G.state='question';G.timeScale=0.06;const lv=curLevel();
  G.quiz={answered:false,correct:false,token:null,explanation:''};
  $('#qText').textContent='Conectando con Control de Misión…';
  const box=$('#qOpts');box.innerHTML='';$('#qFeedback').innerHTML='';hide('#bQContinue');
  only('#question');
  try{
    const res=await fetch('/api/quiz/'+lv.n);
    if(!res.ok) throw new Error('Error al cargar pregunta');
    const data=await res.json();
    G.quiz.token=data.quizToken;
    $('#qText').textContent=data.questionText;
    box.innerHTML='';
    data.options.forEach((txt,i)=>{
      const b=document.createElement('button');
      b.type='button';b.className='opt';
      b.textContent=String.fromCharCode(65+i)+') '+txt;
      b.onclick=()=>answer(i);
      box.appendChild(b);
    });
  }catch(e){
    $('#qText').textContent='No se pudo cargar la pregunta del servidor. Revisa la conexión.';
  }
}
function questionUpdate(dt){const R=G.R;R.dist+=R.speed*dt;runwayMat.uniforms.uOffset.value=R.dist;movePoles(R.speed,dt);updateLabels(R.spec,R.dispL,R.dispU,R.ctrlA,R.speed,dt);G.shake=Math.max(G.shake,0.03);cockpitCam();}
async function answer(i){
  if(G.quiz.answered||!G.quiz.token)return;
  G.quiz.answered=true;
  [...document.querySelectorAll('#qOpts .opt')].forEach(b=>{b.disabled=true;});
  try{
    const res=await fetch('/api/quiz/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({quizToken:G.quiz.token,selectedIndex:i})
    });
    const result=await res.json();
    G.quiz.correct=!!result.correct;
    G.quiz.explanation=result.explanation||'';
    [...document.querySelectorAll('#qOpts .opt')].forEach((b,j)=>{
      if(j===result.correctShuffledIndex) b.classList.add('ok');
      else if(j===i) b.classList.add('no');
    });
    const fb=$('#qFeedback');fb.innerHTML='';
    const h=document.createElement('div');h.className='disp';
    h.style.cssText='font-size:1.2em;margin-bottom:4px;color:'+(G.quiz.correct?'var(--hud)':'var(--danger)');
    h.textContent=G.quiz.correct?'¡CORRECTO! Despegue autorizado (+500)':'INCORRECTO · El avión pierde el control';
    const p=document.createElement('div');p.textContent=result.explanation||'';
    fb.appendChild(h);fb.appendChild(p);
    const b=$('#bQContinue');
    b.textContent=G.quiz.correct?'CONTINUAR AL DESPEGUE':'CONTINUAR';
    show('#bQContinue');
    G.quiz.correct?AudioSys.click('C7'):AudioSys.beepNow('C4');
  }catch(e){
    G.quiz.correct=false;
    $('#bQContinue').textContent='CONTINUAR';
    show('#bQContinue');
  }
}
$('#bQContinue').onclick=()=>{only(null);if(G.quiz.correct)beginClimb();else beginCrash();};

/* ------------- Ascenso (acierto) ------------- */"""

content = old_quiz_pattern.sub(lambda m: new_quiz, content)
print("Replaced openQuestion and answer.")

# 5. Replace finishLevel
old_finish_pattern = re.compile(r"async function finishLevel\(success,reason\)\{.*?// UI del reporte", re.DOTALL)

new_finish = """async function finishLevel(success,reason){
  const R=G.R,F=G.F,lv=curLevel();G.state='report';$('#alertFrame').className='';AudioSys.engine(0,false);$('#cockpit').classList.remove('on');G.camMode='chase';camera.fov=camera.aspect<1?78:60;camera.updateProjectionMatrix();
  const vals=R.samples.map(s=>s.v);
  let lim=null;if(R.calibrated)lim={mean:R.mean,sigma:R.sigma,lcl:R.lcl,ucl:R.ucl,partial:false};else{const st=imr(vals);if(st){const sg=Math.max(0.25,st.sigma);lim={mean:st.mean,sigma:sg,lcl:st.mean-3*sg,ucl:st.mean+3*sg,partial:true};}}
  const cap=capability(vals,R.spec);
  let inCtrl=null,oocTotal=0,inCtrlN=0;if(lim){let n=0;R.samples.forEach((s,i)=>{const o=s.v>lim.ucl||s.v<lim.lcl;s.oocR=o;if(o)oocTotal++;if(i>=20||lim.partial){n++;if(!o)inCtrlN++;}});inCtrl=n?inCtrlN/n*100:null;}
  const fcap=F?capability(F.samples.map(s=>s.v),3):null;if(F)F.samples.forEach(s=>s.oocR=Math.abs(s.v)>3);
  // Puntaje local para vista previa
  const pCtrl=inCtrlN*15;
  const pCpk=cap?Math.round(clamp(cap.cpk,0,3)*200):0;
  const pTake=R.tookOff?500:0;
  const pQuiz=G.quiz&&G.quiz.correct?500:0;
  const pFlight=F?Math.max(0,Math.round(F.stab)):0;
  const pFinish=success?300:0;
  let score=Math.max(0,pCtrl+pCpk+pTake+pQuiz+pFlight+pFinish);
  G.result={success,reason,score,cap,fcap,inCtrl,oocTotal,lim,parts:[['Muestras en control en pista ('+inCtrlN+' × 15)',pCtrl],['Capacidad en pista (Cpk × 200, máx. 600)',pCpk],['Despegue (VR alcanzada)',pTake],['Pregunta SPC de Control de Misión',pQuiz],['Estabilidad en vuelo (cerca de 0σ)',pFlight],['Misión completada',pFinish]],date:new Date()};
  // Registro verificado en el servidor
  const type=G.attemptType;let saved=false;
  try{
    const statsPayload={
      inCtrlN,
      cpk:cap&&isFinite(cap.cpk)?cap.cpk:null,
      cp:cap&&isFinite(cap.cp)?cap.cp:null,
      tookOff:!!R.tookOff,
      quizCorrect:!!(G.quiz&&G.quiz.correct),
      stab:F?F.stab:0,
      success:!!success,
      reason,
      inCtrl:inCtrl!=null?Math.round(inCtrl):null
    };
    const res=await Store.finishAttempt(statsPayload);
    if(res.score!=null) score=res.score;
    saved=true;
  }catch(e){
    console.error('Error guardando intento:', e);
    saved=false;
  }
  // UI del reporte"""

content = old_finish_pattern.sub(new_finish, content)
print("Replaced finishLevel.")

# 6. Replace #bStart.onclick
old_start_pattern = re.compile(r"\$\('#bStart'\)\.onclick=async\(\)=>\{.*?startLevel\(\);\},'COMENZAR'\);\}\;", re.DOTALL)

new_start = """$('#bStart').onclick=async()=>{
  const team=selTeam(),lv=LEVELS[G.menuSel];if(!team||!isUnlocked(team,lv.n))return;
  const nt=nextAttemptType(team,lv.n);if(!nt)return;
  await AudioSys.init();AudioSys.click('C6');
  if(nt==='final'){
    const ok=await confirmBox('INTENTO DEFINITIVO','Equipo '+team.name+': este intento del nivel '+lv.n+' cuenta para el ranking y los premios, y no se puede repetir. ¿Están listos?','SÍ, ESTAMOS LISTOS');
    if(!ok){only('#menu');return;}
  }
  G.level=G.menuSel;G.attemptType=nt;
  openPages(briefingPages(lv,nt),async()=>{
    try{
      await Store.startAttempt(team.id, lv.n, nt);
      startLevel();
    }catch(e){
      only('#menu');G.state='menu';
      $('#menuErr').textContent=e.message||'No se pudo registrar el intento. Revisa la conexión.';
    }
  },'COMENZAR');
};"""

content = old_start_pattern.sub(new_start, content)
print("Replaced bStart.onclick.")

# 7. Replace tryCode
old_trycode_pattern = re.compile(r"async function tryCode\(\)\{.*?\}\s*\$\('#codeOk'\)\.onclick=tryCode;.*?\n", re.DOTALL)

new_trycode = """async function tryCode(){
  const team=selTeam();if(!team)return;
  const code=$('#codeIn').value.trim();
  const msg=$('#codeMsg');
  if(!code){msg.style.color='var(--danger)';msg.textContent='Escribe el código de la ficha.';return;}
  try{
    const res=await Store.unlockLevel(team.id, code);
    if(!res.success){
      msg.style.color='var(--danger)';
      msg.textContent=res.message||'Código no válido. Revisa la ficha.';
      AudioSys.beepNow('C4');
      return;
    }
    if(res.alreadyUnlocked){
      msg.style.color='var(--cyan)';
      msg.textContent=res.message;
      return;
    }
    msg.style.color='var(--hud)';
    msg.textContent=res.message;
    AudioSys.click('C7');
    G.menuSel=res.level-1;
    setTimeout(()=>{hide('#codeModal');buildLevels();},1000);
  }catch(e){
    msg.style.color='var(--danger)';
    msg.textContent='Error al validar código con el servidor.';
  }
}
$('#codeOk').onclick=tryCode;$('#codeIn').addEventListener('keydown',e=>{if(e.key==='Enter')tryCode();});
"""

content = old_trycode_pattern.sub(new_trycode, content)
print("Replaced tryCode.")

# 8. Replace admLogin and admin actions
old_admin_pattern = re.compile(r"\$\('#bAdmin'\)\.onclick=.*?function cellTxt", re.DOTALL)

new_admin = r"""$('#bAdmin').onclick=()=>{
  admOpen=false;$('#admPin').value='';$('#admLoginMsg').textContent='';
  show('#admLogin');hide('#admBody');
  $('#admLoginTxt').textContent='Ingresa el PIN de Calidad para administrar equipos y resultados.';
  $('#admPinOk').textContent='ENTRAR';
  show('#admin');setTimeout(()=>$('#admPin').focus(),50);
};
$('#admClose').onclick=()=>{hide('#admin');admOpen=false;buildTeamSelect();buildLevels();buildRanking();};
async function admLogin(){
  const pin=$('#admPin').value.trim();
  if(!/^\d{4,8}$/.test(pin)){$('#admLoginMsg').textContent='El PIN debe tener entre 4 y 8 dígitos.';return;}
  try{
    await Store.adminLogin(pin);
    admOpen=true;hide('#admLogin');show('#admBody');renderAdmin();
  }catch(e){
    $('#admLoginMsg').textContent=e.message||'PIN incorrecto.';
  }
}
$('#admPinOk').onclick=admLogin;$('#admPin').addEventListener('keydown',e=>{if(e.key==='Enter')admLogin();});
function cellTxt"""

content = old_admin_pattern.sub(lambda m: new_admin, content)
print("Replaced admLogin.")

# 9. Replace renderAdmin and admCsv with sanitized export
old_render_adm_pattern = re.compile(r"function renderAdmin\(\)\{.*?/\* ================= ESCENA DE FONDO ================= \*/", re.DOTALL)

new_render_adm = r"""function renderAdmin(){
  const tb=$('#admRows');tb.innerHTML='';
  const teams=[...Store.teams].sort((a,b)=>(a.shift+a.name).localeCompare(b.shift+b.name));
  if(!teams.length){
    const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=9;td.className='muted';td.textContent='Aún no hay equipos registrados.';tr.appendChild(td);tb.appendChild(tr);return;
  }
  teams.forEach(t=>{
    const tr=document.createElement('tr');
    const add=(txt)=>{const td=document.createElement('td');td.textContent=txt;tr.appendChild(td);return td;};
    add(t.name);add(t.shift);
    for(let n=1;n<=5;n++) add(cellTxt(t,n));
    add(calcTotal(t).toLocaleString('es-CO'));
    const td=document.createElement('td');const sel=document.createElement('select');sel.style.cssText='width:auto;padding:4px;font-size:12px';
    for(let n=1;n<=5;n++){const o=document.createElement('option');o.value=n;o.textContent='N'+n;sel.appendChild(o);}
    td.appendChild(sel);
    const mk=(label,fn,cls)=>{const b=document.createElement('button');b.type='button';b.className='btn sm '+(cls||'ghost');b.textContent=label;b.style.marginLeft='4px';b.onclick=fn;td.appendChild(b);return b;};
    mk('Desbloquear',async()=>{await safe(Store.adminUnlock(t.id,sel.value),'Nivel '+sel.value+' desbloqueado para '+t.name);});
    mk('Reiniciar intentos',async()=>{
      const ok=await confirmBox('REINICIAR INTENTOS','Se borrarán la práctica y el definitivo del nivel '+sel.value+' de '+t.name+'.','REINICIAR');
      show('#admin');if(!ok)return;
      await safe(Store.resetAttempt(t.id,sel.value),'Intentos del nivel '+sel.value+' reiniciados');
    });
    mk('Eliminar',async()=>{
      const ok=await confirmBox('ELIMINAR EQUIPO','Se eliminará '+t.name+' con todos sus intentos.','ELIMINAR');
      show('#admin');if(!ok)return;
      await safe(Store.deleteTeam(t.id),'Equipo eliminado');
    },'danger');
    tr.appendChild(td);tb.appendChild(tr);
  });
}
async function safe(p,okMsg){try{await p;$('#admMsg').textContent=okMsg;renderAdmin();}catch(e){$('#admMsg').textContent=e.message||'No se pudo realizar la acción.';}}
$('#admAdd').onclick=async()=>{
  const name=$('#admName').value.trim();if(!name){$('#admName').focus();return;}
  if(Store.teams.some(t=>t.name.toLowerCase()===name.toLowerCase()&&t.shift===$('#admShift').value)){$('#admMsg').textContent='Ese equipo ya existe en ese turno.';return;}
  await safe(Store.addTeam(name.slice(0,40),$('#admShift').value),'Equipo registrado: '+name);$('#admName').value='';
};
$('#admCsv').onclick=()=>{
  const sanitize=v=>{const s=String(v??'');return /^[=\+\-@\t\r]/.test(s)?"'"+s:s;};
  const rows=[['Equipo','Turno','N1','N2','N3','N4','N5','Total']];
  Store.teams.forEach(t=>{
    const r=[sanitize(t.name),sanitize(t.shift)];
    for(let n=1;n<=5;n++){const f=att(t,n).final;r.push(f&&f.status==='completado'?f.score:'');}
    r.push(calcTotal(t));rows.push(r);
  });
  copyText(rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n'),()=>{$('#admMsg').textContent='Resultados copiados y protegidos (pégalos en Excel).';});
};

/* ================= ESCENA DE FONDO ================= */"""

content = old_render_adm_pattern.sub(lambda m: new_render_adm, content)
print("Replaced renderAdmin and sanitized CSV.")

# 10. Update modeBanner
old_banner_pattern = re.compile(r"function modeBanner\(\)\{.*?function goMenu\(\)", re.DOTALL)
new_banner = """function modeBanner(){
  const b=$('#modeBanner');
  if(Store.mode==='remote'){
    b.className='';b.textContent='SERVIDOR ACTIVO: Intentos, códigos y ranking centralizados de forma segura.';
  }else{
    b.className='warn';b.textContent='MODO LOCAL: Sin conexión al servidor central. Los intentos no se registrarán globalmente.';
  }
}
function goMenu()"""
content = old_banner_pattern.sub(lambda m: new_banner, content)
print("Updated modeBanner.")

# Save to public/index.html
with open(dest_file, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Generated {dest_file} ({len(content)} bytes).")
