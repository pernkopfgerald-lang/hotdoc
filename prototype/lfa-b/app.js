/* ─────────────────────────────────────────────────────────────
   HotDoc · FF Eberstalzell · Pumpe-Tablet (LFA-B) · Prototyp JS
   v0.2 — Auto Light/Dark Theme + Demo-Daten, keine echten APIs.
   ───────────────────────────────────────────────────────────── */

// ─── Theme: Auto Light/Dark by hour (07–19 = light, 19–07 = dark) ──
const THEME_STORAGE_KEY = "hotdoc.themeOverride";

function autoTheme(){
  const h = new Date().getHours();
  return (h >= 7 && h < 19) ? "light" : "dark";
}
function effectiveTheme(){
  const override = localStorage.getItem(THEME_STORAGE_KEY);
  return override || autoTheme();
}
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", t === "dark" ? "#0d0d12" : "#f7f7fa");
}
applyTheme(effectiveTheme());

// re-evaluate every 5 minutes — covers crossing 07/19 hour boundary
setInterval(()=>{
  if(!localStorage.getItem(THEME_STORAGE_KEY)) applyTheme(autoTheme());
}, 5 * 60 * 1000);

// theme toggle button: cycle override → light → dark → auto
document.getElementById("themeToggle")?.addEventListener("click", ()=>{
  const cur = document.documentElement.dataset.theme;
  const next = cur === "light" ? "dark" : "light";
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
});

// ─── clock (live im Header) ────────────────────────────────
const clockEl = document.getElementById("clock");
function tickClock(){
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  if(clockEl) clockEl.textContent = `${hh}:${mm}`;
}
tickClock(); setInterval(tickClock, 30_000);

// ─── AS-Stepper (5er Schritte, Range 5–30) ─────────────────
const AS_MIN = 5, AS_MAX = 30, AS_STEP = 5, AS_DEFAULT = 15;

function clampAS(v){
  return Math.max(AS_MIN, Math.min(AS_MAX, v));
}

document.querySelectorAll(".as-stepper__btn").forEach(btn=>{
  btn.addEventListener("click",(e)=>{
    const slot = btn.dataset.slot;
    const act  = btn.dataset.act;
    const el   = document.querySelector(`.as-mins[data-slot="${slot}"]`);
    if(!el) return;
    let v = parseInt(el.textContent,10) || AS_DEFAULT;
    v = clampAS(act === "plus" ? v + AS_STEP : v - AS_STEP);
    el.textContent = v;
    // Visual feedback
    el.parentElement.animate(
      [{transform:"scale(1.0)"},{transform:"scale(1.12)"},{transform:"scale(1.0)"}],
      {duration:160, easing:"ease-out"}
    );
  });
});

// ─── AS-Toggle (an/aus) ────────────────────────────────────
document.querySelectorAll(".as-toggle").forEach(toggle=>{
  toggle.addEventListener("click",()=>{
    const slot = toggle.dataset.slot;
    const isOn = toggle.classList.toggle("as-toggle--on");
    toggle.setAttribute("aria-pressed", String(isOn));
    if(isOn){
      // Default-Wert einsetzen wenn noch keiner da
      let timeEl = toggle.querySelector(".as-toggle__time");
      if(!timeEl){
        timeEl = document.createElement("span");
        timeEl.className = "as-toggle__time";
        timeEl.innerHTML = `<span class="as-mins" data-slot="${slot}">${AS_DEFAULT}</span> min`;
        toggle.appendChild(timeEl);
      }
      // Stepper anzeigen (auto via CSS)
      let stepper = document.querySelector(`.as-stepper[data-slot="${slot}"]`);
      if(!stepper){
        stepper = document.createElement("div");
        stepper.className = "as-stepper";
        stepper.dataset.slot = slot;
        stepper.innerHTML = `
          <button class="as-stepper__btn" data-act="minus" data-slot="${slot}" aria-label="Minus 5">−</button>
          <button class="as-stepper__btn" data-act="plus"  data-slot="${slot}" aria-label="Plus 5">+</button>`;
        toggle.parentElement.appendChild(stepper);
        // bind new buttons
        stepper.querySelectorAll(".as-stepper__btn").forEach(btn=>{
          btn.addEventListener("click",()=>{
            const el = document.querySelector(`.as-mins[data-slot="${slot}"]`);
            if(!el) return;
            let v = parseInt(el.textContent,10) || AS_DEFAULT;
            v = clampAS(btn.dataset.act === "plus" ? v + AS_STEP : v - AS_STEP);
            el.textContent = v;
          });
        });
      }
    }
  });
});

// ─── Geräte-Chips toggle + Counter ─────────────────────────
const gearCount = document.getElementById("gear-count");
function updateGearCount(){
  const n = document.querySelectorAll(".chip--on").length;
  if(gearCount) gearCount.textContent = `${n} ausgewählt`;
}
document.querySelectorAll(".chip[data-gear]").forEach(chip=>{
  chip.addEventListener("click",()=>{
    chip.classList.toggle("chip--on");
    updateGearCount();
  });
});

// ─── Mannschaft-Count (initial gefüllte zählen) ────────────
const crewCountEl = document.getElementById("mannschaft-count");
function updateCrewCount(){
  const n = document.querySelectorAll(".crew__slot--filled").length;
  if(crewCountEl) crewCountEl.textContent = n;
}
updateCrewCount();

// ─── Dictate-Button: Press-and-Hold-Simulation ─────────────
const dictateBtn = document.getElementById("dictate");
if(dictateBtn){
  let pressTimer, recording = false;

  const start = ()=>{
    if(recording) return;
    recording = true;
    dictateBtn.classList.add("dictate-btn--recording");
    dictateBtn.querySelector(".dictate-btn__lbl").textContent = "Diktiere …";
  };
  const stop = ()=>{
    if(!recording) return;
    recording = false;
    dictateBtn.classList.remove("dictate-btn--recording");
    dictateBtn.querySelector(".dictate-btn__lbl").textContent = "Halten zum Diktieren";
    // simulate new chronik entry
    addChronikEntry("Pumpe Eberstalzell", "🎤 Audio · Transkript folgt", true);
  };

  dictateBtn.addEventListener("pointerdown", e=>{
    pressTimer = setTimeout(start, 120);
  });
  dictateBtn.addEventListener("pointerup", e=>{
    clearTimeout(pressTimer);
    if(recording) stop();
  });
  dictateBtn.addEventListener("pointerleave", e=>{
    clearTimeout(pressTimer);
    if(recording) stop();
  });
}

function addChronikEntry(source, text, pending=false){
  const tl = document.querySelector(".timeline");
  if(!tl) return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  const li = document.createElement("li");
  li.className = "timeline__entry" + (pending ? " timeline__entry--pending" : "");
  li.innerHTML = `
    <time class="timeline__time">${hh}:${mm}</time>
    <div class="timeline__body">
      <span class="timeline__src">${source}</span>
      <p${pending ? ' class="timeline__pending"' : ""}>${text}</p>
    </div>`;
  tl.appendChild(li);
  li.scrollIntoView({behavior:"smooth", block:"nearest"});
}

// ─── Empty-Slot click (Mock: alert) ────────────────────────
document.querySelectorAll(".crew__slot--empty .picker--empty").forEach(btn=>{
  btn.addEventListener("click",()=>{
    // Im echten Prototyp: Person-Picker-Modal mit syBOS-Liste öffnen
    btn.animate([{opacity:1},{opacity:.4},{opacity:1}],{duration:240});
  });
});

// ─── Soft styles for recording state ───────────────────────
const style = document.createElement("style");
style.textContent = `
.dictate-btn--recording{
  border-color:rgba(239,68,68,0.7)!important;
  background:linear-gradient(180deg, #2a1a1d 0%, #1e1418 100%)!important;
}
.dictate-btn--recording::after{opacity:1!important; animation-duration:1.4s!important}
.dictate-btn--recording .dictate-btn__icon{
  box-shadow:0 0 0 3px rgba(239,68,68,0.25), inset 0 0 0 1px rgba(239,68,68,0.7)!important;
  animation:rec-pulse 1.2s ease-in-out infinite;
}
@keyframes rec-pulse{
  0%,100%{transform:scale(1)}
  50%{transform:scale(1.08)}
}`;
document.head.appendChild(style);
