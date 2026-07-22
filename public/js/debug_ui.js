import { safeCopy } from './utils.js';
import { alertMessage } from './ui_helpers.js';

export function _runShadowHunter() {
      const lines = [];
      try {
        const desc = (el) => {
          if (!el || !el.tagName) return '?';
          const id = el.id ? '#' + el.id : '';
          const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
          return el.tagName.toLowerCase() + id + cls;
        };
        // 影・境界・グラデを持つか判定し、持つなら記録
        const inspect = (el, tag) => {
          if (!el) return;
          const cs = getComputedStyle(el);
          const hits = [];
          if (cs.boxShadow && cs.boxShadow !== 'none') hits.push('shadow:' + cs.boxShadow.replace(/rgba?\([^)]*\)/g, 'c').slice(0, 40));
          const bw = [cs.borderTopWidth, cs.borderBottomWidth];
          if (bw[0] !== '0px') hits.push('bT:' + cs.borderTopWidth + ' ' + cs.borderTopColor.replace(/rgba?\([^)]*\)/g, 'c'));
          if (bw[1] !== '0px') hits.push('bB:' + cs.borderBottomWidth + ' ' + cs.borderBottomColor.replace(/rgba?\([^)]*\)/g, 'c'));
          if (cs.backgroundImage && cs.backgroundImage !== 'none') hits.push('bgImg:' + cs.backgroundImage.slice(0, 30));
          if (cs.filter && cs.filter !== 'none') hits.push('filter:' + cs.filter.slice(0, 20));
          // ::after / ::before も調べる
          for (const pseudo of ['::before', '::after']) {
            const pcs = getComputedStyle(el, pseudo);
            if (pcs.content && pcs.content !== 'none' && pcs.content !== 'normal') {
              const ph = [];
              if (pcs.boxShadow && pcs.boxShadow !== 'none') ph.push('shadow');
              if (pcs.backgroundImage && pcs.backgroundImage !== 'none') ph.push('bgImg');
              if (pcs.borderTopWidth !== '0px' || pcs.borderBottomWidth !== '0px') ph.push('border');
              if (ph.length) hits.push(pseudo + '{' + ph.join(',') + '}');
            }
          }
          if (hits.length) lines.push(`${tag}[${desc(el)}] ${hits.join(' | ')}`);
        };

        // 入力欄の下端座標を基準に、その付近の要素を縦に走査
        const input = document.getElementById('messageInputArea');
        const nav = document.getElementById('mobileBottomNav');
        inspect(input, 'IN');
        inspect(input && input.parentElement, 'IN.parent');
        inspect(nav, 'NAV');
        inspect(document.getElementById('chatArea'), 'chat');
        inspect(document.getElementById('messageInputInner'), 'inner');

        // 入力欄の下端のすぐ下の点にある要素を elementsFromPoint で全部拾う
        if (input) {
          const ir = input.getBoundingClientRect();
          const x = Math.round(ir.left + ir.width / 2);
          for (const dy of [-2, 0, 2, 4, 8]) {
            const y = Math.round(ir.bottom + dy);
            const stack = document.elementsFromPoint(x, y) || [];
            stack.slice(0, 4).forEach(e => inspect(e, `@y${dy >= 0 ? '+' : ''}${dy}`));
          }
        }

        const uniq = [...new Set(lines)];
        return uniq.length ? uniq.join('\n') : '影/境界の容疑者なし';
      } catch (e) {
        return 'err:' + (e && e.message);
      }
    }

export function _updateLayoutDebugUI() {
      const els = [document.getElementById('appInfoLayoutDbg'), document.getElementById('mobileAppInfoLayoutDbg')].filter(Boolean);
      if (!els.length) return;
      const txt = runShadowHunter();
      const n = txt.split('\n').length;
      els.forEach(el => {
        el.textContent = (txt.startsWith('影/') || txt.startsWith('err')) ? txt : `容疑者${n}件（タップでコピー）`;
        el.style.cursor = 'pointer';
        el.style.textDecoration = 'underline';
        el.style.whiteSpace = 'normal';
        el.title = 'タップでコピー';
        el.onclick = () => copyDebugText(txt, el);
      });
    }

let _inspectHL = null;

export function __clearInspectHighlight() {
      if (_inspectHL) { _inspectHL.style.display = 'none'; }
    }

export function __showInspectHighlight(rect) {
      if (!_inspectHL) {
        _inspectHL = document.createElement('div');
        _inspectHL.setAttribute('data-inspect-ignore', '1');
        _inspectHL.style.cssText = 'position:fixed;z-index:100000;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.18);border-radius:3px;transition:all 0.1s;box-shadow:0 0 0 9999px rgba(0,0,0,0.02);';
        document.body.appendChild(_inspectHL);
      }
      _inspectHL.style.display = 'block';
      _inspectHL.style.left = rect.left + 'px';
      _inspectHL.style.top = rect.top + 'px';
      _inspectHL.style.width = rect.width + 'px';
      _inspectHL.style.height = rect.height + 'px';
    }

export function _inspectPoint(x, y) {
      try {
        const stack = (document.elementsFromPoint(x, y) || []).slice(0, 6);
        const out = [];
        stack.forEach((el, i) => {
          const cs = getComputedStyle(el);
          const id = el.id ? '#' + el.id : '';
          const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
          const name = el.tagName.toLowerCase() + id + cls;
          const r = el.getBoundingClientRect();
          const props = [];
          if (cs.boxShadow && cs.boxShadow !== 'none') props.push('shadow=' + cs.boxShadow.replace(/rgba?\([^)]*\)/g, 'C'));
          if (cs.borderTopWidth !== '0px') props.push('bTop=' + cs.borderTopWidth + '/' + cs.borderTopColor.replace(/rgba?\([^)]*\)/g, 'C'));
          if (cs.borderBottomWidth !== '0px') props.push('bBot=' + cs.borderBottomWidth + '/' + cs.borderBottomColor.replace(/rgba?\([^)]*\)/g, 'C'));
          if (cs.backgroundImage && cs.backgroundImage !== 'none') props.push('bgImg=' + cs.backgroundImage.slice(0, 24));
          if (cs.filter && cs.filter !== 'none') props.push('filter=' + cs.filter.slice(0, 18));
          // 擬似要素
          for (const ps of ['::before', '::after']) {
            const p = getComputedStyle(el, ps);
            if (p.content && p.content !== 'none' && p.content !== 'normal') {
              const pp = [];
              if (p.boxShadow !== 'none') pp.push('shadow');
              if (p.backgroundImage !== 'none') pp.push('bg');
              if (p.borderTopWidth !== '0px' || p.borderBottomWidth !== '0px') pp.push('border');
              if (pp.length) props.push(ps + '{' + pp.join(',') + '}');
            }
          }
          out.push(`[${i}] ${name} y:${Math.round(r.top)}-${Math.round(r.bottom)} bg=${cs.backgroundColor.replace(/rgba?\([^)]*\)/g, m => m)} ${props.length ? '★' + props.join(' ') : ''}`);
        });
        return out.join('\n');
      } catch (e) {
        return 'err:' + (e && e.message);
      }
    }

export function _lineColor(line) {
      if (line.includes('[error]') || line.includes('[uncaught]') || line.includes('[promise]')) return '#f87171';
      if (line.includes('[warn]')) return '#fbbf24';
      if (line.includes('[E2EE]')) return '#34d399';
      return '#cbd5e1';
    }

export function _appendConsoleLine(line) {
      const body = document.getElementById('devConsoleBody');
      if (!body) return;
      const div = document.createElement('div');
      div.textContent = line;
      div.style.color = _lineColor(line);
      body.appendChild(div);
    }

