const K = {
  tshirt: (c, c2) => `<path d="M232 214 L300 168 Q400 214 500 168 L568 214 L640 300 L556 372 L512 330 L512 636 Q400 664 288 636 L288 330 L244 372 L160 300 Z" fill="${c}"/><path d="M300 168 Q400 214 500 168" fill="none" stroke="${c2}" stroke-width="8" opacity=".55"/>`,
  jeans: (c, c2) => `<path d="M262 150 L538 150 L556 640 L438 640 L400 330 L362 640 L244 640 Z" fill="${c}"/><path d="M262 150 L538 150 L540 232 L260 232 Z" fill="${c2}" opacity=".65"/><path d="M400 232 L400 330" stroke="${c2}" stroke-width="7" opacity=".5"/>`,
  dress: (c, c2) => `<path d="M340 150 L460 150 L486 214 L560 620 Q400 664 240 620 L314 214 Z" fill="${c}"/><path d="M340 150 Q400 200 460 150" fill="none" stroke="${c2}" stroke-width="8" opacity=".6"/><path d="M296 400 L504 400" stroke="${c2}" stroke-width="14" opacity=".45"/>`,
  shoe: (c, c2) => `<path d="M120 470 Q170 470 214 430 L318 336 Q352 312 386 344 L470 420 Q520 456 610 470 Q672 480 672 528 L672 566 Q672 592 644 592 L150 592 Q120 592 120 562 Z" fill="${c}"/><path d="M120 566 L672 566 L672 592 Q672 616 644 616 L150 616 Q120 616 120 592 Z" fill="${c2}"/><path d="M300 350 L420 350" stroke="${c2}" stroke-width="10" opacity=".7"/><path d="M268 392 L404 392" stroke="${c2}" stroke-width="10" opacity=".55"/>`,
  bag: (c, c2) => `<path d="M212 300 Q212 210 300 210 L500 210 Q588 210 588 300 L616 596 Q620 640 574 640 L226 640 Q180 640 184 596 Z" fill="${c}"/><path d="M300 210 Q300 118 400 118 Q500 118 500 210" fill="none" stroke="${c2}" stroke-width="18" stroke-linecap="round"/><rect x="252" y="330" width="296" height="120" rx="26" fill="${c2}" opacity=".35"/><rect x="366" y="368" width="68" height="42" rx="12" fill="${c2}"/>`,
  pot: (c, c2) => `<rect x="236" y="286" width="328" height="300" rx="34" fill="${c}"/><ellipse cx="400" cy="286" rx="164" ry="34" fill="${c2}"/><ellipse cx="400" cy="286" rx="120" ry="22" fill="#0f172a" opacity=".28"/><path d="M236 352 Q160 352 160 420 Q160 488 236 488" fill="none" stroke="${c2}" stroke-width="22" stroke-linecap="round"/><path d="M564 352 Q640 352 640 420 Q640 488 564 488" fill="none" stroke="${c2}" stroke-width="22" stroke-linecap="round"/><rect x="372" y="196" width="56" height="60" rx="18" fill="${c2}"/>`,
  lamp: (c, c2) => `<path d="M244 300 L556 300 L472 148 L328 148 Z" fill="${c}"/><ellipse cx="400" cy="300" rx="156" ry="24" fill="${c2}"/><rect x="384" y="300" width="32" height="250" rx="10" fill="${c2}"/><ellipse cx="400" cy="580" rx="146" ry="30" fill="${c}"/><ellipse cx="400" cy="566" rx="96" ry="18" fill="#fde68a" opacity=".75"/>`,
  headphone: (c, c2) => `<path d="M188 430 L188 356 Q188 168 400 168 Q612 168 612 356 L612 430" fill="none" stroke="${c}" stroke-width="46" stroke-linecap="round"/><rect x="140" y="404" width="104" height="184" rx="46" fill="${c2}"/><rect x="556" y="404" width="104" height="184" rx="46" fill="${c2}"/><rect x="172" y="440" width="40" height="112" rx="20" fill="#0f172a" opacity=".3"/><rect x="588" y="440" width="40" height="112" rx="20" fill="#0f172a" opacity=".3"/>`,
  watch: (c, c2) => `<rect x="330" y="130" width="140" height="240" rx="40" fill="${c2}"/><rect x="330" y="430" width="140" height="240" rx="40" fill="${c2}"/><circle cx="400" cy="400" r="140" fill="${c}"/><circle cx="400" cy="400" r="112" fill="none" stroke="${c2}" stroke-width="10" opacity=".7"/><path d="M400 400 L400 318" stroke="#0f172a" stroke-width="14" stroke-linecap="round"/><path d="M400 400 L462 434" stroke="#0f172a" stroke-width="12" stroke-linecap="round"/>`,
  phone: (c, c2) => `<rect x="286" y="120" width="228" height="560" rx="52" fill="${c}"/><rect x="306" y="140" width="188" height="520" rx="38" fill="${c2}"/><rect x="360" y="164" width="80" height="16" rx="8" fill="#0f172a" opacity=".45"/><rect x="330" y="230" width="140" height="18" rx="9" fill="#ffffff" opacity=".5"/><rect x="330" y="272" width="104" height="18" rx="9" fill="#ffffff" opacity=".35"/><rect x="330" y="330" width="140" height="120" rx="20" fill="#ffffff" opacity=".28"/>`,
  mug: (c, c2) => `<path d="M232 250 L512 250 L488 600 Q484 640 444 640 L300 640 Q260 640 256 600 Z" fill="${c}"/><path d="M512 320 Q620 320 620 410 Q620 500 512 500" fill="none" stroke="${c2}" stroke-width="26" stroke-linecap="round"/><ellipse cx="372" cy="250" rx="140" ry="26" fill="${c2}"/><ellipse cx="372" cy="250" rx="104" ry="16" fill="#0f172a" opacity=".25"/>`,
  chair: (c, c2) => `<path d="M256 156 Q256 122 290 122 L510 122 Q544 122 544 156 L544 372 L256 372 Z" fill="${c2}"/><rect x="222" y="372" width="356" height="52" rx="20" fill="${c}"/><path d="M250 424 L214 646" stroke="${c2}" stroke-width="26" stroke-linecap="round"/><path d="M550 424 L586 646" stroke="${c2}" stroke-width="26" stroke-linecap="round"/><path d="M244 520 L556 520" stroke="${c2}" stroke-width="20" stroke-linecap="round"/>`,
};

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

function productArt({ kind = 'tshirt', bg1 = '#eef2ff', bg2 = '#dbeafe', main = '#1e3a8a', main2 = '#2563eb', label = '', tag = '' }) {
  const shape = (K[kind] || K.tshirt)(main, main2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".38" r=".55"><stop offset="0" stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<circle cx="118" cy="132" r="150" fill="#ffffff" opacity=".28"/>
<circle cx="704" cy="686" r="196" fill="#ffffff" opacity=".2"/>
<ellipse cx="400" cy="400" rx="360" ry="330" fill="url(#glow)"/>
<ellipse cx="400" cy="672" rx="196" ry="26" fill="#0f172a" opacity=".12"/>
${shape}
${tag ? `<g><rect x="40" y="40" width="${34 + tag.length * 15}" height="52" rx="26" fill="#0b3d9e"/><text x="${57 + tag.length * 7.5}" y="74" font-family="Segoe UI,Arial,sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(tag)}</text></g>` : ''}
${label ? `<text x="400" y="742" font-family="Segoe UI,Arial,sans-serif" font-size="34" font-weight="700" fill="#0f172a" text-anchor="middle" opacity=".82">${esc(label)}</text>` : ''}
</svg>`;
}

function bannerArt({ bg1 = '#0b3d9e', bg2 = '#2f7fd0', kicker = '', title = '', sub = '', cta = '', deco = '#f59e0b', mobile = false }) {
  const W = mobile ? 960 : 1600;
  const H = Math.round(W * 9 / 16);
  const k = W / 1600;
  const x = Math.round(96 * k);
  const c1x = Math.round(W * 0.74), c1y = Math.round(H * 0.24), c1r = Math.round(250 * k);
  const c2x = Math.round(W * 0.88), c2y = Math.round(H * 0.86), c2r = Math.round(150 * k);
  const c3x = Math.round(W * 0.60), c3y = Math.round(H * 0.92), c3r = Math.round(86 * k);
  const titleSize = Math.round(78 * k);
  const kickSize = Math.round(30 * k);
  const subSize = Math.round(34 * k);
  const ctaSize = Math.round(32 * k);
  const ctaH = Math.round(72 * k);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<radialGradient id="r" cx=".74" cy=".3" r=".62"><stop offset="0" stop-color="#ffffff" stop-opacity=".34"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<rect width="${W}" height="${H}" fill="url(#r)"/>
<circle cx="${c1x}" cy="${c1y}" r="${c1r}" fill="${deco}" opacity=".2"/>
<circle cx="${c2x}" cy="${c2y}" r="${c2r}" fill="#ffffff" opacity=".12"/>
<circle cx="${c3x}" cy="${c3y}" r="${c3r}" fill="${deco}" opacity=".26"/>
<rect x="0" y="0" width="${Math.round(12 * k)}" height="${H}" fill="${deco}"/>
${kicker ? `<text x="${x}" y="${Math.round(H * (cta ? 0.3 : 0.34))}" font-family="Segoe UI,Arial,sans-serif" font-size="${kickSize}" font-weight="700" letter-spacing="${Math.round(5 * k)}" fill="${deco}">${esc(kicker.toUpperCase())}</text>` : ''}
<text x="${x}" y="${Math.round(H * (cta ? 0.52 : 0.58))}" font-family="Segoe UI,Arial,sans-serif" font-size="${titleSize}" font-weight="800" fill="#ffffff">${esc(title)}</text>
${sub ? `<text x="${x}" y="${Math.round(H * (cta ? 0.68 : 0.75))}" font-family="Segoe UI,Arial,sans-serif" font-size="${subSize}" font-weight="500" fill="#dbeafe">${esc(sub)}</text>` : ''}
${cta ? `<g><rect x="${x}" y="${Math.round(H * 0.76)}" width="${Math.round(44 + cta.length * 20 * k)}" height="${ctaH}" rx="${Math.round(ctaH / 2)}" fill="${deco}"/><text x="${x + Math.round(22 + cta.length * 10 * k)}" y="${Math.round(H * 0.76 + ctaH * 0.68)}" font-family="Segoe UI,Arial,sans-serif" font-size="${ctaSize}" font-weight="700" fill="#1f2937" text-anchor="middle">${esc(cta)}</text></g>` : ''}
</svg>`;
}

function categoryArt({ bg1 = '#e0f2fe', bg2 = '#dbeafe', main = '#0b3d9e', label = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
<rect width="480" height="480" fill="url(#g)"/>
<circle cx="392" cy="92" r="120" fill="#ffffff" opacity=".4"/>
<rect x="130" y="150" width="220" height="220" rx="52" fill="${main}" opacity=".16"/>
<path d="M190 300 L240 214 L290 300 Z" fill="${main}"/>
<circle cx="240" cy="330" r="26" fill="${main}" opacity=".65"/>
${label ? `<text x="240" y="440" font-family="Segoe UI,Arial,sans-serif" font-size="34" font-weight="700" fill="#0f172a" text-anchor="middle" opacity=".8">${esc(label)}</text>` : ''}
</svg>`;
}

module.exports = { productArt, bannerArt, categoryArt, esc };
