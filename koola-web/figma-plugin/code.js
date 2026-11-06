// Koola Web — Figma auto-draft v6
// 30 khung: đăng nhập · shell · chat · tương tác tin nhắn · gọi · danh bạ · cài đặt
// Chạy: Figma Desktop > Plugins > Development > Import plugin from manifest… > Run
//
// CẦN CÓ TRONG FILE: ảnh đặt tên chứa "koola-logo" (full lockup) và "koola-mark" (chỉ mark).

// ═══════════════════════════════════════════════════════════════════════════
// BRAND — 3 màu chủ đạo của logo Koola (từ ChatApp/src/ui/theme.ts)
// ═══════════════════════════════════════════════════════════════════════════

var BRAND = {
  red: "#E12D24",
  blue: "#1E50C8",
  green: "#1FA64A",
};

// ═══════════════════════════════════════════════════════════════════════════
// TOKENS — nguồn: ChatApp/src/ui/theme.ts
// ═══════════════════════════════════════════════════════════════════════════

var L = {
  ink: "#101828", muted: "#667085", faint: "#98A2B3",
  line: "#E4E7EC", canvas: "#F3F3F3", surface: "#F5F7F9", chat: "#F7F9FB",
  panel: "#FFFFFF", bubbleOther: "#FFFFFF", bubbleBorder: "#E4E7EC",
  primary: "#0B736F", primaryHover: "#0A8F8A", primaryDark: "#0A5754", primarySoft: "#E6FAF9",
  accent: "#0A8F8A", accentSoft: "#E6FAF9", online: "#0A8F8A",
  danger: "#DC2626", dangerSoft: "#FEE2E2",
  warnInk: "#B45309", warnSoft: "#FEF3C7",
  iconWell: "#E6FAF9", white: "#FFFFFF", cream: "#F6F4EF", rail: "#101828",
  // Rail lấy đúng 3 màu logo: nền = xanh brand, badge = đỏ brand, chấm online = xanh lá brand.
  railBg: "#0B736F",
  railInk: "#FFFFFF",
  railInkDim: "#C7F4F2",
  railDivider: "#FFFFFF",
  railActiveAlpha: 0.2,
  railBadge: "#E12D24",
  railOnline: "#1FA64A",
  scrim: "#101828",
  // Bề mặt cho màn gọi/video — luôn tối bất kể theme app.
  callBg: "#0B0F14",
  callStage: "#1C2026",
  callChrome: "#252B33",
  callInk: "#F2F4F7",
  callInkDim: "#A0AAB8",
  callGlowA: "#083F3D",
  callGlowB: "#0A5754",
  callFace: "#2F3844",
  // Quầng nền trang đăng nhập (trang trí, không mang nghĩa)
  orbMint: "#8FE9E6",
  orbLav: "#C8B8E0",
  orbSky: "#4FD9D5",
  successStrong: "#F59E0B",
  // Chữ đạt WCAG AA trên nền sáng (đo bằng công thức tương phản).
  accentInk: "#0B736F",   // 5.85:1 on white — thay accent khi dùng làm chữ
  dangerInk: "#B42318",   // 6.57:1 on white
  faintInk:  "#68717F",   // 4.93:1 on white / 4.59:1 on surface
  // Ba màu logo — luôn giữ nguyên giữa hai theme (nhận diện thương hiệu).
  brandRed: "#E12D24",
  brandBlue: "#1E50C8",
  brandGreen: "#1FA64A",

  // ══ DẢI TIFFANY (hue 176°) — bộ màu chủ đạo ══
  // Thang 10 bậc; 500 là Tiffany gốc, 700 là bậc dùng làm nền nút (đủ AA).
  tiffany50: "#E6FAF9", tiffany100: "#C7F4F2", tiffany200: "#8FE9E6",
  tiffany300: "#4FD9D5", tiffany400: "#1AC7C2", tiffany500: "#0ABAB5",
  tiffany600: "#0A8F8A", tiffany700: "#0B736F", tiffany800: "#0A5754",
  tiffany900: "#083F3D",
};

var D = {
  ink: "#F2F4F7", muted: "#A0AAB8", faint: "#6C7686",
  line: "#2F3542", canvas: "#0F1419", surface: "#1C2026", chat: "#0F1419",
  panel: "#1C2026", bubbleOther: "#252B33", bubbleBorder: "#2F3542",
  primary: "#4FD9D5", primaryHover: "#8FE9E6", primaryDark: "#2ED3CE", primarySoft: "#083F3D",
  accent: "#4FD9D5", accentSoft: "#083F3D", online: "#4FD9D5",
  danger: "#F87171", dangerSoft: "#3B1D1D",
  warnInk: "#FCD34D", warnSoft: "#3A2E12",
  iconWell: "#0A5754", white: "#FFFFFF", cream: "#0B0F14", rail: "#0B0F14",
  // Rail dark: nền xanh brand đậm hơn, giữ nguyên bộ 3 màu logo.
  railBg: "#083F3D",
  railInk: "#FFFFFF",
  railInkDim: "#8FE9E6",
  railDivider: "#FFFFFF",
  railActiveAlpha: 0.18,
  railBadge: "#E12D24",
  railOnline: "#1FA64A",
  scrim: "#000000",
  // Bề mặt riêng cho màn gọi/video — luôn tối bất kể theme app.
  callBg: "#0B0F14",
  callStage: "#1C2026",
  callChrome: "#252B33",
  callInk: "#F2F4F7",
  callInkDim: "#A0AAB8",
  callGlowA: "#083F3D",
  callGlowB: "#0A5754",
  callFace: "#2F3844",
  orbMint: "#4FD9D5",
  orbLav: "#C8B8E0",
  orbSky: "#8FE9E6",
  successStrong: "#F59E0B",
  accentInk: "#34D399",   // 8.51:1 on #1C2026
  dangerInk: "#F87171",   // 5.91:1 on #1C2026
  faintInk:  "#828C9D",   // 4.82:1 on #1C2026 / 5.45:1 on canvas
  brandRed: "#F04438",
  brandBlue: "#5B8DEF",
  brandGreen: "#34D399",

  // Dải Tiffany cho dark mode (cùng hex với light, chỉ khác cách dùng).
  tiffany50: "#E6FAF9", tiffany100: "#C7F4F2", tiffany200: "#8FE9E6",
  tiffany300: "#4FD9D5", tiffany400: "#1AC7C2", tiffany500: "#0ABAB5",
  tiffany600: "#0A8F8A", tiffany700: "#0B736F", tiffany800: "#0A5754",
  tiffany900: "#083F3D",
};

// ═══════════════════════════════════════════════════════════════════════════
// ELEVATION — 5 mức duy nhất (desktop-scaled từ thang DNA xs→xl)
// content chỉ dùng sm/md; chrome (popover, modal, widget) mới dùng lg/xl
// ═══════════════════════════════════════════════════════════════════════════

var SH = {
  sm:   { y: 4,  blur: 12, alpha: 0.06 },   // thẻ phẳng, hàng danh sách
  md:   { y: 8,  blur: 24, alpha: 0.10 },   // thẻ nội dung, panel
  lg:   { y: 16, blur: 40, alpha: 0.16 },   // popover, menu, toast
  xl:   { y: 24, blur: 60, alpha: 0.20 },   // modal, widget nổi
  glow: { y: 8,  blur: 20, alpha: 0.24 },   // nút primary / CTA
};

// Thang chữ — 9 bậc, khớp koolaTypography + 2 bậc micro cho nội dung trong badge
var TY = {
  micro: 10,   // số trong badge 20-22px
  tiny:  11,   // nhãn phụ trong pill, chip
  caption: 12, // metadata, giờ, dung lượng
  bodySm: 13,  // preview dòng 2 trong danh sách
  label: 14,   // tên, nút, nội dung bubble
  body:  15,   // nội dung chính
  heading: 20, // tiêu đề mục
  title:  24,  // tiêu đề màn
  display: 32, // hero
};

// Bán kính — chỉ dùng các giá trị này cho container
var R = { xs2: 4, xs: 8, sm: 10, md: 14, bub: 16, lg: 20, xl: 24, pill: 999 };

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function hx6(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function solid(hex, opacity) {
  return { type: "SOLID", color: hx6(hex), opacity: opacity == null ? 1 : opacity };
}

function frame(name, x, bg) {
  var f = figma.createFrame();
  f.name = name;
  f.resize(1440, 900);
  f.x = x;
  f.y = 0;
  f.fills = [solid(bg)];
  f.clipsContent = true;
  figma.currentPage.appendChild(f);
  return f;
}

function rect(parent, name, x, y, w, h, fill, radius, opacity) {
  var r = figma.createRectangle();
  r.name = name;
  r.resize(w, h);
  r.fills = [solid(fill, opacity)];
  if (radius != null) r.cornerRadius = radius;
  parent.appendChild(r);
  r.x = x;
  r.y = y;
  return r;
}

function circle(parent, name, x, y, d, fill, opacity) {
  return rect(parent, name, x, y, d, d, fill, d / 2, opacity);
}

// Một cung tròn của BrandMark. Dùng SVG path cung (A) — cùng cách KoolaMark
// vẽ trong app, để mark ở Figma và mark ở code là một.
// a0/a1 tính bằng độ, 0° = 12 giờ, tăng theo chiều kim đồng hồ.
function arc(parent, name, x, y, d, a0, a1, color) {
  var r = d / 2;
  var cx = r, cy = r;
  var stroke = Math.max(2, Math.round(d * 0.17));
  function pt(angle) {
    var rad = (angle - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  var p0 = pt(a0), p1 = pt(a1);
  var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  var path = "M " + p0[0].toFixed(2) + " " + p0[1].toFixed(2) +
    " A " + r + " " + r + " 0 " + large + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + d + '" height="' + d +
    '" viewBox="0 0 ' + d + " " + d + '">' +
    '<path d="' + path + '" fill="none" stroke="' + color +
    '" stroke-width="' + stroke + '" stroke-linecap="round"/></svg>';
  var node;
  try {
    node = figma.createNodeFromSvg(svg);
  } catch (e) {
    return null;
  }
  parent.appendChild(node);
  node.name = name;
  node.x = x;
  node.y = y;
  return node;
}

function strokeRect(parent, name, x, y, w, h, fill, radius, stroke) {
  var r = rect(parent, name, x, y, w, h, fill, radius);
  r.strokes = [{ type: "SOLID", color: hx6(stroke) }];
  r.strokeWeight = 1;
  r.strokeAlign = "INSIDE";
  return r;
}

// Áp 1 trong 5 mức bóng. Giữ nguyên chữ ký số cũ cho call site chưa đổi.
function shadowL(node, level) {
  var v = SH[level];
  if (!v) return;
  node.effects = [{
    type: "DROP_SHADOW",
    color: { r: 0.06, g: 0.09, b: 0.18, a: v.alpha },
    offset: { x: 0, y: v.y },
    radius: v.blur,
    spread: 0,
    visible: true,
    blendMode: "NORMAL",
  }];
}

// DNA: nội dung lên cao bằng surface + hairline, không bằng bóng.
// Dùng cho thẻ nội dung (settings, panel, state). Chrome mới dùng bóng.
function hairline(node, color) {
  node.strokes = [{ type: "SOLID", color: hx6(color) }];
  node.strokeWeight = 1;
  node.strokeAlign = "INSIDE";
  node.effects = [];
}

// Bản cũ: map (y, blur, opacity) về mức gần nhất để call site cũ vẫn chạy.
function shadow(node, y, blur, opacity) {
  var lvl;
  if (blur >= 60) lvl = "xl";
  else if (opacity >= 0.26) lvl = "lg";
  else if (opacity >= 0.22 && blur <= 28) lvl = "glow";
  else if (blur > 28) lvl = "lg";
  else if (blur > 12) lvl = "md";
  else lvl = "sm";
  shadowL(node, lvl);
}

// Bo góc riêng từng góc — dùng cho nhóm tin (góc phía người gửi vuông hơn).
function corners(node, tl, tr, br, bl) {
  node.topLeftRadius = tl;
  node.topRightRadius = tr;
  node.bottomRightRadius = br;
  node.bottomLeftRadius = bl;
  return node;
}

// Avatar: vòng tròn màu primarySoft + chữ cái đầu của tên.
// Dùng cho mọi chỗ chưa có ảnh thật, để danh sách không trông rỗng.
function avatar(parent, name, x, y, d, initial, tk) {
  circle(parent, name + "-bg", x, y, d, tk.primarySoft);
  mkText(parent, name + "-t", initial, x, y + Math.round((d - 20) / 2), TY.label,
    tk.primaryDark, "Bold", d, 20, "CENTER");
}

function hline(parent, name, x, y, w, color) {
  return rect(parent, name, x, y, w, 1, color);
}

function vline(parent, name, x, y, h, color) {
  return rect(parent, name, x, y, 1, h, color);
}

function mkText(parent, name, str, x, y, size, color, style, width, lineHeight, align) {
  var t = figma.createText();
  t.name = name;
  t.fontName = { family: "Inter", style: style || "Regular" };
  t.fontSize = size;
  t.characters = str;
  t.lineHeight = { value: lineHeight || Math.round(size * 1.4), unit: "PIXELS" };
  t.fills = [solid(color)];
  if (width) {
    t.textAutoResize = "HEIGHT";
    t.resize(width, t.height);
    if (align) t.textAlignHorizontal = align;
  }
  parent.appendChild(t);
  t.x = x;
  t.y = y;
  return t;
}

// Nhãn nhỏ phía trên frame — dùng để chú thích các frame spec.
function caption(parent, str, x, y, w, tk) {
  return mkText(parent, "caption", str, x, y, TY.caption, tk.faintInk, "Regular", w, 18);
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAND
// ═══════════════════════════════════════════════════════════════════════════

function findBrand(pattern) {
  var hits = figma.root.findAll(function (n) {
    return (
      pattern.test(n.name) &&
      "fills" in n &&
      Array.isArray(n.fills) &&
      n.fills.some(function (f) { return f.type === "IMAGE"; })
    );
  });
  return hits.length ? hits[0] : null;
}

function placeBrand(parent, name, src, x, y, w) {
  var c = src.clone();
  c.name = name;
  var h = Math.round((w * src.height) / src.width);
  c.resize(w, h);
  parent.appendChild(c);
  c.x = x;
  c.y = y;
  return c;
}

function markOrWarn(parent, name, x, y, w) {
  var m = findBrand(/koola-mark/i) || findBrand(/koola-logo/i);
  if (m) return placeBrand(parent, name, m, x, y, w);
  return circle(parent, name + "-ph", x, y, w, L.primarySoft);
}

function brandPlate(parent, prefix, x, y, w, tk) {
  var plate = rect(parent, prefix + "-plate", x, y, w, 440, tk.white, 24);
  shadowL(plate, "xl");

  var logo = findBrand(/koola-logo/i);
  if (!logo) {
    mkText(parent, prefix + "-missing",
      "Kéo koola-logo.png + koola-mark.png vào file rồi Run lại plugin.",
      x + 32, y + 32, TY.bodySm, L.warnInk, "Bold", w - 64);
    return plate;
  }

  var lw = w - 96;
  var lh = Math.round((lw * logo.height) / logo.width);
  var ly = y + (440 - lh - 62) / 2;
  placeBrand(parent, prefix + "-logo", logo, x + 48, ly, lw);

  mkText(parent, prefix + "-tag-en", "Where All Needs Connect!",
    x, ly + lh + 10, 18, tk.ink, "Bold", w, 24, "CENTER");
  mkText(parent, prefix + "-tag-vi", "Nơi kết nối mọi nhu cầu",
    x, ly + lh + 36, TY.label, tk.muted, "Regular", w, 20, "CENTER");
  return plate;
}
// ═══════════════════════════════════════════════════════════════════════════
// LUCIDE — icon thật, tải từ unpkg.com/lucide-static (v1.69.0, ISC)
// Thêm icon mới: dán markup <path>/<circle>/<rect> từ lucide.dev vào đây.
// ═══════════════════════════════════════════════════════════════════════════

var LUCIDE = {
  // điều hướng
  "message-circle": '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  "message-square": '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  "log-out": '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "check-check": '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  filter: '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  "more-vertical": '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',

  // chat
  "send": '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  "paperclip": '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  camera: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  "camera-off": '<path d="M14.564 14.558a3 3 0 1 1-4.122-4.121"/><path d="m2 2 20 20"/><path d="M20 20H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 .819-.175"/><path d="M9.695 4.024A2 2 0 0 1 10.004 4h3.993a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v7.344"/>',
  smile: '<path d="M15 10V9"/><path d="M16.472 15a6 6 0 0 1-8.943 0"/><path d="M9 10V9"/><circle cx="12" cy="12" r="10"/>',
  "smile-plus": '<path d="M13.267 2.08a10 10 0 1 0 8.653 8.653"/><path d="M15 10V9"/><path d="M16 5h6"/><path d="M16.472 15a6 6 0 0 1-8.943 0"/><path d="M19 2v6"/><path d="M9 10V9"/>',
  laugh: '<path d="M15 10V9"/><path d="M7.084 14.302a5.12 5.12 0 0 0 9.833 0 .24.24 0 0 0-.235-.302H7.32a.24.24 0 0 0-.235.302"/><path d="M9 10V9"/><circle cx="12" cy="12" r="10"/>',
  meh: '<path d="M15 10V9"/><path d="M8 16h8"/><path d="M9 10V9"/><circle cx="12" cy="12" r="10"/>',
  frown: '<path d="M15 10V9"/><path d="M9 10V9"/><path d="M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="12" r="10"/>',
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  "thumbs-up": '<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>',
  "thumbs-down": '<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/><path d="M17 14V2"/>',
  reply: '<path d="M20 18v-2a4 4 0 0 0-4-4H4"/><path d="m9 17-5-5 5-5"/>',
  forward: '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  "share-2": '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  "trash-2": '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',

  // file / media
  "file-text": '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  pause: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  mic: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
  "mic-off": '<path d="M12 19v3"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M16.95 16.95A7 7 0 0 1 5 12v-2"/><path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/><path d="m2 2 20 20"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>',
  "volume-1": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/>',
  "volume-2": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  "volume-x": '<path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z"/><path d="m16.5 14.5 5-5"/><path d="m16.5 9.5 5 5"/>',
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  "screen-share": '<path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m17 8 5-5"/><path d="M17 3h5v5"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  laptop: '<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z"/><path d="M20.054 15.987H3.946"/>',

  // gọi
  phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  "phone-off": '<path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272"/><path d="M22 2 2 22"/><path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473"/>',
  "phone-call": '<path d="M13 2a9 9 0 0 1 9 9"/><path d="M13 6a5 5 0 0 1 5 5"/><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  "phone-incoming": '<path d="M16 2v6h6"/><path d="m22 2-6 6"/><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  "phone-outgoing": '<path d="m16 8 6-6"/><path d="M22 8V2h-6"/><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  "video-off": '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
  maximize: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  minimize: '<path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/>',
  grid: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',

  // trạng thái / hệ thống
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  "circle-alert": '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  "bell-off": '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742"/><path d="m2 2 20 20"/><path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  "key-round": '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  "wifi": '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  "wifi-off": '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  "user-check": '<path d="m16 11 2 2 4-4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  "user-x": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  "qr-code": '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/>',
};

var missingIcons = [];

function lucide(parent, name, icon, x, y, s, color) {
  var body = LUCIDE[icon];
  if (!body) {
    if (missingIcons.indexOf(icon) < 0) missingIcons.push(icon);
    return null;
  }
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s +
    '" viewBox="0 0 24 24" fill="none" stroke="' + color +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";
  var node;
  try {
    node = figma.createNodeFromSvg(svg);
  } catch (e) {
    return null;
  }
  parent.appendChild(node);
  node.name = name;
  node.x = x;
  node.y = y;
  return node;
}

function iconCentered(parent, name, icon, x, y, box, s, color) {
  var off = Math.round((box - s) / 2);
  return lucide(parent, name, icon, x + off, y + off, s, color);
}

function iconButton(parent, name, icon, x, y, size, bg, color) {
  var r = rect(parent, name + "-bg", x, y, size, size, bg, Math.round(size / 3));
  // Icon tròn theo tỉ lệ 1:2 (40 → 20, 44 → 22) — đồng nhất mọi cỡ nút.
  iconCentered(parent, name + "-ic", icon, x, y, size, Math.round(size * 0.5), color);
  return r;
}

function roundButton(parent, name, icon, x, y, size, bg, color) {
  var r = circle(parent, name + "-bg", x, y, size, bg);
  iconCentered(parent, name + "-ic", icon, x, y, size, Math.round(size * 0.44), color);
  return r;
}

// Nút primary dạng thanh: nhãn căn giữa cả nút, icon dóng mép phải.
function primaryButton(parent, name, label, x, y, w, h, tk, opts) {
  opts = opts || {};
  var bg = rect(parent, name, x, y, w, h, opts.tone === "danger" ? tk.danger : tk.primary, R.sm);
  if (!opts.flat) shadowL(bg, "glow");

  mkText(parent, name + "-t", label, x, y + Math.round((h - 20) / 2), TY.label,
    tk.white, "Bold", w, 20, "CENTER");
  if (opts.icon) {
    iconCentered(parent, name + "-ic", opts.icon, x + w - 44, y, h, 18, tk.white);
  }
  return bg;
}
// ═══════════════════════════════════════════════════════════════════════════
// KHUNG DÙNG CHUNG
// ═══════════════════════════════════════════════════════════════════════════

var RAIL_W = 64;
var LIST_W = 340;
var LIST_X = RAIL_W;              // gốc panel danh sách
var LIST_END = LIST_X + LIST_W;   // 404
var PAGE_W = 1440;
var PAGE_H = 900;
var PAD = 24;
var RIGHT = PAGE_W - PAD;         // 1416
var MID = (LIST_END + PAGE_W) / 2; // 926

// Rail 72px kiểu Zalo, dùng đúng 3 màu logo Koola:
//   nền    = Tiffany  #0A8F8A
//   badge  = đỏ    #E12D24
//   online = xanh lá #1FA64A
//   đầu  → avatar tròn của bạn · giữa → Chat (có badge) + Danh bạ · đáy → Cài đặt + Đăng xuất
// ═══════════════════════════════════════════════════════════════════════════
// RAIL — cột icon trơn 64px, nền trung tính
// Không nhãn chữ, không dải màu đặc: khác Zalo/Viber, gần Linear/Notion hơn.
// Điểm nhấn duy nhất là pill teal ở mục đang chọn.
// ═══════════════════════════════════════════════════════════════════════════

function rail(parent, active, tk) {
  var W = RAIL_W;                 // 64
  var PILL = 44;
  var px = (W - PILL) / 2;        // 10 — canh giữa pill trong rail

  // Nền rail: trắng (sáng) hoặc surface (tối), tách khỏi canvas bằng hairline.
  rect(parent, "rail", 0, 0, W, PAGE_H, tk.panel, 0);
  vline(parent, "rail-edge", W - 1, 0, PAGE_H, tk.line);

  // Logo mark ở đỉnh — không khung nền, để mark tự đứng.
  markOrWarn(parent, "rail-me", px + 8, 22, 32);

  // ── 5 mục điều hướng, chỉ icon ────────────────────────────────────────
  // 0 = Trò chuyện · 1 = Danh bạ · 2 = Cài đặt
  var items = ["message-circle", "users", "settings"];
  var startY = 86;

  for (var i = 0; i < items.length; i++) {
    var y = startY + i * 56;
    var on = i === active;

    // Pill nền teal nhạt cho mục đang chọn — không đổ bóng, không viền.
    if (on) {
      rect(parent, "rail-active", px, y, PILL, PILL, tk.primarySoft, 14);
      // Vạch nhấn 3px mép trái rail — tín hiệu vị trí rõ mà vẫn tối giản.
      rect(parent, "rail-active-bar", 0, y + 12, 3, PILL - 24, tk.primary, 2);
    }

    iconCentered(parent, "rail-ic-" + i, items[i], px, y, PILL, 22,
      on ? tk.primary : tk.muted);
  }

  // Badge chưa đọc trên mục Trò chuyện.
  circle(parent, "rail-badge-ring", px + 26, startY + 4, 20, tk.panel);
  circle(parent, "rail-badge", px + 28, startY + 6, 16, tk.brandRed);
  mkText(parent, "rail-badge-t", "5", px + 28, startY + 8, TY.micro, tk.white,
    "Bold", 16, 12, "CENTER");

  // ── Nhóm đáy: avatar + đăng xuất ──────────────────────────────────────
  hline(parent, "rail-div", px, PAGE_H - 132, PILL, tk.line);
  avatar(parent, "rail-ava", px + 4, PAGE_H - 112, 36, "A", tk);
  circle(parent, "rail-ava-dot", px + 32, PAGE_H - 86, 11, tk.online);
  iconCentered(parent, "rail-logout", "log-out", px, PAGE_H - 56, PILL, 20, tk.faint);
}


function listPanel(parent, tk) {
  rect(parent, "list-panel", RAIL_W, 0, LIST_W, PAGE_H, tk.panel, 0);
  vline(parent, "list-edge", LIST_END, 0, PAGE_H, tk.line);
}

function listHeader(parent, title, tk) {
  mkText(parent, "list-title", title, 96, 28, TY.heading, tk.ink, "Bold", 240, 28);
  // Nút + dóng mép phải nội dung, cùng đường với giờ trong hàng (EDGE = 384).
  iconButton(parent, "list-add", "plus", 340, 20, 44, tk.primarySoft, tk.primaryDark);
}

function searchBar(parent, y, w, tk, ph) {
  var H = 44;
  strokeRect(parent, "search", 96, y, w, H, tk.surface, R.pill, tk.line);
  iconCentered(parent, "search-ic", "search", 96, y, H, 18, tk.faint);
  mkText(parent, "search-ph", ph, 132, y + 12, TY.label, tk.faintInk, "Regular", w - 88, 20);
  // Kbd hint — gợi ý ⌘K, chỉ hiện ở thanh tìm kiếm rộng.
  if (w >= 280) {
    rect(parent, "search-kbd", 96 + w - 44, y + 12, 28, 20, tk.panel, R.xs2);
    mkText(parent, "search-kbd-t", "⌘K", 96 + w - 44, y + 15, TY.micro, tk.faintInk, "Bold", 28, 14, "CENTER");
  }
}

function chip(parent, name, label, x, y, w, active, tk) {
  var H = 36;
  // Chip active: nền primary + đổ bóng nhẹ để tách khỏi nền panel trắng.
  var bg = rect(parent, name, x, y, w, H, active ? tk.primary : tk.surface, R.pill);
  if (active) shadowL(bg, "glow");
  mkText(parent, name + "-t", label, x, y + 8, TY.bodySm,
    active ? tk.white : tk.muted, active ? "Bold" : "Regular", w, 20, "CENTER");
}

function convRow(parent, x, y, w, d, tk) {
  var ROW = 76;
  var PAD_X = 12;

  // Hàng đang chọn: dải nền tràn hết bề ngang cột, mép trái nhấn primary.
  if (d.active) {
    rect(parent, "row-active-" + d.id, x, y, w, ROW, tk.primarySoft, R.md, 0.55);
    rect(parent, "row-active-bar-" + d.id, x, y + 16, 3, ROW - 32, tk.primary, 2);
  }

  // Avatar 48 + chấm online có vòng tách nền.
  avatar(parent, "ava-" + d.id, x + PAD_X, y + 14, 48, d.name.charAt(0), tk);
  if (d.dot) {
    circle(parent, "ava-dot-ring-" + d.id, x + PAD_X + 32, y + 48, 16, d.active ? tk.primarySoft : tk.panel);
    circle(parent, "ava-dot-" + d.id, x + PAD_X + 34, y + 50, 12, tk.online);
  }

  // Cột phải: luôn chừa ô 20px cho icon ghim/tắt-TB để giờ thẳng cột mọi hàng.
  var EDGE = x + w - PAD_X;
  var MARK = 20;

  if (d.menu) {
    iconButton(parent, "row-menu-" + d.id, "ellipsis", EDGE - 28, y + 10, 28, tk.surface, tk.muted);
  } else {
    mkText(parent, "row-time-" + d.id, d.time, EDGE - MARK - 56, y + 15, TY.tiny,
      tk.faintInk, "Regular", 56, 16, "RIGHT");
  }

  if (d.pinned) {
    lucide(parent, "row-mark-" + d.id, "pin", EDGE - 14, y + 16, 16, tk.faint);
  } else if (d.muted) {
    lucide(parent, "row-mark-" + d.id, "bell-off", EDGE - 14, y + 16, 16, tk.faint);
  }

  // Tên + preview: cắt bớt bề ngang để không chạm badge.
  mkText(parent, "row-name-" + d.id, d.name, x + 72, y + 14, TY.body, tk.ink, "Bold", 136, 20);
  mkText(parent, "row-prev-" + d.id, d.preview, x + 72, y + 38, TY.bodySm,
    d.unread ? tk.ink : tk.muted, d.unread ? "Bold" : "Regular", 156, 18);

  if (d.unread) {
    circle(parent, "row-badge-" + d.id, EDGE - 22, y + 44, 22, tk.primary);
    mkText(parent, "row-badge-t-" + d.id, d.unread, EDGE - 22, y + 47, TY.tiny, tk.white, "Bold", 22, 16, "CENTER");
  } else if (d.ticks) {
    lucide(parent, "row-ticks-" + d.id, "check-check", EDGE - 16, y + 46, 16, tk.faint);
  }
}

// Header hội thoại — dùng cho S07/S08/S09/S10/S35…
function chatHeader(parent, tk, opts) {
  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var H = 76;

  rect(parent, "header", A, 0, AW, H, tk.panel, 0);
  hline(parent, "header-line", A, H - 1, AW, tk.line);

  // Avatar 48 + chấm online có vòng tách — khớp kích thước hàng danh sách.
  avatar(parent, "header-ava", A + 24, 14, 48, opts.name.charAt(0), tk);
  if (!opts.group) {
    circle(parent, "header-dot-ring", A + 56, 48, 16, tk.panel);
    circle(parent, "header-dot", A + 58, 50, 12, tk.online);
  }

  mkText(parent, "header-name", opts.name, A + 84, 19, TY.body, tk.ink, "Bold", 420, 20);
  mkText(parent, "header-status", opts.status, A + 84, 41, TY.caption,
    opts.statusColor || tk.accent, "Regular", 420, 18);

  // Cụm nút hành động: 40px, khe 8px, dóng mép phải nội dung.
  var N = opts.icons.length;
  for (var i = 0; i < N; i++) {
    var bx = RIGHT - 40 - (N - 1 - i) * 48;
    iconButton(parent, "hbtn-" + i, opts.icons[i], bx, 18, 40, tk.surface, tk.ink);
  }
  return AW;
}

function composerBar(parent, tk, A, AW, opts) {
  var H = 88;
  var TOP = PAGE_H - H;
  rect(parent, "composer", A, TOP, AW, H, tk.panel, 0);
  hline(parent, "composer-line", A, TOP, AW, tk.line);

  // Nút gửi neo theo mép phải vùng chat (S16/S17 thu hẹp vùng chat vì có panel).
  var S = 48;
  var sendX = A + AW - 24 - S;
  var sendY = TOP + (H - S) / 2;
  var inputW = sendX - 16 - (A + 24);
  var inputY = TOP + (H - 52) / 2;

  strokeRect(parent, "composer-input", A + 24, inputY, inputW, 52, tk.surface, R.pill, tk.line);
  lucide(parent, "ic-attach", "paperclip", A + 44, inputY + 14, 24, tk.faint);
  mkText(parent, "composer-ph", opts.placeholder || "Nhắn tin…", A + 78, inputY + 16,
    TY.label, tk.faintInk, "Regular", inputW - 170, 20);
  lucide(parent, "ic-img", "image", A + 24 + inputW - 78, inputY + 14, 24, tk.faint);
  lucide(parent, "ic-smile", "smile", A + 24 + inputW - 40, inputY + 14, 24, tk.faint);

  var send = circle(parent, "send-btn", sendX, sendY, S, opts.disabled ? tk.line : tk.primary);
  if (!opts.disabled) shadowL(send, "glow");
  iconCentered(parent, "send-ic", "send", sendX, sendY, S, 20,
    opts.disabled ? tk.faint : tk.white);
}

// Bubble tin nhắn — radius 16, lề trong 16/12, giờ + tick góc dưới-phải.
function bubble(parent, tk, opts) {
  var w = opts.w || 300;
  var h = opts.h || 44;
  var x = opts.own ? RIGHT - w : LIST_END + 66;
  var y = opts.y;
  var node;
  if (opts.own) {
    node = rect(parent, "bub-" + opts.id, x, y, w, h, tk.primary, R.bub);
  } else {
    node = strokeRect(parent, "bub-" + opts.id, x, y, w, h, tk.bubbleOther, R.bub, tk.bubbleBorder);
  }
  mkText(parent, "msg-" + opts.id, opts.text, x + 16, y + 12, TY.label,
    opts.own ? tk.white : tk.ink, "Regular", w - 32, 20);
  if (opts.time) {
    mkText(parent, "time-" + opts.id, opts.time, opts.own ? x + w - 60 : x + w - 54,
      y + h - 18, TY.micro, opts.own ? tk.white : tk.faint, "Regular", 42, 14, "RIGHT");
  }
  if (opts.ticks) {
    lucide(parent, "ticks-" + opts.id, "check-check", x + w - (opts.time ? 22 : 30),
      y + h - 20, 16, opts.ticks === "read" ? tk.primary : (opts.own ? tk.white : tk.faint));
  }
  return node;
}
// ═══════════════════════════════════════════════════════════════════════════
// AUTH — khung chung
// Bố cục: một cột giữa. Nền 4 lớp tạo chiều sâu. Logo là mark nhỏ trên tiêu đề.
// ═══════════════════════════════════════════════════════════════════════════

var AUTH_CARD_W = 440;
var AUTH_X = (PAGE_W - AUTH_CARD_W) / 2;   // 500

// Nền 4 lớp: wash → quầng → lưới chấm → vignette.
// Khác biệt so với blob ngẫu nhiên: các lớp có thứ tự và mật độ giảm dần,
// nên mắt đọc được chiều sâu thay vì thấy vài hình tròn dán lên.
function authBackdrop(f, tk, dark) {
  var baseA = dark ? tk.callGlowA : tk.orbMint;
  var baseB = dark ? tk.callGlowB : tk.orbLav;

  // Lớp 1 — quầng lớn, lệch tâm, độ đậm thấp.
  circle(f, "bg-orb-a", -260, -300, 900, baseA, dark ? 0.30 : 0.22);
  circle(f, "bg-orb-b", 1000, 420, 820, baseB, dark ? 0.26 : 0.18);

  // Lớp 2 — quầng phụ nhỏ, phía đối diện, tạo cân bằng bất đối xứng.
  circle(f, "bg-orb-c", 1120, -220, 520, dark ? tk.callGlowB : tk.orbSky, dark ? 0.20 : 0.16);
  circle(f, "bg-orb-d", -160, 700, 460, dark ? tk.callGlowA : tk.orbMint, dark ? 0.18 : 0.14);

  // Lớp 3 — vòng đồng tâm sau thẻ: gợi "kết nối", tạo chiều sâu bằng 5 node.
  // (Trước là lưới chấm 836 node/khung — nặng và rối Layers panel.)
  var ringC = dark ? "#FFFFFF" : "#101828";
  for (var ri = 0; ri < 5; ri++) {
    var rd = 320 + ri * 150;
    var rg = circle(f, "bg-ring-" + ri, PAGE_W / 2 - rd / 2, PAGE_H / 2 - rd / 2, rd,
      ringC, dark ? 0.055 - ri * 0.008 : 0.045 - ri * 0.006);
    rg.fills = [];
    rg.strokes = [{ type: "SOLID", color: hx6(ringC) }];
    rg.strokeWeight = 1;
    rg.strokeAlign = "INSIDE";
    rg.effects = [];
  }
  // Lớp 4 — vignette: 4 dải mảnh ở mép, tối dần ra ngoài.
  var vg = dark ? "#000000" : "#101828";
  rect(f, "vign-top", 0, 0, PAGE_W, 120, vg, 0, 0.06);
  rect(f, "vign-bottom", 0, PAGE_H - 120, PAGE_W, 120, vg, 0, 0.06);
  rect(f, "vign-left", 0, 0, 160, PAGE_H, vg, 0, 0.05);
  rect(f, "vign-right", PAGE_W - 160, 0, 160, PAGE_H, vg, 0, 0.05);
}

// Logo mark nhỏ căn giữa trên tiêu đề + thanh ba màu dưới tiêu đề.
// Logo THẬT lấy từ ảnh đã có trong file (node tên koola-logo / koola-mark).
// Chỉ vẽ arc khi file không có ảnh nào — không tự dựng logo thay thương hiệu.

// Ước lượng chiều cao khối logo trước khi vẽ thẻ, để thẻ ôm đúng nội dung.
function authLockupH(subtitle, logoW) {
  var logo = findBrand(/koola-logo/i);
  if (logo) {
    var h = Math.round((logoW / logo.width) * logo.height);
    return h + (subtitle ? 34 : 0) + 14;
  }
  if (findBrand(/koola-mark/i)) return 48 + 32 + (subtitle ? 44 : 20);
  return 40 + (subtitle ? 50 : 14);
}

function authBrandLockup(f, cx, y, tk, subtitle, logoW) {
  logoW = logoW || 156;
  var logo = findBrand(/koola-logo/i);
  var mark = findBrand(/koola-mark/i);

  // Ưu tiên logo đầy đủ (mark + wordmark): ảnh đã chứa chữ, không thêm chữ.
  if (logo) {
    var LH = Math.round((logoW / logo.width) * logo.height);
    placeBrand(f, "auth-logo", logo, cx - logoW / 2, y, logoW);
    var endY = y + LH;
    if (subtitle) {
      mkText(f, "auth-logo-sub", subtitle, cx - 220, endY + 12, TY.bodySm,
        tk.muted, "Regular", 440, 20, "CENTER");
      endY += 34;
    }
    return endY + 14;
  }

  // Có mark nhưng không có logo đầy đủ: mark + chữ KOOLA + thanh ba màu.
  if (mark) {
    var M = 48;
    placeBrand(f, "auth-mark", mark, cx - M / 2, y, M);
    mkText(f, "auth-logo-word", "KOOLA", cx - 100, y + M + 8, TY.bodySm,
      tk.ink, "Bold", 200, 18, "CENTER");
    var barY = y + M + 32;
    rect(f, "auth-sig-1", cx - 28, barY, 18, 3, tk.brandRed, 2);
    rect(f, "auth-sig-2", cx - 9, barY, 18, 3, tk.tiffany700, 2);
    rect(f, "auth-sig-3", cx + 10, barY, 18, 3, tk.brandGreen, 2);
    if (subtitle) {
      mkText(f, "auth-logo-sub", subtitle, cx - 220, barY + 14, TY.bodySm,
        tk.muted, "Regular", 440, 20, "CENTER");
      return barY + 44;
    }
    return barY + 20;
  }

  // Không có ảnh nào: vẽ mark bằng arc để khung vẫn đọc được, kèm nhắc nhở.
  var M2 = 40;
  var mx = cx - M2 / 2;
  arc(f, "auth-arc-red", mx, y, M2, 0, 90, tk.brandRed);
  arc(f, "auth-arc-blue", mx, y, M2, 120, 210, tk.brandBlue);
  arc(f, "auth-arc-green", mx, y, M2, 240, 330, tk.brandGreen);
  mkText(f, "auth-logo-missing", "Kéo koola-logo.png vào file rồi Run lại plugin",
    cx - 220, y + M2 + 6, TY.micro, tk.warnInk, "Bold", 440, 14, "CENTER");
  if (subtitle) {
    mkText(f, "auth-logo-sub", subtitle, cx - 220, y + M2 + 26, TY.bodySm,
      tk.muted, "Regular", 440, 20, "CENTER");
    return y + M2 + 50;
  }
  return y + M2 + 14;
}
// Ô OTP: 6 ô 48×56, cách 10. Ô đã nhập viền primary, ô đang gõ có con trỏ.
function otpRow(f, tk, prefix, cx, y, filled, total) {
  var CELL = 48, GAP = 10;
  var totalW = total * CELL + (total - 1) * GAP;
  var startX = cx - totalW / 2;
  for (var i = 0; i < total; i++) {
    var bx = startX + i * (CELL + GAP);
    var done = i < filled;
    var active = i === filled;
    var box = strokeRect(f, prefix + "-cell-" + i, bx, y, CELL, 56,
      done ? tk.white : tk.surface, R.sm,
      done || active ? tk.primary : tk.line);
    if (done || active) box.strokeWeight = 2;
    if (done) {
      mkText(f, prefix + "-d-" + i, String((i * 7 + 3) % 10), bx, y + 15, TY.heading,
        tk.ink, "Bold", CELL, 26, "CENTER");
    } else if (active) {
      rect(f, prefix + "-caret", bx + CELL / 2 - 1, y + 16, 2, 24, tk.primary, 1);
    }
  }
  return y + 56;
}

// Thẻ form giữa màn hình. Trả về y bắt đầu nội dung.
function authCard(f, tk, h, shadowLevel) {
  var y = Math.round((PAGE_H - h) / 2);
  var card = rect(f, "auth-card", AUTH_X, y, AUTH_CARD_W, h, tk.panel, R.lg);
  shadowL(card, shadowLevel || "xl");
  return y;
}

// Ô nhập có icon trái. Nhãn nằm TRÊN ô, cách 8px.
function authField(f, tk, prefix, label, value, y, opts) {
  opts = opts || {};
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var H = 52;

  if (label) {
    mkText(f, prefix + "-lb", label, X, y, TY.caption, tk.muted, "Bold", W, 16);
  }
  var fieldY = y + (label ? 22 : 0);

  var box = strokeRect(f, prefix + "-box", X, fieldY, W, H,
    opts.error ? tk.dangerSoft : tk.surface, R.sm,
    opts.error ? tk.danger : (opts.focus ? tk.primary : tk.line));
  if (opts.error || opts.focus) box.strokeWeight = 2;

  if (opts.icon) {
    iconCentered(f, prefix + "-ic", opts.icon, X, fieldY, H, 20,
      opts.error ? tk.danger : tk.faint);
  }
  mkText(f, prefix + "-val", value, X + 44, fieldY + 16, TY.label,
    opts.placeholder ? tk.faintInk : tk.ink, "Regular", W - 96, 20);
  if (opts.trailing) {
    iconCentered(f, prefix + "-tr", opts.trailing, X + W - 40, fieldY, H, 20, tk.muted);
  }
  return fieldY + H;
}

// Hàng trạng thái dưới ô mật khẩu: CapsLock (trái) + quên mật khẩu (phải).
function authUnderField(f, tk, prefix, y, state, linkText, linkColor) {
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;

  if (state) {
    iconCentered(f, prefix + "-st-ic", state.icon, X, y - 2, 18, 14, state.color);
    mkText(f, prefix + "-st-t", state.text, X + 22, y, TY.caption, state.color, "Regular", 220, 16);
  }
  if (linkText) {
    mkText(f, prefix + "-lnk", linkText, X + W - 130, y, TY.caption,
      linkColor || tk.primary, "Bold", 130, 16, "RIGHT");
  }
  return y + 20;
}

// ═══════════════════════════════════════════════════════════════════════════
// S01–S04 — SPLASH · ĐĂNG NHẬP · LOGIN LỖI · LOGIN QR
// ═══════════════════════════════════════════════════════════════════════════

function s01Splash(fx) {
  var tk = L;
  var f = frame("S01 — Splash", fx, tk.cream);

  rect(f, "orb-1", -160, -200, 600, 600, tk.orbMint, 300, 0.35);
  rect(f, "orb-2", 1040, 560, 560, 560, tk.orbLav, 280, 0.3);

  var plate = rect(f, "splash-plate", 520, 260, 400, 340, tk.white, 24);
  shadowL(plate, "xl");

  var logo = findBrand(/koola-logo/i);
  if (logo) {
    var lw = 300;
    var lh = Math.round((lw * logo.height) / logo.width);
    var ly = 260 + (340 - lh - 46) / 2;
    placeBrand(f, "splash-logo", logo, 570, ly, lw);
    mkText(f, "splash-tag", "Nơi kết nối mọi nhu cầu", 520, ly + lh + 12, TY.label,
      tk.muted, "Regular", 400, 20, "CENTER");
  } else {
    markOrWarn(f, "splash-mark", 672, 340, 96);
  }

  rect(f, "prog-bg", 620, 640, 200, 6, tk.line, 3);
  rect(f, "prog-fg", 620, 640, 132, 6, tk.primary, 3);
  return f;
}

// Khối form dùng lại cho S02 và S03.


function s02Login(fx) {
  var tk = L;
  var f = frame("S02 — Đăng nhập", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 32 + authLockupH(true, 156) + 396 + 32;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 36;

  y = authBrandLockup(f, CX, y, tk, "Where All Needs Connect!") + 18;

  var emailEnd = authField(f, tk, "lg-mail", "Email", "ban@koola.chat", y,
    { icon: "mail", placeholder: true, trailing: null });
  y = emailEnd + 18;

  var passEnd = authField(f, tk, "lg-pass", "Mật khẩu", "••••••••••", y,
    { icon: "lock", trailing: "eye-off", focus: true });
  y = authUnderField(f, tk, "lg-pw", passEnd + 8,
    { icon: "keyboard", text: "Caps Lock đang bật", color: tk.warnInk },
    "Quên mật khẩu?", tk.primary) + 10;

  primaryButton(f, "btn-login", "Đăng nhập", X, y, W, 52, tk, { icon: "arrow-right" });
  y += 52 + 20;

  // Divider "hoặc" — kẻ dừng trước nhãn.
  var segW = Math.round((W - 40) / 2) - 12;
  hline(f, "lg-or-l", X, y + 8, segW, tk.line);
  mkText(f, "lg-or-t", "hoặc", X, y, TY.caption, tk.faintInk, "Regular", W, 16, "CENTER");
  hline(f, "lg-or-r", X + W - segW, y + 8, segW, tk.line);
  y += 28;

  // Nút QR — icon + nhãn căn giữa thành cụm.
  strokeRect(f, "lg-qr", X, y, W, 50, tk.panel, R.sm, tk.line);
  var qrLabel = 148;
  var qrx = X + Math.round((W - (20 + 12 + qrLabel)) / 2);
  iconCentered(f, "lg-qr-ic", "qr-code", qrx, y, 50, 20, tk.ink);
  mkText(f, "lg-qr-t", "Đăng nhập bằng QR", qrx + 32, y + 15, TY.bodySm, tk.ink,
    "Regular", qrLabel, 20);
  y += 50 + 20;

  // Footer trong thẻ — chỉ một dòng, không nhồi.
  mkText(f, "lg-foot", "Chưa có tài khoản? Tạo ngay", X, y, TY.caption,
    tk.muted, "Regular", W, 16, "CENTER");
  return f;
}


function s03LoginError(fx) {
  var tk = L;
  var f = frame("S03 — Đăng nhập lỗi", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 28 + authLockupH(false, 156) + 408 + 28;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 32;

  y = authBrandLockup(f, CX, y, tk, null) + 16;

  y = authField(f, tk, "er-mail", "Email", "an.nguyen@koola.chat", y,
    { icon: "mail" }) + 18;

  var passEnd = authField(f, tk, "er-pass", "Mật khẩu", "sai-mat-khau", y,
    { icon: "lock", trailing: "eye", error: true });

  // Khối lỗi: nền dangerSoft, viền 1px, icon + 2 dòng.
  var eY = passEnd + 10;
  var eb = strokeRect(f, "er-banner", X, eY, W, 52, tk.dangerSoft, R.xs, tk.danger);
  iconCentered(f, "er-banner-ic", "triangle-alert", X, eY, 52, 18, tk.dangerInk);
  mkText(f, "er-banner-t", "Mật khẩu không đúng", X + 40, eY + 10, TY.bodySm,
    tk.dangerInk, "Bold", W - 60, 18);
  mkText(f, "er-banner-s", "Còn 4 lần thử trước khi tạm khoá", X + 40, eY + 29, TY.tiny,
    tk.dangerInk, "Regular", W - 60, 15);
  y = eY + 52 + 12;

  mkText(f, "er-forgot", "Quên mật khẩu?", X + W - 130, y, TY.caption,
    tk.primary, "Bold", 130, 16, "RIGHT");
  y += 24;

  primaryButton(f, "btn-login-error", "Đăng nhập", X, y, W, 52, tk, { icon: "arrow-right" });
  y += 52 + 18;

  strokeRect(f, "er-qr", X, y, W, 50, tk.panel, R.sm, tk.line);
  var qrLabel = 148;
  var qrx = X + Math.round((W - (20 + 12 + qrLabel)) / 2);
  iconCentered(f, "er-qr-ic", "qr-code", qrx, y, 50, 20, tk.ink);
  mkText(f, "er-qr-t", "Đăng nhập bằng QR", qrx + 32, y + 15, TY.bodySm, tk.ink,
    "Regular", qrLabel, 20);
  return f;
}


function s04LoginQr(fx) {
  var tk = L;
  var f = frame("S04 — Đăng nhập QR", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 28 + authLockupH(true, 156) + 300 + 28;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 32;

  y = authBrandLockup(f, CX, y, tk, "Quét mã để đăng nhập") + 16;

  // Khung QR 208².
  var QS = 208;
  var qx = CX - QS / 2;
  strokeRect(f, "qr-frame", qx, y, QS, QS, tk.white, R.md, tk.line);

  var corners = [[qx + 14, y + 14], [qx + QS - 46, y + 14], [qx + 14, y + QS - 46]];
  for (var c = 0; c < corners.length; c++) {
    rect(f, "qr-o-" + c, corners[c][0], corners[c][1], 32, 32, tk.ink, 4);
    rect(f, "qr-i-" + c, corners[c][0] + 8, corners[c][1] + 8, 16, 16, tk.white, 2);
    rect(f, "qr-k-" + c, corners[c][0] + 12, corners[c][1] + 12, 8, 8, tk.ink, 1);
  }
  var seed = 0;
  for (var m = 0; m < 46; m++) {
    var gx = qx + 14 + ((m * 37) % 22) * 8;
    var gy = y + 54 + ((m * 53) % 18) * 8;
    if (gy > y + QS - 14) continue;
    seed = (seed + 7) % 3;
    if (seed) rect(f, "qr-m-" + m, gx, gy, 7, 7, tk.ink, 1);
  }
  // Tâm QR: dùng mark THẬT nếu file có ảnh; không thì vẽ arc.
  var qMark = findBrand(/koola-mark/i);
  circle(f, "qr-center", CX - 24, y + QS / 2 - 24, 48, tk.white);
  if (qMark) {
    placeBrand(f, "qr-center-mark", qMark, CX - 17, y + QS / 2 - 17, 34);
  } else {
    arc(f, "qr-arc-r", CX - 17, y + QS / 2 - 17, 34, 0, 90, tk.brandRed);
    arc(f, "qr-arc-b", CX - 17, y + QS / 2 - 17, 34, 120, 210, tk.brandBlue);
    arc(f, "qr-arc-g", CX - 17, y + QS / 2 - 17, 34, 240, 330, tk.brandGreen);
  }

  y += QS + 16;

  // Trạng thái chờ — nền warnSoft, pill.
  var sb = rect(f, "qr-status", CX - 108, y, 216, 40, tk.warnSoft, R.pill);
  iconCentered(f, "qr-status-ic", "clock", CX - 92, y, 40, 18, tk.warnInk);
  mkText(f, "qr-status-t", "Đang chờ xác nhận · 04:52", CX - 70, y + 11, TY.tiny,
    tk.warnInk, "Bold", 170, 18);
  y += 40 + 20;

  // Nút chuyển sang mật khẩu — dạng text, không phải nút thứ hai.
  mkText(f, "qr-switch", "Đăng nhập bằng mật khẩu", X, y, TY.caption,
    tk.primary, "Bold", W, 16, "CENTER");
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// DỮ LIỆU MẪU
// ═══════════════════════════════════════════════════════════════════════════

var CONVS = [
  { id: "1", name: "An Nguyễn", preview: "Đã gửi file thiết kế", time: "10:24", unread: "2", dot: true, active: true },
  { id: "2", name: "Koola Dev", preview: "Evan: merge PR #21 nhé", time: "09:12", unread: "5", pinned: true },
  { id: "3", name: "Mẹ", preview: "Con ăn cơm chưa?", time: "Hôm qua", ticks: true },
  { id: "4", name: "Design Team", preview: "Figma vừa update", time: "T2", ticks: true, muted: true },
  { id: "5", name: "Bình Trần", preview: "Ok hẹn cuối tuần", time: "T2" },
  { id: "6", name: "Chị Lê", preview: "Cảm ơn bạn nhiều!", time: "28/10" },
];

var FRIENDS = [
  { id: "f1", name: "An Nguyễn", sub: "Đang hoạt động", on: true },
  { id: "f2", name: "Bình Trần", sub: "5 phút trước", on: true },
  { id: "f3", name: "Chị Lê", sub: "2 giờ trước" },
  { id: "f4", name: "Dũng Phạm", sub: "Hôm qua" },
  { id: "f5", name: "Hà Vũ", sub: "3 ngày trước" },
];

// ═══════════════════════════════════════════════════════════════════════════
// S05 — SHELL + DANH SÁCH
// ═══════════════════════════════════════════════════════════════════════════

function s05Shell(fx) {
  var tk = L;
  var f = frame("S05 — Shell + Danh sách", fx, tk.canvas);

  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 88, 288, tk, "Tìm kiếm");

  chip(f, "chip-0", "Tất cả", 96, 148, 76, true, tk);
  chip(f, "chip-1", "Chưa đọc", 180, 148, 96, false, tk);
  chip(f, "chip-2", "Nhóm", 284, 148, 68, false, tk);

  for (var i = 0; i < CONVS.length; i++) {
    // Hàng "Mẹ" (index 2) đang hover → hiện nút "..." thay cho giờ.
    var row = CONVS[i];
    if (i === 2) {
      row = { id: row.id, name: row.name, preview: row.preview, time: row.time,
        ticks: row.ticks, unread: row.unread, dot: row.dot, pinned: row.pinned,
        muted: row.muted, active: row.active, menu: true };
    }
    convRow(f, 88, 204 + i * 76, 308, row, tk);
  }

  // Menu thao tác bung ra từ nút "..." của hàng đang hover.
  showConvMenu(f, 88, 356, 308, tk);

  // Empty state căn giữa vùng phải
  circle(f, "empty-well", MID - 80, 316, 160, tk.primarySoft, 0.7);
  iconCentered(f, "empty-ic", "message-circle", MID - 80, 316, 160, 56, tk.primary);
  mkText(f, "empty-title", "Chọn một cuộc trò chuyện",
    LIST_END, 508, TY.heading, tk.ink, "Bold", PAGE_W - LIST_END, 28, "CENTER");
  return f;
}

// Menu thao tác hội thoại — bung ra từ nút "..." của hàng đang hover.
function showConvMenu(parent, rowX, rowY, rowW, tk) {
  var MW = 236;
  // Căn mép phải menu với mép phải nút "..." (rowX + rowW - 12).
  var edge = rowX + rowW - 12;
  var mx = edge - MW;
  var my = rowY + 46;

  var menu = rect(parent, "conv-menu", mx, my, MW, 328, tk.panel, 10);
  shadowL(menu, "lg");
  menu.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  menu.strokeWeight = 1;
  menu.strokeAlign = "INSIDE";

  var items = [
    { ic: "check-check", lb: "Đánh dấu đã đọc" },
    { ic: "pin", lb: "Ghim hội thoại" },
    { ic: "bell-off", lb: "Tắt thông báo" },
    { ic: "archive", lb: "Lưu trữ" },
    { ic: "user-x", lb: "Chặn", danger: true },
    { ic: "trash-2", lb: "Xoá hội thoại", danger: true },
  ];

  for (var i = 0; i < items.length; i++) {
    var iy = my + 10 + i * 40;
    if (i === 4) hline(parent, "conv-menu-sep", mx + 8, iy - 6, MW - 16, tk.line);
    var col = items[i].danger ? tk.danger : tk.ink;
    iconCentered(parent, "conv-menu-ic-" + i, items[i].ic, mx + 12, iy, 24, 18, col);
    mkText(parent, "conv-menu-lb-" + i, items[i].lb, mx + 44, iy + 3, 13, col, "Regular", 180, 18);
  }

  return menu;
}

// ═══════════════════════════════════════════════════════════════════════════
// S06 — TRẠNG THÁI DANH SÁCH (skeleton · trống · không kết quả · offline)
// ═══════════════════════════════════════════════════════════════════════════

function s06ListStates(fx) {
  var tk = L;
  var f = frame("S06 — Trạng thái danh sách", fx, tk.canvas);

  // 3 cột 440 căn giữa theo bề ngang khung: (1440 - 3*440) / 4 = 30.
  var CW = 440;
  var cols = [
    { x: 30, title: "Đang tải (skeleton)" },
    { x: 30 + CW + 20, title: "Chưa có hội thoại" },
    { x: 30 + 2 * (CW + 20), title: "Tìm không kết quả" },
  ];

  for (var c = 0; c < cols.length; c++) {
    var cx = cols[c].x;
    var panel = rect(f, "state-panel-" + c, cx, 80, CW, 796, tk.panel, 16);
    hairline(panel, tk.line);

    mkText(f, "state-title-" + c, cols[c].title, cx + 32, 112, TY.heading, tk.ink, "Bold", CW - 64, 26);
    hline(f, "state-line-" + c, cx + 32, 156, CW - 64, tk.line);

    if (c === 0) {
      for (var s = 0; s < 8; s++) {
        var sy = 188 + s * 76;
        circle(f, "sk-ava-" + s, cx + 32, sy, 48, tk.iconWell);
        rect(f, "sk-name-" + s, cx + 92, sy + 8, 140, 12, tk.iconWell, 8);
        rect(f, "sk-prev-" + s, cx + 92, sy + 30, 200, 10, tk.iconWell, 4);
      }
    } else if (c === 1) {
      circle(f, "st-well-1", cx + CW / 2 - 60, 344, 120, tk.surface);
      iconCentered(f, "st-ic-1", "message-square", cx + CW / 2 - 60, 344, 120, 44, tk.faint);
      mkText(f, "st-t-1", "Chưa có cuộc trò chuyện", cx + 32, 492, TY.heading, tk.ink, "Bold", CW - 64, 24, "CENTER");
      mkText(f, "st-s-1", "Bắt đầu bằng cách tìm một người bạn", cx + 32, 522, TY.bodySm, tk.muted, "Regular", CW - 64, 20, "CENTER");
      rect(f, "st-btn-1", cx + CW / 2 - 70, 564, 140, 44, tk.primary, 10);
      lucide(f, "st-btn-ic-1", "user-plus", cx + CW / 2 - 56, 576, 20, tk.white);
      mkText(f, "st-btn-t-1", "Tìm bạn", cx + CW / 2 - 28, 575, TY.bodySm, tk.white, "Bold", 90, 20);
    } else {
      strokeRect(f, "st-search-2", cx + 32, 180, CW - 64, 44, tk.surface, R.pill, tk.line);
      lucide(f, "st-search-ic-2", "search", cx + 48, 192, 20, tk.faint);
      mkText(f, "st-search-t-2", "koola", cx + 78, 192, TY.label, tk.ink, "Regular", 300, 20);

      circle(f, "st-well-2", cx + CW / 2 - 60, 344, 120, tk.surface);
      iconCentered(f, "st-ic-2", "search", cx + CW / 2 - 60, 344, 120, 44, tk.faint);
      mkText(f, "st-t-2", "Không tìm thấy kết quả", cx + 32, 492, TY.heading, tk.ink, "Bold", CW - 64, 24, "CENTER");
      mkText(f, "st-s-2", "Thử từ khoá khác hoặc kiểm tra chính tả", cx + 32, 522, TY.bodySm, tk.muted, "Regular", CW - 64, 20, "CENTER");
    }
  }

  // Dải offline nổi — không cắt nội dung 3 cột.
  var bar = rect(f, "offline", 560, 830, 660, 48, tk.warnInk, 24);
  shadowL(bar, "glow");
  lucide(f, "offline-ic", "wifi-off", 584, 843, 20, tk.white);
  mkText(f, "offline-t", "Mất kết nối — tin nhắn sẽ tự gửi lại khi có mạng",
    614, 843, TY.bodySm, tk.white, "Bold", 480, 20);
  mkText(f, "offline-btn", "Thử lại", 1132, 843, TY.bodySm, tk.white, "Bold", 64, 20, "RIGHT");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// NỘI DUNG CHAT ĐẦY ĐỦ — dùng cho S07 (sáng) và S08 (tối)
// ═══════════════════════════════════════════════════════════════════════════

function chatConversation(parent, tk) {
  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var L0 = A + 66;        // mép trái của bubble đối phương
  var R0 = RIGHT;         // mép phải của bubble mình

  // ── Thanh tin ghim ────────────────────────────────────────────────────
  rect(parent, "pinned-bar", A, 76, AW, 44, tk.surface, 0);
  hline(parent, "pinned-line", A, 119, AW, tk.line);
  rect(parent, "pinned-accent", A + 24, 88, 3, 20, tk.primary, 2);
  lucide(parent, "pinned-ic", "pin", A + 36, 88, 20, tk.primary);
  mkText(parent, "pinned-t", "Ghim: Họp nhóm thứ 6 lúc 15:00", A + 62, 88, TY.caption, tk.ink, "Regular", 420, 18);
  lucide(parent, "pinned-chev", "chevron-down", RIGHT - 24, 89, 20, tk.faint);

  // ── Divider ngày ──────────────────────────────────────────────────────
  rect(parent, "date-pill", MID - 44, 132, 88, 26, tk.surface, 14);
  mkText(parent, "date-t", "Hôm nay", MID - 44, 137, TY.tiny, tk.muted, "Bold", 88, 16, "CENTER");

  // ── Nhóm tin của An (tin đầu có avatar + tên) ─────────────────────────
  rect(parent, "other-ava", A + 24, 176, 32, 32, tk.primarySoft, 16);
  mkText(parent, "other-name", "An Nguyễn", L0, 184, TY.caption, tk.muted, "Bold", 200, 16);

  // Nhóm tin cùng người: tin đầu bo đủ 16; tin cuối vuông góc trái-dưới.
  corners(strokeRect(parent, "bub-g1", L0, 196, 320, 44, tk.bubbleOther, 16, tk.bubbleBorder),
    16, 16, 4, 16);
  mkText(parent, "msg-g1", "Chào cậu, mình gửi file thiết kế mới", L0 + 16, 208, TY.label, tk.ink, "Regular", 288, 20);

  corners(strokeRect(parent, "bub-g2", L0, 244, 252, 44, tk.bubbleOther, 16, tk.bubbleBorder),
    16, 4, 16, 16);
  mkText(parent, "msg-g2", "Cậu xem giúp mình nhé", L0 + 16, 256, TY.label, tk.ink, "Regular", 220, 20);
  mkText(parent, "time-g2", "10:22", L0, 292, TY.micro, tk.faintInk, "Regular", 60, 14);

  // ── Tin có reply ──────────────────────────────────────────────────────
  strokeRect(parent, "bub-reply", L0, 304, 340, 96, tk.bubbleOther, 16, tk.bubbleBorder);
  rect(parent, "reply-quote", L0 + 12, 316, 316, 44, tk.surface, R.xs2);
  rect(parent, "reply-accent", L0 + 12, 316, 3, 44, tk.accent, 2);
  mkText(parent, "reply-name", "Bạn", L0 + 24, 321, TY.tiny, tk.accentInk, "Bold", 200, 14);
  mkText(parent, "reply-txt", "Cậu xem giúp mình nhé", L0 + 24, 337, TY.caption, tk.muted, "Regular", 280, 16);
  mkText(parent, "msg-reply", "Mình xem rồi, layout ổn", L0 + 18, 366, TY.label, tk.ink, "Regular", 300, 20);

  // ── Của mình + ticks ──────────────────────────────────────────────────
  rect(parent, "bub-m1", R0 - 322, 416, 322, 44, tk.primary, 16);
  mkText(parent, "msg-m1", "Ok, mình mở xem luôn đây", R0 - 304, 428, TY.label, tk.white, "Regular", 250, 20);
  mkText(parent, "time-m1", "10:24", R0 - 62, 436, TY.micro, tk.white, "Regular", 30, 14, "RIGHT");
  lucide(parent, "ticks-m1", "check-check", R0 - 28, 436, 16, tk.white);

  // ── Cột trái: ảnh + file (ảnh tràn trên, hàng file dưới divider) ───────
  var MEDIA_W = 300;
  var MEDIA_Y = 476;
  var MEDIA_H = 174;
  strokeRect(parent, "bub-media", L0, MEDIA_Y, MEDIA_W, MEDIA_H, tk.bubbleOther, 16, tk.bubbleBorder);

  // Ảnh: lề 10px, bo 10.
  rect(parent, "media-ph", L0 + 10, MEDIA_Y + 10, MEDIA_W - 20, 100, tk.iconWell, 10);
  iconCentered(parent, "media-ic", "image", L0 + 10, MEDIA_Y + 10, 100, 32, tk.muted);

  // Divider tràn hết bề ngang bubble.
  hline(parent, "media-div", L0, MEDIA_Y + 116, MEDIA_W, tk.line);

  // Hàng file: icon · tên + dung lượng · nút tải.
  roundButton(parent, "file-ic-bg", "file-text", L0 + 12, MEDIA_Y + 126, 32, tk.primarySoft, tk.primaryDark);
  mkText(parent, "file-name", "koola-design-v2.fig", L0 + 54, MEDIA_Y + 124, TY.caption,
    tk.ink, "Bold", 160, 16);
  mkText(parent, "file-size", "24,8 MB · FIG", L0 + 54, MEDIA_Y + 142, TY.micro,
    tk.muted, "Regular", 160, 14);
  roundButton(parent, "file-dl", "download", L0 + MEDIA_W - 44, MEDIA_Y + 128, 28,
    tk.surface, tk.primaryDark);

  // ── Cột phải: voice ───────────────────────────────────────────────────
  rect(parent, "bub-voice", R0 - 300, 476, 300, 56, tk.primary, 16);
  roundButton(parent, "voice-play", "play", R0 - 288, 488, 32, tk.white, tk.primary);
  var heights = [10, 18, 26, 14, 22, 30, 16, 24, 12, 20, 28, 14, 18, 24, 10];
  for (var wv = 0; wv < heights.length; wv++) {
    rect(parent, "wave-" + wv, R0 - 244 + wv * 12, 504 - heights[wv] / 2,
      3, heights[wv], tk.white, 2, 0.9);
  }
  mkText(parent, "voice-t", "0:34", R0 - 62, 494, TY.micro, tk.white, "Regular", 40, 14, "RIGHT");

  // ── Tin lỗi gửi (phải, dưới voice) ────────────────────────────────────
  // Icon cảnh báo và nhãn "Gửi lại" dóng CÙNG mép phải trong bubble.
  var failW = 322;
  var failX = R0 - failW;
  var failY = 548;
  var failH = 58;
  var failEdge = failX + failW - 16;          // mép phải nội dung
  strokeRect(parent, "bub-fail", failX, failY, failW, failH, tk.dangerSoft, 16, tk.danger);
  mkText(parent, "msg-fail", "Mình gửi lại sau nhé", failX + 18, failY + 11, TY.label,
    tk.ink, "Regular", 220, 20);
  lucide(parent, "fail-ic", "circle-alert", failEdge - 16, failY + 12, 16, tk.danger);
  mkText(parent, "fail-retry", "Gửi lại", failEdge - 44, failY + 34, TY.micro,
    tk.dangerInk, "Bold", 44, 14, "RIGHT");

  // ── Thu hồi (trái) — nằm DƯỚI bubble ảnh, không đè lên ────────────────
  var recallY = MEDIA_Y + MEDIA_H + 12;      // 670
  rect(parent, "recall-pill", L0, recallY, 240, 32, tk.surface, 16);
  lucide(parent, "recall-ic", "undo", L0 + 16, recallY + 9, 16, tk.faint);
  mkText(parent, "recall-t", "Tin nhắn đã được thu hồi", L0 + 36, recallY + 10, TY.tiny,
    tk.muted, "Regular", 190, 16);

  // ── Reaction pill dưới bubble ảnh, cùng cụm với pill thu hồi ──────────
  var reactY = recallY + 32 + 8;            // 714
  strokeRect(parent, "react-pill", L0, reactY, 96, 24, tk.panel, 14, tk.line);
  mkText(parent, "react-e1", "❤️", L0 + 10, reactY + 4, TY.bodySm, tk.ink, "Regular", 20, 18);
  mkText(parent, "react-n1", "2", L0 + 30, reactY + 6, TY.tiny, tk.muted, "Bold", 12, 16);
  mkText(parent, "react-e2", "👍", L0 + 48, reactY + 4, TY.bodySm, tk.ink, "Regular", 20, 18);
  mkText(parent, "react-n2", "1", L0 + 68, reactY + 6, TY.tiny, tk.muted, "Bold", 12, 16);
  strokeRect(parent, "react-mine", L0 + 104, reactY, 68, 24, tk.primarySoft, 14, tk.primary);
  mkText(parent, "react-mine-e", "❤️", L0 + 114, reactY + 4, TY.bodySm, tk.ink, "Regular", 20, 18);
  mkText(parent, "react-mine-n", "1", L0 + 134, reactY + 6, TY.tiny, tk.primaryDark, "Bold", 12, 16);

  // ── Typing indicator ──────────────────────────────────────────────────
  var typingY = reactY + 28 + 8;            // 752
  strokeRect(parent, "typing-box", L0, typingY, 62, 24, tk.bubbleOther, 16, tk.bubbleBorder);
  circle(parent, "dot-1", L0 + 14, typingY + 12, 7, tk.faint);
  circle(parent, "dot-2", L0 + 26, typingY + 12, 7, tk.faint);
  circle(parent, "dot-3", L0 + 38, typingY + 12, 7, tk.faint);

  // ── Nút xuống cuối ────────────────────────────────────────────────────
  roundButton(parent, "scroll-bottom", "chevron-down", RIGHT - 68, 748, 40, tk.panel, tk.ink);
  var sb = parent.findOne(function (n) { return n.name === "scroll-bottom-bg"; });
  if (sb) { sb.strokes = [{ type: "SOLID", color: hx6(tk.line) }]; sb.strokeWeight = 1; sb.strokeAlign = "INSIDE"; }
  circle(parent, "scroll-badge", RIGHT - 54, 742, 16, tk.primary);

  return AW;
}

function s07Chat(fx) {
  var tk = L;
  var f = frame("S07 — Chat đầy đủ", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");
  for (var i = 0; i < 5; i++) convRow(f, 88, 148 + i * 76, 308, CONVS[i], tk);

  var AW = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });
  chatConversation(f, tk);
  composerBar(f, tk, LIST_END, AW, {});
  return f;
}

function s08ChatDark(fx) {
  var tk = D;
  var f = frame("S08 — Chat dark", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");
  for (var i = 0; i < 5; i++) convRow(f, 88, 148 + i * 76, 308, CONVS[i], tk);

  var AW = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });
  chatConversation(f, tk);
  composerBar(f, tk, LIST_END, AW, {});
  return f;
}
// ═══════════════════════════════════════════════════════════════════════════
// S09 — HÀNH ĐỘNG TIN NHẮN (hover toolbar + context menu)
// ═══════════════════════════════════════════════════════════════════════════

function s09MessageActions(fx) {
  var tk = L;
  var f = frame("S09 — Hành động tin nhắn", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  rect(f, "header", A, 0, AW, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, AW, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  mkText(f, "header-name", "An Nguyễn", A + 80, 20, TY.body, tk.ink, "Bold");
  mkText(f, "header-status", "Đang hoạt động", A + 80, 42, TY.caption, tk.accentInk, "Regular");

  // Tin đang hover
  strokeRect(f, "bub-hover", A + 66, 160, 320, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-hover", "Chào cậu, mình gửi file nhé", A + 84, 172, TY.label, tk.ink, "Regular", 284, 20);

  // Hover toolbar nổi phía trên-phải bubble
  var tx = A + 66 + 320 - 176;
  var ty = 112;
  var tb = rect(f, "hover-toolbar", tx, ty, 176, 40, tk.panel, 10);
  shadowL(tb, "lg");
  tb.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  tb.strokeWeight = 1;
  tb.strokeAlign = "INSIDE";

  var tools = ["smile-plus", "reply", "forward", "ellipsis"];
  for (var t = 0; t < tools.length; t++) {
    iconCentered(f, "tool-" + t, tools[t], tx + 8 + t * 40, ty + 4, 32, 20, tk.muted);
    if (t < tools.length - 1) vline(f, "tool-sep-" + t, tx + 44 + t * 40, ty + 12, 16, tk.line);
  }

  // Context menu (chuột phải) hiển thị đồng thời để so sánh
  var mx = A + 430;
  var my = 160;
  var menu = rect(f, "ctx-menu", mx, my, 244, 302, tk.panel, 10);
  shadowL(menu, "lg");
  menu.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  menu.strokeWeight = 1;
  menu.strokeAlign = "INSIDE";

  var items = [
    { ic: "reply", lb: "Trả lời" },
    { ic: "forward", lb: "Chuyển tiếp" },
    { ic: "copy", lb: "Sao chép" },
    { ic: "pin", lb: "Ghim tin nhắn" },
    { ic: "pencil", lb: "Chỉnh sửa" },
    { ic: "trash-2", lb: "Xoá", danger: true },
    { ic: "flag", lb: "Báo cáo", danger: true },
  ];
  for (var k = 0; k < items.length; k++) {
    var iy = my + 10 + k * 40;
    var col = items[k].danger ? tk.danger : tk.ink;
    iconCentered(f, "ctx-ic-" + k, items[k].ic, mx + 12, iy, 24, 18, col);
    mkText(f, "ctx-lb-" + k, items[k].lb, mx + 44, iy + 3, 13, col, "Regular", 180, 18);
    if (k === 5) hline(f, "ctx-sep", mx + 8, iy - 6, 228, tk.line);
  }

  // Chú thích
  caption(f, "Hover bubble → toolbar 4 nút. Chuột phải → menu 7 mục.", A + 66, 740, 700, tk);
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S10 — REACTION (picker + pill + ai đã thả)
// ═══════════════════════════════════════════════════════════════════════════

function s10Reactions(fx) {
  var tk = L;
  var f = frame("S10 — Thả cảm xúc", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  rect(f, "header", A, 0, AW, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, AW, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  mkText(f, "header-name", "An Nguyễn", A + 80, 20, TY.body, tk.ink, "Bold");

  // Bubble của người khác đã có reaction
  strokeRect(f, "bub-r1", A + 66, 190, 320, 52, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-r1", "Chào cậu, mình gửi file nhé", A + 84, 206, TY.label, tk.ink, "Regular", 284, 20);

  // Pill reaction
  var px = A + 66;
  var py = 254;
  strokeRect(f, "pill-r1", px, py, 88, 30, tk.panel, 15, tk.line);
  mkText(f, "pill-e1", "❤️", px + 10, py + 5, TY.label, tk.ink, "Regular", 20, 18);
  mkText(f, "pill-n1", "2", px + 32, py + 7, TY.tiny, tk.muted, "Bold", 12, 16);
  mkText(f, "pill-e2", "😆", px + 48, py + 5, TY.label, tk.ink, "Regular", 20, 18);
  mkText(f, "pill-n2", "1", px + 70, py + 7, TY.tiny, tk.muted, "Bold", 12, 16);

  // Bubble của mình — reaction "của tôi" nền primarySoft
  rect(f, "bub-r2", RIGHT - 322, 190, 322, 52, tk.primary, 16);
  mkText(f, "msg-r2", "Ok, mình mở xem luôn đây", RIGHT - 304, 206, TY.label, tk.white, "Regular", 250, 20);
  strokeRect(f, "pill-r2", RIGHT - 102, 254, 72, 30, tk.primarySoft, 15, tk.primary);
  mkText(f, "pill-e3", "👍", RIGHT - 92, 259, TY.label, tk.ink, "Regular", 20, 18);
  mkText(f, "pill-n3", "1", RIGHT - 70, 261, TY.tiny, tk.primaryDark, "Bold", 12, 16);

  // ── Reaction picker nổi ───────────────────────────────────────────────
  var kx = A + 66;
  var ky = 300;
  var picker = rect(f, "react-picker", kx, ky, 284, 64, tk.panel, 24);
  shadowL(picker, "lg");
  picker.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  picker.strokeWeight = 1;
  picker.strokeAlign = "INSIDE";

  var emojis = ["❤️", "😆", "😮", "😢", "😡", "👍"];
  for (var e = 0; e < emojis.length; e++) {
    var ex = kx + 16 + e * 44;
    if (e === 0) circle(f, "pick-hover", ex - 4, ky + 10, 44, tk.primarySoft);
    mkText(f, "pick-e-" + e, emojis[e], ex + 4, ky + 18, 22, tk.ink, "Regular", 32, 30, "CENTER");
  }

  // ── Popover "ai đã thả" ───────────────────────────────────────────────
  var wx = A + 420;
  var wy = 300;
  var who = rect(f, "who-pop", wx, wy, 320, 244, tk.panel, 16);
  shadowL(who, "lg");
  who.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  who.strokeWeight = 1;
  who.strokeAlign = "INSIDE";

  mkText(f, "who-title", "Cảm xúc", wx + 20, wy + 18, TY.label, tk.ink, "Bold", 280, 20);
  hline(f, "who-line", wx + 20, wy + 46, 280, tk.line);

  var groups = [
    { emo: "❤️", count: 2, names: ["An Nguyễn", "Bình Trần"] },
    { emo: "😆", count: 1, names: ["Chị Lê"] },
    { emo: "👍", count: 1, names: ["Bạn"] },
  ];
  var gy = wy + 58;
  for (var g = 0; g < groups.length; g++) {
    mkText(f, "who-emo-" + g, groups[g].emo, wx + 20, gy, TY.body, tk.ink, "Regular", 24, 20);
    mkText(f, "who-cnt-" + g, String(groups[g].count), wx + 46, gy + 1, TY.caption, tk.muted, "Bold", 20, 18);
    gy += 26;
    for (var n = 0; n < groups[g].names.length; n++) {
      circle(f, "who-ava-" + g + "-" + n, wx + 26, gy - 2, 24, tk.primarySoft);
      mkText(f, "who-nm-" + g + "-" + n, groups[g].names[n], wx + 58, gy + 2, TY.caption, tk.ink, "Regular", 200, 16);
      gy += 24;
    }
    gy += 4;
  }

  caption(f, "6 cảm xúc nhanh. Pill hiện dưới bubble; bấm vào pill mở popover ai đã thả.", A + 66, 620, 760, tk);
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S11 — COMPOSER (4 biến thể)
// ═══════════════════════════════════════════════════════════════════════════

function s11Composer(fx) {
  var tk = L;
  var f = frame("S11 — Composer", fx, tk.canvas);

  var CX = 40;
  var CW = 1360;
  var PAD = 20;
  var A = CX + PAD;                  // 60
  var INNER = CW - PAD * 2;          // 1320
  var SEND = 48;
  var sendX = A + INNER - SEND;      // 1332 — nút gửi nằm TRONG bề ngang thẻ
  var pillW = sendX - 16 - A;        // 1256 — ô nhập kết thúc trước nút 16px

  var states = [
    { title: "Trống · nút gửi tắt", ph: "Nhắn tin…", disabled: true },
    { title: "Đang gõ · nút gửi bật", text: "Mình vừa xem xong, ổn lắm", focus: true,
      note: "Enter gửi · Shift+Enter xuống dòng" },
    { title: "Đang trả lời", reply: { n: "An Nguyễn", t: "Cậu xem giúp mình nhé" },
      text: "Mình xem rồi nhé", focus: true },
    { title: "Có đính kèm", attach: { n: "koola-v2.png", s: "2,4 MB" },
      ph: "Thêm tin nhắn…" },
    { title: "Nhiều dòng · ô tự giãn", text: "Dòng một\nDòng hai\nDòng ba", multiline: true, focus: true },
  ];

  var y = 24;

  for (var s = 0; s < states.length; s++) {
    var st = states[s];
    var rowH = st.multiline ? 84 : 52;
    var prevH = st.reply ? 52 : (st.attach ? 64 : 0);
    var cardH = PAD + (prevH ? prevH + 12 : 0) + rowH + PAD;

    // ── Tiêu đề variant + ghi chú ──
    mkText(f, "s11-t-" + s, st.title, CX, y, TY.bodySm, tk.ink, "Bold", 600, 18);
    if (st.note) {
      mkText(f, "s11-note-" + s, st.note, CX + CW - 420, y, TY.tiny, tk.faintInk,
        "Regular", 420, 18, "RIGHT");
    }
    y += 24;

    var card = rect(f, "s11-card-" + s, CX, y, CW, cardH, tk.panel, 16);
    hairline(card, tk.line);

    var cy = y + PAD;

    // ── Preview trả lời: cùng bề ngang với ô nhập ──
    if (st.reply) {
      rect(f, "s11-rp-bg-" + s, A, cy, pillW, 52, tk.surface, 10);
      rect(f, "s11-rp-bar-" + s, A, cy, 3, 52, tk.accent, 2);
      iconCentered(f, "s11-rp-ic-" + s, "reply", A + 14, cy + 17, 18, 16, tk.accent);
      mkText(f, "s11-rp-n-" + s, st.reply.n, A + 40, cy + 9, TY.tiny, tk.accentInk, "Bold", 260, 14);
      mkText(f, "s11-rp-t-" + s, st.reply.t, A + 40, cy + 27, TY.caption, tk.muted, "Regular", 900, 16);
      roundButton(f, "s11-rp-x-" + s, "x", A + pillW - 36, cy + 14, 24, tk.iconWell, tk.muted);
      cy += 52 + 12;
    }

    // ── Preview đính kèm ──
    if (st.attach) {
      strokeRect(f, "s11-ap-bg-" + s, A, cy, 268, 64, tk.panel, 12, tk.line);
      rect(f, "s11-ap-th-" + s, A + 8, cy + 8, 48, 48, tk.iconWell, 8);
      iconCentered(f, "s11-ap-ic-" + s, "image", A + 8, cy + 8, 48, 24, tk.muted);
      mkText(f, "s11-ap-n-" + s, st.attach.n, A + 66, cy + 14, TY.caption, tk.ink, "Bold", 150, 16);
      mkText(f, "s11-ap-s-" + s, st.attach.s + " · PNG", A + 66, cy + 32, TY.tiny,
        tk.muted, "Regular", 150, 14);
      roundButton(f, "s11-ap-x-" + s, "x", A + 238, cy + 6, 20, tk.ink, tk.white);
      cy += 64 + 12;
    }

    // ── Ô nhập + nút gửi cùng một hàng ──
    var pill = strokeRect(f, "s11-pill-" + s, A, cy, pillW, rowH, tk.surface, rowH / 2,
      st.focus ? tk.primary : tk.line);
    if (st.focus) pill.strokeWeight = 2;

    var iconY = cy + Math.round((rowH - 22) / 2);
    lucide(f, "s11-attach-" + s, "paperclip", A + 18, iconY, 22,
      st.focus ? tk.muted : tk.faint);

    if (st.text) {
      var lines = st.text.split("\n").length;
      mkText(f, "s11-txt-" + s, st.text, A + 52, cy + Math.round((rowH - lines * 20) / 2),
        TY.label, tk.ink, "Regular", pillW - 110, 20);
      // Con trỏ đặt ngay sau ký tự cuối của dòng cuối.
      var lastLine = st.text.split("\n")[lines - 1];
      var caretX = A + 52 + Math.round(lastLine.length * 7.2);
      rect(f, "s11-caret-" + s, caretX, cy + Math.round((rowH - lines * 20) / 2), 2, 20,
        tk.primary, 1);
    } else {
      mkText(f, "s11-ph-" + s, st.ph, A + 52, iconY, TY.label,
        tk.faintInk, "Regular", pillW - 110, 20);
    }

    lucide(f, "s11-smile-" + s, "smile", A + pillW - 40, iconY, 22,
      st.focus ? tk.muted : tk.faint);

    // Nút gửi: 48px, căn giữa theo ô nhập, nằm gọn trong thẻ.
    var sendBg = st.disabled ? tk.line : tk.primary;
    var sendY = cy + Math.round((rowH - SEND) / 2);
    var sb = circle(f, "s11-send-" + s, sendX, sendY, SEND, sendBg);
    if (!st.disabled) shadowL(sb, "glow");
    iconCentered(f, "s11-send-ic-" + s, "send", sendX, sendY, SEND, 20,
      st.disabled ? tk.faint : tk.white);

    y += cardH + 22;
  }

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S12 — EMOJI PICKER
// ═══════════════════════════════════════════════════════════════════════════

function s12Emoji(fx) {
  var tk = L;
  var f = frame("S12 — Emoji picker", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  rect(f, "header", A, 0, AW, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, AW, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  mkText(f, "header-name", "An Nguyễn", A + 80, 20, TY.body, tk.ink, "Bold");

  // Vài bubble nền
  strokeRect(f, "bub-e1", A + 66, 140, 300, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-e1", "Chào cậu, mình gửi file nhé", A + 84, 152, TY.label, tk.ink, "Regular", 264, 20);
  rect(f, "bub-e2", RIGHT - 302, 200, 302, 44, tk.primary, 16);
  mkText(f, "msg-e2", "Ok mình xem luôn", RIGHT - 284, 212, TY.label, tk.white, "Regular", 240, 20);

  composerBar(f, tk, A, AW, {});

  // ── Emoji picker — neo trên nút smile ─────────────────────────────────
  var pw = 400;
  var ph = 420;
  var px = RIGHT - pw - 24;
  var py = 812 - ph - 12;

  var pop = rect(f, "emoji-pop", px, py, pw, ph, tk.panel, 16);
  shadowL(pop, "lg");
  pop.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  pop.strokeWeight = 1;
  pop.strokeAlign = "INSIDE";

  // Tab
  var tabs = [
    { ic: "smile", on: true },
    { ic: "laugh", on: false },
    { ic: "heart", on: false },
    { ic: "thumbs-up", on: false },
    { ic: "clock", on: false },
  ];
  for (var t = 0; t < tabs.length; t++) {
    var tx2 = px + 16 + t * 48;
    if (tabs[t].on) rect(f, "etab-bg-" + t, tx2, py + 12, 40, 36, tk.primarySoft, 10);
    iconCentered(f, "etab-" + t, tabs[t].ic, tx2, py + 12, 40, 20,
      tabs[t].on ? tk.primaryDark : tk.faint);
  }

  // Ô tìm
  strokeRect(f, "emoji-search", px + 16, py + 60, pw - 32, 40, tk.surface, R.pill, tk.line);
  lucide(f, "emoji-search-ic", "search", px + 30, py + 70, 20, tk.faint);
  mkText(f, "emoji-search-ph", "Tìm cảm xúc", px + 56, py + 70, TY.bodySm, tk.faintInk, "Regular", 240, 18);

  // Nhóm "Gần đây"
  mkText(f, "emoji-group", "Gần đây", px + 16, py + 114, TY.caption, tk.muted, "Bold", 200, 18);

  var grid = [
    "😀", "😄", "😁", "😆", "😅", "😂", "🙂", "😉",
    "😊", "😍", "🥳", "😘", "😎", "🤔", "😴", "😢",
    "😭", "😡", "👍", "👎", "❤️", "🔥", "🎉", "✅",
    "👏", "🙏", "💯", "⭐", "💪", "🍀", "🚀", "🎂",
  ];
  var cols = 8;
  for (var e = 0; e < grid.length; e++) {
    var ex = px + 16 + (e % cols) * 46;
    var ey = py + 138 + Math.floor(e / cols) * 46;
    mkText(f, "emoji-" + e, grid[e], ex, ey, TY.title, tk.ink, "Regular", 40, 36, "CENTER");
  }

  return f;
}
// ═══════════════════════════════════════════════════════════════════════════
// S13 — TRẠNG THÁI TIN NHẮN
// ═══════════════════════════════════════════════════════════════════════════

function s13MessageStates(fx) {
  var tk = L;
  var f = frame("S13 — Trạng thái tin nhắn", fx, tk.canvas);

  mkText(f, "title", "Trạng thái gửi / nhận", 48, 40, TY.title, tk.ink, "Bold");

  var states = [
    { lb: "Đang gửi", ic: "clock", note: "Đồng hồ cạnh bubble, chưa có tick", col: "faint" },
    { lb: "Đã gửi", ic: "check", note: "Socket ack trả về, 1 tick xám", col: "faint" },
    { lb: "Đã nhận", ic: "check-check", note: "Đối phương online nhận, 2 tick xám", col: "faint" },
    { lb: "Đã đọc", ic: "check-check", note: "2 tick xanh primary", col: "primary" },
    { lb: "Gửi lỗi", ic: "circle-alert", note: "Viền đỏ + nút gửi lại", col: "danger" },
    { lb: "Đã thu hồi", ic: "undo", note: "Pill xám, chữ nghiêng", col: "muted" },
    { lb: "Đang chỉnh sửa", ic: "pencil", note: "Bubble nền primarySoft + nhãn", col: "primaryDark" },
    { lb: "Đã chỉnh sửa", ic: "pencil", note: "Nhãn captions nhỏ dưới bubble", col: "faint" },
  ];

  for (var i = 0; i < states.length; i++) {
    var col = i % 2;
    var row = Math.floor(i / 2);
    var x = 48 + col * 700;
    var y = 108 + row * 176;

    mkText(f, "st-lb-" + i, states[i].lb, x, y, TY.body, tk.ink, "Bold", 400, 20);
    mkText(f, "st-note-" + i, states[i].note, x, y + 24, TY.caption, tk.muted, "Regular", 620, 18);

    var bx = x;
    var by = y + 52;
    var bw = 320;

    if (i === 4) {
      // Lỗi gửi: icon cảnh báo và "Gửi lại" dóng cùng mép phải.
      var eg = bx + bw - 16;
      strokeRect(f, "st-bub-" + i, bx, by, bw, 58, tk.dangerSoft, 16, tk.danger);
      mkText(f, "st-txt-" + i, "Mình gửi lại sau nhé", bx + 18, by + 11, TY.label, tk.ink, "Regular", 222, 20);
      lucide(f, "st-err-ic-" + i, "circle-alert", eg - 16, by + 12, 16, tk.danger);
      mkText(f, "st-retry-" + i, "Gửi lại", eg - 44, by + 34, TY.micro, tk.dangerInk, "Bold", 44, 14, "RIGHT");
    } else if (i === 5) {
      rect(f, "st-bub-" + i, bx, by, bw, 40, tk.surface, 20);
      mkText(f, "st-txt-" + i, "Tin nhắn đã được thu hồi", bx + 18, by + 10, TY.caption, tk.muted, "Regular", 280, 18);
    } else if (i === 6) {
      strokeRect(f, "st-bub-" + i, bx, by, bw, 52, tk.primarySoft, 16, tk.primary);
      mkText(f, "st-txt-" + i, "Nội dung đang sửa", bx + 18, by + 14, TY.label, tk.ink, "Regular", 240, 20);
      rect(f, "st-caret-" + i, bx + 190, by + 12, 2, 26, tk.primary, 1);
      // Thanh hành động sửa
      var ab = rect(f, "st-editbar-" + i, bx, by + 60, bw, 36, tk.surface, 8);
      mkText(f, "st-editbar-t-" + i, "Esc huỷ · Enter lưu", bx + 12, by + 68, TY.tiny, tk.muted, "Regular", 200, 16);
      mkText(f, "st-editbar-save-" + i, "Lưu", bx + bw - 44, by + 68, TY.tiny, tk.primary, "Bold", 32, 16, "RIGHT");
    } else {
      // Bubble của mình, căn trái trong ô demo để dễ so
      rect(f, "st-bub-" + i, bx, by, bw, 52, tk.primary, 16);
      mkText(f, "st-txt-" + i, "Nội dung tin nhắn", bx + 18, by + 14, TY.label, tk.white, "Regular", 220, 20);
      var stCol = states[i].col === "primary" ? tk.white
        : states[i].col === "danger" ? tk.danger : tk.white;
      lucide(f, "st-ic-" + i, states[i].ic, bx + bw - 54, by + 18, 16, stCol);
      mkText(f, "st-time-" + i, "10:24", bx + bw - 90, by + 18, TY.micro, tk.white, "Regular", 34, 16, "RIGHT");
      if (i === 7) mkText(f, "st-edited-" + i, "đã chỉnh sửa", bx + bw - 70, by + 54, TY.micro, tk.faintInk, "Regular", 70, 14, "RIGHT");
    }
  }

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S14 — LIGHTBOX ẢNH
// ═══════════════════════════════════════════════════════════════════════════

function s14Lightbox(fx) {
  var tk = L;
  var f = frame("S14 — Xem ảnh", fx, tk.callBg);

  // Nền mờ
  rect(f, "scrim", 0, 0, PAGE_W, PAGE_H, tk.scrim, 0, 0.86);

  // Thanh trên
  rect(f, "lb-ava", 24, 24, 40, 40, tk.primarySoft, 20);
  mkText(f, "lb-name", "An Nguyễn", 76, 28, TY.label, tk.white, "Bold");
  mkText(f, "lb-time", "Hôm nay lúc 10:24", 76, 48, TY.caption, tk.callInkDim, "Regular");
  roundButton(f, "lb-download", "download", RIGHT - 96, 24, 40, tk.callChrome, tk.white);
  roundButton(f, "lb-close", "x", RIGHT - 48, 24, 40, tk.callChrome, tk.white);

  // Ảnh chính
  rect(f, "lb-img", 220, 96, 1000, 660, tk.callStage, 10);
  iconCentered(f, "lb-img-ic", "image", 220, 96, 480, 96, tk.callChrome);

  // Nút điều hướng
  roundButton(f, "lb-prev", "chevron-left", 156, 402, 48, tk.callChrome, tk.white);
  roundButton(f, "lb-next", "chevron-right", 1236, 402, 48, tk.callChrome, tk.white);

  // Dải thumbnail
  for (var t = 0; t < 7; t++) {
    var tx = MID - 7 * 56 / 2 - 4 + t * 60;
    var isCur = t === 3;
    rect(f, "lb-thumb-" + t, tx, 792, 52, 52, isCur ? tk.primary : tk.callChrome, 8,
      isCur ? 1 : 0.9);
    if (isCur) {
      iconCentered(f, "lb-thumb-ic-" + t, "image", tx, 792, 52, 20, tk.white);
    }
  }

  // Bộ đếm
  mkText(f, "lb-count", "4 / 7", MID - 40, 760, TY.caption, tk.callInkDim, "Regular", 80, 16, "CENTER");
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S15 — MODAL CHUYỂN TIẾP + XOÁ
// ═══════════════════════════════════════════════════════════════════════════

function s15Modals(fx) {
  var tk = L;
  var f = frame("S15 — Chuyển tiếp + Xoá", fx, tk.canvas);

  // ── Modal chuyển tiếp ─────────────────────────────────────────────────
  var m1x = 60, m1y = 60, m1w = 620, m1h = 780;
  var m1 = rect(f, "fwd-modal", m1x, m1y, m1w, m1h, tk.panel, 20);
  shadowL(m1, "xl");

  mkText(f, "fwd-title", "Chuyển tiếp đến", m1x + 28, m1y + 26, TY.heading, tk.ink, "Bold", 400, 24);
  lucide(f, "fwd-close", "x", m1x + m1w - 44, m1y + 28, 20, tk.muted);

  strokeRect(f, "fwd-search", m1x + 28, m1y + 68, m1w - 56, 42, tk.surface, R.pill, tk.line);
  lucide(f, "fwd-search-ic", "search", m1x + 44, m1y + 79, 20, tk.faint);
  mkText(f, "fwd-search-ph", "Tìm người hoặc nhóm", m1x + 72, m1y + 79, TY.bodySm, tk.faintInk, "Regular", 400, 18);

  var fwdConvs = [
    { n: "An Nguyễn", c: true },
    { n: "Koola Dev", c: true },
    { n: "Design Team", c: false },
    { n: "Mẹ", c: false },
    { n: "Bình Trần", c: true },
    { n: "Chị Lê", c: false },
  ];
  for (var i = 0; i < fwdConvs.length; i++) {
    var ry = m1y + 128 + i * 68;
    circle(f, "fwd-ava-" + i, m1x + 28, ry + 8, 44, tk.primarySoft);
    mkText(f, "fwd-nm-" + i, fwdConvs[i].n, m1x + 84, ry + 20, TY.label, tk.ink, "Regular", 300, 20);
    var cb = strokeRect(f, "fwd-cb-" + i, m1x + m1w - 60, ry + 18, 24, 24, fwdConvs[i].c ? tk.primary : tk.white, 7,
      fwdConvs[i].c ? tk.primary : tk.line);
    if (fwdConvs[i].c) iconCentered(f, "fwd-check-" + i, "check", m1x + m1w - 60, ry + 18, 24, 16, tk.white);
  }

  hline(f, "fwd-line", m1x + 28, m1y + m1h - 92, m1w - 56, tk.line);
  mkText(f, "fwd-count", "Đã chọn 3", m1x + 28, m1y + m1h - 68, TY.caption, tk.muted, "Regular", 200, 18);

  rect(f, "fwd-cancel", m1x + m1w - 260, m1y + m1h - 76, 100, 44, tk.surface, 10);
  mkText(f, "fwd-cancel-t", "Huỷ", m1x + m1w - 260, m1y + m1h - 64, TY.bodySm, tk.ink, "Bold", 100, 20, "CENTER");
  rect(f, "fwd-send", m1x + m1w - 148, m1y + m1h - 76, 120, 44, tk.primary, 10);
  lucide(f, "fwd-send-ic", "send", m1x + m1w - 134, m1y + m1h - 64, 20, tk.white);
  mkText(f, "fwd-send-t", "Gửi", m1x + m1w - 112, m1y + m1h - 64, TY.bodySm, tk.white, "Bold", 76, 20);

  // ── Modal xoá ─────────────────────────────────────────────────────────
  // 2 modal đặt cạnh nhau như bản so sánh — bỏ scrim để không đè lên modal trái.
  var m2x = 760, m2y = 200, m2w = 460, m2h = 320;
  var m2 = rect(f, "del-modal", m2x, m2y, m2w, m2h, tk.panel, 20);
  shadowL(m2, "xl");

  circle(f, "del-ic-bg", m2x + m2w / 2 - 26, m2y + 30, 52, tk.dangerSoft);
  iconCentered(f, "del-ic", "trash-2", m2x + m2w / 2 - 26, m2y + 30, 52, 24, tk.danger);

  mkText(f, "del-title", "Xoá tin nhắn?", m2x + 24, m2y + 100, TY.heading, tk.ink, "Bold", m2w - 48, 24, "CENTER");
  mkText(f, "del-sub", "Bạn có thể xoá ở phía mình hoặc xoá cho mọi người.",
    m2x + 40, m2y + 132, TY.bodySm, tk.muted, "Regular", m2w - 80, 20, "CENTER");

  rect(f, "del-me", m2x + 24, m2y + 180, m2w - 48, 48, tk.surface, 10);
  mkText(f, "del-me-t", "Xoá ở phía tôi", m2x + 24, m2y + 194, TY.bodySm, tk.ink, "Bold", m2w - 48, 20, "CENTER");

  rect(f, "del-all", m2x + 24, m2y + 240, m2w - 48, 48, tk.danger, 10);
  mkText(f, "del-all-t", "Xoá cho mọi người", m2x + 24, m2y + 254, TY.bodySm, tk.white, "Bold", m2w - 48, 20, "CENTER");

  caption(f, "Modal chuyển tiếp (trái) và modal xoá (phải) — hai màn riêng, không chồng nhau.", 60, 860, 1200, tk);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S16 — TÌM KIẾM TRONG HỘI THOẠI
// ═══════════════════════════════════════════════════════════════════════════

function s16SearchInChat(fx) {
  var tk = L;
  var f = frame("S16 — Tìm trong hội thoại", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var PANEL_W = 380;
  var CHAT_W = PAGE_W - LIST_END - PANEL_W;

  // Cửa sổ chat thu hẹp
  rect(f, "header", A, 0, CHAT_W, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, CHAT_W, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  mkText(f, "header-name", "An Nguyễn", A + 80, 20, TY.body, tk.ink, "Bold");
  mkText(f, "header-status", "Đang hoạt động", A + 80, 42, TY.caption, tk.accentInk, "Regular");

  // Tin nhắn có highlight từ khoá
  var cw = CHAT_W - 90;
  var msgs = [
    { own: false, y: 120, t: "File thiết kế mình gửi rồi nhé" },
    { own: false, y: 176, t: "Cậu xem file giúp mình với" },
    { own: true, y: 232, t: "File hơi nặng, mình nén lại" },
    { own: false, y: 288, t: "Ok, thấy file rồi" },
  ];
  for (var m = 0; m < msgs.length; m++) {
    var mw = 320;
    // Căn phải theo mép khung chat (A + CHAT_W), không dùng số cứng.
    var mx = msgs[m].own ? A + CHAT_W - 24 - mw : A + 66;
    if (msgs[m].own) {
      rect(f, "s-bub-" + m, mx, msgs[m].y, mw, 48, tk.primary, 16);
    } else {
      strokeRect(f, "s-bub-" + m, mx, msgs[m].y, mw, 48, tk.bubbleOther, 16, tk.bubbleBorder);
    }
    mkText(f, "s-msg-" + m, msgs[m].t, mx + 18, msgs[m].y + 14, 14,
      msgs[m].own ? tk.white : tk.ink, "Regular", mw - 36, 20);
    // Highlight "file"
    if (m < 3) rect(f, "hl-" + m, mx + 18, msgs[m].y + 12, 30, 24,
      msgs[m].own ? tk.primaryDark : tk.warnSoft, 4, msgs[m].own ? 1 : 0.9);
  }

  composerBar(f, tk, A, CHAT_W, {});

  // ── Panel tìm kiếm bên phải ───────────────────────────────────────────
  var px = PAGE_W - PANEL_W;
  rect(f, "search-panel", px, 0, PANEL_W, PAGE_H, tk.panel, 0);
  vline(f, "search-panel-edge", px, 0, PAGE_H, tk.line);

  mkText(f, "sp-title", "Tìm trong hội thoại", px + 24, 28, TY.heading, tk.ink, "Bold", 260, 24);
  lucide(f, "sp-close", "x", px + PANEL_W - 44, 30, 20, tk.muted);

  strokeRect(f, "sp-input", px + 24, 68, PANEL_W - 48, 44, tk.surface, R.pill, tk.line);
  lucide(f, "sp-input-ic", "search", px + 40, 80, 20, tk.faint);
  mkText(f, "sp-input-t", "file", px + 66, 80, TY.label, tk.ink, "Regular", 200, 20);

  mkText(f, "sp-count", "4 kết quả", px + 24, 128, TY.caption, tk.muted, "Regular", 200, 18);

  var results = [
    { who: "An Nguyễn", when: "Hôm nay 10:22", t: "File thiết kế mình gửi rồi nhé", cur: false },
    { who: "An Nguyễn", when: "Hôm nay 10:22", t: "Cậu xem file giúp mình với", cur: true },
    { who: "Bạn", when: "Hôm nay 10:24", t: "File hơi nặng, mình nén lại", cur: false },
    { who: "An Nguyễn", when: "Hôm nay 10:26", t: "Ok, thấy file rồi", cur: false },
  ];
  for (var r = 0; r < results.length; r++) {
    var ry = 156 + r * 96;
    if (results[r].cur) rect(f, "sp-cur-" + r, px + 16, ry - 6, PANEL_W - 32, 84, tk.primarySoft, 10, 0.7);
    mkText(f, "sp-who-" + r, results[r].who, px + 24, ry + 2, TY.bodySm, tk.ink, "Bold", 180, 18);
    mkText(f, "sp-when-" + r, results[r].when, px + 24, ry + 22, TY.tiny, tk.faintInk, "Regular", 200, 16);
    mkText(f, "sp-txt-" + r, results[r].t, px + 24, ry + 42, TY.caption, tk.muted, "Regular", PANEL_W - 56, 18);
  }

  // Điều hướng kết quả
  hline(f, "sp-line", px, PAGE_H - 72, PANEL_W, tk.line);
  mkText(f, "sp-nav", "2 / 4", px + 24, PAGE_H - 50, TY.caption, tk.muted, "Bold", 100, 18);
  iconButton(f, "sp-prev", "chevron-up", px + PANEL_W - 108, PAGE_H - 54, 36, tk.surface, tk.ink);
  iconButton(f, "sp-next", "chevron-down", px + PANEL_W - 64, PAGE_H - 54, 36, tk.surface, tk.ink);

  return f;
}
// ═══════════════════════════════════════════════════════════════════════════
// S17 — INFO PANEL (thông tin hội thoại)
// ═══════════════════════════════════════════════════════════════════════════

function s17InfoPanel(fx) {
  var tk = L;
  var f = frame("S17 — Thông tin hội thoại", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var PANEL_W = 360;
  var CHAT_W = PAGE_W - LIST_END - PANEL_W;

  rect(f, "header", A, 0, CHAT_W, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, CHAT_W, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  mkText(f, "header-name", "An Nguyễn", A + 80, 20, TY.body, tk.ink, "Bold");
  mkText(f, "header-status", "Đang hoạt động", A + 80, 42, TY.caption, tk.accentInk, "Regular");

  strokeRect(f, "bub-1", A + 66, 122, 300, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-1", "Chào cậu, mình gửi file nhé", A + 84, 134, TY.label, tk.ink, "Regular", 264, 20);
  rect(f, "bub-2", A + CHAT_W - 24 - 300, 178, 300, 44, tk.primary, 16);
  mkText(f, "msg-2", "Ok mình xem luôn đây", A + CHAT_W - 24 - 282, 190, TY.label, tk.white, "Regular", 254, 20);

  composerBar(f, tk, A, CHAT_W, {});

  // ── Panel thông tin ───────────────────────────────────────────────────
  var px = PAGE_W - PANEL_W;
  rect(f, "info-panel", px, 0, PANEL_W, PAGE_H, tk.panel, 0);
  vline(f, "info-edge", px, 0, PAGE_H, tk.line);

  mkText(f, "ip-title", "Thông tin hội thoại", px + 24, 28, TY.heading, tk.ink, "Bold", 260, 22);
  lucide(f, "ip-close", "x", px + PANEL_W - 44, 30, 20, tk.muted);

  circle(f, "ip-ava", px + PANEL_W / 2 - 48, 76, 96, tk.primarySoft);
  iconCentered(f, "ip-ava-ic", "message-circle", px + PANEL_W / 2 - 48, 76, 96, 40, tk.primary);
  mkText(f, "ip-name", "An Nguyễn", px + 24, 188, TY.heading, tk.ink, "Bold", PANEL_W - 48, 24, "CENTER");
  mkText(f, "ip-mail", "an.nguyen@koola.chat", px + 24, 216, TY.caption, tk.muted, "Regular", PANEL_W - 48, 18, "CENTER");

  var actions = ["phone", "video", "bell-off", "pin"];
  var labels = ["Gọi", "Video", "Tắt TB", "Ghim"];
  for (var a = 0; a < actions.length; a++) {
    var ax = px + 24 + a * 82;
    iconButton(f, "ip-act-" + a, actions[a], ax, 254, 56, tk.surface, tk.ink);
    mkText(f, "ip-act-t-" + a, labels[a], ax - 10, 320, TY.tiny, tk.muted, "Regular", 76, 16, "CENTER");
  }

  hline(f, "ip-line-1", px + 24, 356, PANEL_W - 48, tk.line);

  // Tabs media
  mkText(f, "ip-media-h", "Ảnh & file", px + 24, 376, TY.bodySm, tk.ink, "Bold", 200, 18);
  mkText(f, "ip-media-all", "Xem tất cả", px + PANEL_W - 110, 376, TY.caption, tk.primary, "Bold", 86, 18, "RIGHT");

  for (var g = 0; g < 6; g++) {
    var gx = px + 24 + (g % 3) * 104;
    var gy = 408 + Math.floor(g / 3) * 104;
    rect(f, "ip-thumb-" + g, gx, gy, 96, 96, tk.iconWell, 10);
    iconCentered(f, "ip-thumb-ic-" + g, "image", gx, gy, 96, 24, tk.muted);
  }

  hline(f, "ip-line-2", px + 24, 632, PANEL_W - 48, tk.line);

  mkText(f, "ip-sec-file", "File", px + 24, 652, TY.bodySm, tk.ink, "Bold", 200, 18);
  var files = [
    { n: "koola-design-v2.fig", s: "24,8 MB" },
    { n: "brief.pdf", s: "1,2 MB" },
  ];
  for (var fi = 0; fi < files.length; fi++) {
    var fy = 680 + fi * 52;
    iconButton(f, "ip-file-ic-" + fi, "file-text", px + 24, fy, 40, tk.iconWell, tk.primaryDark);
    mkText(f, "ip-file-n-" + fi, files[fi].n, px + 76, fy + 2, TY.caption, tk.ink, "Bold", 200, 16);
    mkText(f, "ip-file-s-" + fi, files[fi].s, px + 76, fy + 20, TY.tiny, tk.muted, "Regular", 100, 14);
    lucide(f, "ip-file-dl-" + fi, "download", px + PANEL_W - 44, fy + 10, 20, tk.faint);
  }

  hline(f, "ip-line-3", px + 24, 790, PANEL_W - 48, tk.line);

  mkText(f, "ip-danger", "Chặn người dùng", px + 24, 812, TY.bodySm, tk.dangerInk, "Bold", 300, 18);
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S18 — TẠO NHÓM
// ═══════════════════════════════════════════════════════════════════════════

function s18CreateGroup(fx) {
  var tk = L;
  var f = frame("S18 — Tạo nhóm", fx, tk.canvas);

  var mx = 420, my = 70, mw = 600, mh = 760;
  var modal = rect(f, "group-modal", mx, my, mw, mh, tk.panel, 20);
  shadowL(modal, "xl");

  mkText(f, "gm-title", "Tạo nhóm mới", mx + 28, my + 26, TY.heading, tk.ink, "Bold", 300, 24);
  lucide(f, "gm-close", "x", mx + mw - 44, my + 28, 20, tk.muted);

  // Ảnh nhóm + tên
  circle(f, "gm-ava", mx + 28, my + 70, 64, tk.primarySoft);
  iconCentered(f, "gm-ava-ic", "users", mx + 28, my + 70, 64, 28, tk.primary);
  circle(f, "gm-ava-plus", mx + 74, my + 118, 24, tk.primary);
  iconCentered(f, "gm-ava-plus-ic", "plus", mx + 74, my + 118, 24, 16, tk.white);

  mkText(f, "gm-name-lb", "Tên nhóm", mx + 112, my + 76, TY.tiny, tk.muted, "Bold", 400, 16);
  mkText(f, "gm-name", "Koola Design", mx + 112, my + 96, TY.body, tk.ink, "Bold", 420, 24);
  hline(f, "gm-name-line", mx + 112, my + 126, 440, tk.line);

  hline(f, "gm-line-1", mx + 28, my + 160, mw - 56, tk.line);

  // Tìm thành viên
  strokeRect(f, "gm-search", mx + 28, my + 180, mw - 56, 44, tk.surface, R.pill, tk.line);
  lucide(f, "gm-search-ic", "search", mx + 44, my + 192, 20, tk.faint);
  mkText(f, "gm-search-ph", "Tìm người để thêm", mx + 72, my + 192, TY.bodySm, tk.faintInk, "Regular", 400, 18);

  // Chip đã chọn
  var chosen = ["An Nguyễn", "Bình Trần"];
  var chipX = mx + 28;
  for (var c = 0; c < chosen.length; c++) {
    var cw = chosen[c].length * 7 + 46;
    rect(f, "gm-chip-" + c, chipX, my + 236, cw, 32, tk.primarySoft, R.pill);
    circle(f, "gm-chip-ava-" + c, chipX + 6, my + 242, 20, tk.primary);
    mkText(f, "gm-chip-t-" + c, chosen[c], chipX + 32, my + 244, TY.caption, tk.primaryDark, "Bold", cw - 40, 16);
    chipX += cw + 8;
  }

  // Danh sách người
  for (var i = 0; i < 6; i++) {
    var ry = my + 288 + i * 60;
    var on = i < 2;
    circle(f, "gm-ava-" + i, mx + 28, ry + 8, 44, tk.primarySoft);
    mkText(f, "gm-nm-" + i, FRIENDS[i % FRIENDS.length].name, mx + 84, ry + 20, TY.label, tk.ink, "Regular", 300, 20);
    var cb = strokeRect(f, "gm-cb-" + i, mx + mw - 56, ry + 18, 24, 24,
      on ? tk.primary : tk.white, 7, on ? tk.primary : tk.line);
    if (on) iconCentered(f, "gm-ck-" + i, "check", mx + mw - 56, ry + 18, 24, 16, tk.white);
  }

  hline(f, "gm-line-2", mx + 28, my + mh - 88, mw - 56, tk.line);
  mkText(f, "gm-count", "2 thành viên", mx + 28, my + mh - 64, TY.caption, tk.muted, "Regular", 200, 18);
  rect(f, "gm-create", mx + mw - 168, my + mh - 70, 140, 46, tk.primary, 10);
  mkText(f, "gm-create-t", "Tạo nhóm", mx + mw - 168, my + mh - 57, TY.bodySm, tk.white, "Bold", 140, 20, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S19 — CUỘC GỌI ĐẾN
// ═══════════════════════════════════════════════════════════════════════════

function s19IncomingCall(fx) {
  var tk = L;
  var f = frame("S19 — Gọi đến", fx, tk.canvas);

  // Nền app mờ
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);
  var scrim = rect(f, "scrim", RAIL_W, 0, PAGE_W - RAIL_W, PAGE_H, tk.ink, 0, 0.5);
  rect(f, "blur-veil", RAIL_W, 0, PAGE_W - RAIL_W, PAGE_H, tk.ink, 0, 0.18);

  // Card gọi đến — căn giữa vùng phải
  var cw = 380, ch = 460;
  var cx = MID - cw / 2;
  var cy = (PAGE_H - ch) / 2;

  var card = rect(f, "call-card", cx, cy, cw, ch, tk.panel, 24);
  shadowL(card, "xl");

  mkText(f, "call-kind", "Cuộc gọi video đến", cx, cy + 28, TY.caption, tk.muted, "Bold", cw, 16, "CENTER");

  // Avatar lớn + vòng pulse
  circle(f, "call-pulse", cx + cw / 2 - 72, cy + 96, 144, tk.primarySoft, 0.3);
  circle(f, "call-ava-bg", cx + cw / 2 - 56, cy + 112, 112, tk.primarySoft);
  iconCentered(f, "call-ava-ic", "users", cx + cw / 2 - 56, cy + 112, 112, 44, tk.primary);

  mkText(f, "call-name", "An Nguyễn", cx, cy + 248, TY.title, tk.ink, "Bold", cw, 30, "CENTER");
  mkText(f, "call-sub", "Koola · đang đổ chuông…", cx, cy + 282, TY.bodySm, tk.muted, "Regular", cw, 20, "CENTER");

  // 2 nút lớn
  var by = cy + 340;
  roundButton(f, "call-decline", "phone-off", cx + 64, by, 72, tk.danger, tk.white);
  mkText(f, "call-decline-t", "Từ chối", cx + 64 - 12, by + 80, TY.caption, tk.muted, "Regular", 96, 16, "CENTER");

  roundButton(f, "call-accept", "phone", cx + cw - 136, by, 72, tk.accent, tk.white);
  mkText(f, "call-accept-t", "Nghe", cx + cw - 136 - 12, by + 80, TY.caption, tk.muted, "Regular", 96, 16, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S20 — ĐANG GỌI ĐI
// ═══════════════════════════════════════════════════════════════════════════

function s20OutgoingCall(fx) {
  var tk = L;
  var f = frame("S20 — Đang gọi", fx, tk.canvas);

  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);
  rect(f, "scrim", RAIL_W, 0, PAGE_W - RAIL_W, PAGE_H, tk.ink, 0, 0.5);

  var cw = 380, ch = 460;
  var cx = MID - cw / 2;
  var cy = (PAGE_H - ch) / 2;

  var card = rect(f, "call-card", cx, cy, cw, ch, tk.panel, 24);
  shadowL(card, "xl");

  mkText(f, "call-kind", "Đang gọi thoại", cx, cy + 28, TY.caption, tk.muted, "Bold", cw, 16, "CENTER");

  circle(f, "call-pulse-1", cx + cw / 2 - 84, cy + 84, 168, tk.primarySoft, 0.22);
  circle(f, "call-pulse-2", cx + cw / 2 - 68, cy + 100, 136, tk.primarySoft, 0.4);
  circle(f, "call-ava-bg", cx + cw / 2 - 56, cy + 112, 112, tk.primarySoft);
  iconCentered(f, "call-ava-ic", "message-circle", cx + cw / 2 - 56, cy + 112, 112, 44, tk.primary);

  mkText(f, "call-name", "An Nguyễn", cx, cy + 248, TY.title, tk.ink, "Bold", cw, 30, "CENTER");
  mkText(f, "call-sub", "Đang đổ chuông… 0:08", cx, cy + 282, TY.bodySm, tk.muted, "Regular", cw, 20, "CENTER");

  roundButton(f, "call-hangup", "phone-off", cx + cw / 2 - 36, cy + 340, 72, tk.danger, tk.white);
  mkText(f, "call-hangup-t", "Huỷ", cx + cw / 2 - 36 - 12, cy + 420, TY.caption, tk.muted, "Regular", 96, 16, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S21 — ĐANG GỌI THOẠI
// ═══════════════════════════════════════════════════════════════════════════

function s21ActiveVoiceCall(fx) {
  var tk = L;
  var f = frame("S21 — Đang gọi thoại", fx, tk.callBg);

  // Nền gradient tối
  rect(f, "bg-deep", 0, 0, PAGE_W, PAGE_H, tk.callBg, 0);
  circle(f, "bg-glow-1", 200, -200, 800, tk.callGlowA, 0.55);
  circle(f, "bg-glow-2", 900, 500, 700, tk.callGlowB, 0.35);

  mkText(f, "vc-kind", "Cuộc gọi thoại", PAGE_W / 2 - 200, 64, TY.bodySm, tk.callInkDim, "Bold", 400, 18, "CENTER");

  circle(f, "vc-pulse-1", PAGE_W / 2 - 136, 156, 272, tk.callGlowA, 0.5);
  circle(f, "vc-pulse-2", PAGE_W / 2 - 112, 180, 224, tk.callStage, 0.8);
  circle(f, "vc-ava", PAGE_W / 2 - 88, 204, 176, tk.callChrome);
  iconCentered(f, "vc-ava-ic", "users", PAGE_W / 2 - 88, 204, 176, 64, tk.callInkDim);

  mkText(f, "vc-name", "An Nguyễn", PAGE_W / 2 - 300, 404, TY.display, tk.callInk, "Bold", 600, 40, "CENTER");
  mkText(f, "vc-timer", "02:47", PAGE_W / 2 - 200, 448, TY.body, tk.callInkDim, "Regular", 400, 22, "CENTER");

  // Chỉ báo chất lượng kết nối
  rect(f, "vc-quality", PAGE_W / 2 - 68, 486, 136, 30, tk.callStage, 16);
  circle(f, "vc-q-dot", PAGE_W / 2 - 54, 496, 10, tk.online);
  mkText(f, "vc-q-t", "Kết nối tốt", PAGE_W / 2 - 38, 492, TY.caption, tk.callInkDim, "Regular", 100, 18);

  // Hàng nút điều khiển
  var controls = [
    { ic: "mic", lb: "Tắt mic", off: false },
    { ic: "video", lb: "Bật video", off: false },
    { ic: "volume-2", lb: "Loa ngoài", off: false },
    { ic: "screen-share", lb: "Chia sẻ", off: false },
    { ic: "ellipsis", lb: "Thêm", off: false },
  ];
  var totalW = controls.length * 108;
  var startX = PAGE_W / 2 - totalW / 2 + 18;
  for (var c = 0; c < controls.length; c++) {
    var bx = startX + c * 108;
    roundButton(f, "vc-btn-" + c, controls[c].ic, bx, 620, 64, tk.callChrome, tk.callInk);
    mkText(f, "vc-btn-t-" + c, controls[c].lb, bx - 22, 692, TY.tiny, tk.callInkDim, "Regular", 108, 16, "CENTER");
  }

  // Nút kết thúc
  roundButton(f, "vc-end", "phone-off", PAGE_W / 2 - 40, 760, 80, tk.danger, tk.white);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S22 — VIDEO CALL
// ═══════════════════════════════════════════════════════════════════════════

function s22VideoCall(fx) {
  var tk = D;
  var f = frame("S22 — Video call", fx, tk.callBg);

  rect(f, "bg", 0, 0, PAGE_W, PAGE_H, tk.callBg, 0);

  // Video chính (full)
  rect(f, "remote-video", 0, 0, PAGE_W, PAGE_H, tk.callStage, 0);
  circle(f, "remote-glow", 500, 150, 500, tk.callChrome, 0.55);
  // Giả lập khuôn mặt placeholder
  circle(f, "remote-face", PAGE_W / 2 - 120, 180, 240, tk.callFace);
  iconCentered(f, "remote-face-ic", "users", PAGE_W / 2 - 120, 180, 240, 90, tk.callInkDim);

  // Self-view PiP góc phải trên
  var pw = 260, ph2 = 172;
  var pp = strokeRect(f, "self-pip", RIGHT - pw - 24, 88, pw, ph2, tk.callStage, 14, tk.line);
  shadowL(pp, "lg");
  iconCentered(f, "self-pip-ic", "users", RIGHT - pw - 24, 88, Math.min(pw, ph2), 40, tk.callInkDim);
  mkText(f, "self-lb", "Bạn", RIGHT - pw - 8, 236, TY.tiny, tk.callInkDim, "Bold", 80, 16, "RIGHT");

  // Header trên: tên + đồng hồ
  rect(f, "top-bar", 0, 0, PAGE_W, 72, tk.callBg, 0, 0.55);
  circle(f, "tc-dot", 28, 32, 10, tk.online);
  mkText(f, "tc-name", "An Nguyễn", 48, 22, TY.body, tk.callInk, "Bold");
  mkText(f, "tc-time", "02:47", 48, 42, TY.caption, tk.callInkDim, "Regular");

  // Nút thu nhỏ / toàn màn hình
  roundButton(f, "tc-min", "minimize", RIGHT - 120, 16, 40, tk.callChrome, tk.callInk);
  roundButton(f, "tc-max", "maximize", RIGHT - 68, 16, 40, tk.callChrome, tk.callInk);

  // Thanh điều khiển dưới
  var barW = 620;
  var barX = PAGE_W / 2 - barW / 2;
  rect(f, "controls-bar", barX, 780, barW, 88, tk.callStage, 44, 0.94);

  var ctrls = ["mic", "video-off", "screen-share", "ellipsis"];
  for (var c = 0; c < ctrls.length; c++) {
    roundButton(f, "vc-" + c, ctrls[c], barX + 24 + c * 76, 798, 56, tk.callChrome, tk.callInk);
  }
  roundButton(f, "vc-end", "phone-off", barX + barW - 80, 798, 56, tk.danger, tk.white);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S23 — GROUP VIDEO
// ═══════════════════════════════════════════════════════════════════════════

function s23GroupVideo(fx) {
  var tk = D;
  var f = frame("S23 — Group video", fx, tk.callBg);

  rect(f, "bg", 0, 0, PAGE_W, PAGE_H, tk.callBg, 0);

  var gx = 32, gy = 88, gap = 12;
  var tw = (PAGE_W - gx * 2 - gap) / 2;
  var th = (PAGE_H - gy - 140 - gap) / 2;

  var tiles = [
    { name: "An Nguyễn", speaking: true, muted: false },
    { name: "Bình Trần", speaking: false, muted: true },
    { name: "Chị Lê", speaking: false, muted: false },
    { name: "Bạn", speaking: false, muted: false, self: true },
  ];

  for (var t = 0; t < tiles.length; t++) {
    var tx = gx + (t % 2) * (tw + gap);
    var ty = gy + Math.floor(t / 2) * (th + gap);
    var tile = rect(f, "tile-" + t, tx, ty, tw, th, tk.callStage, 14);
    if (tiles[t].speaking) {
      tile.strokes = [{ type: "SOLID", color: hx6(tk.online) }];
      tile.strokeWeight = 2;
      tile.strokeAlign = "INSIDE";
    }

    circle(f, "tile-ava-" + t, tx + tw / 2 - 48, ty + th / 2 - 60, 96, tk.callChrome);
    iconCentered(f, "tile-ava-ic-" + t, "users", tx + tw / 2 - 48, ty + th / 2 - 60, 96, 40, tk.callInkDim);

    // Nhãn tên
    rect(f, "tile-lb-bg-" + t, tx + 12, ty + th - 40, 170, 28, tk.callBg, 14, 0.7);
    if (tiles[t].muted) lucide(f, "tile-mute-" + t, "mic-off", tx + 20, ty + th - 32, 16, tk.danger);
    mkText(f, "tile-nm-" + t, tiles[t].name, tx + (tiles[t].muted ? 42 : 24), ty + th - 32, TY.caption, tk.callInk, "Bold", 130, 16);

    if (tiles[t].self) {
      rect(f, "self-tag", tx + tw - 62, ty + th - 40, 50, 24, tk.callChrome, 10, 0.85);
      mkText(f, "self-tag-t", "Bạn", tx + tw - 62, ty + th - 38, TY.micro, tk.callInkDim, "Bold", 50, 16, "CENTER");
    }
  }

  // Top bar
  rect(f, "top-bar", 0, 0, PAGE_W, 72, tk.callBg, 0, 0.6);
  mkText(f, "grp-name", "Koola Design", 32, 20, TY.body, tk.callInk, "Bold");
  mkText(f, "grp-count", "4 người · 02:47", 32, 42, TY.caption, tk.callInkDim, "Regular");

  roundButton(f, "grp-participants", "users", RIGHT - 120, 16, 40, tk.callChrome, tk.callInk);
  roundButton(f, "grp-min", "minimize", RIGHT - 68, 16, 40, tk.callChrome, tk.callInk);

  // Controls
  var barW = 620;
  var barX = PAGE_W / 2 - barW / 2;
  rect(f, "controls-bar", barX, 780, barW, 88, tk.callStage, 44, 0.94);
  var ctrls = ["mic", "video-off", "screen-share", "grid", "ellipsis"];
  for (var c = 0; c < ctrls.length; c++) {
    roundButton(f, "vc-" + c, ctrls[c], barX + 24 + c * 70, 798, 56, tk.callChrome, tk.callInk);
  }
  roundButton(f, "vc-end", "phone-off", barX + barW - 80, 798, 56, tk.danger, tk.white);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S24 — CUỘC GỌI THU NHỎ + NHẬT KÝ GỌI
// ═══════════════════════════════════════════════════════════════════════════

function s24CallMinimized(fx) {
  var tk = L;
  var f = frame("S24 — Gọi thu nhỏ + nhật ký", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 120 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  rect(f, "header", A, 0, AW, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, AW, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  mkText(f, "header-name", "An Nguyễn", A + 80, 20, TY.body, tk.ink, "Bold");
  mkText(f, "header-status", "Đang hoạt động", A + 80, 42, TY.caption, tk.accentInk, "Regular");

  // ── Nhật ký gọi trong hội thoại ───────────────────────────────────────
  var logs = [
    { dir: "phone-outgoing", t: "Cuộc gọi đi · 02:47", when: "Hôm nay 09:12", miss: false },
    { dir: "phone-incoming", t: "Cuộc gọi đến · 0:34", when: "Hôm nay 08:04", miss: false },
    { dir: "phone", t: "Cuộc gọi nhỡ", when: "Hôm qua 21:30", miss: true },
    { dir: "video", t: "Gọi video · 12:08", when: "Hôm qua 19:02", miss: false },
  ];

  for (var l = 0; l < logs.length; l++) {
    var ly = 120 + l * 84;
    var isOwn = l % 2 === 0;
    var lw = 320;
    var lx = isOwn ? RIGHT - lw : A + 66;
    strokeRect(f, "log-box-" + l, lx, ly, lw, 60, tk.bubbleOther, 16, tk.bubbleBorder);
    lucide(f, "log-ic-" + l, logs[l].dir, lx + 18, ly + 20, 20,
      logs[l].miss ? tk.danger : tk.primary);
    mkText(f, "log-t-" + l, logs[l].t, lx + 48, ly + 12, 13,
      logs[l].miss ? tk.danger : tk.ink, "Bold", lw - 66, 18);
    mkText(f, "log-w-" + l, logs[l].when, lx + 48, ly + 32, TY.tiny, tk.faintInk, "Regular", lw - 66, 16);
  }

  // Tin nhắn bình thường xen kẽ
  strokeRect(f, "bub-x1", A + 66, 456, 280, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-x1", "Lúc nãy nghe rõ không?", A + 84, 468, TY.label, tk.ink, "Regular", 244, 20);
  rect(f, "bub-x2", RIGHT - 262, 512, 262, 44, tk.primary, 16);
  mkText(f, "msg-x2", "Rõ lắm, ok nhé", RIGHT - 244, 524, TY.label, tk.white, "Regular", 200, 20);

  composerBar(f, tk, A, AW, {});

  // Widget gọi thu nhỏ — góc phải trên composer để không đè nhật ký gọi.
  var wx = RIGHT - 320;
  var wy = 690;
  var ww = 296;
  var wh = 96;

  var widget = rect(f, "call-widget", wx, wy, ww, wh, tk.rail, 16);
  shadowL(widget, "lg");
  circle(f, "cw-ava", wx + 16, wy + 22, 52, tk.primaryDark);
  iconCentered(f, "cw-ava-ic", "users", wx + 16, wy + 22, 52, 24, tk.white);
  circle(f, "cw-dot", wx + 58, wy + 60, 12, tk.accent);

  mkText(f, "cw-name", "An Nguyễn", wx + 80, wy + 22, TY.bodySm, tk.white, "Bold", 130, 18);
  mkText(f, "cw-timer", "02:47 · video", wx + 80, wy + 42, TY.tiny, tk.callInkDim, "Regular", 130, 16);

  roundButton(f, "cw-mute", "mic-off", wx + ww - 116, wy + 32, 36, tk.callChrome, tk.white);
  roundButton(f, "cw-expand", "maximize", wx + ww - 74, wy + 32, 36, tk.callChrome, tk.white);
  roundButton(f, "cw-end", "phone-off", wx + ww - 32, wy + 32, 36, tk.danger, tk.white);

  // Thanh sóng âm mô phỏng
  for (var w = 0; w < 14; w++) {
    var hh = 4 + (w * 7) % 16;
    rect(f, "cw-wave-" + w, wx + 80 + w * 5, wy + 68 - hh / 2, 3, hh, tk.accent, 2, 0.8);
  }

  return f;
}
// ═══════════════════════════════════════════════════════════════════════════
// S25 — DANH BẠ + HỒ SƠ
// ═══════════════════════════════════════════════════════════════════════════

function s25Contacts(fx) {
  var tk = L;
  var f = frame("S25 — Danh bạ + Hồ sơ", fx, tk.canvas);

  rail(f, 1, tk);
  listPanel(f, tk);
  listHeader(f, "Danh bạ", tk);
  searchBar(f, 88, 288, tk, "Tìm bạn bè");

  chip(f, "tab-0", "Bạn bè · 24", 96, 148, 108, true, tk);
  chip(f, "tab-1", "Nhóm · 5", 212, 148, 92, false, tk);
  chip(f, "tab-2", "Lời mời · 3", 312, 148, 100, false, tk);

  for (var i = 0; i < FRIENDS.length; i++) {
    var y = 204 + i * 76;
    var d = FRIENDS[i];
    rect(f, "f-ava-" + d.id, 96, y + 14, 48, 48, tk.primarySoft, 24);
    if (d.on) circle(f, "f-dot-" + d.id, 130, y + 50, 12, tk.online);
    mkText(f, "f-name-" + d.id, d.name, 156, y + 14, TY.body, tk.ink, "Bold", 180, 20);
    mkText(f, "f-sub-" + d.id, d.sub, 156, y + 38, 13,
      d.on ? tk.accent : tk.muted, "Regular", 180, 18);
    iconButton(f, "f-act-" + d.id, "message-circle", 348, y + 18, 40, tk.primarySoft, tk.primaryDark);
  }

  // ── Cặp thẻ căn giữa vùng phải (452..1416): hồ sơ 460 + 24 + lời mời 316 ──
  var PAIR_W = 460 + 24 + 316;
  var PX = LIST_END + (PAGE_W - LIST_END - PAIR_W) / 2;
  var C = PX + 230;
  var card = rect(f, "profile-card", PX, 140, 460, 600, tk.panel, 24);
  shadowL(card, "xl");

  circle(f, "profile-ava", C - 84, 188, 168, tk.primarySoft);
  iconCentered(f, "profile-mark", "message-circle", C - 84, 188, 168, 64, tk.primary);

  mkText(f, "profile-name", "An Nguyễn", PX, 380, TY.title, tk.ink, "Bold", 460, 30, "CENTER");
  mkText(f, "profile-mail", "an.nguyen@koola.chat", PX, 414, TY.label, tk.muted, "Regular", 460, 20, "CENTER");

  rect(f, "profile-pill", C - 44, 448, 88, 26, tk.primarySoft, 14);
  mkText(f, "profile-pill-t", "Online", C - 44, 453, TY.tiny, tk.primaryDark, "Bold", 88, 16, "CENTER");

  hline(f, "profile-line", C - 170, 502, 340, tk.line);

  var acts = [
    { ic: "phone", lb: "Gọi" },
    { ic: "message-circle", lb: "Nhắn tin" },
    { ic: "user-plus", lb: "Kết bạn" },
  ];
  for (var a = 0; a < acts.length; a++) {
    var cx = C + (a - 1) * 112;
    iconButton(f, "act-" + a, acts[a].ic, cx - 28, 534, 56, tk.surface, tk.ink);
    mkText(f, "act-t-" + a, acts[a].lb, cx - 50, 600, TY.caption, tk.muted, "Regular", 100, 16, "CENTER");
  }

  hline(f, "profile-line-2", C - 170, 646, 340, tk.line);

  iconButton(f, "dt-mail-ic", "mail", C - 170, 674, 40, tk.iconWell, tk.primaryDark);
  mkText(f, "dt-mail-lb", "an.nguyen@koola.chat", C - 118, 684, TY.bodySm, tk.ink, "Regular", 288, 20);

  iconButton(f, "dt-phone-ic", "phone", C - 170, 726, 40, tk.iconWell, tk.primaryDark);
  mkText(f, "dt-phone-lb", "+84 912 345 678", C - 118, 736, TY.bodySm, tk.ink, "Regular", 288, 20);

  // ── Thẻ lời mời kết bạn — cạnh phải thẻ hồ sơ, cùng hàng ──────────────
  var ix = PX + 460 + 24;
  var iy = 140;
  var invite = rect(f, "invite-card", ix, iy, 316, 300, tk.panel, 20);
  shadowL(invite, "lg");

  mkText(f, "invite-title", "Lời mời kết bạn", ix + 24, iy + 22, TY.body, tk.ink, "Bold", 200, 20);
  mkText(f, "invite-count", "3", ix + 24 + 122, iy + 24, TY.caption, tk.primary, "Bold", 20, 16);

  var invites = ["Dũng Phạm", "Hà Vũ", "Minh Lý"];
  for (var n = 0; n < invites.length; n++) {
    var ny = iy + 60 + n * 80;
    circle(f, "inv-ava-" + n, ix + 24, ny, 44, tk.primarySoft);
    mkText(f, "inv-nm-" + n, invites[n], ix + 80, ny + 4, TY.bodySm, tk.ink, "Bold", 160, 18);
    mkText(f, "inv-sub-" + n, "3 bạn chung", ix + 80, ny + 24, TY.tiny, tk.muted, "Regular", 160, 14);
    roundButton(f, "inv-accept-" + n, "check", ix + 210, ny + 8, 28, tk.primary, tk.white);
    roundButton(f, "inv-reject-" + n, "x", ix + 246, ny + 8, 28, tk.surface, tk.muted);
  }

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S26–S29 — CÀI ĐẶT
// ═══════════════════════════════════════════════════════════════════════════

function toggle(parent, name, x, y, on, tk) {
  rect(parent, name, x, y, 52, 30, on ? tk.primary : tk.line, 16);
  circle(parent, name + "-knob", on ? x + 24 : x + 4, y + 4, 22, tk.white);
}

// Khung cài đặt chung: rail + danh mục trái + nội dung phải.
function settingsScaffold(f, tk, activeIndex, title) {
  rail(f, 2, tk);

  // Cột danh mục
  rect(f, "settings-nav", RAIL_W, 0, 280, PAGE_H, tk.panel, 0);
  vline(f, "settings-nav-edge", RAIL_W + 280, 0, PAGE_H, tk.line);

  mkText(f, "sn-title", "Cài đặt", 100, 28, TY.heading, tk.ink, "Bold", 240, 28);

  var cats = [
    { ic: "users", lb: "Tài khoản" },
    { ic: "palette", lb: "Giao diện" },
    { ic: "bell", lb: "Thông báo" },
    { ic: "shield", lb: "Quyền riêng tư" },
    { ic: "smartphone", lb: "Phiên đăng nhập" },
    { ic: "languages", lb: "Ngôn ngữ" },
    { ic: "keyboard", lb: "Phím tắt" },
    { ic: "info", lb: "Giới thiệu" },
    { ic: "archive", lb: "Dung lượng" },
  ];

  for (var i = 0; i < cats.length; i++) {
    var y = 88 + i * 52;
    if (i === activeIndex) rect(f, "sn-active", 88, y - 4, 244, 44, tk.primarySoft, 10);
    iconCentered(f, "sn-ic-" + i, cats[i].ic, 104, y + 4, 28, 18,
      i === activeIndex ? tk.primaryDark : tk.muted);
    mkText(f, "sn-lb-" + i, cats[i].lb, 144, y + 10, 13,
      i === activeIndex ? tk.primaryDark : tk.ink,
      i === activeIndex ? "Bold" : "Regular", 180, 18);
  }

  mkText(f, "sn-ver", "Koola Web v1.0", 104, PAGE_H - 40, TY.tiny, tk.faintInk, "Regular", 200, 16);

  // Nội dung
  mkText(f, "sc-title", title, 400, 44, TY.title, tk.ink, "Bold", 900, 32);
  return 400;
}

function s26SettingsAccount(fx) {
  var tk = L;
  var f = frame("S26 — Cài đặt · Tài khoản", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 0, "Tài khoản");

  // Hồ sơ
  var card = rect(f, "acc-card", X, 104, 980, 200, tk.panel, 20);
  hairline(card, tk.line);

  circle(f, "acc-ava", X + 32, 140, 88, tk.primarySoft);
  iconCentered(f, "acc-ava-ic", "message-circle", X + 32, 140, 88, 36, tk.primary);
  circle(f, "acc-cam", X + 104, 208, 28, tk.primary);
  iconCentered(f, "acc-cam-ic", "camera", X + 104, 208, 28, 16, tk.white);

  mkText(f, "acc-name", "An Nguyễn", X + 140, 150, TY.heading, tk.ink, "Bold", 400, 26);
  mkText(f, "acc-mail", "an.nguyen@koola.chat", X + 140, 180, TY.bodySm, tk.muted, "Regular", 400, 18);
  rect(f, "acc-badge", X + 140, 206, 62, 22, tk.primarySoft, 10);
  mkText(f, "acc-badge-t", "Online", X + 140, 209, TY.micro, tk.primaryDark, "Bold", 62, 16, "CENTER");

  rect(f, "acc-edit", X + 780, 144, 168, 44, tk.surface, 10);
  iconCentered(f, "acc-edit-ic", "pencil", X + 794, 152, 28, 16, tk.ink);
  mkText(f, "acc-edit-t", "Chỉnh sửa", X + 826, 156, TY.bodySm, tk.ink, "Bold", 110, 20);

  // Các mục
  var rows = [
    { ic: "user-check", lb: "Tên hiển thị", val: "An Nguyễn" },
    { ic: "mail", lb: "Email", val: "an.nguyen@koola.chat" },
    { ic: "smartphone", lb: "Số điện thoại", val: "+84 912 345 678" },
    { ic: "lock", lb: "Mật khẩu", val: "Đổi mật khẩu" },
  ];

  var rc = rect(f, "row-card", X, 328, 980, 296, tk.panel, 20);
  hairline(rc, tk.line);

  for (var i = 0; i < rows.length; i++) {
    var y = 336 + i * 72;
    iconCentered(f, "row-ic-" + i, rows[i].ic, X + 28, y + 14, 32, 20, tk.muted);
    mkText(f, "row-lb-" + i, rows[i].lb, X + 76, y + 10, TY.bodySm, tk.muted, "Regular", 300, 18);
    mkText(f, "row-val-" + i, rows[i].val, X + 76, y + 32, TY.label, tk.ink, "Bold", 500, 20);
    lucide(f, "row-ch-" + i, "chevron-right", X + 940, y + 20, 20, tk.faint);
    if (i < rows.length - 1) hline(f, "row-sep-" + i, X + 76, y + 64, 880, tk.line);
  }

  // Nguy hiểm
  mkText(f, "danger-title", "Vùng nguy hiểm", X, 716, TY.bodySm, tk.dangerInk, "Bold", 400, 18);
  rect(f, "danger-card", X, 744, 980, 76, tk.panel, 16);
  lucide(f, "danger-ic", "trash-2", X + 24, 770, 20, tk.danger);
  mkText(f, "danger-lb", "Xoá tài khoản", X + 58, 768, TY.label, tk.ink, "Bold", 400, 20);
  mkText(f, "danger-sub", "Hành động này không thể hoàn tác", X + 58, 790, TY.tiny, tk.muted, "Regular", 400, 16);
  rect(f, "danger-btn", X + 820, 762, 136, 40, tk.dangerSoft, 10);
  mkText(f, "danger-btn-t", "Xoá tài khoản", X + 820, 773, TY.caption, tk.dangerInk, "Bold", 136, 18, "CENTER");

  return f;
}

function s27SettingsAppearance(fx) {
  var tk = L;
  var f = frame("S27 — Cài đặt · Giao diện", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 1, "Giao diện");

  // Chủ đề
  mkText(f, "theme-lb", "Chủ đề", X, 104, TY.label, tk.ink, "Bold", 400, 20);

  var themes = [
    { ic: "sun", lb: "Sáng", on: true },
    { ic: "moon", lb: "Tối", on: false },
    { ic: "monitor", lb: "Hệ thống", on: false },
  ];
  for (var t = 0; t < themes.length; t++) {
    var tx = X + t * 200;
    var card = strokeRect(f, "theme-" + t, tx, 136, 184, 168, tk.panel, 16,
      themes[t].on ? tk.primary : tk.line);
    if (themes[t].on) {
      card.strokeWeight = 2;
      circle(f, "theme-check", tx + 156, 148, 22, tk.primary);
      iconCentered(f, "theme-check-ic", "check", tx + 156, 148, 22, 16, tk.white);
    }
    // Preview mini
    rect(f, "theme-prev-" + t, tx + 16, 152, 152, 92, themes[t].on ? tk.white : tk.surface, 8);
    rect(f, "theme-prev-bar-" + t, tx + 16, 152, 152, 20, themes[t].on ? tk.primarySoft : tk.iconWell, 8);
    rect(f, "theme-prev-line1-" + t, tx + 26, 182, 100, 6, tk.line, 3);
    rect(f, "theme-prev-line2-" + t, tx + 26, 196, 76, 6, tk.line, 3);
    rect(f, "theme-prev-line3-" + t, tx + 26, 210, 90, 6, tk.line, 3);

    iconCentered(f, "theme-ic-" + t, themes[t].ic, tx + 16, 260, 24, 16,
      themes[t].on ? tk.primary : tk.muted);
    mkText(f, "theme-lb-" + t, themes[t].lb, tx + 46, 262, 13,
      themes[t].on ? tk.primary : tk.ink, themes[t].on ? "Bold" : "Regular", 120, 18);
  }

  // Cỡ chữ
  mkText(f, "size-lb", "Cỡ chữ", X, 344, TY.label, tk.ink, "Bold", 400, 20);
  var sizes = ["Nhỏ", "Vừa", "Lớn"];
  rect(f, "size-track", X, 380, 600, 4, tk.line, 2);
  rect(f, "size-fill", X, 380, 300, 4, tk.primary, 2);
  for (var s = 0; s < 3; s++) {
    var sx = X + s * 300 - 10;
    circle(f, "size-dot-" + s, sx, 370, 24, s === 1 ? tk.primary : tk.panel);
    if (s !== 1) {
      var d = f.findOne(function (n) { return n.name === "size-dot-" + s; });
      if (d) {
        d.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
        d.strokeWeight = 2;
        d.strokeAlign = "INSIDE";
      }
    }
    mkText(f, "size-t-" + s, sizes[s], sx - 20, 404, 12,
      s === 1 ? tk.primary : tk.muted, s === 1 ? "Bold" : "Regular", 64, 16, "CENTER");
  }

  // Mật độ
  mkText(f, "density-lb", "Mật độ hiển thị", X, 460, TY.label, tk.ink, "Bold", 400, 20);
  var densities = ["Thoáng", "Tiêu chuẩn", "Gọn"];
  for (var dd = 0; dd < 3; dd++) {
    var dx = X + dd * 180;
    chip(f, "density-" + dd, densities[dd], dx, 492, dd === 1 ? 118 : 100, dd === 1, tk);
  }

  // Hình nền
  mkText(f, "bg-lb", "Hình nền hội thoại", X, 560, TY.label, tk.ink, "Bold", 400, 20);
  var walls = [tk.canvas, tk.primarySoft, tk.accentSoft, tk.warnSoft];
  for (var w = 0; w < walls.length; w++) {
    var wx = X + w * 100;
    var wb = strokeRect(f, "wall-" + w, wx, 592, 84, 60, walls[w], 10,
      w === 0 ? tk.primary : tk.line);
    if (w === 0) {
      wb.strokeWeight = 2;
      iconCentered(f, "wall-ck-" + w, "check", wx + 60, 610, 20, 16, tk.primary);
    }
  }

  // Toggle cuối
  var toggles = [
    { lb: "Bo tròn bong bóng mạnh", on: true },
    { lb: "Giảm chuyển động", on: false },
  ];
  for (var tg = 0; tg < toggles.length; tg++) {
    var ty = 700 + tg * 60;
    mkText(f, "tg-lb-" + tg, toggles[tg].lb, X, ty + 4, TY.bodySm, tk.ink, "Regular", 500, 20);
    toggle(f, "tg-" + tg, X + 880, ty, toggles[tg].on, tk);
  }

  return f;
}

function s28SettingsPrivacy(fx) {
  var tk = L;
  var f = frame("S28 — Cài đặt · Riêng tư", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 3, "Quyền riêng tư");

  var rows = [
    { ic: "eye", lb: "Ai thấy trạng thái hoạt động", val: "Bạn bè" },
    { ic: "message-square", lb: "Ai có thể nhắn tin", val: "Mọi người" },
    { ic: "phone", lb: "Ai có thể gọi", val: "Bạn bè" },
    { ic: "user-plus", lb: "Ai có thể kết bạn", val: "Mọi người" },
  ];

  var card = rect(f, "priv-card", X, 104, 980, rows.length * 76 + 24, tk.panel, 20);
  hairline(card, tk.line);

  for (var i = 0; i < rows.length; i++) {
    var y = 128 + i * 76;
    iconCentered(f, "pr-ic-" + i, rows[i].ic, X + 24, y + 10, 32, 20, tk.muted);
    mkText(f, "pr-lb-" + i, rows[i].lb, X + 72, y + 8, TY.bodySm, tk.ink, "Regular", 400, 18);
    mkText(f, "pr-val-" + i, rows[i].val, X + 72, y + 30, TY.caption, tk.muted, "Bold", 300, 16);
    lucide(f, "pr-ch-" + i, "chevron-right", X + 944, y + 20, 20, tk.faint);
    if (i < rows.length - 1) hline(f, "pr-sep-" + i, X + 72, y + 62, 884, tk.line);
  }

  // Danh sách chặn
  mkText(f, "block-title", "Đã chặn", X, 448, TY.label, tk.ink, "Bold", 400, 20);
  var blocked = ["Minh Lý"];
  var card2 = rect(f, "block-card", X, 480, 980, 120, tk.panel, 20);
  hairline(card2, tk.line);

  for (var b = 0; b < blocked.length; b++) {
    var by = 504 + b * 64;
    circle(f, "blk-ava-" + b, X + 24, by, 44, tk.surface);
    mkText(f, "blk-nm-" + b, blocked[b], X + 80, by + 12, TY.bodySm, tk.ink, "Regular", 300, 18);
    rect(f, "blk-btn-" + b, X + 856, by + 8, 100, 32, tk.surface, 8);
    mkText(f, "blk-btn-t-" + b, "Bỏ chặn", X + 856, by + 15, TY.tiny, tk.ink, "Bold", 100, 16, "CENTER");
  }

  // Phiên đăng nhập
  mkText(f, "sess-title", "Phiên đăng nhập", X, 632, TY.label, tk.ink, "Bold", 400, 20);
  var card3 = rect(f, "sess-card", X, 664, 980, 180, tk.panel, 20);
  hairline(card3, tk.line);

  var sessions = [
    { ic: "laptop", nm: "MacBook Pro · Chrome", when: "TP.HCM · hiện tại", cur: true },
    { ic: "smartphone", nm: "iPhone 15 · Safari", when: "TP.HCM · 2 giờ trước", cur: false },
    { ic: "monitor", nm: "Windows · Edge", when: "Hà Nội · 3 ngày trước", cur: false },
  ];
  for (var s = 0; s < sessions.length; s++) {
    var sy = 688 + s * 52;
    iconCentered(f, "sess-ic-" + s, sessions[s].ic, X + 24, sy, 36, 20, tk.muted);
    mkText(f, "sess-nm-" + s, sessions[s].nm, X + 72, sy + 4, TY.bodySm, tk.ink, "Bold", 400, 18);
    mkText(f, "sess-w-" + s, sessions[s].when, X + 72, sy + 24, 11,
      sessions[s].cur ? tk.accent : tk.muted, "Regular", 400, 14);
    if (sessions[s].cur) {
      rect(f, "sess-cur", X + 856, sy + 8, 78, 24, tk.accentSoft, 10);
      mkText(f, "sess-cur-t", "Hiện tại", X + 856, sy + 11, TY.micro, tk.accentInk, "Bold", 78, 16, "CENTER");
    } else {
      mkText(f, "sess-out-" + s, "Đăng xuất", X + 856, sy + 12, TY.tiny, tk.dangerInk, "Bold", 78, 16, "CENTER");
    }
  }

  return f;
}

function s29SettingsDark(fx) {
  var tk = D;
  var f = frame("S29 — Cài đặt dark", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 2, "Thông báo");

  var card = rect(f, "noti-card", X, 104, 980, 320, tk.panel, 20);
  hairline(card, tk.line);

  var toggles = [
    { ic: "bell", lb: "Thông báo đẩy", sub: "Nhận thông báo khi có tin mới", on: true },
    { ic: "volume-1", lb: "Âm thanh thông báo", sub: "Phát âm thanh khi có tin", on: true },
    { ic: "phone", lb: "Thông báo cuộc gọi", sub: "Rung và đổ chuông khi có cuộc gọi", on: true },
    { ic: "moon", lb: "Không làm phiền", sub: "Tắt thông báo 22:00 – 07:00", on: false },
  ];

  for (var i = 0; i < toggles.length; i++) {
    var y = 128 + i * 76;
    iconCentered(f, "nt-ic-" + i, toggles[i].ic, X + 24, y + 8, 32, 20,
      toggles[i].on ? tk.primary : tk.muted);
    mkText(f, "nt-lb-" + i, toggles[i].lb, X + 72, y + 6, TY.bodySm, tk.ink, "Bold", 400, 18);
    mkText(f, "nt-sub-" + i, toggles[i].sub, X + 72, y + 28, TY.tiny, tk.muted, "Regular", 400, 16);
    toggle(f, "nt-tg-" + i, X + 904, y + 12, toggles[i].on, tk);
    if (i < toggles.length - 1) hline(f, "nt-sep-" + i, X + 72, y + 62, 884, tk.line);
  }

  // Tắt thông báo theo hội thoại
  mkText(f, "mute-title", "Đang tắt thông báo", X, 460, TY.label, tk.ink, "Bold", 400, 20);
  var card2 = rect(f, "mute-card", X, 492, 980, 132, tk.panel, 20);
  hairline(card2, tk.line);

  var muted = ["Design Team", "Koola Dev"];
  for (var m = 0; m < muted.length; m++) {
    var my = 516 + m * 60;
    circle(f, "mt-ava-" + m, X + 24, my, 40, tk.primarySoft);
    mkText(f, "mt-nm-" + m, muted[m], X + 76, my + 10, TY.bodySm, tk.ink, "Regular", 300, 18);
    iconCentered(f, "mt-ic-" + m, "bell-off", X + 880, my, 28, 20, tk.faint);
    mkText(f, "mt-off-" + m, "Bật lại", X + 916, my + 5, TY.tiny, tk.primary, "Bold", 60, 16);
  }

  return f;
}
// ═══════════════════════════════════════════════════════════════════════════
// S30 — PHÍM TẮT + PWA
// ═══════════════════════════════════════════════════════════════════════════

function s30Shortcuts(fx) {
  var tk = L;
  var f = frame("S30 — Phím tắt + PWA", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 6, "Phím tắt");

  var card = rect(f, "sc-card", X, 104, 980, 520, tk.panel, 20);
  hairline(card, tk.line);

  mkText(f, "sc-h-modal", "Điều hướng", X + 32, 128, TY.bodySm, tk.ink, "Bold", 400, 18);

  var groups = [
    { h: "Điều hướng", items: [
      ["Mở tìm kiếm", ["⌘", "K"]],
      ["Chuyển hội thoại", ["⌘", "↑/↓"]],
      ["Đóng panel / modal", ["Esc"]],
      ["Mở cài đặt", ["⌘", ","]],
    ]},
    { h: "Nhắn tin", items: [
      ["Gửi tin", ["Enter"]],
      ["Xuống dòng", ["Shift", "Enter"]],
      ["Trả lời tin đang chọn", ["R"]],
      ["Chỉnh sửa tin cuối", ["↑"]],
      ["Xoá tin đang chọn", ["⌫"]],
    ]},
    { h: "Cuộc gọi", items: [
      ["Bật/tắt mic", ["⌘", "M"]],
      ["Bật/tắt camera", ["⌘", "E"]],
      ["Kết thúc cuộc gọi", ["⌘", "D"]],
    ]},
  ];

  var colY = [128, 128, 336];
  var colX = [X + 32, X + 360, X + 688];

  for (var g = 0; g < groups.length; g++) {
    var gy = colY[g] + 30;
    if (g > 0) mkText(f, "sc-g-" + g, groups[g].h, colX[g], gy - 30, TY.bodySm, tk.ink, "Bold", 300, 18);
    for (var i = 0; i < groups[g].items.length; i++) {
      var iy = gy + i * 44;
      mkText(f, "sc-lb-" + g + "-" + i, groups[g].items[i][0], colX[g], iy + 6, TY.caption, tk.muted, "Regular", 180, 18);
      var keys = groups[g].items[i][1];
      var kx = colX[g] + 200;
      for (var k = 0; k < keys.length; k++) {
        var kw = keys[k].length > 2 ? 54 : 28;
        rect(f, "sc-key-" + g + "-" + i + "-" + k, kx, iy, kw, 26, tk.surface, 8);
        mkText(f, "sc-key-t-" + g + "-" + i + "-" + k, keys[k], kx, iy + 5, TY.tiny, tk.ink, "Bold", kw, 16, "CENTER");
        kx += kw + 4;
      }
    }
  }

  // ── PWA install card ──────────────────────────────────────────────────
  var px = X;
  var py = 656;
  var pwa = rect(f, "pwa-card", px, py, 980, 168, tk.primarySoft, 20);

  circle(f, "pwa-ic-bg", px + 32, py + 36, 72, tk.panel);
  iconCentered(f, "pwa-ic", "download", px + 32, py + 36, 72, 32, tk.primary);

  mkText(f, "pwa-title", "Cài Koola như ứng dụng", px + 124, py + 36, TY.heading, tk.ink, "Bold", 500, 24);
  mkText(f, "pwa-sub", "Mở nhanh từ màn hình chính, nhận thông báo kể cả khi đóng tab.",
    px + 124, py + 66, TY.bodySm, tk.muted, "Regular", 560, 20);

  rect(f, "pwa-btn", px + 760, py + 46, 180, 48, tk.primary, 10);
  iconCentered(f, "pwa-btn-ic", "download", px + 776, py + 56, 28, 20, tk.white);
  mkText(f, "pwa-btn-t", "Cài đặt ngay", px + 808, py + 60, TY.bodySm, tk.white, "Bold", 124, 20);

  mkText(f, "pwa-note", "Trình duyệt hỗ trợ: Chrome, Edge, Safari 16.4+", px + 32, py + 122, TY.tiny, tk.faintInk, "Regular", 600, 16);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S31 — TOAST (thành công · lỗi · thông tin · hoàn tác)
// ═══════════════════════════════════════════════════════════════════════════

function toast(parent, name, x, y, w, tone, tk, title, sub, action) {
  var conf = {
    success: { bg: tk.panel, accent: tk.accent, ic: "check", iconBg: tk.accentSoft, iconFg: tk.accent },
    error: { bg: tk.panel, accent: tk.danger, ic: "circle-alert", iconBg: tk.dangerSoft, iconFg: tk.danger },
    info: { bg: tk.panel, accent: tk.primary, ic: "info", iconBg: tk.primarySoft, iconFg: tk.primaryDark },
    undo: { bg: tk.panel, accent: tk.warnInk, ic: "undo", iconBg: tk.warnSoft, iconFg: tk.warnInk },
  }[tone];

  var h = sub ? 76 : 60;
  var box = rect(parent, name, x, y, w, h, conf.bg, 14);
  shadowL(box, "lg");
  box.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
  box.strokeWeight = 1;
  box.strokeAlign = "INSIDE";

  // Thanh màu trạng thái bên trái
  rect(parent, name + "-bar", x, y + 12, 3, h - 24, conf.accent, 2);

  circle(parent, name + "-ic-bg", x + 18, y + (h - 36) / 2, 36, conf.iconBg);
  iconCentered(parent, name + "-ic", conf.ic, x + 18, y + (h - 36) / 2, 36, 18, conf.iconFg);

  var tx = x + 66;
  var tw = w - 66 - (action ? 96 : 44);
  mkText(parent, name + "-title", title, tx, y + (sub ? 16 : 14), TY.bodySm, tk.ink, "Bold", tw, 18);
  if (sub) mkText(parent, name + "-sub", sub, tx, y + 36, TY.caption, tk.muted, "Regular", tw, 16);

  if (action) {
    mkText(parent, name + "-act", action, x + w - 88, y + h / 2 - 9, 12, conf.accent, "Bold", 64, 18, "RIGHT");
  } else {
    lucide(parent, name + "-close", "x", x + w - 36, y + h / 2 - 9, 20, tk.faint);
  }
  return box;
}

function s31Toast(fx) {
  var tk = L;
  var f = frame("S31 — Toast", fx, tk.canvas);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 88, 288, tk, "Tìm kiếm");
  chip(f, "chip-0", "Tất cả", 96, 148, 76, true, tk);
  chip(f, "chip-1", "Chưa đọc", 180, 148, 96, false, tk);
  chip(f, "chip-2", "Nhóm", 284, 148, 68, false, tk);

  for (var i = 0; i < 5; i++) convRow(f, 88, 204 + i * 76, 308, CONVS[i], tk);

  // Cửa sổ chat mờ phía sau
  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var hdr = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });
  strokeRect(f, "bub-a", A + 66, 140, 300, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-a", "Cậu xem file giúp mình nhé", A + 84, 152, TY.label, tk.ink, "Regular", 264, 20);
  rect(f, "bub-b", RIGHT - 302, 196, 302, 44, tk.primary, 16);
  mkText(f, "msg-b", "Ok, mình xem ngay", RIGHT - 284, 208, TY.label, tk.white, "Regular", 240, 20);
  composerBar(f, tk, A, AW, {});

  // Cột toast xếp dọc, góc trên-phải vùng chat
  var TW = 384;
  var tx = RIGHT - TW - 24;
  caption(f, "Toast xếp chồng góc trên-phải · tối đa 3 · tự tắt sau 4s", tx, 96, TW, tk);

  toast(f, "t-success", tx, 124, TW, "success", tk,
    "Đã gửi tin nhắn", null, null);
  toast(f, "t-undo", tx, 196, TW, "undo", tk,
    "Đã xoá hội thoại", "Có thể hoàn tác trong 5 giây", "Hoàn tác");
  toast(f, "t-error", tx, 284, TW, "error", tk,
    "Không gửi được ảnh", "Tệp vượt quá 25 MB · thử nén lại", "Thử lại");
  toast(f, "t-info", tx, 372, TW, "info", tk,
    "Đã sao chép liên kết", null, null);
  toast(f, "t-error2", tx, 444, TW, "error", tk,
    "Mất kết nối", "Tin nhắn sẽ tự gửi lại khi có mạng", null);

  // Nút trigger để thấy toast bật lên
  caption(f, "Trigger mẫu: bấm để mô phỏng", tx, 540, TW, tk);
  rect(f, "toast-demo-btn", tx, 564, 180, 44, tk.primary, 10);
  mkText(f, "toast-demo-btn-t", "Gửi tin nhắn", tx, 577, TY.bodySm, tk.white, "Bold", 180, 20, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S32 — COMMAND PALETTE (⌘K)
// ═══════════════════════════════════════════════════════════════════════════

function s32CommandPalette(fx) {
  var tk = L;
  var f = frame("S32 — Command palette", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 6; i++) convRow(f, 88, 84 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  // Nền chat mờ
  var hdr = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động", icons: ["phone", "video", "info"],
  });
  strokeRect(f, "cp-bub1", A + 66, 130, 300, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "cp-msg1", "Cậu xem file giúp mình nhé", A + 84, 142, TY.label, tk.ink, "Regular", 264, 20);
  composerBar(f, tk, A, AW, {});

  // Scrim
  rect(f, "cp-scrim", 0, 0, PAGE_W, PAGE_H, tk.ink, 0, 0.4);

  // Palette căn giữa ngang, neo trên
  var PW = 640;
  var px = (PAGE_W - PW) / 2;
  var py = 140;
  var pal = rect(f, "cp-panel", px, py, PW, 560, tk.panel, 16);
  shadowL(pal, "xl");

  // Ô tìm kiếm
  lucide(f, "cp-search-ic", "search", px + 24, py + 26, 24, tk.muted);
  mkText(f, "cp-input", "thiết kế", px + 58, py + 24, TY.heading, tk.ink, "Regular", 400, 26);
  rect(f, "cp-caret", px + 128, py + 22, 2, 30, tk.primary, 1);
  lucide(f, "cp-clear", "x", px + PW - 48, py + 28, 20, tk.faint);
  hline(f, "cp-line-1", px, py + 72, PW, tk.line);

  // Nhóm: Hành động
  mkText(f, "cp-grp-1", "HÀNH ĐỘNG", px + 20, py + 88, TY.micro, tk.faintInk, "Bold", 200, 14);

  var actions = [
    { ic: "message-circle", lb: "Mở cuộc trò chuyện với An Nguyễn", keys: ["↵"], cur: true },
    { ic: "user-plus", lb: "Tạo nhóm mới", keys: ["⌘", "G"] },
    { ic: "moon", lb: "Đổi sang giao diện tối", keys: ["⌘", "⇧", "D"] },
    { ic: "bell-off", lb: "Tắt thông báo hội thoại này", keys: [] },
  ];
  for (var i = 0; i < actions.length; i++) {
    var ay = py + 108 + i * 44;
    if (actions[i].cur) rect(f, "cp-act-bg-" + i, px + 12, ay - 4, PW - 24, 40, tk.primarySoft, 10);
    iconCentered(f, "cp-act-ic-" + i, actions[i].ic, px + 24, ay, 24, 18,
      actions[i].cur ? tk.primaryDark : tk.muted);
    mkText(f, "cp-act-lb-" + i, actions[i].lb, px + 58, ay + 3, 13,
      actions[i].cur ? tk.primaryDark : tk.ink, actions[i].cur ? "Bold" : "Regular", 380, 18);
    // phím tắt
    var kx = px + PW - 28;
    for (var k = actions[i].keys.length - 1; k >= 0; k--) {
      var kw = actions[i].keys[k].length > 1 ? 32 : 22;
      kx -= kw;
      rect(f, "cp-key-" + i + "-" + k, kx, ay, kw, 22, tk.surface, 4);
      mkText(f, "cp-key-t-" + i + "-" + k, actions[i].keys[k], kx, ay + 4, TY.micro, tk.muted, "Bold", kw, 14, "CENTER");
      kx -= 4;
    }
  }

  hline(f, "cp-line-2", px + 12, py + 292, PW - 24, tk.line);

  // Nhóm: Tin nhắn
  mkText(f, "cp-grp-2", "TIN NHẮN", px + 20, py + 306, TY.micro, tk.faintInk, "Bold", 200, 14);

  var msgs = [
    { ava: true, who: "An Nguyễn", when: "Hôm nay 10:22", txt: "File thiết kế mình gửi rồi nhé" },
    { ava: true, who: "An Nguyễn", when: "Hôm nay 10:22", txt: "Cậu xem file giúp mình với" },
    { ava: false, who: "Koola Dev", when: "Hôm qua 18:40", txt: "File build mới đã lên staging" },
    { ava: false, who: "Design Team", when: "T2 09:10", txt: "Figma vừa update file thiết kế" },
  ];
  for (var m = 0; m < msgs.length; m++) {
    var my = py + 326 + m * 52;
    circle(f, "cp-ava-" + m, px + 24, my + 4, 36, tk.primarySoft);
    mkText(f, "cp-who-" + m, msgs[m].who, px + 72, my + 4, TY.caption, tk.ink, "Bold", 200, 16);
    mkText(f, "cp-when-" + m, msgs[m].when, px + 72, my + 22, TY.micro, tk.faintInk, "Regular", 200, 14);
    mkText(f, "cp-txt-" + m, msgs[m].txt, px + 300, my + 12, TY.caption, tk.muted, "Regular", 280, 16);
  }

  // Footer
  hline(f, "cp-line-3", px, py + 532, PW, tk.line);
  mkText(f, "cp-foot", "↑↓ di chuyển · ↵ chọn · Esc đóng", px + 20, py + 540, TY.tiny, tk.faintInk, "Regular", 400, 16);
  mkText(f, "cp-count", "3 kết quả", px + PW - 100, py + 540, TY.tiny, tk.faintInk, "Regular", 84, 16, "RIGHT");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S33 — NHÓM: THÀNH VIÊN + RỜI NHÓM
// ═══════════════════════════════════════════════════════════════════════════

function s33GroupMembers(fx) {
  var tk = L;
  var f = frame("S33 — Nhóm: thành viên", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 84 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var PANEL_W = 380;
  var CHAT_W = PAGE_W - LIST_END - PANEL_W;

  // Chat nhóm
  rect(f, "header", A, 0, CHAT_W, 76, tk.panel, 0);
  hline(f, "header-line", A, 75, CHAT_W, tk.line);
  rect(f, "header-ava", A + 24, 16, 44, 44, tk.primarySoft, 24);
  iconCentered(f, "header-ava-ic", "users", A + 24, 16, 44, 24, tk.primary);
  mkText(f, "header-name", "Koola Design", A + 80, 20, TY.body, tk.ink, "Bold");
  mkText(f, "header-status", "4 thành viên", A + 80, 42, TY.caption, tk.muted, "Regular");

  strokeRect(f, "g-b1", A + 66, 120, 300, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "g-m1", "Mọi người xem mockup mới nhé", A + 84, 132, TY.label, tk.ink, "Regular", 264, 20);
  rect(f, "g-b2", A + CHAT_W - 24 - 300, 176, 300, 44, tk.primary, 16);
  mkText(f, "g-m2", "Ok, mình feedback sau", A + CHAT_W - 24 - 282, 188, TY.label, tk.white, "Regular", 254, 20);

  composerBar(f, tk, A, CHAT_W, {});

  // ── Panel thành viên ──────────────────────────────────────────────────
  var px = PAGE_W - PANEL_W;
  rect(f, "gm-panel", px, 0, PANEL_W, PAGE_H, tk.panel, 0);
  vline(f, "gm-edge", px, 0, PAGE_H, tk.line);

  mkText(f, "gm-title", "Thành viên nhóm", px + 24, 28, TY.heading, tk.ink, "Bold", 250, 22);
  lucide(f, "gm-close", "x", px + PANEL_W - 44, 30, 20, tk.muted);

  circle(f, "gm-ava", px + PANEL_W / 2 - 44, 72, 88, tk.primarySoft);
  iconCentered(f, "gm-ava-ic", "users", px + PANEL_W / 2 - 44, 72, 88, 36, tk.primary);
  mkText(f, "gm-name", "Koola Design", px + 24, 172, TY.heading, tk.ink, "Bold", PANEL_W - 48, 24, "CENTER");
  mkText(f, "gm-sub", "4 thành viên · 2 đang online", px + 24, 200, TY.caption, tk.muted, "Regular", PANEL_W - 48, 18, "CENTER");

  hline(f, "gm-line-1", px + 24, 236, PANEL_W - 48, tk.line);

  // Tìm thành viên
  strokeRect(f, "gm-search", px + 24, 252, PANEL_W - 48, 40, tk.surface, R.pill, tk.line);
  lucide(f, "gm-search-ic", "search", px + 38, 262, 20, tk.faint);
  mkText(f, "gm-search-ph", "Tìm thành viên", px + 64, 262, TY.caption, tk.faintInk, "Regular", 200, 18);

  mkText(f, "gm-count-lb", "Thành viên · 4", px + 24, 308, TY.caption, tk.muted, "Bold", 200, 18);

  var members = [
    { n: "An Nguyễn", role: "Trưởng nhóm", on: true, me: false },
    { n: "Bình Trần", role: "Thành viên", on: true, me: false },
    { n: "Chị Lê", role: "Thành viên", on: false, me: false },
    { n: "Bạn", role: "Thành viên", on: true, me: true },
  ];
  for (var mi = 0; mi < members.length; mi++) {
    var my = 332 + mi * 64;
    circle(f, "mm-ava-" + mi, px + 24, my + 8, 44, tk.primarySoft);
    if (members[mi].on) {
      circle(f, "mm-dot-ring-" + mi, px + 56, my + 40, 16, tk.panel);
      circle(f, "mm-dot-" + mi, px + 58, my + 42, 12, tk.online);
    }
    mkText(f, "mm-name-" + mi, members[mi].n, px + 80, my + 10, TY.bodySm,
      tk.ink, members[mi].me ? "Bold" : "Regular", 200, 18);
    mkText(f, "mm-role-" + mi, members[mi].role, px + 80, my + 30, 11,
      members[mi].role === "Trưởng nhóm" ? tk.primary : tk.muted, "Regular", 200, 14);
    // Nút "..." cho từng thành viên (trừ bản thân)
    if (!members[mi].me) {
      lucide(f, "mm-more-" + mi, "ellipsis", px + PANEL_W - 44, my + 22, 20, tk.faint);
    }
  }

  // Thêm thành viên
  iconButton(f, "gm-add", "user-plus", px + 24, 604, 44, tk.primarySoft, tk.primaryDark);
  mkText(f, "gm-add-t", "Thêm thành viên", px + 80, 617, TY.bodySm, tk.primaryDark, "Bold", 220, 20);

  hline(f, "gm-line-2", px + 24, 672, PANEL_W - 48, tk.line);

  // Nhóm hành động nguy hiểm
  iconCentered(f, "gm-leave-ic", "log-out", px + 24, 692, 32, 20, tk.warnInk);
  mkText(f, "gm-leave-t", "Rời khỏi nhóm", px + 66, 700, TY.bodySm, tk.warnInk, "Regular", 220, 18);

  iconCentered(f, "gm-del-ic", "trash-2", px + 24, 740, 32, 20, tk.danger);
  mkText(f, "gm-del-t", "Xoá nhóm", px + 66, 748, TY.bodySm, tk.dangerInk, "Regular", 220, 18);
  mkText(f, "gm-del-sub", "Chỉ trưởng nhóm", px + 66, 768, TY.micro, tk.faintInk, "Regular", 220, 14);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S34 — CUỘC GỌI: KẾT NỐI KÉM + BỊ TỪ CHỐI + NHỠ
// ═══════════════════════════════════════════════════════════════════════════

function s34CallStates(fx) {
  var tk = L;
  var f = frame("S34 — Trạng thái cuộc gọi", fx, tk.canvas);

  var cols = [
    { title: "Kết nối kém" },
    { title: "Bị từ chối" },
    { title: "Không trả lời" },
  ];

  var CW = 440;
  var xs = [30, 30 + CW + 20, 30 + 2 * (CW + 20)];

  for (var c = 0; c < cols.length; c++) {
    var cx = xs[c];
    var panel = rect(f, "st-panel-" + c, cx, 80, CW, 740, tk.panel, 16);
    hairline(panel, tk.line);

    mkText(f, "st-title-" + c, cols[c].title, cx + 32, 112, TY.heading, tk.ink, "Bold", CW - 64, 24);
    hline(f, "st-line-" + c, cx + 32, 148, CW - 64, tk.line);

    // Avatar
    circle(f, "st-ava-" + c, cx + CW / 2 - 44, 188, 88, tk.primarySoft);
    iconCentered(f, "st-ava-ic-" + c, "users", cx + CW / 2 - 44, 188, 88, 36, tk.primary);

    mkText(f, "st-name-" + c, "An Nguyễn", cx + 32, 296, TY.heading, tk.ink, "Bold", CW - 64, 24, "CENTER");

    if (c === 0) {
      // Kết nối kém — banner cảnh báo + chỉ báo sóng
      mkText(f, "st-sub-" + c, "02:47", cx + 32, 324, TY.bodySm, tk.muted, "Regular", CW - 64, 18, "CENTER");

      strokeRect(f, "st-warn", cx + 32, 360, CW - 64, 52, tk.warnSoft, 12, tk.successStrong);
      lucide(f, "st-warn-ic", "wifi-off", cx + 48, 374, 24, tk.warnInk);
      mkText(f, "st-warn-t", "Kết nối không ổn định", cx + 80, 372, TY.caption, tk.warnInk, "Bold", 300, 18);
      mkText(f, "st-warn-s", "Đang thử kết nối lại…", cx + 80, 390, TY.tiny, tk.warnInk, "Regular", 300, 16);

      // 3 vạch tín hiệu: 1 vạch sáng
      for (var b = 0; b < 3; b++) {
        rect(f, "st-bar-" + b, cx + CW / 2 - 22 + b * 16, 440 - b * 6,
          8, 10 + b * 6, b === 0 ? tk.danger : tk.line, 2);
      }

      // Nút thu nhỏ + kết thúc
      roundButton(f, "st-btn-1", "minimize", cx + 112, 490, 56, tk.surface, tk.ink);
      roundButton(f, "st-btn-2", "phone-off", cx + 272, 490, 56, tk.danger, tk.white);
      mkText(f, "st-btn-t1", "Thu nhỏ", cx + 112 - 20, 556, TY.tiny, tk.muted, "Regular", 96, 16, "CENTER");
      mkText(f, "st-btn-t2", "Kết thúc", cx + 272 - 20, 556, TY.tiny, tk.muted, "Regular", 96, 16, "CENTER");

      // Gợi ý xử lý
      mkText(f, "st-tip", "Mẹo: kiểm tra Wi-Fi hoặc chuyển sang 4G", cx + 32, 610, TY.tiny, tk.faintInk, "Regular", CW - 64, 16, "CENTER");

    } else if (c === 1) {
      // Bị từ chối
      iconCentered(f, "st-icon-" + c, "phone-off", cx + CW / 2 - 24, 330, 48, 28, tk.danger);
      mkText(f, "st-sub-" + c, "Cuộc gọi bị từ chối", cx + 32, 392, TY.bodySm, tk.dangerInk, "Bold", CW - 64, 18, "CENTER");
      mkText(f, "st-note-" + c, "An Nguyễn đang bận", cx + 32, 414, TY.caption, tk.muted, "Regular", CW - 64, 16, "CENTER");

      rect(f, "st-btn-1-" + c, cx + 32, 470, CW - 64, 48, tk.primary, 10);
      lucide(f, "st-btn-ic-" + c, "message-circle", cx + 108, 484, 20, tk.white);
      mkText(f, "st-btn-t-" + c, "Gửi tin nhắn", cx + 136, 483, TY.bodySm, tk.white, "Bold", 180, 20);

      strokeRect(f, "st-btn-2-" + c, cx + 32, 530, CW - 64, 48, tk.panel, 12, tk.line);
      mkText(f, "st-btn-t2-" + c, "Gọi lại", cx + 32, 544, TY.bodySm, tk.ink, "Bold", CW - 64, 20, "CENTER");

      mkText(f, "st-tip-" + c, "Cuộc gọi đi · không có ai trả lời", cx + 32, 600, TY.tiny, tk.faintInk, "Regular", CW - 64, 16, "CENTER");

    } else {
      // Không trả lời / nhỡ
      iconCentered(f, "st-icon-" + c, "phone-call", cx + CW / 2 - 24, 330, 48, 28, tk.warnInk);
      mkText(f, "st-sub-" + c, "Cuộc gọi nhỡ lúc 21:30", cx + 32, 392, TY.bodySm, tk.warnInk, "Bold", CW - 64, 18, "CENTER");
      mkText(f, "st-note-" + c, "Hôm qua · 2 phút đổ chuông", cx + 32, 414, TY.caption, tk.muted, "Regular", CW - 64, 16, "CENTER");

      rect(f, "st-btn-1-" + c, cx + 32, 470, CW - 64, 48, tk.primary, 10);
      lucide(f, "st-btn-ic-" + c, "phone", cx + 112, 484, 20, tk.white);
      mkText(f, "st-btn-t-" + c, "Gọi lại", cx + 140, 483, TY.bodySm, tk.white, "Bold", 180, 20);

      strokeRect(f, "st-btn-2-" + c, cx + 32, 530, CW - 64, 48, tk.panel, 12, tk.line);
      mkText(f, "st-btn-t2-" + c, "Báo nhỡ qua tin nhắn", cx + 32, 544, TY.bodySm, tk.ink, "Bold", CW - 64, 20, "CENTER");

      // Gợi ý khung giờ
      mkText(f, "st-tip-" + c, "Thường trả lời sau 20:00", cx + 32, 600, TY.tiny, tk.faintInk, "Regular", CW - 64, 16, "CENTER");
    }
  }

  // Divider "Tin nhắn mới" demo ở cột trái — phần 3 của kế hoạch
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S35 — DIVIDER TIN NHẮN MỚI
// ═══════════════════════════════════════════════════════════════════════════

function s35UnreadDivider(fx) {
  var tk = L;
  var f = frame("S35 — Divider tin nhắn mới", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");
  for (var i = 0; i < 5; i++) convRow(f, 88, 148 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var hdr = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });

  // Tin cũ
  rect(f, "ud-ava", A + 24, 120, 32, 32, tk.primarySoft, 16);
  mkText(f, "ud-name", "An Nguyễn", A + 66, 120, TY.caption, tk.muted, "Bold", 200, 16);
  strokeRect(f, "ud-old1", A + 66, 142, 300, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "ud-old1-t", "Cậu xem file giúp mình nhé", A + 84, 154, TY.label, tk.ink, "Regular", 264, 20);
  strokeRect(f, "ud-old2", A + 66, 194, 260, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "ud-old2-t", "Gửi hôm qua rồi", A + 84, 206, TY.label, tk.ink, "Regular", 224, 20);
  mkText(f, "ud-old-time", "Hôm qua 18:40", A + 66, 246, TY.micro, tk.faintInk, "Regular", 160, 14);

  // ── Divider "Tin nhắn mới" ────────────────────────────────────────────
  var dy = 292;
  hline(f, "ud-line-l", A + 24, dy, 240, tk.primary);
  rect(f, "ud-pill", MID - 66, dy - 13, 132, 26, tk.primarySoft, 14);
  mkText(f, "ud-pill-t", "Tin nhắn mới", MID - 66, dy - 8, TY.tiny, tk.primaryDark, "Bold", 132, 16, "CENTER");
  hline(f, "ud-line-r", A + AW - 264, dy, 240, tk.primary);

  // Tin mới
  rect(f, "ud-ava2", A + 24, 340, 32, 32, tk.primarySoft, 16);
  strokeRect(f, "ud-new1", A + 66, 362, 320, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "ud-new1-t", "File thiết kế mình gửi rồi nhé", A + 84, 374, TY.label, tk.ink, "Regular", 284, 20);
  rect(f, "ud-new2", RIGHT - 322, 414, 322, 44, tk.primary, 16);
  mkText(f, "ud-new2-t", "Ok, mình mở xem luôn", RIGHT - 304, 426, TY.label, tk.white, "Regular", 250, 20);

  // Ghi chú
  caption(f, "Divider xanh 'Tin nhắn mới' chèn giữa tin cũ và tin chưa đọc. Biến mất sau khi cuộn hết hoặc rời hội thoại.",
    A + 66, 500, 900, tk);

  // Nút "đánh dấu đã đọc"
  strokeRect(f, "ud-mark", RIGHT - 260, 540, 236, 44, tk.panel, 10, tk.line);
  lucide(f, "ud-mark-ic", "check-check", RIGHT - 244, 552, 20, tk.muted);
  mkText(f, "ud-mark-t", "Đánh dấu đã đọc", RIGHT - 216, 551, TY.caption, tk.ink, "Regular", 180, 20);

  composerBar(f, tk, A, AW, {});
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S36–S38 — CÀI ĐẶT BỔ SUNG (ngôn ngữ · giới thiệu · dung lượng)
// ═══════════════════════════════════════════════════════════════════════════

function s36SettingsLanguage(fx) {
  var tk = L;
  var f = frame("S36 — Cài đặt · Ngôn ngữ", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 5, "Ngôn ngữ");

  mkText(f, "lang-lb", "Ngôn ngữ hiển thị", X, 104, TY.label, tk.ink, "Bold", 400, 20);

  var langs = [
    { flag: "🇻🇳", name: "Tiếng Việt", sub: "Vietnamese", on: true },
    { flag: "🇬🇧", name: "English", sub: "English", on: false },
    { flag: "🇯🇵", name: "日本語", sub: "Japanese", on: false },
    { flag: "🇨🇳", name: "中文", sub: "Chinese", on: false },
  ];

  var card = rect(f, "lang-card", X, 136, 980, langs.length * 72 + 20, tk.panel, 20);
  hairline(card, tk.line);

  for (var i = 0; i < langs.length; i++) {
    var y = 156 + i * 72;
    mkText(f, "lang-flag-" + i, langs[i].flag, X + 24, y + 6, 22, tk.ink, "Regular", 32, 30);
    mkText(f, "lang-name-" + i, langs[i].name, X + 68, y + 6, 14,
      langs[i].on ? tk.primaryDark : tk.ink, langs[i].on ? "Bold" : "Regular", 300, 20);
    mkText(f, "lang-sub-" + i, langs[i].sub, X + 68, y + 28, TY.tiny, tk.muted, "Regular", 300, 16);
    if (langs[i].on) {
      circle(f, "lang-check-bg", X + 940, y + 14, 24, tk.primary);
      iconCentered(f, "lang-check", "check", X + 940, y + 14, 24, 16, tk.white);
    }
    if (i < langs.length - 1) hline(f, "lang-sep-" + i, X + 68, y + 62, 892, tk.line);
  }

  mkText(f, "lang-note", "Áp dụng ngay cho toàn bộ giao diện, không cần tải lại trang.",
    X, 470, TY.tiny, tk.faintInk, "Regular", 900, 16);

  return f;
}

function s37SettingsAbout(fx) {
  var tk = L;
  var f = frame("S37 — Cài đặt · Giới thiệu", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 7, "Giới thiệu");

  // Thẻ app
  var card = rect(f, "about-card", X, 104, 980, 196, tk.panel, 20);
  hairline(card, tk.line);

  circle(f, "about-logo-bg", X + 40, 136, 88, tk.surface);
  markOrWarn(f, "about-logo", X + 56, 152, 56);
  mkText(f, "about-name", "Koola", X + 152, 146, TY.title, tk.ink, "Bold", 300, 32);
  mkText(f, "about-ver", "Koola Web · v1.0.0 (build 20261105)", X + 152, 180, TY.caption, tk.muted, "Regular", 400, 18);
  mkText(f, "about-tag", "Where All Needs Connect!", X + 152, 204, TY.label, tk.primaryDark, "Bold", 400, 20);
  mkText(f, "about-tag-vi", "Nơi kết nối mọi nhu cầu", X + 152, 226, TY.caption, tk.muted, "Regular", 400, 18);

  // Checklist cập nhật
  mkText(f, "upd-title", "Có bản cập nhật mới", X, 328, TY.bodySm, tk.ink, "Bold", 400, 18);
  var upd = rect(f, "upd-card", X, 356, 980, 84, tk.primarySoft, 16);
  iconCentered(f, "upd-ic", "download", X + 24, 376, 44, 24, tk.primaryDark);
  mkText(f, "upd-t", "v1.1.0 đã sẵn sàng", X + 84, 372, TY.bodySm, tk.ink, "Bold", 400, 18);
  mkText(f, "upd-s", "Sửa lỗi gửi ảnh và cải thiện chất lượng cuộc gọi", X + 84, 392, TY.tiny, tk.muted, "Regular", 600, 16);
  rect(f, "upd-btn", X + 820, 376, 136, 40, tk.primary, 10);
  mkText(f, "upd-btn-t", "Cập nhật", X + 820, 387, TY.caption, tk.white, "Bold", 136, 18, "CENTER");

  // Liên kết
  var links = [
    { ic: "shield", lb: "Chính sách bảo mật" },
    { ic: "file-text", lb: "Điều khoản sử dụng" },
    { ic: "flag", lb: "Báo cáo sự cố" },
    { ic: "info", lb: "Trung tâm trợ giúp" },
  ];
  var lcard = rect(f, "links-card", X, 464, 980, links.length * 60 + 16, tk.panel, 20);
  hairline(lcard, tk.line);

  for (var i = 0; i < links.length; i++) {
    var y = 484 + i * 60;
    iconCentered(f, "ln-ic-" + i, links[i].ic, X + 24, y, 32, 20, tk.muted);
    mkText(f, "ln-lb-" + i, links[i].lb, X + 68, y + 8, TY.bodySm, tk.ink, "Regular", 400, 18);
    lucide(f, "ln-ch-" + i, "chevron-right", X + 940, y + 6, 20, tk.faint);
    if (i < links.length - 1) hline(f, "ln-sep-" + i, X + 68, y + 50, 892, tk.line);
  }

  mkText(f, "about-copy", "© 2026 Koola. Bảo lưu mọi quyền.", X, 736, TY.tiny, tk.faintInk, "Regular", 900, 16, "CENTER");

  return f;
}

function s38SettingsStorage(fx) {
  var tk = L;
  var f = frame("S38 — Cài đặt · Dung lượng", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 8, "Dung lượng & dữ liệu");

  // Thanh dung lượng
  var card = rect(f, "stor-card", X, 104, 980, 240, tk.panel, 20);
  hairline(card, tk.line);

  mkText(f, "stor-title", "Dữ liệu đã dùng", X + 32, 128, TY.label, tk.ink, "Bold", 400, 20);
  mkText(f, "stor-total", "486 MB / 2 GB", X + 32, 154, TY.title, tk.ink, "Bold", 300, 32);
  mkText(f, "stor-pct", "24%", X + 912, 154, TY.body, tk.muted, "Bold", 36, 20, "RIGHT");

  // Thanh phân đoạn
  var barY = 208, barW = 916;
  rect(f, "stor-bar-bg", X + 32, barY, barW, 12, tk.line, 8);
  var segs = [
    { w: 0.42, c: tk.primary, lb: "Ảnh & video", v: "204 MB" },
    { w: 0.28, c: tk.accent, lb: "Tệp", v: "136 MB" },
    { w: 0.18, c: tk.successStrong, lb: "Tin nhắn", v: "88 MB" },
    { w: 0.12, c: tk.muted, lb: "Bộ nhớ đệm", v: "58 MB" },
  ];
  var segX = X + 32;
  for (var s = 0; s < segs.length; s++) {
    var w = Math.round(barW * segs[s].w);
    var seg = rect(f, "stor-seg-" + s, segX, barY, w, 12, segs[s].c, s === 0 ? 6 : 0);
    // bo góc phải cho đoạn cuối
    if (s === segs.length - 1) seg.cornerRadius = 6;
    segX += w;
  }

  // Chú giải
  var ly = 246;
  for (var l = 0; l < segs.length; l++) {
    var lx = X + 32 + (l % 2) * 460;
    var row = Math.floor(l / 2);
    var yy = ly + row * 44;
    circle(f, "stor-dot-" + l, lx, yy + 6, 10, segs[l].c);
    mkText(f, "stor-lb-" + l, segs[l].lb, lx + 20, yy, TY.caption, tk.ink, "Regular", 200, 18);
    mkText(f, "stor-v-" + l, segs[l].v, lx + 260, yy, TY.caption, tk.muted, "Bold", 100, 18, "RIGHT");
  }

  // Hành động
  mkText(f, "stor-act-title", "Quản lý", X, 384, TY.label, tk.ink, "Bold", 400, 20);

  var acts = [
    { ic: "download", lb: "Tự tải xuống ảnh", sub: "Chỉ khi mở xem", toggle: true, on: false },
    { ic: "trash-2", lb: "Xoá bộ nhớ đệm", sub: "58 MB · an toàn", action: "Xoá" },
    { ic: "archive", lb: "Xoá dữ liệu hội thoại cũ", sub: "Tin nhắn trên 90 ngày", action: "Chọn" },
  ];
  var acard = rect(f, "stor-acts", X, 412, 980, acts.length * 76 + 24, tk.panel, 20);
  hairline(acard, tk.line);

  for (var a = 0; a < acts.length; a++) {
    var ay = 436 + a * 76;
    iconCentered(f, "sa-ic-" + a, acts[a].ic, X + 24, ay + 6, 40, 20, tk.muted);
    mkText(f, "sa-lb-" + a, acts[a].lb, X + 76, ay + 2, TY.bodySm, tk.ink, "Bold", 400, 18);
    mkText(f, "sa-sub-" + a, acts[a].sub, X + 76, ay + 24, TY.tiny, tk.muted, "Regular", 400, 16);
    if (acts[a].toggle) {
      toggle(f, "sa-tg-" + a, X + 916, ay + 10, acts[a].on, tk);
    } else {
      mkText(f, "sa-act-" + a, acts[a].action, X + 916, ay + 14, TY.caption, tk.primary, "Bold", 40, 18, "RIGHT");
    }
    if (a < acts.length - 1) hline(f, "sa-sep-" + a, X + 76, ay + 62, 884, tk.line);
  }

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S39 — RESPONSIVE 1280
// ═══════════════════════════════════════════════════════════════════════════

function s39Responsive(fx) {
  var tk = L;
  var f = frame("S39 — Responsive 1280", fx, tk.canvas);
  f.resize(1280, 800);

  // Bố cục hẹp: rail 64 + list 300 + chat
  var RW = 64, LW = 300, LE = RW + LW;
  rect(f, "rail", 0, 0, RW, 800, tk.railBg, 0);

  circle(f, "rail-me-bg", 10, 14, 44, tk.white);
  markOrWarn(f, "rail-me", 17, 21, 30);
  rect(f, "rail-div-1", 14, 76, 36, 1, tk.railDivider, 0, 0.22);
  rect(f, "rail-active", 10, 94, 44, 44, tk.white, 6, tk.railActiveAlpha);
  iconCentered(f, "rail-chat", "message-circle", 10, 94, 44, 24, tk.railInk);
  iconCentered(f, "rail-contacts", "users", 10, 146, 44, 24, tk.railInkDim);
  circle(f, "rail-badge", 38, 88, 20, tk.railBadge);
  mkText(f, "rail-badge-t", "5", 38, 91, TY.micro, tk.white, "Bold", 20, 14, "CENTER");
  rect(f, "rail-div-2", 14, 664, 36, 1, tk.railDivider, 0, 0.22);
  iconCentered(f, "rail-settings", "settings", 10, 682, 44, 24, tk.railInkDim);
  iconCentered(f, "rail-logout", "log-out", 10, 744, 44, 24, tk.railInkDim);

  // Danh sách hẹp 300
  rect(f, "list-panel", RW, 0, LW, 800, tk.panel, 0);
  vline(f, "list-edge", LE, 0, 800, tk.line);
  mkText(f, "list-title", "Trò chuyện", 84, 24, TY.heading, tk.ink, "Bold", 200, 26);
  iconButton(f, "list-add", "plus", LE - 20 - 40, 18, 40, tk.primarySoft, tk.primaryDark);

  strokeRect(f, "search", 84, 72, LW - 40, 40, tk.surface, R.pill, tk.line);
  lucide(f, "search-ic", "search", 98, 82, 20, tk.faint);
  mkText(f, "search-ph", "Tìm kiếm", 126, 82, TY.bodySm, tk.faintInk, "Regular", 180, 18);

  chip(f, "chip-0", "Tất cả", 84, 128, 70, true, tk);
  chip(f, "chip-1", "Chưa đọc", 162, 128, 86, false, tk);

  for (var i = 0; i < 6; i++) {
    var ry = 180 + i * 70;
    var d = CONVS[i];
    if (d.active) rect(f, "row-active-" + d.id, 76, ry, LW - 16, 70, tk.primarySoft, 10, 0.6);
    rect(f, "ava-" + d.id, 84, ry + 12, 44, 44, tk.primarySoft, 24);
    mkText(f, "row-name-" + d.id, d.name, 138, ry + 12, TY.label, tk.ink, "Bold", 130, 18);
    mkText(f, "row-prev-" + d.id, d.preview, 138, ry + 34, TY.caption, tk.muted, "Regular", 140, 16);
    if (d.unread) {
      circle(f, "row-badge-" + d.id, LE - 34, ry + 38, 20, tk.primary);
      mkText(f, "row-badge-t-" + d.id, d.unread, LE - 34, ry + 41, TY.micro, tk.white, "Bold", 20, 14, "CENTER");
    }
  }

  // Chat
  var A = LE;
  var AW = 1280 - LE;
  rect(f, "header", A, 0, AW, 68, tk.panel, 0);
  hline(f, "header-line", A, 67, AW, tk.line);
  rect(f, "header-ava", A + 20, 12, 44, 44, tk.primarySoft, 24);
  circle(f, "header-dot", A + 52, 44, 12, tk.online);
  mkText(f, "header-name", "An Nguyễn", A + 76, 16, TY.label, tk.ink, "Bold", 300, 18);
  mkText(f, "header-status", "Đang hoạt động", A + 76, 38, TY.tiny, tk.accentInk, "Regular", 300, 16);

  // Panel phải bị ẩn ở 1280 — nút info mở dạng overlay
  iconButton(f, "h-info", "info", 1280 - 20 - 40, 14, 40, tk.surface, tk.ink);
  iconButton(f, "h-video", "video", 1280 - 20 - 88, 14, 40, tk.surface, tk.ink);
  iconButton(f, "h-call", "phone", 1280 - 20 - 136, 14, 40, tk.surface, tk.ink);

  strokeRect(f, "bub-a", A + 56, 110, 280, 44, tk.bubbleOther, 16, tk.bubbleBorder);
  mkText(f, "msg-a", "Cậu xem file giúp mình nhé", A + 74, 122, TY.bodySm, tk.ink, "Regular", 244, 20);
  rect(f, "bub-b", 1280 - 20 - 280, 164, 280, 44, tk.primary, 16);
  mkText(f, "msg-b", "Ok, mình xem ngay", 1280 - 20 - 262, 176, TY.bodySm, tk.white, "Regular", 240, 20);

  // Composer
  rect(f, "composer", A, 720, AW, 80, tk.panel, 0);
  hline(f, "composer-line", A, 720, AW, tk.line);
  var S = 48;
  var sendX = 1280 - 20 - S;
  strokeRect(f, "composer-input", A + 20, 736, sendX - 16 - (A + 20), 48, tk.surface, R.pill, tk.line);
  lucide(f, "ic-attach", "paperclip", A + 36, 749, 20, tk.faint);
  mkText(f, "composer-ph", "Nhắn tin…", A + 66, 750, TY.bodySm, tk.faintInk, "Regular", 400, 18);
  circle(f, "send-btn", sendX, 736, S, tk.primary);
  iconCentered(f, "send-ic", "send", sendX, 736, S, 20, tk.white);

  // Chú thích quy tắc
  caption(f, "1280: rail 64 · list 300 · info panel ẩn (mở overlay) · sẵn sàng hạ xuống 1024", A + 20, 200, 700, tk);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S40 — COMPONENT SET (variant thật, xuất hiện trong Assets panel)
// ═══════════════════════════════════════════════════════════════════════════

// Tạo 1 component set từ danh sách variant. Mỗi variant tự vẽ nội dung.
function componentSet(parent, name, x, y, tk, variants) {
  mkText(parent, "cs-lbl-" + name, name, x, y, TY.bodySm, tk.ink, "Bold", 420, 18);

  var comps = [];
  for (var i = 0; i < variants.length; i++) {
    var v = variants[i];
    var c = figma.createComponent();
    c.name = v.props;
    c.fills = [];
    c.resize(v.w, v.h);
    parent.appendChild(c);
    c.x = 0;
    c.y = i * (v.h + 16);
    v.draw(c);
    comps.push(c);
  }

  if (typeof figma.combineAsVariants === "function") {
    try {
      var set = figma.combineAsVariants(comps, parent);
      set.name = name;
      set.x = x;
      set.y = y + 24;
      return set;
    } catch (e) { /* giữ component rời */ }
  }
  // Fallback: xếp dọc thủ công.
  var cy = y + 24;
  for (var k = 0; k < comps.length; k++) {
    comps[k].x = x;
    comps[k].y = cy;
    cy += variants[k].h + 16;
  }
  return null;
}

// Bọc try/catch: nếu môi trường không cho tạo component, khung vẫn vẽ xong.
function safeSet(parent, name, x, y, tk, variants) {
  try {
    return componentSet(parent, name, x, y, tk, variants);
  } catch (e) {
    mkText(parent, "cs-err-" + name, name + ": " + e.message, x, y, TY.tiny, tk.dangerInk, "Regular", 420, 16);
    return null;
  }
}

function s40Components(fx) {
  var tk = L;
  var f = frame("S40 — Component set", fx, tk.canvas);
  f.resize(2200, 1980);

  // ── Tiêu đề ────────────────────────────────────────────────────────────
  mkText(f, "cs-title", "Thư viện component", 48, 30, TY.display, tk.ink, "Bold", 1000, 40);
  mkText(f, "cs-sub",
    "Component thật — kéo từ Assets panel (⌥⌘K) vào bất kỳ frame nào, đổi variant bằng panel phải.",
    48, 76, TY.bodySm, tk.muted, "Regular", 1800, 20);

  // Dấu hiệu nhận diện: thanh ba màu logo dưới tiêu đề.
  rect(f, "cs-brand-a", 48, 110, 32, 4, tk.brandRed, 2);
  rect(f, "cs-brand-b", 84, 110, 32, 4, tk.tiffany700, 2);
  rect(f, "cs-brand-c", 120, 110, 32, 4, tk.brandGreen, 2);

  var COLS = [48, 588, 1128, 1668];
  var COL_W = 500;

  function colHead(i, title, count) {
    mkText(f, "cs-h-" + i, title, COLS[i], 148, TY.bodySm, tk.ink, "Bold", 300, 18);
    mkText(f, "cs-hc-" + i, count + " bộ", COLS[i] + 300, 148, TY.tiny, tk.faintInk, "Regular", 160, 18, "RIGHT");
  }
  colHead(0, "Nhận diện", 4);
  colHead(1, "Hành động", 3);
  colHead(2, "Tin nhắn", 4);
  colHead(3, "Danh sách & hệ thống", 6);

  // ══════════════════════════════════════════════════════════════════════
  // CỘT 1 — NHẬN DIỆN
  // ══════════════════════════════════════════════════════════════════════
  var y1 = 180;

  // ── BrandMark: vòng ba cung đỏ–xanh–lá, dấu hiệu riêng của Koola ──────
  safeSet(f, "BrandMark", COLS[0], y1, tk, [
    { props: "Size=48", w: 48, h: 48, draw: function (c) {
        arc(c, "a-red", 0, 0, 48, 0, 90, L.brandRed);
        arc(c, "a-blue", 0, 0, 48, 120, 210, L.brandBlue);
        arc(c, "a-green", 0, 0, 48, 240, 330, L.brandGreen);
      } },
    { props: "Size=32", w: 32, h: 32, draw: function (c) {
        arc(c, "a-red", 0, 0, 32, 0, 90, L.brandRed);
        arc(c, "a-blue", 0, 0, 32, 120, 210, L.brandBlue);
        arc(c, "a-green", 0, 0, 32, 240, 330, L.brandGreen);
      } },
    { props: "Size=24", w: 24, h: 24, draw: function (c) {
        arc(c, "a-red", 0, 0, 24, 0, 90, L.brandRed);
        arc(c, "a-blue", 0, 0, 24, 120, 210, L.brandBlue);
        arc(c, "a-green", 0, 0, 24, 240, 330, L.brandGreen);
      } },
    { props: "Size=48, Tone=Mono", w: 48, h: 48, draw: function (c) {
        arc(c, "a-red", 0, 0, 48, 0, 90, L.ink);
        arc(c, "a-blue", 0, 0, 48, 120, 210, L.ink);
        arc(c, "a-green", 0, 0, 48, 240, 330, L.ink);
      } },
  ]);
  y1 += 4 * (48 + 16) + 24 + 40;

  // ── BrandSignature: thanh ba màu — dùng cho header, rail active, tab ────
  safeSet(f, "BrandSignature", COLS[0], y1, tk, [
    { props: "Kind=Bar, Width=96", w: 96, h: 4, draw: function (c) {
        rect(c, "s1", 0, 0, 32, 4, L.brandRed, 2);
        rect(c, "s2", 32, 0, 32, 4, L.tiffany700, 2);
        rect(c, "s3", 64, 0, 32, 4, L.brandGreen, 2);
      } },
    { props: "Kind=Bar, Width=48", w: 48, h: 3, draw: function (c) {
        rect(c, "s1", 0, 0, 16, 3, L.brandRed, 2);
        rect(c, "s2", 16, 0, 16, 3, L.tiffany700, 2);
        rect(c, "s3", 32, 0, 16, 3, L.brandGreen, 2);
      } },
    { props: "Kind=Edge", w: 4, h: 44, draw: function (c) {
        rect(c, "s1", 0, 0, 4, 15, L.brandRed, 2);
        rect(c, "s2", 0, 15, 4, 15, L.tiffany700, 2);
        rect(c, "s3", 0, 30, 4, 14, L.brandGreen, 2);
      } },
    { props: "Kind=Ring", w: 48, h: 48, draw: function (c) {
        arc(c, "a-red", 0, 0, 48, 0, 90, L.brandRed);
        arc(c, "a-blue", 0, 0, 48, 120, 210, L.brandBlue);
        arc(c, "a-green", 0, 0, 48, 240, 330, L.brandGreen);
      } },
  ]);
  y1 += 4 * (48 + 16) + 24 + 40;

  // ── Avatar ─────────────────────────────────────────────────────────────
  safeSet(f, "Avatar", COLS[0], y1, tk, [
    { props: "Size=48, Status=Online", w: 48, h: 48, draw: function (c) {
        circle(c, "bg", 0, 0, 48, L.primarySoft);
        mkText(c, "t", "A", 0, 14, TY.label, L.primaryDark, "Bold", 48, 20, "CENTER");
        circle(c, "ring", 34, 34, 16, L.panel);
        circle(c, "dot", 36, 36, 12, L.brandGreen);
      } },
    { props: "Size=48, Status=Offline", w: 48, h: 48, draw: function (c) {
        circle(c, "bg", 0, 0, 48, L.primarySoft);
        mkText(c, "t", "A", 0, 14, TY.label, L.primaryDark, "Bold", 48, 20, "CENTER");
      } },
    { props: "Size=40, Status=Online", w: 40, h: 40, draw: function (c) {
        circle(c, "bg", 0, 0, 40, L.primarySoft);
        mkText(c, "t", "A", 0, 10, TY.bodySm, L.primaryDark, "Bold", 40, 20, "CENTER");
        circle(c, "ring", 28, 28, 14, L.panel);
        circle(c, "dot", 30, 30, 10, L.brandGreen);
      } },
    { props: "Size=32, Status=Group", w: 32, h: 32, draw: function (c) {
        circle(c, "bg", 0, 0, 32, L.primarySoft);
        iconCentered(c, "ic", "users", 0, 0, 32, 16, L.primary);
      } },
  ]);
  y1 += 4 * (48 + 16) + 24 + 40;

  // ── Badge ──────────────────────────────────────────────────────────────
  safeSet(f, "Badge", COLS[0], y1, tk, [
    { props: "Tone=Brand, Value=2", w: 22, h: 22, draw: function (c) {
        circle(c, "bg", 0, 0, 22, L.brandRed);
        mkText(c, "t", "2", 0, 3, TY.tiny, L.white, "Bold", 22, 16, "CENTER");
      } },
    { props: "Tone=Primary, Value=5", w: 22, h: 22, draw: function (c) {
        circle(c, "bg", 0, 0, 22, L.primary);
        mkText(c, "t", "5", 0, 3, TY.tiny, L.white, "Bold", 22, 16, "CENTER");
      } },
    { props: "Tone=Primary, Value=99+", w: 34, h: 20, draw: function (c) {
        rect(c, "bg", 0, 0, 34, 20, L.primary, R.pill);
        mkText(c, "t", "99+", 0, 2, TY.micro, L.white, "Bold", 34, 16, "CENTER");
      } },
    { props: "Tone=Success, Value=Online", w: 52, h: 20, draw: function (c) {
        rect(c, "bg", 0, 0, 52, 20, L.accentSoft, R.pill);
        mkText(c, "t", "Online", 0, 3, TY.micro, L.accentInk, "Bold", 52, 14, "CENTER");
      } },
  ]);
  y1 += 4 * (48 + 16) + 24 + 40;

  // ── Chip ───────────────────────────────────────────────────────────────
  safeSet(f, "Chip", COLS[0], y1, tk, [
    { props: "State=Active", w: 76, h: 36, draw: function (c) {
        var bg = rect(c, "bg", 0, 0, 76, 36, L.primary, R.pill);
        shadowL(bg, "glow");
        mkText(c, "t", "Tất cả", 0, 8, TY.bodySm, L.white, "Bold", 76, 20, "CENTER");
      } },
    { props: "State=Default", w: 96, h: 36, draw: function (c) {
        rect(c, "bg", 0, 0, 96, 36, L.surface, R.pill);
        mkText(c, "t", "Chưa đọc", 0, 8, TY.bodySm, L.muted, "Regular", 96, 20, "CENTER");
      } },
    { props: "State=Hover", w: 68, h: 36, draw: function (c) {
        rect(c, "bg", 0, 0, 68, 36, L.iconWell, R.pill);
        mkText(c, "t", "Nhóm", 0, 8, TY.bodySm, L.ink, "Regular", 68, 20, "CENTER");
      } },
  ]);

  // ══════════════════════════════════════════════════════════════════════
  // CỘT 2 — HÀNH ĐỘNG
  // ══════════════════════════════════════════════════════════════════════
  var y2 = 180;

  // ── PrimaryButton: nhãn căn giữa nút, icon dóng mép phải ───────────────
  safeSet(f, "PrimaryButton", COLS[1], y2, tk, [
    { props: "State=Default, Size=Large", w: 360, h: 54, draw: function (c) {
        var bg = rect(c, "bg", 0, 0, 360, 54, L.primary, R.sm);
        shadowL(bg, "glow");
        mkText(c, "t", "Đăng nhập", 0, 17, TY.label, L.white, "Bold", 360, 20, "CENTER");
        iconCentered(c, "ic", "arrow-right", 316, 0, 54, 18, L.white);
      } },
    { props: "State=Default, Size=Small", w: 160, h: 44, draw: function (c) {
        var bg = rect(c, "bg", 0, 0, 160, 44, L.primary, R.sm);
        shadowL(bg, "glow");
        mkText(c, "t", "Gửi", 0, 12, TY.bodySm, L.white, "Bold", 160, 20, "CENTER");
      } },
    { props: "State=Loading, Size=Large", w: 360, h: 54, draw: function (c) {
        rect(c, "bg", 0, 0, 360, 54, L.primary, R.sm);
        circle(c, "spin", 156, 15, 24, L.white, 0.28);
        mkText(c, "t", "Đang gửi…", 0, 17, TY.label, L.white, "Bold", 360, 20, "CENTER");
      } },
    { props: "State=Disabled, Size=Large", w: 360, h: 54, draw: function (c) {
        rect(c, "bg", 0, 0, 360, 54, L.line, R.sm);
        mkText(c, "t", "Đăng nhập", 0, 17, TY.label, L.faintInk, "Bold", 360, 20, "CENTER");
      } },
    { props: "State=Danger, Size=Large", w: 360, h: 54, draw: function (c) {
        var bg = rect(c, "bg", 0, 0, 360, 54, L.danger, R.sm);
        shadowL(bg, "glow");
        mkText(c, "t", "Xoá tài khoản", 0, 17, TY.label, L.white, "Bold", 360, 20, "CENTER");
      } },
  ]);
  y2 += 5 * (54 + 16) + 24 + 40;

  // ── IconButton ─────────────────────────────────────────────────────────
  safeSet(f, "IconButton", COLS[1], y2, tk, [
    { props: "State=Default", w: 40, h: 40, draw: function (c) {
        rect(c, "bg", 0, 0, 40, 40, L.surface, 14);
        iconCentered(c, "ic", "phone", 0, 0, 40, 20, L.ink);
      } },
    { props: "State=Hover", w: 40, h: 40, draw: function (c) {
        rect(c, "bg", 0, 0, 40, 40, L.iconWell, 14);
        iconCentered(c, "ic", "phone", 0, 0, 40, 20, L.primaryDark);
      } },
    { props: "State=Active", w: 40, h: 40, draw: function (c) {
        rect(c, "bg", 0, 0, 40, 40, L.primary, 14);
        iconCentered(c, "ic", "phone", 0, 0, 40, 20, L.white);
      } },
    { props: "State=Disabled", w: 40, h: 40, draw: function (c) {
        rect(c, "bg", 0, 0, 40, 40, L.surface, 14);
        iconCentered(c, "ic", "phone", 0, 0, 40, 20, L.faint);
      } },
  ]);
  y2 += 4 * (40 + 16) + 24 + 40;

  // ── Toggle ─────────────────────────────────────────────────────────────
  safeSet(f, "Toggle", COLS[1], y2, tk, [
    { props: "State=On", w: 52, h: 30, draw: function (c) {
        rect(c, "track", 0, 0, 52, 30, L.primary, R.pill);
        circle(c, "knob", 24, 4, 22, L.white);
      } },
    { props: "State=Off", w: 52, h: 30, draw: function (c) {
        rect(c, "track", 0, 0, 52, 30, L.line, R.pill);
        circle(c, "knob", 4, 4, 22, L.white);
      } },
  ]);

  // ══════════════════════════════════════════════════════════════════════
  // CỘT 3 — TIN NHẮN
  // ══════════════════════════════════════════════════════════════════════
  var y3 = 180;

  // ── ChatBubble: góc phía người gửi vuông 4px (nhóm tin) ────────────────
  safeSet(f, "ChatBubble", COLS[2], y3, tk, [
    { props: "Owner=Mine, Kind=Text", w: 280, h: 44, draw: function (c) {
        corners(rect(c, "bg", 0, 0, 280, 44, L.primary, R.bub), 16, 16, 4, 16);
        mkText(c, "t", "Nội dung tin nhắn", 16, 12, TY.label, L.white, "Regular", 190, 20);
        mkText(c, "time", "10:24", 206, 26, TY.micro, L.white, "Regular", 40, 14, "RIGHT");
        lucide(c, "ticks", "check-check", 250, 26, 16, L.white);
      } },
    { props: "Owner=Other, Kind=Text", w: 280, h: 44, draw: function (c) {
        corners(strokeRect(c, "bg", 0, 0, 280, 44, L.bubbleOther, R.bub, L.bubbleBorder), 16, 16, 16, 4);
        mkText(c, "t", "Nội dung tin nhắn", 16, 12, TY.label, L.ink, "Regular", 190, 20);
        mkText(c, "time", "10:24", 206, 26, TY.micro, L.faintInk, "Regular", 40, 14, "RIGHT");
      } },
    { props: "Owner=Mine, Kind=Reply", w: 280, h: 96, draw: function (c) {
        corners(rect(c, "bg", 0, 0, 280, 96, L.primary, R.bub), 16, 16, 4, 16);
        rect(c, "quote", 12, 12, 256, 44, L.primaryDark, R.xs2);
        rect(c, "accent", 12, 12, 3, 44, L.white, 2);
        mkText(c, "qn", "Bạn", 24, 16, TY.tiny, L.white, "Bold", 200, 14);
        mkText(c, "qt", "Nội dung được trả lời", 24, 33, TY.tiny, L.white, "Regular", 220, 14);
        mkText(c, "t", "Trả lời của tôi", 16, 64, TY.label, L.white, "Regular", 220, 20);
      } },
    { props: "Owner=Other, Kind=Reply", w: 280, h: 96, draw: function (c) {
        corners(strokeRect(c, "bg", 0, 0, 280, 96, L.bubbleOther, R.bub, L.bubbleBorder), 16, 16, 16, 4);
        rect(c, "quote", 12, 12, 256, 44, L.surface, R.xs2);
        rect(c, "accent", 12, 12, 3, 44, L.brandGreen, 2);
        mkText(c, "qn", "An Nguyễn", 24, 16, TY.tiny, L.accentInk, "Bold", 200, 14);
        mkText(c, "qt", "Nội dung được trả lời", 24, 33, TY.tiny, L.muted, "Regular", 220, 14);
        mkText(c, "t", "Trả lời của họ", 16, 64, TY.label, L.ink, "Regular", 220, 20);
      } },
  ]);
  y3 += 4 * (96 + 16) + 24 + 40;

  // ── ReactionPill ───────────────────────────────────────────────────────
  safeSet(f, "ReactionPill", COLS[2], y3, tk, [
    { props: "State=Other", w: 88, h: 30, draw: function (c) {
        strokeRect(c, "bg", 0, 0, 88, 30, L.panel, 15, L.line);
        mkText(c, "e1", "❤️", 10, 5, TY.label, L.ink, "Regular", 20, 18);
        mkText(c, "n1", "2", 32, 7, TY.tiny, L.muted, "Bold", 12, 16);
        mkText(c, "e2", "👍", 48, 5, TY.label, L.ink, "Regular", 20, 18);
        mkText(c, "n2", "1", 70, 7, TY.tiny, L.muted, "Bold", 12, 16);
      } },
    { props: "State=Mine", w: 72, h: 30, draw: function (c) {
        strokeRect(c, "bg", 0, 0, 72, 30, L.primarySoft, 15, L.primary);
        mkText(c, "e1", "❤️", 10, 5, TY.label, L.ink, "Regular", 20, 18);
        mkText(c, "n1", "1", 32, 7, TY.tiny, L.primaryDark, "Bold", 12, 16);
      } },
    { props: "State=Add", w: 36, h: 30, draw: function (c) {
        strokeRect(c, "bg", 0, 0, 36, 30, L.panel, 15, L.line);
        iconCentered(c, "ic", "smile-plus", 0, 0, 36, 16, L.muted);
      } },
  ]);
  y3 += 3 * (30 + 16) + 24 + 40;

  // ── Composer: 4 trạng thái ─────────────────────────────────────────────
  safeSet(f, "Composer", COLS[2], y3, tk, [
    { props: "State=Empty", w: 460, h: 56, draw: function (c) {
        strokeRect(c, "bg", 0, 0, 460, 56, L.surface, R.pill, L.line);
        iconCentered(c, "att", "paperclip", 14, 0, 56, 20, L.faint);
        mkText(c, "ph", "Nhắn tin…", 48, 18, TY.label, L.faintInk, "Regular", 300, 20);
        iconCentered(c, "sm", "smile", 414, 0, 56, 20, L.faint);
      } },
    { props: "State=Typing", w: 460, h: 56, draw: function (c) {
        var bg = strokeRect(c, "bg", 0, 0, 460, 56, L.surface, R.pill, L.primary);
        bg.strokeWeight = 2;
        iconCentered(c, "att", "paperclip", 14, 0, 56, 20, L.muted);
        mkText(c, "txt", "Mình vừa xem xong", 48, 18, TY.label, L.ink, "Regular", 300, 20);
        rect(c, "caret", 208, 16, 2, 24, L.primary, 1);
        iconCentered(c, "sm", "smile", 414, 0, 56, 20, L.muted);
      } },
    { props: "State=Reply", w: 460, h: 120, draw: function (c) {
        rect(c, "rp", 0, 0, 460, 52, L.surface, R.sm);
        rect(c, "rp-bar", 0, 0, 3, 52, L.brandGreen, 2);
        iconCentered(c, "rp-ic", "reply", 14, 17, 18, 14, L.accentInk);
        mkText(c, "rp-n", "An Nguyễn", 40, 9, TY.tiny, L.accentInk, "Bold", 260, 14);
        mkText(c, "rp-t", "Cậu xem giúp mình nhé", 40, 27, TY.caption, L.muted, "Regular", 360, 16);
        lucide(c, "rp-x", "x", 424, 17, 18, L.muted);
        strokeRect(c, "bg", 0, 64, 460, 56, L.surface, R.pill, L.line);
        iconCentered(c, "att", "paperclip", 14, 64, 56, 20, L.muted);
        mkText(c, "txt", "Mình xem rồi nhé", 48, 82, TY.label, L.ink, "Regular", 300, 20);
        iconCentered(c, "sm", "smile", 414, 64, 56, 20, L.muted);
      } },
    { props: "State=Attached", w: 460, h: 128, draw: function (c) {
        strokeRect(c, "ap", 0, 0, 220, 60, L.panel, R.sm, L.line);
        rect(c, "ap-th", 8, 8, 44, 44, L.iconWell, R.xs);
        iconCentered(c, "ap-ic", "image", 8, 8, 44, 20, L.muted);
        mkText(c, "ap-n", "koola-v2.png", 60, 12, TY.caption, L.ink, "Bold", 120, 16);
        mkText(c, "ap-s", "2,4 MB · PNG", 60, 30, TY.tiny, L.muted, "Regular", 120, 14);
        strokeRect(c, "bg", 0, 72, 460, 56, L.surface, R.pill, L.line);
        iconCentered(c, "att", "paperclip", 14, 72, 56, 20, L.muted);
        mkText(c, "ph", "Thêm tin nhắn…", 48, 90, TY.label, L.faintInk, "Regular", 300, 20);
        iconCentered(c, "sm", "smile", 414, 72, 56, 20, L.muted);
      } },
  ]);
  y3 += 4 * (128 + 16) + 24 + 40;

  // ── Toast ──────────────────────────────────────────────────────────────
  safeSet(f, "Toast", COLS[2], y3, tk, [
    { props: "Tone=Success", w: 384, h: 60, draw: function (c) {
        rect(c, "bg", 0, 0, 384, 60, L.panel, R.md);
        rect(c, "bar", 0, 12, 3, 36, L.brandGreen, 2);
        circle(c, "icbg", 18, 12, 36, L.accentSoft);
        iconCentered(c, "ic", "check", 18, 12, 36, 20, L.accentInk);
        mkText(c, "t", "Đã gửi tin nhắn", 66, 20, TY.bodySm, L.ink, "Bold", 240, 18);
        lucide(c, "x", "x", 344, 20, 20, L.faint);
      } },
    { props: "Tone=Error", w: 384, h: 76, draw: function (c) {
        rect(c, "bg", 0, 0, 384, 76, L.panel, R.md);
        rect(c, "bar", 0, 12, 3, 52, L.brandRed, 2);
        circle(c, "icbg", 18, 20, 36, L.dangerSoft);
        iconCentered(c, "ic", "circle-alert", 18, 20, 36, 20, L.dangerInk);
        mkText(c, "t", "Không gửi được ảnh", 66, 16, TY.bodySm, L.ink, "Bold", 210, 18);
        mkText(c, "s", "Tệp vượt quá 25 MB", 66, 36, TY.caption, L.muted, "Regular", 210, 16);
        mkText(c, "act", "Thử lại", 296, 29, TY.caption, L.dangerInk, "Bold", 64, 18, "RIGHT");
      } },
    { props: "Tone=Info", w: 384, h: 60, draw: function (c) {
        rect(c, "bg", 0, 0, 384, 60, L.panel, R.md);
        rect(c, "bar", 0, 12, 3, 36, L.tiffany700, 2);
        circle(c, "icbg", 18, 12, 36, L.primarySoft);
        iconCentered(c, "ic", "info", 18, 12, 36, 20, L.primaryDark);
        mkText(c, "t", "Đã sao chép liên kết", 66, 20, TY.bodySm, L.ink, "Bold", 240, 18);
        lucide(c, "x", "x", 344, 20, 20, L.faint);
      } },
    { props: "Tone=Undo", w: 384, h: 76, draw: function (c) {
        rect(c, "bg", 0, 0, 384, 76, L.panel, R.md);
        rect(c, "bar", 0, 12, 3, 52, L.warnInk, 2);
        circle(c, "icbg", 18, 20, 36, L.warnSoft);
        iconCentered(c, "ic", "undo", 18, 20, 36, 20, L.warnInk);
        mkText(c, "t", "Đã xoá hội thoại", 66, 16, TY.bodySm, L.ink, "Bold", 200, 18);
        mkText(c, "s", "Hoàn tác trong 5 giây", 66, 36, TY.caption, L.muted, "Regular", 200, 16);
        mkText(c, "act", "Hoàn tác", 288, 29, TY.caption, L.warnInk, "Bold", 72, 18, "RIGHT");
      } },
  ]);

  // ══════════════════════════════════════════════════════════════════════
  // CỘT 4 — DANH SÁCH & HỆ THỐNG
  // ══════════════════════════════════════════════════════════════════════
  var y4 = 180;

  // ── ConversationRow: hàng active có vạch ba màu (dấu hiệu Koola) ──────
  function convDraw(state) {
    return function (c) {
      var active = state === "Active";
      if (active) {
        rect(c, "row-bg", 0, 0, 340, 76, L.primarySoft, R.md, 0.55);
        // Vạch nhận diện: ba màu logo, không dùng màu đơn.
        rect(c, "sig-1", 0, 16, 3, 15, L.brandRed, 2);
        rect(c, "sig-2", 0, 31, 3, 15, L.tiffany700, 2);
        rect(c, "sig-3", 0, 46, 3, 14, L.brandGreen, 2);
      }
      circle(c, "ava", 16, 14, 48, L.primarySoft);
      mkText(c, "ini", "A", 16, 28, TY.label, L.primaryDark, "Bold", 48, 20, "CENTER");
      circle(c, "ava-ring", 48, 48, 16, active ? L.primarySoft : L.panel);
      circle(c, "ava-dot", 50, 50, 12, L.brandGreen);

      mkText(c, "name", "An Nguyễn", 76, 14, TY.body, L.ink, "Bold", 168, 20);
      mkText(c, "prev", "Đã gửi file thiết kế", 76, 38, TY.bodySm,
        state === "Unread" ? L.ink : L.muted,
        state === "Unread" ? "Bold" : "Regular", 180, 18);

      if (state === "Menu") {
        iconButton(c, "menu", "ellipsis", 296, 10, 28, L.surface, L.muted);
      } else {
        mkText(c, "time", "10:24", 268, 15, TY.tiny, L.faintInk, "Regular", 56, 16, "RIGHT");
      }
      if (state === "Pinned") lucide(c, "pin", "pin", 310, 16, 16, L.faint);

      if (state === "Unread") {
        circle(c, "badge", 302, 44, 22, L.brandRed);
        mkText(c, "badge-t", "2", 302, 47, TY.tiny, L.white, "Bold", 22, 16, "CENTER");
      } else if (state === "Default") {
        lucide(c, "ticks", "check-check", 314, 46, 16, L.faint);
      }
    };
  }

  safeSet(f, "ConversationRow", COLS[3], y4, tk, [
    { props: "State=Default", w: 340, h: 76, draw: convDraw("Default") },
    { props: "State=Unread", w: 340, h: 76, draw: convDraw("Unread") },
    { props: "State=Active", w: 340, h: 76, draw: convDraw("Active") },
    { props: "State=Pinned", w: 340, h: 76, draw: convDraw("Pinned") },
    { props: "State=Menu", w: 340, h: 76, draw: convDraw("Menu") },
  ]);
  y4 += 5 * (76 + 16) + 24 + 40;

  // ── TypingDots ─────────────────────────────────────────────────────────
  safeSet(f, "TypingDots", COLS[3], y4, tk, [
    { props: "Tone=Other", w: 64, h: 34, draw: function (c) {
        strokeRect(c, "bg", 0, 0, 64, 34, L.bubbleOther, R.bub, L.bubbleBorder);
        circle(c, "d1", 16, 14, 7, L.faint);
        circle(c, "d2", 28, 14, 7, L.faint);
        circle(c, "d3", 40, 14, 7, L.faint);
      } },
    { props: "Tone=Mine", w: 64, h: 34, draw: function (c) {
        rect(c, "bg", 0, 0, 64, 34, L.primary, R.bub);
        circle(c, "d1", 16, 14, 7, L.white, 0.65);
        circle(c, "d2", 28, 14, 7, L.white, 0.85);
        circle(c, "d3", 40, 14, 7, L.white, 0.65);
      } },
  ]);
  y4 += 2 * (34 + 16) + 24 + 40;

  // ── SkeletonRow ────────────────────────────────────────────────────────
  safeSet(f, "SkeletonRow", COLS[3], y4, tk, [
    { props: "Type=Conversation", w: 340, h: 76, draw: function (c) {
        circle(c, "ava", 16, 14, 48, L.iconWell);
        rect(c, "l1", 76, 22, 150, 12, L.iconWell, 6);
        rect(c, "l2", 76, 44, 210, 10, L.iconWell, 5);
      } },
    { props: "Type=Message", w: 280, h: 44, draw: function (c) {
        rect(c, "b", 0, 0, 280, 44, L.iconWell, R.bub);
      } },
  ]);
  y4 += 2 * (76 + 16) + 24 + 40;

  // ── EmptyState ─────────────────────────────────────────────────────────
  safeSet(f, "EmptyState", COLS[3], y4, tk, [
    { props: "Kind=NoConversation", w: 340, h: 200, draw: function (c) {
        circle(c, "well", 110, 0, 120, L.surface);
        iconCentered(c, "ic", "message-square", 110, 0, 120, 44, L.faint);
        mkText(c, "t", "Chưa có cuộc trò chuyện", 0, 136, TY.heading, L.ink, "Bold", 340, 24, "CENTER");
        mkText(c, "s", "Tìm một người bạn để bắt đầu", 0, 168, TY.caption, L.muted, "Regular", 340, 18, "CENTER");
      } },
    { props: "Kind=NoResults", w: 340, h: 200, draw: function (c) {
        circle(c, "well", 110, 0, 120, L.surface);
        iconCentered(c, "ic", "search", 110, 0, 120, 44, L.faint);
        mkText(c, "t", "Không tìm thấy kết quả", 0, 136, TY.heading, L.ink, "Bold", 340, 24, "CENTER");
        mkText(c, "s", "Thử từ khoá khác", 0, 168, TY.caption, L.muted, "Regular", 340, 18, "CENTER");
      } },
  ]);
  y4 += 2 * (200 + 16) + 24 + 40;

  // ── CallControls: hàng nút trong cuộc gọi ──────────────────────────────
  safeSet(f, "CallControls", COLS[3], y4, tk, [
    { props: "State=Voice", w: 400, h: 64, draw: function (c) {
        var icons = ["mic", "volume-2", "video", "screen-share"];
        for (var i = 0; i < 4; i++) {
          circle(c, "b" + i, i * 80, 0, 64, tk.callChrome);
          iconCentered(c, "i" + i, icons[i], i * 80, 0, 64, 24, tk.callInk);
        }
        circle(c, "end-bg", 336, 0, 64, tk.brandRed);
        iconCentered(c, "end-ic", "phone-off", 336, 0, 64, 24, tk.white);
      } },
    { props: "State=Video", w: 400, h: 64, draw: function (c) {
        var icons = ["mic", "video-off", "screen-share", "ellipsis"];
        for (var i = 0; i < 4; i++) {
          circle(c, "b" + i, i * 80, 0, 64, tk.callChrome);
          iconCentered(c, "i" + i, icons[i], i * 80, 0, 64, 24, tk.callInk);
        }
        circle(c, "end-bg", 336, 0, 64, tk.brandRed);
        iconCentered(c, "end-ic", "phone-off", 336, 0, 64, 24, tk.white);
      } },
    { props: "State=Muted", w: 400, h: 64, draw: function (c) {
        var icons = ["mic-off", "volume-2", "video", "screen-share"];
        for (var i = 0; i < 4; i++) {
          var bg = i === 0 ? L.danger : tk.callChrome;
          circle(c, "b" + i, i * 80, 0, 64, bg);
          iconCentered(c, "i" + i, icons[i], i * 80, 0, 64, 24, tk.white);
        }
        circle(c, "end-bg", 336, 0, 64, tk.brandRed);
        iconCentered(c, "end-ic", "phone-off", 336, 0, 64, 24, tk.white);
      } },
  ]);
  y4 += 3 * (64 + 16) + 24 + 40;

  // ── VideoTile ──────────────────────────────────────────────────────────
  safeSet(f, "VideoTile", COLS[3], y4, tk, [
    { props: "State=Idle", w: 300, h: 180, draw: function (c) {
        rect(c, "bg", 0, 0, 300, 180, tk.callStage, R.md);
        circle(c, "ava", 126, 42, 48, tk.callChrome);
        iconCentered(c, "ava-ic", "users", 126, 42, 48, 22, tk.callInkDim);
        rect(c, "lb-bg", 12, 140, 120, 28, tk.callBg, R.sm, 0.7);
        mkText(c, "nm", "An Nguyễn", 24, 145, TY.tiny, tk.callInk, "Bold", 96, 18);
      } },
    { props: "State=Speaking", w: 300, h: 180, draw: function (c) {
        var bg = rect(c, "bg", 0, 0, 300, 180, tk.callStage, R.md);
        bg.strokes = [{ type: "SOLID", color: hx6(L.brandGreen) }];
        bg.strokeWeight = 2;
        bg.strokeAlign = "INSIDE";
        circle(c, "ava", 126, 42, 48, tk.callChrome);
        iconCentered(c, "ava-ic", "users", 126, 42, 48, 22, tk.callInkDim);
        rect(c, "lb-bg", 12, 140, 120, 28, tk.callBg, R.sm, 0.7);
        mkText(c, "nm", "An Nguyễn", 24, 145, TY.tiny, tk.callInk, "Bold", 96, 18);
      } },
    { props: "State=Muted", w: 300, h: 180, draw: function (c) {
        rect(c, "bg", 0, 0, 300, 180, tk.callStage, R.md);
        circle(c, "ava", 126, 42, 48, tk.callChrome);
        iconCentered(c, "ava-ic", "users", 126, 42, 48, 22, tk.callInkDim);
        rect(c, "lb-bg", 12, 140, 140, 28, tk.callBg, R.sm, 0.7);
        iconCentered(c, "mute", "mic-off", 20, 140, 28, 14, L.danger);
        mkText(c, "nm", "Bình Trần", 48, 145, TY.tiny, tk.callInk, "Bold", 96, 18);
      } },
    { props: "State=Self", w: 300, h: 180, draw: function (c) {
        rect(c, "bg", 0, 0, 300, 180, tk.callChrome, R.md);
        iconCentered(c, "cam", "camera", 110, 60, 80, 32, tk.callInkDim);
        rect(c, "tag", 236, 140, 52, 24, tk.callBg, R.sm, 0.8);
        mkText(c, "tag-t", "Bạn", 236, 143, TY.micro, tk.callInkDim, "Bold", 52, 16, "CENTER");
      } },
  ]);
  y4 += 4 * (180 + 16) + 24;

  // ── Tổng kết ───────────────────────────────────────────────────────────
  var footY = Math.max(y1, y2, y3, y4) + 40;

  hline(f, "cs-foot-line", 48, footY, 2100, tk.line);

  mkText(f, "cs-foot",
    "18 bộ component · 63 variant. Đặt tên 1-1 với file code: BrandMark.tsx · Avatar.tsx · Badge.tsx · Chip.tsx " +
    "· PrimaryButton.tsx · IconButton.tsx · Toggle.tsx · ChatBubble.tsx · ReactionPill.tsx · Composer.tsx · Toast.tsx " +
    "· ConversationRow.tsx · TypingDots.tsx · SkeletonRow.tsx · EmptyState.tsx · CallControls.tsx · VideoTile.tsx",
    48, footY + 16, TY.caption, tk.faintInk, "Regular", 2000, 18);

  mkText(f, "cs-foot2",
    "Chất riêng Koola: BrandMark (vòng ba cung) + BrandSignature (thanh ba màu) điểm xuyết ở hàng đang chọn, " +
    "viền ô đang gõ, và đáy header — thay cho màu nhấn đơn sắc của các app khác.",
    48, footY + 40, TY.caption, tk.muted, "Regular", 2000, 18);

  f.resize(2200, footY + 90);
  return f;
}

// Koola Web — Phần 01: quên mật khẩu · đặt lại mật khẩu
// S41, S42. Dùng helper + token từ code.js (không khai báo lại).

function s41ForgotPassword(fx) {
  var tk = L;
  var f = frame("S41 — Quên mật khẩu", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 32 + authLockupH(true, 156) + 214 + 32;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 34;

  y = authBrandLockup(f, CX, y, tk, "Nhập email hoặc số điện thoại để nhận mã đặt lại.") + 22;

  y = authField(f, tk, "fp-id", "Email hoặc số điện thoại", "ban@koola.chat", y,
    { icon: "mail", placeholder: true }) + 22;

  primaryButton(f, "fp-btn", "Gửi mã đặt lại", X, y, W, 52, tk, { icon: "arrow-right" });
  y += 52 + 16;

  mkText(f, "fp-back", "Quay lại đăng nhập", X, y, TY.caption, tk.primary,
    "Bold", W, 16, "CENTER");
  y += 26;

  mkText(f, "fp-note", "Mã có hiệu lực 10 phút", X, y, TY.tiny,
    tk.faintInk, "Regular", W, 14, "CENTER");
  return f;
}

// Ô OTP: 6 ô 48×56, cách 10. Ô đã nhập viền primary, ô đang gõ có con trỏ.


function s42ResetPassword(fx) {
  var tk = L;
  var f = frame("S42 — Đặt lại mật khẩu", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 30 + authLockupH(true, 156) + 378 + 30;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 30;

  y = authBrandLockup(f, CX, y, tk, "Nhập mã đã gửi tới an.nguyen@koola.chat") + 18;

  y = otpRow(f, tk, "rp", CX, y, 3, 6) + 10;

  // Nhắc gửi lại — text trái, đổi số phải.
  mkText(f, "rp-resend", "Gửi lại mã (00:42)", X, y, TY.tiny, tk.muted, "Regular", 200, 14);
  mkText(f, "rp-change", "Đổi số", X + W - 60, y, TY.tiny, tk.primary, "Bold", 60, 14, "RIGHT");
  y += 26;

  var p1 = authField(f, tk, "rp-p1", "Mật khẩu mới", "••••••••", y,
    { icon: "lock", trailing: "eye-off" });
  y = p1 + 16;

  y = authField(f, tk, "rp-p2", "Nhập lại mật khẩu", "••••••••", y,
    { icon: "lock", trailing: "eye-off" }) + 14;

  // Thanh độ mạnh — 3 đoạn + nhãn.
  var segW = Math.round((W - 24) / 3);
  rect(f, "rp-str-1", X, y, segW, 4, tk.danger, 2);
  rect(f, "rp-str-2", X + segW + 12, y, segW, 4, tk.successStrong, 2);
  rect(f, "rp-str-3", X + (segW + 12) * 2, y, segW, 4, tk.line, 2);
  mkText(f, "rp-str-lb", "Trung bình", X, y + 10, TY.micro, tk.warnInk, "Bold", W, 14, "RIGHT");
  y += 32;

  primaryButton(f, "rp-btn", "Xác nhận", X, y, W, 52, tk, { icon: "check" });
  return f;
}



// Phần 02 — Đăng ký + Xác minh OTP (S43, S44)

// ── S43 · Đăng ký ───────────────────────────────────────────────────────────
function s43Register(fx) {
  var tk = L;
  var f = frame("S43 — Đăng ký", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 28 + authLockupH(true, 156) + 536 + 28;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 30;

  y = authBrandLockup(f, CX, y, tk, "Bắt đầu kết nối mọi nhu cầu") + 16;

  // 3 tab chọn phương thức — căn giữa cụm.
  var tabs = [
    { lb: "Email", w: 96 },
    { lb: "Số điện thoại", w: 124 },
    { lb: "QR", w: 64 },
  ];
  var tabTotal = 0;
  for (var t = 0; t < tabs.length; t++) tabTotal += tabs[t].w + 8;
  tabTotal -= 8;
  var tx = CX - tabTotal / 2;
  for (var t2 = 0; t2 < tabs.length; t2++) {
    chip(f, "rg-tab-" + t2, tabs[t2].lb, tx, y, tabs[t2].w, t2 === 0, tk);
    tx += tabs[t2].w + 8;
  }
  y += 36 + 18;

  var f1 = authField(f, tk, "rg-name", "Họ và tên", "Nguyễn Văn A", y,
    { icon: "users", placeholder: true });
  y = f1 + 14;
  var f2 = authField(f, tk, "rg-mail", "Email", "ban@koola.chat", y,
    { icon: "mail", placeholder: true });
  y = f2 + 14;
  var f3 = authField(f, tk, "rg-p1", "Mật khẩu", "••••••••", y,
    { icon: "lock", trailing: "eye-off" });
  y = f3 + 14;
  y = authField(f, tk, "rg-p2", "Nhập lại mật khẩu", "••••••••", y,
    { icon: "lock", trailing: "eye-off" }) + 16;

  // Checkbox điều khoản.
  var cb = rect(f, "rg-cb", X, y, 20, 20, tk.primary, R.xs2);
  iconCentered(f, "rg-cb-ic", "check", X, y, 20, 12, tk.white);
  mkText(f, "rg-cb-t", "Tôi đồng ý với Điều khoản và Chính sách bảo mật",
    X + 28, y + 1, TY.tiny, tk.ink, "Regular", W - 28, 18);
  y += 42;

  primaryButton(f, "rg-btn", "Tạo tài khoản", X, y, W, 52, tk, { icon: "arrow-right" });
  y += 52 + 16;

  mkText(f, "rg-have", "Đã có tài khoản? Đăng nhập", X, y, TY.caption,
    tk.muted, "Regular", W, 16, "CENTER");
  return f;
}


// ── S44 · Xác minh OTP ──────────────────────────────────────────────────────
function s44VerifyOtp(fx) {
  var tk = L;
  var f = frame("S44 — Xác minh OTP", fx, tk.cream);
  authBackdrop(f, tk, false);

  var H = 384;
  var CY = authCard(f, tk, H);
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 34;

  // Vòng khiên — biểu tượng bảo mật, không lặp lại logo.
  circle(f, "otp-shield-bg", CX - 32, y, 64, tk.primarySoft);
  iconCentered(f, "otp-shield", "shield", CX - 32, y, 64, 28, tk.primary);
  y += 64 + 18;

  mkText(f, "otp-title", "Xác minh số điện thoại", CX - 200, y, TY.title,
    tk.ink, "Bold", 400, 32, "CENTER");
  y += 36;

  mkText(f, "otp-sub", "Nhập mã 6 số đã gửi tới +84 912 345 678",
    CX - 200, y, TY.bodySm, tk.muted, "Regular", 400, 20, "CENTER");
  y += 30;

  y = otpRow(f, tk, "otp", CX, y, 3, 6) + 14;

  mkText(f, "otp-resend", "Không nhận được mã? Gửi lại (00:42)", X, y, TY.tiny,
    tk.muted, "Regular", W, 16, "CENTER");
  y += 24;

  primaryButton(f, "otp-btn", "Xác minh", X, y, W, 52, tk, { icon: "arrow-right" });
  y += 52 + 14;

  mkText(f, "otp-change", "Đổi số điện thoại", X, y, TY.caption,
    tk.primary, "Bold", W, 16, "CENTER");
  return f;
}



// S45 — Xác thực 2 lớp
function s45TwoFactor(fx) {
  var tk = L;
  var f = frame("S45 — Xác thực 2 lớp", fx, tk.canvas);
  var X = settingsScaffold(f, tk, 0, "Xác thực 2 lớp");

  var W = 980;
  var CARD_Y = 104;
  var CARD_H = 132;

  // ── Thẻ trạng thái ──
  var card = rect(f, "tf-status", X, CARD_Y, W, CARD_H, tk.white, 20);
  hairline(card, tk.line);

  var WELL = 56;
  circle(f, "tf-status-well", X + 28, CARD_Y + 38, WELL, tk.accentSoft);
  iconCentered(f, "tf-status-ic", "shield", X + 28, CARD_Y + 38, WELL, 24, tk.accent);

  mkText(f, "tf-status-title", "Đã bật xác thực 2 lớp", X + 104, CARD_Y + 36, TY.body, tk.ink, "Bold", 500, 22);
  mkText(f, "tf-status-sub", "Tài khoản của bạn được bảo vệ bằng ứng dụng xác thực.",
    X + 104, CARD_Y + 62, TY.caption, tk.muted, "Regular", 560, 18);

  rect(f, "tf-off", X + 880, CARD_Y + 44, 72, 36, tk.surface, 10);
  mkText(f, "tf-off-t", "Tắt", X + 880, CARD_Y + 54, TY.caption, tk.dangerInk, "Bold", 72, 17, "CENTER");

  // ── Phương thức xác thực ──
  mkText(f, "tf-method-title", "Phương thức xác thực", X, 268, TY.label, tk.ink, "Bold", 400, 20);

  var ROW_Y = 300;
  var ROW_H = 88;
  var ROW_GAP = 12;
  var ROW_STEP = ROW_H + ROW_GAP;
  var WELL_ICON = 44;
  var RADIO = 24;
  var RADIO_X = X + 936;

  // Hàng 1 — đang chọn
  var y1 = ROW_Y;
  var sel = strokeRect(f, "tf-opt-app", X, y1, W, ROW_H, tk.primarySoft, 16, tk.primary);
  sel.strokeWeight = 2;
  circle(f, "tf-opt-app-well", X + 20, y1 + 22, WELL_ICON, tk.white);
  iconCentered(f, "tf-opt-app-ic", "smartphone", X + 20, y1 + 22, WELL_ICON, 24, tk.primaryDark);
  mkText(f, "tf-opt-app-t", "Ứng dụng xác thực", X + 80, y1 + 24, TY.label, tk.ink, "Bold", 300, 20);
  mkText(f, "tf-opt-app-s", "Google Authenticator · Authy · 1Password",
    X + 80, y1 + 46, TY.tiny, tk.muted, "Regular", 380, 16);
  circle(f, "tf-opt-app-radio", RADIO_X, y1 + 32, RADIO, tk.primary);
  circle(f, "tf-opt-app-dot", RADIO_X + 7, y1 + 32 + 7, 10, tk.white);

  // Hàng 2, 3 — chưa chọn
  var opts = [
    { key: "sms", ic: "message-square", name: "Tin nhắn SMS", sub: "+84 912 **** 678" },
    { key: "mail", ic: "mail", name: "Email dự phòng", sub: "an.n***@koola.chat" },
  ];

  for (var i = 0; i < opts.length; i++) {
    var o = opts[i];
    var y = ROW_Y + ROW_STEP * (i + 1);

    rect(f, "tf-opt-" + o.key, X, y, W, ROW_H, tk.white, 16);
    circle(f, "tf-opt-" + o.key + "-well", X + 20, y + 22, WELL_ICON, tk.surface);
    iconCentered(f, "tf-opt-" + o.key + "-ic", o.ic, X + 20, y + 22, WELL_ICON, 24, tk.muted);
    mkText(f, "tf-opt-" + o.key + "-t", o.name, X + 80, y + 24, TY.label, tk.ink, "Regular", 300, 20);
    mkText(f, "tf-opt-" + o.key + "-s", o.sub, X + 80, y + 46, TY.tiny, tk.muted, "Regular", 380, 16);
    strokeRect(f, "tf-opt-" + o.key + "-radio", RADIO_X, y + 32, RADIO, RADIO, tk.white, RADIO / 2, tk.line);
  }

  // ── Mã khôi phục ──
  mkText(f, "tf-codes-title", "Mã khôi phục", X, 604, TY.label, tk.ink, "Bold", 400, 20);

  var CODE_Y = 636;
  var CODE_H = 156; // cao hơn spec 4px để chứa hàng mã thứ 2
  rect(f, "tf-codes-card", X, CODE_Y, W, CODE_H, tk.white, 16);

  mkText(f, "tf-codes-lead", "Lưu 8 mã khôi phục ở nơi an toàn.", X + 24, 660, TY.bodySm, tk.ink, "Regular", 600, 18);
  mkText(f, "tf-codes-note", "Dùng khi mất điện thoại — mỗi mã chỉ dùng được 1 lần.",
    X + 24, 682, TY.tiny, tk.muted, "Regular", 620, 16);

  var codes = [
    "A3K9-2M7X", "P8Q4-1L6Z", "R2T5-9W3B", "N7Y1-4C8M",
    "H6J3-0V2K", "D4F8-5S1G", "B9L2-7X6Q", "T1N5-3R8W",
  ];
  var CELL_W = 200;
  var CELL_H = 34;
  var CELL_GAP = 20;
  var CELL_X0 = X + 24;
  var CELL_Y0 = 708;
  var CELL_ROW_STEP = 38;

  for (var c = 0; c < codes.length; c++) {
    var col = c % 4;
    var row = Math.floor(c / 4);
    var cx = CELL_X0 + col * (CELL_W + CELL_GAP);
    var cy = CELL_Y0 + row * CELL_ROW_STEP;
    rect(f, "tf-code-bg-" + c, cx, cy, CELL_W, CELL_H, tk.surface, 8);
    mkText(f, "tf-code-t-" + c, codes[c], cx, cy + 8, TY.caption, tk.ink, "Regular", CELL_W, 18, "CENTER");
  }

  // Nút sao chép
  var CP_W = 110;
  var CP_H = 36;
  rect(f, "tf-copy", X + 846, 660, CP_W, CP_H, tk.surface, 10);
  lucide(f, "tf-copy-ic", "copy", X + 864, 671, 16, tk.ink);
  mkText(f, "tf-copy-t", "Sao chép", X + 884, 670, TY.tiny, tk.ink, "Bold", 60, 16);

  // ── Lưu ──
  var SAVE_W = 180;
  var SAVE_H = 48;
  var SAVE_X = X + 800;
  var SAVE_Y = 800;
  rect(f, "tf-save", SAVE_X, SAVE_Y, SAVE_W, SAVE_H, tk.primary, 10);
  mkText(f, "tf-save-t", "Lưu thay đổi", SAVE_X, SAVE_Y + 15, TY.bodySm, tk.white, "Bold", SAVE_W, 18, "CENTER");

  return f;
}


// Koola Web — phần 04: ghi âm giọng nói + kéo thả tệp
// Gọi từ code.js, không require/import.

// ── S46 — Ghi âm giọng nói ────────────────────────────────────────────────
function s46VoiceRecording(fx) {
  var tk = L;
  var f = frame("S46 — Ghi âm giọng nói", fx, tk.chat);

  // Nền chat gọn
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");
  for (var i = 0; i < 5; i++) convRow(f, 88, 148 + i * 76, 308, CONVS[i], tk);

  var AW = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });

  // Vài bubble làm nền hội thoại
  var BUB_L = LIST_END + 66;
  var BUB_W = 300;
  var BUB_H = 44;
  strokeRect(f, "vr-bub-1", BUB_L, 130, BUB_W, BUB_H, tk.bubbleOther, 16, tk.bubbleBorder);
  strokeRect(f, "vr-bub-2", BUB_L, 184, BUB_W, BUB_H, tk.bubbleOther, 16, tk.bubbleBorder);
  rect(f, "vr-bub-3", RIGHT - 322, 240, 322, BUB_H, tk.primary, 16);

  composerBar(f, tk, LIST_END, AW, {});

  // ── Đè trạng thái ghi âm lên composer (vẽ sau composerBar) ──
  var BAR_Y = 812;
  var BAR_H = 88;
  var BAR_W = PAGE_W - LIST_END;
  rect(f, "vr-bg", LIST_END, BAR_Y, BAR_W, BAR_H, tk.panel, 0);
  hline(f, "vr-line", LIST_END, BAR_Y, BAR_W, tk.line);

  // Chấm đỏ nhấp nháy + nhãn thời gian
  var DOT_X = LIST_END + PAD;
  circle(f, "vr-dot", DOT_X, 848, 10, tk.danger);
  mkText(f, "vr-label", "Đang ghi… 0:12", DOT_X + 20, 839, TY.bodySm, tk.ink, "Bold");

  // Sóng âm: 40 thanh 3px, cách 5px, cao theo mảng
  var LEVELS = [8, 14, 22, 10, 18, 28, 12, 20, 16, 26, 10, 18, 24, 12, 20, 14,
    8, 16, 22, 10, 18, 26, 12, 20, 8, 14, 22, 16, 24, 10, 18, 12, 20, 26, 14, 8,
    16, 22, 10, 18];
  var WAVE_X = 560;
  var WAVE_CY = 856;
  var BAR_WD = 3;
  var BAR_STEP = 8;
  for (var j = 0; j < LEVELS.length; j++) {
    var lv = LEVELS[j];
    rect(f, "vr-wave-" + j, WAVE_X + j * BAR_STEP, WAVE_CY - lv / 2, BAR_WD, lv,
      j % 2 === 0 ? tk.primary : tk.line, 2);
  }

  mkText(f, "vr-dur", "0:12 / 2:00", RIGHT - 260, 848, TY.tiny, tk.faintInk, "Regular");

  // Huỷ + gửi
  var CANCEL = 44;
  var cancelX = RIGHT - 200;
  circle(f, "vr-cancel-bg", cancelX, 828, CANCEL, tk.surface);
  iconCentered(f, "vr-cancel-ic", "x", cancelX, 828, CANCEL, 20, tk.ink);

  var SEND_S = 52;
  var sendX = RIGHT - SEND_S;
  var send = circle(f, "vr-send-bg", sendX, 828, SEND_S, tk.primary);
  shadowL(send, "glow");
  iconCentered(f, "vr-send-ic", "send", sendX, 828, SEND_S, 24, tk.white);

  mkText(f, "vr-hint", "Bấm gửi để hoàn tất · huỷ để xoá · tối đa 5 phút",
    LIST_END, 874, TY.tiny, tk.faintInk, "Regular", BAR_W, 15, "CENTER");

  return f;
}

// ── S47 — Kéo thả tệp ─────────────────────────────────────────────────────
function s47DropZone(fx) {
  var tk = L;
  var f = frame("S47 — Kéo thả tệp", fx, tk.chat);

  // Nền chat đầy đủ
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");
  for (var i = 0; i < 5; i++) convRow(f, 88, 148 + i * 76, 308, CONVS[i], tk);

  var AW = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });

  var BUB_L = LIST_END + 66;
  var BUB_W = 300;
  var BUB_H = 44;
  strokeRect(f, "dz-bub-1", BUB_L, 130, BUB_W, BUB_H, tk.bubbleOther, 16, tk.bubbleBorder);
  strokeRect(f, "dz-bub-2", BUB_L, 184, BUB_W, BUB_H, tk.bubbleOther, 16, tk.bubbleBorder);
  rect(f, "dz-bub-3", RIGHT - 322, 240, 322, BUB_H, tk.primary, 16);
  composerBar(f, tk, LIST_END, AW, {});

  // ── Lớp phủ kéo thả ──
  rect(f, "dz-veil", LIST_END, 0, PAGE_W - LIST_END, PAGE_H, tk.primarySoft, 0, 0.55);

  var DX = 486;
  var DY = 100;
  var DW = 880;
  var DH = 700;
  var drop = strokeRect(f, "dz-frame", DX, DY, DW, DH, tk.panel, 20, tk.primary);
  drop.strokeWeight = 2;

  // Gợi nét đứt: 6 đoạn 40px mỗi cạnh, chia đều, thụt vào trong khung
  var DASH = 40;
  var DASH_T = 2;
  var INSET = 8;
  var SEG_X = DW / 6;
  var SEG_Y = DH / 6;
  var EDGE_L = DX + INSET;
  var EDGE_R = DX + DW - INSET - DASH_T;
  var EDGE_T = DY + INSET;
  var EDGE_B = DY + DH - INSET - DASH_T;
  for (var k = 0; k < 6; k++) {
    var px = DX + SEG_X * (k + 0.5) - DASH / 2;
    var vy = DY + SEG_Y * (k + 0.5) - DASH / 2;
    rect(f, "dz-dash-t" + k, px, EDGE_T, DASH, DASH_T, tk.primary, 1);
    rect(f, "dz-dash-b" + k, px, EDGE_B, DASH, DASH_T, tk.primary, 1);
    rect(f, "dz-dash-l" + k, EDGE_L, vy, DASH_T, DASH, tk.primary, 1);
    rect(f, "dz-dash-r" + k, EDGE_R, vy, DASH_T, DASH, tk.primary, 1);
  }

  // Biểu tượng upload
  var WELL = 96;
  var wellX = MID - WELL / 2;
  var wellY = 290;
  circle(f, "dz-well", wellX, wellY, WELL, tk.primarySoft);
  iconCentered(f, "dz-ic", "upload", wellX, wellY, WELL, 40, tk.primary);

  mkText(f, "dz-title", "Thả tệp để gửi", DX, 420, TY.title, tk.ink, "Bold", DW, 28, "CENTER");
  mkText(f, "dz-sub", "Ảnh, video, tài liệu · tối đa 25 MB mỗi tệp",
    DX, 456, TY.bodySm, tk.muted, "Regular", DW, 20, "CENTER");

  // 5 chip định dạng, canh giữa quanh tâm vùng chat
  var TYPES = ["PNG", "JPG", "MP4", "PDF", "DOCX"];
  var TYPE_W = [48, 48, 48, 48, 56];
  var CHIP_GAP = 8;
  var CHIP_Y = 502;
  var CHIP_H = 30;
  var totalW = CHIP_GAP * (TYPES.length - 1);
  for (var n = 0; n < TYPES.length; n++) totalW += TYPE_W[n];
  var cx = MID - totalW / 2;
  for (var m = 0; m < TYPES.length; m++) {
    rect(f, "dz-chip-" + m, cx, CHIP_Y, TYPE_W[m], CHIP_H, tk.white, R.pill);
    mkText(f, "dz-chip-t-" + m, TYPES[m], cx, CHIP_Y + 7, TY.caption,
      tk.muted, "Regular", TYPE_W[m], 16, "CENTER");
    cx += TYPE_W[m] + CHIP_GAP;
  }

  mkText(f, "dz-hint", "Thả ở bất kỳ đâu trong khung chat",
    DX, 826, TY.tiny, tk.faintInk, "Regular", DW, 15, "CENTER");

  return f;
}


// S48 — Ba trạng thái khung chat: đang tải, trống, lỗi tải lịch sử.
// Mỗi trạng thái một cột 440px, đặt cạnh nhau để so sánh nhanh.

function s48ChatStates(fx) {
  var tk = L;
  var f = frame("S48 — Chat: đang tải & trống", fx, tk.canvas);

  // ── Mốc bố cục ─────────────────────────────────────────────
  var COL_W = 440;
  var COL_H = 796;
  var COL_Y = 80;
  var COL_XS = [30, 490, 950];
  var PADX = 16;                    // lề trong cột (header, composer)
  var TITLE_X = 32;                 // lề chữ tiêu đề
  var TITLE_Y = 112;
  var RULE_Y = 156;
  var RULE_W = COL_W - TITLE_X * 2; // 376
  var BODY_TOP = 176;
  var INNER_W = COL_W - PADX * 2;   // 408

  // Cột dùng khung trắng + đổ bóng nhẹ; con vẽ trực tiếp lên frame (toạ độ tuyệt đối).
  function column(cx, key, title) {
    var card = rect(f, "cs-col-" + key, cx, COL_Y, COL_W, COL_H, tk.white, 16);
    hairline(card, tk.line);
    mkText(f, "cs-title-" + key, title, cx + TITLE_X, TITLE_Y, TY.heading, tk.ink, "Bold");
    hline(f, "cs-rule-" + key, cx + TITLE_X, RULE_Y, RULE_W, tk.line);
  }

  // ── CỘT 1: đang tải lịch sử ────────────────────────────────
  function loadingCol(cx) {
    column(cx, "load", "Đang tải lịch sử");

    rect(f, "cs-load-header", cx + PADX, BODY_TOP, INNER_W, 44, tk.surface, 10);

    // Bong bóng skeleton: [lệch x, y, rộng]
    var BUBBLE_H = 40;
    var bubbles = [
      [24, 240, 220], [24, 292, 160], [180, 348, 240],
      [200, 404, 200], [240, 456, 160], [180, 508, 220],
    ];
    bubbles.forEach(function (b, i) {
      rect(f, "cs-skel-bubble-" + (i + 1), cx + b[0], b[1], b[2], BUBBLE_H, tk.iconWell, 14);
    });

    // Ba chấm nhấp nháy báo đang tải.
    [200, 216, 232].forEach(function (dx, i) {
      circle(f, "cs-dot-" + (i + 1), cx + dx, 580, 8, tk.faint);
    });

    mkText(f, "cs-load-label", "Đang tải tin nhắn…", cx, 604, TY.tiny, tk.muted,
      "Regular", COL_W, 16, "CENTER");

    rect(f, "cs-skel-composer", cx + PADX, 648, INNER_W, 48, tk.iconWell, R.pill);
  }

  // ── CỘT 2: chưa có tin nhắn ────────────────────────────────
  function emptyCol(cx) {
    column(cx, "empty", "Chưa có tin nhắn");

    var WELL = 120;
    var WELL_Y = 300;
    var wellX = cx + (COL_W - WELL) / 2;
    circle(f, "cs-empty-disc", wellX, WELL_Y, WELL, tk.surface);
    iconCentered(f, "cs-empty-ic", "message-circle", wellX, WELL_Y, WELL, 44, tk.faint);

    mkText(f, "cs-empty-title", "Chưa có tin nhắn nào", cx, 452, TY.heading, tk.ink,
      "Bold", COL_W, 22, "CENTER");
    mkText(f, "cs-empty-sub", "Hãy gửi lời chào đầu tiên", cx, 484, TY.bodySm, tk.muted,
      "Regular", COL_W, 18, "CENTER");

    var BTN_W = 150;
    var BTN_H = 44;
    var btnX = cx + (COL_W - BTN_W) / 2;
    var btnY = 528;
    rect(f, "cs-empty-btn", btnX, btnY, BTN_W, BTN_H, tk.primary, 10);
    lucide(f, "cs-empty-btn-ic", "send", btnX + 20, btnY + 14, 16, tk.white);
    mkText(f, "cs-empty-btn-t", "Gửi lời chào", btnX + 46, btnY + 13, TY.bodySm, tk.white,
      "Bold", 0, 18);
  }

  // ── CỘT 3: lỗi tải lịch sử ─────────────────────────────────
  function errorCol(cx) {
    column(cx, "error", "Lỗi tải lịch sử");

    var WELL = 120;
    var WELL_Y = 300;
    var wellX = cx + (COL_W - WELL) / 2;
    circle(f, "cs-error-disc", wellX, WELL_Y, WELL, tk.dangerSoft);
    iconCentered(f, "cs-error-ic", "triangle-alert", wellX, WELL_Y, WELL, 44, tk.danger);

    mkText(f, "cs-error-title", "Không tải được tin nhắn", cx, 452, TY.heading, tk.ink,
      "Bold", COL_W, 22, "CENTER");
    mkText(f, "cs-error-sub", "Kiểm tra kết nối mạng và thử lại.", cx, 484, TY.bodySm, tk.muted,
      "Regular", COL_W, 18, "CENTER");

    var BTN_W = 130;
    var BTN_H = 44;
    var btnX = cx + (COL_W - BTN_W) / 2;
    var btnY = 528;
    rect(f, "cs-error-btn", btnX, btnY, BTN_W, BTN_H, tk.primary, 10);
    lucide(f, "cs-error-btn-ic", "rotate-cw", btnX + 18, btnY + 14, 16, tk.white);
    mkText(f, "cs-error-btn-t", "Thử lại", btnX + 44, btnY + 13, TY.bodySm, tk.white,
      "Bold", 0, 18);

    mkText(f, "cs-error-caption", "Tin nhắn cũ vẫn được lưu an toàn.", cx, 592, TY.tiny,
      tk.faintInk, "Regular", COL_W, 16, "CENTER");
  }

  loadingCol(COL_XS[0]);
  emptyCol(COL_XS[1]);
  errorCol(COL_XS[2]);

  return f;
}


// Koola Web — Phần 06: danh sách dark + đăng nhập dark

// ═══════════════════════════════════════════════════════════════════════════
// S49 — DANH SÁCH DARK
// ═══════════════════════════════════════════════════════════════════════════

function s49DarkList(fx) {
  var tk = D;
  var f = frame("S49 — Danh sách dark", fx, tk.canvas);

  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 88, 288, tk, "Tìm kiếm");

  chip(f, "dl-chip-0", "Tất cả", 96, 148, 76, true, tk);
  chip(f, "dl-chip-1", "Chưa đọc", 180, 148, 96, false, tk);
  chip(f, "dl-chip-2", "Nhóm", 284, 148, 68, false, tk);

  var ROW_X = 88;
  var ROW_Y = 204;
  var ROW_STEP = 76;
  var ROW_W = 308;
  var i;
  for (i = 0; i < CONVS.length; i++) {
    convRow(f, ROW_X, ROW_Y + i * ROW_STEP, ROW_W, CONVS[i], tk);
  }

  // Menu thao tác bung từ hàng đang hover (hàng thứ 3).
  showConvMenu(f, ROW_X, ROW_Y + 2 * ROW_STEP, ROW_W, tk);

  // Empty state vùng phải
  var WELL = 160;
  var WX = MID - WELL / 2;
  var WY = 316;
  circle(f, "dl-empty-well", WX, WY, WELL, tk.surface);
  iconCentered(f, "dl-empty-ic", "message-circle", WX, WY, WELL, 56, tk.faint);

  var TEXT_W = PAGE_W - LIST_END;
  mkText(f, "dl-empty-title", "Chọn một cuộc trò chuyện",
    LIST_END, 508, TY.heading, tk.ink, "Bold", TEXT_W, 28, "CENTER");
  mkText(f, "dl-empty-sub", "Tin nhắn sẽ hiển thị ở đây",
    LIST_END, 544, TY.bodySm, tk.muted, "Regular", TEXT_W, 20, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S50 — ĐĂNG NHẬP DARK
// ═══════════════════════════════════════════════════════════════════════════

function s50DarkLogin(fx) {
  var tk = D;
  var f = frame("S50 — Đăng nhập dark", fx, tk.cream);
  authBackdrop(f, tk, true);

  var H = 32 + authLockupH(true, 156) + 372 + 32;
  var CY = authCard(f, tk, H, "xl");
  var CX = PAGE_W / 2;
  var X = AUTH_X + 40;
  var W = AUTH_CARD_W - 80;
  var y = CY + 34;

  y = authBrandLockup(f, CX, y, tk, "Where All Needs Connect!") + 18;

  y = authField(f, tk, "dk-mail", "Email", "ban@koola.chat", y,
    { icon: "mail", placeholder: true }) + 16;

  var passEnd = authField(f, tk, "dk-pass", "Mật khẩu", "••••••••••", y,
    { icon: "lock", trailing: "eye-off", focus: true });
  y = authUnderField(f, tk, "dk-pw", passEnd + 8,
    { icon: "keyboard", text: "Caps Lock đang bật", color: tk.warnInk },
    "Quên mật khẩu?", tk.primary) + 12;

  primaryButton(f, "dk-btn", "Đăng nhập", X, y, W, 52, tk, { icon: "arrow-right" });
  y += 52 + 18;

  var segW = Math.round((W - 40) / 2) - 12;
  hline(f, "dk-or-l", X, y + 8, segW, tk.line);
  mkText(f, "dk-or-t", "hoặc", X, y, TY.caption, tk.faintInk, "Regular", W, 16, "CENTER");
  hline(f, "dk-or-r", X + W - segW, y + 8, segW, tk.line);
  y += 28;

  strokeRect(f, "dk-qr", X, y, W, 50, tk.panel, R.sm, tk.line);
  var qrLabel = 148;
  var qrx = X + Math.round((W - (20 + 12 + qrLabel)) / 2);
  iconCentered(f, "dk-qr-ic", "qr-code", qrx, y, 50, 20, tk.ink);
  mkText(f, "dk-qr-t", "Đăng nhập bằng QR", qrx + 32, y + 15, TY.bodySm, tk.ink,
    "Regular", qrLabel, 20);
  return f;
}



// S51 — Bộ component phụ: tìm kiếm, trả lời, tệp đính kèm, chia ngày, thanh ghim,
// thanh công cụ hover, menu ngữ cảnh, cảm xúc, modal, hàng cài đặt.

function s51Components2(fx) {
  var tk = L;
  var f = frame("S51 — Component set 2", fx, tk.canvas);
  f.resize(1880, 1500);

  // ── Mốc bố cục ──────────────────────────────────────────────
  var CX1 = 40, CX2 = 620, CX3 = 1200;   // 3 cột
  var Y0 = 100;                          // y bắt đầu mỗi cột
  var STEP = 40;                         // khoảng cách giữa hai bộ
  var ROW_GAP = 16;                      // khoảng cách giữa các variant
  var LBL_H = 24;                        // nhãn tên bộ do safeSet vẽ

  // Tổng cao một bộ = nhãn + các variant + khoảng cách giữa variant.
  function setH(vs) {
    var h = LBL_H;
    for (var i = 0; i < vs.length; i++) h += vs[i].h + (i ? ROW_GAP : 0);
    return h;
  }

  // Menu ngữ cảnh. rows = [icon, label, color]; dividerBefore = hàng có vạch kẻ phía trên.
  function menuVariant(props, rows, height, dividerBefore) {
    var RH = 40;
    var pad = Math.round((height - rows.length * RH) / 2);
    return {
      props: props, w: 244, h: height,
      draw: function (c) {
        strokeRect(c, "c2-mn-bg", 0, 0, 244, height, L.panel, 12, L.line);
        for (var i = 0; i < rows.length; i++) {
          var ry = pad + i * RH;
          if (i === dividerBefore) hline(c, "c2-mn-div" + i, 8, ry, 228, L.line);
          lucide(c, "c2-mn-ic" + i, rows[i][0], 12, ry + 11, 18, rows[i][2]);
          mkText(c, "c2-mn-t" + i, rows[i][1], 44, ry + 11, 13, rows[i][2], "Regular", 180, 18);
        }
      },
    };
  }

  // Hộp thoại xác nhận.
  function modalVariant(props, title, body, primaryFill) {
    return {
      props: props, w: 460, h: 300,
      draw: function (c) {
        var bg = rect(c, "c2-md-bg", 0, 0, 460, 300, L.panel, 20);
        shadowL(bg, "lg");
        mkText(c, "c2-md-title", title, 0, 32, 20, L.ink, "Bold", 460, 25, "CENTER");
        mkText(c, "c2-md-body", body, 40, 68, TY.bodySm, L.muted, "Regular", 380, 20, "CENTER");
        rect(c, "c2-md-cancel", 24, 232, 200, 44, L.surface, 10);
        mkText(c, "c2-md-cancel-t", "Huỷ", 24, 245, TY.bodySm, L.ink, "Bold", 200, 18, "CENTER");
        rect(c, "c2-md-ok", 236, 232, 200, 44, primaryFill, 10);
        mkText(c, "c2-md-ok-t", "Đồng ý", 236, 245, TY.bodySm, L.white, "Bold", 200, 18, "CENTER");
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CỘT 1
  // ═══════════════════════════════════════════════════════════
  var y = Y0;

  // 1) SearchBar
  var vSearch = [
    { props: "State=Default", w: 360, h: 44, draw: function (c) {
        strokeRect(c, "c2-sb-bg", 0, 0, 360, 44, L.surface, R.pill, L.line);
        lucide(c, "c2-sb-ic", "search", 14, 13, 20, L.faint);
        mkText(c, "c2-sb-ph", "Tìm kiếm", 40, 13, TY.bodySm, L.faintInk, "Regular", 280, 18);
      } },
    { props: "State=Focus", w: 360, h: 44, draw: function (c) {
        var bg = strokeRect(c, "c2-sb-bg", 0, 0, 360, 44, L.panel, R.pill, L.primary);
        bg.strokeWeight = 2;
        lucide(c, "c2-sb-ic", "search", 14, 13, 20, L.muted);
        mkText(c, "c2-sb-val", "koola", 40, 13, TY.bodySm, L.ink, "Regular", 280, 18);
      } },
  ];
  safeSet(f, "SearchBar", CX1, y, tk, vSearch);
  y += setH(vSearch) + STEP;

  // 2) ReplyPreview
  function replyVariant(props, bgFill, accentColor) {
    return {
      props: props, w: 420, h: 52,
      draw: function (c) {
        rect(c, "c2-rp-bg", 0, 0, 420, 52, bgFill, 10);
        rect(c, "c2-rp-bar", 0, 0, 3, 52, accentColor, 2);
        lucide(c, "c2-rp-ic", "reply", 14, 19, 14, accentColor);
        mkText(c, "c2-rp-name", "An Nguyễn", 40, 9, 11, accentColor, "Bold", 300, 15);
        mkText(c, "c2-rp-text", "Cậu xem giúp mình nhé", 40, 27, TY.caption, L.muted, "Regular", 330, 17);
        lucide(c, "c2-rp-x", "x", 390, 17, 20, L.faint);
      },
    };
  }
  var vReply = [
    replyVariant("Tone=Neutral", L.surface, L.accent),
    replyVariant("Tone=Mine", L.primarySoft, L.primary),
  ];
  safeSet(f, "ReplyPreview", CX1, y, tk, vReply);
  y += setH(vReply) + STEP;

  // 3) AttachmentPreview
  function attachVariant(props, icon, fileName, meta) {
    return {
      props: props, w: 280, h: 64,
      draw: function (c) {
        strokeRect(c, "c2-at-bg", 0, 0, 280, 64, L.panel, 12, L.line);
        rect(c, "c2-at-well", 8, 8, 48, 48, L.iconWell, 8);
        iconCentered(c, "c2-at-ic", icon, 8, 8, 48, 24, L.muted);
        mkText(c, "c2-at-name", fileName, 66, 14, TY.caption, L.ink, "Bold", 170, 17);
        mkText(c, "c2-at-meta", meta, 66, 32, TY.tiny, L.muted, "Regular", 170, 15);
        circle(c, "c2-at-x-bg", 250, 6, 20, L.ink);
        iconCentered(c, "c2-at-x", "x", 250, 6, 20, 12, L.white);
      },
    };
  }
  var vAttach = [
    attachVariant("Kind=Image", "image", "koola-v2.png", "2,4 MB · PNG"),
    attachVariant("Kind=File", "file-text", "brief.pdf", "1,2 MB · PDF"),
  ];
  safeSet(f, "AttachmentPreview", CX1, y, tk, vAttach);
  y += setH(vAttach) + STEP;

  // 4) DateDivider
  var vDate = [
    { props: "Label=Day", w: 240, h: 26, draw: function (c) {
        rect(c, "c2-dd-bg", 0, 0, 240, 26, L.surface, 14);
        mkText(c, "c2-dd-t", "Hôm nay", 0, 5, TY.tiny, L.muted, "Bold", 240, 16, "CENTER");
      } },
    { props: "Label=Unread", w: 240, h: 26, draw: function (c) {
        hline(c, "c2-dd-l", 0, 13, 60, L.line);
        hline(c, "c2-dd-r", 180, 13, 60, L.line);
        rect(c, "c2-dd-pill", 60, 0, 120, 26, L.primarySoft, 14);
        mkText(c, "c2-dd-t", "Tin nhắn mới", 60, 5, TY.tiny, L.primaryDark, "Bold", 120, 16, "CENTER");
      } },
  ];
  safeSet(f, "DateDivider", CX1, y, tk, vDate);
  y += setH(vDate) + STEP;

  // 9) Modal — đặt cột 1 cho cân chiều cao (460px vẫn vừa cột 420).
  var vModal = [
    modalVariant("Tone=Default", "Xác nhận",
      "Thao tác này sẽ áp dụng cho mọi người trong cuộc trò chuyện.", L.primary),
    modalVariant("Tone=Danger", "Xoá tin nhắn?",
      "Tin nhắn sẽ bị xoá với mọi người và không thể hoàn tác.", L.danger),
  ];
  safeSet(f, "Modal", CX1, y, tk, vModal);

  // ═══════════════════════════════════════════════════════════
  // CỘT 2 — các bộ rộng 900px
  // ═══════════════════════════════════════════════════════════
  var y2 = Y0;

  // 5) PinnedBar
  function pinnedVariant(props, label, chevron) {
    return {
      props: props, w: 900, h: 44,
      draw: function (c) {
        rect(c, "c2-pb-bg", 0, 0, 900, 44, L.surface, 0);
        rect(c, "c2-pb-bar", 24, 12, 3, 20, L.primary, 2);
        lucide(c, "c2-pb-ic", "pin", 36, 12, 20, L.primary);
        mkText(c, "c2-pb-t", label, 62, 12, TY.caption, L.ink, "Regular", 780, 17);
        lucide(c, "c2-pb-chev", chevron, 856, 13, 20, L.faint);
      },
    };
  }
  var vPinned = [
    pinnedVariant("State=Expanded", "Họp nhóm thứ 6 lúc 15:00", "chevron-down"),
    pinnedVariant("State=Collapsed", "1 tin đã ghim", "chevron-right"),
  ];
  safeSet(f, "PinnedBar", CX2, y2, tk, vPinned);
  y2 += setH(vPinned) + STEP;

  // 6) HoverToolbar
  var HOVER_ICONS = ["smile-plus", "reply", "forward", "ellipsis"];
  var vHover = [
    { props: "State=Default", w: 176, h: 40, draw: function (c) {
        strokeRect(c, "c2-ht-bg", 0, 0, 176, 40, L.panel, 12, L.line);
        for (var i = 0; i < 4; i++) {
          iconCentered(c, "c2-ht-ic" + i, HOVER_ICONS[i], 8 + i * 40, 4, 32, 20, L.muted);
          if (i < 3) vline(c, "c2-ht-div" + i, 44 + i * 40, 12, 16, L.line);
        }
      } },
  ];
  safeSet(f, "HoverToolbar", CX2, y2, tk, vHover);
  y2 += setH(vHover) + STEP;

  // 10) SettingsRow
  var vSettings = [
    { props: "Kind=Toggle", w: 900, h: 72, draw: function (c) {
        rect(c, "c2-st-well", 0, 16, 40, 40, L.iconWell, 10);
        iconCentered(c, "c2-st-ic", "bell", 0, 16, 40, 20, L.muted);
        mkText(c, "c2-st-t", "Thông báo đẩy", 56, 16, TY.label, L.ink, "Regular", 700, 20);
        mkText(c, "c2-st-s", "Nhận thông báo khi có tin mới", 56, 38, TY.tiny, L.muted, "Regular", 700, 15);
        toggle(c, "c2-st-tg", 848, 21, true, L);
      } },
    { props: "Kind=Chevron", w: 900, h: 72, draw: function (c) {
        rect(c, "c2-st-well", 0, 16, 40, 40, L.iconWell, 10);
        iconCentered(c, "c2-st-ic", "lock", 0, 16, 40, 20, L.muted);
        mkText(c, "c2-st-t", "Đổi mật khẩu", 56, 16, TY.label, L.ink, "Regular", 800, 20);
        mkText(c, "c2-st-s", "Cập nhật lần cuối 3 tháng trước", 56, 38, TY.tiny, L.muted, "Regular", 800, 15);
        lucide(c, "c2-st-chev", "chevron-right", 880, 26, 20, L.faint);
      } },
    { props: "Kind=Danger", w: 900, h: 72, draw: function (c) {
        rect(c, "c2-st-well", 0, 16, 40, 40, L.iconWell, 10);
        iconCentered(c, "c2-st-ic", "log-out", 0, 16, 40, 20, L.danger);
        mkText(c, "c2-st-t", "Đăng xuất", 56, 26, TY.label, L.dangerInk, "Regular", 700, 20);
      } },
  ];
  safeSet(f, "SettingsRow", CX2, y2, tk, vSettings);
  var y3 = y2 + setH(vSettings) + STEP;   // cột 3 bắt đầu dưới cột 2, tránh chồng

  // 8) ReactionPicker
  var EMOJI = ["❤️", "😄", "😮", "😢", "😡", "👍"];
  var vReact = [
    { props: "State=Default", w: 284, h: 64, draw: function (c) {
        strokeRect(c, "c2-rc-bg", 0, 0, 284, 64, L.panel, 32, L.line);
        circle(c, "c2-rc-active", 16, 10, 44, L.primarySoft);
        for (var i = 0; i < 6; i++) {
          mkText(c, "c2-rc-em" + i, EMOJI[i], 16 + i * 44, 17, 24, L.ink, "Regular", 44, 30, "CENTER");
        }
      } },
  ];
  safeSet(f, "ReactionPicker", CX3, y3, tk, vReact);
  y3 += setH(vReact) + STEP;

  // 7) ContextMenu
  var vMenu = [
    menuVariant("State=Message", [
      ["reply", "Trả lời", L.ink],
      ["forward", "Chuyển tiếp", L.ink],
      ["copy", "Sao chép", L.ink],
      ["pin", "Ghim tin nhắn", L.ink],
      ["pencil", "Chỉnh sửa", L.ink],
      ["trash-2", "Xoá", L.danger],
      ["flag", "Báo cáo", L.danger],
    ], 302, 5),
    menuVariant("State=Conversation", [
      ["check-check", "Đánh dấu đã đọc", L.ink],
      ["pin", "Ghim hội thoại", L.ink],
      ["bell-off", "Tắt thông báo", L.ink],
      ["archive", "Lưu trữ", L.ink],
      ["user-x", "Chặn", L.danger],
      ["trash-2", "Xoá hội thoại", L.danger],
    ], 328, 4),
  ];
  safeSet(f, "ContextMenu", CX3, y3, tk, vMenu);

  // Gợi ý dùng component (dải trên, không đè lưới).
  mkText(f, "cs2-hint",
    "Mỗi khối là Component thật — kéo từ Assets panel (⌥⌘K) vào frame để dùng lại.",
    40, 52, TY.caption, tk.faintInk, "Regular", 1500, 18);

  // Chú thích cuối khung.
  mkText(f, "cs2-caption",
    "10 component: SearchBar · ReplyPreview · AttachmentPreview · DateDivider · PinnedBar · " +
    "HoverToolbar · ContextMenu · ReactionPicker · Modal · SettingsRow",
    40, 1450, TY.caption, tk.faintInk, "Regular", 900, 18);

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S52–S54 · Kho media · Tìm kiếm nâng cao · Thư mục chat
// ═══════════════════════════════════════════════════════════════════════════

// S52 — Kho media: panel phải 4 tab Ảnh/Video/File/Link, lưới thumbnail,
// mỗi mục nhảy tới tin gốc. Zalo chỉ có album sơ khai; đây là bản đầy đủ.
function s52MediaVault(fx) {
  var tk = L;
  var f = frame("S52 — Kho media & tài liệu", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var PANEL_W = 420;
  var CHAT_W = PAGE_W - LIST_END - PANEL_W;

  // Chat thu hẹp
  rect(f, "mv-hdr", A, 0, CHAT_W, 76, tk.panel, 0);
  hline(f, "mv-hdr-line", A, 75, CHAT_W, tk.line);
  avatar(f, "mv-hdr-ava", A + 24, 14, 48, "A", tk);
  mkText(f, "mv-hdr-name", "An Nguyễn", A + 84, 19, TY.body, tk.ink, "Bold");
  mkText(f, "mv-hdr-st", "Đang hoạt động", A + 84, 41, TY.caption, tk.accentInk, "Regular");

  strokeRect(f, "mv-b1", A + 66, 120, 300, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "mv-m1", "Mình gửi ảnh hôm đi Đà Lạt", A + 82, 132, TY.label, tk.ink, "Regular", 268, 20);
  rect(f, "mv-b2", A + CHAT_W - 24 - 300, 176, 300, 44, tk.primary, R.bub);
  mkText(f, "mv-m2", "Đẹp quá, gửi thêm đi", A + CHAT_W - 24 - 282, 188, TY.label, tk.white, "Regular", 254, 20);
  composerBar(f, tk, A, CHAT_W, {});

  // ── Panel kho media ───────────────────────────────────────────────────
  var px = PAGE_W - PANEL_W;
  rect(f, "mv-panel", px, 0, PANEL_W, PAGE_H, tk.panel, 0);
  vline(f, "mv-panel-edge", px, 0, PAGE_H, tk.line);

  mkText(f, "mv-title", "Kho của hội thoại", px + 24, 26, TY.heading, tk.ink, "Bold", 280, 28);
  iconButton(f, "mv-close", "x", px + PANEL_W - 64, 24, 40, tk.surface, tk.muted);

  // 4 tab
  var tabs = [
    { lb: "Ảnh", n: "128", on: true },
    { lb: "Video", n: "12", on: false },
    { lb: "File", n: "34", on: false },
    { lb: "Link", n: "19", on: false },
  ];
  var tw = (PANEL_W - 48 - 3 * 8) / 4;
  for (var t = 0; t < tabs.length; t++) {
    var tx = px + 24 + t * (tw + 8);
    rect(f, "mv-tab-" + t, tx, 68, tw, 36, tabs[t].on ? tk.primary : tk.surface, R.pill);
    mkText(f, "mv-tab-lb-" + t, tabs[t].lb + " · " + tabs[t].n, tx, 77, TY.tiny,
      tabs[t].on ? tk.white : tk.muted, tabs[t].on ? "Bold" : "Regular", tw, 18, "CENTER");
  }

  // Nhóm theo tháng
  mkText(f, "mv-grp-1", "Tháng 11 · 2026", px + 24, 124, TY.caption, tk.muted, "Bold", 300, 18);

  // Lưới ảnh 3 cột — ô đầu là video có nút play + thời lượng
  var G = 6;
  var CW = (PANEL_W - 48 - 2 * G) / 3;
  var gridY = 148;
  for (var g = 0; g < 9; g++) {
    var gx = px + 24 + (g % 3) * (CW + G);
    var gy = gridY + Math.floor(g / 3) * (CW + G);
    rect(f, "mv-cell-" + g, gx, gy, CW, CW, tk.iconWell, R.xs);
    iconCentered(f, "mv-cell-ic-" + g, "image", gx, gy, CW, 24, tk.muted);
    if (g === 1) {
      rect(f, "mv-vid-veil", gx, gy + CW - 24, CW, 24, tk.ink, 0, 0.55);
      iconCentered(f, "mv-vid-play", "play", gx + 6, gy + CW - 24, 24, 12, tk.white);
      mkText(f, "mv-vid-t", "0:42", gx + CW - 40, gy + CW - 21, TY.micro, tk.white,
        "Bold", 34, 14, "RIGHT");
    }
  }

  mkText(f, "mv-grp-2", "Tháng 10 · 2026", px + 24, 420, TY.caption, tk.muted, "Bold", 300, 18);

  for (var g2 = 0; g2 < 6; g2++) {
    var gx2 = px + 24 + (g2 % 3) * (CW + G);
    var gy2 = 444 + Math.floor(g2 / 3) * (CW + G);
    rect(f, "mv-cell2-" + g2, gx2, gy2, CW, CW, tk.iconWell, R.xs);
    iconCentered(f, "mv-cell2-ic-" + g2, "image", gx2, gy2, CW, 24, tk.muted);
  }

  // File nổi bật gần nhất — gộp vào cuối panel
  hline(f, "mv-sep", px + 24, 712, PANEL_W - 48, tk.line);
  mkText(f, "mv-file-h", "File gần đây", px + 24, 726, TY.caption, tk.ink, "Bold", 300, 18);

  var files = [
    { n: "koola-design-v2.fig", s: "24,8 MB" },
    { n: "brief-Q4.pdf", s: "1,2 MB" },
  ];
  for (var fi = 0; fi < files.length; fi++) {
    var fy = 752 + fi * 56;
    iconButton(f, "mv-file-ic-" + fi, "file-text", px + 24, fy, 40, tk.iconWell, tk.primaryDark);
    mkText(f, "mv-file-n-" + fi, files[fi].n, px + 76, fy + 2, TY.caption, tk.ink, "Bold", 240, 18);
    mkText(f, "mv-file-s-" + fi, files[fi].s, px + 76, fy + 21, TY.tiny, tk.muted, "Regular", 120, 14);
    lucide(f, "mv-file-dl-" + fi, "download", px + PANEL_W - 44, fy + 10, 20, tk.faint);
  }

  // Nút tải tất cả
  mkText(f, "mv-all", "Tải tất cả 128 ảnh", px + 24, 868, TY.tiny, tk.primary, "Bold",
    PANEL_W - 48, 16, "CENTER");
  return f;
}

// S53 — Tìm kiếm nâng cao: từ khoá + filter chips (người gửi, loại, thời gian),
// kết quả nhóm theo hội thoại. Zalo/Messenger gần như chỉ khớp từ khoá thô.
function s53AdvancedSearch(fx) {
  var tk = L;
  var f = frame("S53 — Tìm kiếm nâng cao", fx, tk.canvas);

  // Nền: panel kết quả giữa màn như một "spotlight", không phải modal.
  rect(f, "as-scrim", 0, 0, PAGE_W, PAGE_H, tk.ink, 0, 0.30);

  var PW = 760;
  var px = (PAGE_W - PW) / 2;
  var py = 64;
  var panel = rect(f, "as-panel", px, py, PW, 772, tk.panel, R.lg);
  shadowL(panel, "xl");

  // Ô tìm kiếm lớn
  lucide(f, "as-ic", "search", px + 28, py + 30, 24, tk.muted);
  mkText(f, "as-input", "file thiết kế", px + 66, py + 28, TY.heading, tk.ink, "Regular", 420, 28);
  rect(f, "as-caret", px + 240, py + 26, 2, 32, tk.primary, 1);
  mkCaptionKbd(f, px + PW - 96, py + 32, "Esc");

  hline(f, "as-line-1", px, py + 76, PW, tk.line);

  // ── Bộ lọc ────────────────────────────────────────────────────────────
  mkText(f, "as-filter-lb", "Lọc theo", px + 24, py + 92, TY.tiny, tk.faintInk, "Bold", 200, 16);

  var filters = [
    { lb: "Mọi người", ic: "users", on: false },
    { lb: "An Nguyễn", ic: null, on: true },
    { lb: "Ảnh & video", ic: "image", on: false },
    { lb: "File", ic: "file-text", on: false },
    { lb: "30 ngày qua", ic: "clock", on: true },
  ];
  var fx2 = px + 24;
  for (var i = 0; i < filters.length; i++) {
    var lbl = filters[i].lb;
    var wch = 28 + lbl.length * 7 + (filters[i].ic ? 22 : 0);
    rect(f, "as-chip-" + i, fx2, py + 114, wch, 32, filters[i].on ? tk.primarySoft : tk.surface, R.pill);
    var cx2 = fx2 + 12;
    if (filters[i].ic) {
      iconCentered(f, "as-chip-ic-" + i, filters[i].ic, cx2, py + 114, 32, 14,
        filters[i].on ? tk.primaryDark : tk.muted);
      cx2 += 20;
    }
    mkText(f, "as-chip-lb-" + i, lbl, cx2, py + 122, TY.tiny,
      filters[i].on ? tk.primaryDark : tk.muted,
      filters[i].on ? "Bold" : "Regular", wch - (cx2 - fx2) - 8, 16);
    if (filters[i].on) {
      lucide(f, "as-chip-x-" + i, "x", fx2 + wch - 18, py + 122, 12, tk.primaryDark);
    }
    fx2 += wch + 8;
  }

  // Nút xoá bộ lọc
  rect(f, "as-clear", px + PW - 124, py + 114, 100, 32, tk.panel, R.pill);
  mkText(f, "as-clear-t", "Xoá lọc", px + PW - 124, py + 122, TY.tiny, tk.dangerInk, "Bold", 100, 16, "CENTER");

  hline(f, "as-line-2", px + 24, py + 164, PW - 48, tk.line);

  // ── Kết quả ───────────────────────────────────────────────────────────
  mkText(f, "as-count", "7 kết quả · 2 hội thoại", px + 24, py + 180, TY.caption,
    tk.muted, "Regular", 400, 18);

  // Nhóm 1 — An Nguyễn
  circle(f, "as-g-ava-1", px + 24, py + 208, 32, tk.primarySoft);
  mkText(f, "as-g-t-1", "An Nguyễn", px + 66, py + 214, TY.bodySm, tk.ink, "Bold", 200, 18);
  mkText(f, "as-g-n-1", "4 kết quả", px + 66, py + 232, TY.micro, tk.faintInk, "Regular", 200, 14);

  var res1 = [
    { who: "An", when: "Hôm nay 10:22", txt: "File thiết kế mình gửi rồi nhé" },
    { who: "Bạn", when: "Hôm nay 10:24", txt: "Ok, mình mở file xem luôn" },
    { who: "An", when: "Hôm qua 18:40", txt: "File build mới đã lên staging" },
    { who: "An", when: "T2 09:10", txt: "Cậu gửi lại file cũ giúp mình" },
  ];
  for (var r = 0; r < res1.length; r++) {
    var ry = py + 264 + r * 62;
    rect(f, "as-r-bg-" + r, px + 24, ry, PW - 48, 54, tk.surface, R.sm);
    // Highlight từ khoá bằng nền warnSoft
    rect(f, "as-r-hl-" + r, px + 78, ry + 10, 44, 20, tk.warnSoft, R.xs2);
    mkText(f, "as-r-who-" + r, res1[r].who, px + 40, ry + 8, TY.micro, tk.primaryDark, "Bold", 34, 14);
    mkText(f, "as-r-when-" + r, res1[r].when, px + PW - 172, ry + 8, TY.micro, tk.faintInk, "Regular", 140, 14, "RIGHT");
    mkText(f, "as-r-txt-" + r, res1[r].txt, px + 78, ry + 28, TY.caption, tk.ink, "Regular", PW - 200, 18);
    lucide(f, "as-r-go-" + r, "chevron-right", px + PW - 46, ry + 18, 18, tk.faint);
  }

  // Nhóm 2 — Koola Dev
  circle(f, "as-g-ava-2", px + 24, py + 528, 32, tk.primarySoft);
  mkText(f, "as-g-t-2", "Koola Dev", px + 66, py + 534, TY.bodySm, tk.ink, "Bold", 200, 18);
  mkText(f, "as-g-n-2", "3 kết quả", px + 66, py + 552, TY.micro, tk.faintInk, "Regular", 200, 14);

  var res2 = [
    { who: "Evan", when: "Hôm qua 09:12", txt: "Merge PR #21 giúp mình nhé" },
    { who: "Bạn", when: "T2 14:30", txt: "File migration đã chạy xong" },
  ];
  for (var r2 = 0; r2 < res2.length; r2++) {
    var ry2 = py + 584 + r2 * 62;
    rect(f, "as-r2-bg-" + r2, px + 24, ry2, PW - 48, 54, tk.surface, R.sm);
    rect(f, "as-r2-hl-" + r2, px + 78, ry2 + 10, 44, 20, tk.warnSoft, R.xs2);
    mkText(f, "as-r2-who-" + r2, res2[r2].who, px + 40, ry2 + 8, TY.micro, tk.primaryDark, "Bold", 34, 14);
    mkText(f, "as-r2-when-" + r2, res2[r2].when, px + PW - 172, ry2 + 8, TY.micro, tk.faintInk, "Regular", 140, 14, "RIGHT");
    mkText(f, "as-r2-txt-" + r2, res2[r2].txt, px + 78, ry2 + 28, TY.caption, tk.ink, "Regular", PW - 200, 18);
    lucide(f, "as-r2-go-" + r2, "chevron-right", px + PW - 46, ry2 + 18, 18, tk.faint);
  }

  // Footer
  hline(f, "as-line-3", px, py + 730, PW, tk.line);
  mkText(f, "as-foot", "↑↓ di chuyển · ↵ mở hội thoại · Esc đóng", px + 24, py + 742,
    TY.tiny, tk.faintInk, "Regular", 500, 16);
  return f;
}

// Kbd nhỏ dùng trong S53.
function mkCaptionKbd(f, x, y, label) {
  var w = label.length * 7 + 16;
  rect(f, "as-kbd", x, y, w, 22, L.surface, R.xs2);
  mkText(f, "as-kbd-t", label, x, y + 4, TY.micro, L.faintInk, "Bold", w, 14, "CENTER");
}

// S54 — Thư mục chat: tab Công việc / Gia đình / Chưa đọc, có đếm số,
// mỗi thư mục nhớ trạng thái ghim/mute riêng. Zalo danh sách phẳng.
function s54ChatFolders(fx) {
  var tk = L;
  var f = frame("S54 — Thư mục chat", fx, tk.canvas);
  rail(f, 0, tk);
  listPanel(f, tk);

  mkText(f, "cf-title", "Trò chuyện", 96, 24, TY.heading, tk.ink, "Bold", 200, 28);
  iconButton(f, "cf-add", "plus", 340, 18, 44, tk.primarySoft, tk.primaryDark);

  // Hàng thư mục — cuộn ngang, có icon + đếm
  var folders = [
    { lb: "Tất cả", n: "24", ic: "message-circle", on: false },
    { lb: "Công việc", n: "8", ic: "archive", on: true },
    { lb: "Gia đình", n: "5", ic: "heart", on: false },
    { lb: "Chưa đọc", n: "12", ic: "bell", on: false },
  ];
  var fx2 = 96;
  for (var i = 0; i < folders.length; i++) {
    var fd = folders[i];
    var wd = 30 + fd.lb.length * 7 + fd.n.length * 7 + 24;
    var tab = rect(f, "cf-tab-" + i, fx2, 74, wd, 36, fd.on ? tk.primary : tk.surface, R.pill);
    if (fd.on) shadowL(tab, "glow");
    var ix = fx2 + 12;
    if (true) {
      iconCentered(f, "cf-tab-ic-" + i, fd.ic, ix, 74, 36, 14, fd.on ? tk.white : tk.muted);
      ix += 20;
    }
    mkText(f, "cf-tab-lb-" + i, fd.lb, ix, 82, TY.tiny,
      fd.on ? tk.white : tk.muted, fd.on ? "Bold" : "Regular", fd.lb.length * 8, 16);
    mkText(f, "cf-tab-n-" + i, fd.n, fx2 + wd - 30, 82, TY.micro,
      fd.on ? tk.white : tk.faintInk, "Bold", 20, 16, "RIGHT");
    fx2 += wd + 8;
  }

  // Ghi chú trạng thái thư mục
  mkText(f, "cf-note", "Ghim và tắt thông báo theo từng thư mục · đồng bộ mọi thiết bị",
    96, 122, TY.tiny, tk.faintInk, "Regular", 300, 16);

  hline(f, "cf-line", 88, 148, 308, tk.line);

  // Danh sách của thư mục Công việc
  var work = [
    { id: "w1", name: "Koola Dev", preview: "Evan: merge PR #21 nhé", time: "09:12", unread: "5", pinned: true, dot: true, active: true },
    { id: "w2", name: "Design Team", preview: "Figma vừa update", time: "T2", ticks: true, muted: true },
    { id: "w3", name: "An Nguyễn", preview: "Đã gửi file thiết kế", time: "10:24", unread: "2", dot: true },
    { id: "w4", name: "Sếp Hùng", preview: "Báo cáo Q4 xong chưa?", time: "Hôm qua", ticks: true },
    { id: "w5", name: "Client ABC", preview: "Deadline dời sang thứ 6", time: "T2" },
  ];
  for (var w = 0; w < work.length; w++) {
    convRow(f, 88, 164 + w * 76, 308, work[w], tk);
  }

  // Thanh "kéo để chuyển thư mục" — gợi ý tương tác
  mkText(f, "cf-hint", "Kéo hội thoại vào thư mục để phân loại", 88, 548,
    TY.tiny, tk.faintInk, "Regular", 308, 16, "CENTER");

  // Panel phải: cấu hình thư mục
  var px = PAGE_W - 460;
  var card = rect(f, "cf-cfg", px, 64, 420, 420, tk.panel, R.lg);
  hline(f, "cf-cfg-l", px, 0, 1, tk.line);

  mkText(f, "cf-cfg-title", "Thư mục Công việc", px + 28, 92, TY.heading, tk.ink, "Bold", 300, 28);
  mkText(f, "cf-cfg-sub", "8 hội thoại · ghim trên cùng", px + 28, 122, TY.tiny, tk.muted, "Regular", 300, 16);

  hline(f, "cf-cfg-line", px + 28, 156, 364, tk.line);

  var rows = [
    { ic: "pin", lb: "Ghim hội thoại mới", sub: "Tự ghim khi thêm vào thư mục", on: true },
    { ic: "bell-off", lb: "Tắt thông báo", sub: "Chỉ nhận thông báo từ thư mục khác", on: false },
    { ic: "archive", lb: "Ẩn khỏi danh sách chính", sub: "Chỉ hiện trong thư mục này", on: true },
  ];
  for (var rw = 0; rw < rows.length; rw++) {
    var ry = 180 + rw * 76;
    iconButton(f, "cf-cfg-ic-" + rw, rows[rw].ic, px + 28, ry, 40, tk.iconWell, tk.primaryDark);
    mkText(f, "cf-cfg-lb-" + rw, rows[rw].lb, px + 80, ry + 2, TY.bodySm, tk.ink, "Bold", 240, 18);
    mkText(f, "cf-cfg-sub-" + rw, rows[rw].sub, px + 80, ry + 22, TY.micro, tk.muted, "Regular", 260, 14);
    toggle(f, "cf-cfg-tg-" + rw, px + 344, ry + 6, rows[rw].on, tk);
  }

  primaryButton(f, "cf-cfg-btn", "Lưu", px + 28, 416, 364, 48, tk, { icon: "check" });
  return f;
}


// ═══════════════════════════════════════════════════════════════════════════
// S55–S57 · Chọn nhiều tin · Sticker/GIF · Voice player nâng cao
// ═══════════════════════════════════════════════════════════════════════════

// S55 — Chế độ chọn nhiều: mỗi bubble có checkbox, thanh hành động nổi ở đáy,
// sheet chọn đích chuyển tiếp kèm tuỳ chọn ẩn nguồn.
function s55MultiSelect(fx) {
  var tk = L;
  var f = frame("S55 — Chọn nhiều tin", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  // Header chuyển sang chế độ chọn
  rect(f, "ms-hdr", A, 0, AW, 76, tk.panel, 0);
  hline(f, "ms-hdr-line", A, 75, AW, tk.line);
  iconButton(f, "ms-hdr-x", "x", A + 16, 18, 40, tk.surface, tk.ink);
  mkText(f, "ms-hdr-t", "Đã chọn 3 tin", A + 72, 24, TY.body, tk.ink, "Bold", 400, 24);
  iconButton(f, "ms-hdr-selall", "check-check", RIGHT - 112, 18, 40, tk.primarySoft, tk.primaryDark);

  // Bubble có checkbox
  var msgs = [
    { y: 120, own: false, w: 320, t: "Mình gửi file thiết kế mới nhé", sel: true },
    { y: 180, own: false, w: 252, t: "Cậu xem giúp mình", sel: true },
    { y: 240, own: true, w: 300, t: "Ok, mình mở xem luôn", sel: false },
    { y: 300, own: false, w: 340, t: "File có gì cần sửa thì báo nhé", sel: true },
    { y: 360, own: true, w: 280, t: "Chốt chiều nay gửi lại", sel: false },
  ];
  for (var m = 0; m < msgs.length; m++) {
    var d = msgs[m];
    var bx = d.own ? RIGHT - 24 - d.w : A + 66;
    // Dịch bubble sang phải để chừa chỗ checkbox
    var shift = 36;
    var realX = bx + shift;

    if (d.own) {
      rect(f, "ms-bub-" + m, realX, d.y, d.w, 44, tk.primary, R.bub);
    } else {
      strokeRect(f, "ms-bub-" + m, realX, d.y, d.w, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
    }
    mkText(f, "ms-msg-" + m, d.t, realX + 16, d.y + 12, TY.label,
      d.own ? tk.white : tk.ink, "Regular", d.w - 32, 20);

    // Checkbox tròn 24px — luôn nằm BÊN TRÁI bubble, cùng một cột.
    var cbx = A + 24;
    circle(f, "ms-cb-" + m, cbx, d.y + 10, 24, d.sel ? tk.primary : tk.panel);
    if (d.sel) {
      iconCentered(f, "ms-cb-ic-" + m, "check", cbx, d.y + 10, 24, 14, tk.white);
    } else {
      var cb = f.findOne(function (n) { return n.name === "ms-cb-" + m; });
      if (cb) {
        cb.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
        cb.strokeWeight = 2;
        cb.strokeAlign = "INSIDE";
      }
    }
  }

  // ── Thanh hành động nổi ───────────────────────────────────────────────
  var barW = 420;
  var barX = A + (AW - barW) / 2;
  var bar = rect(f, "ms-bar", barX, 720, barW, 64, tk.ink, R.pill);
  shadowL(bar, "xl");

  var acts = [
    { ic: "forward", lb: "Chuyển tiếp" },
    { ic: "copy", lb: "Sao chép" },
    { ic: "pin", lb: "Ghim" },
    { ic: "trash-2", lb: "Xoá", danger: true },
  ];
  var aw = barW / acts.length;
  for (var a = 0; a < acts.length; a++) {
    var ax = barX + a * aw + aw / 2;
    iconCentered(f, "ms-act-ic-" + a, acts[a].ic, ax - 11, 734, 22, 20,
      acts[a].danger ? "#F87171" : tk.white);
    mkText(f, "ms-act-lb-" + a, acts[a].lb, ax - aw / 2 + 4, 758, TY.micro,
      acts[a].danger ? "#F87171" : "#A0AAB8", "Regular", aw - 8, 14, "CENTER");
  }

  // ── Sheet chọn đích ───────────────────────────────────────────────────
  var sx = RIGHT - 380;
  var sheet = rect(f, "ms-sheet", sx, 100, 360, 520, tk.panel, R.lg);
  shadowL(sheet, "xl");

  mkText(f, "ms-sheet-t", "Chuyển 3 tin đến", sx + 24, 124, TY.body, tk.ink, "Bold", 300, 22);
  iconButton(f, "ms-sheet-x", "x", sx + 360 - 56, 118, 36, tk.surface, tk.muted);

  strokeRect(f, "ms-sheet-search", sx + 24, 164, 312, 40, tk.surface, R.pill, tk.line);
  lucide(f, "ms-sheet-search-ic", "search", sx + 38, 174, 18, tk.faint);
  mkText(f, "ms-sheet-search-ph", "Tìm người hoặc nhóm", sx + 64, 174, TY.caption, tk.faintInk, "Regular", 240, 18);

  var targets = [
    { n: "Koola Dev", sel: true },
    { n: "Design Team", sel: false },
    { n: "Mẹ", sel: false },
    { n: "Bình Trần", sel: true },
  ];
  for (var tg = 0; tg < targets.length; tg++) {
    var ty = 220 + tg * 60;
    circle(f, "ms-t-ava-" + tg, sx + 24, ty + 8, 40, tk.primarySoft);
    mkText(f, "ms-t-n-" + tg, targets[tg].n, sx + 76, ty + 18, TY.bodySm, tk.ink, "Regular", 200, 18);
    var cb2 = circle(f, "ms-t-cb-" + tg, sx + 312, ty + 16, 24, targets[tg].sel ? tk.primary : tk.panel);
    if (targets[tg].sel) iconCentered(f, "ms-t-ck-" + tg, "check", sx + 312, ty + 16, 24, 14, tk.white);
    else {
      var n2 = f.findOne(function (x) { return x.name === "ms-t-cb-" + tg; });
      if (n2) {
        n2.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
        n2.strokeWeight = 2;
        n2.strokeAlign = "INSIDE";
      }
    }
  }

  // Toggle ẩn nguồn
  hline(f, "ms-sheet-line", sx + 24, 484, 312, tk.line);
  mkText(f, "ms-anon-lb", "Ẩn tên người gửi gốc", sx + 24, 504, TY.caption, tk.ink, "Regular", 240, 18);
  mkText(f, "ms-anon-sub", "Người nhận chỉ thấy nội dung", sx + 24, 522, TY.micro, tk.muted, "Regular", 240, 14);
  toggle(f, "ms-anon-tg", sx + 284, 504, true, tk);

  primaryButton(f, "ms-send", "Chuyển tiếp", sx + 24, 556, 312, 48, tk, { icon: "forward" });
  return f;
}

// S56 — Sticker & GIF: panel 2 tab, lưới sticker, tìm GIF, mục gần đây.
// Zalo mạnh sticker nhưng yếu GIF; Messenger ngược lại — đây gộp cả hai.
function s56StickerGif(fx) {
  var tk = L;
  var f = frame("S56 — Sticker & GIF", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  var hdr = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động", icons: ["phone", "video", "info"],
  });

  strokeRect(f, "sg-b1", A + 66, 120, 300, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "sg-m1", "Cuối tuần đi đâu chơi không?", A + 82, 132, TY.label, tk.ink, "Regular", 268, 20);
  rect(f, "sg-b2", RIGHT - 24 - 300, 176, 300, 44, tk.primary, R.bub);
  mkText(f, "sg-m2", "Để mình gửi sticker cho vui", RIGHT - 24 - 282, 188, TY.label, tk.white, "Regular", 254, 20);

  composerBar(f, tk, A, AW, {});

  // ── Panel sticker ─────────────────────────────────────────────────────
  var PW = 420, PH = 560;
  var px = RIGHT - PW - 24;
  var py = 812 - PH - 12;

  var panel = rect(f, "sg-panel", px, py, PW, PH, tk.panel, R.lg);
  shadowL(panel, "xl");

  // 2 tab chính
  var tabW = (PW - 48) / 2;
  rect(f, "sg-tab-0", px + 24, py + 16, tabW, 40, tk.primary, R.pill);
  mkText(f, "sg-tab-0-t", "Sticker", px + 24, py + 26, TY.bodySm, tk.white, "Bold", tabW, 20, "CENTER");
  rect(f, "sg-tab-1", px + 24 + tabW + 8, py + 16, tabW - 8, 40, tk.surface, R.pill);
  mkText(f, "sg-tab-1-t", "GIF", px + 24 + tabW + 8, py + 26, TY.bodySm, tk.muted, "Regular", tabW - 8, 20, "CENTER");

  // Tìm
  strokeRect(f, "sg-search", px + 24, py + 68, PW - 48, 40, tk.surface, R.pill, tk.line);
  lucide(f, "sg-search-ic", "search", px + 38, py + 78, 18, tk.faint);
  mkText(f, "sg-search-ph", "Tìm sticker hoặc GIF", px + 64, py + 78, TY.caption, tk.faintInk, "Regular", 300, 18);

  // Gần đây
  mkText(f, "sg-recent-h", "Dùng gần đây", px + 24, py + 124, TY.micro, tk.faintInk, "Bold", 200, 14);
  for (var g = 0; g < 6; g++) {
    var gx = px + 24 + (g % 6) * 62;
    rect(f, "sg-recent-" + g, gx, py + 144, 52, 52, tk.iconWell, R.xs);
    iconCentered(f, "sg-recent-ic-" + g, "smile", gx, py + 144, 52, 24, tk.muted);
  }

  // Bộ sticker — lưới 4 cột
  mkText(f, "sg-pack-h", "Bộ Koola · 24 sticker", px + 24, py + 212, TY.micro, tk.faintInk, "Bold", 260, 14);

  var stickers = ["smile", "laugh", "heart", "thumbs-up",
                  "meh", "frown", "star", "flag",
                  "smile-plus", "thumbs-down", "check", "x"];
  var SW = (PW - 48 - 3 * 10) / 4;
  for (var s = 0; s < stickers.length; s++) {
    var sx2 = px + 24 + (s % 4) * (SW + 10);
    var sy2 = py + 234 + Math.floor(s / 4) * (SW + 10);
    if (s === 2) {
      // Sticker đang chọn: nền primarySoft + viền primary
      var selb = strokeRect(f, "sg-st-" + s, sx2, sy2, SW, SW, tk.primarySoft, R.sm, tk.primary);
      selb.strokeWeight = 2;
    } else {
      rect(f, "sg-st-" + s, sx2, sy2, SW, SW, tk.surface, R.sm);
    }
    iconCentered(f, "sg-st-ic-" + s, stickers[s], sx2, sy2, SW, 34,
      s === 2 ? tk.primary : tk.muted);
  }

  // Bộ khác
  mkText(f, "sg-more-h", "Bộ khác", px + 24, py + 234 + 3 * (SW + 10) + 8,
    TY.micro, tk.faintInk, "Bold", 200, 14);
  for (var p = 0; p < 4; p++) {
    var pxp = px + 24 + p * 62;
    var pyp = py + 234 + 3 * (SW + 10) + 28;
    rect(f, "sg-pack-" + p, pxp, pyp, 52, 52, tk.iconWell, R.xs);
    iconCentered(f, "sg-pack-ic-" + p, ["star", "heart", "laugh", "flag"][p],
      pxp, pyp, 52, 24, tk.primary);
  }
  return f;
}

// S57 — Voice player nâng cao: waveform tua được, tốc độ 1x/1.5x/2x,
// transcript, và mini-player khi đổi hội thoại. Zalo thiếu cả ba.
function s57VoicePlayer(fx) {
  var tk = L;
  var f = frame("S57 — Trình phát tin nhắn thoại", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;

  var hdr = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động", icons: ["phone", "video", "info"],
  });

  // ── Bubble voice đang phát ────────────────────────────────────────────
  var vx = A + 66;
  var vy = 120;
  var VW = 440;
  var vb = strokeRect(f, "vp-bubble", vx, vy, VW, 132, tk.bubbleOther, R.bub, tk.bubbleBorder);

  circle(f, "vp-ava", vx - 44, vy, 32, tk.primarySoft);
  iconCentered(f, "vp-ava-ic", "users", vx - 44, vy, 32, 16, tk.primary);

  // Nút play/pause tròn
  roundButton(f, "vp-play", "pause", vx + 16, vy + 16, 40, tk.primary, tk.white);

  // Waveform: 28 thanh, phần đã phát primary, chưa phát line
  var bars = 28;
  var bw = 3, gap = 5;
  var heights = [8, 14, 22, 10, 18, 28, 12, 20, 16, 26, 10, 18, 24, 12,
                 20, 14, 8, 16, 22, 10, 18, 26, 12, 20, 8, 14, 22, 16];
  var played = 17;
  for (var b = 0; b < bars; b++) {
    var bx = vx + 68 + b * (bw + gap);
    rect(f, "vp-bar-" + b, bx, vy + 32 - heights[b] / 2, bw, heights[b],
      b < played ? tk.primary : tk.line, 2);
  }

  // Playhead
  var phx = vx + 68 + played * (bw + gap);
  rect(f, "vp-playhead", phx - 1, vy + 12, 2, 40, tk.primary, 1);
  circle(f, "vp-head-dot", phx - 6, vy + 8, 12, tk.primary);

  // Thời gian
  mkText(f, "vp-time", "0:18", vx + 16, vy + 70, TY.tiny, tk.primaryDark, "Bold", 60, 16);
  mkText(f, "vp-dur", "0:42", vx + VW - 76, vy + 70, TY.tiny, tk.faintInk, "Regular", 60, 16, "RIGHT");

  // Hàng điều khiển: tốc độ + transcript + tải
  var ctrlY = vy + 92;
  var spd = ["1x", "1.5x", "2x"];
  for (var sp = 0; sp < spd.length; sp++) {
    var spx = vx + 16 + sp * 44;
    var isOn = sp === 1;
    rect(f, "vp-spd-" + sp, spx, ctrlY, 38, 24, isOn ? tk.primary : tk.surface, R.pill);
    mkText(f, "vp-spd-t-" + sp, spd[sp], spx, ctrlY + 5, TY.micro,
      isOn ? tk.white : tk.muted, isOn ? "Bold" : "Regular", 38, 14, "CENTER");
  }

  iconButton(f, "vp-transcript", "file-text", vx + 164, ctrlY - 8, 40, tk.surface, tk.ink);
  iconButton(f, "vp-download", "download", vx + 212, ctrlY - 8, 40, tk.surface, tk.ink);
  iconButton(f, "vp-more", "ellipsis", vx + 260, ctrlY - 8, 40, tk.surface, tk.ink);

  // ── Transcript mở rộng ────────────────────────────────────────────────
  var tY = vy + 144;
  var tb = rect(f, "vp-transcript-box", vx, tY, VW, 164, tk.surface, R.md);
  mkText(f, "vp-t-h", "Bản ghi lời nói", vx + 16, tY + 12, TY.micro, tk.faintInk, "Bold", 200, 14);

  var lines = [
    { t: "0:00", s: "Ừ thì cuối tuần này mình rảnh", on: false },
    { t: "0:06", s: "Hay là đi Đà Lạt nhé, mát lắm", on: false },
    { t: "0:14", s: "Mình đặt phòng luôn cho", on: true },
    { t: "0:21", s: "Cậu thấy thế nào?", on: false },
  ];
  for (var l = 0; l < lines.length; l++) {
    var ly = tY + 36 + l * 30;
    if (lines[l].on) rect(f, "vp-line-bg-" + l, vx + 8, ly - 4, VW - 16, 26, tk.primarySoft, R.xs2);
    mkText(f, "vp-line-t-" + l, lines[l].t, vx + 16, ly + 2, TY.micro, tk.faintInk, "Regular", 44, 14);
    mkText(f, "vp-line-s-" + l, lines[l].s, vx + 66, ly, TY.caption,
      lines[l].on ? tk.primaryDark : tk.ink,
      lines[l].on ? "Bold" : "Regular", VW - 90, 16);
  }

  // Ghi chú tính năng
  caption(f, "Tua bằng cách kéo playhead · tốc độ áp dụng cho mọi tin thoại · transcript tự tạo",
    vx, tY + 176, VW, tk);

  composerBar(f, tk, A, AW, {});

  // ── Mini player khi đổi hội thoại ─────────────────────────────────────
  var mx = RIGHT - 320;
  var my = 108;
  var mini = rect(f, "vp-mini", mx, my, 296, 76, tk.ink, R.md);
  shadowL(mini, "lg");

  roundButton(f, "vp-mini-play", "pause", mx + 14, my + 18, 40, tk.primary, tk.white);
  mkText(f, "vp-mini-n", "An Nguyễn", mx + 66, my + 16, TY.tiny, tk.white, "Bold", 160, 16);
  mkText(f, "vp-mini-t", "0:18 / 0:42 · 1.5x", mx + 66, my + 34, TY.micro, "#A0AAB8", "Regular", 160, 14);

  // Progress bar
  rect(f, "vp-mini-bar-bg", mx + 66, my + 56, 160, 3, "#3A424E", 2);
  rect(f, "vp-mini-bar-fg", mx + 66, my + 56, 68, 3, tk.primary, 2);

  iconButton(f, "vp-mini-close", "x", mx + 248, my + 8, 28, "#252B33", tk.callInkDim);
  return f;
}


// ═══════════════════════════════════════════════════════════════════════════
// S58–S61 · Hẹn giờ gửi · Bình chọn nhóm · Ai đã xem · Tin nhắn chờ
// ═══════════════════════════════════════════════════════════════════════════

// S58 — Hẹn giờ gửi: modal chọn thời điểm + danh sách "Đã hẹn" sửa/huỷ được.
// Zalo và Messenger phổ thông không có; Telegram có. Koola thành công cụ nhắc việc.
function s58ScheduledSend(fx) {
  var tk = L;
  var f = frame("S58 — Hẹn giờ gửi tin", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var hdr = chatHeader(f, tk, {
    name: "An Nguyễn", status: "Đang hoạt động", icons: ["phone", "video", "info"],
  });

  strokeRect(f, "ss-b1", A + 66, 120, 300, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "ss-m1", "Nhớ nhắc mình họp lúc 15:00", A + 82, 132, TY.label, tk.ink, "Regular", 268, 20);
  rect(f, "ss-b2", RIGHT - 24 - 300, 176, 300, 44, tk.primary, R.bub);
  mkText(f, "ss-m2", "Ok, mình hẹn tin nhắn nhắc", RIGHT - 24 - 282, 188, TY.label, tk.white, "Regular", 254, 20);

  composerBar(f, tk, A, AW, {});

  // ── Modal hẹn giờ ─────────────────────────────────────────────────────
  var MW = 420;
  var mx = RIGHT - MW - 24;
  var my = 100;
  var modal = rect(f, "ss-modal", mx, my, MW, 520, tk.panel, R.lg);
  shadowL(modal, "xl");

  mkText(f, "ss-t", "Hẹn giờ gửi", mx + 24, my + 22, TY.heading, tk.ink, "Bold", 300, 28);
  iconButton(f, "ss-x", "x", mx + MW - 60, my + 18, 36, tk.surface, tk.muted);

  // Preview tin nhắn
  rect(f, "ss-preview", mx + 24, my + 62, MW - 48, 52, tk.surface, R.sm);
  mkText(f, "ss-preview-t", "Nhớ họp lúc 15:00 nhé", mx + 40, my + 76, TY.caption, tk.ink, "Regular", MW - 80, 18);

  // Chọn ngày
  mkText(f, "ss-day-lb", "Ngày", mx + 24, my + 132, TY.micro, tk.faintInk, "Bold", 100, 14);
  var days = [
    { lb: "Hôm nay", sub: "T5, 6/11", on: true },
    { lb: "Mai", sub: "T6, 7/11", on: false },
    { lb: "T2", sub: "9/11", on: false },
  ];
  var dw = (MW - 48 - 2 * 8) / 3;
  for (var d = 0; d < days.length; d++) {
    var dx = mx + 24 + d * (dw + 8);
    var db = strokeRect(f, "ss-day-" + d, dx, my + 150, dw, 56,
      days[d].on ? tk.primarySoft : tk.panel, R.sm,
      days[d].on ? tk.primary : tk.line);
    mkText(f, "ss-day-lb2-" + d, days[d].lb, dx, my + 160, TY.caption,
      days[d].on ? tk.primaryDark : tk.ink, "Bold", dw, 18, "CENTER");
    mkText(f, "ss-day-sub-" + d, days[d].sub, dx, my + 178, TY.micro,
      days[d].on ? tk.primaryDark : tk.faintInk, "Regular", dw, 14, "CENTER");
  }

  // Chọn giờ
  mkText(f, "ss-time-lb", "Giờ", mx + 24, my + 224, TY.micro, tk.faintInk, "Bold", 100, 14);
  var times = ["08:00", "12:00", "15:00", "18:00"];
  var tw2 = (MW - 48 - 3 * 6) / 4;
  for (var t = 0; t < times.length; t++) {
    var tx = mx + 24 + t * (tw2 + 6);
    rect(f, "ss-time-" + t, tx, my + 242, tw2, 40,
      t === 2 ? tk.primary : tk.surface, R.sm);
    mkText(f, "ss-time-t-" + t, times[t], tx, my + 253, TY.caption,
      t === 2 ? tk.white : tk.ink, t === 2 ? "Bold" : "Regular", tw2, 18, "CENTER");
  }

  // Hàng giờ tuỳ chỉnh
  strokeRect(f, "ss-custom", mx + 24, my + 294, MW - 48, 48, tk.surface, R.sm, tk.line);
  mkText(f, "ss-custom-lb", "Giờ tuỳ chỉnh", mx + 40, my + 309, TY.caption, tk.muted, "Regular", 180, 18);
  mkText(f, "ss-custom-v", "14:30", mx + MW - 100, my + 308, TY.bodySm, tk.ink, "Bold", 70, 18, "RIGHT");
  lucide(f, "ss-custom-ic", "chevron-right", mx + MW - 52, my + 308, 18, tk.faint);

  // Nhắc lại
  hline(f, "ss-line", mx + 24, my + 362, MW - 48, tk.line);
  mkText(f, "ss-rep-lb", "Nhắc lại hằng ngày", mx + 24, my + 380, TY.caption, tk.ink, "Regular", 240, 18);
  toggle(f, "ss-rep-tg", mx + MW - 84, my + 380, false, tk);

  // Buttons
  strokeRect(f, "ss-cancel", mx + 24, my + 436, 160, 48, tk.panel, R.sm, tk.line);
  mkText(f, "ss-cancel-t", "Huỷ", mx + 24, my + 450, TY.bodySm, tk.ink, "Bold", 160, 20, "CENTER");
  primaryButton(f, "ss-ok", "Hẹn giờ", mx + 196, my + 436, MW - 220, 48, tk, { icon: "clock" });

  // ── Danh sách đã hẹn ──────────────────────────────────────────────────
  var qx = A + 66;
  var qy = 260;
  mkText(f, "ss-list-h", "Đã hẹn hôm nay", qx, qy, TY.caption, tk.ink, "Bold", 300, 18);

  var sched = [
    { t: "15:00", txt: "Nhớ họp nhé", who: "An Nguyễn", ok: true },
    { t: "18:30", txt: "Chúc mừng sinh nhật em", who: "Mẹ", ok: true },
    { t: "08:00 mai", txt: "File build mới đã lên", who: "Koola Dev", ok: false },
  ];
  for (var s = 0; s < sched.length; s++) {
    var sy = qy + 26 + s * 64;
    strokeRect(f, "ss-item-" + s, qx, sy, 400, 52, tk.panel, R.sm, tk.line);
    circle(f, "ss-item-tmdot-" + s, qx + 14, sy + 18, 16, sched[s].ok ? tk.primarySoft : tk.iconWell);
    iconCentered(f, "ss-item-tm-" + s, "clock", qx + 14, sy + 18, 16, 8,
      sched[s].ok ? tk.primaryDark : tk.faintInk);
    mkText(f, "ss-item-t-" + s, sched[s].t, qx + 38, sy + 8, TY.micro, tk.primaryDark, "Bold", 80, 14);
    mkText(f, "ss-item-txt-" + s, sched[s].txt, qx + 38, sy + 24, TY.caption, tk.ink, "Regular", 260, 18);
    mkText(f, "ss-item-who-" + s, sched[s].who, qx + 300, sy + 24, TY.micro, tk.faintInk, "Regular", 80, 14, "RIGHT");
    lucide(f, "ss-item-x-" + s, "x", qx + 372, sy + 18, 16, tk.faint);
  }
  return f;
}

// S59 — Bình chọn nhóm: modal tạo + card kết quả realtime trong thread.
// Zalo hạn chế, Messenger không có. Thay vote "+1" rải rác.
function s59Poll(fx) {
  var tk = L;
  var f = frame("S59 — Bình chọn nhóm", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var hdr = chatHeader(f, tk, {
    name: "Koola Design", status: "4 thành viên · 2 đang online",
    icons: ["phone", "video", "info"], group: true,
  });

  // Bubble mở đầu
  var gx = A + 66;
  circle(f, "pl-ava", A + 24, 120, 32, tk.primarySoft);
  iconCentered(f, "pl-ava-ic", "users", A + 24, 120, 32, 16, tk.primary);
  mkText(f, "pl-name", "An Nguyễn", gx, 120, TY.caption, tk.muted, "Bold", 200, 16);
  strokeRect(f, "pl-intro", gx, 142, 280, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "pl-intro-t", "Chốt ăn trưa ở đâu nhé?", gx + 16, 154, TY.label, tk.ink, "Regular", 248, 20);

  // ── Poll card trong thread ────────────────────────────────────────────
  var py = 200;
  var PW = 440;
  var poll = strokeRect(f, "pl-card", gx, py, PW, 268, tk.bubbleOther, R.bub, tk.bubbleBorder);

  // Đầu: icon + câu hỏi
  circle(f, "pl-ic-bg", gx + 16, py + 16, 32, tk.primarySoft);
  iconCentered(f, "pl-ic", "check-check", gx + 16, py + 16, 32, 16, tk.primary);
  mkText(f, "pl-q", "Ăn trưa ở đâu?", gx + 58, py + 18, TY.bodySm, tk.ink, "Bold", 340, 20);
  mkText(f, "pl-meta", "Bình chọn · 4 người đã chọn", gx + 58, py + 38, TY.micro, tk.faintInk, "Regular", 340, 14);

  // Options với thanh tỉ lệ
  var opts = [
    { lb: "Cơm tấm", pct: 0.50, votes: 2, mine: true },
    { lb: "Phở", pct: 0.25, votes: 1, mine: false },
    { lb: "Bún bò", pct: 0.25, votes: 1, mine: false },
  ];
  for (var o = 0; o < opts.length; o++) {
    var oy = py + 66 + o * 52;
    var ow = PW - 32;
    // Nền thanh tỉ lệ
    rect(f, "pl-opt-bg-" + o, gx + 16, oy, ow, 44, tk.surface, R.sm);
    // Phần đã bỏ phiếu
    rect(f, "pl-opt-fill-" + o, gx + 16, oy, Math.round(ow * opts[o].pct), 44,
      opts[o].mine ? tk.primarySoft : tk.iconWell, R.sm);
    if (opts[o].mine) {
      var ob = f.findOne(function (n) { return n.name === "pl-opt-fill-" + o; });
      if (ob) {
        ob.strokes = [{ type: "SOLID", color: hx6(tk.primary) }];
        ob.strokeWeight = 2;
        ob.strokeAlign = "INSIDE";
      }
    }
    // Check + nhãn
    if (opts[o].mine) {
      iconCentered(f, "pl-opt-ck-" + o, "check", gx + 26, oy, 44, 16, tk.primary);
    }
    mkText(f, "pl-opt-lb-" + o, opts[o].lb, gx + 56, oy + 13, TY.caption,
      opts[o].mine ? tk.primaryDark : tk.ink,
      opts[o].mine ? "Bold" : "Regular", 180, 18);
    mkText(f, "pl-opt-pct-" + o, Math.round(opts[o].pct * 100) + "%", gx + PW - 84, oy + 13,
      TY.caption, opts[o].mine ? tk.primaryDark : tk.muted, "Bold", 44, 18, "RIGHT");
    mkText(f, "pl-opt-n-" + o, opts[o].votes + " phiếu", gx + PW - 36, oy + 14,
      TY.micro, tk.faintInk, "Regular", 20, 14, "RIGHT");
  }

  // Footer: tổng + nút
  hline(f, "pl-line", gx + 16, py + 232, PW - 32, tk.line);
  mkText(f, "pl-foot", "4/6 người đã bỏ phiếu · còn 2", gx + 16, py + 244, TY.micro,
    tk.faintInk, "Regular", 240, 14);
  mkText(f, "pl-add", "Thêm lựa chọn", gx + PW - 132, py + 244, TY.micro,
    tk.primary, "Bold", 116, 14, "RIGHT");

  // Reaction count
  strokeRect(f, "pl-react", gx + 16, py + 284, 88, 28, tk.panel, 14, tk.line);
  mkText(f, "pl-react-e", "👍", gx + 26, py + 288, TY.label, tk.ink, "Regular", 20, 18);
  mkText(f, "pl-react-n", "3", gx + 46, py + 290, TY.tiny, tk.muted, "Bold", 12, 16);

  composerBar(f, tk, A, AW, {});

  // ── Modal tạo bình chọn ───────────────────────────────────────────────
  var MW = 460;
  var mx = RIGHT - MW - 24;
  var my = 108;
  var modal = rect(f, "pl-modal", mx, my, MW, 540, tk.panel, R.lg);
  shadowL(modal, "xl");

  mkText(f, "pl-modal-t", "Tạo bình chọn", mx + 24, my + 22, TY.heading, tk.ink, "Bold", 300, 28);
  iconButton(f, "pl-modal-x", "x", mx + MW - 60, my + 18, 36, tk.surface, tk.muted);

  // Câu hỏi
  mkText(f, "pl-modal-q-lb", "Câu hỏi", mx + 24, my + 68, TY.micro, tk.faintInk, "Bold", 100, 14);
  strokeRect(f, "pl-modal-q", mx + 24, my + 86, MW - 48, 52, tk.surface, R.sm, tk.line);
  mkText(f, "pl-modal-q-v", "Ăn trưa ở đâu?", mx + 40, my + 102, TY.label, tk.ink, "Regular", MW - 80, 20);

  // Lựa chọn
  mkText(f, "pl-modal-o-lb", "Lựa chọn", mx + 24, my + 156, TY.micro, tk.faintInk, "Bold", 100, 14);
  var optLabels = ["Cơm tấm", "Phở", "", ""];
  for (var oi = 0; oi < 4; oi++) {
    var oy2 = my + 174 + oi * 52;
    strokeRect(f, "pl-modal-opt-" + oi, mx + 24, oy2, MW - 48, 44, tk.surface, R.sm,
      optLabels[oi] ? tk.line : tk.surface);
    if (optLabels[oi]) {
      mkText(f, "pl-modal-opt-t-" + oi, optLabels[oi], mx + 40, oy2 + 12, TY.caption, tk.ink, "Regular", 300, 18);
      lucide(f, "pl-modal-opt-x-" + oi, "x", mx + MW - 60, oy2 + 13, 18, tk.faint);
    } else {
      lucide(f, "pl-modal-opt-plus-" + oi, "plus", mx + 40, oy2 + 11, 18, tk.faint);
      mkText(f, "pl-modal-opt-t-" + oi, "Thêm lựa chọn", mx + 66, oy2 + 12, TY.caption, tk.faintInk, "Regular", 200, 18);
    }
  }

  // Tuỳ chọn
  hline(f, "pl-modal-line", mx + 24, my + 396, MW - 48, tk.line);

  mkText(f, "pl-modal-anon", "Ẩn danh", mx + 24, my + 414, TY.caption, tk.ink, "Regular", 240, 18);
  mkText(f, "pl-modal-anon-s", "Không hiện ai bỏ phiếu", mx + 24, my + 432, TY.micro, tk.muted, "Regular", 240, 14);
  toggle(f, "pl-modal-anon-tg", mx + MW - 84, my + 414, false, tk);

  mkText(f, "pl-modal-multi", "Chọn nhiều đáp án", mx + 24, my + 462, TY.caption, tk.ink, "Regular", 240, 18);
  toggle(f, "pl-modal-multi-tg", mx + MW - 84, my + 462, true, tk);

  primaryButton(f, "pl-modal-btn", "Tạo bình chọn", mx + 24, my + 494, MW - 48, 44, tk, { icon: "check" });
  return f;
}

// S60 — Ai đã xem tin: popover Đã nhận / Đã xem theo từng thành viên nhóm.
// WhatsApp/Messenger có; Zalo chỉ "Đã xem" gộp ở chat 1-1.
function s60MessageInfo(fx) {
  var tk = L;
  var f = frame("S60 — Ai đã xem tin", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var hdr = chatHeader(f, tk, {
    name: "Koola Design", status: "4 thành viên", icons: ["phone", "video", "info"], group: true,
  });

  // Tin nhắn nhóm của mình (đã đọc)
  rect(f, "mi-b1", RIGHT - 24 - 340, 120, 340, 52, tk.primary, R.bub);
  mkText(f, "mi-m1", "Mọi người xem mockup mới giúp mình nhé", RIGHT - 24 - 322, 132, TY.label, tk.white, "Regular", 260, 20);
  mkText(f, "mi-t1", "10:24", RIGHT - 24 - 60, 152, TY.micro, tk.white, "Regular", 30, 14, "RIGHT");
  lucide(f, "mi-ticks1", "check-check", RIGHT - 26, 152, 16, tk.white);

  // Tin thứ 2 — chưa đọc hết
  rect(f, "mi-b2", RIGHT - 24 - 280, 184, 280, 52, tk.primary, R.bub);
  mkText(f, "mi-m2", "Deadline là thứ 6 nhé", RIGHT - 24 - 262, 196, TY.label, tk.white, "Regular", 220, 20);
  mkText(f, "mi-t2", "10:26", RIGHT - 24 - 60, 216, TY.micro, tk.white, "Regular", 30, 14, "RIGHT");
  lucide(f, "mi-ticks2", "check-check", RIGHT - 26, 216, 16, tk.white);

  // Tin nhắn từ người khác
  strokeRect(f, "mi-b3", A + 66, 248, 320, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "mi-m3", "Ok, mình xem rồi", A + 82, 260, TY.label, tk.ink, "Regular", 288, 20);

  // ── Popover chi tiết ──────────────────────────────────────────────────
  var px = RIGHT - 380;
  var py = 120;
  var PW = 356;
  var pop = rect(f, "mi-pop", px, py, PW, 420, tk.panel, R.md);
  shadowL(pop, "xl");

  mkText(f, "mi-pop-t", "Thông tin tin nhắn", px + 24, py + 20, TY.body, tk.ink, "Bold", 280, 22);
  iconButton(f, "mi-pop-x", "x", px + PW - 52, py + 16, 32, tk.surface, tk.muted);

  // Preview tin nhắn
  rect(f, "mi-prev", px + 24, py + 60, PW - 48, 44, tk.primary, R.sm);
  mkText(f, "mi-prev-t", "Mọi người xem mockup mới…", px + 36, py + 72, TY.caption, tk.white, "Regular", PW - 72, 18);

  // Tabs
  var tabs = [
    { lb: "Đã xem", n: 2, on: true },
    { lb: "Đã nhận", n: 1, on: false },
  ];
  var tw = (PW - 48) / 2;
  for (var t = 0; t < tabs.length; t++) {
    var tx = px + 24 + t * (tw + 4);
    rect(f, "mi-tab-" + t, tx, py + 124, tw - 2, 34, tabs[t].on ? tk.primarySoft : tk.surface, R.pill);
    mkText(f, "mi-tab-t-" + t, tabs[t].lb + " (" + tabs[t].n + ")", tx, py + 132, TY.tiny,
      tabs[t].on ? tk.primaryDark : tk.muted,
      tabs[t].on ? "Bold" : "Regular", tw - 2, 16, "CENTER");
  }

  var readers = [
    { n: "An Nguyễn", when: "10:24", read: true },
    { n: "Bình Trần", when: "10:25", read: true },
    { n: "Chị Lê", when: "10:26", read: false },
  ];
  for (var r = 0; r < readers.length; r++) {
    var ry = py + 178 + r * 62;
    circle(f, "mi-r-ava-" + r, px + 24, ry + 4, 40, tk.primarySoft);
    mkText(f, "mi-r-initial-" + r, readers[r].n.charAt(0), px + 24, ry + 15, TY.label,
      tk.primaryDark, "Bold", 40, 20, "CENTER");
    mkText(f, "mi-r-n-" + r, readers[r].n, px + 76, ry + 6, TY.caption, tk.ink, "Regular", 180, 18);
    mkText(f, "mi-r-w-" + r, readers[r].read ? "Đã xem lúc " + readers[r].when : "Đã nhận lúc " + readers[r].when,
      px + 76, ry + 26, TY.micro, readers[r].read ? tk.accentInk : tk.faintInk, "Regular", 220, 14);
    if (readers[r].read) {
      iconCentered(f, "mi-r-ck-" + r, "check-check", px + PW - 56, ry + 14, 24, 14, tk.accent);
    } else {
      iconCentered(f, "mi-r-ck1-" + r, "check", px + PW - 56, ry + 14, 24, 14, tk.faint);
    }
  }

  // Footer
  hline(f, "mi-pop-line", px + 24, py + 372, PW - 48, tk.line);
  mkText(f, "mi-pop-foot", "Đã gửi lúc 10:24 · 4 thành viên nhóm", px + 24, py + 386,
    TY.micro, tk.faintInk, "Regular", PW - 48, 14);

  composerBar(f, tk, A, AW, {});
  return f;
}

// S61 — Tin nhắn chờ & thư rác: hộp cách ly, preview giới hạn, Đồng ý/Xoá/Chặn.
// Messenger có; Zalo gộp chung phẳng nên spam lẫn vào hội thoại thật.
function s61MessageRequests(fx) {
  var tk = L;
  var f = frame("S61 — Tin nhắn chờ & thư rác", fx, tk.canvas);
  rail(f, 0, tk);

  // Cột trái: 2 khu cách ly
  rect(f, "mr-panel", RAIL_W, 0, 400, PAGE_H, tk.panel, 0);
  vline(f, "mr-panel-edge", RAIL_W + 400, 0, PAGE_H, tk.line);

  mkText(f, "mr-title", "Tin nhắn chờ", 96, 26, TY.heading, tk.ink, "Bold", 300, 28);
  mkText(f, "mr-count", "4 người lạ", 96, 54, TY.tiny, tk.muted, "Regular", 200, 16);

  // Khu 1 — Tin nhắn chờ
  mkText(f, "mr-grp-1", "Chờ duyệt · 3", 96, 92, TY.caption, tk.ink, "Bold", 300, 18);
  var reqs = [
    { n: "Người lạ 01", p: "Chào bạn, mình thấy profile...", t: "2 giờ", dot: true },
    { n: "Minh Lý", p: "Có phải bạn làm thiết kế?", t: "5 giờ" },
    { n: "Trần Văn Q", p: "Mình muốn hỏi về dịch vụ", t: "Hôm qua" },
  ];
  for (var r = 0; r < reqs.length; r++) {
    var ry = 118 + r * 76;
    circle(f, "mr-ava-" + r, 96, ry + 14, 48, tk.iconWell);
    iconCentered(f, "mr-ava-ic-" + r, "user-plus", 96, ry + 14, 48, 22, tk.faint);
    mkText(f, "mr-n-" + r, reqs[r].n, 156, ry + 14, TY.body, tk.ink, "Bold", 200, 20);
    mkText(f, "mr-p-" + r, reqs[r].p, 156, ry + 38, TY.bodySm, tk.muted, "Regular", 200, 18);
    mkText(f, "mr-t-" + r, reqs[r].t, 156, ry + 72, TY.micro, tk.faintInk, "Regular", 200, 14);
  }

  // Khu 2 — Thư rác
  mkText(f, "mr-grp-2", "Thư rác · 12", 96, 372, TY.caption, tk.muted, "Bold", 300, 18);
  var spam = [
    { n: "Khuyến mãi iPhone", p: "Giảm 70% chỉ hôm nay...", t: "3 ngày" },
    { n: "CryptoBot Pro", p: "X2 tài sản trong 24h", t: "T2" },
  ];
  for (var s = 0; s < spam.length; s++) {
    var sy = 398 + s * 76;
    circle(f, "mr-sp-ava-" + s, 96, sy + 14, 48, tk.surface);
    iconCentered(f, "mr-sp-ic-" + s, "flag", 96, sy + 14, 48, 20, tk.faint);
    mkText(f, "mr-sp-n-" + s, spam[s].n, 156, sy + 14, TY.body, tk.ink, "Regular", 200, 20);
    mkText(f, "mr-sp-p-" + s, spam[s].p, 156, sy + 38, TY.bodySm, tk.muted, "Regular", 200, 18);
    mkText(f, "mr-sp-t-" + s, spam[s].t, 156, sy + 72, TY.micro, tk.faintInk, "Regular", 200, 14);
  }

  primaryButton(f, "mr-clear", "Xoá hết thư rác", 96, 570, 300, 44, tk, { tone: "danger", flat: true });

  // ── Panel phải: chi tiết người lạ ─────────────────────────────────────
  var px = RAIL_W + 400 + 40;
  var PW = PAGE_W - px - 40;

  var card = rect(f, "mr-detail", px, 40, PW, 700, tk.panel, R.lg);
  shadowL(card, "md");

  // Banner cảnh báo
  var wb = rect(f, "mr-warn", px + 24, 64, PW - 48, 48, tk.warnSoft, R.sm);
  iconCentered(f, "mr-warn-ic", "shield", px + 40, 64, 48, 20, tk.warnInk);
  mkText(f, "mr-warn-t", "Người lạ · chưa kết bạn", px + 72, 78, TY.caption, tk.warnInk, "Bold", 300, 18);

  // Avatar lớn
  circle(f, "mr-big-ava", px + PW / 2 - 48, 132, 96, tk.iconWell);
  iconCentered(f, "mr-big-ic", "user-plus", px + PW / 2 - 48, 132, 96, 36, tk.faint);
  mkText(f, "mr-big-n", "Người lạ 01", px + 24, 240, TY.heading, tk.ink, "Bold", PW - 48, 28, "CENTER");
  mkText(f, "mr-big-sub", "Gửi lời mời kết bạn 2 giờ trước", px + 24, 270, TY.caption, tk.muted, "Regular", PW - 48, 18, "CENTER");

  // Preview tin nhắn (giới hạn 1 tin)
  mkText(f, "mr-big-lb", "Tin nhắn đầu tiên", px + 24, 320, TY.micro, tk.faintInk, "Bold", 300, 14);
  var pv = rect(f, "mr-big-prev", px + 24, 338, PW - 48, 100, tk.surface, R.sm);
  mkText(f, "mr-big-prev-t", "Chào bạn, mình thấy profile bạn trên Koola. Mình đang cần người thiết kế cho dự án",
    px + 40, 354, TY.caption, tk.ink, "Regular", PW - 80, 18);
  mkText(f, "mr-big-prev-more", "Chỉ hiện tin đầu tiên · đồng ý để xem tiếp",
    px + 40, 404, TY.micro, tk.faintInk, "Regular", PW - 80, 14);

  // 3 nút hành động
  var btnW = (PW - 48 - 2 * 12) / 3;
  var by = 466;

  primaryButton(f, "mr-accept", "Đồng ý", px + 24, by, btnW, 48, tk, { icon: "check" });

  strokeRect(f, "mr-decline", px + 24 + btnW + 12, by, btnW, 48, tk.panel, R.sm, tk.line);
  mkText(f, "mr-decline-t", "Xoá", px + 24 + btnW + 12, by + 14, TY.bodySm, tk.ink, "Bold", btnW, 20, "CENTER");

  strokeRect(f, "mr-block", px + 24 + (btnW + 12) * 2, by, btnW, 48, tk.panel, R.sm, tk.danger);
  mkText(f, "mr-block-t", "Chặn", px + 24 + (btnW + 12) * 2, by + 14, TY.bodySm, tk.dangerInk, "Bold", btnW, 20, "CENTER");

  // Ghi chú
  mkText(f, "mr-note", "Người lạ chỉ gửi được 1 tin cho tới khi bạn đồng ý.",
    px + 24, 536, TY.micro, tk.faintInk, "Regular", PW - 48, 14, "CENTER");
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S62 — Xem video toàn màn hình
// Khác S14 (lightbox ảnh): có thanh tua, tốc độ, PiP, dải video khác,
// và trạng thái đang tải. Zalo Web không có trình phát video trong chat.
// ═══════════════════════════════════════════════════════════════════════════

function s62VideoViewer(fx) {
  var tk = D;
  var f = frame("S62 — Xem video full", fx, "#080B10");

  // Nền: video 16:9 căn giữa, chừa thanh trên/dưới.
  var VW = 1120;
  var VH = Math.round(VW * 9 / 16);   // 630
  var vx = (PAGE_W - VW) / 2;         // 160
  var vy = 96;

  rect(f, "vv-stage", vx, vy, VW, VH, "#11151B", R.sm);
  iconCentered(f, "vv-stage-ic", "image", vx, vy, Math.min(VW, VH), 96, "#232A34");

  // ── Thanh trên ────────────────────────────────────────────────────────
  rect(f, "vv-top", 0, 0, PAGE_W, 72, "#080B10", 0, 0.86);
  avatar(f, "vv-ava", 24, 12, 48, "A", tk);
  mkText(f, "vv-name", "An Nguyễn", 84, 16, TY.body, tk.callInk, "Bold", 300, 20);
  mkText(f, "vv-when", "Hôm nay · 18,4 MB · 3:12", 84, 38, TY.tiny, tk.callInkDim,
    "Regular", 360, 16);

  iconButton(f, "vv-dl", "download", RIGHT - 168, 16, 40, tk.callChrome, tk.callInk);
  iconButton(f, "vv-more", "ellipsis", RIGHT - 120, 16, 40, tk.callChrome, tk.callInk);
  iconButton(f, "vv-close", "x", RIGHT - 72, 16, 40, tk.callChrome, tk.callInk);

  // ── Nút play giữa (trạng thái đang dừng) ──────────────────────────────
  var pcx = PAGE_W / 2 - 44;
  var pcy = vy + VH / 2 - 44;
  circle(f, "vv-play-halo", pcx - 10, pcy - 10, 108, tk.white, 0.12);
  circle(f, "vv-play-bg", pcx, pcy, 88, tk.white, 0.92);
  iconCentered(f, "vv-play-ic", "play", pcx, pcy, 88, 36, "#101828");

  // Nhãn đang tải — pill nhỏ góc phải trên video
  rect(f, "vv-buffer", vx + VW - 148, vy + 16, 132, 32, "#080B10", R.pill, 0.7);
  iconCentered(f, "vv-buffer-ic", "rotate-cw", vx + VW - 136, vy + 16, 32, 16, tk.callInkDim);
  mkText(f, "vv-buffer-t", "Đang tải 47%", vx + VW - 110, vy + 25, TY.micro,
    tk.callInkDim, "Bold", 88, 14);

  // ── Thanh điều khiển đáy video ────────────────────────────────────────
  var cy = vy + VH - 104;
  rect(f, "vv-ctrl", vx, cy, VW, 104, "#080B10", 0, 0.82);

  // Scrubber: đã phát 44%, đã đệm 68%
  var sX = vx + 24;
  var sW = VW - 48;
  var sY = cy + 22;
  rect(f, "vv-track", sX, sY, sW, 4, "#2A313B", 2);
  rect(f, "vv-buffered", sX, sY, Math.round(sW * 0.68), 4, "#3F4854", 2);
  rect(f, "vv-played", sX, sY, Math.round(sW * 0.44), 4, tk.primary, 2);
  circle(f, "vv-thumb", sX + Math.round(sW * 0.44) - 7, sY - 5, 14, tk.white);

  // Thời gian hai đầu
  mkText(f, "vv-t1", "1:24", sX, sY + 12, TY.micro, tk.callInkDim, "Regular", 60, 14);
  mkText(f, "vv-t2", "3:12", sX + sW - 60, sY + 12, TY.micro, tk.callInkDim,
    "Regular", 60, 14, "RIGHT");

  // Hàng nút dưới
  var bw = cy + 50;
  roundButton(f, "vv-b-play", "pause", sX, bw, 40, tk.callChrome, tk.callInk);
  roundButton(f, "vv-b-back", "rotate-cw", sX + 52, bw, 40, tk.callChrome, tk.callInk);
  roundButton(f, "vv-b-vol", "volume-2", sX + 104, bw, 40, tk.callChrome, tk.callInk);

  // Tốc độ
  rect(f, "vv-speed", sX + 164, bw + 6, 56, 28, tk.callChrome, R.pill);
  mkText(f, "vv-speed-t", "1.5x", sX + 164, bw + 12, TY.micro, tk.callInk, "Bold", 56, 14, "CENTER");

  // Phải: transcript, PiP, fullscreen
  roundButton(f, "vv-b-sub", "file-text", sX + sW - 144, bw, 40, tk.callChrome, tk.callInk);
  roundButton(f, "vv-b-pip", "grid", sX + sW - 96, bw, 40, tk.callChrome, tk.callInk);
  roundButton(f, "vv-b-full", "maximize", sX + sW - 48, bw, 40, tk.callChrome, tk.callInk);

  // ── Dải video khác ────────────────────────────────────────────────────
  var stripY = vy + VH + 20;
  mkText(f, "vv-strip-h", "Video khác trong hội thoại", vx, stripY, TY.micro,
    tk.callInkDim, "Bold", 400, 14);

  for (var i = 0; i < 5; i++) {
    var tw = 132, th = 74;
    var tx = vx + i * (tw + 12);
    var cur = i === 2;
    var tb = rect(f, "vv-thumb-" + i, tx, stripY + 22, tw, th,
      cur ? "#1B2430" : "#141920", R.sm);
    if (cur) {
      tb.strokes = [{ type: "SOLID", color: hx6(tk.primary) }];
      tb.strokeWeight = 2;
      tb.strokeAlign = "INSIDE";
    }
    iconCentered(f, "vv-thumb-ic-" + i, "image", tx, stripY + 22, th, 24, "#2E3742");
    if (i !== 2) {
      rect(f, "vv-thumb-veil-" + i, tx, stripY + 22 + th - 18, tw, 18, "#080B10", 0, 0.6);
      mkText(f, "vv-thumb-t-" + i, "0:" + (18 + i * 7), tx + tw - 42, stripY + 22 + th - 16,
        TY.micro, tk.callInkDim, "Regular", 34, 14, "RIGHT");
    } else {
      mkText(f, "vv-thumb-now", "Đang phát", tx + 8, stripY + 22 + th - 16, TY.micro,
        tk.primary, "Bold", 80, 14);
    }
  }

  // Gợi ý phím tắt
  mkText(f, "vv-keys", "Space phát/dừng · ← → tua 5s · F toàn màn hình · Esc đóng",
    vx, PAGE_H - 26, TY.tiny, "#5B6675", "Regular", VW, 16);
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART-SYS-1 · S63–S66
// S63 Hết phiên đăng nhập · S64 404 · S65 Mất kết nối · S66 Trung tâm thông báo
// Dùng chung token L/D, helper trong code.js. Không require/import.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// S63 — HẾT PHIÊN ĐĂNG NHẬP
// Màn tối nhẹ để tạo cảm giác gián đoạn; một việc duy nhất: đăng nhập lại.
// ═══════════════════════════════════════════════════════════════════════════

function s63SessionExpired(fx) {
  var tk = L;
  var f = frame("S63 — Hết phiên đăng nhập", fx, tk.callBg);

  var CX = PAGE_W / 2;
  var WELL = 96;
  var WELL_Y = 232;
  var TITLE_Y = 360;
  var BODY_W = 460;
  var BODY_Y = 404;
  var BTN_W = 220;
  var BTN_H = 52;
  var BTN_Y = 456;
  var LINK_Y = 530;
  var MARK = 28;
  var MARK_Y = 786;
  var WORD_Y = 820;

  // Vòng khóa giữa màn
  circle(f, "se-well", CX - WELL / 2, WELL_Y, WELL, tk.callChrome);
  iconCentered(f, "se-lock", "lock", CX - WELL / 2, WELL_Y, WELL, 40, tk.callInkDim);

  mkText(f, "se-title", "Phiên đăng nhập đã hết hạn", 0, TITLE_Y, TY.title,
    tk.callInk, "Bold", PAGE_W, 32, "CENTER");
  mkText(f, "se-sub", "Vì lý do bảo mật, bạn cần đăng nhập lại để tiếp tục.",
    CX - BODY_W / 2, BODY_Y, TY.bodySm, tk.callInkDim, "Regular", BODY_W, 22, "CENTER");

  primaryButton(f, "se-cta", "Đăng nhập lại", CX - BTN_W / 2, BTN_Y, BTN_W, BTN_H,
    tk, { icon: "arrow-right" });

  mkText(f, "se-logout", "Đăng xuất khỏi mọi thiết bị", 0, LINK_Y, TY.caption,
    tk.callInkDim, "Regular", PAGE_W, 18, "CENTER");

  // Góc trên phải: thiết bị đang giữ phiên — cả cụm dóng mép RIGHT
  var DEV_TXT_W = 208;
  var DEV_ICON = 16;
  var DEV_GAP = 8;
  var devX = RIGHT - DEV_TXT_W - DEV_GAP - DEV_ICON;
  lucide(f, "se-device-ic", "laptop", devX, 27, DEV_ICON, tk.callInkDim);
  mkText(f, "se-device", "Thiết bị: MacBook Pro · Chrome", devX + DEV_ICON + DEV_GAP,
    26, TY.micro, tk.callInkDim, "Regular", DEV_TXT_W, 16, "RIGHT");

  // Đáy: brand mark 3 cung + wordmark, cùng ngôn ngữ với logo
  var mx = CX - MARK / 2;
  arc(f, "se-arc-r", mx, MARK_Y, MARK, 0, 90, tk.brandRed);
  arc(f, "se-arc-b", mx, MARK_Y, MARK, 120, 210, tk.brandBlue);
  arc(f, "se-arc-g", mx, MARK_Y, MARK, 240, 330, tk.brandGreen);
  mkText(f, "se-word", "KOOLA", 0, WORD_Y, TY.micro, tk.callInkDim, "Bold", PAGE_W, 14, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S64 — 404
// Bố cục thoáng: số 404 mờ làm nền, đĩa surface đè lên chân số để tạo chiều sâu.
// ═══════════════════════════════════════════════════════════════════════════

function s64NotFound(fx) {
  var tk = L;
  var f = frame("S64 — 404", fx, tk.canvas);

  var CX = PAGE_W / 2;
  var BIG = 96;
  var BIG_Y = 220;
  var BIG_LH = 112;
  var WELL = 120;
  var WELL_Y = 270;          // tâm 330 — đè lên nửa dưới số 404
  var TITLE_Y = 500;
  var BODY_W = 480;
  var BODY_Y = 536;
  var BTN_W = 200;
  var BTN_H = 48;
  var BTN_Y = 584;
  var LINK_Y = 660;

  // Số 404 rất lớn, màu line — chỉ là nền trang trí
  mkText(f, "nf-404", "404", 0, BIG_Y, BIG, tk.line, "Bold", PAGE_W, BIG_LH, "CENTER");

  circle(f, "nf-well", CX - WELL / 2, WELL_Y, WELL, tk.surface);
  iconCentered(f, "nf-ic", "search", CX - WELL / 2, WELL_Y, WELL, 44, tk.faint);

  mkText(f, "nf-title", "Không tìm thấy trang này", 0, TITLE_Y, TY.heading,
    tk.ink, "Bold", PAGE_W, 26, "CENTER");
  mkText(f, "nf-sub", "Đường dẫn có thể sai hoặc trang đã bị xoá.",
    CX - BODY_W / 2, BODY_Y, TY.bodySm, tk.muted, "Regular", BODY_W, 20, "CENTER");

  primaryButton(f, "nf-cta", "Về trang chính", CX - BTN_W / 2, BTN_Y, BTN_W, BTN_H,
    tk, { icon: "arrow-left" });

  mkText(f, "nf-report", "Báo lỗi cho chúng tôi", 0, LINK_Y, TY.caption,
    tk.primary, "Bold", PAGE_W, 18, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S65 — MẤT KẾT NỐI TOÀN BỘ
// Shell thật bị phủ mờ, chỉ còn banner + trạng thái giữa vùng chat.
// ═══════════════════════════════════════════════════════════════════════════

function s65Offline(fx) {
  var tk = L;
  var f = frame("S65 — Mất kết nối toàn bộ", fx, tk.canvas);

  // Shell bình thường — sẽ bị phủ mờ phần chat
  rail(f, 0, tk);
  listPanel(f, tk);
  for (var i = 0; i < 6; i++) convRow(f, 88, 84 + i * 76, 308, CONVS[i], tk);

  // Lớp mờ vùng chat
  rect(f, "of-dim", LIST_END, 0, PAGE_W - LIST_END, PAGE_H, tk.canvas, 0, 0.6);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  var CX = MID;
  var WELL = 140;
  var WELL_Y = 230;
  var TITLE_Y = 400;
  var SUB_Y = 436;
  var BTN_W = 200;
  var BTN_H = 48;
  var BTN_Y = 480;
  var RETRY_Y = 546;
  var NOTE_Y = 606;
  var NOTE_STEP = 28;
  var BANNER_H = 64;

  circle(f, "of-well", CX - WELL / 2, WELL_Y, WELL, tk.surface);
  iconCentered(f, "of-ic", "wifi-off", CX - WELL / 2, WELL_Y, WELL, 52, tk.faint);

  mkText(f, "of-title", "Không có kết nối internet", A, TITLE_Y, TY.heading,
    tk.ink, "Bold", AW, 26, "CENTER");
  mkText(f, "of-sub", "Kiểm tra Wi-Fi hoặc dữ liệu di động của bạn.", A, SUB_Y,
    TY.bodySm, tk.muted, "Regular", AW, 20, "CENTER");

  primaryButton(f, "of-cta", "Thử kết nối lại", CX - BTN_W / 2, BTN_Y, BTN_W, BTN_H,
    tk, { icon: "rotate-cw" });

  mkText(f, "of-retry", "Đang thử lại sau 5 giây…", A, RETRY_Y, TY.tiny,
    tk.faintInk, "Regular", AW, 16, "CENTER");

  // 3 dòng trạng thái — mỗi dòng là cặp icon + chữ, căn giữa theo cột
  var notes = [
    { ic: "archive", t: "Tin đã soạn được lưu tạm", w: 170 },
    { ic: "clock", t: "Đang chờ gửi: 2 tin", w: 130 },
    { ic: "phone-off", t: "Cuộc gọi sẽ không khả dụng", w: 190 },
  ];
  for (var n = 0; n < notes.length; n++) {
    var ny = NOTE_Y + n * NOTE_STEP;
    var gx = CX - (16 + 8 + notes[n].w) / 2;
    lucide(f, "of-note-ic-" + n, notes[n].ic, gx, ny, 16, tk.muted);
    mkText(f, "of-note-" + n, notes[n].t, gx + 24, ny, TY.tiny, tk.faintInk,
      "Regular", notes[n].w, 16);
  }

  // Banner trên cùng — vẽ sau cùng để luôn rõ trên nền mờ
  rect(f, "of-banner", 0, 0, PAGE_W, BANNER_H, tk.warnSoft, 0);
  lucide(f, "of-banner-ic", "wifi-off", 24, 21, 22, tk.warnInk);
  mkText(f, "of-banner-t", "Bạn đang ngoại tuyến", 58, 13, TY.bodySm,
    tk.warnInk, "Bold", 480, 18);
  mkText(f, "of-banner-s", "Tin nhắn sẽ được gửi khi có mạng", 58, 35, TY.tiny,
    tk.warnInk, "Regular", 480, 16);
  mkText(f, "of-banner-act", "Thử lại", RIGHT - 24 - 80, 22, TY.caption,
    tk.warnInk, "Bold", 80, 18, "RIGHT");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S66 — TRUNG TÂM THÔNG BÁO
// Panel phải 420px: 2 tab, nhóm theo thời gian, item 76px, chấm chưa đọc.
// ═══════════════════════════════════════════════════════════════════════════

function s66NotificationCenter(fx) {
  var tk = L;
  var f = frame("S66 — Trung tâm thông báo", fx, tk.chat);

  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 84 + i * 76, 308, CONVS[i], tk);

  // ── Vùng chat (thu hẹp còn 412..1020) ─────────────────────────────────
  var A = LIST_END;
  var PX = 1020;
  var CW = PX - A;

  rect(f, "nc-header", A, 0, CW, 76, tk.panel, 0);
  hline(f, "nc-header-line", A, 75, CW, tk.line);
  avatar(f, "nc-header-ava", A + 24, 14, 48, "A", tk);
  circle(f, "nc-header-dot-ring", A + 56, 48, 16, tk.panel);
  circle(f, "nc-header-dot", A + 58, 50, 12, tk.online);
  mkText(f, "nc-header-name", "An Nguyễn", A + 84, 19, TY.body, tk.ink, "Bold", 240, 20);
  mkText(f, "nc-header-status", "Đang hoạt động", A + 84, 41, TY.caption,
    tk.accentInk, "Regular", 240, 18);

  var hIcons = ["phone", "video", "info"];
  for (var h = 0; h < hIcons.length; h++) {
    var hx = PX - 24 - 40 - (hIcons.length - 1 - h) * 48;
    iconButton(f, "nc-hbtn-" + h, hIcons[h], hx, 18, 40, tk.surface, tk.ink);
  }

  strokeRect(f, "nc-bub-1", A + 66, 130, 300, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "nc-msg-1", "Cậu xem thông báo chưa?", A + 82, 142, TY.label,
    tk.ink, "Regular", 268, 20);
  rect(f, "nc-bub-2", A + CW - 24 - 280, 186, 280, 44, tk.primary, R.bub);
  mkText(f, "nc-msg-2", "Mình đang mở đây", A + CW - 24 - 262, 198, TY.label,
    tk.white, "Regular", 244, 20);

  composerBar(f, tk, A, CW, {});

  // ── Panel thông báo 420px ─────────────────────────────────────────────
  var PW = PAGE_W - PX;
  var IX = PX + 24;
  var IEND = PAGE_W - 24;
  var ITEM_H = 76;
  var AV = 40;

  rect(f, "nc-panel", PX, 0, PW, PAGE_H, tk.panel, 0);
  vline(f, "nc-panel-edge", PX, 0, PAGE_H, tk.line);

  mkText(f, "nc-title", "Thông báo", IX, 26, TY.heading, tk.ink, "Bold", 240, 26);
  iconButton(f, "nc-read-all", "check-check", IEND - 88, 16, 40, tk.surface, tk.primaryDark);
  iconButton(f, "nc-close", "x", IEND - 40, 16, 40, tk.surface, tk.ink);

  // 2 tab
  var TAB_W = 180;
  var TAB_H = 36;
  var TAB_Y = 68;
  var tabs = [
    { label: "Tất cả · 12", active: true },
    { label: "Chưa đọc · 5", active: false },
  ];
  for (var t = 0; t < tabs.length; t++) {
    var tx = IX + t * (TAB_W + 12);
    rect(f, "nc-tab-" + t, tx, TAB_Y, TAB_W, TAB_H,
      tabs[t].active ? tk.primarySoft : tk.surface, R.pill);
    mkText(f, "nc-tab-t-" + t, tabs[t].label, tx, TAB_Y + 8, TY.caption,
      tabs[t].active ? tk.primaryDark : tk.muted,
      tabs[t].active ? "Bold" : "Regular", TAB_W, 20, "CENTER");
  }

  var groups = [
    { label: "Hôm nay", items: [
      { ini: "A", title: "Nhắc đến bạn", sub: "An Nguyễn nhắc đến bạn trong Koola Design", time: "10:24", unread: true },
      { ini: "K", title: "Tin nhắn mới", sub: "Koola Dev có 5 tin nhắn mới", time: "09:12", unread: true },
      { ini: "M", title: "Cảm xúc mới", sub: "Mẹ đã thả ❤️ vào tin nhắn của bạn", time: "08:40", unread: false },
      { ini: "D", title: "Lời mời vào nhóm", sub: "Design Team thêm bạn vào nhóm", time: "07:58", unread: true },
      { ini: "B", title: "Cuộc gọi nhỡ", sub: "Cuộc gọi nhỡ từ Bình Trần", time: "07:15", unread: false },
    ] },
    { label: "Hôm qua", items: [
      { ini: "A", title: "Tệp mới", sub: "An Nguyễn đã gửi koola-design-v2.fig", time: "18:30", unread: false },
      { ini: "N", title: "Nhắc hẹn", sub: "Họp nhóm thứ 6 lúc 15:00", time: "14:05", unread: false },
      { ini: "K", title: "Bảo mật", sub: "Thiết bị mới đăng nhập vào tài khoản", time: "09:20", unread: false },
    ] },
  ];

  var y = 124;
  for (var g = 0; g < groups.length; g++) {
    mkText(f, "nc-grp-" + g, groups[g].label, IX, y, TY.micro, tk.faintInk, "Bold", 200, 14);
    y += 20;

    var items = groups[g].items;
    for (var n = 0; n < items.length; n++) {
      var it = items[n];
      avatar(f, "nc-ava-" + g + "-" + n, IX, y + 18, AV, it.ini, tk);
      mkText(f, "nc-it-title-" + g + "-" + n, it.title, IX + 52, y + 18,
        TY.caption, tk.ink, "Bold", 240, 18);
      mkText(f, "nc-it-sub-" + g + "-" + n, it.sub, IX + 52, y + 38,
        TY.tiny, tk.muted, "Regular", 260, 16);
      mkText(f, "nc-it-time-" + g + "-" + n, it.time, IEND - 56, y + 19,
        TY.micro, tk.faintInk, "Regular", 44, 14, "RIGHT");
      if (it.unread) circle(f, "nc-it-dot-" + g + "-" + n, IEND - 8, y + 37, 8, tk.primary);
      if (n < items.length - 1) {
        hline(f, "nc-it-sep-" + g + "-" + n, IX + 52, y + ITEM_H, IEND - IX - 52, tk.line);
      }
      y += ITEM_H;
    }
    y += 8;
  }

  hline(f, "nc-foot-line", IX, 812, IEND - IX, tk.line);
  mkText(f, "nc-foot", "Xem tất cả thông báo", IX, 836, TY.tiny, tk.primary,
    "Bold", IEND - IX, 16, "CENTER");

  return f;
}


// ═══════════════════════════════════════════════════════════════════════════
// S67–S70 — TIN ĐÃ LƯU · GHIM · LINK PREVIEW · MENTION
// ═══════════════════════════════════════════════════════════════════════════

function s67StarredMessages(fx) {
  var tk = L;
  var f = frame("S67 — Tin nhắn đã lưu", fx, tk.canvas);
  rail(f, 0, tk);

  // ── Panel trái — cùng bề ngang với listPanel chuẩn ────────────────────
  var PX = LIST_X;
  var PW = LIST_W;
  var PE = PX + PW;
  var PAD_L = PX + 24;
  var INNER = PW - 48;

  rect(f, "s67-panel", PX, 0, PW, PAGE_H, tk.panel, 0);
  vline(f, "s67-panel-edge", PE, 0, PAGE_H, tk.line);

  mkText(f, "s67-title", "Tin nhắn đã lưu", PAD_L, 26, TY.heading, tk.ink, "Bold", 260, 28);
  iconButton(f, "s67-star", "star", PE - 24 - 44, 20, 44, tk.warnSoft, tk.warnInk);

  searchBar(f, 68, INNER, tk, "Tìm trong tin đã lưu");

  // ── 5 tin đã lưu ───────────────────────────────────────────────────────
  var ITEM_H = 88;
  var ITEM_Y = 132;
  var items = [
    { name: "An Nguyễn", l1: "File thiết kế mình gửi rồi nhé", l2: "koola-design-v2.fig · 24,8 MB", time: "10:22" },
    { name: "Koola Dev", l1: "Link tài liệu API staging", l2: "https://docs.koola.app/api", time: "09:12" },
    { name: "Mẹ", l1: "Số điện thoại bác sĩ 0909…", l2: "Hẹn khám 9h sáng mai", time: "Hôm qua" },
    { name: "Bình Trần", l1: "Địa chỉ quán cà phê", l2: "12 Nguyễn Huệ, Quận 1", time: "T2" },
    { name: "Design Team", l1: "Mật khẩu wifi công ty", l2: "koola@2026", time: "T2" },
  ];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var iy = ITEM_Y + i * ITEM_H;
    var active = i === 0;

    if (active) {
      rect(f, "s67-row-bg-" + i, PAD_L, iy, INNER, ITEM_H, tk.primarySoft, R.md, 0.55);
      rect(f, "s67-row-bar-" + i, PAD_L, iy + 16, 3, ITEM_H - 32, tk.primary, 2);
    }

    avatar(f, "s67-ava-" + i, PAD_L + 14, iy + 26, 36, it.name.charAt(0), tk);

    mkText(f, "s67-name-" + i, it.name, PAD_L + 62, iy + 16, TY.label,
      tk.ink, "Bold", 170, 20);
    mkText(f, "s67-time-" + i, it.time, PAD_L + INNER - 14 - 88, iy + 18, TY.caption,
      tk.faintInk, "Regular", 88, 16, "RIGHT");
    lucide(f, "s67-star-" + i, "star", PAD_L + INNER - 14 - 16, iy + 44, 16, tk.warnInk);

    mkText(f, "s67-l1-" + i, it.l1, PAD_L + 62, iy + 38, TY.bodySm,
      active ? tk.ink : tk.muted, "Regular", 210, 18);
    mkText(f, "s67-l2-" + i, it.l2, PAD_L + 62, iy + 56, TY.caption,
      tk.faintInk, "Regular", 210, 16);
  }

  caption(f, "12 tin đã lưu · đồng bộ mọi thiết bị", PAD_L, 848, INNER, tk);

  // ── Vùng phải: tin đang chọn ───────────────────────────────────────────
  var RX = PE;
  var RW = PAGE_W - PE;
  rect(f, "s67-chat", RX, 0, RW, PAGE_H, tk.chat, 0);
  rect(f, "s67-head", RX, 0, RW, 76, tk.panel, 0);
  hline(f, "s67-head-line", RX, 76, RW, tk.line);

  lucide(f, "s67-head-star", "star", RX + 28, 30, 18, tk.warnInk);
  mkText(f, "s67-head-t", "Đã lưu từ An Nguyễn · Hôm nay 10:22", RX + 54, 26,
    TY.bodySm, tk.muted, "Regular", 520, 22);

  // ── Bubble lớn ─────────────────────────────────────────────────────────
  var BW = 520;
  var BX = Math.round((RX + PAGE_W) / 2 - BW / 2);
  var BY = 300;
  var BH = 140;

  var bub = strokeRect(f, "s67-bubble", BX, BY, BW, BH, tk.bubbleOther, R.bub, tk.bubbleBorder);
  shadowL(bub, "sm");

  mkText(f, "s67-msg", "File thiết kế mình gửi rồi nhé", BX + 20, BY + 18,
    TY.label, tk.ink, "Regular", BW - 40, 20);

  // Card file trong bubble
  var CX = BX + 20;
  var CY = BY + 52;
  var CW = BW - 40;
  var CH = 64;
  strokeRect(f, "s67-file", CX, CY, CW, CH, tk.surface, R.sm, tk.line);

  rect(f, "s67-file-well", CX + 12, CY + 12, 40, 40, tk.iconWell, R.xs);
  iconCentered(f, "s67-file-ic", "file-text", CX + 12, CY + 12, 40, 20, tk.primaryDark);

  mkText(f, "s67-file-name", "koola-design-v2.fig", CX + 64, CY + 13, TY.label,
    tk.ink, "Bold", CW - 140, 18);
  mkText(f, "s67-file-size", "24,8 MB · Figma", CX + 64, CY + 33, TY.caption,
    tk.muted, "Regular", CW - 140, 16);

  iconButton(f, "s67-file-dl", "download", CX + CW - 12 - 36, CY + 14, 36, tk.panel, tk.primaryDark);

  // ── Nút "Bỏ đánh dấu" phía trên phải bubble ────────────────────────────
  var UX = BX + BW - 132;
  var UY = BY - 46;
  var unstar = strokeRect(f, "s67-unstar", UX, UY, 132, 34, tk.panel, R.pill, tk.line);
  iconCentered(f, "s67-unstar-ic", "x", UX + 8, UY, 34, 16, tk.muted);
  mkText(f, "s67-unstar-t", "Bỏ đánh dấu", UX + 30, UY + 9, TY.tiny,
    tk.muted, "Regular", 96, 16);

  // ── Thanh hành động dưới bubble ────────────────────────────────────────
  var AY = BY + BH + 18;
  var acts = [
    { ic: "forward", lb: "Chuyển tiếp", bg: tk.panel, fg: tk.ink },
    { ic: "copy", lb: "Sao chép", bg: tk.panel, fg: tk.ink },
    { ic: "trash-2", lb: "Bỏ lưu", bg: tk.dangerSoft, fg: tk.danger },
  ];
  for (var a = 0; a < acts.length; a++) {
    var ax = BX + a * 96;
    iconButton(f, "s67-act-" + a, acts[a].ic, ax, AY, 40, acts[a].bg, acts[a].fg);
    mkText(f, "s67-act-lb-" + a, acts[a].lb, ax - 28, AY + 48, TY.micro,
      tk.faintInk, "Regular", 96, 14, "CENTER");
  }

  return f;
}

// ───────────────────────────────────────────────────────────────────────────

function s68PinnedMessages(fx) {
  var tk = L;
  var f = frame("S68 — Tin đã ghim", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  // ── Vùng chat hẹp vì có panel phải ─────────────────────────────────────
  var A = LIST_END;                 // 412
  var PANEL_X = 1020;
  var AW = PANEL_X - A;             // 608
  var RE = PANEL_X - 24;            // mép phải bubble của mình: 996

  chatHeader(f, tk, {
    name: "An Nguyễn",
    status: "Đang hoạt động",
    icons: [],
  });
  iconButton(f, "s68-h-phone", "phone", RE - 92, 18, 40, tk.surface, tk.ink);
  iconButton(f, "s68-h-video", "video", RE - 44, 18, 40, tk.surface, tk.ink);

  // ── Thanh tin ghim trên cùng vùng chat ─────────────────────────────────
  rect(f, "s68-pinbar", A, 76, AW, 44, tk.surface, 0);
  hline(f, "s68-pinbar-line", A, 119, AW, tk.line);
  rect(f, "s68-pinbar-accent", A + 24, 88, 3, 20, tk.primary, 2);
  lucide(f, "s68-pinbar-ic", "pin", A + 36, 88, 20, tk.primary);
  mkText(f, "s68-pinbar-t", "3 tin đã ghim", A + 62, 88, TY.caption,
    tk.ink, "Regular", 300, 18);
  lucide(f, "s68-pinbar-chev", "chevron-down", RE - 20, 89, 20, tk.faint);

  // ── Bubble ngữ cảnh ────────────────────────────────────────────────────
  var L0 = A + 66;                  // 478

  strokeRect(f, "s68-b1", L0, 144, 300, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "s68-m1", "Họp nhóm thứ 6 lúc 15:00 nhé", L0 + 16, 156, TY.label,
    tk.ink, "Regular", 268, 20);

  var own1 = rect(f, "s68-b2", RE - 280, 200, 280, 44, tk.primary, R.bub);
  corners(own1, R.bub, R.bub, R.xs2, R.bub);
  mkText(f, "s68-m2", "Ok, mình ghim lại rồi", RE - 264, 212, TY.label,
    tk.white, "Regular", 190, 20);
  mkText(f, "s68-t2", "10:24", RE - 62, 220, TY.micro, tk.white, "Regular", 30, 14, "RIGHT");
  lucide(f, "s68-ticks", "check-check", RE - 28, 220, 16, tk.white);

  strokeRect(f, "s68-b3", L0, 256, 280, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "s68-m3", "Nhớ gửi link build staging", L0 + 16, 268, TY.label,
    tk.ink, "Regular", 248, 20);

  composerBar(f, tk, A, AW, {});

  // ── Panel phải: danh sách tin đã ghim ──────────────────────────────────
  rect(f, "s68-panel", PANEL_X, 0, PAGE_W - PANEL_X, PAGE_H, tk.panel, 0);
  vline(f, "s68-panel-edge", PANEL_X, 0, PAGE_H, tk.line);

  var PAD = 24;
  var PX = PANEL_X + PAD;           // 1044
  var PW = PAGE_W - PANEL_X - PAD * 2;   // 372

  mkText(f, "s68-panel-title", "Tin đã ghim · 3", PX, 26, TY.heading,
    tk.ink, "Bold", PW - 60, 28);
  iconButton(f, "s68-panel-x", "x", PX + PW - 40, 18, 40, tk.surface, tk.muted);

  var cards = [
    { name: "An Nguyễn", when: "10:24", l1: "Họp nhóm thứ 6 lúc 15:00", l2: "Mọi người nhớ lên lịch", sel: true },
    { name: "Bạn", when: "09:12", l1: "Deadline nộp báo cáo Q4", l2: "Nhắc mình trước 2 ngày" },
    { name: "Koola Dev", when: "Hôm qua", l1: "Link build staging mới", l2: "https://staging.koola.app" },
  ];
  var CARD_H = 116;
  var CARD_GAP = 12;
  var cardY = 80;

  for (var c = 0; c < cards.length; c++) {
    var cd = cards[c];
    var cy = cardY + c * (CARD_H + CARD_GAP);
    var node = strokeRect(f, "s68-card-" + c, PX, cy, PW, CARD_H, tk.surface, R.md,
      cd.sel ? tk.primary : tk.line);
    if (cd.sel) node.strokeWeight = 2;

    avatar(f, "s68-card-ava-" + c, PX + 14, cy + 12, 32, cd.name.charAt(0), tk);
    mkText(f, "s68-card-name-" + c, cd.name, PX + 58, cy + 12, TY.caption,
      tk.ink, "Bold", 180, 18);
    mkText(f, "s68-card-when-" + c, cd.when, PX + PW - 14 - 84, cy + 13, TY.micro,
      tk.faintInk, "Regular", 84, 14, "RIGHT");

    mkText(f, "s68-card-l1-" + c, cd.l1, PX + 14, cy + 52, TY.caption,
      tk.ink, "Regular", PW - 28, 17);
    mkText(f, "s68-card-l2-" + c, cd.l2, PX + 14, cy + 70, TY.caption,
      tk.muted, "Regular", PW - 28, 17);

    lucide(f, "s68-card-pin-" + c, "pin", PX + 14, cy + 92, 14, tk.primary);
    mkText(f, "s68-card-unpin-" + c, "Bỏ ghim", PX + 34, cy + 90, TY.micro,
      tk.primary, "Bold", 100, 16);
  }

  // ── Nút ghim tin hiện tại ──────────────────────────────────────────────
  var GB_Y = PAGE_H - PAD - 44;
  hline(f, "s68-foot-line", PX, GB_Y - 20, PW, tk.line);
  var gb = rect(f, "s68-pin-now", PX, GB_Y, PW, 44, tk.surface, R.sm);
  hairline(gb, tk.line);
  iconCentered(f, "s68-pin-now-ic", "pin", PX, GB_Y, 44, 18, tk.primary);
  mkText(f, "s68-pin-now-t", "Ghim tin hiện tại", PX + 30, GB_Y + 12, TY.label,
    tk.primaryDark, "Bold", PW - 30, 20, "CENTER");

  return f;
}

// ───────────────────────────────────────────────────────────────────────────

function s69LinkPreview(fx) {
  var tk = L;
  var f = frame("S69 — Xem trước liên kết", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");
  for (var i = 0; i < 5; i++) convRow(f, 88, 148 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = chatHeader(f, tk, {
    name: "An Nguyễn",
    status: "Đang hoạt động",
    icons: ["phone", "video", "search", "info"],
  });

  var L0 = A + 66;                  // 478
  var FULL_R = RIGHT;               // 1416

  // ── Bubble 1: link preview dạng thẻ ────────────────────────────────────
  var B1W = 460;
  var B1H = 212;
  var B1Y = 104;
  var b1 = strokeRect(f, "s69-b1", L0, B1Y, B1W, B1H, tk.bubbleOther, R.bub, tk.bubbleBorder);
  shadowL(b1, "sm");

  mkText(f, "s69-b1-txt", "Xem thiết kế mới ở đây nhé https://figma.com/file/koola-v2",
    L0 + 16, B1Y + 14, TY.label, tk.ink, "Regular", B1W - 32, 20);

  var C1X = L0 + 22;
  var C1Y = B1Y + 60;
  var C1W = 416;
  var C1H = 140;
  var card1 = strokeRect(f, "s69-card1", C1X, C1Y, C1W, C1H, tk.surface, R.sm, tk.line);

  var thumb = rect(f, "s69-card1-thumb", C1X, C1Y, C1H, C1H, tk.iconWell, 0);
  corners(thumb, R.sm, 0, 0, R.sm);
  iconCentered(f, "s69-card1-ic", "image", C1X, C1Y, C1H, 32, tk.muted);

  var TX = C1X + C1H + 16;
  var TW = C1X + C1W - 16 - TX;
  mkText(f, "s69-card1-domain", "figma.com", TX, C1Y + 16, TY.micro,
    tk.faintInk, "Regular", TW, 14);
  mkText(f, "s69-card1-title", "Koola Design v2 — Figma", TX, C1Y + 36, TY.caption,
    tk.ink, "Bold", TW, 16);
  mkText(f, "s69-card1-desc", "Bản thiết kế mới nhất của Koola Web", TX, C1Y + 74,
    TY.tiny, tk.muted, "Regular", TW, 15);

  // ── Bubble 2: trả lời ──────────────────────────────────────────────────
  var B2Y = B1Y + B1H + 12;
  var B2W = 180;
  rect(f, "s69-b2", FULL_R - B2W, B2Y, B2W, 44, tk.primary, R.bub);
  mkText(f, "s69-b2-txt", "Ok mình mở xem", FULL_R - B2W + 16, B2Y + 12, TY.label,
    tk.white, "Regular", B2W - 32, 20);

  // ── Bubble 3: preview video ────────────────────────────────────────────
  var B3W = 332;
  var B3Y = B2Y + 44 + 12;
  var B3H = 248;
  var b3 = strokeRect(f, "s69-b3", L0, B3Y, B3W, B3H, tk.bubbleOther, R.bub, tk.bubbleBorder);
  shadowL(b3, "sm");

  mkText(f, "s69-b3-txt", "Hướng dẫn dùng Koola Web", L0 + 16, B3Y + 12,
    TY.label, tk.ink, "Regular", B3W - 32, 20);

  var VX = L0 + 16;
  var VY = B3Y + 40;
  var VW = 300;
  var VH = 170;
  var vthumb = rect(f, "s69-vthumb", VX, VY, VW, VH, tk.iconWell, 0);
  corners(vthumb, R.sm, R.sm, 0, 0);

  circle(f, "s69-vplay-bg", VX + VW / 2 - 28, VY + VH / 2 - 28, 56, tk.white, 0.94);
  iconCentered(f, "s69-vplay-ic", "play", VX + VW / 2 - 28, VY + VH / 2 - 28, 56, 24, "#101828");

  hline(f, "s69-vmeta-line", VX, VY + VH, VW, tk.line);
  mkText(f, "s69-vmeta", "youtube.com · 3:12", VX + 12, VY + VH + 5, TY.micro,
    tk.faintInk, "Regular", VW - 24, 14);

  // ── Bubble 4: card compact ─────────────────────────────────────────────
  var B4W = 320;
  var B4H = 64;
  var B4Y = B3Y + B3H + 12;
  rect(f, "s69-b4", FULL_R - B4W, B4Y, B4W, B4H, tk.primary, R.bub);
  circle(f, "s69-b4-well", FULL_R - B4W + 14, B4Y + 14, 36, tk.white, 0.18);
  iconCentered(f, "s69-b4-ic", "globe", FULL_R - B4W + 14, B4Y + 14, 36, 18, tk.white);
  mkText(f, "s69-b4-domain", "figma.com", FULL_R - B4W + 62, B4Y + 13, TY.micro,
    tk.white, "Regular", B4W - 76, 14);
  mkText(f, "s69-b4-title", "Koola Design v2 — Figma", FULL_R - B4W + 62, B4Y + 30,
    TY.caption, tk.white, "Bold", B4W - 76, 16);

  // ── Ghi chú cuối vùng chat ─────────────────────────────────────────────
  lucide(f, "s69-note-ic", "info", L0, 762, 16, tk.faint);
  mkText(f, "s69-note",
    "Link preview tự tạo khi có Open Graph · có thể tắt trong Cài đặt → Quyền riêng tư",
    L0 + 24, 760, TY.caption, tk.faintInk, "Regular", 820, 18);

  composerBar(f, tk, A, AW, {});
  return f;
}

// ───────────────────────────────────────────────────────────────────────────

function s70MentionAutocomplete(fx) {
  var tk = L;
  var f = frame("S70 — Gợi ý @nhắc đến", fx, tk.chat);
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  searchBar(f, 84, 288, tk, "Tìm kiếm");

  var rows = [
    { id: "g1", name: "Koola Design", preview: "Bình: Nhờ @An Nguyễn xem giúp", time: "10:30", unread: "3", active: true },
    { id: "2", name: "An Nguyễn", preview: "Đã gửi file thiết kế", time: "10:24" },
    { id: "3", name: "Mẹ", preview: "Con ăn cơm chưa?", time: "Hôm qua", ticks: true },
    { id: "4", name: "Design Team", preview: "Figma vừa update", time: "T2", ticks: true, muted: true },
    { id: "5", name: "Bình Trần", preview: "Ok hẹn cuối tuần", time: "T2" },
  ];
  for (var i = 0; i < rows.length; i++) convRow(f, 88, 148 + i * 76, 308, rows[i], tk);

  var A = LIST_END;
  var AW = chatHeader(f, tk, {
    name: "Koola Design",
    status: "4 thành viên",
    icons: ["phone", "video", "info"],
    group: true,
  });

  var L0 = A + 66;
  var FULL_R = RIGHT;

  // ── Ngữ cảnh hội thoại ─────────────────────────────────────────────────
  var pillW = 88;
  rect(f, "s70-date", MID - pillW / 2, 100, pillW, 26, tk.surface, R.md);
  mkText(f, "s70-date-t", "Hôm nay", MID - pillW / 2, 105, TY.tiny,
    tk.muted, "Bold", pillW, 16, "CENTER");

  rect(f, "s70-ava", A + 24, 142, 32, 32, tk.primarySoft, 16);
  mkText(f, "s70-ava-t", "B", A + 24, 149, TY.caption, tk.primaryDark, "Bold", 32, 18, "CENTER");
  mkText(f, "s70-sender", "Bình Trần", L0, 146, TY.caption, tk.muted, "Bold", 200, 16);

  // Bubble có mention — nền pill vẽ TRƯỚC chữ.
  var BX = L0;
  var BY = 168;
  var BW = 300;
  var BH = 48;
  strokeRect(f, "s70-bub", BX, BY, BW, BH, tk.bubbleOther, R.bub, tk.bubbleBorder);

  var PILL_X = BX + 56;
  var PILL_W = 100;
  rect(f, "s70-mention", PILL_X, BY + 12, PILL_W, 24, tk.primarySoft, R.xs2);

  mkText(f, "s70-pre", "Nhờ", BX + 16, BY + 16, TY.label, tk.ink, "Regular", 36, 20, "RIGHT");
  mkText(f, "s70-mention-t", "@An Nguyễn", PILL_X + 6, BY + 16, TY.label,
    tk.primaryDark, "Bold", PILL_W - 12, 20);
  mkText(f, "s70-post", " xem giúp nhé", PILL_X + PILL_W + 6, BY + 16, TY.label,
    tk.ink, "Regular", 140, 20);

  // Trả lời của mình
  var B2W = 220;
  var B2Y = BY + BH + 14;
  rect(f, "s70-b2", FULL_R - B2W, B2Y, B2W, 44, tk.primary, R.bub);
  mkText(f, "s70-b2-t", "Mình xem qua rồi, ổn nhé", FULL_R - B2W + 16, B2Y + 12,
    TY.label, tk.white, "Regular", B2W - 32, 20);
  mkText(f, "s70-b2-time", "10:31", FULL_R - 56, B2Y + 26, TY.micro,
    tk.white, "Regular", 28, 14, "RIGHT");

  strokeRect(f, "s70-b3", L0, B2Y + 56, 240, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "s70-b3-t", "Ok mình xem ngay", L0 + 16, B2Y + 68, TY.label,
    tk.ink, "Regular", 208, 20);

  // ── Composer đang gõ ───────────────────────────────────────────────────
  var CH = 88;
  var CTOP = PAGE_H - CH;
  rect(f, "s70-composer", A, CTOP, AW, CH, tk.panel, 0);
  hline(f, "s70-composer-line", A, CTOP, AW, tk.line);

  var SEND = 48;
  var sendX = A + AW - 24 - SEND;
  var sendY = CTOP + (CH - SEND) / 2;
  var inputX = A + 24;
  var inputW = sendX - 16 - inputX;
  var inputY = CTOP + (CH - 52) / 2;

  var input = strokeRect(f, "s70-input", inputX, inputY, inputW, 52, tk.surface, R.pill, tk.primary);
  input.strokeWeight = 2;

  lucide(f, "s70-attach", "paperclip", inputX + 20, inputY + 14, 24, tk.faint);
  var typed = mkText(f, "s70-typed", "Nhờ @an xem lại", inputX + 54, inputY + 16,
    TY.label, tk.ink, "Regular");
  typed.textAutoResize = "WIDTH_AND_HEIGHT";
  rect(f, "s70-caret", typed.x + typed.width + 2, inputY + 15, 2, 22, tk.primary, 1);

  lucide(f, "s70-in-img", "image", inputX + inputW - 78, inputY + 14, 24, tk.faint);
  lucide(f, "s70-in-smile", "smile", inputX + inputW - 40, inputY + 14, 24, tk.faint);

  var send = circle(f, "s70-send", sendX, sendY, SEND, tk.primary);
  shadowL(send, "glow");
  iconCentered(f, "s70-send-ic", "send", sendX, sendY, SEND, 20, tk.white);

  // ── Popup gợi ý @ ──────────────────────────────────────────────────────
  var MW = 360;
  var MH = 240;
  var MX = A + 36;
  var MY = CTOP - 24 - MH;

  var pop = rect(f, "s70-pop", MX, MY, MW, MH, tk.panel, R.md);
  shadowL(pop, "xl");
  hairline(pop, tk.line);

  mkText(f, "s70-pop-head", "Thành viên nhóm", MX + 16, MY + 12, TY.micro,
    tk.faintInk, "Bold", MW - 32, 14);
  hline(f, "s70-pop-line", MX + 16, MY + 30, MW - 32, tk.line);

  var people = [
    { name: "An Nguyễn", role: "Trưởng nhóm", sel: true },
    { name: "Bình Trần", role: "Thành viên" },
    { name: "Chị Lê", role: "Thành viên" },
    { name: "Dũng Phạm", role: "Thành viên" },
  ];

  for (var p = 0; p < people.length; p++) {
    var it = people[p];
    var iy = MY + 34 + p * 48;

    if (it.sel) {
      rect(f, "s70-item-bg-" + p, MX + 8, iy, MW - 16, 48, tk.primarySoft, R.xs);
    }

    avatar(f, "s70-item-ava-" + p, MX + 16, iy + 8, 32, it.name.charAt(0), tk);

    if (p === 0) {
      mkText(f, "s70-item-at", "@An", MX + 58, iy + 7, TY.caption, tk.primaryDark, "Bold", 40, 16);
      mkText(f, "s70-item-n1", "Nguyễn", MX + 84, iy + 7, TY.caption, tk.ink, "Bold", 140, 16);
    } else {
      mkText(f, "s70-item-n-" + p, it.name, MX + 58, iy + 7, TY.caption, tk.ink, "Bold", 180, 16);
    }
    mkText(f, "s70-item-role-" + p, it.role, MX + 58, iy + 24, TY.micro, tk.muted, "Regular", 180, 14);

    if (it.sel) {
      iconCentered(f, "s70-item-ck-" + p, "check", MX + MW - 16 - 24, iy + 12, 24, 16, tk.primary);
    }
  }

  // Chú thích phím tắt dưới popup
  mkText(f, "s70-pop-hint", "↑↓ chọn · Tab hoàn tất · Esc đóng",
    MX, MY + MH + 8, TY.micro, tk.faintInk, "Regular", MW, 14);

  return f;
}


// ═══════════════════════════════════════════════════════════════════════════
// S71–S73 — LỜI MỜI NHÓM · PHÂN QUYỀN NHÓM · BÁO CÁO NGƯỜI DÙNG
// ═══════════════════════════════════════════════════════════════════════════

function s71GroupInvite(fx) {
  var tk = L;
  var f = frame("S71 — Lời mời vào nhóm", fx, tk.canvas);

  rail(f, 1, tk);

  // ── Cột trái: hộp lời mời ───────────────────────────────────────────────
  var PX = LIST_X;
  var PW = LIST_W;
  var P_END = PX + PW;
  var INNER = PX + 24;

  rect(f, "gi-list", PX, 0, PW, PAGE_H, tk.panel, 0);
  vline(f, "gi-list-edge", P_END, 0, PAGE_H, tk.line);

  mkText(f, "gi-title", "Lời mời", INNER, 28, TY.heading, tk.ink, "Bold", 280, 28);

  var tabs = [
    { lb: "Nhóm · 2", w: 84 },
    { lb: "Kết bạn · 3", w: 98 },
    { lb: "Link · 1", w: 76 },
  ];
  var tabX = INNER;
  for (var t = 0; t < tabs.length; t++) {
    chip(f, "gi-tab-" + t, tabs[t].lb, tabX, 72, tabs[t].w, t === 0, tk);
    tabX += tabs[t].w + 8;
  }

  var invites = [
    { n: "Koola Design", by: "An Nguyễn", t: "2 giờ", on: true },
    { n: "Design Team", by: "Bình Trần", t: "Hôm qua" },
    { n: "Koola Dev", by: "Chị Lê", t: "T2" },
  ];
  var ROW_H = 88;
  var ROW_Y = 124;

  for (var i = 0; i < invites.length; i++) {
    var iy = ROW_Y + i * ROW_H;
    if (invites[i].on) rect(f, "gi-item-bg-" + i, PX, iy, PW, ROW_H, tk.surface, 0);

    circle(f, "gi-item-ava-" + i, INNER, iy + 22, 44, tk.primarySoft);
    iconCentered(f, "gi-item-ic-" + i, "users", INNER, iy + 22, 44, 20, tk.primary);

    mkText(f, "gi-item-n-" + i, invites[i].n, INNER + 56, iy + 22, TY.body,
      tk.ink, "Bold", 200, 20);
    mkText(f, "gi-item-by-" + i, "Mời bởi " + invites[i].by, INNER + 56, iy + 46,
      TY.caption, tk.muted, "Regular", 200, 18);
    mkText(f, "gi-item-t-" + i, invites[i].t, P_END - 24 - 56, iy + 24, TY.tiny,
      tk.faintInk, "Regular", 56, 16, "RIGHT");
  }

  // ── Thẻ chi tiết lời mời — căn giữa vùng còn lại (sau panel trái) ──────
  var CARD_W = 760;
  var CARD_H = 600;
  var CARD_X = Math.round(P_END + (PAGE_W - P_END - CARD_W) / 2);
  var CARD_Y = 120;
  var CX = CARD_X + CARD_W / 2;

  var card = rect(f, "gi-card", CARD_X, CARD_Y, CARD_W, CARD_H, tk.panel, R.lg);
  shadowL(card, "md");

  // Avatar nhóm dạng ô vuông bo mềm — khác avatar tròn của người.
  var AVA = 96;
  var AVA_Y = 158;
  rect(f, "gi-card-ava", CX - AVA / 2, AVA_Y, AVA, AVA, tk.primarySoft, R.xl);
  iconCentered(f, "gi-card-ava-ic", "users", CX - AVA / 2, AVA_Y, AVA, 44, tk.primary);

  mkText(f, "gi-card-name", "Koola Design", CARD_X, 270, TY.title, tk.ink, "Bold",
    CARD_W, 32, "CENTER");
  mkText(f, "gi-card-sub", "4 thành viên · 2 đang online", CARD_X, 306, TY.caption,
    tk.muted, "Regular", CARD_W, 18, "CENTER");

  // Hàng avatar chồng — chừa vòng nền để mép các avatar tách nhau.
  var MEM = 36;
  var STEP = 28;
  var START_X = CX - (MEM + 3 * STEP) / 2; // 866
  var MEM_Y = 344;
  var members = ["B", "L", "D", "+1"];
  for (var m = 0; m < members.length; m++) {
    var mx = START_X + m * STEP;
    if (m === members.length - 1) {
      circle(f, "gi-mem-ring-" + m, mx - 2, MEM_Y - 2, MEM + 4, tk.panel);
      circle(f, "gi-mem-" + m, mx, MEM_Y, MEM, tk.surface);
      mkText(f, "gi-mem-t-" + m, "+1", mx, MEM_Y + 10, TY.micro, tk.muted, "Bold",
        MEM, 14, "CENTER");
    } else {
      circle(f, "gi-mem-ring-" + m, mx - 2, MEM_Y - 2, MEM + 4, tk.panel);
      avatar(f, "gi-mem-" + m, mx, MEM_Y, MEM, members[m], tk);
    }
  }

  // Ai mời — avatar nhỏ đứng trước câu.
  var INV_W = 260;
  var invX = Math.round(CX - (24 + 8 + INV_W) / 2);
  avatar(f, "gi-inv-ava", invX, 400, 24, "A", tk);
  mkText(f, "gi-inv-t", "An Nguyễn mời bạn tham gia nhóm này", invX + 32, 403,
    TY.bodySm, tk.ink, "Regular", INV_W, 18);

  // Ô chọn vai trò của bạn.
  var ROLE_Y = 450;
  var PILL_W = 156;
  var PILL_H = 40;
  var LBL_W = 84;
  var roleX = Math.round(CX - (LBL_W + 12 + PILL_W) / 2);
  mkText(f, "gi-role-lb", "Vai trò của bạn", roleX, ROLE_Y + 12, TY.micro,
    tk.faintInk, "Regular", LBL_W, 14);
  strokeRect(f, "gi-role-pill", roleX + LBL_W + 12, ROLE_Y, PILL_W, PILL_H,
    tk.surface, R.pill, tk.line);
  mkText(f, "gi-role-t", "Thành viên", roleX + LBL_W + 30, ROLE_Y + 12, TY.caption,
    tk.ink, "Bold", PILL_W - 52, 16);
  lucide(f, "gi-role-ic", "chevron-down", roleX + LBL_W + 12 + PILL_W - 32,
    ROLE_Y + 10, 20, tk.muted);

  // Hai nút quyết định.
  primaryButton(f, "gi-join", "Tham gia nhóm", CX - 150, 512, 300, 52, tk,
    { icon: "check" });

  strokeRect(f, "gi-decline", CX - 150, 576, 300, 48, tk.panel, R.sm, tk.line);
  mkText(f, "gi-decline-t", "Từ chối", CX - 150, 590, TY.label, tk.ink, "Bold",
    300, 20, "CENTER");

  mkText(f, "gi-preview", "Xem trước tin nhắn nhóm", CARD_X, 640, TY.tiny,
    tk.primary, "Bold", CARD_W, 16, "CENTER");
  mkText(f, "gi-expire", "Lời mời hết hạn sau 6 ngày", CARD_X, 684, TY.micro,
    tk.faintInk, "Regular", CARD_W, 14, "CENTER");

  return f;
}

function s72GroupRoles(fx) {
  var tk = L;
  var f = frame("S72 — Phân quyền nhóm", fx, tk.chat);

  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 5; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  // ── Cửa sổ chat bị panel phải thu hẹp ───────────────────────────────────
  var A = LIST_END;
  var PANEL_W = 420;
  var PANEL_X = PAGE_W - PANEL_W;   // 1020
  var CHAT_W = PANEL_X - A;         // 608

  rect(f, "gr-header", A, 0, CHAT_W, 76, tk.panel, 0);
  hline(f, "gr-header-line", A, 75, CHAT_W, tk.line);

  avatar(f, "gr-header-ava", A + 24, 14, 48, "K", tk);
  mkText(f, "gr-header-name", "Koola Design", A + 84, 19, TY.body, tk.ink, "Bold",
    300, 20);
  mkText(f, "gr-header-status", "4 thành viên · 2 đang online", A + 84, 41,
    TY.caption, tk.muted, "Regular", 300, 18);

  var hIcons = ["phone", "video", "search"];
  for (var h = 0; h < hIcons.length; h++) {
    iconButton(f, "gr-hbtn-" + h, hIcons[h],
      PANEL_X - 24 - 40 - (hIcons.length - 1 - h) * 48, 18, 40, tk.surface, tk.ink);
  }

  // Pill hệ thống — dấu vết thao tác vừa xảy ra.
  var SYS_W = 264;
  var sysX = Math.round(A + (CHAT_W - SYS_W) / 2);
  rect(f, "gr-sys", sysX, 112, SYS_W, 32, tk.surface, R.pill);
  mkText(f, "gr-sys-t", "An Nguyễn đã đặt Bình Trần làm phó nhóm", sysX + 16, 120,
    TY.tiny, tk.muted, "Regular", SYS_W - 32, 16, "CENTER");

  strokeRect(f, "gr-b1", A + 24, 172, 288, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "gr-m1", "Mình vừa cập nhật file mới", A + 40, 184, TY.label, tk.ink,
    "Regular", 256, 20);

  rect(f, "gr-b2", PANEL_X - 24 - 264, 228, 264, 44, tk.primary, R.bub);
  mkText(f, "gr-m2", "Ok, để mình xem", PANEL_X - 24 - 248, 240, TY.label, tk.white,
    "Regular", 232, 20);

  strokeRect(f, "gr-b3", A + 24, 284, 240, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "gr-m3", "Chốt thứ 6 nhé", A + 40, 296, TY.label, tk.ink, "Regular",
    208, 20);

  composerBar(f, tk, A, CHAT_W, {});

  // ── Panel phải: thành viên & quyền ──────────────────────────────────────
  rect(f, "gr-panel", PANEL_X, 0, PANEL_W, PAGE_H, tk.panel, 0);
  vline(f, "gr-panel-edge", PANEL_X, 0, PAGE_H, tk.line);

  var PX = PANEL_X + 24;          // 1044
  var P_INNER = PANEL_W - 48;     // 372

  mkText(f, "gr-title", "Thành viên · 4", PX, 26, TY.heading, tk.ink, "Bold",
    280, 28);
  iconButton(f, "gr-close", "x", PANEL_X + PANEL_W - 60, 20, 36, tk.surface, tk.muted);

  var members = [
    { n: "An Nguyễn", role: "Trưởng nhóm", kind: "owner" },
    { n: "Bình Trần", role: "Phó nhóm", kind: "deputy" },
    { n: "Chị Lê", role: "Thành viên", kind: "member" },
    { n: "Dũng Phạm", role: "Thành viên", kind: "member" },
  ];
  var MROW = 72;
  var MLIST_Y = 76;

  for (var m = 0; m < members.length; m++) {
    var my = MLIST_Y + m * MROW;
    var mem = members[m];

    avatar(f, "gr-m-ava-" + m, PX, my + 14, 44, mem.n.charAt(0), tk);
    mkText(f, "gr-m-n-" + m, mem.n, PX + 60, my + 12, TY.body, tk.ink, "Bold",
      200, 20);

    if (mem.kind === "owner") {
      rect(f, "gr-m-badge-bg-" + m, PX + 60, my + 38, 92, 20, tk.primarySoft, R.pill);
      mkText(f, "gr-m-badge-t-" + m, mem.role, PX + 60, my + 41, TY.micro,
        tk.primaryDark, "Bold", 92, 14, "CENTER");
    } else {
      mkText(f, "gr-m-role-" + m, mem.role, PX + 60, my + 40, TY.micro,
        mem.kind === "deputy" ? tk.accentInk : tk.muted, "Regular", 200, 14);
    }

    lucide(f, "gr-m-more-" + m, "more-vertical", PANEL_X + PANEL_W - 44, my + 24,
      20, tk.faint);
    if (m < members.length - 1) hline(f, "gr-m-sep-" + m, PX + 60, my + MROW - 1,
      P_INNER - 60, tk.line);
  }

  // Menu ngữ cảnh mở sẵn cạnh hàng thứ 3.
  var MW = 240;
  var MH = 150;
  var MX = PANEL_X + PANEL_W - 24 - MW;   // 1176
  var MY = MLIST_Y + 2 * MROW + 28;       // 248

  var menu = strokeRect(f, "gr-menu", MX, MY, MW, MH, tk.panel, R.sm, tk.line);
  shadowL(menu, "lg");

  var items = [
    { ic: "user-check", lb: "Đặt làm phó nhóm", danger: false },
    { ic: "shield", lb: "Chuyển quyền trưởng nhóm", danger: false },
    { ic: "user-x", lb: "Xoá khỏi nhóm", danger: true },
  ];
  for (var k = 0; k < items.length; k++) {
    var iy = MY + 6 + k * 46;
    if (k === 2) hline(f, "gr-menu-sep", MX + 8, MY + 88, MW - 16, tk.line);
    var col = items[k].danger ? tk.dangerInk : tk.ink;
    iconCentered(f, "gr-menu-ic-" + k, items[k].ic, MX + 14, iy, 24, 18, col);
    mkText(f, "gr-menu-lb-" + k, items[k].lb, MX + 46, iy + 3, TY.bodySm, col,
      "Regular", MW - 60, 18);
  }

  // ── Quyền của thành viên ────────────────────────────────────────────────
  mkText(f, "gr-sec", "Quyền của thành viên", PX, 414, TY.micro, tk.faintInk,
    "Bold", P_INNER, 14);

  var perms = [
    { lb: "Gửi tin nhắn", sub: "Nhắn trong nhóm", on: true },
    { lb: "Gửi ảnh & file", sub: "Ảnh, video và tài liệu", on: true },
    { lb: "Ghim tin nhắn", sub: "Ghim tối đa 3 tin", on: false },
  ];
  var PROW = 72;
  var PLIST_Y = 436;

  for (var p = 0; p < perms.length; p++) {
    var py = PLIST_Y + p * PROW;
    mkText(f, "gr-p-lb-" + p, perms[p].lb, PX, py + 16, TY.bodySm, tk.ink, "Bold",
      240, 18);
    mkText(f, "gr-p-sub-" + p, perms[p].sub, PX, py + 38, TY.tiny, tk.muted,
      "Regular", 240, 16);
    toggle(f, "gr-p-tg-" + p, PX + P_INNER - 52, py + 21, perms[p].on, tk);
  }

  // Footer dính đáy: đường kẻ làm ranh giới, nút lưu neo mép dưới.
  hline(f, "gr-foot-line", PX, 812, P_INNER, tk.line);
  primaryButton(f, "gr-save", "Lưu thay đổi", PX, 832, P_INNER, 44, tk, { flat: true });

  return f;
}

function s73ReportUser(fx) {
  var tk = L;
  var f = frame("S73 — Báo cáo người dùng", fx, tk.chat);

  // ── Nền: cuộc trò chuyện bị làm mờ bởi scrim ────────────────────────────
  rail(f, 0, tk);
  listPanel(f, tk);
  listHeader(f, "Trò chuyện", tk);
  for (var i = 0; i < 3; i++) convRow(f, 88, 104 + i * 76, 308, CONVS[i], tk);

  var A = LIST_END;
  var AW = PAGE_W - LIST_END;
  chatHeader(f, tk, {
    name: "Người lạ 01", status: "Truy cập lần cuối 2 giờ trước",
    icons: ["phone", "video", "search", "info"],
  });

  strokeRect(f, "ru-b1", A + 66, 140, 300, 44, tk.bubbleOther, R.bub, tk.bubbleBorder);
  mkText(f, "ru-m1", "Chào bạn, mình có việc muốn hỏi", A + 82, 152, TY.label,
    tk.ink, "Regular", 268, 20);

  rect(f, "ru-b2", RIGHT - 24 - 240, 196, 240, 44, tk.primary, R.bub);
  mkText(f, "ru-m2", "Bạn là ai?", RIGHT - 24 - 224, 208, TY.label, tk.white,
    "Regular", 208, 20);

  composerBar(f, tk, A, AW, {});

  rect(f, "ru-scrim", 0, 0, PAGE_W, PAGE_H, tk.ink, 0, 0.4);

  // ── Modal báo cáo ───────────────────────────────────────────────────────
  var MW = 520;
  var MH = 700;
  var MX = (PAGE_W - MW) / 2;   // 460
  var MY = 100;
  var PX = MX + 24;             // 484
  var INNER = MW - 48;          // 472

  var modal = rect(f, "ru-modal", MX, MY, MW, MH, tk.panel, R.lg);
  shadowL(modal, "xl");

  avatar(f, "ru-ava", PX, 118, 56, "N", tk);
  mkText(f, "ru-name", "Người lạ 01", PX + 72, 120, TY.heading, tk.ink, "Bold",
    300, 28);
  mkText(f, "ru-sub", "Báo cáo tài khoản", PX + 72, 152, TY.micro, tk.muted,
    "Regular", 300, 14);
  iconButton(f, "ru-close", "x", MX + MW - 60, 116, 36, tk.surface, tk.muted);

  mkText(f, "ru-reason", "Lý do báo cáo", PX, 182, TY.caption, tk.ink, "Bold",
    INNER, 16);

  var reasons = [
    { lb: "Spam hoặc quảng cáo", ic: "flag" },
    { lb: "Quấy rối hoặc đe doạ", ic: "shield" },
    { lb: "Nội dung không phù hợp", ic: "circle-alert" },
    { lb: "Mạo danh người khác", ic: "user-x" },
    { lb: "Khác", ic: "ellipsis" },
  ];
  var OPT_H = 56;
  var OPT_GAP = 10;
  var OPT_Y = 208;

  for (var r = 0; r < reasons.length; r++) {
    var oy = OPT_Y + r * (OPT_H + OPT_GAP);
    var on = r === 0;

    if (on) {
      var box = strokeRect(f, "ru-opt-" + r, PX, oy, INNER, OPT_H, tk.surface,
        R.sm, tk.primary);
      box.strokeWeight = 2;
    } else {
      rect(f, "ru-opt-" + r, PX, oy, INNER, OPT_H, tk.surface, R.sm);
    }

    var radioY = oy + (OPT_H - 20) / 2;
    if (on) {
      circle(f, "ru-radio-" + r, PX + 18, radioY, 20, tk.primary);
      circle(f, "ru-radio-dot-" + r, PX + 24, radioY + 6, 8, tk.white);
    } else {
      strokeRect(f, "ru-radio-" + r, PX + 18, radioY, 20, 20, tk.panel, 10, tk.line);
    }

    // Icon canh giữa ô radio+icon, chữ bắt đầu sau icon 16px — không chồng.
    iconCentered(f, "ru-opt-ic-" + r, reasons[r].ic, PX + 48, oy, OPT_H, 20,
      on ? tk.primaryDark : tk.muted);
    mkText(f, "ru-opt-t-" + r, reasons[r].lb, PX + 92, oy + 19, TY.bodySm,
      tk.ink, on ? "Bold" : "Regular", INNER - 112, 18);
  }

  mkText(f, "ru-desc-lb", "Mô tả chi tiết (không bắt buộc)", PX, 544, TY.micro,
    tk.faintInk, "Regular", INNER, 14);
  strokeRect(f, "ru-desc", PX, 562, INNER, 84, tk.surface, R.sm, tk.line);
  mkText(f, "ru-desc-ph", "Cho chúng tôi biết thêm…", PX + 16, 578, TY.tiny,
    tk.faintInk, "Regular", INNER - 32, 16);

  mkText(f, "ru-block-lb", "Chặn người này sau khi báo cáo", PX, 670, TY.caption,
    tk.ink, "Regular", INNER - 70, 18);
  toggle(f, "ru-block-tg", PX + INNER - 52, 662, true, tk);

  strokeRect(f, "ru-cancel", PX, 712, 230, 48, tk.panel, R.sm, tk.line);
  mkText(f, "ru-cancel-t", "Huỷ", PX, 726, TY.label, tk.ink, "Bold", 230, 20,
    "CENTER");

  primaryButton(f, "ru-send", "Gửi báo cáo", PX + 242, 712, 230, 48, tk,
    { icon: "flag" });

  // Note nằm TRONG modal, chừa 16px lề đáy.
  mkText(f, "ru-note",
    "Báo cáo được ẩn danh · xem xét trong 24 giờ", MX, 774, TY.micro,
    tk.faintInk, "Regular", MW, 14, "CENTER");

  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// S74 — THƯ VIỆN MÀU (Color palette)
// Trước đây chưa có màn nào liệt kê token màu. Đây là nơi tra cứu duy nhất:
// mỗi ô ghi TÊN token, mã hex, và tỉ lệ tương phản với nền trắng.
// ═══════════════════════════════════════════════════════════════════════════

function s74ColorPalette(fx) {
  var tk = L;
  var f = frame("S74 — Thư viện màu", fx, tk.canvas);
  f.resize(1720, 1560);

  mkText(f, "cp-title", "Thư viện màu", 48, 32, TY.display, tk.ink, "Bold", 900, 40);
  mkText(f, "cp-sub",
    "Token màu dùng trong toàn bộ Koola Web. Cột phải là tỉ lệ tương phản WCAG với nền trắng.",
    48, 78, TY.bodySm, tk.muted, "Regular", 1400, 20);

  // Thanh ba màu thương hiệu dưới tiêu đề.
  rect(f, "cp-sig-a", 48, 112, 32, 4, tk.brandRed, 2);
  rect(f, "cp-sig-b", 84, 112, 32, 4, tk.brandBlue, 2);
  rect(f, "cp-sig-c", 120, 112, 32, 4, tk.brandGreen, 2);

  // ── Hàm vẽ 1 dải màu ──────────────────────────────────────────────────
  function swatchGroup(title, note, x, y, rows, cols) {
    mkText(f, "cp-g-" + title, title, x, y, TY.bodySm, tk.ink, "Bold", 600, 20);
    if (note) mkText(f, "cp-gn-" + title, note, x, y + 22, TY.tiny, tk.faintInk, "Regular", 760, 16);

    var CW = cols > 5 ? 136 : 168;
    var CH = 88;
    var gap = 12;
    var startY = y + (note ? 48 : 30);

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var item = row[c];
        var cx = x + c * (CW + gap);
        var cy = startY + r * (CH + gap);
        if (!item) continue;

        // Ô màu
        var box = rect(f, "cp-sw-" + title + "-" + r + "-" + c, cx, cy, CW, 52, item.hex, R.xs);
        if (item.stroke) {
          box.strokes = [{ type: "SOLID", color: hx6(tk.line) }];
          box.strokeWeight = 1;
          box.strokeAlign = "INSIDE";
        }

        // Tên token + hex
        mkText(f, "cp-nm-" + title + "-" + r + "-" + c, item.name, cx, cy + 58, TY.micro,
          tk.ink, "Bold", CW - 40, 14);
        mkText(f, "cp-hx-" + title + "-" + r + "-" + c, item.hex.toUpperCase(), cx, cy + 72,
          TY.micro, tk.faintInk, "Regular", CW - 40, 14);

        // Tỉ lệ tương phản (nếu có)
        if (item.ratio) {
          var pass = item.ratio >= 4.5;
          mkText(f, "cp-rt-" + title + "-" + r + "-" + c, item.ratio + ":1", cx + CW - 40, cy + 58,
            TY.micro, pass ? tk.accentInk : tk.dangerInk, "Bold", 40, 14, "RIGHT");
        }
      }
    }
    return startY + rows.length * (CH + gap);
  }

  // ══ CỘT TRÁI ══════════════════════════════════════════════════════════
  var LX = 48, RX = 900, Y = 156;

  var yL = swatchGroup("Tiffany — màu chủ đạo", "Hue 176°. 500 là Tiffany gốc; 700 dùng cho nền nút.", LX, Y, [
    [
      { name: "tiffany50", hex: tk.tiffany50, ratio: "1.08", stroke: true },
      { name: "tiffany100", hex: tk.tiffany100, ratio: "1.19", stroke: true },
      { name: "tiffany200", hex: tk.tiffany200, ratio: "1.40", stroke: true },
      { name: "tiffany300", hex: tk.tiffany300, ratio: "1.72", stroke: true },
    ],
    [
      { name: "tiffany400", hex: tk.tiffany400, ratio: "2.10" },
      { name: "tiffany500", hex: tk.tiffany500, ratio: "2.41" },
      { name: "tiffany600", hex: tk.tiffany600, ratio: "3.96" },
      { name: "tiffany700", hex: tk.tiffany700, ratio: "5.68" },
    ],
    [
      { name: "tiffany800", hex: tk.tiffany800, ratio: "8.39" },
      { name: "tiffany900", hex: tk.tiffany900, ratio: "11.74" },
    ],
  ], 4);

  // Token semantic — lấy thẳng từ bảng L
  var yL2 = yL + 32;
  yL2 = swatchGroup("Semantic — hành động", "primary = tiffany700 (5.68:1, đạt AA). primaryHover sáng hơn khi rê chuột.", LX, yL2, [
    [
      { name: "primary", hex: tk.primary, ratio: "5.68" },
      { name: "primaryHover", hex: tk.primaryHover, ratio: "3.96" },
      { name: "primaryDark", hex: tk.primaryDark, ratio: "8.39" },
    ],
    [
      { name: "primarySoft", hex: tk.primarySoft, ratio: "1.19", stroke: true },
      { name: "railBg", hex: tk.railBg, ratio: "5.68" },
    ],
  ], 4);

  var yL3 = yL2 + 32;
  yL3 = swatchGroup("Semantic — bề mặt", "Nền và đường phân cách.", LX, yL3, [
    [
      { name: "canvas", hex: tk.canvas, ratio: "1.10", stroke: true },
      { name: "surface", hex: tk.surface, ratio: "1.09", stroke: true },
      { name: "panel", hex: tk.panel, ratio: "1.00", stroke: true },
    ],
    [
      { name: "line", hex: tk.line, ratio: "1.20", stroke: true },
      { name: "iconWell", hex: tk.iconWell, ratio: "1.19", stroke: true },
    ],
  ], 4);

  var yL4 = yL3 + 32;
  yL4 = swatchGroup("Semantic — chữ", "Đã đo AA trên nền trắng.", LX, yL4, [
    [
      { name: "ink", hex: tk.ink, ratio: "17.75" },
      { name: "muted", hex: tk.muted, ratio: "4.97" },
      { name: "faintInk", hex: tk.faintInk, ratio: "4.93" },
    ],
  ], 4);

  // ══ CỘT PHẢI ══════════════════════════════════════════════════════════
  var yR = swatchGroup("Trạng thái", "accent và online nay cùng tông Tiffany. danger đạt AA.", RX, Y, [
    [
      { name: "accent", hex: tk.accent, ratio: "3.96" },
      { name: "accentInk", hex: tk.accentInk, ratio: "5.68" },
      { name: "online", hex: tk.online, ratio: "3.96" },
    ],
    [
      { name: "danger", hex: tk.danger, ratio: "4.83" },
      { name: "dangerInk", hex: tk.dangerInk, ratio: "6.57" },
      { name: "dangerSoft", hex: tk.dangerSoft, ratio: "1.14", stroke: true },
    ],
    [
      { name: "warnInk", hex: tk.warnInk, ratio: "5.02" },
      { name: "warnSoft", hex: tk.warnSoft, ratio: "1.13", stroke: true },
      { name: "successStrong", hex: tk.successStrong, ratio: "2.15" },
    ],
  ], 4);

  var yR2 = yR + 32;
  yR2 = swatchGroup("Brand — ba màu logo",
    "Chỉ dùng trong mark. brandBlue không dùng cho nền/chữ — trang trí đã chuyển sang tiffany700.",
    RX, yR2, [
    [
      { name: "brandRed", hex: tk.brandRed, ratio: "4.56" },
      { name: "brandBlue", hex: tk.brandBlue, ratio: "7.85" },
      { name: "brandGreen", hex: tk.brandGreen, ratio: "3.18" },
    ],
  ], 4);

  var yR3 = yR2 + 32;
  yR3 = swatchGroup("Rail & gọi video", "Rail dùng tiffany700. Màn gọi luôn tối.", RX, yR3, [
    [
      { name: "railBg", hex: tk.railBg, ratio: "5.68" },
      { name: "railInkDim", hex: tk.railInkDim, ratio: "1.28", stroke: true },
      { name: "railBadge", hex: tk.railBadge, ratio: "4.42" },
    ],
    [
      { name: "callBg", hex: tk.callBg, ratio: "19.20" },
      { name: "callStage", hex: tk.callStage, ratio: "16.80" },
      { name: "callChrome", hex: tk.callChrome, ratio: "14.30" },
    ],
  ], 4);

  var yR4 = yR3 + 32;
  yR4 = swatchGroup("Dark mode", "Bộ tối: primary sáng hơn để đạt AA trên nền #0F1419.", RX, yR4, [
    [
      { name: "D.primary", hex: D.primary, ratio: "9.98" },
      { name: "D.primarySoft", hex: D.primarySoft, ratio: "2.10" },
      { name: "D.canvas", hex: D.canvas, ratio: "17.40" },
    ],
    [
      { name: "D.surface", hex: D.surface, ratio: "14.84" },
      { name: "D.ink", hex: D.ink, ratio: "14.84" },
      { name: "D.muted", hex: D.muted, ratio: "6.96" },
    ],
  ], 4);

  // Ghi chú quy tắc
  var noteY = Math.max(yL4, yR4) + 40;
  var nb = rect(f, "cp-note", 48, noteY, 1624, 92, tk.tiffany50, R.md);
  iconCentered(f, "cp-note-ic", "info", 48 + 20, noteY + 26, 40, 20, tk.tiffany700);
  mkText(f, "cp-note-t", "Quy tắc dùng màu", 48 + 76, noteY + 18, TY.bodySm, tk.tiffany900, "Bold", 400, 20);
  mkText(f, "cp-note-s",
    "primary = tiffany700 nên chữ trắng trên nút đạt 5.68:1 (AA). primaryHover = tiffany600 chỉ dùng cho trạng thái rê chuột. " +
    "Chấm online và accent cùng tông Tiffany thay vì xanh lá riêng. brandBlue/brandGreen chỉ sống trong logo.",
    48 + 76, noteY + 42, TY.tiny, tk.tiffany900, "Regular", 1500, 18);

  // Đếm token
  mkText(f, "cp-foot",
    "31 token trong bảng L · 31 token trong bảng D · thang Tiffany 10 bậc",
    48, noteY + 112, TY.caption, tk.faintInk, "Regular", 1600, 18);

  f.resize(1720, noteY + 160);
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTOTYPE
// ═══════════════════════════════════════════════════════════════════════════

function setNav(from, to, ms) {
  try {
    from.reactions = [{
      trigger: { type: "ON_CLICK" },
      actions: [{
        type: "NODE",
        destinationId: to.id,
        navigation: "NAVIGATE",
        transition: { type: "SMART_ANIMATE", easing: { type: "EASE_OUT" }, duration: (ms || 600) / 1000 },
        preserveScrollPosition: false,
      }],
    }];
  } catch (e) { /* plan không hỗ trợ prototype thì bỏ qua */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function loadAll() {
  var styles = ["Bold", "Regular"];
  var i = 0;
  return new Promise(function (resolve, reject) {
    function next() {
      if (i >= styles.length) return resolve();
      figma.loadFontAsync({ family: "Inter", style: styles[i] })
        .then(function () { i++; next(); })
        .catch(reject);
    }
    next();
  });
}

var GROUPS = [
  { title: "01 · Đăng nhập & xác thực", items: [
    ["S01 Splash", s01Splash],
    ["S02 Login", s02Login],
    ["S03 Login lỗi", s03LoginError],
    ["S04 Login QR", s04LoginQr],
    ["S41 Forgot password", s41ForgotPassword],
    ["S42 Reset password", s42ResetPassword],
    ["S43 Register", s43Register],
    ["S44 Verify OTP", s44VerifyOtp],
    ["S45 Two-factor", s45TwoFactor],
    ["S50 Dark login", s50DarkLogin]
  ] },
  { title: "02 · Khung & danh sách", items: [
    ["S05 Shell", s05Shell],
    ["S06 List states", s06ListStates],
    ["S48 Chat states", s48ChatStates],
    ["S35 Unread divider", s35UnreadDivider],
    ["S54 Chat folders", s54ChatFolders],
    ["S49 Dark list", s49DarkList],
    ["S61 Message requests", s61MessageRequests],
    ["S39 Responsive 1280", s39Responsive]
  ] },
  { title: "03 · Cửa sổ chat", items: [
    ["S07 Chat", s07Chat],
    ["S08 Chat dark", s08ChatDark],
    ["S09 Actions", s09MessageActions],
    ["S10 Reactions", s10Reactions],
    ["S13 Msg states", s13MessageStates],
    ["S55 Multi-select", s55MultiSelect],
    ["S60 Message info", s60MessageInfo],
    ["S17 Info panel", s17InfoPanel]
  ] },
  { title: "04 · Soạn tin", items: [
    ["S11 Composer", s11Composer],
    ["S12 Emoji", s12Emoji],
    ["S56 Sticker & GIF", s56StickerGif],
    ["S46 Voice recording", s46VoiceRecording],
    ["S57 Voice player", s57VoicePlayer],
    ["S47 Drop zone", s47DropZone],
    ["S58 Scheduled send", s58ScheduledSend],
    ["S59 Group poll", s59Poll]
  ] },
  { title: "05 · Media & tìm kiếm", items: [
    ["S14 Lightbox ảnh", s14Lightbox],
    ["S62 Video viewer", s62VideoViewer],
    ["S52 Media vault", s52MediaVault],
    ["S16 Search in chat", s16SearchInChat],
    ["S53 Advanced search", s53AdvancedSearch],
    ["S32 Command palette", s32CommandPalette]
  ] },
  { title: "06 · Lớp phủ & hội thoại", items: [
    ["S15 Modals", s15Modals],
    ["S18 Create group", s18CreateGroup],
    ["S33 Group members", s33GroupMembers],
    ["S31 Toast", s31Toast]
  ] },
  { title: "07 · Gọi thoại & video", items: [
    ["S19 Incoming call", s19IncomingCall],
    ["S20 Outgoing call", s20OutgoingCall],
    ["S21 Voice call", s21ActiveVoiceCall],
    ["S22 Video call", s22VideoCall],
    ["S23 Group video", s23GroupVideo],
    ["S24 Call minimised", s24CallMinimized],
    ["S34 Call states", s34CallStates]
  ] },
  { title: "08 · Danh bạ & cài đặt", items: [
    ["S25 Contacts", s25Contacts],
    ["S26 Settings account", s26SettingsAccount],
    ["S27 Settings theme", s27SettingsAppearance],
    ["S28 Settings privacy", s28SettingsPrivacy],
    ["S29 Settings dark", s29SettingsDark],
    ["S36 Settings language", s36SettingsLanguage],
    ["S37 Settings about", s37SettingsAbout],
    ["S38 Settings storage", s38SettingsStorage],
    ["S30 Shortcuts + PWA", s30Shortcuts]
  ] },
  { title: "09 · Thư viện component", items: [
    ["S40 Components — nhận diện", s40Components],
    ["S51 Components — màn hình", s51Components2],
    ["S74 Color palette", s74ColorPalette]
  ] },
  { title: "10 · Hệ thống & tiện ích", items: [
    ["S63 Session expired", s63SessionExpired],
    ["S64 Not found", s64NotFound],
    ["S65 Offline", s65Offline],
    ["S66 Notification center", s66NotificationCenter],
    ["S67 Starred", s67StarredMessages],
    ["S68 Pinned messages", s68PinnedMessages],
    ["S69 Link preview", s69LinkPreview],
    ["S70 Mention autocomplete", s70MentionAutocomplete],
    ["S71 Group invite", s71GroupInvite],
    ["S72 Group roles", s72GroupRoles],
    ["S73 Report user", s73ReportUser]
  ] }
];

function main() {
  return loadAll()
    .then(function () {
      // ── DỌN SẠCH: xoá mọi node cũ do plugin từng tạo ──────────────────
      // Gồm cả frame F1–F6 của bản cũ, nhãn SECTION- rời, và các S-frame.
      // Khớp cả: màn (S01…), nhãn rời (SECTION-), frame cũ (F1…), section (01 · …)
      var STALE = /^(S\d|SECTION-|F\d|\d\d · )/;
      var olds = figma.currentPage.children.slice();
      for (var k = 0; k < olds.length; k++) {
        if (STALE.test(olds[k].name) || olds[k].type === "SECTION") {
          try { olds[k].remove(); } catch (e) { /* bỏ qua */ }
        }
      }

      var errors = [];
      function safe(label, fn) {
        try {
          return fn();
        } catch (e) {
          errors.push(label + ": " + e.message);
          return null;
        }
      }

      // ── DỰNG THEO NHÓM: mỗi nhóm là MỘT FRAME chứa các màn bên trong ──
      // Cấu trúc file: Page → 9 section frame → 62 screen frame.
      // Nhãn nhóm là text BÊN TRONG frame, không đè lên màn nào.
      var built = [];
      var sections = [];
      var GAP_X = 120;      // khe giữa các màn trong nhóm
      var HEAD_H = 72;      // chiều cao vùng nhãn
      var PAD_BOTTOM = 48;
      var rowY = 0;

      for (var g = 0; g < GROUPS.length; g++) {
        var group = GROUPS[g];

        // 1. Tạo section frame rỗng (chưa biết kích thước).
        var sec = figma.createFrame();
        sec.name = group.title;
        sec.fills = [];
        sec.clipsContent = false;
        sec.x = 0;
        sec.y = rowY;
        figma.currentPage.appendChild(sec);

        // 2. Nhãn nhóm bên trong section.
        var label = safe("Nhãn " + group.title, function () {
          return mkText(sec, "label", group.title, 0, 8, 30, "#101828", "Bold", 1200, 38);
        });
        var countTxt = safe("Đếm " + group.title, function () {
          return mkText(sec, "count", group.items.length + " màn", 0, 48, 14, "#667085",
            "Regular", 400, 18);
        });

        // 3. Dựng từng màn, đặt vào section.
        var maxH = 0;
        var maxW = 0;
        for (var k = 0; k < group.items.length; k++) {
          (function (item, col) {
            var r = safe(item[0], function () { return item[1](0); });
            if (!r) return;
            // Đưa frame vào section; toạ độ chuyển sang gốc section.
            sec.appendChild(r);
            r.x = col * (1440 + GAP_X);
            r.y = HEAD_H;
            built.push(r);
            if (r.height > maxH) maxH = r.height;
            if (r.width > 1440) maxW = r.width - 1440;
          })(group.items[k], k);
        }

        // 4. Đặt kích thước section vừa đủ.
        var secW = group.items.length * (1440 + GAP_X) - GAP_X + maxW;
        var secH = HEAD_H + (maxH || 900) + PAD_BOTTOM;
        sec.resize(secW, secH);
        if (countTxt) countTxt.x = secW - 400;

        sections.push(sec);
        rowY += secH + 120;
      }

      // Prototype
      var byName = {};
      for (var b = 0; b < built.length; b++) byName[built[b].name] = built[b];

      var s01 = byName["S01 — Splash"];
      var s02 = byName["S02 — Đăng nhập"];
      var s07 = byName["S07 — Chat đầy đủ"];

      if (s01 && s02) setNav(s01, s02, 600);
      if (s02 && s07) {
        var btn = s02.findOne(function (n) { return n.name === "btn-login"; });
        if (btn) setNav(btn, s07, 400);
      }

      if (sections.length) figma.viewport.scrollAndZoomIntoView([sections[0]]);

      var total = 0;
      for (var gi = 0; gi < GROUPS.length; gi++) total += GROUPS[gi].items.length;
      var msg = "Koola Web v8: " + built.length + " màn trong " + sections.length +
        " nhóm. Mỗi nhóm là 1 frame — bấm vào tên nhóm ở Layers để chọn cả cụm.";
      if (missingIcons.length) msg += " Thiếu icon: " + missingIcons.join(", ");
      if (errors.length) msg += " | Lỗi: " + errors.slice(0, 3).join(" | ");
      figma.notify(msg, { timeout: 15000 });
    })
    .catch(function (e) {
      figma.notify("Lỗi plugin: " + e.message, { timeout: 15000 });
    });
}

main();
