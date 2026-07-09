// Injected into the apply WKWebView as a WKUserScript at .atDocumentEnd.
// Reads window.__PROFILE__ (set by Swift) and fills whatever it recognises.
// It never clicks submit. Review and submit stay manual, on purpose.

(() => {
  const FIELDS = [
    // Order matters: "first name" must beat the generic "name" rule.
    ['firstName', /\bfirst\s*name|given\s*name|forename/i],
    ['lastName', /\blast\s*name|family\s*name|surname/i],
    ['preferredName', /preferred\s*(first\s*)?name|nickname/i],
    ['fullName', /^\s*(full\s*)?name\b|your\s*name|legal\s*name/i],
    ['email', /e-?mail/i],
    ['phone', /phone|mobile|cell\b|telephone/i],
    ['linkedin', /linked\s*-?in/i],
    ['github', /git\s*-?hub/i],
    ['website', /website|portfolio|personal\s*site|other\s*url/i],
    ['school', /school|university|college|institution/i],
    ['degree', /\bdegree\b|level\s*of\s*education/i],
    ['major', /major|discipline|field\s*of\s*study|concentration/i],
    ['gpa', /\bgpa\b|grade\s*point/i],
    ['gradDate', /graduation|grad\s*date|expected\s*(completion|end)/i],
    ['city', /\bcity\b|current\s*location|where\s*are\s*you\s*(currently\s*)?(based|located)/i],
    ['state', /\bstate\b|province|region/i],
    ['country', /\bcountry\b/i],
    ['postalCode', /zip|postal/i],
    ['address', /street|address\s*line|^address/i],
    ['company', /current\s*(employer|company)/i],
    ['workAuth', /legally\s*authorized|authorized\s*to\s*work|right\s*to\s*work|work\s*authorization/i],
    ['sponsorship', /sponsor|visa\s*(status|support)|require.*sponsorship|h-?1b/i],
    ['gender', /\bgender\b/i],
    ['race', /\brace\b|ethnicity|hispanic/i],
    ['veteran', /veteran|protected\s*veteran/i],
    ['disability', /disability|disabled/i],
    ['howHeard', /how\s*did\s*you\s*hear|referral\s*source|where\s*did\s*you\s*find/i],
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Where a field's human-readable label actually lives varies per ATS, so try
  // everything and take the first thing with text.
  const labelOf = (el) => {
    const bits = [];
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) bits.push(l.innerText);
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const n = document.getElementById(id);
        if (n) bits.push(n.innerText);
      });
    }
    bits.push(el.getAttribute('aria-label') || '');
    bits.push(el.getAttribute('placeholder') || '');
    bits.push(el.getAttribute('name') || '');
    const wrap = el.closest('label');
    if (wrap) bits.push(wrap.innerText);
    if (!bits.join('').trim()) {
      // Last resort: nearest preceding text node in the same field group.
      const group = el.closest('[class*="field"],[class*="question"],fieldset,div');
      if (group) bits.push(group.innerText.slice(0, 120));
    }
    return bits.join(' ').replace(/\s+/g, ' ').trim();
  };

  const classify = (text) => {
    for (const [key, re] of FIELDS) if (re.test(text)) return key;
    return null;
  };

  // React tracks its own value on the DOM node, so a plain el.value = x is
  // silently reverted on the next render. Go through the prototype setter.
  const setValue = (el, value) => {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const optionMatches = (optionText, wanted) => {
    const a = norm(optionText);
    const b = norm(wanted);
    if (!a || !b) return false;
    return a === b || a.startsWith(b) || b.startsWith(a) || a.includes(b);
  };

  const fillNativeSelect = (el, wanted) => {
    const match = [...el.options].find((o) => optionMatches(o.text, wanted));
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  // Custom comboboxes (Greenhouse has ~18 per form) are click, wait for the
  // listbox to mount, click the option. No fixed sleep is reliable, so poll.
  const fillCombobox = async (el, wanted) => {
    el.click();
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      const options = [...document.querySelectorAll('[role=option],li[id*="option"],[class*="option"]')].filter(visible);
      const match = options.find((o) => optionMatches(o.innerText, wanted));
      if (match) {
        match.click();
        return true;
      }
    }
    document.body.click(); // close the popup we opened
    return false;
  };

  const fillChoiceGroup = (elements, wanted) => {
    const match = elements.find((el) => optionMatches(labelOf(el), wanted));
    if (!match) return false;
    if (!match.checked) match.click();
    return true;
  };

  // Cannot assign to input.files, but a DataTransfer can. Verified working in
  // WebKit against live Greenhouse, Lever and Ashby forms.
  const attachFile = (el, base64, filename) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], filename, { type: 'application/pdf' }));
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.files.length === 1;
  };

  async function fill(profile, resume) {
    const filled = [];
    const missed = [];
    const seen = new Set();

    // Radios and checkboxes belong to a question, not a field, so group them
    // by the question text before deciding what to click.
    const groups = new Map();
    for (const el of document.querySelectorAll('input[type=radio],input[type=checkbox]')) {
      if (!visible(el)) continue;
      const q = el.closest('fieldset,[role=radiogroup],[class*="question"],[class*="field"]');
      const key = q ? q.innerText.slice(0, 80) : el.name || 'ungrouped';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
      seen.add(el);
    }

    for (const [question, elements] of groups) {
      const key = classify(question);
      const wanted = key && profile[key];
      if (!wanted) {
        missed.push({ label: question.slice(0, 50), why: key ? 'no profile value' : 'unclassified' });
        continue;
      }
      if (fillChoiceGroup(elements, wanted)) filled.push({ key, kind: 'choice' });
      else missed.push({ label: question.slice(0, 50), why: `no option matching "${wanted}"` });
    }

    for (const el of document.querySelectorAll('input,select,textarea')) {
      if (seen.has(el) || !visible(el) || el.disabled || el.readOnly) continue;
      if (['submit', 'button', 'hidden', 'image'].includes(el.type)) continue;

      if (el.type === 'file') {
        if (resume && attachFile(el, resume.base64, resume.filename)) filled.push({ key: 'resume', kind: 'file' });
        else missed.push({ label: labelOf(el).slice(0, 50), why: 'file attach failed' });
        continue;
      }

      const label = labelOf(el);
      const key = classify(label);
      const value = key && profile[key];
      if (!value) {
        missed.push({ label: label.slice(0, 50), why: key ? 'no profile value' : 'unclassified' });
        continue;
      }

      if (el.tagName === 'SELECT') {
        if (fillNativeSelect(el, value)) filled.push({ key, kind: 'select' });
        else missed.push({ label: label.slice(0, 50), why: `no option matching "${value}"` });
        continue;
      }

      setValue(el, value);
      filled.push({ key, kind: el.tagName === 'TEXTAREA' ? 'textarea' : 'text' });
    }

    for (const el of document.querySelectorAll('[role=combobox],[aria-haspopup=listbox],[class*="select__control"]')) {
      if (!visible(el)) continue;
      const key = classify(labelOf(el));
      const value = key && profile[key];
      if (!value) continue;
      if (await fillCombobox(el, value)) filled.push({ key, kind: 'combobox' });
      else missed.push({ label: labelOf(el).slice(0, 50), why: `combobox had no "${value}"` });
    }

    return { filled, missed };
  }

  window.__jobFill = fill;
})();
