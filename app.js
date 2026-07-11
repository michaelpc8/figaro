import { api, DEV_USE_MOCKS } from "./api.js";

const SCANNED_STORAGE_KEY = "figaro-scanned-medications";

const ACCENT_PALETTE = [
  { accent: "#138fb7", iconBg: "#e6f5fa" },
  { accent: "#09bda8", iconBg: "#e6faf7" },
  { accent: "#9668eb", iconBg: "#f3edff" },
  { accent: "#f0a23a", iconBg: "#fff4e3" },
];

function loadScannedMedications() {
  try {
    return JSON.parse(localStorage.getItem(SCANNED_STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function persistScannedMedications() {
  const scanned = state.medications.filter((medication) => medication.scanned);
  localStorage.setItem(SCANNED_STORAGE_KEY, JSON.stringify(scanned));
}

const state = {
  screen: "medications",
  expandedMedicationId: "lisinopril",
  deleteConfirmation: null,
  reminderDeleteMode: false,
  reminderFormOpen: false,
  medications: [
    ...loadScannedMedications(),
    {
      id: "lisinopril",
      name: "Lisinopril",
      subtitle: "Lisinopril 10mg",
      accent: "#138fb7",
      iconBg: "#e6f5fa",
      current: 62,
      total: 90,
      treats: "High blood pressure (hypertension), heart failure",
      instructions:
        "Take once daily in the morning with or without food. Do not skip doses even if you feel well. Avoid potassium supplements unless directed. Monitor blood pressure regularly.",
      dosage: "10mg – 1 tablet once daily",
      lastPickup: "June 14, 2026",
    },
    {
      id: "metformin",
      name: "Metformin",
      subtitle: "Metformin HCl 500mg",
      accent: "#09bda8",
      iconBg: "#e6faf7",
      current: 118,
      total: 180,
      treats: "Type 2 diabetes",
      instructions: "Take with meals as prescribed. Contact your care team if you experience severe stomach symptoms.",
      dosage: "500mg – 1 tablet twice daily",
      lastPickup: "June 3, 2026",
    },
    {
      id: "atorvastatin",
      name: "Atorvastatin",
      subtitle: "Atorvastatin Calcium 20mg",
      accent: "#9668eb",
      iconBg: "#f3edff",
      current: 9,
      total: 30,
      treats: "High cholesterol and cardiovascular risk reduction",
      instructions: "Take once daily at the same time. Follow your clinician's instructions about food and other medicines.",
      dosage: "20mg – 1 tablet nightly",
      lastPickup: "June 28, 2026",
    },
    {
      id: "omeprazole",
      name: "Omeprazole",
      subtitle: "Omeprazole 20mg",
      accent: "#f0a23a",
      iconBg: "#fff4e3",
      current: 24,
      total: 30,
      treats: "Acid reflux and heartburn",
      instructions: "Take before a meal as directed. Swallow the capsule whole unless your pharmacist says otherwise.",
      dosage: "20mg – 1 capsule daily",
      lastPickup: "July 5, 2026",
    },
  ],
  reminders: [
    { id: "r1", medication: "Lisinopril", detail: "10mg – 1 tablet", time: "8:00 AM", period: "morning", taken: true },
    { id: "r2", medication: "Metformin", detail: "500mg – 1 tablet", time: "8:30 AM", period: "morning", taken: true },
    { id: "r3", medication: "Omeprazole", detail: "20mg – 1 capsule", time: "7:30 AM", period: "morning", taken: false },
    { id: "r4", medication: "Metformin", detail: "500mg – 1 tablet", time: "6:30 PM", period: "evening", taken: false },
    { id: "r5", medication: "Atorvastatin", detail: "20mg – 1 tablet", time: "10:00 PM", period: "night", taken: false },
  ],
  camera: {
    stream: null,
    step: 1,
    frontBlob: null,
    backBlob: null,
    busy: false,
    message: "Tap the shutter to enable your camera.",
    pendingReminderPrompt: null,
  },
  financials: {
    expandedId: null,
    cache: {},
  },
};

const screenHost = document.querySelector("#screenHost");
const toast = document.querySelector("#toast");

function icon(name, className = "") {
  return `<i data-lucide="${name}" class="${className}"></i>`;
}

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.9 } });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function formatToday() {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function ndcMatchMarkup(medication) {
  const match = medication.ndcMatch;
  const name = match.rxNormName || match.genericName || "this medication";
  const rxcui = match.rxcui ? ` (RxCUI ${match.rxcui})` : "";
  const ndc = medication.ndc ? `NDC ${medication.ndc} matched to ` : "";
  return `${ndc}${name}${rxcui}`;
}

function priceSummaryMarkup(priceInfo, drugName) {
  if (!priceInfo) return "Price comparison unavailable.";
  if (priceInfo.estimatedPrice == null) {
    return `No pricing data found for ${drugName}.` +
      (priceInfo.goodRxLink ? ` <a href="${priceInfo.goodRxLink}" target="_blank" rel="noopener">Check GoodRx</a>` : "");
  }
  if (priceInfo.cheaperAlternative) {
    return `💰 A cheaper option may be available: ${priceInfo.cheaperAlternative.name}. <a href="${priceInfo.cheaperAlternative.goodRxLink}" target="_blank" rel="noopener">See current price on GoodRx</a>`;
  }
  return `No cheaper alternative found for ${drugName}.` +
    (priceInfo.goodRxLink ? ` <a href="${priceInfo.goodRxLink}" target="_blank" rel="noopener">See current price on GoodRx</a>` : "");
}

function medicationCard(medication) {
  const expanded = state.expandedMedicationId === medication.id;
  const percentage = Math.min(100, Math.round((medication.current / medication.total) * 100));

  return `
    <article class="med-card ${expanded ? "expanded" : ""}" data-medication-id="${medication.id}">
      <button class="med-summary" type="button" aria-expanded="${expanded}">
        <span class="pill-icon" style="--accent:${medication.accent}; --icon-bg:${medication.iconBg}">
          ${icon("pill")}
        </span>
        <span class="med-main">
          <span class="med-title">${medication.name}</span>
          <span class="med-subtitle">${medication.subtitle}</span>
          <span class="med-progress-row">
            <span class="med-progress-track"><span style="width:${percentage}%; background:${medication.accent}"></span></span>
            <span class="med-count">${medication.current}/${medication.total}</span>
          </span>
        </span>
        ${icon(expanded ? "chevron-up" : "chevron-down", "chevron")}
      </button>

      ${expanded ? `
        <div class="med-details">
          <section class="detail-panel">
            <div class="detail-label">${icon("pill")} <span>TREATS</span></div>
            <p>${medication.treats}</p>
          </section>
          <section class="detail-panel">
            <div class="detail-label">${icon("stethoscope")} <span>DOCTOR INSTRUCTIONS</span></div>
            <p>${medication.instructions}</p>
          </section>
          <section class="detail-panel">
            <div class="detail-label">${icon("hash")} <span>DOSAGE</span></div>
            <p>${medication.dosage}</p>
          </section>
          ${medication.ndcMatch ? `
            <section class="detail-panel">
              <div class="detail-label">${icon("check")} <span>NDC MATCH</span></div>
              <p>${ndcMatchMarkup(medication)}</p>
            </section>
          ` : ""}
          ${medication.priceInfo ? `
            <section class="detail-panel">
              <div class="detail-label">${icon("dollar-sign")} <span>PRICE &amp; SAVINGS</span></div>
              <p>${priceSummaryMarkup(medication.priceInfo, medication.name)}</p>
            </section>
          ` : ""}
          ${medication.scanned && medication.rawText ? `
            <section class="detail-panel">
              <div class="detail-label">${icon("file-text")} <span>RAW SCANNED TEXT</span></div>
              <p>${medication.rawText.slice(0, 400).replace(/\n/g, "<br>") || "(nothing readable)"}</p>
            </section>
          ` : ""}
          <div class="detail-grid">
            <section class="detail-panel compact">
              <div class="detail-label">${icon("pill")} <span>TABLETS REMAINING</span></div>
              <p>${medication.current} of ${medication.total}</p>
            </section>
            <section class="detail-panel compact">
              <div class="detail-label">${icon("calendar-days")} <span>LAST PICKUP</span></div>
              <p>${medication.lastPickup}</p>
            </section>
          </div>
          <button class="delete-med-btn" type="button" data-delete-med-id="${medication.id}">DELETE</button>
        </div>
      ` : ""}
    </article>
  `;
}

function medicationsScreen() {
  return `
    <section class="screen medications-screen">
      <div class="screen-scroll">
        <header class="page-header">
          <h1>My Medication</h1>
          <p>${state.medications.length} active prescriptions</p>
        </header>
        <div class="med-list">
          ${state.medications.map(medicationCard).join("")}
        </div>
      </div>
    </section>
  `;
}

function remindersScreen() {
  const total = state.reminders.length;
  const taken = state.reminders.filter((item) => item.taken).length;
  const percentage = total ? Math.round((taken / total) * 100) : 0;
  const periodMeta = {
    morning: { label: "MORNING", color: "#f3a642" },
    evening: { label: "EVENING", color: "#9869e9" },
    night: { label: "NIGHT", color: "#0f2438" },
  };

  return `
    <section class="screen reminders-screen">
      <div class="screen-scroll">
        <header class="page-header reminders-header">
          <div class="reminders-title-row">
            <h1>Reminders</h1>
            <div class="reminder-actions" aria-label="Reminder actions">
              <button id="addReminderButton" type="button" aria-label="Add reminder">${icon("plus")}</button>
              <button id="removeReminderButton" class="${state.reminderDeleteMode ? "active" : ""}" type="button" aria-label="Remove reminder">${icon("minus")}</button>
            </div>
          </div>
          <p>Today – ${formatToday()}</p>
          ${state.reminderDeleteMode ? `<p class="remove-reminder-hint">Select a dose reminder to remove</p>` : ""}
        </header>

        <section class="daily-progress-card">
          <div>
            <span>Today's Progress</span>
            <strong>${taken} / ${total} doses taken</strong>
          </div>
          <span class="progress-percent">${percentage}%</span>
          <div class="daily-track"><span style="width:${percentage}%"></span></div>
        </section>

        <div class="reminder-groups">
          ${Object.entries(periodMeta).map(([period, meta]) => {
            const items = state.reminders.filter((item) => item.period === period);
            return `
              <section class="reminder-group">
                <h2><span style="background:${meta.color}"></span>${meta.label}</h2>
                <div class="reminder-list">
                  ${items.map((item) => `
                    <button class="reminder-card ${item.taken ? "taken" : ""} ${state.reminderDeleteMode ? "remove-mode" : ""}" type="button" data-reminder-id="${item.id}">
                      <span class="dose-check">${item.taken ? icon("check") : ""}</span>
                      <span class="dose-copy">
                        <strong>${item.medication}</strong>
                        <span>${item.detail}</span>
                      </span>
                      <span class="dose-time">${icon("clock-3")} ${item.time}</span>
                    </button>
                  `).join("")}
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function cameraScreen() {
  const step = state.camera.step;
  const scanningFront = step === 1;
  return `
    <section class="screen camera-screen">
      <div class="camera-top">
        <div class="brand-lockup">${icon("pill")} <span>Papa Pill</span></div>
        <h1>Scan Prescription</h1>
        <p>Patient Information Leaflet</p>
        <div class="scan-steps">
          <div class="scan-step active">
            <span>1</span>
            <div><strong>Front Side</strong><small>${step > 1 ? "Captured" : "Ready to scan"}</small></div>
          </div>
          <div class="step-line ${step > 1 ? "complete" : ""}"></div>
          <div class="scan-step ${step > 1 ? "active" : ""}">
            <span>2</span>
            <div><strong>Back Side</strong><small>${step > 1 ? "Ready to scan" : "Pending"}</small></div>
          </div>
        </div>
      </div>

      <div class="viewfinder-wrap">
        <video id="cameraVideo" class="camera-video" autoplay playsinline muted></video>
        <canvas id="captureCanvas" hidden></canvas>
        <div class="viewfinder-overlay">
          <span class="corner corner-tl"></span>
          <span class="corner corner-tr"></span>
          <span class="corner corner-bl"></span>
          <span class="corner corner-br"></span>
          <p id="cameraMessage" class="camera-message">${state.camera.message}</p>
          <p class="align-copy">Align ${scanningFront ? "Front" : "Back"} Side within frame</p>
        </div>
      </div>

      <div class="capture-area">
        <button id="uploadTriggerButton" class="upload-button" type="button" aria-label="Upload a photo instead">
          ${icon("upload")}
        </button>
        <button id="captureButton" class="capture-button ${state.camera.busy ? "busy" : ""}" type="button" aria-label="${state.camera.stream ? "Capture image" : "Enable camera"}">
          <span></span>
        </button>
        <span class="capture-spacer"></span>
        <input id="uploadInput" type="file" accept="image/*" hidden />
      </div>

      ${state.camera.pendingReminderPrompt ? `
        <div class="modal-backdrop">
          <div class="modal-card">
            <h2>Add to Reminders?</h2>
            <p><strong>${state.camera.pendingReminderPrompt.name}</strong> was added to My Meds. Want reminders set up for it too?</p>
            <div class="modal-actions">
              <button id="reminderPromptNo" class="modal-btn secondary" type="button">Not now</button>
              <button id="reminderPromptYes" class="modal-btn primary" type="button">Yes, add it</button>
            </div>
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

function formatShortDate(dateStr) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(dateStr));
}

function formatUnitPrice(value) {
  if (value == null) return "—";
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function priceLineChart(history) {
  const width = 280;
  const height = 108;
  const padLeft = 6;
  const padRight = 6;
  const padTop = 16;
  const padBottom = 20;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const prices = history.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || Math.max(maxPrice * 0.1, 0.0001);

  const points = history.map((point, index) => ({
    x: padLeft + (history.length === 1 ? plotWidth / 2 : (index / (history.length - 1)) * plotWidth),
    y: padTop + plotHeight - ((point.price - minPrice) / range) * plotHeight,
    price: point.price,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const baseline = (padTop + plotHeight).toFixed(1);
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;

  const last = points[points.length - 1];
  // The last point sits at the plot's right edge by construction, so the
  // end-label must right-anchor there — a middle anchor would run off the
  // chart's edge instead of staying inside it.
  const labelY = last.y < padTop + 12 ? last.y + 16 : Math.max(last.y - 10, 11);

  return `
    <div class="fin-chart-wrap">
      <svg class="fin-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Average acquisition price from ${formatShortDate(history[0].date)} to ${formatShortDate(history[history.length - 1].date)}">
        <line class="fin-gridline" x1="${padLeft}" y1="${baseline}" x2="${width - padRight}" y2="${baseline}" />
        <path class="fin-area" d="${areaPath}" />
        <path class="fin-line" d="${linePath}" />
        <circle class="fin-end-ring" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="6" />
        <circle class="fin-end-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" />
        <text class="fin-end-label" x="${(width - padRight).toFixed(1)}" y="${labelY}" text-anchor="end">${formatUnitPrice(last.price)}</text>
        <text class="fin-axis-label" x="${padLeft}" y="${height - 4}">${formatShortDate(history[0].date)}</text>
        <text class="fin-axis-label" x="${width - padRight}" y="${height - 4}" text-anchor="end">${formatShortDate(history[history.length - 1].date)}</text>
      </svg>
    </div>
  `;
}

function financialsDetail(cacheEntry) {
  if (!cacheEntry || cacheEntry.loading) {
    return `<div class="fin-details"><p class="fin-note">Loading pricing data…</p></div>`;
  }
  if (cacheEntry.error) {
    return `<div class="fin-details"><p class="fin-note">${cacheEntry.error}</p></div>`;
  }

  const { averagePrice, history, pricingUnit } = cacheEntry;
  return `
    <div class="fin-details">
      <div class="fin-average">
        <span>Average price per ${pricingUnit === "ML" ? "mL" : "unit"}</span>
        <strong>${formatUnitPrice(averagePrice)}</strong>
      </div>
      ${history.length > 1 ? priceLineChart(history) : `<p class="fin-note">Not enough price history to chart yet.</p>`}
      <p class="fin-note">Based on CMS NADAC pharmacy acquisition cost — not the final retail price.</p>
    </div>
  `;
}

function financialsRow(medication) {
  const expanded = state.financials.expandedId === medication.id;
  return `
    <article class="fin-card ${expanded ? "expanded" : ""}" data-fin-id="${medication.id}">
      <button class="fin-summary" type="button" aria-expanded="${expanded}">
        <span class="pill-icon" style="--accent:${medication.accent}; --icon-bg:${medication.iconBg}">${icon("pill")}</span>
        <span class="med-main">
          <span class="med-title">${medication.name}</span>
          <span class="med-subtitle">${medication.subtitle}</span>
        </span>
        ${icon(expanded ? "chevron-up" : "chevron-down", "chevron")}
      </button>
      ${expanded ? financialsDetail(state.financials.cache[medication.id]) : ""}
    </article>
  `;
}

function financialsScreen() {
  return `
    <section class="screen utility-screen">
      <div class="screen-scroll">
        <header class="page-header">
          <h1>Financials</h1>
          <p>Tap a medication to see average pricing</p>
        </header>
        <div class="fin-list">
          ${state.medications.map(financialsRow).join("")}
        </div>
      </div>
    </section>
  `;
}

function pharmacyScreen() {
  return `
    <section class="screen utility-screen pharmacy-screen">
      <div class="screen-scroll">
        <header class="page-header">
          <h1>PharmYard</h1>
        </header>
      </div>
    </section>
  `;
}

const renderers = {
  medications: medicationsScreen,
  reminders: remindersScreen,
  camera: cameraScreen,
  financials: financialsScreen,
  pharmacy: pharmacyScreen,
};

const SCREEN_ORDER = ["medications", "reminders", "camera", "financials", "pharmacy"];

function setActiveNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.screen === state.screen);
  });
  document.querySelector(".phone-screen").classList.toggle("camera-mode", state.screen === "camera");
}

function render() {
  screenHost.innerHTML = renderers[state.screen]();
  setActiveNavigation();
  bindScreenEvents();
  renderConfirmDialog();
  refreshIcons();

  if (state.screen === "camera" && state.camera.stream) {
    const video = document.querySelector("#cameraVideo");
    video.srcObject = state.camera.stream;
    document.querySelector("#cameraMessage").textContent = state.camera.busy ? state.camera.message : "";
  }
}

function bindScreenEvents() {
  document.querySelectorAll(".med-summary").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest(".med-card").dataset.medicationId;
      state.expandedMedicationId = state.expandedMedicationId === id ? null : id;
      render();
    });
  });

  document.querySelectorAll(".reminder-card").forEach((button) => {
    button.addEventListener("click", async () => {
      const reminder = state.reminders.find((item) => item.id === button.dataset.reminderId);
      if (!reminder) return;

      if (state.reminderDeleteMode) {
        state.deleteConfirmation = { type: "reminder", id: reminder.id, name: reminder.medication };
        render();
        return;
      }

      reminder.taken = !reminder.taken;
      render();

      if (!DEV_USE_MOCKS) {
        try {
          await api.updateReminder(reminder.id, reminder.taken);
        } catch (error) {
          reminder.taken = !reminder.taken;
          render();
          showToast(error.message);
        }
      }
    });
  });

  document.querySelector("#addReminderButton")?.addEventListener("click", () => {
    state.reminderDeleteMode = false;
    state.reminderFormOpen = true;
    render();
  });

  document.querySelector("#removeReminderButton")?.addEventListener("click", () => {
    state.reminderDeleteMode = !state.reminderDeleteMode;
    render();
  });

  document.querySelectorAll(".delete-med-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.deleteMedId;
      const medication = state.medications.find((item) => item.id === id);
      if (!medication) return;
      state.deleteConfirmation = { id: medication.id, name: medication.name };
      render();
    });
  });

  document.querySelector("#captureButton")?.addEventListener("click", handleCameraButton);

  document.querySelector("#uploadTriggerButton")?.addEventListener("click", () => {
    document.querySelector("#uploadInput")?.click();
  });

  document.querySelector("#uploadInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleCapturedBlob(file);
  });

  document.querySelector("#reminderPromptYes")?.addEventListener("click", () => respondToReminderPrompt(true));
  document.querySelector("#reminderPromptNo")?.addEventListener("click", () => respondToReminderPrompt(false));

  document.querySelectorAll(".fin-summary").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest(".fin-card").dataset.finId;
      toggleFinancialsRow(id);
    });
  });
}

async function toggleFinancialsRow(id) {
  if (state.financials.expandedId === id) {
    state.financials.expandedId = null;
    render();
    return;
  }

  state.financials.expandedId = id;
  render();

  if (state.financials.cache[id]) return;

  const medication = state.medications.find((item) => item.id === id);
  if (!medication) return;

  state.financials.cache[id] = { loading: true, error: null, averagePrice: null, history: [] };
  render();

  try {
    const [priceResult, historyResult] = await Promise.all([
      api.comparePrice({
        drugName: medication.name,
        ndc: medication.ndc || "",
        quantity: "1 tablet",
        paidCost: "",
      }),
      api.getPriceHistory({
        drugName: medication.name,
        ndc: medication.ndc || "",
      }),
    ]);

    const history = historyResult.history || [];
    state.financials.cache[id] = {
      loading: false,
      error: priceResult.estimatedPrice == null && !history.length
        ? "No CMS pricing data found for this medication."
        : null,
      averagePrice: priceResult.estimatedPrice,
      history,
      pricingUnit: priceResult.pricingUnit || historyResult.pricingUnit || "EA",
    };
  } catch (error) {
    state.financials.cache[id] = { loading: false, error: error.message, averagePrice: null, history: [] };
  }
  render();
}

function renderConfirmDialog() {
  const dialog = document.querySelector("#confirmDialog");
  if (!dialog) return;

  if (!state.deleteConfirmation && !state.reminderFormOpen) {
    dialog.innerHTML = "";
    dialog.classList.add("hidden");
    dialog.setAttribute("aria-hidden", "true");
    return;
  }

  if (state.reminderFormOpen) {
    const hasMedications = state.medications.length > 0;
    dialog.innerHTML = `
      <form id="reminderForm" class="confirm-panel reminder-form" role="dialog" aria-labelledby="reminderFormTitle">
        <h2 id="reminderFormTitle">Add dose reminder</h2>
        ${hasMedications ? "" : `<p class="reminder-form-empty">Add a medication to My Meds before creating a reminder.</p>`}
        <label>Medication
          <select id="reminderMedication" required ${hasMedications ? "" : "disabled"}>
            ${hasMedications
              ? state.medications.map((medication) => `<option value="${medication.id}">${medication.name}</option>`).join("")
              : `<option>No medications available</option>`}
          </select>
        </label>
        <label>Time <input id="reminderTime" type="time" value="08:00" required></label>
        <label>Time of day
          <select id="reminderPeriod">
            <option value="morning">Morning</option>
            <option value="evening">Evening</option>
            <option value="night">Night</option>
          </select>
        </label>
        <div class="confirm-actions">
          <button class="confirm-yes" type="submit" ${hasMedications ? "" : "disabled"}>Add</button>
          <button id="cancelReminder" class="confirm-no" type="button">Cancel</button>
        </div>
      </form>
    `;
    dialog.classList.remove("hidden");
    dialog.setAttribute("aria-hidden", "false");
    bindReminderFormEvents();
    return;
  }

  const deletingReminder = state.deleteConfirmation.type === "reminder";

  dialog.innerHTML = `
    <div class="confirm-panel" role="alertdialog" aria-labelledby="confirmTitle" aria-describedby="confirmText">
      <h2 id="confirmTitle">Delete ${deletingReminder ? "dose reminder" : "medication"}?</h2>
      <p id="confirmText">Are you sure you want to delete ${state.deleteConfirmation.name}${deletingReminder ? " dose reminder" : ""}?</p>
      <div class="confirm-actions">
        <button id="confirmYes" class="confirm-yes" type="button">Yes</button>
        <button id="confirmNo" class="confirm-no" type="button">No</button>
      </div>
    </div>
  `;
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  bindConfirmEvents();
}

function bindConfirmEvents() {
  document.querySelector("#confirmYes")?.addEventListener("click", () => {
    const id = state.deleteConfirmation?.id;
    if (!id) return;
    if (state.deleteConfirmation.type === "reminder") {
      state.reminders = state.reminders.filter((reminder) => reminder.id !== id);
      state.reminderDeleteMode = false;
    } else {
      state.medications = state.medications.filter((medication) => medication.id !== id);
      if (state.expandedMedicationId === id) state.expandedMedicationId = null;
      persistScannedMedications();
    }
    state.deleteConfirmation = null;
    render();
  });

  document.querySelector("#confirmNo")?.addEventListener("click", () => {
    if (state.deleteConfirmation?.type === "reminder") {
      state.reminderDeleteMode = false;
    }
    state.deleteConfirmation = null;
    render();
  });
}

function bindReminderFormEvents() {
  document.querySelector("#cancelReminder")?.addEventListener("click", () => {
    state.reminderFormOpen = false;
    render();
  });

  document.querySelector("#reminderForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const medication = state.medications.find((item) => item.id === document.querySelector("#reminderMedication").value);
    const timeValue = document.querySelector("#reminderTime").value;
    if (!medication || !timeValue) return;
    const [hours, minutes] = timeValue.split(":").map(Number);
    const displayTime = `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
    state.reminders.push({
      id: `reminder-${Date.now()}`,
      medication: medication.name,
      detail: medication.dosage || medication.subtitle || "As directed",
      time: displayTime,
      period: document.querySelector("#reminderPeriod").value,
      taken: false,
    });
    state.reminderFormOpen = false;
    render();
    showToast(`${medication.name} reminder added.`);
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    state.camera.message = "Camera is unavailable in this browser.";
    render();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    state.camera.stream = stream;
    state.camera.message = "";
    render();
  } catch (error) {
    const reasons = {
      NotAllowedError: "Camera access denied. Allow camera permission for this site and try again.",
      NotFoundError: "No camera found on this device.",
      NotReadableError: "Camera is already in use by another app or browser tab. Close it and try again.",
      OverconstrainedError: "Camera doesn't support the requested settings.",
      SecurityError: "Camera requires HTTPS or localhost — this page isn't served securely.",
    };
    state.camera.message = reasons[error.name] || `Camera error: ${error.name || error.message}`;
    render();
  }
}

function captureFrame() {
  const video = document.querySelector("#cameraVideo");
  const canvas = document.querySelector("#captureCanvas");
  if (!video?.videoWidth) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

function fallbackName(scan) {
  if (scan.match?.rxNormName) return scan.match.rxNormName;
  if (scan.match?.genericName) return scan.match.genericName;
  if (scan.ndc) return `NDC ${scan.ndc} (not found in RxNorm)`;
  return "No NDC detected in scan";
}

// RxNorm's matched name is authoritative government data; raw OCR digits are
// not. Prefer whatever strength RxNorm reports once we have a match, since a
// misread OCR digit (e.g. 15mg read as 16mg) shouldn't override a real match.
function resolvedStrength(scan) {
  const rxNormName = scan.match?.rxNormName || scan.match?.genericName || "";
  const fromRxNorm = rxNormName.match(/\d+(\.\d+)?\s*(MG|MCG|G|ML|%)\b/i);
  return fromRxNorm ? fromRxNorm[0] : scan.strength;
}

function buildMedicationFromScan(scan) {
  const palette = ACCENT_PALETTE[state.medications.length % ACCENT_PALETTE.length];
  const name = fallbackName(scan);
  const strength = resolvedStrength(scan);
  const quantity = scan.quantity || scan.priceInfo?.unitCount || 30;
  const dosagePieces = [strength, scan.dose, scan.frequency].filter(Boolean);

  return {
    id: crypto.randomUUID(),
    scanned: true,
    name,
    subtitle: [strength, scan.dose].filter(Boolean).join(" ") || "Scanned from label",
    accent: palette.accent,
    iconBg: palette.iconBg,
    current: quantity,
    total: quantity,
    treats: "Not available from label scan yet",
    instructions: scan.instructions || "Not detected — check the printed leaflet",
    dosage: dosagePieces.length ? dosagePieces.join(" – ") : "Not detected",
    lastPickup: formatToday(),
    ndc: scan.ndc || "",
    ndcMatch: scan.match,
    priceInfo: scan.priceInfo,
    rawText: scan.rawText || "",
    frequency: scan.frequency || "",
  };
}

const FREQUENCY_SCHEDULES = {
  "Once daily": [{ time: "8:00 AM", period: "morning" }],
  "Twice daily": [
    { time: "8:00 AM", period: "morning" },
    { time: "6:30 PM", period: "evening" },
  ],
  "Three times daily": [
    { time: "8:00 AM", period: "morning" },
    { time: "1:00 PM", period: "evening" },
    { time: "10:00 PM", period: "night" },
  ],
};

function buildRemindersForMedication(medication) {
  const schedule = FREQUENCY_SCHEDULES[medication.frequency] || [{ time: "8:00 AM", period: "morning" }];
  const detail = [medication.subtitle].filter(Boolean).join(" ") || "As directed";
  return schedule.map((slot, index) => ({
    id: `${medication.id}-r${index}`,
    medication: medication.name,
    detail,
    time: slot.time,
    period: slot.period,
    taken: false,
  }));
}

async function handleCameraButton() {
  if (state.camera.busy) return;
  if (!state.camera.stream) {
    await startCamera();
    return;
  }

  const blob = await captureFrame();
  if (!blob) {
    showToast("The camera is still loading.");
    return;
  }

  await handleCapturedBlob(blob);
}

async function handleCapturedBlob(blob) {
  if (state.camera.busy) {
    showToast("Still processing the last scan — hang tight.");
    return;
  }

  if (state.camera.step === 1) {
    state.camera.frontBlob = blob;
    state.camera.step = 2;
    render();
    showToast("Front side captured. Now scan the back side.");
    return;
  }

  state.camera.backBlob = blob;
  state.camera.busy = true;
  state.camera.message = "Reading label and checking prices…";
  render();

  try {
    const scan = await api.scanPrescription(state.camera.frontBlob, state.camera.backBlob);
    const medication = buildMedicationFromScan(scan);
    state.medications.unshift(medication);
    persistScannedMedications();
    state.camera.busy = false;
    state.camera.step = 1;
    state.camera.frontBlob = null;
    state.camera.backBlob = null;
    state.camera.message = "Tap the shutter to enable your camera.";
    state.camera.pendingReminderPrompt = medication;
    render();
  } catch (error) {
    state.camera.busy = false;
    state.camera.message = "";
    render();
    showToast(error.message || "Scan failed. Try again with a clearer photo.");
  }
}

function respondToReminderPrompt(addReminders) {
  const medication = state.camera.pendingReminderPrompt;
  if (!medication) return;
  state.camera.pendingReminderPrompt = null;

  if (addReminders) {
    state.reminders.unshift(...buildRemindersForMedication(medication));
  }

  state.expandedMedicationId = medication.id;
  stopCamera();
  navigateToScreen("medications");
  showToast(`${medication.name} added to My Meds${addReminders ? " and Reminders" : ""}.`);
}

function stopCamera() {
  state.camera.stream?.getTracks().forEach((track) => track.stop());
  state.camera.stream = null;
}

// Slides the outgoing screen out and the new one in, direction following the
// nav bar's left-to-right order, so switching tabs reads like a phone swipe
// instead of an instant content swap.
function navigateToScreen(nextScreen) {
  if (nextScreen === state.screen) return;
  if (nextScreen !== "camera" && state.screen === "camera") stopCamera();

  const reverse = SCREEN_ORDER.indexOf(nextScreen) < SCREEN_ORDER.indexOf(state.screen);
  const outgoingEl = screenHost.firstElementChild;
  const outgoingClone = outgoingEl ? outgoingEl.cloneNode(true) : null;

  state.screen = nextScreen;
  render();

  const incomingEl = screenHost.firstElementChild;
  if (incomingEl) {
    incomingEl.classList.add("screen-slide-enter", reverse ? "reverse" : "forward");
    incomingEl.addEventListener(
      "animationend",
      () => incomingEl.classList.remove("screen-slide-enter", "reverse", "forward"),
      { once: true }
    );
  }

  if (outgoingClone) {
    outgoingClone.classList.add("screen-slide-exit", reverse ? "reverse" : "forward");
    screenHost.appendChild(outgoingClone);
    outgoingClone.addEventListener("animationend", () => outgoingClone.remove(), { once: true });
  }
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => navigateToScreen(button.dataset.screen));
});

window.addEventListener("beforeunload", stopCamera);

async function loadBackendData() {
  if (DEV_USE_MOCKS) return;
  try {
    const [medications, reminders] = await Promise.all([
      api.getMedications(),
      api.getTodayReminders(),
    ]);
    state.medications = medications;
    state.reminders = reminders;
    render();
  } catch (error) {
    showToast(`Backend unavailable: ${error.message}`);
  }
}

render();
loadBackendData();
