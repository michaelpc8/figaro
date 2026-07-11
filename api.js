// Points at the Express backend directly (not a relative path) so this works
// no matter what serves the static files — Live Server, Express itself, or
// opening index.html directly. Change this if the backend runs elsewhere.
export const API_BASE = "http://localhost:5000/api";

// Reminders/medications/financials/pharmacy backend routes don't exist yet,
// so those screens still run on mock data. Camera scanning (OCR + NDC match
// + price comparison) is real and always hits the live backend below.
export const DEV_USE_MOCKS = true;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function ocrImage(blob) {
  if (!window.Tesseract) {
    throw new Error("OCR engine failed to load. Check your connection and try again.");
  }
  const { data } = await window.Tesseract.recognize(blob, "eng");
  return data.text || "";
}

function extractNdc(text) {
  const match = text.match(/(\d{4,5}-\d{3,4}-\d{2})|(\d{10,11})/g);
  if (!match) return "";
  const digits = match[0].replace(/[^\d]/g, "");
  return digits.length === 10 || digits.length === 11 ? match[0] : "";
}

function extractStrength(text) {
  const match = text.match(/\b\d+\s*(?:mg|mcg|g|ml|tablet|capsule|pill)\b/i);
  return match ? match[0] : "";
}

function extractDose(text) {
  const match = text.match(/\btake\s+(\d+\s*(?:tablet|capsule|pill|ml|mL|drop|spray|puff)s?)\b/i);
  if (match) return match[1];
  const fallback = text.match(/\b\d+\s*(?:tablet|capsule|pill|ml|mL|drop|spray|puff)\b/i);
  return fallback ? fallback[0] : "";
}

function extractFrequency(text) {
  const normalized = text.toLowerCase();
  if (/(twice|2 times|bid).*(day|daily)/.test(normalized) || /every 12 hours/.test(normalized)) return "Twice daily";
  if (/(once|1 time|qd).*(day|daily)/.test(normalized) || /every 24 hours/.test(normalized)) return "Once daily";
  if (/(three|3 times).*(day|daily)/.test(normalized) || /every 8 hours/.test(normalized)) return "Three times daily";
  return "";
}

function extractInstructions(text) {
  const lowered = text.toLowerCase();
  if (/take by mouth/.test(lowered)) return "Take by mouth";
  if (/take with food/.test(lowered)) return "Take with food";
  if (/as directed/.test(lowered)) return "Take as directed";
  if (/take .* daily/.test(lowered)) return "Take daily";
  return "";
}

function extractQuantity(text) {
  const lowered = text.toLowerCase();
  const qtyMatch = lowered.match(/(?:quantity|qty|dispensed)\s*[:\-]?\s*(\d+)\b/);
  if (qtyMatch) return Number(qtyMatch[1]);
  const countMatch = lowered.match(/(\d+)\s*(?:tablet|capsule|pill|tab|cap)s?\b/);
  if (countMatch) return Number(countMatch[1]);
  return null;
}

function extractCost(text) {
  const match = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  return match ? match[1] : "";
}

export const api = {
  getMedications() {
    return request("/medications");
  },

  getTodayReminders() {
    return request("/reminders/today");
  },

  updateReminder(reminderId, taken) {
    return request(`/reminders/${encodeURIComponent(reminderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ taken }),
    });
  },

  lookupNdc(ndc) {
    return request("/ndc-lookup", {
      method: "POST",
      body: JSON.stringify({ ndc }),
    });
  },

  comparePrice(payload) {
    return request("/price-compare", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Runs OCR on both label photos in-browser (Tesseract.js), pulls out the
  // NDC/strength/dose/etc, matches the NDC against RxNorm, and price-checks
  // the match against CMS NADAC data. One call, real data at every step.
  async scanPrescription(frontBlob, backBlob) {
    const [frontText, backText] = await Promise.all([
      ocrImage(frontBlob),
      backBlob ? ocrImage(backBlob) : Promise.resolve(""),
    ]);
    const combinedText = `${frontText}\n${backText}`.trim();

    const ndc = extractNdc(combinedText);
    const strength = extractStrength(combinedText);
    const dose = extractDose(combinedText);
    const frequency = extractFrequency(combinedText);
    const instructions = extractInstructions(combinedText);
    const quantity = extractQuantity(combinedText);
    const cost = extractCost(combinedText);

    let match = null;
    if (ndc) {
      try {
        match = await api.lookupNdc(ndc);
      } catch (error) {
        match = null;
      }
    }

    const drugName = match?.rxNormName || match?.genericName || "Medication from label";
    let priceInfo = null;
    try {
      priceInfo = await api.comparePrice({
        drugName,
        genericName: match?.genericName || "",
        ndc,
        quantity: quantity ? `${quantity} tablets` : "",
        paidCost: cost,
      });
    } catch (error) {
      priceInfo = null;
    }

    return {
      rawText: combinedText,
      ndc,
      strength,
      dose,
      frequency,
      instructions,
      quantity,
      cost,
      match,
      priceInfo,
    };
  },

  getFinancialSummary() {
    return request("/financials/summary");
  },

  getNearbyPharmacies() {
    return request("/pharmacies/nearby");
  },
};
