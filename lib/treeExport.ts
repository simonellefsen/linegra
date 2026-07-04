// L6 — Client-side tree export (SVG / PNG / print). No extra runtime dependencies.

const EXPORT_ROOT_SELECTOR = '[data-tree-export-root]';

export const findTreeExportRoot = (): HTMLElement | null =>
  document.querySelector(EXPORT_ROOT_SELECTOR) as HTMLElement | null;

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** Serialize the primary SVG inside the export root (edges layer). */
export const exportTreeAsSvg = (root: HTMLElement, filename = 'linegra-tree.svg'): boolean => {
  const svg = root.querySelector('svg');
  if (!svg) return false;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const rect = root.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.max(rect.width, 800)));
  clone.setAttribute('height', String(Math.max(rect.height, 600)));

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#f8fafc');
  clone.insertBefore(bg, clone.firstChild);

  const markup = new XMLSerializer().serializeToString(clone);
  downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), filename);
  return true;
};

/** Rasterize the SVG layer to PNG via an off-screen canvas. */
export const exportTreeAsPng = async (
  root: HTMLElement,
  filename = 'linegra-tree.png'
): Promise<boolean> => {
  const svg = root.querySelector('svg');
  if (!svg) return false;

  const rect = root.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width), 800);
  const height = Math.max(Math.round(rect.height), 600);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const markup = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    );
    if (!pngBlob) return false;
    downloadBlob(pngBlob, filename);
    return true;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

/** Open a print-friendly window cloning the full export root (cards + edges). */
export const printTreeView = (root: HTMLElement, title = 'Linegra Tree'): void => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!printWindow) return;

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button').forEach((btn) => btn.remove());
  clone.style.transform = 'none';
  clone.style.height = 'auto';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';

  printWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${title}</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; }
  @media print { body { background: white; } }
</style></head><body></body></html>`);
  printWindow.document.body.appendChild(clone);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export const exportTreeFromPage = async (
  format: 'svg' | 'png' | 'print',
  filenameBase = 'linegra-tree'
): Promise<boolean> => {
  const root = findTreeExportRoot();
  if (!root) return false;

  if (format === 'svg') return exportTreeAsSvg(root, `${filenameBase}.svg`);
  if (format === 'png') return exportTreeAsPng(root, `${filenameBase}.png`);
  printTreeView(root, filenameBase);
  return true;
};
