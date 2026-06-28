(function () {
  'use strict';

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_ROWS = 1000;
  const CHUNK_SIZE = 25;
  let parsedRows = [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[ch]);
  }

  function normalizeHeader(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[\u200c\u200f]/g, '')
      .replace(/[\s_\-()]+/g, '');
  }

  const headerAliases = {
    question: ['question', 'پرسش', 'سوال', 'متنپرسش'],
    answer: ['answer', 'پاسخ', 'متنپاسخ'],
    category: ['category', 'دستهبندی', 'گروه'],
    keywords: ['keywords', 'keyword', 'کلیدواژه', 'کلیدواژهها'],
    sort_order: ['sortorder', 'ترتیب', 'ترتیبنمایش'],
    is_active: ['isactive', 'active', 'فعال', 'وضعیت'],
    show_on_public: ['showonpublic', 'public', 'عمومی', 'نمایشعمومی'],
    use_for_chatbot: ['useforchatbot', 'chatbot', 'چتبات', 'استفادهدرچتبات']
  };

  function canonicalHeader(value) {
    const normalized = normalizeHeader(value);
    return Object.keys(headerAliases).find((key) => headerAliases[key].includes(normalized)) || '';
  }

  function boolValue(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    const clean = String(value).trim().toLowerCase();
    if (['0', 'false', 'no', 'خیر', 'غیرفعال'].includes(clean)) return false;
    if (['1', 'true', 'yes', 'بله', 'فعال'].includes(clean)) return true;
    return fallback;
  }

  function rowsToObjects(matrix) {
    const firstDataIndex = matrix.findIndex((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
    if (firstDataIndex < 0) throw new Error('فایل خالی است');
    const headers = matrix[firstDataIndex].map(canonicalHeader);
    const questionIndex = headers.indexOf('question');
    const answerIndex = headers.indexOf('answer');
    if (questionIndex < 0 || answerIndex < 0) {
      throw new Error('ستون‌های «پرسش» و «پاسخ» در ردیف اول فایل الزامی هستند');
    }

    const result = [];
    for (let rowIndex = firstDataIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex] || [];
      if (!row.some((cell) => String(cell ?? '').trim())) continue;
      const item = { row_number: rowIndex + 1 };
      headers.forEach((header, colIndex) => {
        if (header) item[header] = row[colIndex] ?? '';
      });
      item.question = String(item.question || '').trim();
      item.answer = String(item.answer || '').trim();
      item.category = String(item.category || '').trim();
      item.keywords = String(item.keywords || '').trim();
      item.sort_order = Number.parseInt(item.sort_order, 10) || 0;
      item.is_active = boolValue(item.is_active, true);
      item.show_on_public = boolValue(item.show_on_public, true);
      item.use_for_chatbot = boolValue(item.use_for_chatbot, true);
      result.push(item);
      if (result.length > MAX_ROWS) throw new Error(`حداکثر ${MAX_ROWS} ردیف در هر فایل قابل ورود است`);
    }
    if (!result.length) throw new Error('پس از ردیف عنوان، هیچ پرسشی در فایل پیدا نشد');
    return result;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += char;
    }
    row.push(field.replace(/\r$/, ''));
    if (row.some((cell) => cell !== '')) rows.push(row);
    return rows;
  }

  function findEndOfCentralDirectory(bytes) {
    const min = Math.max(0, bytes.length - 65557);
    for (let index = bytes.length - 22; index >= min; index -= 1) {
      if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
    }
    return -1;
  }

  function unzipEntries(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const eocd = findEndOfCentralDirectory(bytes);
    if (eocd < 0) throw new Error('ساختار فایل Excel معتبر نیست');
    const entryCount = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');
    const entries = new Map();
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('فهرست داخلی فایل Excel آسیب دیده است');
      const compression = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
      entries.set(name, { compression, compressedSize, localOffset });
      offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return { bytes, view, entries };
  }

  async function readZipEntry(zip, name) {
    const entry = zip.entries.get(name);
    if (!entry) return '';
    const { bytes, view } = zip;
    const local = entry.localOffset;
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('بخش داخلی فایل Excel قابل خواندن نیست');
    const nameLength = view.getUint16(local + 26, true);
    const extraLength = view.getUint16(local + 28, true);
    const start = local + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + entry.compressedSize);
    let output;
    if (entry.compression === 0) output = compressed;
    else if (entry.compression === 8) {
      if (typeof DecompressionStream !== 'function') throw new Error('مرورگر فعلی امکان خواندن فایل XLSX را ندارد؛ فایل CSV استفاده کنید');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('نوع فشرده‌سازی فایل Excel پشتیبانی نمی‌شود');
    return new TextDecoder('utf-8').decode(output);
  }

  function columnIndex(cellReference) {
    const letters = String(cellReference || '').match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
    let value = 0;
    for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
    return value - 1;
  }

  async function parseXlsx(buffer) {
    const zip = unzipEntries(buffer);
    const sharedXml = await readZipEntry(zip, 'xl/sharedStrings.xml');
    const parser = new DOMParser();
    const shared = sharedXml
      ? Array.from(parser.parseFromString(sharedXml, 'application/xml').getElementsByTagNameNS('*', 'si')).map((node) =>
          Array.from(node.getElementsByTagNameNS('*', 't')).map((text) => text.textContent || '').join(''))
      : [];
    const sheetName = Array.from(zip.entries.keys())
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    if (!sheetName) throw new Error('هیچ برگه‌ای در فایل Excel پیدا نشد');
    const sheetXml = await readZipEntry(zip, sheetName);
    const documentXml = parser.parseFromString(sheetXml, 'application/xml');
    const matrix = [];
    Array.from(documentXml.getElementsByTagNameNS('*', 'row')).forEach((rowNode) => {
      const rowNumber = Math.max(1, Number(rowNode.getAttribute('r')) || matrix.length + 1);
      const row = [];
      Array.from(rowNode.getElementsByTagNameNS('*', 'c')).forEach((cell) => {
        const index = columnIndex(cell.getAttribute('r'));
        const type = cell.getAttribute('t') || '';
        let value = '';
        if (type === 'inlineStr') value = Array.from(cell.getElementsByTagNameNS('*', 't')).map((node) => node.textContent || '').join('');
        else {
          const raw = cell.getElementsByTagNameNS('*', 'v')[0]?.textContent || '';
          value = type === 's' ? (shared[Number(raw)] ?? '') : raw;
        }
        row[index] = value;
      });
      matrix[rowNumber - 1] = row;
    });
    return matrix;
  }

  function setSummary(message, type = 'info', errors = []) {
    const box = document.getElementById('faqImportSummary');
    if (!box) return;
    box.className = `nv-faq-import-summary is-visible is-${type}`;
    box.innerHTML = `<div>${escapeHtml(message)}</div>${errors.length ? `<ul class="nv-faq-import-errors">${errors.slice(0, 20).map((item) => `<li>ردیف ${escapeHtml(item.row)}: ${escapeHtml(item.message)}</li>`).join('')}</ul>` : ''}`;
  }

  function openImportModal() {
    parsedRows = [];
    const input = document.getElementById('faqImportFile');
    const name = document.getElementById('faqImportFileName');
    const summary = document.getElementById('faqImportSummary');
    if (input) input.value = '';
    if (name) name.textContent = 'فایل XLSX یا CSV را انتخاب کنید';
    if (summary) summary.className = 'nv-faq-import-summary';
    const modal = document.getElementById('faqImportModal');
    if (window.openModal) window.openModal('faqImportModal');
    else modal?.classList.add('show');
  }

  function closeImportModal() {
    if (window.closeModal) window.closeModal('faqImportModal');
    else document.getElementById('faqImportModal')?.classList.remove('show');
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) throw new Error('حجم فایل باید کمتر از ۵ مگابایت باشد');
    const extension = file.name.split('.').pop().toLowerCase();
    let matrix;
    if (extension === 'csv') matrix = parseCsv(await file.text());
    else if (extension === 'xlsx') matrix = await parseXlsx(await file.arrayBuffer());
    else throw new Error('فقط فایل‌های XLSX و CSV قابل قبول هستند');
    parsedRows = rowsToObjects(matrix);
    document.getElementById('faqImportFileName').textContent = file.name;
    setSummary(`${parsedRows.length.toLocaleString('fa-IR')} ردیف آماده ورود است`, 'info');
  }

  async function submitImport(event) {
    event.preventDefault();
    if (!parsedRows.length) { setSummary('ابتدا فایل معتبر انتخاب کنید', 'error'); return; }
    const button = document.getElementById('faqImportSubmit');
    const duplicateMode = document.getElementById('faqDuplicateMode')?.value === 'update' ? 'update' : 'skip';
    const totals = { inserted: 0, updated: 0, skipped: 0, invalid: 0, errors: [] };
    const original = button.innerHTML;
    button.disabled = true;
    try {
      for (let offset = 0; offset < parsedRows.length; offset += CHUNK_SIZE) {
        button.innerHTML = `<span>در حال ورود ${Math.min(offset + CHUNK_SIZE, parsedRows.length).toLocaleString('fa-IR')} از ${parsedRows.length.toLocaleString('fa-IR')}</span>`;
        const response = await window.apiRequest('/admin/faqs/import', 'POST', {
          rows: parsedRows.slice(offset, offset + CHUNK_SIZE),
          duplicate_mode: duplicateMode
        });
        const result = response.result || {};
        ['inserted', 'updated', 'skipped', 'invalid'].forEach((key) => { totals[key] += Number(result[key] || 0); });
        if (Array.isArray(result.errors)) totals.errors.push(...result.errors);
      }
      setSummary(`ورود فایل انجام شد: ${totals.inserted.toLocaleString('fa-IR')} افزوده، ${totals.updated.toLocaleString('fa-IR')} به‌روزرسانی، ${totals.skipped.toLocaleString('fa-IR')} رد شد و ${totals.invalid.toLocaleString('fa-IR')} نامعتبر بود`, totals.invalid ? 'info' : 'success', totals.errors);
      if (typeof window.loadFaqs === 'function') await window.loadFaqs();
    } catch (error) {
      setSummary(error.message || 'ورود فایل ناموفق بود', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('openFaqImportBtn')?.addEventListener('click', openImportModal);
    document.querySelectorAll('[data-faq-import-close]').forEach((button) => button.addEventListener('click', closeImportModal));
    document.getElementById('faqImportFile')?.addEventListener('change', async (event) => {
      try { await handleFile(event.target.files?.[0]); }
      catch (error) { parsedRows = []; setSummary(error.message || 'خواندن فایل ناموفق بود', 'error'); }
    });
    document.getElementById('faqImportForm')?.addEventListener('submit', submitImport);
  });
})();
