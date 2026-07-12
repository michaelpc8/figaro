// Use the same origin that serves the app. This works locally through Express
// and through an HTTPS proxy such as Cloudflare Tunnel without mixed-content
// or phone-localhost failures.
export const API_BASE = "/api";

// Reminders/medications backend routes don't exist yet, so those screens
// still run on mock data. Camera scanning and Financials (NADAC-backed price
// + history) are real and always hit the live backend below.
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

// Grayscale + contrast stretch, upscaling small crops. Real phone-camera
// photos are far noisier than the label itself — this materially improves
// Tesseract's read rate over feeding it the raw photo.
async function preprocessForOcr(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = bitmap.width < 900 ? 1.6 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrasted = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
    data[i] = data[i + 1] = data[i + 2] = contrasted;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

async function ocrImages(blobs) {
  if (!window.Tesseract) {
    throw new Error("OCR engine failed to load. Check your connection and try again.");
  }
  const worker = await window.Tesseract.createWorker("eng");
  try {
    // PSM 6: assume a single uniform block of text — better fit for a label
    // photo than the default full-page layout analysis.
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const texts = [];
    for (const blob of blobs) {
      if (!blob) {
        texts.push("");
        continue;
      }
      const processed = await preprocessForOcr(blob);
      const { data } = await worker.recognize(processed);
      texts.push(data.text || "");
    }
    return texts;
  } finally {
    await worker.terminate();
  }
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

  getPriceHistory(payload) {
    return request("/price-history", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Runs OCR on both label photos in-browser (Tesseract.js), pulls out the
  // NDC/strength/dose/etc and matches the NDC against RxNorm.
  async scanPrescription(frontBlob, backBlob) {
    const [frontText, backText] = await ocrImages([frontBlob, backBlob]);
    const combinedText = `${frontText}\n${backText}`.trim();

    const ndc = extractNdc(combinedText);
    const strength = extractStrength(combinedText);
    const dose = extractDose(combinedText);
    const frequency = extractFrequency(combinedText);
    const instructions = extractInstructions(combinedText);
    const quantity = extractQuantity(combinedText);

    let match = null;
    if (ndc) {
      try {
        match = await api.lookupNdc(ndc);
      } catch (error) {
        match = null;
      }
    }

    const drugName = match?.rxNormName || match?.genericName || "Medication from label";
    const goodRxSlug = drugName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const priceInfo = { goodRxLink: goodRxSlug ? `https://www.goodrx.com/${goodRxSlug}` : "https://www.goodrx.com/" };

    return {
      rawText: combinedText,
      ndc,
      strength,
      dose,
      frequency,
      instructions,
      quantity,
      match,
      priceInfo,
    };
  },

};
