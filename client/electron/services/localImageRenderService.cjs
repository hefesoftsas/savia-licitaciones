const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, app: electronApp, nativeImage } = require('electron');

const DEFAULT_COMPONENT_CONCURRENCY = 5;
const MIN_COMPONENT_CONCURRENCY = 1;
const MAX_COMPONENT_CONCURRENCY = 20;
/** Reference width for local Mermaid rendering, approximately A4 usable body width. */
const WORD_FRIENDLY_RENDER_WIDTH = 680;
/** Render Mermaid at 3× resolution for clear Word scaling and high-density displays. */
const MERMAID_CAPTURE_SCALE = 3;
/** HTML illustration design width matches generation prompts; scale proportionally during Word export. */
const HTML_DESIGN_WIDTH = 1240;
/** HTML canvases follow content frame ratios; dimensions include padding on all sides. */
const HTML_FRAME_HEIGHTS = { square: 1240, wide: 827, tall: 1653, panorama: 698 };
const HTML_CANVAS_PADDING = 40;
/** Render HTML at 2× resolution to balance clarity and long-image memory use. */
const HTML_CAPTURE_SCALE = 2;
/** Minimum design font size for visible HTML text to remain readable after Word scaling. */
const HTML_MIN_TEXT_FONT_SIZE = 24;
/** HTML taller than this threshold triggers additional shrinking in Word. */
const HTML_MAX_DESIGN_HEIGHT = 1800;
const MERMAID_RENDER_TIMEOUT_MS = 30000;
const HTML_RENDER_TIMEOUT_MS = 120000;
const MAX_CAPTURE_SEGMENT_HEIGHT = 8192;
const LAYOUT_SETTLE_MS = 120;
const PAUSE_POLL_MS = 100;

let serviceInstance = null;

// Throw immediately if the caller has requested pause.
function throwIfPaused(options, fallbackMessage = '转图已暂停') {
  if (options?.isPauseRequested?.()) {
    throw options.createPauseError?.() || new Error(fallbackMessage);
  }
}

// Clamp component concurrency to its valid range.
function clampConcurrency(value, fallback = DEFAULT_COMPONENT_CONCURRENCY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_COMPONENT_CONCURRENCY, Math.max(MIN_COMPONENT_CONCURRENCY, Math.round(number)));
}

// Resolve the Mermaid browser script path.
function resolveMermaidBrowserScript() {
  try {
    return require.resolve('mermaid/dist/mermaid.min.js');
  } catch {
    const candidates = [
      path.join(electronApp.getAppPath(), 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
      path.join(__dirname, '..', '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('未找到 mermaid 浏览器脚本，无法本地渲染 Mermaid');
  }
}

// Simple asynchronous concurrency pool.
function createConcurrencyPool(getLimit) {
  let active = 0;
  const queue = [];

  function pump() {
    const limit = Math.max(1, Number(getLimit()) || DEFAULT_COMPONENT_CONCURRENCY);
    while (active < limit && queue.length > 0) {
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return function run(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
  };
}

// Wait the specified milliseconds.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Create a hidden rendering window.
function createRenderWindow(width, height, { allowScripts = false } = {}) {
  const win = new BrowserWindow({
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      javascript: allowScripts,
      partition: `image-render-${randomUUID()}`,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.setMenuBarVisibility(false);
  return win;
}

// Ensure the page debugger is attached.
async function ensureDebugger(webContents) {
  if (!webContents.debugger.isAttached()) {
    webContents.debugger.attach('1.3');
  }
}

// Set device viewport dimensions.
async function setDeviceMetrics(webContents, width, height, deviceScaleFactor = 1) {
  await ensureDebugger(webContents);
  await webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    deviceScaleFactor: Math.max(1, Number(deviceScaleFactor) || 1),
    mobile: false,
  });
}

// Capture a rectangular region as PNG.
async function captureClip(webContents, clip) {
  await ensureDebugger(webContents);
  const result = await webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: clip.x,
      y: clip.y,
      width: clip.width,
      height: clip.height,
      scale: 1,
    },
  });
  if (!result?.data) throw new Error('页面截图失败：未返回图像数据');
  return Buffer.from(result.data, 'base64');
}

// Return actual PNG pixel dimensions.
function getPngResult(buffer, fallbackWidth, fallbackHeight) {
  const image = nativeImage.createFromBuffer(buffer);
  const size = image.isEmpty() ? {} : image.getSize();
  return {
    buffer,
    width: Math.max(1, Number(size.width) || fallbackWidth),
    height: Math.max(1, Number(size.height) || fallbackHeight),
  };
}

// Stitch PNG segments vertically without seams using nativeImage and actual capture pixel dimensions.
function stitchPngVertically(buffers) {
  const images = buffers.map((buffer) => {
    const image = nativeImage.createFromBuffer(buffer);
    return { image, size: image.getSize() };
  });
  const totalWidth = Math.max(1, ...images.map(({ size }) => size.width));
  const totalHeight = Math.max(1, images.reduce((sum, { size }) => sum + size.height, 0));
  const canvas = Buffer.alloc(totalWidth * totalHeight * 4, 255);
  let offsetY = 0;
  for (const { image, size } of images) {
    const bitmap = image.toBitmap();
    const rowBytes = size.width * 4;
    for (let y = 0; y < size.height; y += 1) {
      const srcStart = y * rowBytes;
      const destStart = ((offsetY + y) * totalWidth) * 4;
      bitmap.copy(canvas, destStart, srcStart, srcStart + rowBytes);
    }
    offsetY += size.height;
  }
  const stitched = nativeImage.createFromBitmap(canvas, { width: totalWidth, height: totalHeight });
  const png = stitched.toPNG();
  if (!png?.length) throw new Error('拼接截图失败');
  return { buffer: png, width: totalWidth, height: totalHeight };
}

// Capture the full content height, segmenting and stitching seamlessly when needed.
async function captureFullContent(webContents, width, height, options = {}) {
  throwIfPaused(options);
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const captureScale = Math.max(1, Math.round(Number(options.captureScale) || 1));
  const maxSegmentHeight = Math.max(1, Math.floor(MAX_CAPTURE_SEGMENT_HEIGHT / captureScale));
  if (safeHeight <= maxSegmentHeight) {
    await setDeviceMetrics(webContents, safeWidth, safeHeight, captureScale);
    throwIfPaused(options);
    const buffer = await captureClip(webContents, {
      x: 0,
      y: 0,
      width: safeWidth,
      height: safeHeight,
    });
    return getPngResult(buffer, safeWidth * captureScale, safeHeight * captureScale);
  }

  const segments = [];
  let y = 0;
  while (y < safeHeight) {
    throwIfPaused(options);
    const segmentHeight = Math.min(maxSegmentHeight, safeHeight - y);
    await setDeviceMetrics(webContents, safeWidth, segmentHeight, captureScale);
    const buffer = await captureClip(webContents, {
      x: 0,
      y,
      width: safeWidth,
      height: segmentHeight,
    });
    segments.push(buffer);
    y += segmentHeight;
  }
  return stitchPngVertically(segments);
}

// Poll page resources and layout without blocking individual checks so Main can respond to pause.
// contentOnly measures only #savia-capture-root bounds, avoiding right-side whitespace caused by fixed body width.
async function probeLayoutMetrics(webContents, minWidth, contentOnly = false) {
  const floorWidth = Math.max(1, Math.round(Number(minWidth) || 1));
  return webContents.executeJavaScript(`(() => {
    const contentOnly = ${contentOnly ? 'true' : 'false'};
    const root = document.documentElement;
    const body = document.body;
    const target = document.getElementById('savia-capture-root') || body || root;
    if (!target) return { ready: false, width: 0, height: 0 };
    const images = Array.from(document.images || []);
    const imagesReady = images.every((img) => img.complete);
    const fontsReady = !document.fonts || document.fonts.status === 'loaded' || document.fonts.status === 'idle';
    const rect = target.getBoundingClientRect();
    let width;
    let height;
    if (contentOnly) {
      // 仅量捕获根节点（含 padding）；SVG 异常小时回退 viewBox / getBBox。
      width = Math.ceil(Math.max(rect.width, target.scrollWidth || 0, 1));
      height = Math.ceil(Math.max(rect.height, target.scrollHeight || 0, 1));
      const svg = target.querySelector && target.querySelector('svg');
      if (svg && (width < 24 || height < 24)) {
        let svgW = 0;
        let svgH = 0;
        const attrW = parseFloat(svg.getAttribute('width') || '');
        const attrH = parseFloat(svg.getAttribute('height') || '');
        if (Number.isFinite(attrW) && Number.isFinite(attrH) && attrW > 0 && attrH > 0) {
          svgW = attrW;
          svgH = attrH;
        } else {
          const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
          if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
            svgW = vb[2];
            svgH = vb[3];
          } else {
            try {
              const box = svg.getBBox();
              if (box && box.width > 0 && box.height > 0) {
                svgW = box.width;
                svgH = box.height;
              }
            } catch {}
          }
        }
        if (svgW > 0 && svgH > 0) {
          width = Math.ceil(svgW + 16);
          height = Math.ceil(svgH + 16);
        }
      }
    } else {
      width = Math.ceil(Math.max(
        rect.width,
        target.scrollWidth || 0,
        body?.scrollWidth || 0,
        root?.scrollWidth || 0,
        ${floorWidth},
      ));
      height = Math.ceil(Math.max(
        rect.height,
        target.scrollHeight || 0,
        body?.scrollHeight || 0,
        root?.scrollHeight || 0,
        1,
      ));
    }
    return { ready: imagesReady && fontsReady && width > 0 && height > 0, width, height };
  })()`, true);
}

// Before final capture, use actual browser layout to identify objective text/canvas problems in model-generated HTML.
// Check text transforms only; writing-mode is outside scope, so vertical text remains allowed.
function buildHtmlLayoutProbeScript() {
  return `(() => {
    const root=document.body;
    if(!root)return ['未找到截图画布'];
    const issues=[];
    const add=(value)=>{if(value&&!issues.includes(value)&&issues.length<12)issues.push(value)};
    const visible=(element)=>{const style=getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>0};
    const label=(element)=>{const tag=(element.tagName||'元素').toLowerCase();const className=String(element.className||'').trim().split(/\\s+/).filter(Boolean).slice(0,2).join('.');return className?tag+'.'+className:tag};
    const related=(left,right)=>left===right||left.contains(right)||right.contains(left);
    const canvasRect=root.getBoundingClientRect();
    const padding=getComputedStyle(root);
    const rootRect={left:canvasRect.left+parseFloat(padding.paddingLeft),right:canvasRect.right-parseFloat(padding.paddingRight),top:canvasRect.top+parseFloat(padding.paddingTop),bottom:canvasRect.bottom-parseFloat(padding.paddingBottom)};
    const minFontSize=${HTML_MIN_TEXT_FONT_SIZE};
    const textEntries=[];
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(!node.nodeValue||!node.nodeValue.trim())continue;
      const element=node.parentElement;
      if(!element||!visible(element)||['script','style','noscript'].includes(element.tagName.toLowerCase()))continue;
      const range=document.createRange();range.selectNodeContents(node);
      const rects=Array.from(range.getClientRects()).filter((rect)=>rect.width>0&&rect.height>0);
      if(rects.length)textEntries.push({element,rects});
    }
    const hasInvalidTransform=(transform)=>{
      if(!transform||transform==='none')return false;
      const match=transform.match(/^matrix\\(([^)]+)\\)$/);
      if(match){const values=match[1].split(',').map(Number);return values.length!==6||Math.abs(values[1])>.01||Math.abs(values[2])>.01||values[0]<0||values[3]<0||Math.abs(Math.abs(values[0])-1)>.01||Math.abs(Math.abs(values[3])-1)>.01}
      const matrix3d=transform.match(/^matrix3d\\(([^)]+)\\)$/);
      if(matrix3d){const values=matrix3d[1].split(',').map(Number);return values.length!==16||Math.abs(values[1])>.01||Math.abs(values[4])>.01||Math.abs(values[0]-1)>.01||Math.abs(values[5]-1)>.01||values[0]<0||values[5]<0}
      return true;
    };
    for(const entry of textEntries){
      for(let element=entry.element;element&&element!==root.parentElement;element=element.parentElement){
        const style=getComputedStyle(element);
        if(hasInvalidTransform(style.transform)){add('文字存在旋转、倒置、镜像或缩放变形：'+label(element));break}
        if(style.position==='fixed'||style.position==='sticky'){add('文字使用固定或粘性定位，截图布局不稳定：'+label(element));break}
      }
      const fontSize=parseFloat(getComputedStyle(entry.element).fontSize||'0');
      if(fontSize>0&&fontSize<minFontSize)add('文字字号过小：'+label(entry.element)+' 为 '+fontSize+'px，至少需要 '+minFontSize+'px');
      for(const rect of entry.rects){
        if(rect.left<rootRect.left-1||rect.right>rootRect.right+1||rect.top<rootRect.top-1||rect.bottom>rootRect.bottom+1){add('文字超出截图画布：'+label(entry.element));break}
        for(let element=entry.element;element&&element!==root.parentElement;element=element.parentElement){
          const style=getComputedStyle(element);
          const clipsX=['hidden','clip','scroll','auto'].includes(style.overflowX);
          const clipsY=['hidden','clip','scroll','auto'].includes(style.overflowY);
          const box=element.getBoundingClientRect();
          if((clipsX&&(rect.left<box.left-1||rect.right>box.right+1))||(clipsY&&(rect.top<box.top-1||rect.bottom>box.bottom+1))){add('文字被容器裁切：'+label(element));break}
          if(style.textOverflow==='ellipsis'&&element.scrollWidth>element.clientWidth+1){add('文字被省略截断：'+label(element));break}
        }
      }
    }
    for(let index=0;index<textEntries.length;index+=1){
      for(let next=index+1;next<textEntries.length;next+=1){
        const left=textEntries[index];const right=textEntries[next];
        if(related(left.element,right.element)||left.element===right.element)continue;
        const overlaps=left.rects.some((a)=>right.rects.some((b)=>{
          const width=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
          const height=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
          return width*height>=Math.max(8,Math.min(a.width*a.height,b.width*b.height)*.2);
        }));
        if(overlaps)add('文字内容发生重叠：'+label(left.element)+' 与 '+label(right.element));
      }
    }
    for(const entry of textEntries){
      const rect=entry.rects[0];
      const points=[[rect.left+rect.width/2,rect.top+rect.height/2],[rect.left+Math.min(3,rect.width/2),rect.top+rect.height/2]];
      for(const [x,y] of points){
        if(x<rootRect.left||x>rootRect.right||y<rootRect.top||y>rootRect.bottom)continue;
        const top=document.elementsFromPoint(x,y).find((element)=>element!==document.documentElement&&element!==document.body);
        if(!top||related(top,entry.element)||!visible(top))continue;
        const style=getComputedStyle(top);
        const background=style.backgroundImage!=='none'||!/^rgba?\\([^)]*,\\s*0\\)$/.test(style.backgroundColor)||['img','svg','canvas','video'].includes(top.tagName.toLowerCase());
        if(background){add('文字被前景元素遮挡：'+label(entry.element)+' 被 '+label(top)+' 覆盖');break}
      }
    }
    for(const element of root.querySelectorAll('*')){
      if(!visible(element))continue;
      const rect=element.getBoundingClientRect();
      if(rect.width>0&&rect.height>0&&(rect.left<rootRect.left-1||rect.right>rootRect.right+1||rect.top<rootRect.top-1||rect.bottom>rootRect.bottom+1)){add('元素超出画布内容区域：'+label(element));}
    }
    if(!textEntries.length&&!root.querySelector('img,svg,canvas,video'))add('截图画布没有可见内容');
    return issues;
  })()`;
}

async function probeHtmlLayoutIssues(webContents) {
  const result = await webContents.executeJavaScript(buildHtmlLayoutProbeScript(), true);
  return Array.isArray(result) ? result.map((issue) => String(issue || '').trim()).filter(Boolean) : [];
}

// Wait for stable page layout/resources and return actual content dimensions while responding to pause.
async function waitForLayoutReady(webContents, timeoutMs, minWidth = 1, options = {}) {
  const contentOnly = options.contentOnly === true;
  const started = Date.now();
  let stableSince = 0;
  let lastKey = '';

  while (Date.now() - started < timeoutMs) {
    throwIfPaused(options);
    try {
      const metrics = await probeLayoutMetrics(webContents, minWidth, contentOnly);
      if (metrics?.ready && metrics.width > 0 && metrics.height > 0) {
        const key = `${metrics.width}x${metrics.height}`;
        if (key !== lastKey) {
          lastKey = key;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= LAYOUT_SETTLE_MS) {
          return { width: metrics.width, height: metrics.height };
        }
      } else {
        lastKey = '';
        stableSince = 0;
      }
    } catch {
      lastKey = '';
      stableSince = 0;
    }
    await delay(PAUSE_POLL_MS);
  }
  throw new Error('等待页面布局稳定超时');
}

// Use body itself as the fixed canvas, preserving generated Flex/Grid parent-child relationships.
function buildHtmlDocument(html, height) {
  const source = String(html || '').trim();
  const styleTag = `<style id="savia-capture-style">
html, body {
  margin: 0 !important;
  width: ${HTML_DESIGN_WIDTH}px !important;
  min-width: ${HTML_DESIGN_WIDTH}px !important;
  max-width: ${HTML_DESIGN_WIDTH}px !important;
  height: ${height}px !important;
  min-height: ${height}px !important;
  max-height: ${height}px !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}
html { padding: 0 !important; background: #ffffff; }
body { padding: ${HTML_CANVAS_PADDING}px !important; }
*, *::before, *::after { box-sizing: border-box; }
img, svg, canvas, video { max-width: 100%; height: auto; }
</style>`;
  if (/<html[\s>]/i.test(source)) {
    if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `<meta charset="utf-8">${styleTag}</head>`);
    return source.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="utf-8">${styleTag}</head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${styleTag}</head><body>${source}</body></html>`;
}

function buildExactHtmlDocument(html, width, height) {
  const source = String(html || '').trim();
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${safeWidth}px !important;
      height: ${safeHeight}px !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    #savia-capture-root {
      width: ${safeWidth}px;
      height: ${safeHeight}px;
      overflow: hidden;
    }
    *, *::before, *::after { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="savia-capture-root">${source}</div>
</body>
</html>`;
}

// Build the local Mermaid page: retain actual SVG dimensions, scale down proportionally when too wide, and shrink the page to content.
function buildMermaidDocument(code, mermaidScriptUrl) {
  const escaped = JSON.stringify(String(code || '')).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const maxContentWidth = WORD_FRIENDLY_RENDER_WIDTH - 16;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      width: fit-content;
      height: fit-content;
      overflow: hidden;
    }
    #savia-capture-root {
      display: inline-block;
      margin: 0;
      padding: 8px;
      background: #ffffff;
      width: fit-content;
      height: fit-content;
      min-width: 1px;
      min-height: 1px;
      line-height: 0;
    }
    #savia-capture-root svg {
      display: block;
    }
  </style>
  <script src="${mermaidScriptUrl}"></script>
</head>
<body>
  <div id="savia-capture-root"></div>
  <script>
    (async () => {
      try {
        const code = ${escaped};
        const maxW = ${maxContentWidth};
        window.__saviaMermaidReady = false;
        window.__saviaMermaidError = '';
        mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
        const id = 'mermaid-' + Date.now();
        const { svg } = await mermaid.render(id, code);
        const root = document.getElementById('savia-capture-root');
        root.innerHTML = svg;
        const svgEl = root.querySelector('svg');
        if (svgEl) {
          // 解析 mermaid 给出的固有尺寸；禁止直接删除 width/height，否则会塌成白图小黑点。
          const parseSize = (value) => {
            const n = parseFloat(String(value || '').replace('px', '').trim());
            return Number.isFinite(n) && n > 0 ? n : 0;
          };
          let w = parseSize(svgEl.getAttribute('width'));
          let h = parseSize(svgEl.getAttribute('height'));
          if (!w || !h) {
            const vb = String(svgEl.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
            if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
              w = vb[2];
              h = vb[3];
            }
          }
          if (!w || !h) {
            try {
              const box = svgEl.getBBox();
              if (box && box.width > 0 && box.height > 0) {
                w = box.width;
                h = box.height;
              }
            } catch {}
          }
          if (w > 0 && h > 0) {
            const scale = w > maxW ? (maxW / w) : 1;
            const outW = Math.max(1, Math.round(w * scale));
            const outH = Math.max(1, Math.round(h * scale));
            svgEl.setAttribute('width', String(outW));
            svgEl.setAttribute('height', String(outH));
            svgEl.style.width = outW + 'px';
            svgEl.style.height = outH + 'px';
            svgEl.style.maxWidth = 'none';
          }
        }
        window.__saviaMermaidReady = true;
      } catch (error) {
        window.__saviaMermaidError = error && error.message ? error.message : String(error || 'Mermaid 渲染失败');
        window.__saviaMermaidReady = true;
      }
    })();
  </script>
</body>
</html>`;
}

// Write and load temporary HTML to reference the local Mermaid script; respond to pause during loading.
async function loadHtmlDocument(win, html, timeoutMs, options = {}) {
  throwIfPaused(options);
  const tempDir = path.join(os.tmpdir(), 'savia-local-image-render');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `render-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tempFile, html, 'utf-8');
  const fileUrl = pathToFileURL(tempFile).href;
  const allowedFiles = new Set([fileUrl, ...(options.allowedFileUrls || [])]);
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const allowed = allowedFiles.has(details.url) || details.url.startsWith('data:') || details.url.startsWith('blob:');
    callback({ cancel: !allowed });
  });

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error('加载渲染页面超时')), timeoutMs);
      const pauseWatcher = options.isPauseRequested
        ? setInterval(() => {
          if (options.isPauseRequested?.() && !settled) {
            try {
              win.webContents.stop();
            } catch {
              // ignore
            }
            finish(options.createPauseError?.() || new Error('转图已暂停'));
          }
        }, PAUSE_POLL_MS)
        : null;

      const cleanup = () => {
        clearTimeout(timer);
        if (pauseWatcher) clearInterval(pauseWatcher);
        win.webContents.removeListener('did-finish-load', onLoad);
        win.webContents.removeListener('did-fail-load', onFail);
      };

      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };

      const onLoad = () => finish(null);
      const onFail = (_event, code, description) => {
        if (options.isPauseRequested?.()) {
          finish(options.createPauseError?.() || new Error('转图已暂停'));
          return;
        }
        finish(new Error(`加载渲染页面失败：${description || code}`));
      };

      win.webContents.once('did-finish-load', onLoad);
      win.webContents.once('did-fail-load', onFail);
      win.loadURL(fileUrl).catch((error) => {
        if (options.isPauseRequested?.()) {
          finish(options.createPauseError?.() || new Error('转图已暂停'));
          return;
        }
        finish(error);
      });
    });
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // ignore
    }
  }
}

// Close the window and detach the debugger.
function destroyWindow(win) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.webContents?.debugger?.isAttached?.()) {
      win.webContents.debugger.detach();
    }
  } catch {
    // ignore
  }
  win.destroy();
}

// Run a task with timeout control.
async function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Create the local image-rendering service.
function createLocalImageRenderService({ configStore } = {}) {
  const runMermaid = createConcurrencyPool(() => clampConcurrency(
    configStore?.load?.()?.components?.mermaid_concurrency_limit,
    DEFAULT_COMPONENT_CONCURRENCY,
  ));
  const runHtml = createConcurrencyPool(() => clampConcurrency(
    configStore?.load?.()?.components?.html_concurrency_limit,
    DEFAULT_COMPONENT_CONCURRENCY,
  ));

  // Render Mermaid locally to PNG.
  async function renderMermaidToPng(code, options = {}) {
    return runMermaid(async () => {
      throwIfPaused(options, 'Mermaid 转图已暂停');
      const mermaidScriptPath = resolveMermaidBrowserScript();
      const mermaidScriptUrl = pathToFileURL(mermaidScriptPath).href;
      const html = buildMermaidDocument(code, mermaidScriptUrl);
      const win = createRenderWindow(WORD_FRIENDLY_RENDER_WIDTH, 480, { allowScripts: true });
      try {
        await withTimeout(
          loadHtmlDocument(win, html, MERMAID_RENDER_TIMEOUT_MS, { ...options, allowedFileUrls: [mermaidScriptUrl] }),
          MERMAID_RENDER_TIMEOUT_MS,
          'Mermaid 页面加载超时',
        );
        // Start with a large enough viewport to lay out SVG at intrinsic size before measuring its bounds.
        await setDeviceMetrics(win.webContents, WORD_FRIENDLY_RENDER_WIDTH, 1200);
        const ready = await withTimeout((async () => {
          const started = Date.now();
          while (Date.now() - started < MERMAID_RENDER_TIMEOUT_MS) {
            throwIfPaused(options, 'Mermaid 转图已暂停');
            const state = await win.webContents.executeJavaScript(`({
              ready: Boolean(window.__saviaMermaidReady),
              error: String(window.__saviaMermaidError || ''),
            })`, true);
            if (state.ready) return state;
            await delay(PAUSE_POLL_MS);
          }
          throw new Error('Mermaid 渲染超时');
        })(), MERMAID_RENDER_TIMEOUT_MS, 'Mermaid 渲染超时');
        if (ready.error) throw new Error(ready.error);
        const metrics = await waitForLayoutReady(win.webContents, MERMAID_RENDER_TIMEOUT_MS, 1, {
          ...options,
          contentOnly: true,
        });
        // Capture content bounds without forcing width 680; excessive widths were already scaled proportionally inside the page.
        const rawWidth = Math.ceil(metrics.width || 0);
        const rawHeight = Math.ceil(metrics.height || 0);
        if (rawWidth < 24 || rawHeight < 24) {
          throw new Error(`Mermaid 内容尺寸异常（${rawWidth}x${rawHeight}），可能未正确渲染`);
        }
        const width = Math.min(WORD_FRIENDLY_RENDER_WIDTH, Math.max(1, rawWidth));
        const height = Math.max(1, rawHeight);
        return await captureFullContent(win.webContents, width, height, {
          ...options,
          captureScale: MERMAID_CAPTURE_SCALE,
        });
      } finally {
        destroyWindow(win);
      }
    });
  }

  // Render HTML and check layout only, without generating PNG.
  async function probeHtmlLayoutOnly(html, options = {}) {
    return runHtml(async () => {
      throwIfPaused(options, 'HTML 质检已暂停');
      const width = HTML_DESIGN_WIDTH;
      const height = HTML_FRAME_HEIGHTS[options.frameSize];
      const documentHtml = buildHtmlDocument(html, height);
      const win = createRenderWindow(width, height);
      try {
        await withTimeout(
          loadHtmlDocument(win, documentHtml, HTML_RENDER_TIMEOUT_MS, options),
          HTML_RENDER_TIMEOUT_MS,
          'HTML 页面加载超时',
        );
        throwIfPaused(options, 'HTML 质检已暂停');
        await setDeviceMetrics(win.webContents, width, height);
        await withTimeout(
          waitForLayoutReady(win.webContents, HTML_RENDER_TIMEOUT_MS, HTML_DESIGN_WIDTH, options),
          HTML_RENDER_TIMEOUT_MS,
          'HTML 布局等待超时',
        );
        const layoutIssues = await probeHtmlLayoutIssues(win.webContents);
        return { width, height, layout_issues: layoutIssues };
      } finally {
        destroyWindow(win);
      }
    });
  }

  // Capture the fixed canvas and report overflow through layout_issues without expanding capture or shrinking content.
  async function renderHtmlToPng(html, options = {}) {
    return runHtml(async () => {
      throwIfPaused(options, 'HTML 转图已暂停');
      const width = HTML_DESIGN_WIDTH;
      const height = HTML_FRAME_HEIGHTS[options.frameSize];
      const documentHtml = buildHtmlDocument(html, height);
      const win = createRenderWindow(width, height);
      try {
        await withTimeout(
          loadHtmlDocument(win, documentHtml, HTML_RENDER_TIMEOUT_MS, options),
          HTML_RENDER_TIMEOUT_MS,
          'HTML 页面加载超时',
        );
        throwIfPaused(options, 'HTML 转图已暂停');
        // Use the same viewport for layout and capture to avoid reflow of percentages or viewport units.
        await setDeviceMetrics(win.webContents, width, height);
        await withTimeout(
          waitForLayoutReady(win.webContents, HTML_RENDER_TIMEOUT_MS, HTML_DESIGN_WIDTH, options),
          HTML_RENDER_TIMEOUT_MS,
          'HTML 布局等待超时',
        );
        // Content generation may disable secondary optimization; other callers retain existing layout checks by default.
        const layoutIssues = options.checkLayout === false ? [] : await probeHtmlLayoutIssues(win.webContents);
        throwIfPaused(options, 'HTML 转图已暂停');
        const captured = await captureFullContent(win.webContents, width, height, {
          ...options,
          captureScale: HTML_CAPTURE_SCALE,
        });
        return { ...captured, layout_issues: layoutIssues };
      } finally {
        destroyWindow(win);
      }
    });
  }

  async function renderExactHtmlToPng({ html, width, height, scale = 2 } = {}, options = {}) {
    return runHtml(async () => {
      throwIfPaused(options, 'HTML 转图已暂停');
      const safeWidth = Math.max(1, Math.round(Number(width) || 1));
      const safeHeight = Math.max(1, Math.round(Number(height) || 1));
      const captureScale = Math.max(1, Math.round(Number(scale) || 2));
      const documentHtml = buildExactHtmlDocument(html, safeWidth, safeHeight);
      const win = createRenderWindow(safeWidth, safeHeight);
      try {
        await withTimeout(
          loadHtmlDocument(win, documentHtml, HTML_RENDER_TIMEOUT_MS, options),
          HTML_RENDER_TIMEOUT_MS,
          'HTML 页面加载超时',
        );
        throwIfPaused(options, 'HTML 转图已暂停');
        await setDeviceMetrics(win.webContents, safeWidth, safeHeight, captureScale);
        await delay(LAYOUT_SETTLE_MS);
        throwIfPaused(options, 'HTML 转图已暂停');
        const buffer = await captureClip(win.webContents, {
          x: 0,
          y: 0,
          width: safeWidth,
          height: safeHeight,
        });
        return getPngResult(buffer, safeWidth * captureScale, safeHeight * captureScale);
      } finally {
        destroyWindow(win);
      }
    });
  }

  return {
    renderMermaidToPng,
    renderHtmlToPng,
    renderExactHtmlToPng,
    probeHtmlLayoutOnly,
    wordFriendlyRenderWidth: WORD_FRIENDLY_RENDER_WIDTH,
    htmlDesignWidth: HTML_DESIGN_WIDTH,
  };
}

// Initialize the global local image-rendering service.
function initLocalImageRenderService(options = {}) {
  serviceInstance = createLocalImageRenderService(options);
  return serviceInstance;
}

// Get the global local image-rendering service.
function getLocalImageRenderService() {
  if (!serviceInstance) {
    serviceInstance = createLocalImageRenderService();
  }
  return serviceInstance;
}

module.exports = {
  HTML_CAPTURE_SCALE,
  HTML_DESIGN_WIDTH,
  HTML_MAX_DESIGN_HEIGHT,
  WORD_FRIENDLY_RENDER_WIDTH,
  createLocalImageRenderService,
  getLocalImageRenderService,
  initLocalImageRenderService,
  __test__: { buildHtmlLayoutProbeScript },
};
