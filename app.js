/* Margaret's Log — everything is saved on this phone only (browser storage). */
"use strict";

/* ---------------- defaults ---------------- */
const SLOTS_DEFAULT = [
  { id: "wake", label: "On waking", time: "06:30" },
  { id: "morning", label: "Morning", time: "08:00" },
  { id: "midday", label: "Midday", time: "12:30" },
  { id: "afternoon", label: "Afternoon", time: "15:30" },
  { id: "evening", label: "Evening", time: "18:30" },
  { id: "bedtime", label: "Bedtime", time: "20:30" },
];
let _n = 0;
const mid = () => "m" + Date.now().toString(36) + (_n++);
// Her own med list is NOT in this public file. It loads from the private
// setup file (Settings → Restore from a backup file → margaret-setup.json).
const MEDS_DEFAULT = [];
const FOODS_DEFAULT = ["Chicken w/ broth", "Poached eggs", "Scrambled eggs", "Hard-boiled egg", "Toast",
  "Oatmeal", "Banana", "Potatoes", "Bagel", "Tuna & crackers", "Rice", "Squash", "Ginger chew / tea"];
const SYMPTOMS = [
  { key: "nausea", label: "Nausea" },
  { key: "stomach", label: "Stomach pain" },
  { key: "back", label: "Back pain" },
  { key: "headache", label: "Headache" },
];
const EXTRAS = ["Weak", "Dizzy", "Flushed / hot", "Sweaty", "Feverish", "Heartburn", "Gas / bloating", "Cramping"];
const BATH_KINDS = [["regular", "Regular"], ["loose", "Loose"], ["diarrhea", "Diarrhea"], ["hard", "Hard"]];
const BATH_COLORS = ["Brown", "Yellow", "Green", "Pale", "Black", "Red / blood"];
const AMOUNTS = ["A few bites", "Half", "Full serving"];
const RESCUE = /zofran|ondansetron|phenergan|reglan|metoclopramide/i;
const ICON = { med: "💊", food: "🍽️", feel: "🤢", bp: "🩸", bath: "🚽", note: "📝" };

/* ---------------- storage ---------------- */
const KEY = "mlog.v1";
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.entries)) return s;
  } catch (e) { /* fall through */ }
  return null;
}
let S = load() || {
  entries: [],
  skips: {},
  settings: { size: "large", theme: "auto", slots: SLOTS_DEFAULT, meds: MEDS_DEFAULT, foods: FOODS_DEFAULT, lastExport: null },
};
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { alert("Could not save — the phone's storage may be full. Please export a backup."); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

/* ---------------- dates & helpers ---------------- */
const pad = n => String(n).padStart(2, "0");
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const todayKey = () => dayKey(new Date());
const parseDay = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDay = k => { const d = parseDay(k); return `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}`; };
const shortDay = k => { const d = parseDay(k); return `${WD[d.getDay()].slice(0, 3)} ${d.getMonth() + 1}/${d.getDate()}`; };
const hm12 = hm => { const [h, m] = hm.split(":").map(Number); return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const minutes = hm => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const medLabel = m => `${m.qty > 1 ? m.qty + " × " : ""}${m.name}${m.dose ? " " + m.dose : ""}`;

let viewDay = todayKey();
let tab = "today";

const dayEntries = k => S.entries.filter(e => e.day === k).sort((a, b) => a.time.localeCompare(b.time));

function addEntry(e) {
  e.id = e.id || uid();
  e.created = e.created || new Date().toISOString();
  S.entries.push(e);
  save();
  return e;
}
function updateEntry(id, patch) {
  const e = S.entries.find(x => x.id === id);
  if (e) Object.assign(e, patch, { edited: new Date().toISOString() });
  save();
}
function deleteEntry(id) { S.entries = S.entries.filter(x => x.id !== id); save(); }

/* ---------------- theme / size ---------------- */
function applyLook() {
  const r = document.documentElement;
  r.dataset.size = S.settings.size;
  if (S.settings.theme === "auto") delete r.dataset.theme; else r.dataset.theme = S.settings.theme;
  const dark = S.settings.theme === "dark" ||
    (S.settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $('meta[name="theme-color"]').setAttribute("content", dark ? "#1d2229" : "#2a78d6");
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, undo) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>` + (undo ? `<button type="button">Undo</button>` : "");
  t.hidden = false;
  if (undo) $("button", t).onclick = () => { undo(); t.hidden = true; render(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

/* ---------------- sheet ---------------- */
function openSheet(title, html, wire) {
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
  if (wire) wire($("#sheetBody"));
}
function closeSheet() { $("#sheet").hidden = true; $("#sheetBody").innerHTML = ""; document.body.style.overflow = ""; }
$("#sheetClose").onclick = closeSheet;
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });

function timeBar(time) {
  return `<div class="timebar"><span aria-hidden="true">🕒</span><label for="etime" style="margin:0">Time</label>
    <input type="time" id="etime" value="${esc(time || (viewDay === todayKey() ? nowHM() : "12:00"))}"></div>
    ${viewDay !== todayKey() ? `<p class="hint">Saving to ${esc(longDay(viewDay))}</p>` : ""}`;
}
function toggleChips(root) {
  $$(".chip[data-toggle]", root).forEach(c => c.onclick = () => {
    const group = c.dataset.toggle;
    if (c.dataset.single !== undefined)
      $$(`.chip[data-toggle="${group}"]`, root).forEach(o => { if (o !== c) o.setAttribute("aria-pressed", "false"); });
    c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true");
  });
}
const pressed = (root, group) => $$(`.chip[data-toggle="${group}"][aria-pressed="true"]`, root).map(c => c.dataset.value);
const editFooter = existing => existing
  ? `<div class="actions"><button class="btn danger" id="del" type="button">Delete</button><button class="btn" id="save" type="button">Save changes</button></div>`
  : `<div class="actions"><button class="btn wide" id="save" type="button">Save</button></div>`;
function wireDelete(root, existing) {
  const b = $("#del", root);
  if (!b || !existing) return;
  b.onclick = () => {
    const copy = { ...existing };
    deleteEntry(existing.id); closeSheet(); render();
    toast("Entry deleted", () => { S.entries.push(copy); save(); });
  };
}

/* ---------------- MEDS ---------------- */
const scheduled = () => S.settings.meds.filter(m => m.active && m.slot !== "prn");
const prn = () => S.settings.meds.filter(m => m.active && m.slot === "prn");
const takenToday = (k, medId) => S.entries.some(e => e.day === k && e.type === "med" && e.medId === medId);

function logMed(m, time) {
  return addEntry({ day: viewDay, time, type: "med", medId: m.id, name: m.name, dose: m.dose, qty: m.qty,
    slot: m.slot, asNeeded: m.slot === "prn" });
}

function medsSheet(keepTime) {
  const slots = S.settings.slots;
  let html = timeBar(keepTime);
  for (const s of slots) {
    const meds = scheduled().filter(m => m.slot === s.id);
    if (!meds.length) continue;
    const allDone = meds.every(m => takenToday(viewDay, m.id));
    html += `<div class="slothead"><h3>${esc(s.label)} · ${esc(hm12(s.time))}</h3>
      ${allDone ? `<span class="note">✓ done</span>` : `<button class="btn small" data-all="${s.id}" type="button">Took all</button>`}</div>`;
    for (const m of meds) {
      const done = takenToday(viewDay, m.id);
      html += `<button class="medrow ${done ? "done" : ""}" data-med="${m.id}" type="button" aria-pressed="${done}">
        <span class="box">${done ? "✓" : ""}</span><span class="nm">${esc(medLabel(m))}</span></button>`;
    }
  }
  html += `<h3>As needed</h3><div class="chips">` +
    prn().map(m => `<button class="chip" data-prn="${m.id}" type="button">${esc(m.name)}${m.dose ? " " + esc(m.dose) : ""}</button>`).join("") +
    `</div><p class="hint">Tap once to log it at the time above. Change the list in Settings.</p>`;
  openSheet("💊 Meds", html, root => {
    const t = () => $("#etime", root).value || nowHM();
    $$("[data-med]", root).forEach(b => b.onclick = () => {
      const m = S.settings.meds.find(x => x.id === b.dataset.med);
      if (takenToday(viewDay, m.id)) {
        const e = S.entries.find(x => x.day === viewDay && x.type === "med" && x.medId === m.id);
        deleteEntry(e.id); toast(`Unchecked ${m.name}`, () => { S.entries.push(e); save(); });
      } else { logMed(m, t()); toast(`Logged ${medLabel(m)}`); }
      medsSheet(t()); render();
    });
    $$("[data-all]", root).forEach(b => b.onclick = () => {
      const added = scheduled().filter(m => m.slot === b.dataset.all && !takenToday(viewDay, m.id)).map(m => logMed(m, t()));
      toast(`Logged ${added.length} meds`, () => added.forEach(e => deleteEntry(e.id)));
      medsSheet(t()); render();
    });
    $$("[data-prn]", root).forEach(b => b.onclick = () => {
      const m = S.settings.meds.find(x => x.id === b.dataset.prn);
      const e = logMed(m, t());
      closeSheet(); render();
      toast(`Logged ${medLabel(m)} at ${hm12(e.time)}`, () => deleteEntry(e.id));
    });
  });
}

function editMedEntry(e) {
  openSheet("💊 Med", timeBar(e.time) +
    `<div class="field"><label for="mname">Medication</label><input type="text" id="mname" value="${esc(e.name)}"></div>
     <div class="field"><label for="mdose">Dose</label><input type="text" id="mdose" value="${esc(e.dose)}"></div>
     <div class="field"><label for="mqty">How many</label><input type="number" id="mqty" min="1" inputmode="numeric" value="${esc(e.qty || 1)}"></div>` +
    editFooter(e), root => {
      $("#save", root).onclick = () => {
        updateEntry(e.id, { time: $("#etime", root).value, name: $("#mname", root).value.trim(),
          dose: $("#mdose", root).value.trim(), qty: Math.max(1, +$("#mqty", root).value || 1) });
        closeSheet(); render(); toast("Saved");
      };
      wireDelete(root, e);
    });
}

/* ---------------- FOOD ---------------- */
function foodSheet(e) {
  const items = e ? e.items : [];
  const extra = e ? items.filter(i => !S.settings.foods.includes(i)) : [];
  openSheet("🍽️ What did you eat?", timeBar(e && e.time) +
    `<div class="chips">` + S.settings.foods.map(f =>
      `<button class="chip" data-toggle="food" data-value="${esc(f)}" aria-pressed="${items.includes(f)}" type="button">${esc(f)}</button>`).join("") +
    `</div>
    <div class="field"><label for="fother">Something else</label><input type="text" id="fother" placeholder="e.g. sweet potato w/ cinnamon" value="${esc(extra.join(", "))}"></div>
    <h3>How much?</h3><div class="chips">` + AMOUNTS.map(a =>
      `<button class="chip" data-toggle="amt" data-single data-value="${a}" aria-pressed="${e && e.amount === a}" type="button">${a}</button>`).join("") +
    `</div>
    <div class="field"><label for="fnote">Note (optional)</label><input type="text" id="fnote" placeholder="e.g. felt a little nausea after" value="${esc(e ? e.note : "")}"></div>` +
    editFooter(e), root => {
      toggleChips(root);
      $("#save", root).onclick = () => {
        const chosen = pressed(root, "food");
        const other = $("#fother", root).value.split(",").map(s => s.trim()).filter(Boolean);
        const all = [...chosen, ...other];
        if (!all.length) { toast("Pick at least one food"); return; }
        const data = { time: $("#etime", root).value, items: all, amount: pressed(root, "amt")[0] || "", note: $("#fnote", root).value.trim() };
        if (e) updateEntry(e.id, data); else addEntry({ day: viewDay, type: "food", ...data });
        closeSheet(); render(); toast(e ? "Saved" : `Logged ${all.join(", ")}`);
      };
      wireDelete(root, e);
    });
}

/* ---------------- FEEL ---------------- */
function feelSheet(e) {
  const val = k => (e && e[k] != null) ? e[k] : null;
  let html = timeBar(e && e.time) +
    `<div class="chips"><button class="chip" data-toggle="wake" data-value="1" aria-pressed="${!!(e && e.onWaking)}" type="button">🌙 Overnight / on waking</button></div>
     <p class="hint">Slide only the ones you have right now. 0 = none, 10 = worst ever.</p>`;
  for (const s of SYMPTOMS) {
    const v = val(s.key);
    html += `<div class="slider ${v == null ? "unset" : ""}" data-key="${s.key}">
      <div class="lab"><label for="r_${s.key}">${s.label}</label><span class="val ${v == null ? "unset" : ""}">${v == null ? "not rated" : v}</span></div>
      <input type="range" id="r_${s.key}" min="0" max="10" step="1" value="${v == null ? 0 : v}">
      <div class="scale"><span>0 none</span><span>5</span><span>10 worst</span></div></div>`;
  }
  html += `<h3>Also</h3><div class="chips">` + EXTRAS.map(x =>
    `<button class="chip" data-toggle="extra" data-value="${x}" aria-pressed="${!!(e && e.extras && e.extras.includes(x))}" type="button">${x}</button>`).join("") +
    `</div><div class="field"><label for="fenote">Note (optional)</label><input type="text" id="fenote" placeholder="e.g. pain above belly button" value="${esc(e ? e.note : "")}"></div>` +
    editFooter(e);
  openSheet("🤢 How do you feel?", html, root => {
    toggleChips(root);
    $$(".slider", root).forEach(sl => {
      const input = $("input", sl), out = $(".val", sl);
      const set = () => { sl.classList.remove("unset"); out.classList.remove("unset"); out.textContent = input.value; sl.dataset.set = "1"; };
      if (!sl.classList.contains("unset")) sl.dataset.set = "1";
      input.addEventListener("input", set);
      input.addEventListener("pointerdown", set);
    });
    $("#save", root).onclick = () => {
      const data = { time: $("#etime", root).value, onWaking: pressed(root, "wake").length > 0,
        extras: pressed(root, "extra"), note: $("#fenote", root).value.trim() };
      let any = false;
      for (const s of SYMPTOMS) {
        const sl = $(`.slider[data-key="${s.key}"]`, root);
        data[s.key] = sl.dataset.set ? +$("input", sl).value : null;
        if (data[s.key] != null) any = true;
      }
      if (!any && !data.extras.length && !data.note) { toast("Slide at least one, or add a note"); return; }
      if (e) updateEntry(e.id, data); else addEntry({ day: viewDay, type: "feel", ...data });
      closeSheet(); render(); toast(e ? "Saved" : "Logged how you feel");
    };
    wireDelete(root, e);
  });
}

/* ---------------- BP ---------------- */
function bpSheet(e) {
  openSheet("🩸 Blood pressure", timeBar(e && e.time) +
    `<div class="bp3">
      <div class="field"><label for="bsys">Top</label><input type="number" id="bsys" inputmode="numeric" min="60" max="260" value="${esc(e ? e.sys : "")}" placeholder="134"></div>
      <div class="slash">/</div>
      <div class="field"><label for="bdia">Bottom</label><input type="number" id="bdia" inputmode="numeric" min="30" max="160" value="${esc(e ? e.dia : "")}" placeholder="76"></div>
    </div>
    <div class="field"><label for="bpul">Pulse</label><input type="number" id="bpul" inputmode="numeric" min="30" max="200" value="${esc(e ? e.pulse : "")}" placeholder="70"></div>
    <div class="chips">` + ["Sitting", "Standing", "Lying down", "After shower"].map(p =>
      `<button class="chip" data-toggle="pos" data-single data-value="${p}" aria-pressed="${e && e.position === p}" type="button">${p}</button>`).join("") +
    `</div>` + editFooter(e), root => {
      toggleChips(root);
      if (!e) setTimeout(() => $("#bsys", root).focus(), 50);
      $("#save", root).onclick = () => {
        const sys = +$("#bsys", root).value, dia = +$("#bdia", root).value, pulse = +$("#bpul", root).value || null;
        if (!(sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160)) { toast("Check the top and bottom numbers"); return; }
        const data = { time: $("#etime", root).value, sys, dia, pulse, position: pressed(root, "pos")[0] || "" };
        if (e) updateEntry(e.id, data); else addEntry({ day: viewDay, type: "bp", ...data });
        closeSheet(); render(); toast(e ? "Saved" : `Logged BP ${sys}/${dia}`);
      };
      wireDelete(root, e);
    });
}

/* ---------------- BATHROOM ---------------- */
function bathSheet(e) {
  openSheet("🚽 Bathroom", timeBar(e && e.time) +
    `<div class="bath4">` + BATH_KINDS.map(([v, l]) =>
      `<button class="chip" data-toggle="kind" data-single data-value="${v}" aria-pressed="${e && e.kind === v}" type="button">${l}</button>`).join("") +
    `</div><h3>Color (optional)</h3><div class="chips">` + BATH_COLORS.map(c =>
      `<button class="chip" data-toggle="color" data-single data-value="${c}" aria-pressed="${e && e.color === c}" type="button">${c}</button>`).join("") +
    `</div><div class="field"><label for="bnote">Note (optional)</label><input type="text" id="bnote" placeholder="e.g. lots of flakes" value="${esc(e ? e.note : "")}"></div>` +
    editFooter(e), root => {
      toggleChips(root);
      $("#save", root).onclick = () => {
        const kind = pressed(root, "kind")[0];
        if (!kind) { toast("Pick Regular, Loose, Diarrhea or Hard"); return; }
        const data = { time: $("#etime", root).value, kind, color: pressed(root, "color")[0] || "", note: $("#bnote", root).value.trim() };
        if (e) updateEntry(e.id, data); else addEntry({ day: viewDay, type: "bath", ...data });
        closeSheet(); render(); toast(e ? "Saved" : "Logged bathroom");
      };
      wireDelete(root, e);
    });
}

/* ---------------- NOTE ---------------- */
function noteSheet(e) {
  openSheet("📝 Note", timeBar(e && e.time) +
    `<div class="field"><label for="ntext">What happened?</label>
      <textarea id="ntext" placeholder="e.g. Saw the doctor. IV bag, felt good after. (Tap the mic on the keyboard to talk instead of type.)">${esc(e ? e.text : "")}</textarea></div>` +
    editFooter(e), root => {
      if (!e) setTimeout(() => $("#ntext", root).focus(), 50);
      $("#save", root).onclick = () => {
        const text = $("#ntext", root).value.trim();
        if (!text) { toast("Type a note first"); return; }
        const data = { time: $("#etime", root).value, text };
        if (e) updateEntry(e.id, data); else addEntry({ day: viewDay, type: "note", ...data });
        closeSheet(); render(); toast(e ? "Saved" : "Note saved");
      };
      wireDelete(root, e);
    });
}

/* ---------------- entry summary ---------------- */
function summary(e) {
  switch (e.type) {
    case "med": return [`${e.qty > 1 ? e.qty + " × " : ""}${e.name}${e.dose ? " " + e.dose : ""}`, e.asNeeded ? "as needed" : ""];
    case "food": return [e.items.join(", "), [e.amount, e.note].filter(Boolean).join(" · ")];
    case "feel": {
      const parts = SYMPTOMS.filter(s => e[s.key] != null).map(s => `${s.label} ${e[s.key]}`);
      return [parts.join(", ") || (e.extras || []).join(", ") || "Feeling note",
        [e.onWaking ? "overnight / on waking" : "", parts.length ? (e.extras || []).join(", ") : "", e.note].filter(Boolean).join(" · ")];
    }
    case "bp": return [`BP ${e.sys}/${e.dia}${e.pulse ? " · pulse " + e.pulse : ""}`, e.position || ""];
    case "bath": return [BATH_KINDS.find(k => k[0] === e.kind)[1], [e.color, e.note].filter(Boolean).join(" · ")];
    case "note": return [e.text, ""];
  }
  return ["", ""];
}
function openEntry(e) {
  ({ med: editMedEntry, food: foodSheet, feel: feelSheet, bp: bpSheet, bath: bathSheet, note: noteSheet })[e.type](e);
}

/* ---------------- due nudges ---------------- */
function dueSlots() {
  if (viewDay !== todayKey()) return [];
  const now = minutes(nowHM());
  const skipped = S.skips[viewDay] || [];
  return S.settings.slots.filter(s => {
    if (skipped.includes(s.id) || now < minutes(s.time) - 30) return false;
    const meds = scheduled().filter(m => m.slot === s.id);
    return meds.length && meds.some(m => !takenToday(viewDay, m.id));
  }).map(s => ({ slot: s, meds: scheduled().filter(m => m.slot === s.id && !takenToday(viewDay, m.id)) }));
}

/* ---------------- TODAY view ---------------- */
function renderToday() {
  const v = $("#view");
  const due = dueSlots();
  let html = "";
  if (!S.settings.meds.length)
    html += `<div class="card due"><div class="row"><b>👋 First, load your medication list<br>
      <span style="font-weight:400">Settings → Restore from a backup file → choose <i>margaret-setup.json</i> (Michael will send it).</span></b>
      <button class="btn small" data-goto="settings" type="button">Go to Settings</button></div></div>`;
  // One compact card: the most recent due time; earlier unchecked times just get a mention.
  if (due.length) {
    const d = due[due.length - 1], earlier = due.slice(0, -1);
    html += `<div class="card due"><div class="row"><b>⏰ ${esc(d.slot.label)} meds (${esc(hm12(d.slot.time))})<br>
      <span style="font-weight:400">${d.meds.map(m => esc(medLabel(m))).join(", ")}</span>
      ${earlier.length ? `<span class="earlier">Not checked yet: ${earlier.map(x => esc(x.slot.label)).join(", ")} — tap MEDS</span>` : ""}</b>
      <button class="btn small" data-took="${d.slot.id}" type="button">Took them</button>
      <button class="btn small secondary" data-skip="${d.slot.id}" type="button">Not today</button></div></div>`;
  }
  html += `<div class="grid6">
    <button class="big" data-act="med" type="button"><span class="ic">💊</span>MEDS</button>
    <button class="big" data-act="food" type="button"><span class="ic">🍽️</span>ATE</button>
    <button class="big" data-act="feel" type="button"><span class="ic">🤢</span>FEEL</button>
    <button class="big" data-act="bp" type="button"><span class="ic">🩸</span>BP</button>
    <button class="big" data-act="bath" type="button"><span class="ic">🚽</span>BATHROOM</button>
    <button class="big" data-act="note" type="button"><span class="ic">📝</span>NOTE</button>
  </div>`;
  const list = dayEntries(viewDay);
  html += `<div class="card"><h2>${viewDay === todayKey() ? "Today" : esc(longDay(viewDay))}</h2>`;
  if (!list.length) html += `<p class="empty">Nothing logged yet.<br>Tap a button above to start.</p>`;
  else html += `<ul class="list">` + list.map(e => {
    const [main, sub] = summary(e);
    return `<li><button class="rowbtn" data-entry="${e.id}" type="button"><span class="t">${esc(hm12(e.time))}</span>
      <span class="ic" aria-hidden="true">${ICON[e.type]}</span><span class="what">${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ""}</span></button></li>`;
  }).join("") + `</ul><p class="hint">Tap an entry to fix the time or delete it.</p>`;
  html += `</div>`;
  const days = S.settings.lastExport ? Math.floor((Date.now() - new Date(S.settings.lastExport)) / 864e5) : null;
  if (S.entries.length > 20 && (days == null || days >= 7))
    html += `<div class="card"><b>Time for a backup</b><p class="note">${days == null ? "No backup yet." : `Last backup ${days} days ago.`}
      Send a copy to Michael so nothing is lost.</p><button class="btn secondary" data-goto="settings" type="button">Back up now</button></div>`;
  v.innerHTML = html;
  $$("[data-act]", v).forEach(b => b.onclick = () =>
    ({ med: medsSheet, food: () => foodSheet(), feel: () => feelSheet(), bp: () => bpSheet(), bath: () => bathSheet(), note: () => noteSheet() })[b.dataset.act]());
  $$("[data-entry]", v).forEach(b => b.onclick = () => openEntry(S.entries.find(e => e.id === b.dataset.entry)));
  $$("[data-took]", v).forEach(b => b.onclick = () => {
    const added = scheduled().filter(m => m.slot === b.dataset.took && !takenToday(viewDay, m.id)).map(m => logMed(m, nowHM()));
    render(); toast(`Logged ${added.length} meds`, () => added.forEach(e => deleteEntry(e.id)));
  });
  $$("[data-skip]", v).forEach(b => b.onclick = () => {
    (S.skips[viewDay] = S.skips[viewDay] || []).push(b.dataset.skip); save(); render();
  });
  $$("[data-goto]", v).forEach(b => b.onclick = () => setTab(b.dataset.goto));
}

/* ---------------- WEEK view ---------------- */
function dayStats(k) {
  const es = S.entries.filter(e => e.day === k);
  const mx = key => { const v = es.filter(e => e.type === "feel" && e[key] != null).map(e => e[key]); return v.length ? Math.max(...v) : null; };
  return {
    k, nausea: mx("nausea"), stomach: mx("stomach"), back: mx("back"), headache: mx("headache"),
    rescue: es.filter(e => e.type === "med" && RESCUE.test(e.name)).reduce((a, e) => a + 1, 0),
    loose: es.filter(e => e.type === "bath" && (e.kind === "diarrhea" || e.kind === "loose")).length,
    bp: es.filter(e => e.type === "bp").map(e => e.sys),
    n: es.length,
  };
}
function renderWeek() {
  const end = viewDay;
  const ks = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const st = ks.map(dayStats);
  const W = 340, L = 30, H = 170, top = 10, bot = 26, CW = (W - L) / 7, bw = (CW - 8) / 3;
  const y = v => top + (10 - v) / 10 * (H - top - bot);
  let svg = `<svg class="wk" viewBox="0 0 ${W} ${H}" role="img" aria-label="Worst nausea, stomach pain and back pain each day, 0 to 10">`;
  [0, 5, 10].forEach(v => svg += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  st.forEach((s, i) => {
    const x0 = L + i * CW + 4;
    [["nausea", "var(--bar-n)"], ["stomach", "var(--bar-p)"], ["back", "var(--bar-b)"]].forEach(([key, col], j) => {
      const v = s[key];
      if (v == null || v === 0) return;
      const h = y(0) - y(v);
      svg += `<rect x="${x0 + j * bw}" y="${y(v)}" width="${bw - 2}" height="${h}" rx="2" fill="${col}"><title>${shortDay(s.k)} ${key} ${v}</title></rect>`;
    });
    const d = parseDay(s.k);
    svg += `<text x="${L + i * CW + CW / 2}" y="${H - 8}" text-anchor="middle">${WD[d.getDay()][0]} ${d.getDate()}</text>`;
  });
  svg += `</svg>`;
  const rows = st.slice().reverse().map(s => `<tr><td>${esc(shortDay(s.k))}</td>
    <td>${s.nausea ?? "–"}</td><td>${s.stomach ?? "–"}</td><td>${s.rescue || "–"}</td><td>${s.loose || "–"}</td>
    <td>${s.bp.length ? `<span class="${Math.max(...s.bp) >= 170 ? "warn" : ""}">${Math.min(...s.bp)}–${Math.max(...s.bp)}</span>` : "–"}</td></tr>`).join("");
  $("#view").innerHTML = `<div class="card"><h2>Week ending ${esc(shortDay(end))}</h2>
    <p class="note">Worst rating each day (0–10).</p>
    <div class="legend"><span><span class="sw" style="background:var(--bar-n)"></span>Nausea</span>
      <span><span class="sw" style="background:var(--bar-p)"></span>Stomach pain</span>
      <span><span class="sw" style="background:var(--bar-b)"></span>Back pain</span></div>${svg}</div>
    <div class="card"><div style="overflow-x:auto"><table class="days"><thead><tr><th>Day</th><th>Nausea</th><th>Stomach</th><th>Nausea pills</th><th>Loose</th><th>BP top</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="hint">Use ‹ › at the top to look at earlier weeks.</p></div>`;
}

/* ---------------- SETTINGS view ---------------- */
function seg(name, options, current) {
  return `<div class="seg" role="group" aria-label="${esc(name)}">` + options.map(([v, l]) =>
    `<button type="button" data-seg="${esc(name)}" data-v="${v}" aria-pressed="${current === v}">${l}</button>`).join("") + `</div>`;
}
function renderSettings() {
  const slots = S.settings.slots;
  const slotName = id => id === "prn" ? "As needed" : (slots.find(s => s.id === id) || {}).label || id;
  const last = S.settings.lastExport ? new Date(S.settings.lastExport).toLocaleDateString() : "never";
  $("#view").innerHTML = `
  <div class="card"><h2>Look</h2>
    <div class="setrow"><span>Text size</span>${seg("size", [["normal", "A"], ["large", "A+"], ["xl", "A++"]], S.settings.size)}</div>
    <div class="setrow"><span>Colors</span>${seg("theme", [["auto", "Auto"], ["light", "Day"], ["dark", "Night"]], S.settings.theme)}</div>
  </div>
  <div class="card"><h2>Backup & send to Michael</h2>
    <p class="note">Everything is saved only on this phone. Send a backup every week or so. Last backup: <b>${esc(last)}</b>.</p>
    <div class="actions" style="flex-direction:column">
      <button class="btn" id="exp" type="button">📤 Share backup file</button>
      <button class="btn secondary" id="csv" type="button">📄 Save as spreadsheet (CSV)</button>
      <button class="btn secondary" id="imp" type="button">📥 Restore from a backup file</button>
      <input type="file" id="impfile" accept=".json,application/json" hidden>
    </div></div>
  <div class="card"><h2>Medications</h2>
    <p class="note">Tap a medication to change it. Turned-off meds stay in her history.</p>
    <div class="medlist">` + S.settings.meds.map(m => `<button class="medrow ${m.active ? "" : ""}" data-edit="${m.id}" type="button"
      style="${m.active ? "" : "opacity:.5"}"><span class="nm">${esc(medLabel(m))}<small>${esc(slotName(m.slot))}${m.active ? "" : " · off"}</small></span><span aria-hidden="true">›</span></button>`).join("") +
    `</div><button class="btn secondary wide" id="addmed" type="button">+ Add a medication</button></div>
  <div class="card"><h2>Med times</h2>` + slots.map(s =>
    `<div class="setrow"><label for="slot_${s.id}">${esc(s.label)}</label><input type="time" id="slot_${s.id}" data-slot="${s.id}" value="${esc(s.time)}" style="max-width:9rem"></div>`).join("") +
    `<p class="hint">A reminder card shows on the Today screen when these are due.</p></div>
  <div class="card"><h2>Quick-pick foods</h2>
    <div class="field"><label for="foods">One per line</label><textarea id="foods" rows="8">${esc(S.settings.foods.join("\n"))}</textarea></div>
    <button class="btn secondary" id="savefoods" type="button">Save food list</button></div>
  <div class="card"><h2>About</h2><p class="note">Margaret's Log · ${S.entries.length} entries saved on this phone.</p>
    <button class="btn danger" id="wipe" type="button">Erase everything on this phone</button></div>`;

  $$("[data-seg]").forEach(b => b.onclick = () => {
    S.settings[b.dataset.seg] = b.dataset.v; save(); applyLook(); renderSettings();
  });
  $$("[data-slot]").forEach(i => i.onchange = () => {
    const s = slots.find(x => x.id === i.dataset.slot); if (i.value) { s.time = i.value; save(); toast(`${s.label} set to ${hm12(i.value)}`); }
  });
  $("#savefoods").onclick = () => {
    S.settings.foods = $("#foods").value.split("\n").map(s => s.trim()).filter(Boolean); save(); toast("Food list saved");
  };
  $$("[data-edit]").forEach(b => b.onclick = () => medEditor(S.settings.meds.find(m => m.id === b.dataset.edit)));
  $("#addmed").onclick = () => medEditor(null);
  $("#exp").onclick = exportJSON;
  $("#csv").onclick = exportCSV;
  $("#imp").onclick = () => $("#impfile").click();
  $("#impfile").onchange = importJSON;
  $("#wipe").onclick = () => {
    if (!confirm("Erase ALL entries on this phone? Make sure you have a backup first.")) return;
    if (!confirm("Are you sure? This cannot be undone.")) return;
    S.entries = []; S.skips = {}; save(); render(); toast("Everything erased");
  };
}
function medEditor(m) {
  const slots = S.settings.slots;
  const opts = [...slots.map(s => [s.id, `${s.label} (${hm12(s.time)})`]), ["prn", "As needed"]];
  openSheet(m ? "Edit medication" : "Add medication",
    `<div class="field"><label for="ename">Name</label><input type="text" id="ename" value="${esc(m ? m.name : "")}"></div>
     <div class="field"><label for="edose">Dose</label><input type="text" id="edose" value="${esc(m ? m.dose : "")}" placeholder="e.g. 3.125 mg"></div>
     <div class="field"><label for="eqty">Pills each time</label><input type="number" id="eqty" min="1" inputmode="numeric" value="${esc(m ? m.qty : 1)}"></div>
     <div class="field"><label for="eslot">When</label><select id="eslot">${opts.map(([v, l]) =>
       `<option value="${v}" ${m && m.slot === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
     <div class="setrow"><span>Taking it now</span>${seg("active", [["yes", "Yes"], ["no", "Off"]], m && !m.active ? "no" : "yes")}</div>
     <div class="actions">${m ? `<button class="btn danger" id="mdel" type="button">Remove</button>` : ""}<button class="btn" id="msave" type="button">Save</button></div>`,
    root => {
      $$("[data-seg]", root).forEach(b => b.onclick = () => $$("[data-seg]", root).forEach(o => o.setAttribute("aria-pressed", o === b)));
      $("#msave", root).onclick = () => {
        const name = $("#ename", root).value.trim();
        if (!name) { toast("Type a name"); return; }
        const data = { name, dose: $("#edose", root).value.trim(), qty: Math.max(1, +$("#eqty", root).value || 1),
          slot: $("#eslot", root).value, active: $('[data-seg="active"][aria-pressed="true"]', root).dataset.v === "yes" };
        if (m) Object.assign(m, data); else S.settings.meds.push({ id: mid(), ...data });
        save(); closeSheet(); renderSettings(); toast("Medication saved");
      };
      const del = $("#mdel", root);
      if (del) del.onclick = () => {
        if (!confirm(`Remove ${m.name} from the list? Past entries stay.`)) return;
        S.settings.meds = S.settings.meds.filter(x => x.id !== m.id); save(); closeSheet(); renderSettings();
      };
    });
}

/* ---------------- export / import ---------------- */
async function shareOrDownload(name, type, text) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name, text: "Margaret's Log backup" });
      return true;
    }
  } catch (e) { if (e.name === "AbortError") return false; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
async function exportJSON() {
  const data = { app: "margarets-log", version: 1, exported: new Date().toISOString(), entries: S.entries, settings: S.settings };
  const ok = await shareOrDownload(`margaret-log-${todayKey()}.json`, "application/json", JSON.stringify(data, null, 1));
  if (ok) { S.settings.lastExport = new Date().toISOString(); save(); renderSettings(); toast("Backup ready"); }
}
async function exportCSV() {
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["date", "time", "type", "what", "details"].join(",")];
  [...S.entries].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .forEach(e => { const [w, d] = summary(e); rows.push([e.day, e.time, e.type, q(w), q(d)].join(",")); });
  await shareOrDownload(`margaret-log-${todayKey()}.csv`, "text/csv", rows.join("\n"));
}
function importJSON(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.app !== "margarets-log" || !Array.isArray(d.entries)) throw new Error("not a backup");
      if (d.setup) {  // the private setup file Michael sends: just the med list
        if (!confirm(`Load ${d.settings.meds.length} medications into the app? This replaces the current med list (past entries stay).`)) return;
        S.settings.meds = d.settings.meds; save(); render(); toast("Medication list loaded");
        return;
      }
      const have = new Set(S.entries.map(e => e.id));
      const add = d.entries.filter(e => !have.has(e.id));
      if (!confirm(`Add ${add.length} entries from this backup? (${d.entries.length - add.length} are already here.)`)) return;
      S.entries.push(...add);
      if (d.settings && confirm("Also use the medication list and settings from the backup?")) S.settings = { ...S.settings, ...d.settings };
      save(); applyLook(); render(); toast(`Restored ${add.length} entries`);
    } catch (e) { alert("That file isn't a Margaret's Log backup."); }
  };
  r.readAsText(f);
  ev.target.value = "";
}

/* ---------------- navigation ---------------- */
function setTab(t) {
  tab = t;
  $$(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  render();
  scrollTo(0, 0);
}
function render() {
  $("#dayLabel").textContent = tab === "settings" ? "Settings" : tab === "week" ? "This week" :
    viewDay === todayKey() ? "Today" : longDay(viewDay);
  const n = dayEntries(viewDay).length;
  $("#daySub").textContent = (viewDay === todayKey() ? longDay(viewDay) + " · " : "") + `${n} entr${n === 1 ? "y" : "ies"}`;
  $("#dayNext").disabled = viewDay >= todayKey();
  const showDays = tab !== "settings";
  $("#dayPrev").style.visibility = $("#dayNext").style.visibility = showDays ? "visible" : "hidden";
  if (tab === "today") renderToday(); else if (tab === "week") renderWeek(); else renderSettings();
}
$("#dayPrev").onclick = () => { viewDay = addDays(viewDay, -1); render(); };
$("#dayNext").onclick = () => { if (viewDay < todayKey()) { viewDay = addDays(viewDay, 1); render(); } };
$$(".tabs button").forEach(b => b.onclick = () => setTab(b.dataset.tab));

// Keep "today" and due reminders fresh when she comes back to the app.
let lastToday = todayKey();
function refresh() {
  if (todayKey() !== lastToday) { if (viewDay === lastToday) viewDay = todayKey(); lastToday = todayKey(); }
  if (tab === "today" && $("#sheet").hidden) render();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
setInterval(refresh, 60000);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyLook);

applyLook();
render();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
  navigator.serviceWorker.register("sw.js").catch(() => {});
