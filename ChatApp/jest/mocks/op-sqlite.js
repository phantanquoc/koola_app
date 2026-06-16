/**
 * jest/mocks/op-sqlite.js
 *
 * In-memory SQLite mock for @op-engineering/op-sqlite.
 * Implements a minimal but correct SQL engine sufficient for the repository
 * unit tests. Supports: CREATE TABLE, CREATE INDEX, INSERT OR REPLACE/IGNORE,
 * INSERT ... ON CONFLICT DO UPDATE, UPDATE, DELETE, SELECT with WHERE/ORDER/LIMIT/OFFSET.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unquote(s) {
  return s ? s.replace(/^["'`]|["'`]$/g, '') : s;
}

function resolveValue(expr, row, params) {
  if (!expr) return null;
  expr = expr.trim();
  if (expr === '?') {
    const p = params.shift();
    return p === undefined ? null : p;
  }
  if (/^NULL$/i.test(expr)) return null;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
  if (/^'[^']*'$/.test(expr)) return expr.slice(1, -1);
  // json_extract(col, '$.path')
  const je = resolveJsonExtract(expr, row);
  if (je !== undefined) return je;
  if (row) {
    const lower = expr.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower];
    if (Object.prototype.hasOwnProperty.call(row, expr)) return row[expr];
  }
  return null;
}

function likeTest(str, pattern) {
  const regex = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.') + '$';
  return new RegExp(regex, 'i').test(str);
}

// ─── json_extract helper ──────────────────────────────────────────────────────

function jsonExtract(jsonStr, path) {
  try {
    const obj = JSON.parse(jsonStr);
    // path like '$.replyTo' or '$.upToTimestamp'
    const key = path.replace(/^\$\./, '');
    const val = obj[key];
    return val === undefined ? null : val;
  } catch {
    return null;
  }
}

// Resolve a value expression that may contain json_extract(col, path)
function resolveJsonExtract(expr, row) {
  const m = expr.match(/^json_extract\s*\(\s*(\w+)\s*,\s*'([^']+)'\s*\)$/i);
  if (m) {
    const col = m[1].toLowerCase();
    const path = m[2];
    const colVal = row ? (row[col] ?? null) : null;
    if (colVal === null) return null;
    return jsonExtract(String(colVal), path);
  }
  return undefined; // not a json_extract expression
}

function findLogicalOp(s, op) {
  let depth = 0;
  const upper = s.toUpperCase();
  for (let i = 0; i <= s.length - op.length; i++) {
    const c = s[i];
    if (c === '(') { depth++; continue; }
    if (c === ')') { depth--; continue; }
    if (depth === 0 && upper.slice(i, i + op.length) === op) {
      const before = i === 0 ? ' ' : s[i - 1];
      const after = i + op.length >= s.length ? ' ' : s[i + op.length];
      if (/\s/.test(before) && /\s/.test(after)) return i;
    }
  }
  return -1;
}

function evalWhere(clause, row, params) {
  if (!clause) return true;
  let s = clause.trim();

  // Strip outer parentheses if the entire expression is wrapped
  while (s.startsWith('(') && s.endsWith(')')) {
    // Verify the opening paren matches the closing paren (not just any outer parens)
    let depth = 0;
    let matched = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') {
        depth--;
        if (depth === 0) {
          matched = i === s.length - 1;
          break;
        }
      }
    }
    if (matched) s = s.slice(1, -1).trim();
    else break;
  }

  // AND — evaluate left first, consuming its params, then right with remaining params
  const andIdx = findLogicalOp(s, 'AND');
  if (andIdx !== -1) {
    const left = s.slice(0, andIdx).trim();
    const right = s.slice(andIdx + 3).trim();
    const lResult = evalWhere(left, row, params);
    const rResult = evalWhere(right, row, params);
    return lResult && rResult;
  }

  // OR — evaluate left first, consuming its params, then right with remaining params
  const orIdx = findLogicalOp(s, 'OR');
  if (orIdx !== -1) {
    const left = s.slice(0, orIdx).trim();
    const right = s.slice(orIdx + 2).trim();
    const lResult = evalWhere(left, row, params);
    const rResult = evalWhere(right, row, params);
    return lResult || rResult;
  }

  // NOT IN ('a','b','c') or NOT IN (?,?,?) — must check before IN
  const notInM = s.match(/^(.+?)\s+NOT\s+IN\s*\(([^)]+)\)$/i);
  if (notInM) {
    const val = resolveValue(notInM[1].trim(), row, params);
    const items = splitComma(notInM[2]).map(item => {
      item = item.trim();
      if (item === '?') return params.shift() ?? null;
      if (/^NULL$/i.test(item)) return null;
      if (/^'[^']*'$/.test(item)) return item.slice(1, -1);
      if (/^-?\d+(\.\d+)?$/.test(item)) return parseFloat(item);
      return item;
    });
    return !items.some(item => item == val);
  }

  // IN ('a','b','c') or IN (?,?,?) — after NOT IN check
  const inM = s.match(/^(.+?)\s+IN\s*\(([^)]+)\)$/i);
  if (inM) {
    const val = resolveValue(inM[1].trim(), row, params);
    const items = splitComma(inM[2]).map(item => {
      item = item.trim();
      if (item === '?') return params.shift() ?? null;
      if (/^NULL$/i.test(item)) return null;
      if (/^'[^']*'$/.test(item)) return item.slice(1, -1);
      if (/^-?\d+(\.\d+)?$/.test(item)) return parseFloat(item);
      return item;
    });
    return items.some(item => item == val);
  }

  // NOT LIKE
  const notLikeM = s.match(/^(.+?)\s+NOT\s+LIKE\s+(.+)$/i);
  if (notLikeM) {
    const val = resolveValue(notLikeM[1].trim(), row, params);
    const pat = resolveValue(notLikeM[2].trim(), row, params);
    return !likeTest(String(val ?? ''), String(pat ?? ''));
  }

  // LIKE
  const likeM = s.match(/^(.+?)\s+LIKE\s+(.+)$/i);
  if (likeM) {
    const val = resolveValue(likeM[1].trim(), row, params);
    const pat = resolveValue(likeM[2].trim(), row, params);
    return likeTest(String(val ?? ''), String(pat ?? ''));
  }

  // IS NOT NULL
  const isNotNullM = s.match(/^(.+?)\s+IS\s+NOT\s+NULL$/i);
  if (isNotNullM) {
    const val = resolveValue(isNotNullM[1].trim(), row, params);
    return val !== null && val !== undefined;
  }

  // IS NULL
  const isNullM = s.match(/^(.+?)\s+IS\s+NULL$/i);
  if (isNullM) {
    const val = resolveValue(isNullM[1].trim(), row, params);
    return val === null || val === undefined;
  }

  // != or <>
  const neM = s.match(/^(.+?)\s*(?:!=|<>)\s*(.+)$/);
  if (neM) {
    const l = resolveValue(neM[1].trim(), row, params);
    const r = resolveValue(neM[2].trim(), row, params);
    // eslint-disable-next-line eqeqeq
    return l != r;
  }

  // >= <= > <
  for (const [re, cmp] of [
    [/^(.+?)\s*>=\s*(.+)$/, (a, b) => a >= b],
    [/^(.+?)\s*<=\s*(.+)$/, (a, b) => a <= b],
    [/^(.+?)\s*>\s*(.+)$/, (a, b) => a > b],
    [/^(.+?)\s*<\s*(.+)$/, (a, b) => a < b],
  ]) {
    const m = s.match(re);
    if (m) {
      const l = resolveValue(m[1].trim(), row, params);
      const r = resolveValue(m[2].trim(), row, params);
      return cmp(l, r);
    }
  }

  // =
  const eqM = s.match(/^(.+?)\s*=\s*(.+)$/);
  if (eqM) {
    const l = resolveValue(eqM[1].trim(), row, params);
    const r = resolveValue(eqM[2].trim(), row, params);
    // eslint-disable-next-line eqeqeq
    return l == r;
  }

  return true;
}

function splitComma(s) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inStr) { inStr = true; cur += c; }
    else if (c === "'" && inStr) { inStr = false; cur += c; }
    else if (!inStr && c === '(') { depth++; cur += c; }
    else if (!inStr && c === ')') { depth--; cur += c; }
    else if (!inStr && c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseSetClause(setStr, existingRow, params) {
  const result = {};
  const parts = splitComma(setStr);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const col = unquote(part.slice(0, eqIdx).trim()).toLowerCase();
    const valExpr = part.slice(eqIdx + 1).trim();

    // COALESCE(excluded.col, col)
    const coalesceM = valExpr.match(/^COALESCE\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (coalesceM) {
      const first = resolveSetVal(coalesceM[1].trim(), existingRow, params);
      const second = resolveSetVal(coalesceM[2].trim(), existingRow, params);
      result[col] = (first !== null && first !== undefined) ? first : second;
      continue;
    }

    // MAX(excluded.col, col)
    const maxM = valExpr.match(/^MAX\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (maxM) {
      const a = resolveSetVal(maxM[1].trim(), existingRow, params);
      const b = resolveSetVal(maxM[2].trim(), existingRow, params);
      result[col] = Math.max(Number(a) || 0, Number(b) || 0);
      continue;
    }

    result[col] = resolveSetVal(valExpr, existingRow, params);
  }
  return result;
}

function resolveSetVal(expr, row, params) {
  expr = expr.trim();
  if (expr === '?') return params.shift() ?? null;
  if (/^NULL$/i.test(expr)) return null;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
  if (/^'[^']*'$/.test(expr)) return expr.slice(1, -1);

  // Arithmetic: col + ? or col - ?
  const arithM = expr.match(/^([\w.]+)\s*([+\-])\s*(\?|-?\d+(?:\.\d+)?)$/);
  if (arithM) {
    const colVal = resolveSetVal(arithM[1], row, params);
    const op = arithM[2];
    const rhs = arithM[3] === '?' ? (params.shift() ?? null) : parseFloat(arithM[3]);
    if (colVal === null || rhs === null) return null;
    return op === '+' ? Number(colVal) + Number(rhs) : Number(colVal) - Number(rhs);
  }

  // excluded.col — the value comes from the INSERT params (already consumed)
  // In our upsert model, excluded values are the new values from the INSERT
  // We can't easily recover them here, so return null as safe fallback
  if (/^excluded\./i.test(expr)) return null;
  if (row) {
    const lower = expr.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower];
    if (Object.prototype.hasOwnProperty.call(row, expr)) return row[expr];
  }
  return null;
}

// ─── In-memory database ───────────────────────────────────────────────────────

class InMemoryDB {
  constructor() {
    this._tables = {};
    this._indexes = {}; // name → { type: 'index', tbl_name }
    this._rowsModified = 0;
  }

  _ok() {
    return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
  }

  execute(sql, params = []) {
    const p = Array.isArray(params) ? [...params] : [];
    const s = sql.trim().replace(/\s+/g, ' ');
    try {
      if (/^CREATE TABLE/i.test(s)) return this._createTable(s, p);
      if (/^CREATE (UNIQUE )?INDEX/i.test(s)) return this._createIndex(s, p);
      if (/^INSERT/i.test(s)) return this._insert(s, p);
      if (/^UPDATE/i.test(s)) return this._update(s, p);
      if (/^DELETE/i.test(s)) return this._delete(s, p);
      if (/^SELECT/i.test(s)) return this._select(s, p);
      if (/^(PRAGMA|BEGIN|COMMIT|ROLLBACK|DROP|ALTER)/i.test(s)) return this._ok();
      return this._ok();
    } catch (err) {
      throw new Error(`SQL error in "${s.slice(0, 100)}": ${err.message}`);
    }
  }

  _createIndex(sql, params) {
    // CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (cols) [WHERE ...]
    const m = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s+ON\s+["'`]?(\w+)["'`]?/i);
    if (m) {
      const name = m[1].toLowerCase();
      const tbl = m[2].toLowerCase();
      if (!this._indexes[name]) {
        this._indexes[name] = { type: 'index', name, tbl_name: tbl };
      }
    }
    return this._ok();
  }

  _createTable(sql, params) {
    const m = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?["'`]?(\w+)["'`]?/i);
    if (!m) return this._ok();
    const name = m[1].toLowerCase();
    if (!this._tables[name]) {
      const colSection = sql.match(/\((.+)\)\s*$/s);
      const columns = [];
      if (colSection) {
        for (const def of splitComma(colSection[1])) {
          if (/^(PRIMARY KEY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)/i.test(def.trim())) continue;
          const cm = def.trim().match(/^["'`]?(\w+)["'`]?/);
          if (cm) columns.push(cm[1].toLowerCase());
        }
      }
      this._tables[name] = { columns, rows: [] };
    }
    return this._ok();
  }

  _insert(sql, params) {
    const isUpsert = /ON CONFLICT\s*\(.+?\)\s*(WHERE\s+.+?\s+)?DO UPDATE/i.test(sql);
    const isOrReplace = /INSERT OR REPLACE/i.test(sql);
    const isOrIgnore = /INSERT OR IGNORE/i.test(sql);

    const tableM = sql.match(/INTO\s+["'`]?(\w+)["'`]?\s*\(/i);
    if (!tableM) return this._ok();
    const tableName = tableM[1].toLowerCase();
    const table = this._tables[tableName];
    if (!table) return this._ok();

    const colM = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colM) return this._ok();
    const cols = splitComma(colM[1]).map(c => unquote(c.trim()).toLowerCase());

    const valM = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!valM) return this._ok();
    const valTokens = splitComma(valM[1]);
    const values = valTokens.map(v => {
      v = v.trim();
      if (v === '?') return params.shift() ?? null;
      if (/^NULL$/i.test(v)) return null;
      if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
      if (/^'[^']*'$/.test(v)) return v.slice(1, -1);
      return v;
    });

    const newRow = {};
    cols.forEach((col, i) => { newRow[col] = values[i] ?? null; });

    // Find PK column
    const pkCol = cols.includes('id') ? 'id' : cols[0];
    const pkVal = newRow[pkCol];

    // Check for multi-column conflict (ON CONFLICT(col1, col2) WHERE ...)
    // Extract conflict columns from ON CONFLICT clause
    const conflictM = sql.match(/ON CONFLICT\s*\(([^)]+)\)\s*(WHERE\s+(.+?)\s+)?DO UPDATE/i);
    let existingIdx = pkVal != null
      ? table.rows.findIndex(r => r[pkCol] == pkVal)
      : -1;

    if (conflictM && existingIdx === -1) {
      // Multi-column conflict check
      const conflictCols = splitComma(conflictM[1]).map(c => unquote(c.trim()).toLowerCase());
      const conflictWhere = conflictM[3] ? conflictM[3].trim() : null;

      existingIdx = table.rows.findIndex(r => {
        // All conflict columns must match
        const colsMatch = conflictCols.every(col => {
          const newVal = newRow[col];
          const existVal = r[col];
          if (newVal === null || newVal === undefined) return false; // NULL doesn't conflict
          // eslint-disable-next-line eqeqeq
          return newVal == existVal;
        });
        if (!colsMatch) return false;
        // Check WHERE condition on existing row (partial index condition)
        if (conflictWhere) {
          return evalWhere(conflictWhere, r, []);
        }
        return true;
      });
    }

    if (existingIdx !== -1) {
      if (isOrIgnore) {
        return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
      }
      if (isOrReplace) {
        table.rows[existingIdx] = newRow;
        this._rowsModified = 1;
        return { rows: { _array: [], length: 0 }, rowsAffected: 1 };
      }
      if (isUpsert) {
        // Parse ON CONFLICT DO UPDATE SET ...
        const setM = sql.match(/DO UPDATE SET\s+(.+)$/is);
        if (setM) {
          // For upsert, the "excluded" values are the new row values
          // We need to resolve them from newRow
          const assignments = parseUpsertSet(setM[1], table.rows[existingIdx], newRow);
          Object.assign(table.rows[existingIdx], assignments);
        } else {
          Object.assign(table.rows[existingIdx], newRow);
        }
        this._rowsModified = 1;
        return { rows: { _array: [], length: 0 }, rowsAffected: 1 };
      }
    }

    table.rows.push(newRow);
    this._rowsModified = 1;
    return { rows: { _array: [], length: 0 }, rowsAffected: 1, insertId: pkVal };
  }

  _update(sql, params) {
    const tableM = sql.match(/UPDATE\s+["'`]?(\w+)["'`]?\s+SET/i);
    if (!tableM) return this._ok();
    const tableName = tableM[1].toLowerCase();
    const table = this._tables[tableName];
    if (!table) return this._ok();

    const setM = sql.match(/SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
    if (!setM) return this._ok();

    const setStr = setM[1];
    const whereClause = setM[2] ? setM[2].trim() : null;

    // Count ? in SET clause to know how many params it consumes
    const setParamCount = (setStr.match(/\?/g) || []).length;
    const setParams = params.splice(0, setParamCount);
    const whereParams = [...params];

    let count = 0;
    for (const row of table.rows) {
      const wp = [...whereParams];
      if (!whereClause || evalWhere(whereClause, row, wp)) {
        const sp = [...setParams];
        const assignments = parseSetClause(setStr, row, sp);
        Object.assign(row, assignments);
        count++;
      }
    }

    this._rowsModified = count;
    return { rows: { _array: [], length: 0 }, rowsAffected: count };
  }

  _delete(sql, params) {
    const tableM = sql.match(/FROM\s+["'`]?(\w+)["'`]?/i);
    if (!tableM) return this._ok();
    const tableName = tableM[1].toLowerCase();
    const table = this._tables[tableName];
    if (!table) return this._ok();

    const whereM = sql.match(/WHERE\s+(.+)$/is);
    const whereClause = whereM ? whereM[1].trim() : null;

    const before = table.rows.length;
    if (!whereClause) {
      table.rows = [];
    } else {
      table.rows = table.rows.filter(row => {
        const p = [...params];
        return !evalWhere(whereClause, row, p);
      });
    }
    const count = before - table.rows.length;
    this._rowsModified = count;
    return { rows: { _array: [], length: 0 }, rowsAffected: count };
  }

  _select(sql, params) {
    const tableM = sql.match(/FROM\s+["'`]?(\w+)["'`]?/i);
    if (!tableM) return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
    const tableName = tableM[1].toLowerCase();

    // sqlite_master virtual table — return table names from _tables and index names from _indexes
    if (tableName === 'sqlite_master') {
      const whereM = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/is);
      const whereClause = whereM ? whereM[1].trim() : null;
      const tableRows = Object.keys(this._tables).map(name => ({
        type: 'table',
        name,
        tbl_name: name,
        rootpage: 1,
        sql: '',
      }));
      const indexRows = Object.values(this._indexes).map(idx => ({
        type: 'index',
        name: idx.name,
        tbl_name: idx.tbl_name,
        rootpage: 2,
        sql: '',
      }));
      const masterRows = [...tableRows, ...indexRows];
      const filtered = masterRows.filter(row => {
        if (!whereClause) return true;
        const p = [...params];
        return evalWhere(whereClause, row, p);
      });
      return { rows: { _array: filtered, length: filtered.length }, rowsAffected: 0 };
    }

    const table = this._tables[tableName];
    if (!table) return { rows: { _array: [], length: 0 }, rowsAffected: 0 };

    // Extract WHERE (before GROUP BY / ORDER BY / LIMIT / OFFSET)
    const whereM = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/is);
    const whereClause = whereM ? whereM[1].trim() : null;

    const groupByM = sql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/is);
    const orderM = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s+OFFSET|$)/is);
    const limitM = sql.match(/LIMIT\s+(\?|\d+)/i);
    const offsetM = sql.match(/OFFSET\s+(\?|\d+)/i);

    // Count params consumed by WHERE
    const whereParamCount = whereClause ? (whereClause.match(/\?/g) || []).length : 0;
    const whereParams = params.splice(0, whereParamCount);

    let rows = table.rows.filter(row => {
      if (!whereClause) return true;
      const p = [...whereParams];
      return evalWhere(whereClause, row, p);
    });

    // SELECT columns — parse before GROUP BY to detect aggregates
    const colM = sql.match(/^SELECT\s+(.+?)\s+FROM/is);
    const colSpec = colM ? colM[1].trim() : '*';

    // Parse column specs into descriptors: { alias, expr, aggFn, aggCol }
    function parseColSpecs(spec) {
      if (spec === '*') return [{ alias: '*', expr: '*', aggFn: null, aggCol: null }];
      return splitComma(spec).map(s => {
        s = s.trim();
        // alias: "expr AS alias" or "expr alias"
        const asM = s.match(/^(.+?)\s+AS\s+(\w+)$/i);
        const alias = asM ? asM[2].toLowerCase() : null;
        const expr = asM ? asM[1].trim() : s;
        // aggregate: COUNT(*), MIN(col), MAX(col), SUM(col)
        const aggM = expr.match(/^(COUNT|MIN|MAX|SUM)\s*\(\s*(.+?)\s*\)$/i);
        if (aggM) {
          return { alias: alias || (aggM[1].toLowerCase() + '_' + aggM[2].toLowerCase()), expr, aggFn: aggM[1].toUpperCase(), aggCol: aggM[2] };
        }
        const colName = unquote(expr).toLowerCase();
        return { alias: alias || colName, expr, aggFn: null, aggCol: null };
      });
    }

    const colSpecs = parseColSpecs(colSpec);
    const hasAgg = colSpecs.some(c => c.aggFn !== null);

    // GROUP BY
    if (groupByM || hasAgg) {
      const groupCols = groupByM
        ? groupByM[1].split(',').map(s => unquote(s.trim()).toLowerCase())
        : [];

      // Group rows
      const groups = new Map();
      for (const row of rows) {
        const key = groupCols.length > 0
          ? groupCols.map(c => row[c] ?? null).join('\x00')
          : '__all__';
        if (!groups.has(key)) groups.set(key, { key, rows: [], repr: row });
        groups.get(key).rows.push(row);
      }

      const grouped = [];
      for (const { rows: gRows, repr } of groups.values()) {
        const out = {};
        for (const spec of colSpecs) {
          if (spec.expr === '*') {
            Object.assign(out, repr);
          } else if (spec.aggFn === 'COUNT') {
            out[spec.alias] = gRows.length;
          } else if (spec.aggFn === 'MIN') {
            const col = unquote(spec.aggCol).toLowerCase();
            const vals = gRows.map(r => r[col]).filter(v => v !== null && v !== undefined);
            out[spec.alias] = vals.length > 0 ? Math.min(...vals.map(Number)) : null;
          } else if (spec.aggFn === 'MAX') {
            const col = unquote(spec.aggCol).toLowerCase();
            const vals = gRows.map(r => r[col]).filter(v => v !== null && v !== undefined);
            out[spec.alias] = vals.length > 0 ? Math.max(...vals.map(Number)) : null;
          } else if (spec.aggFn === 'SUM') {
            const col = unquote(spec.aggCol).toLowerCase();
            out[spec.alias] = gRows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
          } else {
            const col = unquote(spec.expr).toLowerCase();
            out[spec.alias] = repr[col] ?? null;
          }
        }
        grouped.push(out);
      }

      // If no groups but there are aggregate columns (e.g. COUNT(*) on empty table),
      // return a single row with zero/null aggregates
      if (grouped.length === 0 && hasAgg && groupCols.length === 0) {
        const out = {};
        for (const spec of colSpecs) {
          if (spec.aggFn === 'COUNT') out[spec.alias] = 0;
          else if (spec.aggFn) out[spec.alias] = null;
          else out[spec.alias] = null;
        }
        grouped.push(out);
      }

      rows = grouped;
    }

    // ORDER BY
    if (orderM) {
      const orderParts = orderM[1].split(',').map(s => s.trim());
      rows = [...rows].sort((a, b) => {
        for (const part of orderParts) {
          const m = part.match(/^["'`]?(\w+)["'`]?\s*(ASC|DESC)?$/i);
          if (!m) continue;
          const col = m[1].toLowerCase();
          const dir = (m[2] || 'ASC').toUpperCase();
          const av = a[col] ?? null;
          const bv = b[col] ?? null;
          if (av === bv) continue;
          if (av === null) return dir === 'ASC' ? 1 : -1;
          if (bv === null) return dir === 'ASC' ? -1 : 1;
          const cmp = av < bv ? -1 : 1;
          return dir === 'ASC' ? cmp : -cmp;
        }
        return 0;
      });
    }

    // LIMIT (process before OFFSET since LIMIT ? OFFSET ? order in SQL)
    if (limitM) {
      const val = limitM[1] === '?' ? (params.shift() ?? rows.length) : parseInt(limitM[1]);
      // Apply OFFSET first if present, then LIMIT
      if (offsetM) {
        const offsetVal = offsetM[1] === '?' ? (params.shift() ?? 0) : parseInt(offsetM[1]);
        rows = rows.slice(offsetVal, offsetVal + val);
      } else {
        rows = rows.slice(0, val);
      }
    } else if (offsetM) {
      const val = offsetM[1] === '?' ? (params.shift() ?? 0) : parseInt(offsetM[1]);
      rows = rows.slice(val);
    }

    // Project columns (skip if already projected by GROUP BY)
    let result;
    if (colSpec === '*' || hasAgg || groupByM) {
      result = rows.map(r => ({ ...r }));
    } else {
      result = rows.map(r => {
        const out = {};
        for (const spec of colSpecs) {
          if (spec.expr === '*') {
            Object.assign(out, r);
          } else {
            const col = unquote(spec.expr).toLowerCase();
            out[spec.alias] = r[col] ?? null;
          }
        }
        return out;
      });
    }

    return { rows: { _array: result, length: result.length }, rowsAffected: 0 };
  }

  transaction(fn) {
    fn();
  }

  close() {
    this._tables = {};
  }
}

// ─── Upsert SET parser (uses excluded.col = newRow[col]) ─────────────────────

function parseUpsertSet(setStr, existingRow, newRow) {
  const result = {};
  const parts = splitComma(setStr);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const col = unquote(part.slice(0, eqIdx).trim()).toLowerCase();
    const valExpr = part.slice(eqIdx + 1).trim();

    // CASE WHEN ... THEN ... ELSE ... END
    const caseM = valExpr.match(/^CASE\s+WHEN\s+(.+?)\s+THEN\s+(.+?)\s+ELSE\s+(.+?)\s+END$/is);
    if (caseM) {
      const condExpr = caseM[1].trim();
      const thenExpr = caseM[2].trim();
      const elseExpr = caseM[3].trim();
      // Evaluate condition using both excluded (newRow) and existing row context
      const condResult = evalCaseCondition(condExpr, existingRow, newRow);
      result[col] = condResult
        ? resolveUpsertVal(thenExpr, existingRow, newRow)
        : resolveUpsertVal(elseExpr, existingRow, newRow);
      continue;
    }

    // COALESCE(excluded.col, col)
    const coalesceM = valExpr.match(/^COALESCE\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (coalesceM) {
      const first = resolveUpsertVal(coalesceM[1].trim(), existingRow, newRow);
      const second = resolveUpsertVal(coalesceM[2].trim(), existingRow, newRow);
      result[col] = (first !== null && first !== undefined) ? first : second;
      continue;
    }

    // MAX(excluded.col, col)
    const maxM = valExpr.match(/^MAX\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (maxM) {
      const a = resolveUpsertVal(maxM[1].trim(), existingRow, newRow);
      const b = resolveUpsertVal(maxM[2].trim(), existingRow, newRow);
      result[col] = Math.max(Number(a) || 0, Number(b) || 0);
      continue;
    }

    result[col] = resolveUpsertVal(valExpr, existingRow, newRow);
  }
  return result;
}

// Evaluate a CASE WHEN condition that may reference excluded.col and outbox.col
function evalCaseCondition(condExpr, existingRow, newRow) {
  // Handle: json_extract(excluded.col, path) > json_extract(outbox.col, path)
  // or: json_extract(excluded.col, path) > json_extract(col, path)
  const cmpM = condExpr.match(/^(.+?)\s*([><=!]+)\s*(.+)$/);
  if (cmpM) {
    const lhs = resolveUpsertExpr(cmpM[1].trim(), existingRow, newRow);
    const op = cmpM[2];
    const rhs = resolveUpsertExpr(cmpM[3].trim(), existingRow, newRow);
    if (op === '>') return Number(lhs) > Number(rhs);
    if (op === '>=') return Number(lhs) >= Number(rhs);
    if (op === '<') return Number(lhs) < Number(rhs);
    if (op === '<=') return Number(lhs) <= Number(rhs);
    // eslint-disable-next-line eqeqeq
    if (op === '=') return lhs == rhs;
    // eslint-disable-next-line eqeqeq
    if (op === '!=' || op === '<>') return lhs != rhs;
  }
  return false;
}

// Resolve an expression that may be json_extract(excluded.col, path) or json_extract(col, path)
function resolveUpsertExpr(expr, existingRow, newRow) {
  // json_extract(excluded.col, path)
  const jeExcM = expr.match(/^json_extract\s*\(\s*excluded\.(\w+)\s*,\s*'([^']+)'\s*\)$/i);
  if (jeExcM) {
    const col = jeExcM[1].toLowerCase();
    const path = jeExcM[2];
    const val = newRow[col] ?? null;
    if (val === null) return null;
    return jsonExtract(String(val), path);
  }
  // json_extract(table.col, path) or json_extract(col, path)
  const jeM = expr.match(/^json_extract\s*\(\s*(?:\w+\.)?(\w+)\s*,\s*'([^']+)'\s*\)$/i);
  if (jeM) {
    const col = jeM[1].toLowerCase();
    const path = jeM[2];
    const val = existingRow ? (existingRow[col] ?? null) : null;
    if (val === null) return null;
    return jsonExtract(String(val), path);
  }
  return resolveUpsertVal(expr, existingRow, newRow);
}

function resolveUpsertVal(expr, existingRow, newRow) {
  expr = expr.trim();
  if (/^NULL$/i.test(expr)) return null;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
  if (/^'[^']*'$/.test(expr)) return expr.slice(1, -1);
  // excluded.col → new value
  if (/^excluded\./i.test(expr)) {
    const col = expr.replace(/^excluded\./i, '').toLowerCase();
    return newRow[col] ?? null;
  }
  // table.col (e.g. outbox.payload_json) → existing value
  if (/^\w+\.\w+$/.test(expr)) {
    const col = expr.split('.')[1].toLowerCase();
    if (existingRow && Object.prototype.hasOwnProperty.call(existingRow, col)) {
      return existingRow[col];
    }
    return null;
  }
  // Arithmetic: col + 1, col - 1, col + excluded.col, etc.
  const arithM = expr.match(/^([\w.]+)\s*([+\-])\s*([\w.]+|-?\d+(?:\.\d+)?)$/);
  if (arithM) {
    const lhs = resolveUpsertVal(arithM[1], existingRow, newRow);
    const op = arithM[2];
    const rhs = resolveUpsertVal(arithM[3], existingRow, newRow);
    if (lhs === null || rhs === null) return null;
    return op === '+' ? Number(lhs) + Number(rhs) : Number(lhs) - Number(rhs);
  }
  // column reference → existing value
  const lower = expr.toLowerCase();
  if (existingRow && Object.prototype.hasOwnProperty.call(existingRow, lower)) {
    return existingRow[lower];
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function open({ name }) {
  return new InMemoryDB();
}

function closeAll() {}

module.exports = { open, closeAll };
