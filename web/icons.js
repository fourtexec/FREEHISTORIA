const shapes = {
  back:'<path d="m14 5-7 7 7 7"/>',
  bolt:'<path d="m14 2-9 12h6l-1 8 9-13h-6z"/>',
  play:'<path d="m6 3 15 9-15 9z"/>',
  games:'<path d="M7 6h10c3 0 4 4 5 10 .6 4-2 5-5 2l-2-2H9l-2 2c-3 3-5.6 2-5-2 1-6 2-10 5-10z"/><path d="M6 10v4m-2-2h4m8-1h.1m2 2h.1"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2c0-6 14-6 14 0v2M16 5c4 0 4 6 0 6m2 3q4 1 4 6"/>', 
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.8 5.2L8 16l2.8-5.2Z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
  archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
  book:'<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1v14"/>',
  sliders:'<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  server:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.1M7 17.5h.1"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', diag:'<path d="M6 18 18 6M6 6h12v12"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>', close:'<path d="m5 5 14 14M19 5 5 19"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4m10-4v4"/>',
  flag:'<path d="M5 21V4c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  layers:'<path d="m12 2 10 6-10 6L2 8Zm-9 11 9 5 9-5M3 17l9 5 9-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  source:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  plus:'<path d="M12 4v16M4 12h16"/>', menu:'<path d="M3 5h18M3 12h18M3 19h18"/>',
  pin:'<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'
};
export const icon = (id,size=18) => '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shapes[id]+'</svg>';
