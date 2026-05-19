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
  const onChips = document.querySelectorAll(".chip--on").length;
  const oelOn   = document.getElementById("chip-oel")?.getAttribute("aria-pressed") === "true" ? 1 : 0;
  if(gearCount) gearCount.textContent = `${onChips + oelOn} ausgewählt`;
}
document.querySelectorAll(".chip[data-gear]").forEach(chip=>{
  chip.addEventListener("click",()=>{
    chip.classList.toggle("chip--on");
    updateGearCount();
  });
});

// ─── Ölbindemittel-Smart-Chip (toggle + inline counter) ────
(()=>{
  const chip  = document.getElementById("chip-oel");
  const numEl = document.getElementById("oel-num");
  if(!chip || !numEl) return;

  let saecke = 1;  // Default beim Aktivieren

  function setActive(active){
    chip.setAttribute("aria-pressed", String(active));
    if(active){
      // Reset auf 1 wenn frisch aktiviert
      if(parseInt(numEl.textContent,10) <= 0){
        saecke = 1;
        numEl.textContent = saecke;
      }
    }else{
      saecke = 0;
      numEl.textContent = saecke;
    }
    // Counter wird im Gear-Counter mitgezählt
    updateGearCount?.();
  }

  function step(delta){
    saecke = Math.max(1, Math.min(99, saecke + delta));
    numEl.textContent = saecke;
    numEl.animate(
      [{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(1)"}],
      {duration:140, easing:"ease-out"}
    );
  }

  // Klick auf Chip: toggle (aber NICHT wenn auf +/- geklickt)
  chip.addEventListener("click", (e)=>{
    if(e.target.closest("[data-oel-act]")) return; // Counter-Klicks abfangen
    setActive(chip.getAttribute("aria-pressed") !== "true");
  });

  // +/- Counter
  chip.querySelectorAll("[data-oel-act]").forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      e.stopPropagation();
      step(btn.dataset.oelAct === "plus" ? 1 : -1);
    });
  });
})();

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

// ─── Personen-Picker Modal ─────────────────────────────────
(()=>{
  const modal   = document.getElementById("person-modal");
  const list    = document.getElementById("person-list");
  const search  = document.getElementById("person-search");
  const count   = document.getElementById("person-count");
  const title   = document.getElementById("modal-title");
  const sub     = document.getElementById("modal-sub");
  if(!modal || !list || !search) return;

  let activePicker = null;
  let selectedIds  = new Set();   // verhindert Doppelauswahl in Mannschaft

  function collectSelectedIds(){
    selectedIds.clear();
    document.querySelectorAll("[data-picker] [data-person-id]").forEach(el=>{
      selectedIds.add(parseInt(el.dataset.personId,10));
    });
  }

  function open(picker){
    activePicker = picker;
    const target = picker.dataset.picker;
    const slot   = picker.dataset.slot;
    const titles = {
      fahrer: "Fahrer wählen",
      kdt:    "Fahrzeug-Kommandant wählen",
      crew:   `Mannschaftsplatz ${slot}`,
    };
    title.textContent = titles[target] || "Person wählen";
    sub.textContent = target === "crew" ? "aktive Mitglieder · LFA-B · 1+7" : "aktive Mitglieder · syBOS-Sync";
    search.value = "";
    collectSelectedIds();
    render("");
    modal.hidden = false;
    setTimeout(()=> search.focus(), 50);
  }

  function close(){
    modal.hidden = true;
    activePicker = null;
  }

  function render(q){
    const norm = q.trim().toLowerCase();
    const matched = (window.PERSONAL || []).filter(p =>
      !norm || p.name.toLowerCase().includes(norm) || p.grad.toLowerCase().includes(norm)
    );
    count.textContent = `${matched.length} Treffer`;
    if(matched.length === 0){
      list.innerHTML = '<li class="modal__empty">Keine Person gefunden.</li>';
      return;
    }
    list.innerHTML = matched.map(p => {
      const alreadyChosen = selectedIds.has(p.id);
      return `
        <li>
          <button data-pid="${p.id}" ${alreadyChosen ? 'disabled style="opacity:.4"' : ''}>
            <span class="person-name">${p.name}</span>
            ${p.as ? '<span class="person-as">AS</span>' : '<span class="person-as person-as--off">AS</span>'}
            <span class="person-grade">${p.grad}</span>
          </button>
        </li>`;
    }).join("");

    list.querySelectorAll("button[data-pid]").forEach(btn=>{
      if(btn.disabled) return;
      btn.addEventListener("click",()=>{
        const id = parseInt(btn.dataset.pid,10);
        const p = window.PERSONAL.find(x => x.id === id);
        if(p && activePicker) applySelection(activePicker, p);
        close();
      });
    });
  }

  function applySelection(picker, person){
    // Set the picker UI
    const isInline = picker.classList.contains("picker--inline");
    const wasEmpty = picker.classList.contains("picker--empty");
    picker.classList.remove("picker--empty");
    picker.innerHTML = `
      <span class="picker__name" data-person-id="${person.id}">${person.name}</span>
      <span class="picker__grade">${person.grad}</span>
      ${!isInline ? '<svg class="picker__chevron" viewBox="0 0 24 24" width="14" height="14"><path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : ''}
    `;
    // If this is a crew slot that was empty, change the LI state
    const slot = picker.closest(".crew__slot");
    if(slot){
      slot.classList.remove("crew__slot--empty");
      slot.classList.add("crew__slot--filled");
      // Add AS-Toggle if not present
      if(!slot.querySelector(".as-toggle")){
        const slotNum = slot.dataset.slot;
        const toggle = document.createElement("button");
        toggle.className = "as-toggle";
        toggle.dataset.slot = slotNum;
        toggle.setAttribute("aria-pressed","false");
        toggle.innerHTML = `<span class="as-toggle__lbl">AS</span>`;
        toggle.addEventListener("click", ()=> handleAsToggle(toggle));
        slot.appendChild(toggle);
      }
    }
    updateCrewCount?.();
  }

  // Re-usable AS toggle handler (extracted für Wiederverwendung im Picker)
  function handleAsToggle(toggle){
    const slot = toggle.dataset.slot;
    const isOn = toggle.classList.toggle("as-toggle--on");
    toggle.setAttribute("aria-pressed", String(isOn));
    if(isOn){
      let timeEl = toggle.querySelector(".as-toggle__time");
      if(!timeEl){
        timeEl = document.createElement("span");
        timeEl.className = "as-toggle__time";
        timeEl.innerHTML = `<span class="as-mins" data-slot="${slot}">15</span> min`;
        toggle.appendChild(timeEl);
      }
      let stepper = toggle.parentElement.querySelector(`.as-stepper[data-slot="${slot}"]`);
      if(!stepper){
        stepper = document.createElement("div");
        stepper.className = "as-stepper";
        stepper.dataset.slot = slot;
        stepper.innerHTML = `
          <button class="as-stepper__btn" data-act="minus" data-slot="${slot}" aria-label="Minus 5">−</button>
          <button class="as-stepper__btn" data-act="plus"  data-slot="${slot}" aria-label="Plus 5">+</button>`;
        toggle.parentElement.appendChild(stepper);
        stepper.querySelectorAll(".as-stepper__btn").forEach(b=>{
          b.addEventListener("click",()=>{
            const el = document.querySelector(`.as-mins[data-slot="${slot}"]`);
            if(!el) return;
            let v = parseInt(el.textContent,10) || 15;
            v = Math.max(5, Math.min(30, b.dataset.act === "plus" ? v + 5 : v - 5));
            el.textContent = v;
          });
        });
      }
    }
  }

  // Wire up all pickers
  document.querySelectorAll("[data-picker]").forEach(p=>{
    p.addEventListener("click",(e)=>{
      e.preventDefault();
      open(p);
    });
  });

  // Modal close handlers
  modal.querySelectorAll("[data-modal-close]").forEach(el=>{
    el.addEventListener("click", close);
  });
  document.addEventListener("keydown",(e)=>{
    if(e.key === "Escape" && !modal.hidden) close();
  });

  // Search
  search.addEventListener("input", e => render(e.target.value));
})();

// ─── Karte: Einsatzort + Fahrzeug-Tracking ─────────────────
(()=>{
  if(typeof L === "undefined") return; // Leaflet noch nicht geladen
  const mapEl = document.getElementById("map");
  if(!mapEl) return;

  // ── Koordinaten (Mock-Daten) ──
  // Wachhaus FF Eberstalzell, Solarstraße 1, ca. 48.0884, 13.9586
  // Mock-Einsatzort (BlaulichtSMS): 48.110, 13.961
  const HOME    = [48.0884, 13.9586];
  const EINSATZ = [48.1100, 13.9610];

  // andere Fahrzeuge — bekommen Live-Position via Mock-Sim
  const fleet = {
    self:    { id:"self",  ruf:"Pumpe Eberstalzell",    abk:"PUMPE",    pos:[...HOME] },
    kdo:     { id:"kdo",   ruf:"Kommando Eberstalzell", abk:"KDO",      pos:[48.0890, 13.9595] },
    tlf:     { id:"tlf",   ruf:"Tank Eberstalzell",     abk:"TANK",     pos:[48.0892, 13.9580] },
    florian: { id:"flo",   ruf:"Florian Eberstalzell",  abk:"FLORIAN",  pos:[...HOME] },
  };

  // ── Map init ──
  const map = L.map(mapEl, {
    zoomControl:true,
    attributionControl:true,
    preferCanvas:true,
  }).setView([48.0995, 13.9598], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:19,
    attribution:'© OpenStreetMap',
  }).addTo(map);

  // ── Einsatzort-Marker (Flamme + Pin) ──
  const einsatzIcon = L.divIcon({
    className:"einsatz-marker",
    html:`
      <svg viewBox="0 0 36 48" width="36" height="48" class="einsatz-marker__svg">
        <path d="M18 0 C8 0 2 8 2 16 C2 28 18 48 18 48 C18 48 34 28 34 16 C34 8 28 0 18 0 Z"
              fill="#dc2626" stroke="#fff" stroke-width="2" />
        <path d="M18 8 C13 12 13 17 16 19 C14 18 13.5 16 14.5 14 M18 8 C23 12 23 17 20 19 C22 18 22.5 16 21.5 14 M16 21 H20 V25 H16 Z"
              fill="#fff" />
      </svg>`,
  });
  L.marker(EINSATZ, {icon:einsatzIcon, title:"Einsatzort"}).addTo(map);

  // ── Fahrzeug-Marker ──
  const markers = {};
  for(const [key, fzg] of Object.entries(fleet)){
    const isSelf = key === "self";
    const icon = L.divIcon({
      className:`fzg-marker ${isSelf ? "fzg-marker--self" : "fzg-marker--other"}`,
      html:`
        <div class="fzg-marker__pin">
          <span class="fzg-marker__dot"></span>
          <span>${fzg.abk}</span>
        </div>`,
      iconSize:null,
      iconAnchor:[10, 10],
    });
    markers[key] = L.marker(fzg.pos, {icon, title:fzg.ruf, zIndexOffset: isSelf ? 1000 : 100}).addTo(map);
  }

  // Karte auf Bounds anpassen
  const allPts = [EINSATZ, ...Object.values(fleet).map(f => f.pos)];
  map.fitBounds(L.latLngBounds(allPts).pad(0.25));

  // ── Distanz / ETA berechnen ──
  function distanceKm(a, b){
    const R = 6371;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
    const x = Math.sin(dLat/2)**2 + Math.sin(dLon/2)**2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function updateStats(){
    const d = distanceKm(fleet.self.pos, EINSATZ);
    const dEl  = document.getElementById("map-dist");
    const eEl  = document.getElementById("map-eta");
    const cEl  = document.getElementById("map-cars");
    if(dEl) dEl.textContent = d < 1 ? `${Math.round(d*1000)} m` : `${d.toFixed(1)} km`;
    if(eEl) eEl.textContent = `${Math.max(1, Math.round(d * 60 / 50))} min`; // 50 km/h durchschnitt
    if(cEl) cEl.textContent = `${Object.keys(fleet).length} live`;
  }
  updateStats();

  // ── Navigation-Deeplink (Google Maps) ──
  const navBtn = document.getElementById("nav-start");
  if(navBtn){
    const addr = "Eberstalzeller Straße 5, 4653 Eberstalzell, Österreich";
    navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
  }

  // ── Live-Position-Simulation ──
  // Bewegt das eigene Fahrzeug langsam in Richtung Einsatzort.
  // Andere Fahrzeuge wackeln leicht (Demo).
  let t = 0;
  const total = 60; // Schritte bis Ziel
  setInterval(()=>{
    t = Math.min(total, t + 1);
    const f = t / total;
    fleet.self.pos = [
      HOME[0] + (EINSATZ[0] - HOME[0]) * f,
      HOME[1] + (EINSATZ[1] - HOME[1]) * f,
    ];
    markers.self.setLatLng(fleet.self.pos);

    // andere Fahrzeuge wackeln dezent (Mock)
    ["kdo","tlf"].forEach(k=>{
      fleet[k].pos[0] += (Math.random() - 0.5) * 0.0008;
      fleet[k].pos[1] += (Math.random() - 0.5) * 0.0008;
      markers[k].setLatLng(fleet[k].pos);
    });

    updateStats();
  }, 3000);
})();

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
