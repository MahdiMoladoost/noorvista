// ============================================
// Sadra - Persian Datepicker (تقویم شمسی حرفه‌ای)
// ============================================


/* Sadra calendar month/year listboxes v2.1.70 */
(function installNVCalendarListbox(global) {
  if (global.NVCalendarListbox && global.NVCalendarListbox.version === '2.1.70') return;

  let activeShell = null;
  let uid = 0;

  function directSelect(shell) {
    return Array.from(shell.children).find(child => child.matches && child.matches('select.nv-tw-calendar-select')) || null;
  }

  function optionButtons(shell) {
    return Array.from(shell.querySelectorAll('.nv-calendar-listbox-option:not([disabled])'));
  }

  function close(shell = activeShell, restoreFocus = false) {
    if (!shell) return;
    const trigger = shell.querySelector('.nv-calendar-listbox-trigger');
    const menu = shell.querySelector('.nv-calendar-listbox-menu');
    shell.classList.remove('open', 'open-up');
    if (menu) {
      menu.hidden = true;
      menu.style.maxHeight = '';
    }
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && document.contains(trigger)) trigger.focus({ preventScroll: true });
    }
    if (activeShell === shell) activeShell = null;
  }

  function closeAll(except = null) {
    document.querySelectorAll('.nv-calendar-listbox.open').forEach(shell => {
      if (shell !== except) close(shell);
    });
  }

  function focusOption(shell, mode = 'selected') {
    const buttons = optionButtons(shell);
    if (!buttons.length) return;
    let target = buttons[0];
    if (mode === 'last') target = buttons[buttons.length - 1];
    if (mode === 'selected') target = buttons.find(button => button.getAttribute('aria-selected') === 'true') || target;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
  }

  function positionMenu(shell) {
    if (!shell || !shell.classList.contains('open')) return;
    const trigger = shell.querySelector('.nv-calendar-listbox-trigger');
    const menu = shell.querySelector('.nv-calendar-listbox-menu');
    if (!trigger || !menu || menu.hidden) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.max(menu.scrollHeight, menu.getBoundingClientRect().height || 0);
    const below = viewportTop + viewportHeight - rect.bottom - 12;
    const above = rect.top - viewportTop - 12;
    const openUp = below < Math.min(menuHeight, 180) && above > below;
    shell.classList.toggle('open-up', openUp);
    const available = Math.max(116, (openUp ? above : below) - 8);
    menu.style.maxHeight = `${Math.min(232, available)}px`;
  }

  function open(shell, focusMode = null) {
    const trigger = shell.querySelector('.nv-calendar-listbox-trigger');
    const menu = shell.querySelector('.nv-calendar-listbox-menu');
    if (!trigger || !menu || trigger.disabled) return;
    closeAll(shell);
    activeShell = shell;
    shell.classList.add('open');
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      positionMenu(shell);
      if (focusMode) focusOption(shell, focusMode);
    });
  }

  function sync(shell) {
    const select = directSelect(shell);
    const value = shell.querySelector('.nv-calendar-listbox-value');
    if (!select || !value) return;
    const selected = select.options[select.selectedIndex] || select.options[0];
    value.textContent = selected ? selected.textContent.trim() : 'انتخاب کنید';
    shell.querySelectorAll('.nv-calendar-listbox-option').forEach(button => {
      const selectedNow = String(button.dataset.value) === String(select.value);
      button.classList.toggle('selected', selectedNow);
      button.setAttribute('aria-selected', selectedNow ? 'true' : 'false');
      button.tabIndex = selectedNow ? 0 : -1;
    });
  }

  function choose(shell, value) {
    const select = directSelect(shell);
    if (!select || select.disabled) return;
    close(shell);
    if (String(select.value) === String(value)) return;
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enhance(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    if (activeShell && !document.contains(activeShell)) activeShell = null;

    root.querySelectorAll('.nv-tw-calendar-select-shell').forEach(shell => {
      const select = directSelect(shell);
      if (!select || shell.dataset.nvCalendarListboxReady === '1') return;

      shell.dataset.nvCalendarListboxReady = '1';
      shell.classList.add('nv-calendar-listbox');
      select.classList.add('nv-calendar-listbox-native');
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');

      const id = `nv-calendar-listbox-${++uid}`;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'nv-calendar-listbox-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', `${id}-menu`);
      trigger.setAttribute('aria-label', select.getAttribute('aria-label') || 'انتخاب');
      trigger.innerHTML = '<span class="nv-calendar-listbox-value"></span><span class="nv-calendar-listbox-chevron" aria-hidden="true"></span>';

      const menu = document.createElement('div');
      menu.id = `${id}-menu`;
      menu.className = 'nv-calendar-listbox-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', select.getAttribute('aria-label') || 'انتخاب');
      menu.hidden = true;

      Array.from(select.options).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nv-calendar-listbox-option';
        button.dataset.value = option.value;
        button.textContent = option.textContent.trim();
        button.setAttribute('role', 'option');
        if (option.disabled) button.disabled = true;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          choose(shell, button.dataset.value);
        });
        button.addEventListener('keydown', event => {
          const buttons = optionButtons(shell);
          const index = buttons.indexOf(button);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = buttons[(index + step + buttons.length) % buttons.length];
            next?.focus({ preventScroll: true });
            next?.scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const next = event.key === 'Home' ? buttons[0] : buttons[buttons.length - 1];
            next?.focus({ preventScroll: true });
            next?.scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(shell, button.dataset.value);
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            close(shell, event.key === 'Escape');
          }
        });
        menu.appendChild(button);
      });

      select.insertAdjacentElement('afterend', trigger);
      trigger.insertAdjacentElement('afterend', menu);

      trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        shell.classList.contains('open') ? close(shell) : open(shell);
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          open(shell, event.key === 'ArrowDown' ? 'selected' : 'last');
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          shell.classList.contains('open') ? close(shell) : open(shell, 'selected');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          close(shell);
        }
      });
      select.addEventListener('change', () => sync(shell));
      sync(shell);
    });
  }

  document.addEventListener('pointerdown', event => {
    if (activeShell && !activeShell.contains(event.target)) close(activeShell);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeShell && !activeShell.contains(document.activeElement)) close(activeShell);
  }, true);
  const repositionActiveMenu = () => {
    if (activeShell) requestAnimationFrame(() => positionMenu(activeShell));
  };
  window.addEventListener('resize', repositionActiveMenu, { passive: true });
  window.addEventListener('scroll', repositionActiveMenu, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', repositionActiveMenu, { passive: true });
  window.visualViewport?.addEventListener('scroll', repositionActiveMenu, { passive: true });

  global.NVCalendarListbox = { version: '2.1.70', enhance, closeAll, positionMenu };
})(window);

function getAccurateTodayJalali() {
    const now = new Date();
    const localGregorian = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (typeof window.toJalaliDateString === 'function') {
        const normalized = toEnglishNumber(window.toJalaliDateString(localGregorian));
        const parts = normalized.split('/').map(Number);
        if (parts.length === 3 && parts.every(Number.isFinite)) {
            return { year: parts[0], month: parts[1], day: parts[2] };
        }
    }
    return gregorianToJalali(now);
}

function getAccurateGregorianParts(jalaliYear, jalaliMonth, jalaliDay) {
    if (typeof window.toGregorianDateString === 'function') {
        const value = window.toGregorianDateString(`${jalaliYear}/${jalaliMonth}/${jalaliDay}`);
        const parts = String(value || '').split('-').map(Number);
        if (parts.length === 3 && parts.every(Number.isFinite)) {
            return { year: parts[0], month: parts[1], day: parts[2] };
        }
    }
    return jalaliToGregorian(jalaliYear, jalaliMonth, jalaliDay);
}

class PersianDatepicker {
    constructor(inputElement, options = {}) {
        this.input = typeof inputElement === 'string' ? document.querySelector(inputElement) : inputElement;
        if (!this.input) return;
        
        this.options = {
            format: 'YYYY/MM/DD',
            autoClose: true,
            ...options
        };
        
        this.isOpen = false;
        this.init();
    }
    
    init() {
        if (this.input.hasAttribute('data-datepicker-initialized')) return;
        
        this.input.style.cursor = 'pointer';
        this.input.readOnly = true;
        this.input.setAttribute('data-datepicker-initialized', 'true');
        
        this.parseCurrentDate();
        this.createPicker();
        
        this.input.addEventListener('click', () => this.toggle());
    }
    
    parseCurrentDate() {
        const value = this.input.value;
        if (value && isValidJalaliDate(value)) {
            const cleaned = toEnglishNumber(value);
            const parts = cleaned.split('/');
            this.currentYear = parseInt(parts[0]);
            this.currentMonth = parseInt(parts[1]);
            this.currentDay = parseInt(parts[2]);
        } else {
            const today = getAccurateTodayJalali();
            this.currentYear = today.year;
            this.currentMonth = today.month;
            this.currentDay = today.day;
        }
        
        this.displayYear = this.currentYear;
        this.displayMonth = this.currentMonth;
    }
    
    createPicker() {
        this.picker = document.createElement('div');
        this.picker.className = 'persian-datepicker';
        this.picker.style.cssText = `
            position: fixed;
            z-index: 100000;
            display: none;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            border: 1px solid #e2e8f0;
            width: 320px;
            max-width: calc(100vw - 24px);
            max-height: calc(100vh - 24px);
            overflow-y: auto;
            padding: 14px;
            font-family: 'Vazir', Tahoma, Arial, sans-serif;
            direction: rtl;
        `;
        
        document.body.appendChild(this.picker);
        this.render();
    }
    
    getYearRange() {
        const today = getAccurateTodayJalali();
        const descriptor = `${this.input.id || ''} ${this.input.name || ''} ${this.input.getAttribute('aria-label') || ''}`.toLowerCase();
        const isBirthDate = /birth|تولد/.test(descriptor) || this.input.dataset.dateMode === 'birth';
        let minYear = Number(this.input.dataset.jalaliMinYear || this.input.dataset.minYear || (isBirthDate ? today.year - 120 : today.year - 15));
        let maxYear = Number(this.input.dataset.jalaliMaxYear || this.input.dataset.maxYear || (isBirthDate ? today.year : today.year + 15));
        if (!Number.isFinite(minYear)) minYear = today.year - 15;
        if (!Number.isFinite(maxYear)) maxYear = today.year + 15;
        if (minYear > maxYear) [minYear, maxYear] = [maxYear, minYear];
        if (this.displayYear < minYear) minYear = this.displayYear;
        if (this.displayYear > maxYear) maxYear = this.displayYear;
        return { minYear, maxYear };
    }

    render() {
        if (!this.picker) return;
        
        const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
        
        const firstDayOfMonth = this.getFirstDayOfMonth(this.displayYear, this.displayMonth);
        const daysInMonth = this.getDaysInMonth(this.displayYear, this.displayMonth);
        
        const { minYear, maxYear } = this.getYearRange();
        const monthOptions = monthNames.map((name, index) => `<option value="${index + 1}" ${index + 1 === this.displayMonth ? 'selected' : ''}>${name}</option>`).join('');
        const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index)
            .map(year => `<option value="${year}" ${year === this.displayYear ? 'selected' : ''}>${toPersianNumber(year)}</option>`).join('');

        const periodLabel = `${monthNames[this.displayMonth - 1]} ${toPersianNumber(this.displayYear)}`;
        let html = `
            <div class="nv-jp-head">
                <button type="button" class="datepicker-prev" aria-label="ماه قبل">&rarr;</button>
                <div class="nv-jp-selects nv-tw-calendar-select-grid">
                    <div class="nv-tw-calendar-select-shell nv-jp-month-shell"><span class="tw-sr-only">ماه</span><select class="datepicker-month-select nv-tw-calendar-select" data-no-pretty-select aria-label="انتخاب ماه">${monthOptions}</select></div>
                    <div class="nv-tw-calendar-select-shell nv-jp-year-shell"><span class="tw-sr-only">سال</span><select class="datepicker-year-select nv-tw-calendar-select" data-no-pretty-select aria-label="انتخاب سال">${yearOptions}</select></div>
                </div>
                <button type="button" class="datepicker-next" aria-label="ماه بعد">&larr;</button>
                <strong class="nv-jp-period-label tw-sr-only" aria-live="polite">${periodLabel}</strong>
            </div>
            <div class="nv-jp-week">
                ${weekDays.map(day => `<span>${day}</span>`).join('')}
            </div>
            <div class="nv-jp-days">
        `;
        
        // روزهای خالی ابتدای ماه
        for (let i = 0; i < firstDayOfMonth; i++) {
            html += `<span aria-hidden="true"></span>`;
        }
        
        // روزهای ماه
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = (this.displayYear === this.currentYear && 
                            this.displayMonth === this.currentMonth && 
                            d === this.currentDay);
            const isSelected = (this.displayYear === this.currentYear && 
                               this.displayMonth === this.currentMonth && 
                               d === this.currentDay);
            
            const classes = ['datepicker-day', 'nv-jp-day'];
            if (isToday) classes.push('today');
            if (isSelected) classes.push('active');
            html += `<button type="button" class="${classes.join(' ')}" data-day="${d}">${toPersianNumber(d)}</button>`;
        }
        
        html += `</div>`;
        html += `
            <div class="nv-jp-actions">
                <button type="button" class="datepicker-today">امروز</button>
                <button type="button" class="datepicker-clear">پاک کردن</button>
            </div>
        `;
        
        this.picker.innerHTML = html;
        window.NVCalendarListbox?.enhance(this.picker);
        
        // رویدادها
        this.picker.querySelector('.datepicker-prev')?.addEventListener('click', () => this.changeMonth(-1));
        this.picker.querySelector('.datepicker-next')?.addEventListener('click', () => this.changeMonth(1));
        this.picker.querySelector('.datepicker-month-select')?.addEventListener('change', event => {
            this.displayMonth = Number(event.target.value) || 1;
            this.render();
            this.positionPicker();
        });
        this.picker.querySelector('.datepicker-year-select')?.addEventListener('change', event => {
            this.displayYear = Number(event.target.value) || this.displayYear;
            this.render();
            this.positionPicker();
        });
        this.picker.querySelector('.datepicker-today')?.addEventListener('click', () => this.selectToday());
        this.picker.querySelector('.datepicker-clear')?.addEventListener('click', () => this.clear());
        
        this.picker.querySelectorAll('.datepicker-day').forEach(el => {
            el.addEventListener('click', () => {
                const day = parseInt(el.getAttribute('data-day'));
                this.selectDate(day);
            });
        });
    }
    
    getFirstDayOfMonth(year, month) {
        const gregorian = getAccurateGregorianParts(year, month, 1);
        const date = new Date(gregorian.year, gregorian.month - 1, gregorian.day);
        let day = date.getDay();
        // تبدیل به شمسی (شنبه = 0)
        return day === 6 ? 0 : day + 1;
    }
    
    getDaysInMonth(year, month) {
        if (month <= 6) return 31;
        if (month <= 11) return 30;
        return this.isLeapYear(year) ? 30 : 29;
    }
    
    isLeapYear(year) {
        const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
        const mod = (year - 474) % 2820;
        const leap = (mod + 474) % 33;
        return remainders.includes(leap);
    }
    
    changeMonth(delta) {
        let newMonth = this.displayMonth + delta;
        let newYear = this.displayYear;
        
        if (newMonth < 1) {
            newMonth = 12;
            newYear--;
        } else if (newMonth > 12) {
            newMonth = 1;
            newYear++;
        }
        
        this.displayYear = newYear;
        this.displayMonth = newMonth;
        this.render();
        this.positionPicker();
    }
    
    selectDate(day) {
        this.currentYear = this.displayYear;
        this.currentMonth = this.displayMonth;
        this.currentDay = day;
        
        const formatted = `${toPersianNumber(this.currentYear)}/${toPersianNumber(this.currentMonth)}/${toPersianNumber(day)}`;
        this.input.value = formatted;
        
        if (this.options.autoClose) this.close();
        this.triggerChange();
    }
    
    selectToday() {
        const today = getAccurateTodayJalali();
        this.currentYear = today.year;
        this.currentMonth = today.month;
        this.currentDay = today.day;
        this.displayYear = today.year;
        this.displayMonth = today.month;
        
        const formatted = `${toPersianNumber(today.year)}/${toPersianNumber(today.month)}/${toPersianNumber(today.day)}`;
        this.input.value = formatted;
        
        if (this.options.autoClose) this.close();
        this.triggerChange();
        this.render();
    }
    
    clear() {
        this.input.value = '';
        if (this.options.autoClose) this.close();
        this.triggerChange();
    }
    
    triggerChange() {
        const event = new Event('change', { bubbles: true });
        this.input.dispatchEvent(event);
    }
    
    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }
    
    open() {
        // Re-read the field because edit forms may set a date after initialization.
        this.parseCurrentDate();
        this.render();
        this.isOpen = true;
        this.picker.style.display = 'block';
        this.positionPicker();
        if (!this._boundOutsideClick) this._boundOutsideClick = this.handleOutsideClick.bind(this);
        if (!this._boundReposition) this._boundReposition = () => this.isOpen && requestAnimationFrame(() => this.positionPicker());
        document.addEventListener('click', this._boundOutsideClick);
        window.addEventListener('resize', this._boundReposition, { passive: true });
        window.addEventListener('scroll', this._boundReposition, { passive: true, capture: true });
        window.visualViewport?.addEventListener('resize', this._boundReposition, { passive: true });
        window.visualViewport?.addEventListener('scroll', this._boundReposition, { passive: true });
    }
    
    close() {
        this.isOpen = false;
        this.picker.style.display = 'none';
        if (this._boundOutsideClick) document.removeEventListener('click', this._boundOutsideClick);
        if (this._boundReposition) {
            window.removeEventListener('resize', this._boundReposition);
            window.removeEventListener('scroll', this._boundReposition, true);
            window.visualViewport?.removeEventListener('resize', this._boundReposition);
            window.visualViewport?.removeEventListener('scroll', this._boundReposition);
        }
    }
    
    positionPicker() {
        if (!this.input || !this.picker || !document.contains(this.input)) return;
        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop || 0;
        const viewportLeft = viewport?.offsetLeft || 0;
        const viewportWidth = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
        const gap = 12;
        const offset = 8;
        const rect = this.input.getBoundingClientRect();
        const maximumWidth = Math.max(280, viewportWidth - (gap * 2));
        const requestedWidth = Math.max(312, Math.min(rect.width || 0, 332));
        const width = Math.min(requestedWidth, maximumWidth);
        const maximumHeight = Math.max(260, viewportHeight - (gap * 2));

        this.picker.style.position = 'fixed';
        this.picker.style.width = `${width}px`;
        this.picker.style.maxWidth = `${maximumWidth}px`;
        this.picker.style.maxHeight = `${maximumHeight}px`;
        this.picker.style.overflowY = 'auto';

        const pickerRect = this.picker.getBoundingClientRect();
        const pickerHeight = Math.min(pickerRect.height || this.picker.scrollHeight || 340, maximumHeight);
        const pickerWidth = pickerRect.width || width;
        const below = viewportTop + viewportHeight - rect.bottom - gap;
        const above = rect.top - viewportTop - gap;
        const requested = String(this.input.dataset.calendarPlacement || this.input.dataset.datepickerPlacement || 'auto').toLowerCase();
        let placement = requested === 'top' || requested === 'bottom'
            ? requested
            : (below >= pickerHeight ? 'bottom' : (above >= pickerHeight ? 'top' : (above > below ? 'top' : 'bottom')));
        let top = placement === 'top' ? rect.top - pickerHeight - offset : rect.bottom + offset;
        let left = rect.left + ((rect.width - pickerWidth) / 2);
        top = Math.min(Math.max(top, viewportTop + gap), Math.max(viewportTop + gap, viewportTop + viewportHeight - pickerHeight - gap));
        left = Math.min(Math.max(left, viewportLeft + gap), Math.max(viewportLeft + gap, viewportLeft + viewportWidth - pickerWidth - gap));

        this.picker.dataset.placement = placement;
        this.picker.style.top = `${Math.round(top)}px`;
        this.picker.style.left = `${Math.round(left)}px`;
        this.picker.style.right = 'auto';
        this.picker.style.bottom = 'auto';
    }
    
    handleOutsideClick(e) {
        if (!this.picker.contains(e.target) && e.target !== this.input) {
            this.close();
        }
    }
    
    destroy() {
        if (this.picker) this.picker.remove();
        this.input.removeAttribute('data-datepicker-initialized');
    }
}

// راه‌اندازی خودکار تمام تقویم‌ها
function initDatepickers() {
    document.querySelectorAll('.jalali-date-input').forEach(input => {
        if (!input.hasAttribute('data-datepicker-initialized')) {
            new PersianDatepicker(input);
        }
    });
}

// راه‌اندازی خودکار بعد از لود صفحه
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDatepickers);
} else {
    initDatepickers();
}