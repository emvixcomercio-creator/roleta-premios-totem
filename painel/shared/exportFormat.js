// Gera o mesmo formato .json que configuravel/index.html (o totem) já sabe
// importar. As imagens SEMPRE saem embutidas como data: URL (nunca uma URL
// remota do Supabase) -- é o que garante que o totem continue funcionando
// 100% offline depois de importar o arquivo, mesmo a imagem morando no
// Storage no painel.

const MIN_PRIZES = 2;
const MAX_PRIZES = 10;
const DEFAULT_PRIZES = [
  { label: 'Prêmio 1',        type: 'win' },
  { label: 'Tente Novamente', type: 'lose' },
  { label: 'Prêmio 2',        type: 'win' },
  { label: 'Prêmio 3',        type: 'win' },
  { label: 'Prêmio 4',        type: 'win' },
  { label: 'Prêmio 5',        type: 'win' },
];

export function blobToDataUrl(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url){
  if(!url) return null;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Não foi possível baixar a imagem para exportar: ' + url);
  const blob = await res.blob();
  return blobToDataUrl(blob);
}

export function slugify(text){
  const slug = (text || 'roleta')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'roleta';
}

// brandClientRow: uma linha da tabela brand_clients (logo_url/bg_url são
// URLs do Supabase Storage, não data: URLs).
export async function buildTotemExportPayload(brandClientRow){
  const [logoDataUrl, bgDataUrl] = await Promise.all([
    urlToDataUrl(brandClientRow.logo_url),
    urlToDataUrl(brandClientRow.bg_url)
  ]);

  const rawPrizes = (Array.isArray(brandClientRow.prizes) && brandClientRow.prizes.length >= MIN_PRIZES && brandClientRow.prizes.length <= MAX_PRIZES)
    ? brandClientRow.prizes
    : DEFAULT_PRIZES;

  // imagem de cada prêmio também precisa sair como data: URL (nunca uma URL
  // remota do Storage) -- mesmo motivo da logo/fundo: o totem tem que
  // conseguir mostrar tudo isso depois de importar, sem precisar de internet.
  const prizes = await Promise.all(rawPrizes.map(async (prize) => {
    if(!prize.image_url) return { label: prize.label, type: prize.type };
    return {
      label: prize.label,
      type: prize.type,
      image: await urlToDataUrl(prize.image_url)
    };
  }));

  return {
    system: 'giraEGanha',
    version: 1,
    exportedAt: new Date().toISOString(),
    brand: {
      title: brandClientRow.title || '',
      logo: logoDataUrl,
      bg: bgDataUrl,
      palette: brandClientRow.palette || null,
      hubZoom: brandClientRow.hub_zoom || 1
    },
    prizes
  };
}

export function triggerJsonDownload(payload, filenameSlug){
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gira-e-ganha-config-${filenameSlug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
