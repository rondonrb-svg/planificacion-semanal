import { useState, useEffect } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const MATERIAS_POR_DIA = {
  Lunes:      ["Asamblea", "Español",           "Almuerzo", "Teatro",              "Capacitación Física", "Aflatoun",    "Documentación"],
  Martes:     ["Círculo",  "Matemáticas",        "Almuerzo", "Capacitación Física", "Arte",                "Música",      "Documentación"],
  Miércoles:  ["Asamblea", "Ciencias",           "Almuerzo", "¿Quién Soy?",         "Teatro",              "Inglés",      "Documentación"],
  Jueves:     ["Círculo",  "Espacio Abierto",    "Inglés",   "Almuerzo",            "Español",             "Matemáticas", "Agroecología", "Documentación"],
  Viernes:    ["Asamblea", "Estudios Sociales",  "Almuerzo", "Investigación",        "Inglés",              "Ciudadanía",  "Documentación"],
};

const AVALUO_OPCIONES = [
  "Entrevista","Rúbricas","Escala de observación","Récord anecdótico",
  "Bitácora de observaciones","Diario del investigador","Registro de eventos",
  "Observación","Trabajo de ejecución","Trabajos artísticos","Diario reflexivo",
  "Portafolio","Informes orales",
];

const SKIP_MATERIAS = ["Almuerzo", "Documentación", "Espacio Abierto", "Asamblea", "Círculo"];

const ASAMBLEA_TEXT = `1. Actividad de movimiento corporal para comenzar el día.\n2. Ronda de diálogo sobre la reflexión "Puedes llegar a donde tú quieras".\n3. Círculo de agradecimiento del día.\n4. Calendario ¿Cuál es hoy? ¿Qué día será mañana?`;

const emptyMateria = () => ({
  objetivos: "", preguntasGuias: "", ideasFundamentales: "",
  inicio: "", desarrollo: "", cierre: "", recursos: "", avaluo: [], notas: "",
});

const emptyPlan = (semana = "") => ({
  id: Date.now().toString(),
  semana,
  facilitadora: "Yeliza Collazo Díaz",
  circulo: "Sembradores Caguas",
  tema: "Los deportes",
  subTema: "",
  dias: Object.fromEntries(
    DIAS.map(d => [d, {
      asamblea: ASAMBLEA_TEXT,
      ...Object.fromEntries(
        MATERIAS_POR_DIA[d].filter(m => !SKIP_MATERIAS.includes(m)).map(m => [m, emptyMateria()])
      )
    }])
  ),
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatSemana(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-PR", { year: "numeric", month: "long", day: "numeric" });
}

function getLunesOfWeek(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ─── API KEY ──────────────────────────────────────────────────────────────────

function getApiKey() {
  let key = localStorage.getItem("anthropic_api_key") || "";
  if (!key) {
    key = window.prompt("Ingresa tu API key de Anthropic (se guardará localmente):") || "";
    if (key) localStorage.setItem("anthropic_api_key", key.trim());
  }
  return key.trim();
}

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": getApiKey(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// ─── AI GENERATION ───────────────────────────────────────────────────────────

async function generateContent(plan, dia, materia, fieldLabel, setter) {
  setter("⏳ Generando...");
  const ctx = plan.dias[dia][materia];
  const prompt = `Eres asistente pedagógica experta en educación alternativa para niños en Puerto Rico.
Estás ayudando a Yeliza Collazo Díaz a crear su planificación semanal del Círculo Sembradores Caguas.
Tema del año: "${plan.tema}". Sub-tema esta semana: "${plan.subTema}". Día: ${dia}. Materia: ${materia}.
Contexto actual: Objetivos: ${ctx.objetivos||"(vacío)"}. Preguntas: ${ctx.preguntasGuias||"(vacío)"}.
Genera SOLO el contenido para el campo "${fieldLabel}" en español, conciso y práctico (máx 3-4 oraciones). Sin encabezados. Solo el texto directo.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (data.error) { setter(`Error: ${data.error.message}`); return; }
    setter((data.content?.map(b => b.text || "").join("") || "").trim());
  } catch (e) { setter("Error al generar. Intenta de nuevo."); }
}

async function generateAllForMateria(plan, dia, materia, onUpdate, onError) {
  const prompt = `Eres asistente pedagógica experta en educación alternativa para niños en Puerto Rico.
Tema del año: "${plan.tema}". Sub-tema esta semana: "${plan.subTema}". Día: ${dia}. Materia: ${materia}.
Genera un plan completo para esta materia en español, conciso y práctico.
Responde ÚNICAMENTE con un objeto JSON con estas 7 claves exactas:
"objetivos", "preguntasGuias", "ideasFundamentales", "inicio", "desarrollo", "cierre", "recursos".
Para recursos incluye 1-2 URLs educativas. Sin markdown, sin texto extra, solo JSON puro.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "{" },
        ],
      }),
    });
    const apiData = await res.json();
    if (apiData.error) { if (onError) onError(apiData.error.message); return; }
    const text = "{" + (apiData.content?.map(b => b.text || "").join("") || "");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { if (onError) onError("No se pudo procesar la respuesta. Intenta de nuevo."); return; }
    const parsed = JSON.parse(jsonMatch[0]);
    onUpdate(parsed);
  } catch (e) {
    console.error("Error generateAll:", e);
    if (onError) onError("Error al generar. Intenta de nuevo.");
  }
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────

async function savePlan(plan) {
  try {
    await window.storage.set(`plan:${plan.id}`, JSON.stringify(plan));
    let index = [];
    try { const r = await window.storage.get("plan:index"); if (r) index = JSON.parse(r.value); } catch {}
    const exists = index.find(i => i.id === plan.id);
    if (!exists) index.push({ id: plan.id, semana: plan.semana, subTema: plan.subTema, createdAt: Date.now() });
    else { const i = index.find(x => x.id === plan.id); i.semana = plan.semana; i.subTema = plan.subTema; }
    await window.storage.set("plan:index", JSON.stringify(index));
  } catch (e) { console.error("Save error:", e); }
}

async function loadIndex() {
  try { const r = await window.storage.get("plan:index"); return r ? JSON.parse(r.value) : []; } catch { return []; }
}
async function loadPlan(id) {
  try { const r = await window.storage.get(`plan:${id}`); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function deletePlan(id) {
  try {
    await window.storage.delete(`plan:${id}`);
    const r = await window.storage.get("plan:index");
    if (r) await window.storage.set("plan:index", JSON.stringify(JSON.parse(r.value).filter(i => i.id !== id)));
  } catch {}
}

// ─── EXPORT UTILITIES ────────────────────────────────────────────────────────

const LOGO_B64 = "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";

function xmlEscape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const CG = '<w:rFonts w:ascii="Century Gothic" w:eastAsia="Century Gothic" w:hAnsi="Century Gothic" w:cs="Century Gothic"/>';

const _bdr = (c, sz) =>
  `<w:tcBorders><w:top w:val="single" w:sz="${sz}" w:space="0" w:color="${c}"/><w:left w:val="single" w:sz="${sz}" w:space="0" w:color="${c}"/><w:bottom w:val="single" w:sz="${sz}" w:space="0" w:color="${c}"/><w:right w:val="single" w:sz="${sz}" w:space="0" w:color="${c}"/></w:tcBorders>`;
const OB = _bdr("FF6500", 12);
const BB = _bdr("000000", 12);
const GB = _bdr("A8D08D", 12);
const OB_GB = `<w:tcBorders><w:top w:val="single" w:sz="12" w:space="0" w:color="FF6500"/><w:left w:val="single" w:sz="12" w:space="0" w:color="FF6500"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="538135"/><w:right w:val="single" w:sz="12" w:space="0" w:color="FF6500"/></w:tcBorders>`;

function cgRun(text, opts = {}) {
  const rPr = [
    opts.bold ? "<w:b/><w:bCs/>" : "",
    opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "",
    opts.color ? `<w:color w:val="${opts.color}"/>` : "",
    CG,
  ].filter(Boolean).join("");
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function cgPara(runs, opts = {}) {
  const spacing = opts.before || opts.after
    ? `<w:spacing${opts.before ? ` w:before="${opts.before}"` : ""}${opts.after ? ` w:after="${opts.after}"` : ""}/>` : "";
  const jc = opts.center ? '<w:jc w:val="center"/>' : "";
  const defRpr = opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>${CG}` : CG;
  return `<w:p><w:pPr>${spacing}${jc}<w:rPr>${defRpr}</w:rPr></w:pPr>${Array.isArray(runs) ? runs.join("") : runs}</w:p>`;
}

function makeCell(w, content, opts = {}) {
  const { span, fill, borders = OB, vAlign, vm } = opts;
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "";
  const gs = span ? `<w:gridSpan w:val="${span}"/>` : "";
  const va = vAlign ? `<w:vAlign w:val="${vAlign}"/>` : "";
  const vmStr = vm === "restart" ? `<w:vMerge w:val="restart"/>` : vm === "cont" ? `<w:vMerge/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${gs}${vmStr}${borders}${shd}${va}</w:tcPr>${Array.isArray(content) ? content.join("") : content}</w:tc>`;
}

function makeRow(cells, height) {
  const trPr = height ? `<w:trPr><w:trHeight w:val="${height}"/></w:trPr>` : "";
  return `<w:tr>${trPr}${Array.isArray(cells) ? cells.join("") : cells}</w:tr>`;
}

function makeTable(rows, colWidths, tblStyle = "afffffffff") {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const gridCols = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join("");
  const tblBorders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders>`;
  const tblLook = `<w:tblLook w:val="0400" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="${tblStyle}"/><w:tblW w:w="${total}" w:type="dxa"/>${tblBorders}<w:tblLayout w:type="fixed"/>${tblLook}</w:tblPr><w:tblGrid>${gridCols}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

const SCHEDULE_DATA = {
  "Lunes":     { widths: [1241,1804,2250,1767,1417,1448,1510,2048], slots: ["8:00-9:00","9:00-10:00","10:00-11:00","11:00-12:00","1:00-2:00","2:00-3:00","3:00-4:30"] },
  "Martes":    { widths: [1242,1592,2806,1422,1448,1418,1509,1873], slots: ["8:00-9:00","9:00-10:00","10:00-11:00","11:00-12:00","1:00-2:00","2:00-3:00","3:00-4:30"] },
  "Miércoles": { widths: [1245,1598,2815,1425,1419,1421,1513,1874], slots: ["8:00-9:00","9:00-10:00","10:00-11:00","11:00-12:00","1:00-2:00","2:00-3:00","3:00-4:30"] },
  "Jueves":    { widths: [1245,1434,1417,1562,1425,1419,1421,1513,1874], slots: ["8:00-9:00","9:00-9:30","9:30-10:00","10:00-11:00","11:00-12:00","1:00-2:00","2:00-3:00","3:00-4:30"] },
  "Viernes":   { widths: [978,1275,1182,1425,1425,1497,1383,1710,2100], slots: ["8:00-9:00","9:00-9:30","9:30-10:00","10:00-11:00","11:00-12:00","1:00-2:00","2:00-3:00","3:00-4:30"] },
};

async function loadJSZip() {
  if (window.JSZip) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function buildSectPr(withHeaderRef) {
  const hdr = withHeaderRef ? '<w:headerReference w:type="default" r:id="rId13"/>' : "";
  return `<w:sectPr>${hdr}<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="720"/></w:sectPr>`;
}

function buildHeaderTable(plan, dayIndex) {
  const isLunes = dayIndex === 0;
  const grid = isLunes ? [4342, 4343, 4800] : [4334, 4336, 4638];
  const cell1W = isLunes ? 8685 : 8670;
  const cell2W = isLunes ? 4800 : 4638;
  const d = new Date((plan.semana || "2024-01-01") + "T12:00:00");
  d.setDate(d.getDate() + dayIndex);
  const fecha = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  const row1 = makeRow([
    makeCell(cell1W, cgPara([cgRun(`Nombre del Facilitador/a: ${plan.facilitadora || ""}`)], { vAlign: "center" }), { span: 2, borders: OB_GB, vAlign: "center" }),
    makeCell(cell2W, cgPara([cgRun(`Círculo: ${plan.circulo || ""}`)], { vAlign: "center" }), { borders: OB, vAlign: "center" }),
  ]);
  const row2 = makeRow([
    makeCell(grid[0], cgPara([cgRun(`Fecha: ${fecha}`)]), { borders: OB }),
    makeCell(grid[1], cgPara([cgRun(`Tema: ${plan.tema || ""}`)]), { borders: OB }),
    makeCell(grid[2], cgPara([cgRun(`Sub Tema: ${plan.subTema || ""}`)]), { borders: OB }),
  ]);
  return makeTable([row1, row2], grid, "afffffffff");
}

function buildScheduleTable(dia) {
  const { widths, slots } = SCHEDULE_DATA[dia];
  const materias = MATERIAS_POR_DIA[dia] || [];
  const row1 = makeRow([
    makeCell(widths[0], cgPara([cgRun(dia, { bold: true })], { center: true }), { borders: BB, vAlign: "center" }),
    ...slots.map((s, i) => makeCell(widths[i + 1], cgPara([cgRun(s)], { center: true }), { borders: BB, vAlign: "center" })),
  ]);
  const row2 = makeRow([
    makeCell(widths[0], cgPara([cgRun("")]), { borders: BB, vAlign: "center" }),
    ...slots.map((_, i) => makeCell(widths[i + 1], cgPara([cgRun(materias[i] || "")], { center: true }), { borders: BB, vAlign: "center" })),
  ]);
  return makeTable([row1, row2], widths, "afffffffff0");
}

const ZONE_HDR_BDR = `<w:tcBorders><w:top w:val="single" w:sz="12" w:space="0" w:color="FF6500"/><w:left w:val="single" w:sz="12" w:space="0" w:color="FF6500"/><w:bottom w:val="single" w:sz="12" w:space="0" w:color="A8D08D"/><w:right w:val="single" w:sz="12" w:space="0" w:color="FF6500"/></w:tcBorders>`;
const SEP_BDR = `<w:tcBorders><w:top w:val="nil"/><w:left w:val="single" w:sz="12" w:space="0" w:color="FF6500"/><w:bottom w:val="nil"/><w:right w:val="single" w:sz="12" w:space="0" w:color="FF6500"/></w:tcBorders>`;

const CONTENT_TABLE_DATA = {
  "Lunes":     { grid:[3030,270,540,1860,2295,1920,510,1080,1065,960],   z1:{gs:2,w:3300,col0:3030,col1:270,header:"Asamblea"},   sep1:540, z2:{gs:3,w:6075,materia:"Español",      mainGs:2,mainW:4155,avalW:1920,iW:1860,dW:2295,cW:1920}, sep2:510, z3:{gs:3,w:3105,materia:"Aflatoun",    iW:1080,dW:1065,cW:960},  z1Bottom:null, rows:9 },
  "Martes":    { grid:[3030,270,540,1860,1935,2280,510,1080,1020,1005],  z1:{gs:2,w:3300,col0:3030,col1:270,header:"Asamblea"},   sep1:540, z2:{gs:3,w:6075,materia:"Matemáticas",  mainGs:2,mainW:3795,avalW:2280,iW:1860,dW:1935,cW:2280}, sep2:510, z3:{gs:3,w:3105,materia:"Arte",        iW:1080,dW:1020,cW:1005}, z1Bottom:{materia:"Círculo"}, rows:9 },
  "Miércoles": { grid:[3030,270,540,1860,2295,1920,510,1125,1125,930],   z1:{gs:2,w:3300,col0:3030,col1:270,header:"Asamblea"},   sep1:540, z2:{gs:3,w:6075,materia:"Ciencias",     mainGs:2,mainW:4155,avalW:1920,iW:1860,dW:2295,cW:1920}, sep2:510, z3:{gs:3,w:3180,materia:"¿Quién Soy?",iW:1125,dW:1125,cW:930},  z1Bottom:null, rows:9 },
  "Jueves":    { grid:[1860,270,300,2175,1920,2910,420,1335,105,930,105,855], z1:{gs:2,w:2130,col0:1860,col1:270,header:"Círculo"}, sep1:300, z2:{gs:3,w:7005,materia:"Matemáticas",  mainGs:2,mainW:4095,avalW:2910,iW:2175,dW:1920,cW:2910}, sep2:420, z3:{gs:5,w:3330,materia:"Español",iW:1440,iGs:2,dW:1035,dGs:2,cW:855,bottomMateria:"Agroecología",biW:1335,bdW:1035,bdGs:2,bcW:960,bcGs:2}, z1Bottom:{materia:"Espacio Abierto"}, rows:12 },
  "Viernes":   { grid:[1935,270,270,1725,2010,3420,270,1065,1080,990],   z1:{gs:2,w:2205,col0:1935,col1:270,header:"Asamblea"},   sep1:270, z2:{gs:3,w:7155,materia:"Estudios Sociales",mainGs:2,mainW:3735,avalW:3420,iW:1725,dW:2010,cW:3420}, sep2:270, z3:{gs:3,w:3135,materia:"Ciudadanía",iW:1065,dW:1080,cW:990}, z1Bottom:{materia:"Investigación"}, rows:9 },
};

function buildContentTable(plan, dia, asambleaText) {
  const cfg = CONTENT_TABLE_DATA[dia];
  const { z1, z2, z3, sep1, sep2, z1Bottom } = cfg;
  const diaData = plan.dias[dia] || {};
  const z2data = diaData[z2.materia] || {};
  const z3data = diaData[z3.materia] || {};
  const z3bdata = z3.bottomMateria ? (diaData[z3.bottomMateria] || {}) : {};
  const z1bdata = z1Bottom ? (diaData[z1Bottom.materia] || {}) : {};
  const avaluoText = "Avalúo:\n" + AVALUO_OPCIONES.map(o => (z2data.avaluo || []).includes(o) ? `✓ ${o}` : `☐ ${o}`).join("\n");
  const cp = (text) => {
    const lines = String(text || "").split("\n");
    if (lines.length === 1 && !lines[0]) return cgPara([cgRun("")]);
    return lines.map(line => `<w:p><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/>${CG}</w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/>${CG}</w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join("");
  };
  const hdr = (w, gs, text) => makeCell(w, cgPara([cgRun(text || "", { bold: true, color: "FFFFFF", size: 20 })], { center: true }), { span: gs, fill: "FF6500", borders: ZONE_HDR_BDR, vAlign: "center" });
  const sep = (w, vm) => makeCell(w, cgPara([cgRun("")]), { borders: SEP_BDR, vm });
  const cc = (w, text, opts = {}) => makeCell(w, cp(text), { borders: OB, ...opts });
  const rows = [];
  if (cfg.rows === 9) {
    rows.push(makeRow([hdr(z1.w,z1.gs,z1.header), sep(sep1,"restart"), hdr(z2.w,z2.gs,z2.materia), sep(sep2,"restart"), hdr(z3.w,z3.gs,z3.materia)]));
    rows.push(makeRow([cc(z1.col0,asambleaText,{vm:"restart"}), cc(z1.col1,"",{vm:"restart"}), sep(sep1,"cont"), cc(z2.mainW,"Objetivos: "+(z2data.objetivos||""),{span:z2.mainGs}), cc(z2.avalW,avaluoText,{vm:"restart"}), sep(sep2,"cont"), cc(z3.w,"Objetivos: "+(z3data.objetivos||"")+(z3data.preguntasGuias?"\nPreguntas Guías: "+z3data.preguntasGuias:""),{span:z3.gs,vm:"restart"})]));
    rows.push(makeRow([cc(z1.col0,"",{vm:"cont"}), cc(z1.col1,"",{vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"Preguntas Guías: "+(z2data.preguntasGuias||""),{span:z2.mainGs,vm:"restart"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.w,"Secuencia de actividades:",{span:z3.gs})]));
    rows.push(makeRow([cc(z1.col0,"",{vm:"cont"}), cc(z1.col1,"",{vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"",{span:z2.mainGs,vm:"cont"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.iW,"Inicio: "+(z3data.inicio||""),{vm:"restart"}), cc(z3.dW,"Desarrollo: "+(z3data.desarrollo||""),{vm:"restart"}), cc(z3.cW,"Cierre: "+(z3data.cierre||""),{vm:"restart"})]));
    rows.push(makeRow([cc(z1.col0,"",{vm:"cont"}), cc(z1.col1,"",{vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"Ideas Fundamentales: "+(z2data.ideasFundamentales||""),{span:z2.mainGs,vm:"restart"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.iW,"",{vm:"cont"}), cc(z3.dW,"",{vm:"cont"}), cc(z3.cW,"",{vm:"cont"})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs,vm:"restart"}), sep(sep1,"cont"), cc(z2.mainW,"",{span:z2.mainGs,vm:"cont"}), cc(z2.avalW,"Recursos: "+(z2data.recursos||""),{vm:"restart"}), sep(sep2,"cont"), cc(z3.iW,"",{vm:"cont"}), cc(z3.dW,"",{vm:"cont"}), cc(z3.cW,"",{vm:"cont"})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs,vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"",{span:z2.mainGs,vm:"cont"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.w,"",{span:z3.gs})]));
    rows.push(makeRow([cc(z1.w,z1Bottom?z1Bottom.materia:"",{span:z1.gs}), sep(sep1,"cont"), cc(z2.w,"Secuencia de Actividades:",{span:z2.gs}), sep(sep2,"cont"), cc(z3.w,"Anotaciones",{span:z3.gs})]));
    const z1bc = z1Bottom ? (z1bdata.inicio||z1bdata.objetivos||z1bdata.notas||"") : "";
    rows.push(makeRow([cc(z1.w,z1bc,{span:z1.gs}), sep(sep1,"cont"), cc(z2.iW,"Inicio: "+(z2data.inicio||"")), cc(z2.dW,"Desarrollo: "+(z2data.desarrollo||"")), cc(z2.cW,"Cierre: "+(z2data.cierre||"")), sep(sep2,"cont"), cc(z3.w,z3data.notas||"",{span:z3.gs})]));
  } else {
    // Jueves 12-row
    rows.push(makeRow([hdr(z1.w,z1.gs,z1.header), sep(sep1,"restart"), hdr(z2.w,z2.gs,z2.materia), sep(sep2,"restart"), hdr(z3.w,z3.gs,z3.materia)]));
    rows.push(makeRow([cc(z1.col0,asambleaText,{vm:"restart"}), cc(z1.col1,"",{vm:"restart"}), sep(sep1,"cont"), cc(z2.mainW,"Objetivos: "+(z2data.objetivos||""),{span:z2.mainGs}), cc(z2.avalW,avaluoText,{vm:"restart"}), sep(sep2,"cont"), cc(z3.w,"Objetivos: "+(z3data.objetivos||"")+(z3data.preguntasGuias?"\nPreguntas Guías: "+z3data.preguntasGuias:""),{span:z3.gs,vm:"restart"})]));
    rows.push(makeRow([cc(z1.col0,"",{vm:"cont"}), cc(z1.col1,"",{vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"Preguntas Guías: "+(z2data.preguntasGuias||""),{span:z2.mainGs,vm:"restart"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.w,"Secuencia de actividades:",{span:z3.gs})]));
    rows.push(makeRow([cc(z1.col0,"",{vm:"cont"}), cc(z1.col1,"",{vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"",{span:z2.mainGs,vm:"cont"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.iW,"Inicio: "+(z3data.inicio||""),{span:z3.iGs,vm:"restart"}), cc(z3.dW,"Desarrollo: "+(z3data.desarrollo||""),{span:z3.dGs,vm:"restart"}), cc(z3.cW,"Cierre: "+(z3data.cierre||""),{vm:"restart"})]));
    rows.push(makeRow([cc(z1.col0,"",{vm:"cont"}), cc(z1.col1,"",{vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"Ideas Fundamentales: "+(z2data.ideasFundamentales||""),{span:z2.mainGs,vm:"restart"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.iW,"",{span:z3.iGs,vm:"cont"}), cc(z3.dW,"",{span:z3.dGs,vm:"cont"}), cc(z3.cW,"",{vm:"cont"})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs,vm:"restart"}), sep(sep1,"cont"), cc(z2.mainW,"",{span:z2.mainGs,vm:"cont"}), cc(z2.avalW,"Recursos: "+(z2data.recursos||""),{vm:"restart"}), sep(sep2,"cont"), cc(z3.iW,"",{span:z3.iGs,vm:"cont"}), cc(z3.dW,"",{span:z3.dGs,vm:"cont"}), cc(z3.cW,"",{vm:"cont"})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs,vm:"cont"}), sep(sep1,"cont"), cc(z2.mainW,"",{span:z2.mainGs,vm:"cont"}), cc(z2.avalW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.w,"",{span:z3.gs})]));
    rows.push(makeRow([cc(z1.w,z1Bottom?z1Bottom.materia:"",{span:z1.gs}), sep(sep1,"cont"), cc(z2.w,"Secuencia de Actividades:",{span:z2.gs}), sep(sep2,"cont"), cc(z3.w,z3.bottomMateria||"",{span:z3.gs})]));
    const z1bc = z1bdata.inicio||z1bdata.objetivos||z1bdata.notas||"";
    rows.push(makeRow([cc(z1.w,z1bc,{span:z1.gs,vm:"restart"}), sep(sep1,"cont"), cc(z2.iW,"Inicio: "+(z2data.inicio||""),{vm:"restart"}), cc(z2.dW,"Desarrollo: "+(z2data.desarrollo||""),{vm:"restart"}), cc(z2.cW,"Cierre: "+(z2data.cierre||""),{vm:"restart"}), sep(sep2,"cont"), cc(z3.w,"Objetivos: "+(z3bdata.objetivos||"")+(z3bdata.preguntasGuias?"\nPreguntas Guías: "+z3bdata.preguntasGuias:""),{span:z3.gs,vm:"restart"})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs,vm:"cont"}), sep(sep1,"cont"), cc(z2.iW,"",{vm:"cont"}), cc(z2.dW,"",{vm:"cont"}), cc(z2.cW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.w,"Secuencia de actividades:",{span:z3.gs})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs,vm:"cont"}), sep(sep1,"cont"), cc(z2.iW,"",{vm:"cont"}), cc(z2.dW,"",{vm:"cont"}), cc(z2.cW,"",{vm:"cont"}), sep(sep2,"cont"), cc(z3.biW,"Inicio: "+(z3bdata.inicio||"")), cc(z3.bdW,"Desarrollo: "+(z3bdata.desarrollo||""),{span:z3.bdGs}), cc(z3.bcW,"Cierre: "+(z3bdata.cierre||""),{span:z3.bcGs})]));
    rows.push(makeRow([cc(z1.w,"",{span:z1.gs}), sep(sep1), cc(z2.iW,""), cc(z2.dW,""), cc(z2.cW,""), sep(sep2), cc(z3.biW,""), cc(z3.bdW,"",{span:z3.bdGs}), cc(z3.bcW,"",{span:z3.bcGs})]));
  }
  return makeTable(rows, cfg.grid, "afffffffff1");
}

function buildHeader1Xml() {
  const HDR_NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:v="urn:schemas-microsoft-com:vml" ' +
    'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
    'xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" ' +
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
    'mc:Ignorable="w14 w15 w16se wp14"';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${HDR_NS}><w:p><w:pPr><w:pBdr><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:between w:val="nil"/></w:pBdr><w:tabs><w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/></w:tabs><w:jc w:val="center"/><w:rPr><w:color w:val="000000"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr><w:r><w:rPr>${CG}<w:noProof/><w:color w:val="000000"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="0" layoutInCell="1" hidden="0" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>146685</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>155010</wp:posOffset></wp:positionV><wp:extent cx="772510" cy="583324"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="152" name="image5.png" descr="Logo, company name Description automatically generated"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="image5.png" descr="Logo, company name Description automatically generated"/><pic:cNvPicPr preferRelativeResize="0"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="772510" cy="583324"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r><w:r><w:rPr>${CG}<w:b/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Planificación Semanal</w:t></w:r></w:p></w:hdr>`;
}

function buildDocxBody(plan) {
  const parts = [];
  DIAS.forEach((dia, i) => {
    parts.push(buildHeaderTable(plan, i));
    parts.push(buildScheduleTable(dia));
    parts.push(buildContentTable(plan, dia, plan.dias[dia].asamblea ?? ASAMBLEA_TEXT));
    if (i < DIAS.length - 1) {
      parts.push(`<w:p><w:pPr>${buildSectPr(true)}</w:pPr></w:p>`);
    }
  });
  return parts;
}

async function exportDocx(plan) {
  const filename = `Planificacion_${(plan.subTema || "Semanal").replace(/\s+/g, "_")}_${plan.semana || "semana"}.docx`;

  // Acquire file handle FIRST while user activation is still valid.
  // showSaveFilePicker must be the first await in this function.
  let fileHandle = null;
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Documento Word", accept: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] } }],
      });
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled
      // SecurityError or other: fall back to anchor-click
    }
  }

  await loadJSZip();

  const bodyParts = buildDocxBody(plan);

  const NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}>
  <w:body>
    ${bodyParts.join("\n")}
    ${buildSectPr(true)}
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

  const hdrRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>
</Relationships>`;

  // Decode LOGO_B64 to binary Uint8Array
  const logoBytes = Uint8Array.from(atob(LOGO_B64), c => c.charCodeAt(0));

  const zip = new window.JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", docRels);
  zip.file("word/header1.xml", buildHeader1Xml());
  zip.file("word/_rels/header1.xml.rels", hdrRels);
  zip.file("word/media/logo.png", logoBytes);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

  // Write using file handle (File System Access API) or fall back to anchor-click
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function exportPdf(plan) {
  const slug = (plan.subTema || "Semanal").replace(/\s+/g, "_");
  const filename = `Planificacion_${slug}_${plan.semana || "semana"}`;

  const styles = `
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }
    .page-title { text-align: center; font-size: 18pt; font-weight: bold; color: #1a6b3a; margin-bottom: 12px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .meta-table td { border: 1px solid #ccc; padding: 5px 8px; font-size: 10pt; }
    .meta-table .header-cell { background: #e8f5e9; font-weight: bold; }
    .dia-title { font-size: 14pt; font-weight: bold; color: #1a6b3a; margin: 18px 0 6px; border-bottom: 2px solid #1a6b3a; padding-bottom: 3px; }
    .materia-title { font-size: 12pt; font-weight: bold; color: #2e7d32; margin: 12px 0 4px; }
    .asamblea-box { background: #f1faf3; border: 1px solid #a5d6a7; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; }
    .asamblea-label { font-weight: bold; color: #1a6b3a; font-size: 11pt; margin-bottom: 4px; }
    .asamblea-line { font-size: 10pt; margin: 2px 0; }
    .content-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .content-table td { border: 1px solid #ccc; padding: 5px 8px; font-size: 10pt; vertical-align: top; }
    .label-cell { background: #f1f8e9; font-weight: bold; width: 22%; }
    .section-header { background: #d0edda; font-weight: bold; text-align: center; }
    @media print {
      @page { size: letter; margin: 0.5in; }
      .dia-title { page-break-before: auto; }
    }
  `;

  let html = `<div class="page-title">PLANIFICACIÓN SEMANAL</div>
  <table class="meta-table">
    <tr>
      <td class="header-cell">Facilitadora: ${xmlEscape(plan.facilitadora)}</td>
      <td class="header-cell">Facilitadora: ${xmlEscape(plan.facilitadora)}</td>
      <td class="header-cell">Círculo: ${xmlEscape(plan.circulo)}</td>
    </tr>
    <tr>
      <td>Semana del: ${formatSemana(plan.semana)}</td>
      <td>Tema: ${xmlEscape(plan.tema)}</td>
      <td>Sub Tema: ${xmlEscape(plan.subTema)}</td>
    </tr>
  </table>`;

  for (const dia of DIAS) {
    html += `<div class="dia-title">${dia.toUpperCase()}</div>`;
    html += `<div class="asamblea-box"><div class="asamblea-label">Asamblea / Círculo</div>${(plan.dias[dia].asamblea ?? ASAMBLEA_TEXT).split("\n").map(l => `<div class="asamblea-line">${xmlEscape(l)}</div>`).join("")}</div>`;

    for (const [materia, data] of Object.entries(plan.dias[dia])) {
      const hasContent = [data.objetivos, data.preguntasGuias, data.ideasFundamentales, data.inicio, data.desarrollo, data.cierre, data.recursos].some(Boolean) || data.avaluo?.length;
      if (!hasContent) continue;

      html += `<div class="materia-title">${xmlEscape(materia)}</div><table class="content-table">`;
      const row = (label, val) => val ? `<tr><td class="label-cell">${xmlEscape(label)}</td><td>${xmlEscape(val).replace(/\n/g, "<br/>")}</td></tr>` : "";
      html += row("Objetivos", data.objetivos);
      html += row("Preguntas Guías", data.preguntasGuias);
      html += row("Ideas Fundamentales", data.ideasFundamentales);
      if (data.inicio || data.desarrollo || data.cierre) {
        html += `<tr><td colspan="2" class="section-header">Secuencia de Actividades</td></tr>`;
        html += row("Inicio", data.inicio);
        html += row("Desarrollo", data.desarrollo);
        html += row("Cierre", data.cierre);
      }
      html += row("Recursos", data.recursos);
      html += row("Avalúo", AVALUO_OPCIONES.map(o => (data.avaluo || []).includes(o) ? `✓ ${o}` : `☐ ${o}`).join("\n"));
      if (data.notas) html += row("Anotaciones", data.notas);
      html += `</table>`;
    }
  }

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${filename}</title><style>${styles}</style></head><body>${html}<script>window.onload=function(){window.print();}<\/script></body></html>`;
  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1.5px solid #c8e6c9", background: "#fafffe",
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#1b3a2a",
  resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5,
};

function AvaluoSelector({ selected, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {AVALUO_OPCIONES.map(op => {
        const active = selected.includes(op);
        return (
          <button key={op} onClick={() => onChange(active ? selected.filter(s => s !== op) : [...selected, op])} style={{
            padding: "3px 10px", borderRadius: 20,
            border: active ? "2px solid #1a6b3a" : "1.5px solid #c5d5c9",
            background: active ? "#1a6b3a" : "#fff",
            color: active ? "#fff" : "#4a7c5a",
            fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
          }}>{op}</button>
        );
      })}
    </div>
  );
}

function FieldRow({ label, value, onChange, plan, dia, materia }) {
  const [loading, setLoading] = useState(false);
  const handleAI = async () => {
    if (!plan.subTema) { alert("Por favor, ingresa el sub-tema primero."); return; }
    setLoading(true);
    await generateContent(plan, dia, materia, label, (v) => { onChange(v); setLoading(false); });
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
        <button onClick={handleAI} disabled={loading} style={{
          marginLeft: 8, padding: "3px 10px", borderRadius: 6, border: "none",
          background: loading ? "#a5d6a7" : "#1a6b3a", color: "#fff", fontSize: 11,
          cursor: loading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif",
        }}>{loading ? "⏳" : "✨ Sugerir"}</button>
      </div>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={inputStyle}
        onFocus={e => e.target.style.borderColor = "#1a6b3a"} onBlur={e => e.target.style.borderColor = "#c8e6c9"} />
    </div>
  );
}

function MateriaCard({ materia, data, onUpdate, plan, dia }) {
  const [open, setOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const set = key => val => onUpdate({ ...data, [key]: val });
  const filled = ["objetivos","preguntasGuias","ideasFundamentales","inicio","desarrollo","cierre","recursos"].filter(k => data[k]).length;

  const handleGenAll = async () => {
    if (!plan.subTema) { alert("Por favor, ingresa el sub-tema primero."); return; }
    setGenLoading(true);
    await generateAllForMateria(
      plan, dia, materia,
      parsed => { onUpdate({ ...data, ...parsed }); setOpen(true); },
      err => alert("Error: " + err),
    );
    setGenLoading(false);
  };

  return (
    <div style={{ borderRadius: 12, border: "1.5px solid #c8e6c9", background: "#fff", marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(26,107,58,0.06)" }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", cursor: "pointer", background: open ? "#e8f5e9" : "#f7fdf9", borderBottom: open ? "1.5px solid #c8e6c9" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a6b3a", fontFamily: "'DM Serif Display', serif" }}>{materia}</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: filled === 7 ? "#1a6b3a" : "#e8f5e9", color: filled === 7 ? "#fff" : "#4a7c5a", fontFamily: "'DM Sans', sans-serif" }}>{filled}/7</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={e => { e.stopPropagation(); handleGenAll(); }} disabled={genLoading} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: genLoading ? "#a5d6a7" : "#2e7d32", color: "#fff", fontSize: 12, cursor: genLoading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {genLoading ? "⏳ Generando..." : "✨ Generar todo"}
          </button>
          <button onClick={e => { e.stopPropagation(); if (confirm(`¿Borrar todo el contenido de "${materia}"?`)) { onUpdate(emptyMateria()); setOpen(false); } }} style={{ padding: "4px 10px", borderRadius: 6, border: "1.5px solid #ffcdd2", background: "#fff", color: "#c62828", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            🗑 Borrar
          </button>
          <span style={{ fontSize: 18, color: "#4a7c5a", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: "16px 20px" }}>
          <FieldRow label="Objetivos" value={data.objetivos} onChange={set("objetivos")} plan={plan} dia={dia} materia={materia} />
          <FieldRow label="Preguntas Guías" value={data.preguntasGuias} onChange={set("preguntasGuias")} plan={plan} dia={dia} materia={materia} />
          <FieldRow label="Ideas Fundamentales" value={data.ideasFundamentales} onChange={set("ideasFundamentales")} plan={plan} dia={dia} materia={materia} />

          {/* ── Secuencia de Actividades ── */}
          <div style={{ margin: "18px 0 14px", borderRadius: 10, border: "1.5px solid #a5d6a7", overflow: "hidden" }}>
            <div style={{ background: "#d0edda", padding: "8px 14px", borderBottom: "1.5px solid #a5d6a7" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1a6b3a", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif" }}>
                📋 Secuencia de Actividades
              </span>
            </div>
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "inicio",     label: "🟢 Inicio",      color: "#1a6b3a" },
                { key: "desarrollo", label: "🔵 Desarrollo",  color: "#1565c0" },
                { key: "cierre",     label: "🟠 Cierre",      color: "#bf360c" },
              ].map(({ key, label, color }) => (
                <div key={key}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
                    <button
                      onClick={async () => {
                        if (!plan.subTema) { alert("Por favor, ingresa el sub-tema primero."); return; }
                        const btn = document.activeElement; btn.disabled = true; btn.textContent = "⏳";
                        await generateContent(plan, dia, materia, label.replace(/^.\s/, ""), (v) => { set(key)(v); btn.disabled = false; btn.textContent = "✨ Sugerir"; });
                      }}
                      style={{ marginLeft: 8, padding: "3px 10px", borderRadius: 6, border: "none", background: "#1a6b3a", color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                    >✨ Sugerir</button>
                  </div>
                  <textarea
                    value={data[key]}
                    onChange={e => set(key)(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, borderColor: "#c8e6c9" }}
                    onFocus={e => e.target.style.borderColor = color}
                    onBlur={e => e.target.style.borderColor = "#c8e6c9"}
                  />
                </div>
              ))}
            </div>
          </div>

          <FieldRow label="Recursos (URLs, materiales)" value={data.recursos} onChange={set("recursos")} plan={plan} dia={dia} materia={materia} />
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif", display: "block", marginBottom: 6 }}>Avalúo</label>
            <AvaluoSelector selected={data.avaluo} onChange={set("avaluo")} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif", display: "block", marginBottom: 4 }}>Anotaciones</label>
            <textarea value={data.notas} onChange={e => onUpdate({ ...data, notas: e.target.value })} rows={2} style={inputStyle} />
          </div>
        </div>
      )}
    </div>
  );
}

function AsambleaBlock({ value, onChange, isLunes, onResetToLunes }) {
  return (
    <div style={{ borderRadius: 12, border: "1.5px solid #a5d6a7", background: "#f1faf3", marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(26,107,58,0.06)" }}>
      <div style={{ padding: "11px 16px", background: "#e0f2e5", borderBottom: "1.5px solid #a5d6a7", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a6b3a", fontFamily: "'DM Serif Display', serif" }}>Asamblea / Círculo</span>
        {isLunes && (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#1a6b3a", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
            Se aplica a todos los días
          </span>
        )}
        {!isLunes && (
          <button onClick={onResetToLunes}
            title="Restablecer a las preguntas del Lunes"
            style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1.5px solid #a5d6a7", background: "transparent", color: "#1a6b3a", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            ↺ Usar preguntas del Lunes
          </button>
        )}
      </div>
      <div style={{ padding: "10px 16px" }}>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={5}
          style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #c8e6c9", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#2e5c3a", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, background: "#fff", resize: "vertical", outline: "none" }}
          onFocus={e => e.target.style.borderColor = "#1a6b3a"}
          onBlur={e => e.target.style.borderColor = "#c8e6c9"}
        />
      </div>
    </div>
  );
}

function DiaTab({ dia, plan, onUpdate }) {
  const materias = MATERIAS_POR_DIA[dia].filter(m => !SKIP_MATERIAS.includes(m));
  const updateMateria = materia => updated => onUpdate({ ...plan, dias: { ...plan.dias, [dia]: { ...plan.dias[dia], [materia]: updated } } });
  const updateAsamblea = newText => {
    if (dia === "Lunes") {
      const newDias = Object.fromEntries(DIAS.map(d => [d, { ...plan.dias[d], asamblea: newText }]));
      onUpdate({ ...plan, dias: newDias });
    } else {
      onUpdate({ ...plan, dias: { ...plan.dias, [dia]: { ...plan.dias[dia], asamblea: newText } } });
    }
  };
  const resetToLunes = () => updateAsamblea(plan.dias["Lunes"].asamblea ?? ASAMBLEA_TEXT);
  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, #1a6b3a 0%, #2e7d32 100%)", borderRadius: 12, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "'DM Serif Display', serif" }}>{dia}</span>
        {MATERIAS_POR_DIA[dia].map(m => (
          <span key={m} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: SKIP_MATERIAS.includes(m) ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.9)", color: SKIP_MATERIAS.includes(m) ? "rgba(255,255,255,0.6)" : "#1a6b3a", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{m}</span>
        ))}
      </div>
      <AsambleaBlock
        value={plan.dias[dia].asamblea ?? ASAMBLEA_TEXT}
        onChange={updateAsamblea}
        isLunes={dia === "Lunes"}
        onResetToLunes={resetToLunes}
      />
      {materias.map(m => <MateriaCard key={m} materia={m} data={plan.dias[dia][m]} onUpdate={updateMateria(m)} plan={plan} dia={dia} />)}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("list");
  const [plan, setPlan] = useState(null);
  const [activeDia, setActiveDia] = useState("Lunes");
  const [savedPlans, setSavedPlans] = useState([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    loadIndex().then(idx => { setSavedPlans(idx.sort((a, b) => b.createdAt - a.createdAt)); setLoadingList(false); });
  }, []);

  const handleNew = () => {
    const lunes = getLunesOfWeek(new Date().toISOString().slice(0, 10));
    setPlan(emptyPlan(lunes));
    setActiveDia("Lunes");
    setView("edit");
  };

  const handleLoad = async id => {
    const p = await loadPlan(id);
    if (p) { setPlan(p); setActiveDia("Lunes"); setView("edit"); }
  };

  const handleDelete = async id => {
    if (!confirm("¿Eliminar esta planificación?")) return;
    await deletePlan(id);
    setSavedPlans(prev => prev.filter(p => p.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    await savePlan(plan);
    const idx = await loadIndex();
    setSavedPlans(idx.sort((a, b) => b.createdAt - a.createdAt));
    setSaving(false);
    setSaveMsg("¡Guardado! ✓");
    setTimeout(() => setSaveMsg(""), 2500);
  };

  const handleExport = async () => {
    setExporting(true);
    try { await exportDocx(plan); } catch (e) { alert("Error al exportar .docx: " + e.message); }
    setExporting(false);
  };

  const handleExportPdf = () => {
    try { exportPdf(plan); } catch (e) { alert("Error al exportar PDF: " + e.message); }
  };

  const GreenBtn = ({ onClick, disabled, children, style = {} }) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "8px 20px", borderRadius: 8, border: "none",
      background: disabled ? "#a5d6a7" : "#1a6b3a", color: "#fff",
      fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700,
      cursor: disabled ? "default" : "pointer", transition: "all 0.15s", ...style,
    }}>{children}</button>
  );

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === "list") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #f0faf4 0%, #e8f5e9 100%)", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ background: "linear-gradient(135deg, #1a6b3a 0%, #155e34 100%)", padding: "36px 40px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -30, top: -50, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", right: 80, bottom: -70, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <p style={{ color: "rgba(255,255,255,0.65)", margin: "0 0 4px", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" }}>Círculo Sembradores Caguas</p>
        <h1 style={{ color: "#fff", margin: 0, fontSize: 34, fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>Planificación Semanal</h1>
        <p style={{ color: "rgba(255,255,255,0.75)", margin: "6px 0 0", fontSize: 14 }}>
          Yeliza Collazo Díaz &nbsp;·&nbsp; Tema del año: <strong>Los deportes</strong>
        </p>
      </div>

      <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto" }}>
        <button onClick={handleNew} style={{
          width: "100%", padding: "18px",
          background: "linear-gradient(135deg, #1a6b3a, #2e7d32)",
          color: "#fff", border: "none", borderRadius: 14,
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: "0 4px 20px rgba(26,107,58,0.3)", marginBottom: 28,
        }}>+ Nueva Planificación</button>

        <h2 style={{ fontSize: 12, fontWeight: 700, color: "#4a7c5a", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
          Planificaciones Guardadas
        </h2>

        {loadingList ? (
          <p style={{ color: "#78a87e", textAlign: "center", padding: 32 }}>Cargando...</p>
        ) : savedPlans.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 24px", background: "#fff", borderRadius: 14, border: "1.5px dashed #c8e6c9" }}>
            <p style={{ fontSize: 40, margin: "0 0 8px" }}>📋</p>
            <p style={{ color: "#78a87e", margin: 0 }}>Aún no hay planificaciones guardadas.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {savedPlans.map(p => (
              <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #c8e6c9", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(26,107,58,0.06)" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: "#1a6b3a", fontSize: 15, fontFamily: "'DM Serif Display', serif" }}>{p.subTema || "Sin sub-tema"}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#78a87e" }}>Semana del {formatSemana(p.semana)}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <GreenBtn onClick={() => handleLoad(p.id)}>Editar</GreenBtn>
                  <button onClick={() => handleDelete(p.id)} style={{ padding: "7px 12px", borderRadius: 8, background: "#fff", color: "#c62828", border: "1.5px solid #ffcdd2", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── EDIT VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #f0faf4 0%, #e8f5e9 100%)", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Sticky top bar */}
      <div style={{ background: "linear-gradient(135deg, #1a6b3a 0%, #155e34 100%)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(26,107,58,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { if (confirm("¿Volver al listado? Los cambios no guardados se perderán.")) setView("list"); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, padding: "5px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            ← Mis planes
          </button>
          <span style={{ color: "rgba(255,255,255,0.9)", fontFamily: "'DM Serif Display', serif", fontSize: 16 }}>
            {plan.subTema || "Nueva Planificación"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saveMsg && <span style={{ color: "#a5d6a7", fontSize: 13, fontWeight: 600 }}>{saveMsg}</span>}
          <button onClick={() => { localStorage.removeItem("anthropic_api_key"); getApiKey(); }} title="Actualizar API key de Anthropic" style={{ padding: "7px 12px", borderRadius: 8, border: "2px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
            🔑
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "7px 18px", borderRadius: 8, border: "2px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
            {saving ? "Guardando..." : "💾 Guardar"}
          </button>
          <button onClick={handleExport} disabled={exporting} style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#fff", color: "#1a6b3a", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>
            {exporting ? "Exportando..." : "📄 .docx"}
          </button>
          <button onClick={handleExportPdf} style={{ padding: "7px 18px", borderRadius: 8, border: "2px solid rgba(255,255,255,0.5)", background: "transparent", color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700 }}>
            🖨 PDF
          </button>
        </div>
      </div>

      {/* Meta fields */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #c8e6c9", padding: "20px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          {[{ label: "Facilitadora", key: "facilitadora" }, { label: "Círculo", key: "circulo" }, { label: "Tema General", key: "tema" }].map(({ label, key }) => (
            <div key={key}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#4a7c5a", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>{label}</label>
              <input value={plan[key]} onChange={e => setPlan({ ...plan, [key]: e.target.value })} style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1.5px solid #c8e6c9", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#1b3a2a", boxSizing: "border-box", outline: "none" }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#1a6b3a", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>✦ Sub-tema de la semana</label>
            <input value={plan.subTema} onChange={e => setPlan({ ...plan, subTema: e.target.value })} placeholder="Ej: El fútbol, La natación..." style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "2px solid #1a6b3a", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#1b3a2a", boxSizing: "border-box", outline: "none", background: "#f7fdf9" }} />
          </div>
        </div>
        <div style={{ maxWidth: 900, margin: "12px auto 0", display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#4a7c5a", textTransform: "uppercase", letterSpacing: 0.5 }}>Semana del:</label>
          <input type="date" value={plan.semana} onChange={e => setPlan({ ...plan, semana: getLunesOfWeek(e.target.value) })} style={{ padding: "6px 10px", borderRadius: 7, border: "1.5px solid #c8e6c9", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#1b3a2a", outline: "none" }} />
          {plan.semana && <span style={{ fontSize: 13, color: "#4a7c5a" }}>Semana del {formatSemana(plan.semana)}</span>}
        </div>
      </div>

      {/* Day tabs */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #c8e6c9", padding: "0 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex" }}>
          {DIAS.map(dia => (
            <button key={dia} onClick={() => setActiveDia(dia)} style={{
              padding: "12px 20px", border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
              fontWeight: activeDia === dia ? 700 : 500,
              color: activeDia === dia ? "#1a6b3a" : "#78a87e",
              borderBottom: activeDia === dia ? "3px solid #1a6b3a" : "3px solid transparent",
              transition: "all 0.15s",
            }}>{dia.slice(0, 3).toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 28px" }}>
        <DiaTab dia={activeDia} plan={plan} onUpdate={setPlan} />
      </div>
    </div>
  );
}
