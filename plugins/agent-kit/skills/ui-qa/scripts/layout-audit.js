// Evaluated inside the page by any browser automation: page.evaluate(source).
// Returns layout defects visible to a user plus the interactive controls to exercise.
(() => {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0 && r.width > 0 && r.height > 0;
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || el.getAttribute("placeholder") || "")
      .trim().replace(/\s+/g, " ").slice(0, 60);
  const where = (el) => {
    const r = el.getBoundingClientRect();
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.classList[0] ? "." + el.classList[0] : ""} @${Math.round(r.x)},${Math.round(r.y)}`;
  };
  const clippedByAncestor = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflow) && a.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  const issues = [];
  const flagged = new Set();
  if (document.documentElement.scrollWidth > vw + 1)
    issues.push({ type: "page-horizontal-scroll", detail: `${document.documentElement.scrollWidth}px > ${vw}px` });

  const all = [...document.querySelectorAll("body *")].filter(visible);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.right > vw + 1 && s.position !== "fixed" && !clippedByAncestor(el) && !flagged.has(el.parentElement)) {
      flagged.add(el);
      issues.push({ type: "overflows-viewport", el: where(el), text: label(el) });
    }
    const clips = ["hidden", "clip"].includes(s.overflowX) || s.textOverflow === "ellipsis";
    if (clips && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0)
      issues.push({ type: "text-truncated", el: where(el), text: label(el) });
    if (!clips && el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && s.overflowX === "visible" && el.innerText?.trim())
      issues.push({ type: "text-spills-box", el: where(el), text: label(el) });
    if (el.tagName === "IMG" && (!el.complete || el.naturalWidth === 0)) issues.push({ type: "broken-image", el: where(el), src: el.currentSrc });
  }

  const controls = [...document.querySelectorAll(
    "a[href], button, input, select, textarea, [role=button], [role=combobox], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [aria-haspopup], [aria-expanded], [title], [data-tooltip]"
  )].filter(visible);
  for (const el of controls) {
    if (!label(el) && !el.querySelector("img[alt]")) issues.push({ type: "control-without-name", el: where(el) });
    const r = el.getBoundingClientRect();
    if ((r.width < 24 || r.height < 24) && el.matches("button, [role=button], input[type=checkbox], input[type=radio], [role=switch]")) issues.push({ type: "tap-target-small", el: where(el), size: `${Math.round(r.width)}x${Math.round(r.height)}` });
  }
  // Overlapping siblings among controls (common after flex/grid breakage)
  for (let i = 0; i < controls.length; i++)
    for (let j = i + 1; j < Math.min(controls.length, i + 40); j++) {
      const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) issues.push({ type: "controls-overlap", a: where(controls[i]), b: where(controls[j]) });
    }

  const popupTriggers = controls
    .filter((el) => el.matches("select, [role=combobox], [aria-haspopup], [aria-expanded], [role=tab], [title], [data-tooltip], .ant-select, .ant-dropdown-trigger, .ant-picker"))
    .map((el) => ({ el: where(el), name: label(el), kind: el.getAttribute("role") || el.tagName.toLowerCase(), expanded: el.getAttribute("aria-expanded") }));

  return {
    url: location.href, viewport: `${vw}x${document.documentElement.clientHeight}`,
    byType: issues.reduce((m, i) => ((m[i.type] = (m[i.type] || 0) + 1), m), {}),
    issues: issues.slice(0, 40), issueCount: issues.length,
    controls: controls.length, popupTriggers: popupTriggers.slice(0, 80),
    openOverlays: document.querySelectorAll("[role=dialog], [role=listbox], [role=menu], [role=tooltip], .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-modal-wrap, .ant-popover:not(.ant-popover-hidden)").length,
  };
})()
