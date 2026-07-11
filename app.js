const STORAGE_KEY = "figaro-medications";

const sampleFrontText = `Front label: Amoxicillin 500mg.
Take 1 tablet twice daily by mouth.
NDC: 12345-6789-01
Cost: $14.99`;

const sampleBackText = `Back label: Take by mouth with food.
This claim was submitted to insurance.
Patient instructions: take as directed.`;

const frontImageInput = document.getElementById("frontImageInput");
const backImageInput = document.getElementById("backImageInput");
const frontPreview = document.getElementById("frontPreview");
const backPreview = document.getElementById("backPreview");
const frontText = document.getElementById("frontText");
const backText = document.getElementById("backText");
const medName = document.getElementById("medName");
const strength = document.getElementById("strength");
const dose = document.getElementById("dose");
const frequency = document.getElementById("frequency");
const ndc = document.getElementById("ndc");
const cost = document.getElementById("cost");
const instructions = document.getElementById("instructions");
const insuranceUsed = document.getElementById("insuranceUsed");
const notes = document.getElementById("notes");
const saveBtn = document.getElementById("saveBtn");
const sampleBtn = document.getElementById("sampleBtn");
const recordList = document.getElementById("recordList");
const countBadge = document.getElementById("countBadge");

function parseFrequency(text) {
  const normalized = text.toLowerCase();

  if (/(twice|2 times|bid).*(day|daily)/.test(normalized) || /every 12 hours/.test(normalized)) {
    return { label: "Twice daily", value: 2, intervalHours: 12 };
  }

  if (/(once|1 time|qd).*(day|daily)/.test(normalized) || /every 24 hours/.test(normalized)) {
    return { label: "Once daily", value: 1, intervalHours: 24 };
  }

  if (/(three|3 times).*(day|daily)/.test(normalized) || /every 8 hours/.test(normalized)) {
    return { label: "Three times daily", value: 3, intervalHours: 8 };
  }

  return { label: "Needs review", value: null, intervalHours: null };
}

function parseStrength(text) {
  const match = text.match(/\b\d+\s*(?:mg|mcg|g|ml|tablet|capsule|pill)\b/i);
  return match ? match[0] : "";
}

function parseDose(text) {
  const match = text.match(/\btake\s+(\d+\s*(?:tablet|capsule|pill|ml|mL|drop|spray|puff)s?)\b/i);
  if (match) return match[1];
  const fallback = text.match(/\b\d+\s*(?:tablet|capsule|pill|ml|mL|drop|spray|puff)\b/i);
  return fallback ? fallback[0] : "";
}

function parseInstructions(text) {
  const lowered = text.toLowerCase();
  if (/take by mouth/.test(lowered)) return "Take by mouth";
  if (/take with food/.test(lowered)) return "Take with food";
  if (/as directed/.test(lowered)) return "Take as directed";
  if (/take .* daily/.test(lowered)) return "Take daily";
  return "";
}

function parseCost(text) {
  const match = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  return match ? `$${match[1]}` : "";
}

function parseInsurance(text) {
  const lowered = text.toLowerCase();
  const patterns = [
    /run through insurance/,
    /submitted to (?:insurance|insurer)/,
    /processed (?:through|by) (?:insurance|insurer)/,
    /insurance (?:claim|coverage|processed|submitted)/,
    /copay/,
    /rx billed to insurance/,
    /bill(?:ed)? to insurance/
  ];
  return patterns.some((p) => p.test(lowered));
}

function parseMedication(frontValue, backValue) {
  const combinedText = `${frontValue}\n${backValue}`.trim();
  const frequencyInfo = parseFrequency(combinedText);
  const detectedNdc = parseNdc(combinedText);

  return {
    medicationName: /amoxicillin/i.test(combinedText) ? "Amoxicillin" : "Medication from label",
    strength: parseStrength(combinedText),
    dose: parseDose(combinedText),
    frequency: frequencyInfo.label,
    frequencyValue: frequencyInfo.value,
    intervalHours: frequencyInfo.intervalHours,
    instructions: parseInstructions(combinedText),
    ndc: detectedNdc,
    cost: parseCost(combinedText),
    insuranceUsed: parseInsurance(combinedText),
    notes: backValue ? "Front and back label data captured" : "Parsed from placeholder OCR"
  };
}

function populateFormFromText() {
  const parsed = parseMedication(frontText.value, backText.value);
  medName.value = parsed.medicationName;
  strength.value = parsed.strength;
  dose.value = parsed.dose;
  frequency.value = parsed.frequency;
  ndc.value = parsed.ndc;
  cost.value = parsed.cost;
  instructions.value = parsed.instructions;
  insuranceUsed.checked = parsed.insuranceUsed;
  notes.value = parsed.notes;
}

function handleImageUpload(input, preview, targetText, sampleTextValue) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    preview.src = event.target.result;
    preview.style.display = "block";
    targetText.value = `Placeholder OCR for ${file.name}: ${sampleTextValue}`;
    populateFormFromText();
  };
  reader.readAsDataURL(file);
}

function saveMedication() {
  const record = {
    id: crypto.randomUUID(),
    medicationName: medName.value || "Medication",
    strength: strength.value || "",
    dose: dose.value || "",
    frequency: frequency.value || "Needs review",
    instructions: instructions.value || "",
    ndc: ndc.value || "",
    cost: cost.value || "",
    insuranceUsed: insuranceUsed.checked,
    notes: notes.value || "",
    frontText: frontText.value || "",
    backText: backText.value || "",
    frontImageName: frontImageInput.files?.[0]?.name || "",
    backImageName: backImageInput.files?.[0]?.name || "",
    source: "Placeholder OCR flow",
    createdAt: new Date().toLocaleString()
  };

  const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  records.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  renderRecords();
  clearForm();
}

function clearForm() {
  medName.value = "";
  strength.value = "";
  dose.value = "";
  frequency.value = "";
  instructions.value = "";
  ndc.value = "";
  cost.value = "";
  insuranceUsed.checked = false;
  notes.value = "";
  frontText.value = "";
  backText.value = "";
  frontImageInput.value = "";
  backImageInput.value = "";
  frontPreview.style.display = "none";
  backPreview.style.display = "none";
}

function renderRecords() {
  const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  countBadge.textContent = `${records.length} saved`;

  if (!records.length) {
    recordList.innerHTML = '<p class="empty-state">No medications saved yet.</p>';
    return;
  }

  recordList.innerHTML = records
    .map(
      (record) => `
        <article class="record-card">
          <h3>${record.medicationName}</h3>
          <p><strong>Strength:</strong> ${record.strength || "—"}</p>
          <p><strong>Dose:</strong> ${record.dose || "—"}</p>
          <p><strong>Frequency:</strong> ${record.frequency}</p>
          <p><strong>Instructions:</strong> ${record.instructions || "—"}</p>
          <p><strong>NDC:</strong> ${record.ndc || "Not detected"}</p>
          <p><strong>Cost:</strong> ${record.cost || "—"}</p>
          <p><strong>Insurance:</strong> ${record.insuranceUsed ? "Yes" : "No"}</p>
          <p><strong>Front OCR:</strong> ${record.frontText ? record.frontText.slice(0, 80) + (record.frontText.length > 80 ? "..." : "") : "—"}</p>
          <p><strong>Back OCR:</strong> ${record.backText ? record.backText.slice(0, 80) + (record.backText.length > 80 ? "..." : "") : "—"}</p>
          <p><strong>Saved:</strong> ${record.createdAt}</p>
        </article>
      `
    )
    .join("");
}

frontImageInput.addEventListener("change", () => {
  handleImageUpload(frontImageInput, frontPreview, frontText, sampleFrontText);
});

backImageInput.addEventListener("change", () => {
  handleImageUpload(backImageInput, backPreview, backText, sampleBackText);
});

sampleBtn.addEventListener("click", () => {
  frontText.value = sampleFrontText;
  backText.value = sampleBackText;
  populateFormFromText();
  frontPreview.style.display = "none";
  backPreview.style.display = "none";
});

saveBtn.addEventListener("click", saveMedication);

[frontText, backText].forEach((element) => {
  element.addEventListener("input", populateFormFromText);
});

renderRecords();
