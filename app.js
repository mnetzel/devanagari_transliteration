const source = document.querySelector("#source");
const result = document.querySelector("#result");
const interlinear = document.querySelector("#interlinear");
const status = document.querySelector("#status");
const copyButton = document.querySelector("#copy");
const spacingToggle = document.querySelector("#spacing-toggle");
const SOURCE_STORAGE_KEY = "devanagariTransliteration.sourceText";
const DEVANAGARI_BLOCK = /[\u0900-\u097f]/;
const CONSONANT = /[\u0915-\u0939\u0958-\u095f]/;
const INDEPENDENT_VOWEL = /[\u0904-\u0914\u0960\u0961]/;
const DEPENDENT_MARK = /[\u093e-\u094c\u0962\u0963]/;
const MODIFIER = /[\u0900-\u0903\u093a\u093b\u0951-\u0957]/;
const NUKTA = "\u093c";
const VIRAMA = "\u094d";
const ZWJ = "\u200d";
const ZWNJ = "\u200c";
const SVARA_MARKS = /[\u0951-\u0957\u1cd0-\u1cff\ua8e0-\ua8f1]/gu;

function setStatus(message) {
  status.textContent = message;
}

function loadSavedSourceText() {
  try {
    return localStorage.getItem(SOURCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSourceText(text) {
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, text);
  } catch {
    // Some browsers block localStorage in private or locked-down contexts.
  }
}

function restoreSourceText() {
  const savedText = loadSavedSourceText();

  if (savedText !== null) {
    source.value = savedText;
  }
}

function stripSvara(text) {
  return text.replace(SVARA_MARKS, "");
}

function toIast(text) {
  return window.Sanscript.t(stripSvara(text), "devanagari", "iast");
}

function isWhitespace(char) {
  return /\s/.test(char);
}

function isDevanagari(char) {
  return DEVANAGARI_BLOCK.test(char);
}

function isJoiner(char) {
  return char === ZWJ || char === ZWNJ;
}

function readAkshara(chars, start) {
  let index = start;

  if (CONSONANT.test(chars[index])) {
    index += 1;

    if (chars[index] === NUKTA) {
      index += 1;
    }

    while (chars[index] === VIRAMA) {
      let nextIndex = index + 1;

      if (isJoiner(chars[nextIndex])) {
        nextIndex += 1;
      }

      if (!CONSONANT.test(chars[nextIndex])) {
        index += 1;
        break;
      }

      index = nextIndex + 1;

      if (chars[index] === NUKTA) {
        index += 1;
      }
    }

    while (DEPENDENT_MARK.test(chars[index])) {
      index += 1;
    }

    while (MODIFIER.test(chars[index])) {
      index += 1;
    }

    return {
      text: chars.slice(start, index).join(""),
      end: index,
    };
  }

  if (INDEPENDENT_VOWEL.test(chars[index])) {
    index += 1;

    while (MODIFIER.test(chars[index])) {
      index += 1;
    }

    return {
      text: chars.slice(start, index).join(""),
      end: index,
    };
  }

  index += 1;

  while (MODIFIER.test(chars[index])) {
    index += 1;
  }

  return {
    text: chars.slice(start, index).join(""),
    end: index,
  };
}

function tokenizeLine(line) {
  const chars = Array.from(line);
  const tokens = [];
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];

    if (isWhitespace(char)) {
      let end = index + 1;

      while (isWhitespace(chars[end])) {
        end += 1;
      }

      tokens.push({
        kind: "space",
        text: chars.slice(index, end).join(""),
      });
      index = end;
      continue;
    }

    if (isDevanagari(char)) {
      const token = readAkshara(chars, index);
      tokens.push({
        kind: "pair",
        text: token.text,
        iast: toIast(token.text),
      });
      index = token.end;
      continue;
    }

    let end = index + 1;

    while (chars[end] && !isWhitespace(chars[end]) && !isDevanagari(chars[end])) {
      end += 1;
    }

    const text = chars.slice(index, end).join("");
    tokens.push({
      kind: "pair",
      text,
      iast: text,
    });
    index = end;
  }

  return tokens;
}

function appendSpace(row, token) {
  const space = document.createElement("span");
  const count = Math.max(token.text.length, 1);

  space.className = "interlinear-space";
  space.dataset.spaceCount = String(count);
  space.style.setProperty("--space-count", count);
  space.textContent = spacingEnabled() ? "   ".repeat(count) : " ".repeat(count);
  row.append(space);
}

function appendTokenGap(row) {
  const gap = document.createElement("span");

  gap.className = "interlinear-token-gap";
  gap.textContent = spacingEnabled() ? " " : "";
  row.append(gap);
}

function appendToken(row, token, pairId, script) {
  if (token.kind === "space") {
    appendSpace(row, token);
    return;
  }

  const span = document.createElement("span");
  span.className = `token token-${script}`;
  span.dataset.pairId = pairId;
  span.textContent = script === "source" ? token.text : token.iast;
  row.append(span);
}

function renderInterlinear(text) {
  interlinear.replaceChildren();

  if (!text.trim()) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Tutaj pojawi się Devanagari i IAST w przeplocie";
    interlinear.append(empty);
    return;
  }

  let pairId = 0;

  text.split(/\r?\n/).forEach((line) => {
    const lineBlock = document.createElement("div");
    lineBlock.className = "interlinear-line";

    if (!line.trim()) {
      lineBlock.classList.add("interlinear-line-empty");
      interlinear.append(lineBlock);
      return;
    }

    const sourceRow = document.createElement("div");
    sourceRow.className = "interlinear-row interlinear-source";

    const iastRow = document.createElement("div");
    iastRow.className = "interlinear-row interlinear-iast";

    const tokens = tokenizeLine(line);

    tokens.forEach((token, index) => {
      const id = String(pairId);
      appendToken(sourceRow, token, id, "source");
      appendToken(iastRow, token, id, "iast");

      if (token.kind === "pair") {
        pairId += 1;

        if (tokens[index + 1]?.kind === "pair") {
          appendTokenGap(sourceRow);
          appendTokenGap(iastRow);
        }
      }
    });

    lineBlock.append(sourceRow, iastRow);
    interlinear.append(lineBlock);
  });
}

function highlightPair(pairId, active) {
  interlinear
    .querySelectorAll(`[data-pair-id="${pairId}"]`)
    .forEach((token) => token.classList.toggle("token-active", active));
}

function spacingEnabled() {
  return !interlinear.classList.contains("spacing-compact");
}

function updateCopySpacing() {
  const enabled = spacingEnabled();

  interlinear.querySelectorAll(".interlinear-space").forEach((space) => {
    const count = Number(space.dataset.spaceCount || 1);

    space.textContent = enabled ? "   ".repeat(count) : " ".repeat(count);
  });

  interlinear.querySelectorAll(".interlinear-token-gap").forEach((gap) => {
    gap.textContent = enabled ? " " : "";
  });
}

function toggleSpacing() {
  const compact = interlinear.classList.toggle("spacing-compact");
  const enabled = !compact;

  updateCopySpacing();
  spacingToggle.setAttribute("aria-pressed", String(enabled));
  spacingToggle.textContent = enabled ? "Odstępy: wł." : "Odstępy: wył.";
}

function transliterate() {
  const text = source.value;
  const cleanText = stripSvara(text);

  if (!text.trim()) {
    result.value = "";
    renderInterlinear("");
    copyButton.disabled = true;
    setStatus("");
    return;
  }

  if (!window.Sanscript) {
    result.value = "";
    renderInterlinear("");
    copyButton.disabled = true;
    setStatus("Nie udało się załadować biblioteki Sanscript.");
    return;
  }

  result.value = toIast(cleanText);
  renderInterlinear(cleanText);
  copyButton.disabled = result.value.length === 0;
  setStatus("Gotowe.");
}

async function copyResult() {
  if (!result.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(result.value);
    setStatus("Skopiowano transliterację.");
  } catch {
    result.select();
    document.execCommand("copy");
    setStatus("Skopiowano transliterację.");
  }
}

copyButton.addEventListener("click", copyResult);
spacingToggle.addEventListener("click", toggleSpacing);
source.addEventListener("input", () => {
  saveSourceText(source.value);
  transliterate();
});
interlinear.addEventListener("mouseover", (event) => {
  const token = event.target.closest("[data-pair-id]");

  if (!token || !interlinear.contains(token)) {
    return;
  }

  highlightPair(token.dataset.pairId, true);
});
interlinear.addEventListener("mouseout", (event) => {
  const token = event.target.closest("[data-pair-id]");

  if (!token || !interlinear.contains(token)) {
    return;
  }

  highlightPair(token.dataset.pairId, false);
});
window.addEventListener("load", transliterate);

restoreSourceText();
copyButton.disabled = true;
