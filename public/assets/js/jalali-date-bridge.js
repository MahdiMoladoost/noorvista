/* Sadra Jalali/Gregorian compatibility bridge. */
'use strict';
// Fallback Jalali/Gregorian conversion helpers.
        // persian-datepicker.js needs gregorianToJalali to exist before DOMContentLoaded.
        (function () {
            function pad2(num) {
                return String(num).padStart(2, '0');
            }

            function normalizeDigits(value) {
                return String(value || '')
                    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
            }

            function makeDateArray(y, m, d) {
                const arr = [Number(y), Number(m), Number(d)];
                arr.year = arr[0];
                arr.month = arr[1];
                arr.day = arr[2];
                return arr;
            }

            function gregorianToJalaliFallback(gy, gm, gd) {
                gy = Number(gy); gm = Number(gm); gd = Number(gd);
                const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
                let jy = (gy <= 1600) ? 0 : 979;
                gy -= (gy <= 1600) ? 621 : 1600;
                const gy2 = (gm > 2) ? (gy + 1) : gy;
                let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
                jy += 33 * Math.floor(days / 12053);
                days %= 12053;
                jy += 4 * Math.floor(days / 1461);
                days %= 1461;
                if (days > 365) {
                    jy += Math.floor((days - 1) / 365);
                    days = (days - 1) % 365;
                }
                const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
                const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
                return makeDateArray(jy, jm, jd);
            }

            function jalaliToGregorianFallback(jy, jm, jd) {
                jy = Number(jy); jm = Number(jm); jd = Number(jd);
                let gy = (jy <= 979) ? 621 : 1600;
                jy -= (jy <= 979) ? 0 : 979;
                let days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? ((jm - 1) * 31) : (((jm - 7) * 30) + 186));
                gy += 400 * Math.floor(days / 146097);
                days %= 146097;
                if (days > 36524) {
                    gy += 100 * Math.floor(--days / 36524);
                    days %= 36524;
                    if (days >= 365) days++;
                }
                gy += 4 * Math.floor(days / 1461);
                days %= 1461;
                if (days > 365) {
                    gy += Math.floor((days - 1) / 365);
                    days = (days - 1) % 365;
                }
                let gd = days + 1;
                const sal_a = [0,31,((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
                let gm = 1;
                while (gm <= 12 && gd > sal_a[gm]) {
                    gd -= sal_a[gm];
                    gm++;
                }
                return makeDateArray(gy, gm, gd);
            }

            if (typeof window.gregorianToJalali !== 'function') {
                window.gregorianToJalali = gregorianToJalaliFallback;
            }

            window.toGregorianDateString = function (jalaliDate) {
                const normalized = normalizeDigits(jalaliDate).replace(/-/g, '/');
                const parts = normalized.split('/').map(Number);
                if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
                const g = jalaliToGregorianFallback(parts[0], parts[1], parts[2]);
                return `${g[0]}-${pad2(g[1])}-${pad2(g[2])}`;
            };

            window.toJalaliDateString = function (gregorianDate) {
                if (!gregorianDate) return '';
                const datePart = String(gregorianDate).slice(0, 10);
                const parts = datePart.split('-').map(Number);
                if (parts.length !== 3 || parts.some(Number.isNaN)) return gregorianDate;
                const j = gregorianToJalaliFallback(parts[0], parts[1], parts[2]);
                const jy = j?.year ?? j?.jy ?? j?.[0];
                const jm = j?.month ?? j?.jm ?? j?.[1];
                const jd = j?.day ?? j?.jd ?? j?.[2];
                if (![jy, jm, jd].every(Number.isFinite)) return '';
                return `${jy}/${pad2(jm)}/${pad2(jd)}`;
            };
        })();
