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
const quantity = document.getElementById("quantity");
const instructions = document.getElementById("instructions");
const insuranceUsed = document.getElementById("insuranceUsed");
const notes = document.getElementById("notes");
const ndcLookupBtn = document.getElementById("ndcLookupBtn");
const priceCompareBtn = document.getElementById("priceCompareBtn");
const lookupStatus = document.getElementById("lookupStatus");
const priceSummary = document.getElementById("priceSummary");
const saveBtn = document.getElementById("saveBtn");
const sampleBtn = document.getElementById("sampleBtn");
const recordList = document.getElementById("recordList");
const countBadge = document.getElementById("countBadge");

let currentLookup = null;
let currentPriceCompare = null;

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

function parseNdc(text) {
  const match = text.match(/(\d{4,5}-\d{3,4}-\d{2})|(\d{10,11})/g);
  if (!match) return "";
  const normalized = match[0].replace(/[^\d]/g, '');
  if (normalized.length === 10 || normalized.length === 11) {
    return match[0];
  }
  return "";
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

function parseQuantity(text) {
  const lowered = text.toLowerCase();
  const qtyMatch = lowered.match(/(?:quantity|qty|dispensed)\s*[:\-]?\s*(\d+)\b/);
  if (qtyMatch) return qtyMatch[1];

  const dayMatch = lowered.match(/(\d+)\s*day(?:s)?\s*(?:supply)?/);
  if (dayMatch) return `${dayMatch[1]}-day supply`;

  const countMatch = lowered.match(/(\d+)\s*(?:tablet|capsule|pill|tab|cap)s?\b/);
  if (countMatch) return `${countMatch[1]} tablets`;

  return "";
}

function parseCost(text) {
  const match = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  return match ? `$${match[1]}` : "";
}

function normalizeCost(text) {
  const value = Number(String(text).replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function setLookupStatus(message, type = "info") {
  lookupStatus.textContent = message;
  lookupStatus.style.backgroundColor = type === "error" ? "#fee2e2" : "#eef2ff";
  lookupStatus.style.color = type === "error" ? "#991b1b" : "#1e293b";
}

function setPriceSummary(message, linkHtml = "") {
  priceSummary.innerHTML = `${message}${linkHtml ? ` <span>${linkHtml}</span>` : ""}`;
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
    quantity: parseQuantity(combinedText),
    insuranceUsed: parseInsurance(combinedText),
    notes: backValue ? "Front and back label data captured" : "Parsed from placeholder OCR"
  };
}

async function lookupNdc() {
  const rawNdc = ndc.value.trim();
  if (!rawNdc) {
    setLookupStatus('Enter the NDC from the label before matching.', 'error');
    return;
  }

  setLookupStatus('Looking up NDC in RxNorm...', 'info');
  priceSummary.textContent = '';

  try {
    const response = await fetch('/api/ndc-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ndc: rawNdc })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'NDC lookup failed');
    }

    currentLookup = data;
    medName.value = data.rxNormName || data.genericName || medName.value;
    ndc.value = data.ndc || ndc.value;
    currentLookup.genericName = data.genericName || data.rxNormName || medName.value;

    const label = data.locked ? 'Matched' : 'Partial match';
    const properties = [data.rxNormName || data.genericName, data.rxcui ? `RxCUI: ${data.rxcui}` : null]
      .filter(Boolean)
      .join(' · ');

    setLookupStatus(`${label}: ${properties}`, data.locked ? 'info' : 'warning');
  } catch (error) {
    setLookupStatus(error.message, 'error');
  }
}

async function comparePrice() {
  const drugName = medName.value.trim();
  const paidAmount = normalizeCost(cost.value);
  const quantityValue = quantity.value.trim();

  if (!drugName) {
    setPriceSummary('Enter a medication name before comparing price.');
    return;
  }

  if (paidAmount === null) {
    setPriceSummary('Enter a valid paid cost amount before comparing price.');
    return;
  }

  setPriceSummary('Comparing prices...', '');

  try {
    const response = await fetch('/api/price-compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drugName,
        genericName: currentLookup?.genericName || '',
        ndc: ndc.value.trim(),
        quantity: quantityValue,
        paidCost: paidAmount
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Price comparison failed');
    }

    currentPriceCompare = result;

    if (result.quantityDefaulted && result.unitCount) {
      quantity.value = `${result.unitCount} tablets (assumed)`;
    }

    if (result.estimatedPrice == null) {
      setPriceSummary('No pricing data found for this medication.',
        result.goodRxLink ? `<a href="${result.goodRxLink}" target="_blank" rel="noopener">Check GoodRx</a>` : '');
      return;
    }

    if (result.cheaperAlternative) {
      setPriceSummary(
        `💰 A cheaper option may be available: ${result.cheaperAlternative.name}.`,
        `<a href="${result.cheaperAlternative.goodRxLink}" target="_blank" rel="noopener">See current price on GoodRx</a>`
      );
    } else if (result.goodRxLink) {
      setPriceSummary(
        `No cheaper alternative found for ${drugName}.`,
        `<a href="${result.goodRxLink}" target="_blank" rel="noopener">See current price on GoodRx</a>`
      );
    } else {
      setPriceSummary(`No cheaper alternative found for ${drugName}.`, '');
    }
  } catch (error) {
    setPriceSummary(error.message, '');
  }
}

function populateFormFromText() {
  const parsed = parseMedication(frontText.value, backText.value);
  medName.value = parsed.medicationName;
  strength.value = parsed.strength;
  dose.value = parsed.dose;
  frequency.value = parsed.frequency;
  ndc.value = parsed.ndc;
  cost.value = parsed.cost;
  quantity.value = parsed.quantity;
  instructions.value = parsed.instructions;
  insuranceUsed.checked = parsed.insuranceUsed;
  notes.value = parsed.notes;
}

async function handleImageUpload(input, preview, targetText) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    preview.src = event.target.result;
    preview.style.display = "block";
  };
  reader.readAsDataURL(file);

  targetText.value = "Scanning label...";
  try {
    const { data } = await Tesseract.recognize(file, "eng");
    targetText.value = data.text.trim() || "No text detected. Try a clearer, well-lit photo.";
  } catch (error) {
    console.error("OCR failed", error);
    targetText.value = "OCR failed to read this image. Try again with a clearer photo.";
  }
  populateFormFromText();
}

function saveMedication() {
  const record = {
    id: crypto.randomUUID(),
    medicationName: medName.value || "Medication",
    rxNormName: currentLookup?.rxNormName || "",
    rxcui: currentLookup?.rxcui || "",
    matchedByNdc: Boolean(currentLookup?.locked),
    strength: strength.value || "",
    dose: dose.value || "",
    frequency: frequency.value || "Needs review",
    quantity: quantity.value || "",
    instructions: instructions.value || "",
    ndc: ndc.value || "",
    cost: cost.value || "",
    insuranceUsed: insuranceUsed.checked,
    notes: notes.value || "",
    priceComparison: priceSummary.textContent || "",
    goodRxLink: currentPriceCompare?.goodRxLink || "",
    cheaperAlternativeName: currentPriceCompare?.cheaperAlternative?.name || "",
    cheaperAlternativeLink: currentPriceCompare?.cheaperAlternative?.goodRxLink || "",
    frontText: frontText.value || "",
    backText: backText.value || "",
    frontImageName: frontImageInput.files?.[0]?.name || "",
    backImageName: backImageInput.files?.[0]?.name || "",
    source: "Tesseract OCR",
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
          <p><strong>RxNorm:</strong> ${record.rxNormName || "—"} ${record.rxcui ? `(${record.rxcui})` : ""}</p>
          <p><strong>Strength:</strong> ${record.strength || "—"}</p>
          <p><strong>Dose:</strong> ${record.dose || "—"}</p>
          <p><strong>Frequency:</strong> ${record.frequency}</p>
          <p><strong>Instructions:</strong> ${record.instructions || "—"}</p>
          <p><strong>NDC:</strong> ${record.ndc || "Not detected"}</p>
          <p><strong>Cost:</strong> ${record.cost || "—"}</p>
          ${record.quantity ? `<p><strong>Quantity/supply:</strong> ${record.quantity}</p>` : ""}
          <p><strong>Price summary:</strong> ${record.priceComparison || "—"}</p>
          ${record.cheaperAlternativeName
            ? `<p><strong>Cheaper option:</strong> ${record.cheaperAlternativeName} — <a href="${record.cheaperAlternativeLink}" target="_blank" rel="noopener">see current price on GoodRx</a></p>`
            : record.goodRxLink
            ? `<p><a href="${record.goodRxLink}" target="_blank" rel="noopener">See current price on GoodRx</a></p>`
            : ""}
          <p><strong>Insurance:</strong> ${record.insuranceUsed ? "Yes" : "No"}</p>
          <p><strong>Saved:</strong> ${record.createdAt}</p>
        </article>
      `
    )
    .join("");
}

frontImageInput.addEventListener("change", () => {
  handleImageUpload(frontImageInput, frontPreview, frontText);
});

backImageInput.addEventListener("change", () => {
  handleImageUpload(backImageInput, backPreview, backText);
});

sampleBtn.addEventListener("click", () => {
  frontText.value = sampleFrontText;
  backText.value = sampleBackText;
  populateFormFromText();
  frontPreview.style.display = "none";
  backPreview.style.display = "none";
});

ndcLookupBtn.addEventListener("click", lookupNdc);
priceCompareBtn.addEventListener("click", comparePrice);
saveBtn.addEventListener("click", saveMedication);

[frontText, backText].forEach((element) => {
  element.addEventListener("input", () => {
    populateFormFromText();
    setLookupStatus('');
    setPriceSummary('');
    currentLookup = null;
    currentPriceCompare = null;
  });
});

renderRecords();
