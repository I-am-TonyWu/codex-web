'use strict';

// Only path fields and quoted table keys are remapped; prompts and comments are data.
function remapTomlPaths(raw, mappings) {
  let arrayField = false;
  let multiline = null;
  return raw.split(/(?<=\n)/).map(line => {
    if (multiline) { if (line.includes(multiline)) multiline = null; return line; }
    for (const match of line.matchAll(/#[^\n]*|"""|'''|"(?:\\.|[^"\\])*"|'[^']*'/g)) {
      if (match[0] === '"""' || match[0] === "'''") {
        if (!line.slice(match.index + 3).includes(match[0])) multiline = match[0];
        return line;
      }
    }
    const field = line.match(/^\s*([\w-]+)\s*=\s*/)?.[1];
    const table = /^\s*\[/.test(line) && !arrayField;
    const allowed = table || (field ? /^(?:cwd|cwds|path|paths|root|root_path|root_paths|rootPaths|working_directory|command|args)$/i.test(field) : arrayField);
    if (field) arrayField = allowed && line.includes('[') && !line.includes(']');
    else if (arrayField && line.includes(']')) arrayField = false;
    if (!allowed) return line;
    return line.replace(/#[^\n]*|"(?:\\.|[^"\\])*"|'[^']*'/g, token => {
      if (token.startsWith('#') || token === '""' || token === "''") return token;
      let value;
      try { value = token[0] === '"' ? JSON.parse(token) : token.slice(1, -1); } catch { return token; }
      const normalized = value.replaceAll('\\', '/');
      for (const [oldRoot, newRoot] of mappings) {
        const prefix = oldRoot.replaceAll('\\', '/');
        const compare = /^[a-z]:\//i.test(prefix) ? normalized.toLowerCase() : normalized;
        const root = /^[a-z]:\//i.test(prefix) ? prefix.toLowerCase() : prefix;
        if (compare !== root && !compare.startsWith(root + '/')) continue;
        let mapped = newRoot.replaceAll('\\', '/') + normalized.slice(prefix.length);
        if (value.includes('\\')) mapped = mapped.replaceAll('/', '\\');
        return token[0] === "'" && !mapped.includes("'") ? "'" + mapped + "'" : JSON.stringify(mapped);
      }
      return token;
    });
  }).join('');
}

module.exports = { remapTomlPaths };
