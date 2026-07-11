const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const NADAC_RESOURCE_ID = 'fbb83258-11c7-47f5-8b18-5f8e79f7e704';
const NADAC_BASE = `https://data.medicaid.gov/api/1/datastore/query/${NADAC_RESOURCE_ID}/0`;
const fetcher = typeof fetch === 'function' ? fetch.bind(globalThis) : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

function normalizeNdc(rawNdc) {
  const digits = String(rawNdc || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return digits;
  }
  return null;
}

async function fetchJson(url) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`RxNorm request failed with status ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error('RxNorm JSON parse error', { url, text: text.slice(0, 1000) });
    throw parseError;
  }
}

async function getIngredientName(rxcui) {
  if (!rxcui) return '';
  try {
    const related = await fetchJson(`${RXNORM_BASE}/rxcui/${rxcui}/related.json?tty=IN`);
    const concept = related.relatedGroup?.conceptGroup?.find((g) => g.tty === 'IN')?.conceptProperties?.[0];
    return concept?.name || '';
  } catch (error) {
    console.error('RxNorm ingredient lookup failed:', error);
    return '';
  }
}

app.post('/api/ndc-lookup', async (req, res) => {
  const { ndc } = req.body;
  if (!ndc) {
    return res.status(400).json({ error: 'NDC is required' });
  }

  const normalizedNdc = normalizeNdc(ndc);
  if (!normalizedNdc) {
    return res.status(400).json({ error: 'Invalid NDC format' });
  }

  try {
    const lookupUrl = `${RXNORM_BASE}/rxcui.json?idtype=NDC&id=${normalizedNdc}`;
    const lookupResult = await fetchJson(lookupUrl);
    const rxcui = lookupResult.idGroup?.rxnormId?.[0];

    if (rxcui) {
      const propertiesUrl = `${RXNORM_BASE}/rxcui/${rxcui}/properties.json`;
      const properties = await fetchJson(propertiesUrl);
      const genericName = properties.properties?.genericName || await getIngredientName(rxcui);

      return res.json({
        ndc: normalizedNdc,
        originalNdc: ndc,
        rxcui,
        rxNormName: properties.properties?.name || '',
        genericName,
        tty: properties.properties?.tty || '',
        status: properties.properties?.status || '',
        locked: true
      });
    }

    const ndcPropertiesUrl = `${RXNORM_BASE}/ndcproperties.json?id=${normalizedNdc}`;
    const ndcProperties = await fetchJson(ndcPropertiesUrl);
    const ndcProperty = ndcProperties.ndcProperty?.[0];

    if (ndcProperty) {
      const genericName = ndcProperty.genericName || await getIngredientName(ndcProperty.rxCui);

      return res.json({
        ndc: normalizedNdc,
        originalNdc: ndc,
        rxcui: ndcProperty.rxCui || '',
        rxNormName: ndcProperty.brandName || ndcProperty.genericName || ndcProperty.proprietaryName || '',
        genericName,
        tty: ndcProperty.termType || '',
        ndcStatus: ndcProperty.status || '',
        locked: Boolean(ndcProperty.rxCui)
      });
    }

    return res.status(404).json({ error: 'No RxNorm match found for this NDC', ndc: normalizedNdc });
  } catch (error) {
    console.error('RxNorm lookup failed:', error);
    return res.status(500).json({ error: 'RxNorm lookup failed', details: error.message });
  }
});

function buildNadacUrl(conditions, sort, limit) {
  const params = new URLSearchParams();
  conditions.forEach((condition, index) => {
    params.set(`conditions[${index}][property]`, condition.property);
    params.set(`conditions[${index}][value]`, condition.value);
    params.set(`conditions[${index}][operator]`, condition.operator || '=');
  });
  (sort || []).forEach((sortRule, index) => {
    params.set(`sort[${index}][property]`, sortRule.property);
    params.set(`sort[${index}][order]`, sortRule.order || 'asc');
  });
  params.set('limit', String(limit || 5));
  return `${NADAC_BASE}?${params.toString()}`;
}

async function queryNadac(conditions, sort, limit) {
  const url = buildNadacUrl(conditions, sort, limit);
  const data = await fetchJson(url);
  return data.results || [];
}

async function getLatestNadacForNdc(ndcValue) {
  const rows = await queryNadac(
    [{ property: 'ndc', value: ndcValue, operator: '=' }],
    [{ property: 'effective_date', order: 'desc' }],
    1
  );
  return rows[0] || null;
}

async function getCheapestNadacByName(name, excludeNdc) {
  const rows = await queryNadac(
    [{ property: 'ndc_description', value: `%${name.toUpperCase()}%`, operator: 'like' }],
    [{ property: 'nadac_per_unit', order: 'asc' }],
    10
  );
  return rows.find((row) => row.ndc !== excludeNdc) || null;
}

function parseUnitCount(quantityText) {
  const match = String(quantityText || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\[.*?\]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|%)\b/g, ' ')
    .replace(/\b(tablet|tablets|capsule|capsules|oral|suspension|solution|injection|cream|ointment|patch|extended release|er|chewable)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractBrandName(rxNormName) {
  const match = String(rxNormName || '').match(/\[(.*?)\]/);
  return match ? match[1] : '';
}

function buildGoodRxUrl(name) {
  const slug = slugify(name);
  return slug ? `https://www.goodrx.com/${slug}` : '';
}

app.post('/api/price-compare', async (req, res) => {
  const { drugName, genericName, ndc, quantity, paidCost } = req.body;
  if (!drugName) {
    return res.status(400).json({ error: 'drugName is required' });
  }

  const searchName = genericName || drugName;
  const brandName = extractBrandName(drugName);
  const mainLinkName = brandName || searchName;
  const parsedUnitCount = parseUnitCount(quantity);
  const quantityDefaulted = parsedUnitCount == null;
  const unitCount = parsedUnitCount || 30;
  const paidAmount = Number(String(paidCost || '').replace(/[^\d.]/g, ''));

  try {
    const normalizedNdc = normalizeNdc(ndc);
    let referenceRow = normalizedNdc ? await getLatestNadacForNdc(normalizedNdc) : null;
    let source = 'exact_ndc';

    if (!referenceRow) {
      referenceRow = await getCheapestNadacByName(searchName, normalizedNdc);
      source = referenceRow ? 'name_match' : 'none';
    }

    if (!referenceRow) {
      return res.json({
        drugName,
        ndc: normalizedNdc || '',
        paidCost: Number.isFinite(paidAmount) ? Number(paidAmount.toFixed(2)) : null,
        estimatedPrice: null,
        note: 'No CMS NADAC pricing data found for this medication.',
        goodRxLink: buildGoodRxUrl(mainLinkName),
        source: 'none'
      });
    }

    const perUnit = Number(referenceRow.nadac_per_unit);
    const estimatedPrice = Number((perUnit * unitCount).toFixed(2));

    let cheaperAlternative = null;
    const genericPerUnit = Number(referenceRow.corresponding_generic_drug_nadac_per_unit);
    if (referenceRow.classification_for_rate_setting === 'B' && Number.isFinite(genericPerUnit) && genericPerUnit > 0 && genericPerUnit < perUnit && searchName) {
      cheaperAlternative = {
        name: `Generic ${searchName}`,
        estimatedPrice: Number((genericPerUnit * unitCount).toFixed(2)),
        goodRxLink: buildGoodRxUrl(searchName)
      };
    } else {
      const cheaperRow = await getCheapestNadacByName(searchName, referenceRow.ndc);
      if (cheaperRow) {
        const cheaperPerUnit = Number(cheaperRow.nadac_per_unit);
        if (cheaperPerUnit < perUnit) {
          cheaperAlternative = {
            name: cheaperRow.ndc_description,
            ndc: cheaperRow.ndc,
            estimatedPrice: Number((cheaperPerUnit * unitCount).toFixed(2)),
            goodRxLink: buildGoodRxUrl(cheaperRow.ndc_description)
          };
        }
      }
    }

    return res.json({
      drugName,
      ndc: normalizedNdc || referenceRow.ndc,
      matchedDescription: referenceRow.ndc_description,
      paidCost: Number.isFinite(paidAmount) ? Number(paidAmount.toFixed(2)) : null,
      estimatedPrice,
      pricingUnit: referenceRow.pricing_unit,
      unitCount,
      asOfDate: referenceRow.effective_date,
      source,
      quantityDefaulted,
      note: `Estimated from CMS NADAC (average pharmacy acquisition cost)${quantityDefaulted ? ', assuming a 30-count fill since no quantity was entered' : ''}. This is what the pharmacy pays for the drug itself, not the retail price — GoodRx and other retail prices add a dispensing fee and markup on top, so their number will usually be higher than this estimate.`,
      goodRxLink: buildGoodRxUrl(mainLinkName),
      cheaperAlternative
    });
  } catch (error) {
    console.error('Price comparison failed:', error);
    return res.status(500).json({ error: 'Price comparison failed', details: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Figaro backend running on http://localhost:${PORT}`);
});
