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

function updateClock() {
  document.querySelector("#statusTime").textContent = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
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
  const percentage = Math.round((taken / total) * 100);
  const periodMeta = {
    morning: { label: "MORNING", color: "#f3a642" },
    evening: { label: "EVENING", color: "#9869e9" },
    night: { label: "NIGHT", color: "#0f2438" },
  };

  return `
    <section class="screen reminders-screen">
      <div class="screen-scroll">
        <header class="page-header reminders-header">
          <h1>Reminders</h1>
          <p>Today – ${formatToday()}</p>
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
                    <button class="reminder-card ${item.taken ? "taken" : ""}" type="button" data-reminder-id="${item.id}">
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
        <button id="captureButton" class="capture-button ${state.camera.busy ? "busy" : ""}" type="button" aria-label="${state.camera.stream ? "Capture image" : "Enable camera"}">
          <span></span>
        </button>
      </div>
    </section>
  `;
}

function financialsScreen() {
  return `
    <section class="screen utility-screen">
      <div class="screen-scroll">
        <header class="page-header">
          <h1>Financials</h1>
          <p>Medication costs and savings</p>
        </header>
        <section class="feature-card hero-feature">
          <span class="feature-icon">${icon("wallet-cards")}</span>
          <div><small>Estimated monthly cost</small><strong>$42.80</strong></div>
        </section>
        <section class="feature-card">
          <h2>Backend connection</h2>
          <p>Connect <code>GET /api/financials/summary</code> to display insurance, coupon, and out-of-pocket comparisons here.</p>
        </section>
      </div>
    </section>
  `;
}

function pharmacyScreen() {
  return `
    <section class="screen utility-screen">
      <div class="screen-scroll">
        <header class="page-header">
          <h1>PharmYard</h1>
          <p>Your prescription pickup hub</p>
        </header>
        <section class="feature-card hero-feature pharmacy-feature">
          <span class="feature-icon">${icon("store")}</span>
          <div><small>Closest pickup spot</small><strong>1.2 miles away</strong></div>
        </section>
        <section class="feature-card pharmacy-detail">
          <h2>What you can do here</h2>
          <ul class="pharmacy-list">
            <li>Compare nearby pickup options</li>
            <li>Check refill and price availability</li>
            <li>Save the best option for later</li>
          </ul>
        </section>
        <section class="feature-card">
          <h2>Backend connection</h2>
          <p>Connect <code>GET /api/pharmacies/nearby</code> to populate live pharmacy locations, prices, and pickup availability.</p>
        </section>
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

  document.querySelector("#captureButton")?.addEventListener("click", handleCameraButton);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    state.camera.message = "Camera is unavailable in this browser.";
    render();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    state.camera.stream = stream;
    state.camera.message = "";
    render();
  } catch (error) {
    state.camera.message = "Camera access denied. Allow camera permission and try again.";
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

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

function buildMedicationFromScan(scan) {
  const palette = ACCENT_PALETTE[state.medications.length % ACCENT_PALETTE.length];
  const name = scan.match?.rxNormName || scan.match?.genericName || "Medication from label";
  const quantity = scan.quantity || scan.priceInfo?.unitCount || 30;
  const dosagePieces = [scan.strength, scan.dose, scan.frequency].filter(Boolean);

  return {
    id: crypto.randomUUID(),
    scanned: true,
    name,
    subtitle: [scan.strength, scan.dose].filter(Boolean).join(" ") || "Scanned from label",
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
  };
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
    state.expandedMedicationId = medication.id;
    state.screen = "medications";
    stopCamera();
    resetCameraScan();
    showToast(
      medication.priceInfo?.cheaperAlternative
        ? `${medication.name} scanned — cheaper option available!`
        : `${medication.name} scanned successfully.`
    );
  } catch (error) {
    state.camera.busy = false;
    state.camera.message = "";
    render();
    showToast(error.message || "Scan failed. Try again with a clearer photo.");
  }
}

function resetCameraScan() {
  state.camera.step = 1;
  state.camera.frontBlob = null;
  state.camera.backBlob = null;
  state.camera.busy = false;
  state.camera.message = "Tap the shutter to enable your camera.";
  render();
}

function stopCamera() {
  state.camera.stream?.getTracks().forEach((track) => track.stop());
  state.camera.stream = null;
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.screen !== "camera" && state.screen === "camera") stopCamera();
    state.screen = button.dataset.screen;
    render();
  });
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

updateClock();
setInterval(updateClock, 30_000);
render();
loadBackendData();
