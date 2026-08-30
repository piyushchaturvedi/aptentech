/**
 * Splits CSS into top-level chunks — one rule or one at-rule block per entry.
 *
 * Comments are stripped first. Without that, the same declaration compares as two
 * different chunks depending on whether a section banner happens to precede it, which
 * makes the shared-rule analysis wrong. Brace counting (rather than splitting on "}")
 * keeps @media and @supports blocks intact.
 */
function stripComments(css) {
  let out = '';
  let inString = null;
  let inComment = false;

  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (c === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === inString && css[i - 1] !== '\\') inString = null;
      continue;
    }
    if (c === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      out += c;
      continue;
    }
    out += c;
  }
  return out;
}

function chunks(css) {
  const clean = stripComments(css);
  const out = [];
  let depth = 0;
  let start = 0;
  let inString = null;

  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];

    if (inString) {
      if (c === inString && clean[i - 1] !== '\\') inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }

    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        const chunk = clean.slice(start, i + 1).trim();
        if (chunk) out.push(chunk);
        start = i + 1;
      }
    }
  }
  return out;
}

module.exports = { chunks, stripComments };
