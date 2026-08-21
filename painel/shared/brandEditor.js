// Lógica de extração de cor e edição de prêmios, adaptada de
// configuravel/index.html (mesmas funções, copiadas quase ao pé da letra) --
// aqui rodando dentro do painel de gestão em vez do totem.

export const MIN_PRIZES = 2;
export const MAX_PRIZES = 10;

/* ---- extração automática da cor predominante da logo ---- */
export function rgbToHsl(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max + min) / 2;
  if(max === min){ h = s = 0; }
  else{
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}
export function hslToRgb(h, s, l){
  let r, g, b;
  if(s === 0){ r = g = b = l; }
  else{
    const hue2rgb = (p, q, t) => {
      if(t < 0) t += 1;
      if(t > 1) t -= 1;
      if(t < 1/6) return p + (q - p) * 6 * t;
      if(t < 1/2) return q;
      if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}
export function rgbToHex(rgb){
  return '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
export function adjustLightness(rgb, factor){
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h, s, Math.max(0, Math.min(1, l * factor)));
}

// varre a logo (recebe um src local: data: URL ou object URL -- nunca uma
// URL remota, pra não esbarrar em CORS/canvas "tainted") e acha a cor viva
// mais frequente (ignora branco/preto/cinza de fundo).
export function extractDominantColor(imgSrc){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 50;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const cctx = canvas.getContext('2d');
      cctx.drawImage(img, 0, 0, size, size);
      let data;
      try{ data = cctx.getImageData(0, 0, size, size).data; }
      catch(e){ resolve(null); return; }

      const counts = {};
      for(let i = 0; i < data.length; i += 4){
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if(a < 200) continue;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lightness = (max + min) / 2 / 255;
        if(sat < 0.28 || lightness > 0.9 || lightness < 0.1) continue;
        const key = [Math.round(r/12)*12, Math.round(g/12)*12, Math.round(b/12)*12].join(',');
        counts[key] = (counts[key] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if(sorted.length === 0){ resolve(null); return; }
      resolve(sorted[0][0].split(',').map(Number));
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

export function paletteFromColor(rgb){
  return {
    primary: rgbToHex(rgb),
    primaryDark: rgbToHex(adjustLightness(rgb, 0.72)),
    primaryDarker: rgbToHex(adjustLightness(rgb, 0.5)),
    primaryRgb: rgb.join(',')
  };
}

// Redimensiona a imagem em canvas (igual ao totem) mas devolve um Blob
// (pra subir no Storage) + um data:/object URL local pra preview e
// extração de cor, sem precisar rebaixar do servidor.
export function fileToResizedBlob(file, maxDim, keepTransparency){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width > height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const cctx = canvas.getContext('2d');
        cctx.drawImage(img, 0, 0, width, height);
        const mime = keepTransparency ? 'image/png' : 'image/jpeg';
        const quality = keepTransparency ? undefined : 0.85;
        canvas.toBlob((blob) => {
          if(!blob){ reject(new Error('Não foi possível processar a imagem.')); return; }
          resolve({
            blob,
            ext: keepTransparency ? 'png' : 'jpg',
            previewDataUrl: canvas.toDataURL(mime, quality)
          });
        }, mime, quality);
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

/* ---- editor de prêmios (idêntico ao configuravel/index.html) ---- */
export function addPrizeRow(label, type){
  const editor = document.getElementById('prizesEditor');
  if(editor.children.length >= MAX_PRIZES) return;
  const row = document.createElement('div');
  row.className = 'prize-row';
  row.innerHTML = `
    <span class="prize-row-num"></span>
    <input type="text" class="prize-label-input" value="${(label || '').replace(/"/g,'&quot;')}">
    <select class="prize-type-input">
      <option value="win"${type !== 'lose' ? ' selected' : ''}>Ganha</option>
      <option value="lose"${type === 'lose' ? ' selected' : ''}>Não ganha</option>
    </select>
    <button type="button" class="prize-remove-btn" title="Remover prêmio">✕</button>
  `;
  row.querySelector('.prize-remove-btn').addEventListener('click', () => {
    row.remove();
    updatePrizeRowState();
  });
  editor.appendChild(row);
  updatePrizeRowState();
}

export function updatePrizeRowState(){
  const rows = document.querySelectorAll('#prizesEditor .prize-row');
  rows.forEach((row, i) => {
    row.querySelector('.prize-row-num').textContent = i + 1;
    row.querySelector('.prize-remove-btn').disabled = rows.length <= MIN_PRIZES;
  });
  const addBtn = document.getElementById('prizeAddBtn');
  if(addBtn) addBtn.disabled = rows.length >= MAX_PRIZES;
}

export function renderPrizesEditor(prizes){
  const editor = document.getElementById('prizesEditor');
  editor.innerHTML = '';
  prizes.forEach(prize => addPrizeRow(prize.label, prize.type));
  updatePrizeRowState();
}

export function readPrizesFromEditor(){
  const rows = document.querySelectorAll('#prizesEditor .prize-row');
  return Array.from(rows).map(row => ({
    label: row.querySelector('.prize-label-input').value.trim() || 'Prêmio',
    type: row.querySelector('.prize-type-input').value
  }));
}
