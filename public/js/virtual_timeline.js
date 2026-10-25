// Rows are ordered newest-first, matching the existing inverted chat scroller.
export class VirtualTimeline {
  constructor(estimate = 96, maxRows = 160) {
    this.estimate = estimate;
    this.maxRows = maxRows;
    this.heights = new Map();
    this.reset();
  }
  reset() { this.ids = []; this.offsets = [0]; this.heights.clear(); this.renderedRange = null; }
  set(ids) {
    this.ids = ids;
    const keep = new Set(ids);
    for (const id of this.heights.keys()) if (!keep.has(id)) this.heights.delete(id);
    this.rebuild();
  }
  rebuild() {
    this.offsets = [0];
    for (const id of this.ids) this.offsets.push(this.offsets[this.offsets.length - 1] + (this.heights.get(id) || this.estimate));
  }
  measure(id, height) {
    if (!(height > 0) || Math.abs((this.heights.get(id) || this.estimate) - height) < 1) return false;
    this.heights.set(id, height);
    return true;
  }
  indexAt(offset) {
    let lo = 0, hi = this.ids.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.offsets[mid + 1] <= offset) lo = mid + 1; else hi = mid; }
    return Math.min(lo, Math.max(0, this.ids.length - 1));
  }
  range(scrollTop, viewportHeight) {
    const visible = this.indexAt(Math.max(0, scrollTop));
    const start = Math.max(0, visible - 30);
    const end = Math.min(this.ids.length, start + this.maxRows);
    return { start, end, before: this.offsets[start], after: this.offsets[this.ids.length] - this.offsets[end] };
  }
  offsetOf(id) { const i = this.ids.indexOf(id); return i < 0 ? null : this.offsets[i]; }
}
