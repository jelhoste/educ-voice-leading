/*!
 * clavier-voice-leading.js
 * ------------------------------------------------------------------
 * Composant SVG autonome (sans dépendance) qui dessine deux claviers
 * de piano verticaux face à face — un accord à gauche, un accord à
 * droite — reliés par des lignes colorées montrant, voix par voix,
 * ce qui reste commun ou ce qui se déplace d'un accord à l'autre.
 *
 * Pensé pour l'écriture à quatre voix (SATB) mais fonctionne avec
 * n'importe quel jeu de voix nommées.
 *
 * UTILISATION
 * -----------
 *   <div id="mon-clavier"></div>
 *   <script src="clavier-voice-leading.js"></script>
 *   <script>
 *     VoiceLeadingKeyboard.render(
 *       'mon-clavier',
 *       { S: 'D5', A: 'G4', T: 'B3', B: 'G3' },   // accord 1 (à gauche)
 *       { S: 'E5', A: 'A4', T: 'B3', B: 'F#3' }   // accord 2 (à droite)
 *     );
 *   </script>
 *
 * FORMAT DES NOTES
 * -----------------
 * Chaîne de caractères : nom de note (+ altération # ou b) + octave.
 *   - Notation française : Do4, Ré#3, Mib5, Sol2 ...
 *   - Notation anglo-saxonne : C4, D#3, Eb5, G2 ...
 * Do4 / C4 = Do central (MIDI 60).
 *
 * On peut aussi passer directement un nombre MIDI (ex. 60) au lieu
 * d'une chaîne.
 *
 * OPTIONS (3e argument, facultatif)
 * ----------------------------------
 *   {
 *     voiceOrder: ['S','A','T','B'],   // ordre/liste des voix à dessiner
 *     colors: { S:'#f2a154', A:'#7fb3c9', T:'#c98fd6', B:'#d97a9c' },
 *     leftLabel: 'Accord 1',           // réservé pour un usage futur
 *     rightLabel: 'Accord 2'
 *   }
 *
 * VALEUR DE RETOUR
 * ----------------
 * render() retourne { midi1, midi2 } — les hauteurs MIDI calculées
 * pour chaque voix de chaque accord, utile si vous voulez aussi
 * afficher un diagnostic de conduite des voix à côté.
 * ------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  var DEFAULT_COLORS = { S: '#f2a154', A: '#7fb3c9', T: '#c98fd6', B: '#d97a9c' };
  var DEFAULT_VOICE_ORDER = ['S', 'A', 'T', 'B'];
  var WHITE_CLASSES = [0, 2, 4, 5, 7, 9, 11];
  var BLACK_CLASSES = [1, 3, 6, 8, 10];

  function mod12(n) { return ((n % 12) + 12) % 12; }

  // ---------- Note name -> MIDI ----------
  // Accepts a note name string ("Do4", "F#3", "Bb4") or a raw MIDI number.
  function parseNote(raw) {
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    if (!raw) return null;
    var s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    var fr = { 'do': 'c', 'ré': 'd', 're': 'd', 'mi': 'e', 'fa': 'f', 'sol': 'g', 'la': 'a', 'si': 'b' };
    var m = s.match(/^(do|ré|re|mi|fa|sol|la|si|[a-g])([#b]{0,2})(-?\d)$/i);
    if (!m) return null;
    var letter = m[1].toLowerCase();
    if (fr[letter]) letter = fr[letter];
    var acc = m[2];
    var octave = parseInt(m[3], 10);
    var base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[letter];
    if (base === undefined) return null;
    var accOffset = 0;
    for (var i = 0; i < acc.length; i++) accOffset += (acc[i] === '#' ? 1 : -1);
    return (octave + 1) * 12 + base + accOffset;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function pianoRange(voices, midi1, midi2) {
    var all = [];
    voices.forEach(function (v) {
      if (midi1[v] !== undefined && midi1[v] !== null) all.push(midi1[v]);
      if (midi2[v] !== undefined && midi2[v] !== null) all.push(midi2[v]);
    });
    if (!all.length) return { minKey: 48, maxKey: 72 };
    var minVal = Math.min.apply(null, all);
    var maxVal = Math.max.apply(null, all);
    var minKey = Math.floor(minVal / 12) * 12;
    var maxKey = Math.ceil((maxVal + 1) / 12) * 12;
    while (maxKey - minKey < 24) maxKey += 12;
    return { minKey: minKey, maxKey: maxKey };
  }

  /**
   * Draws the two-keyboard voice-leading diagram into the given container.
   * @param {string} containerId  id of an existing empty element (e.g. a <div>)
   * @param {Object} chord1  map of voice name -> note (string or MIDI number)
   * @param {Object} chord2  map of voice name -> note (string or MIDI number)
   * @param {Object} [options]
   * @returns {{midi1: Object, midi2: Object}}
   */
  function render(containerId, chord1, chord2, options) {
    options = options || {};
    var voices = options.voiceOrder || DEFAULT_VOICE_ORDER;
    var colors = options.colors || DEFAULT_COLORS;

    var container = document.getElementById(containerId);
    if (!container) throw new Error('VoiceLeadingKeyboard.render: aucun élément avec l\'id "' + containerId + '".');
    container.innerHTML = '';

    var midi1 = {}, midi2 = {};
    voices.forEach(function (v) {
      if (chord1[v] !== undefined) midi1[v] = parseNote(chord1[v]);
      if (chord2[v] !== undefined) midi2[v] = parseNote(chord2[v]);
    });

    var range = pianoRange(voices, midi1, midi2);
    var minKey = range.minKey, maxKey = range.maxKey;

    var W = 11;    // white key thickness along the pitch axis
    var WH = 52;   // white key length
    var BW = 7;    // black key thickness along the pitch axis
    var BH = 33;   // black key length (shorter than white)
    var GAP = 60;  // space between the two keyboards (labels + connecting lines)
    var MARGIN = 6;

    var whites = [];
    for (var m = minKey; m <= maxKey; m++) {
      if (WHITE_CLASSES.indexOf(mod12(m)) !== -1) whites.push(m);
    }
    var whiteIndex = {};
    whites.forEach(function (mm, i) { whiteIndex[mm] = i; });

    var blacks = [];
    for (var mb = minKey; mb <= maxKey; mb++) {
      if (BLACK_CLASSES.indexOf(mod12(mb)) !== -1 && whiteIndex[mb - 1] !== undefined) blacks.push(mb);
    }

    var totalH = whites.length * W + MARGIN * 2;
    var totalW = WH + GAP + WH + MARGIN * 2;
    var svg = svgEl('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, width: totalW, height: totalH });

    function posAlong(mm) {
      if (WHITE_CLASSES.indexOf(mod12(mm)) !== -1) return whiteIndex[mm] * W;
      return whiteIndex[mm - 1] * W + W * 0.62;
    }
    function yTop(mm, thickness) {
      return totalH - MARGIN - posAlong(mm) - thickness;
    }

    var colorFor1 = {}, colorFor2 = {};
    voices.forEach(function (v) {
      if (midi1[v] !== undefined && midi1[v] !== null) colorFor1[midi1[v]] = colors[v] || '#888';
      if (midi2[v] !== undefined && midi2[v] !== null) colorFor2[midi2[v]] = colors[v] || '#888';
    });

    function drawKeyboard(side, colorFor) {
      whites.forEach(function (mm) {
        var y = yTop(mm, W - 1);
        var x = side === 'left' ? MARGIN : (totalW - MARGIN - WH);
        var fill = colorFor[mm] || '#fff';
        svg.appendChild(svgEl('rect', { x: x, y: y, width: WH, height: W - 1, fill: fill, stroke: '#999', 'stroke-width': 0.6, rx: 1.2 }));
      });
      blacks.forEach(function (mm) {
        var y = yTop(mm, BW);
        var x = side === 'left' ? MARGIN : (totalW - MARGIN - BH);
        var fill = colorFor[mm] || '#2b2620';
        svg.appendChild(svgEl('rect', { x: x, y: y, width: BH, height: BW, fill: fill, stroke: '#111', 'stroke-width': 0.5, rx: 1 }));
      });
    }
    drawKeyboard('left', colorFor1);
    drawKeyboard('right', colorFor2);

    // Shared C-octave labels in the central gap
    whites.forEach(function (mm) {
      if (mod12(mm) === 0) {
        var y = yTop(mm, W - 1) + (W - 1) / 2;
        var label = svgEl('text', { x: totalW / 2, y: y + 3, 'text-anchor': 'middle', 'font-size': '8', fill: '#8a8272', 'font-family': 'sans-serif' });
        label.textContent = 'C' + (Math.floor(mm / 12) - 1);
        svg.appendChild(label);
      }
    });

    // Connecting lines + voice initials, one per voice, from chord 1 (left) to chord 2 (right)
    voices.forEach(function (v) {
      var m1 = midi1[v], m2 = midi2[v];
      if (m1 === undefined || m1 === null || m2 === undefined || m2 === null) return;
      var isBlack1 = BLACK_CLASSES.indexOf(mod12(m1)) !== -1;
      var isBlack2 = BLACK_CLASSES.indexOf(mod12(m2)) !== -1;
      var thick1 = isBlack1 ? BW : (W - 1);
      var thick2 = isBlack2 ? BW : (W - 1);
      var len1 = isBlack1 ? BH : WH;
      var len2 = isBlack2 ? BH : WH;

      var y1 = yTop(m1, thick1) + thick1 / 2;
      var y2 = yTop(m2, thick2) + thick2 / 2;
      var x1 = MARGIN + len1;
      var x2 = totalW - MARGIN - len2;

      var color = colors[v] || '#888';
      svg.appendChild(svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: color, 'stroke-width': 2, opacity: 0.85 }));

      [[x1, y1], [x2, y2]].forEach(function (pt) {
        svg.appendChild(svgEl('circle', { cx: pt[0], cy: pt[1], r: 6.5, fill: color, stroke: '#fff', 'stroke-width': 1 }));
        var label = svgEl('text', { x: pt[0], y: pt[1] + 3, 'text-anchor': 'middle', 'font-size': '7.5', 'font-weight': '700', fill: '#fff', 'font-family': 'sans-serif' });
        label.textContent = v;
        svg.appendChild(label);
      });
    });

    container.appendChild(svg);
    return { midi1: midi1, midi2: midi2 };
  }

  global.VoiceLeadingKeyboard = {
    render: render,
    parseNote: parseNote
  };

})(typeof window !== 'undefined' ? window : this);
