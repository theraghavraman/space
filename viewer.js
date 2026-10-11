(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const safeText = (v) => String(v == null ? "" : v);
  const escapeHTML = (v) => safeText(v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const formatBytes = (n) => {
    if (!Number.isFinite(n)) return "Unknown";
    if (n < 1024) return n + " B";
    const u = ["KB","MB","GB","TB"];
    let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) + " " + u[i];
  };
  const MAX_TEXT_BYTES = 32 * 1024 * 1024;
  const MAX_CONVERT_BYTES = 100 * 1024 * 1024;
  const MAX_TABLE_ROWS = 250;
  const libs = {};
  let activeFile = null, currentPreview = {}, activeUrl = "", activeArchive = null, activeGzipBytes = null;

  const stage = () => $("#viewerStage");
  function status(message, type) {
    const node = $("#viewerStatus");
    if (!node) return;
    node.textContent = message;
    node.className = "status" + (type ? " " + type : "");
    node.classList.remove("hidden");
  }
  function extOf(file) {
    const name = (file && file.name || "").toLowerCase();
    const m = name.match(/(\.[a-z0-9][a-z0-9._-]*)$/);
    if (!m) return "";
    const ext = m[1];
    const known = [".nii.gz",".fits.gz",".tar.gz",".nc4",".hdf5",".geojson",".shp.xml",".votable.xml",".fits.fz",".fits"," .jpeg".trim(),".tiff",".jp2",".jpeg2000",".glb",".gltf",".parquet",".feather",".arrow",".sqlite",".gpkg",".grib2",".grb2",".grib",".grb",".tsv",".csv",".json",".xml",".yaml",".yml",".pdf",".xlsx",".xlsm",".xlsb",".xlsx",".xls",".ods",".zip",".gz",".las",".laz",".e57",".png",".jpg",".webp",".gif",".bmp",".avif",".svg",".mp4",".mov",".webm",".mkv",".mp3",".wav",".ogg",".flac",".fits",".nc",".cdf",".h5",".hdf",".fits",".bsp",".spk",".ck",".pck",".dsk",".vot",".kml",".kmz",".gpx",".pcap",".log",".txt",".md",".yaml",".yml",".stl",".obj",".3mf",".step",".stp",".iges",".vtk",".vtp",".pds",".lbl",".img",".bin",".dat",".ipynb",".py",".sql"];
    known.sort((a,b)=>b.length-a.length);
    return known.find((e)=>name.endsWith(e)) || ext;
  }
  function loadScript(url, test, module) {
    if (test && test()) return Promise.resolve();
    if (libs[url]) return libs[url];
    libs[url] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      if (module) s.type = "module";
      s.async = true;
      s.onload = () => {
        if (!test || test()) resolve();
        else if (module) resolve();
        else reject(new Error("Library loaded but its public API was not found."));
      };
      s.onerror = () => reject(new Error("Could not load the reader library. Check your connection and try again."));
      document.head.appendChild(s);
    });
    return libs[url];
  }
  const LIB = {
    papa: "https://cdn.jsdelivr.net/npm/papaparse@5.5.3/papaparse.min.js",
    sheet: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    yaml: "https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js",
    fflate: "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js",
    geotiff: "https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js",
    modelViewer: "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"
  };
  function clearStage() {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    activeUrl = "";
    stage().replaceChildren();
    currentPreview = {};
    activeArchive = null;
    activeGzipBytes = null;
  }
  function newObjectUrl(blob) {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    activeUrl = URL.createObjectURL(blob);
    return activeUrl;
  }
  function extLabel(file) {
    return extOf(file).replace(/^\./,"").toUpperCase() || (file.type || "Unknown type");
  }
  function metaStrip(items) {
    const box = document.createElement("div");
    box.className = "viewer-metrics";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "viewer-metric";
      const small = document.createElement("small");
      small.textContent = item[0];
      const strong = document.createElement("strong");
      strong.textContent = item[1];
      card.append(small,strong); box.append(card);
    });
    stage().append(box);
  }
  function addHeading(title, note) {
    const head = document.createElement("div");
    head.className = "viewer-stage-head";
    const h = document.createElement("h3"); h.textContent = title;
    const p = document.createElement("p"); p.textContent = note || "";
    head.append(h,p); stage().append(head);
  }
  function addPre(text, label) {
    const wrap = document.createElement("div"); wrap.className = "viewer-pre-wrap";
    if (label) { const cap = document.createElement("div"); cap.className = "viewer-caption"; cap.textContent = label; wrap.append(cap); }
    const pre = document.createElement("pre"); pre.className = "viewer-pre"; pre.textContent = text;
    wrap.append(pre); stage().append(wrap);
    currentPreview.text = text;
    return pre;
  }
  function addTable(rows, headers, note) {
    const wrap = document.createElement("div"); wrap.className = "viewer-table-wrap";
    if (note) { const p = document.createElement("p"); p.className = "viewer-caption"; p.textContent = note; wrap.append(p); }
    if (!headers || !headers.length) headers = rows.length ? rows[0].map((_,i) => "Column " + (i+1)) : [];
    const table = document.createElement("table"); table.className = "viewer-data-table";
    const thead = document.createElement("thead"), trh = document.createElement("tr");
    headers.slice(0,40).forEach((h) => { const th = document.createElement("th"); th.textContent = safeText(h); trh.append(th); });
    thead.append(trh); table.append(thead);
    const tbody = document.createElement("tbody");
    rows.slice(0,MAX_TABLE_ROWS).forEach((row) => {
      const tr = document.createElement("tr");
      const values = Array.isArray(row) ? row : headers.map((h) => row[h]);
      values.slice(0,40).forEach((value) => { const td = document.createElement("td"); td.textContent = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : safeText(value); tr.append(td); });
      tbody.append(tr);
    });
    table.append(tbody); wrap.append(table); stage().append(wrap);
    currentPreview.rows = rows;
    currentPreview.headers = headers;
  }
  function addNotice(message, tone) {
    const p = document.createElement("div"); p.className = "viewer-notice" + (tone ? " " + tone : ""); p.textContent = message; stage().append(p);
  }
  function renderBinary(bytes, name) {
    const rows = [];
    for (let i=0;i<bytes.length;i+=16) {
      const part = bytes.slice(i,i+16);
      const hex = Array.from(part).map((v)=>v.toString(16).padStart(2,"0")).join(" ").padEnd(47," ");
      const ascii = Array.from(part).map((v)=>v>=32 && v<=126 ? String.fromCharCode(v) : ".").join("");
      rows.push(i.toString(16).padStart(8,"0")+"  "+hex+"  |"+ascii+"|");
    }
    addPre(rows.join("\n"), "HEX PREVIEW · FIRST " + bytes.length + " BYTES");
  }
  async function readHead(file, n) {
    return new Uint8Array(await file.slice(0,n).arrayBuffer());
  }
  function likelyText(bytes) {
    if (!bytes.length) return true;
    let unusual = 0;
    for (let i=0;i<Math.min(bytes.length,4096);i++) if (bytes[i]===0 || (bytes[i]<9 || (bytes[i]>13 && bytes[i]<32))) unusual++;
    return unusual / Math.min(bytes.length,4096) < 0.08;
  }
  function supportedTextExt(ext) {
    return [".txt",".md",".csv",".tsv",".tab",".json",".geojson",".xml",".gml",".kml",".gpx",".yaml",".yml",".log",".lbl",".pvl",".sql",".py",".ipynb",".vrt",".prj",".wkt",".rpc",".hdr",".ini",".cfg",".dat",".asc",".stp",".step",".obj",".mtl",".xyz",".pts",".sp3",".orb",".out",".err",".lis"].includes(ext);
  }
  function setTargets(targets) {
    const select = $("#viewerTarget"); select.replaceChildren();
    const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Choose a conversion…"; select.append(empty);
    targets.forEach((item) => { const option = document.createElement("option"); option.value=item.value; option.textContent=item.label; select.append(option); });
    $("#viewerConvert").disabled = !targets.length;
    $("#viewerConvert").textContent = targets.length ? "Convert & download" : "No direct conversion";
  }
  function targetsFor(file, kind) {
    const ext = extOf(file);
    const common = [{value:"zip",label:"Create ZIP archive"}];
    if (kind === "image") return [{value:"png",label:"Image → PNG"}, {value:"jpeg",label:"Image → JPEG"}, {value:"webp",label:"Image → WebP"}].concat(common);
    if (kind === "tiff" || kind === "fits") return [{value:"png",label:"Rendered preview → PNG"}, {value:"jpeg",label:"Rendered preview → JPEG"}].concat(common);
    if (kind === "pdf") return [{value:"pdf-png",label:"Current PDF page → PNG"}, {value:"pdf-jpeg",label:"Current PDF page → JPEG"}].concat(common);
    if (kind === "table" || ext===".csv" || ext===".tsv" || ext===".tab") return [{value:"csv",label:"Export as CSV"}, {value:"tsv",label:"Export as TSV"}, {value:"json",label:"Table → JSON"}].concat(common);
    if (kind === "json") return [{value:"json-pretty",label:"Pretty-print JSON"}, {value:"json-min",label:"Minify JSON"}, {value:"csv",label:"JSON records → CSV"}, {value:"tsv",label:"JSON records → TSV"}, {value:"yaml",label:"JSON → YAML"}, {value:"xml",label:"JSON → XML"}].concat(common);
    if (kind === "yaml") return [{value:"json",label:"YAML → JSON"}, {value:"yaml",label:"Normalize YAML"}].concat(common);
    if (kind === "xml") return [{value:"json",label:"XML → JSON (simple documents)"}, {value:"xml",label:"Normalize XML"}].concat(common);
    if (kind === "workbook") return [{value:"csv",label:"Selected sheet → CSV"}, {value:"tsv",label:"Selected sheet → TSV"}, {value:"json",label:"Selected sheet → JSON"}].concat(common);
    if (kind === "zip") return common;
    if (kind === "gzip") return [{value:"decompress",label:"Decompress GZIP"}].concat(common);
    return common;
  }
  function noteFile(file, subtitle) {
    $("#viewerFileName").textContent = file.name;
    $("#viewerFileMeta").textContent = extLabel(file) + " · " + formatBytes(file.size) + " · " + (file.type || "MIME not declared");
    $("#viewerDetected").textContent = subtitle || "Viewer selected";
    $("#viewerOriginal").disabled = false;
    $("#viewerCopy").disabled = true;
  }
  async function renderImage(file, kind) {
    addHeading("Image viewer", "Original pixels are shown by your browser. Export options re-encode locally.");
    const img = document.createElement("img"); img.className="viewer-image"; img.alt="Preview of "+file.name; img.src=newObjectUrl(file);
    const frame = document.createElement("div"); frame.className="viewer-image-frame"; frame.append(img); stage().append(frame);
    try { await img.decode(); } catch (_) { throw new Error("This browser cannot decode this image type. Use the official specialist tool linked in the format atlas."); }
    currentPreview = {type:kind || "image", image:img, width:img.naturalWidth, height:img.naturalHeight};
    metaStrip([["WIDTH",img.naturalWidth+" px"],["HEIGHT",img.naturalHeight+" px"],["FORMAT",extLabel(file)]]);
  }
  async function imageToCanvas(file) {
    const maxEdge=8192;
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext("2d",{willReadFrequently:false});
    ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    return canvas;
  }
  async function renderCsv(file, separator) {
    await loadScript(LIB.papa,()=>!!window.Papa);
    addHeading("Delimited data viewer", "Streaming preview limited to the first "+MAX_TABLE_ROWS+" records to protect browser memory.");
    return new Promise((resolve,reject)=>{
      window.Papa.parse(file,{header:true,skipEmptyLines:true,preview:MAX_TABLE_ROWS,delimiter:separator||"",worker:true,complete:(results)=>{
        const headers=results.meta.fields || (results.data[0] ? Object.keys(results.data[0]) : []);
        const rows=results.data.map((row)=>headers.map((h)=>row[h]));
        metaStrip([["SAMPLE ROWS",String(rows.length)],["COLUMNS",String(headers.length)],["DELIMITER",results.meta.delimiter || "auto"]]);
        addTable(rows,headers,"Preview only · conversion can process files up to "+formatBytes(MAX_CONVERT_BYTES)+".");
        if (results.errors && results.errors.length) addNotice(results.errors.length+" parser warning(s); inspect malformed quoting or inconsistent rows before conversion.","warn");
        currentPreview={type:"table",rows:results.data,headers:headers,separator:results.meta.delimiter || separator || ","};
        $("#viewerCopy").disabled=false;
        resolve();
      },error:reject});
    });
  }
  async function renderJson(file) {
    const text=await file.slice(0,MAX_TEXT_BYTES).text();
    let parsed;
    if(file.size > MAX_TEXT_BYTES) { addHeading("Large structured file", "Showing an initial text segment; full JSON parsing is skipped above 32 MB."); addPre(text,"JSON TEXT · PREVIEW TRUNCATED"); return; }
    try { parsed=JSON.parse(text); } catch(err) { addHeading("JSON / text viewer","Parser reported a syntax problem. The original text is still available below."); addPre(text,"RAW JSON"); addNotice(err.message,"warn"); currentPreview={type:"text",text:text}; $("#viewerCopy").disabled=false; return; }
    const pretty=JSON.stringify(parsed,null,2);
    const stats=Array.isArray(parsed) ? "Array · "+parsed.length+" item(s)" : typeof parsed==="object" && parsed!==null ? "Object · "+Object.keys(parsed).length+" key(s)" : typeof parsed;
    addHeading("Structured JSON viewer", "Parsed locally; nested values are shown as formatted JSON.");
    metaStrip([["ROOT TYPE",stats],["CHARACTERS",String(text.length)],["FORMAT","JSON"]]);
    addPre(pretty,"FORMATTED JSON");
    currentPreview={type:"json",value:parsed,text:pretty};
    $("#viewerCopy").disabled=false;
  }
  async function renderYaml(file) {
    const text=await file.slice(0,MAX_TEXT_BYTES).text();
    addHeading("YAML viewer","Raw YAML remains available even if the optional parser does not load.");
    try {
      await loadScript(LIB.yaml,()=>!!window.jsyaml);
      const value=window.jsyaml.load(text,{json:true});
      metaStrip([["PARSER","js-yaml"],["CHARACTERS",String(text.length)],["TYPE",Array.isArray(value)?"sequence":typeof value]]);
      addPre(JSON.stringify(value,null,2),"PARSED VALUE · JSON VIEW");
      currentPreview={type:"yaml",value:value,text:text};
      $("#viewerCopy").disabled=false;
    } catch(err) {
      addPre(text,"RAW YAML");
      addNotice("YAML parse was unavailable or failed: "+err.message,"warn");
      currentPreview={type:"yaml",text:text};
      $("#viewerCopy").disabled=false;
    }
  }
  async function renderXml(file) {
    const text=await file.slice(0,MAX_TEXT_BYTES).text();
    addHeading("XML / label viewer","PDS labels, VOTable, GML, KML and other XML-family files are shown as source, not silently rewritten.");
    const doc=new DOMParser().parseFromString(text,"application/xml");
    const error=doc.querySelector("parsererror");
    metaStrip([["ROOT",doc.documentElement && doc.documentElement.nodeName || "unavailable"],["CHARACTERS",String(text.length)],["PARSE",error?"error":"well-formed XML"]]);
    addPre(text,"XML SOURCE");
    if(error) addNotice("XML parser error detected: "+error.textContent.slice(0,300),"warn");
    currentPreview={type:"xml",text:text};
    $("#viewerCopy").disabled=false;
  }
  async function renderWorkbook(file) {
    if(file.size>MAX_CONVERT_BYTES) throw new Error("Workbook exceeds the 100 MB browser safety limit. Use the official local conversion tool for large spreadsheets.");
    await loadScript(LIB.sheet,()=>!!window.XLSX);
    const workbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
    if(!workbook.SheetNames.length) throw new Error("No worksheets found in this workbook.");
    const picker=$("#viewerSheet"); picker.replaceChildren();
    workbook.SheetNames.forEach((name)=>{const op=document.createElement("option");op.value=name;op.textContent=name;picker.append(op);});
    picker.classList.remove("hidden");
    addHeading("Spreadsheet viewer","Choose a worksheet. Preview is limited to "+MAX_TABLE_ROWS+" rows × 40 columns; formulas are displayed as cached values.");
    const displaySheet=(sheetName)=>{
      const sheet=workbook.Sheets[sheetName];
      const rows=window.XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:"",blankrows:false});
      const headers=(rows[0] || []).map((v,i)=>v || "Column "+(i+1));
      const body=rows.slice(1,MAX_TABLE_ROWS+1);
      stage().querySelector(".viewer-table-wrap")?.remove();
      addTable(body,headers,"Worksheet: "+sheetName+" · "+Math.max(0,rows.length-1)+" data row(s) · sheet export uses cached/display values.");
      currentPreview={type:"workbook",workbook:workbook,rows:rows,headers:headers,sheetName:sheetName};
    };
    displaySheet(workbook.SheetNames[0]);
    picker.onchange=()=>displaySheet(picker.value);
    metaStrip([["SHEETS",String(workbook.SheetNames.length)],["FIRST SHEET ROWS",String(Math.max(0,window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1}).length-1))],["WORKBOOK",extLabel(file)]]);
    $("#viewerCopy").disabled=false;
  }
  async function renderPdf(file) {
    await loadScript(LIB.pdf,()=>!!window.pdfjsLib);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    currentPreview={type:"pdf",pdf:pdf,page:1};
    addHeading("PDF page viewer","Page raster preview. PDF→PNG/JPEG exports the currently displayed page and is not a searchable PDF conversion.");
    metaStrip([["PAGES",String(pdf.numPages)],["PDF VERSION","PDF.js"],["RENDER MODE","Local page canvas"]]);
    const controls=document.createElement("div"); controls.className="viewer-page-controls";
    const prev=document.createElement("button"); prev.className="btn small"; prev.id="pdfPrev"; prev.textContent="← Previous";
    const label=document.createElement("span"); label.id="pdfPageLabel"; label.textContent="Page 1 / "+pdf.numPages;
    const next=document.createElement("button"); next.className="btn small"; next.id="pdfNext"; next.textContent="Next →";
    controls.append(prev,label,next); stage().append(controls);
    const canvas=document.createElement("canvas");canvas.className="viewer-pdf-canvas";stage().append(canvas);
    currentPreview.canvas=canvas;
    const renderPage=async(n)=>{
      currentPreview.page=n;
      const page=await pdf.getPage(n);
      const base=page.getViewport({scale:1});
      const scale=Math.min(1.65,1200/base.width);
      const viewport=page.getViewport({scale:scale});
      canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);
      await page.render({canvasContext:canvas.getContext("2d"),viewport:viewport}).promise;
      label.textContent="Page "+n+" / "+pdf.numPages;
      prev.disabled=n<=1;next.disabled=n>=pdf.numPages;
    };
    prev.onclick=()=>renderPage(Math.max(1,currentPreview.page-1)).catch((e)=>status("PDF render error: "+e.message,"error"));
    next.onclick=()=>renderPage(Math.min(pdf.numPages,currentPreview.page+1)).catch((e)=>status("PDF render error: "+e.message,"error"));
    await renderPage(1);
    $("#viewerCopy").disabled=true;
  }
  function fitsValue(view,bitpix,offset) {
    if(bitpix===8) return view.getUint8(offset);
    if(bitpix===16) return view.getInt16(offset,false);
    if(bitpix===32) return view.getInt32(offset,false);
    if(bitpix===-32) return view.getFloat32(offset,false);
    if(bitpix===-64) return view.getFloat64(offset,false);
    return null;
  }
  async function renderFits(file) {
    const bytes=await readHead(file,Math.min(file.size,2880*32));
    const text=Array.from(bytes).map((b)=>String.fromCharCode(b)).join("");
    const headers={}; let end=-1;
    for(let i=0;i+80<=text.length;i+=80) {
      const card=text.slice(i,i+80); const key=card.slice(0,8).trim();
      if(key==="END") {end=i+80;break;}
      if(card[8]==="=") {
        let raw=card.slice(10).split("/")[0].trim();
        if(raw.startsWith("'")&&raw.endsWith("'")) raw=raw.slice(1,-1).trim();
        const num=Number(raw); headers[key]=raw!=="" && Number.isFinite(num) && !raw.startsWith("'") ? num : raw;
      }
    }
    addHeading("FITS astronomy viewer","Primary uncompressed 2-D image planes are rendered as a visual preview; this is not FITSverify or scientific compliance validation.");
    const details=Object.entries(headers).map((e)=>e[0].padEnd(8," ")+" = "+e[1]).join("\n");
    addPre(details || text.slice(0,2880),"PRIMARY HDU HEADER");
    const bitpix=Number(headers.BITPIX), width=Number(headers.NAXIS1), height=Number(headers.NAXIS2), naxis=Number(headers.NAXIS);
    metaStrip([["BITPIX",String(headers.BITPIX||"unknown")],["DIMENSIONS",naxis>=2 ? width+" × "+height : String(naxis||"unknown")+" axis/axes"],["HEADER",end>=0?"END card found":"header incomplete"]]);
    if(end<0 || naxis<2 || !width || !height || ![8,16,32,-32,-64].includes(bitpix)) {
      addNotice("This FITS file has no supported primary 2-D image plane. Header inspection works; table, cube and compressed-image visualization needs a specialized FITS reader.","warn");
      currentPreview={type:"fits",text:details};$("#viewerCopy").disabled=false;return;
    }
    const dataOffset=Math.ceil(end/2880)*2880;
    const pixelCount=width*height, bytesPerPixel=Math.abs(bitpix)/8;
    if(!Number.isSafeInteger(pixelCount) || pixelCount>8000000 || dataOffset+pixelCount*bytesPerPixel>file.size) {
      addNotice("Image plane is too large or incomplete for browser rendering. Header details are available above.","warn");
      currentPreview={type:"fits",text:details};$("#viewerCopy").disabled=false;return;
    }
    const outW=Math.min(1400,width),outH=Math.min(1400,height,Math.max(1,Math.round(height*outW/width)));
    const sample=new Float64Array(outW*outH); const view=new DataView(await file.slice(dataOffset,dataOffset+pixelCount*bytesPerPixel).arrayBuffer());
    const bscale=Number(headers.BSCALE ?? 1), bzero=Number(headers.BZERO ?? 0);
    let min=Infinity,max=-Infinity;
    for(let y=0;y<outH;y++) for(let x=0;x<outW;x++) {
      const sx=Math.min(width-1,Math.floor(x*width/outW)),sy=Math.min(height-1,Math.floor(y*height/outH));
      const v=fitsValue(view,bitpix,(sy*width+sx)*bytesPerPixel)*bscale+bzero,idx=y*outW+x;
      sample[idx]=v;
      if(Number.isFinite(v)){if(v<min)min=v;if(v>max)max=v;}
    }
    const canvas=document.createElement("canvas");canvas.className="viewer-science-canvas";canvas.width=outW;canvas.height=outH;
    const ctx=canvas.getContext("2d"),img=ctx.createImageData(outW,outH),span=(max-min)||1;
    for(let i=0;i<sample.length;i++){const v=Math.max(0,Math.min(255,Math.round((sample[i]-min)/span*255)));img.data[i*4]=v;img.data[i*4+1]=v;img.data[i*4+2]=v;img.data[i*4+3]=Number.isFinite(sample[i])?255:0;}
    ctx.putImageData(img,0,0);
    const wrap=document.createElement("div");wrap.className="viewer-image-frame";wrap.append(canvas);stage().append(wrap);
    currentPreview={type:"fits",canvas:canvas,text:details};
    metaStrip([["PIXEL SCALE",String(min)+" → "+String(max)],["PREVIEW",outW+" × "+outH],["RENDER","Grayscale stretch"]);
    $("#viewerCopy").disabled=false;
  }
  async function renderGeoTiff(file) {
    await loadScript(LIB.geotiff,()=>!!window.GeoTIFF);
    const tiff=await window.GeoTIFF.fromBlob(file);
    const image=await tiff.getImage();
    const width=image.getWidth(),height=image.getHeight(),samples=image.getSamplesPerPixel()||1;
    const outW=Math.min(1200,width),outH=Math.max(1,Math.round(height*outW/width));
    const data=await image.readRasters({width:outW,height:outH,interleave:true});
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const count=outW*outH;
    for(let p=0;p<count;p++)for(let c=0;c<Math.min(3,samples);c++){const v=Number(data[p*samples+c]);if(Number.isFinite(v)){min[c]=Math.min(min[c],v);max[c]=Math.max(max[c],v);}}
    const canvas=document.createElement("canvas");canvas.className="viewer-science-canvas";canvas.width=outW;canvas.height=outH;
    const ctx=canvas.getContext("2d"),img=ctx.createImageData(outW,outH);
    for(let p=0;p<count;p++) {
      for(let c=0;c<3;c++){
        const band=Math.min(c,samples-1),v=Number(data[p*samples+band]),span=(max[band]-min[band])||1;
        img.data[p*4+c]=Math.max(0,Math.min(255,Math.round((v-min[band])/span*255)));
      }
      img.data[p*4+3]=255;
    }
    ctx.putImageData(img,0,0);
    addHeading("GeoTIFF / cloud-optimized raster viewer","A downsampled display stretch is used for preview. Raw raster values, georeferencing and scientific units are not altered in the original file.");
    const frame=document.createElement("div");frame.className="viewer-image-frame";frame.append(canvas);stage().append(frame);
    metaStrip([["RASTER",width+" × "+height],["BANDS",String(samples)],["PREVIEW",outW+" × "+outH]]);
    const info={};
    try { info.origin=image.getOrigin(); info.resolution=image.getResolution(); info.boundingBox=image.getBoundingBox(); } catch(_){}
    addPre(JSON.stringify(info,null,2),"GEOREFERENCE METADATA");
    currentPreview={type:"tiff",canvas:canvas,metadata:info};
  }
  async function renderArchive(file) {
    if(file.size>MAX_CONVERT_BYTES) throw new Error("Archive is over the 100 MB browser extraction limit; use a desktop archive tool for larger data.");
    await loadScript(LIB.fflate,()=>!!window.fflate);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const ext=extOf(file);
    let entries;
    if(ext===".gz" || /\.gz$/i.test(file.name)) {
      const output=window.fflate.gunzipSync(bytes);activeGzipBytes=output;
      addHeading("GZIP inspector","The compressed payload has been decompressed locally in memory. Use the download button to save it separately.");
      metaStrip([["COMPRESSED",formatBytes(file.size)],["EXPANDED",formatBytes(output.byteLength)],["TYPE","GZIP stream"]]);
      const preview=output.subarray(0,Math.min(output.length,2*1024*1024));
      addPre(new TextDecoder("utf-8",{fatal:false}).decode(preview),"DECOMPRESSED TEXT PREVIEW");
      if(preview.length<output.length)addNotice("Text preview truncated; the decompressed data can still be downloaded in full.");
      currentPreview={type:"gzip",bytes:output};setTargets([{value:"decompress",label:"Download decompressed payload"}].concat([{value:"zip",label:"Wrap original in ZIP"}]));
      const btn=document.createElement("button");btn.className="btn small";btn.textContent="Download decompressed file";btn.onclick=()=>downloadBlob(new Blob([output]),file.name.replace(/\.gz$/i,"")||"decompressed.bin");stage().append(btn);
      return;
    }
    entries=window.fflate.unzipSync(bytes);activeArchive=entries;
    addHeading("ZIP archive browser","Archive entries are listed locally. Extraction uses the original entry bytes; no server upload is performed.");
    const names=Object.keys(entries);
    metaStrip([["ENTRIES",String(names.length)],["ARCHIVE SIZE",formatBytes(file.size)],["EXTRACTION","Local only"]]);
    const rows=names.slice(0,1000).map((name)=>[name,formatBytes(entries[name].byteLength),entries[name].byteLength]);
    addTable(rows,["Entry path","Expanded size","Bytes"],names.length>1000?"First 1,000 entries shown.":"Archive entry listing.");
    const list=document.createElement("div");list.className="viewer-archive-list";
    names.slice(0,500).forEach((name)=>{
      const row=document.createElement("div");row.className="viewer-archive-item";
      const title=document.createElement("span");title.textContent=name;
      const info=document.createElement("small");info.textContent=formatBytes(entries[name].byteLength);
      const btn=document.createElement("button");btn.className="btn small";btn.textContent="Extract";
      btn.onclick=()=>downloadBlob(new Blob([entries[name]]),name.split("/").pop()||"extracted.bin");
      row.append(title,info,btn);list.append(row);
    });
    stage().append(list);
    currentPreview={type:"zip",entries:entries};
    setTargets([{value:"zip",label:"Create ZIP of original archive (nested)"}]);
  }
  async function renderModel(file) {
    await loadScript(LIB.modelViewer,()=>!!customElements.get("model-viewer"),true);
    await customElements.whenDefined("model-viewer");
    addHeading("3D model viewer","GLB is the most portable single-file input. External buffers referenced by a .gltf file may need to be selected alongside the model.");
    const url=newObjectUrl(file),model=document.createElement("model-viewer");
    model.setAttribute("src",url);model.setAttribute("camera-controls","");model.setAttribute("auto-rotate","");model.setAttribute("shadow-intensity","1");
    model.style.width="100%";model.style.height="520px";model.style.background="linear-gradient(135deg,#e3eef4,#f4f6f0)";model.style.borderRadius="18px";
    stage().append(model);
    currentPreview={type:"model",url:url};
  }
  async function renderFile(file) {
    if(!file) return;
    clearStage();activeFile=file;
    noteFile(file,"Detecting format…");
    setTargets([{value:"zip",label:"Create ZIP archive"}]);
    $("#viewerSheet").classList.add("hidden");$("#viewerSheet").replaceChildren();
    status("Reading "+file.name+" locally. No upload is performed.");
    const ext=extOf(file);
    try {
      let kind="binary";
      if(ext===".pdf" || file.type==="application/pdf") {
        kind="pdf";setTargets(targetsFor(file,kind));await renderPdf(file);
      } else if([".png",".jpg",".jpeg",".webp",".gif",".bmp",".avif",".svg",".ico"].includes(ext) || (file.type&&file.type.startsWith("image/")&&![".jp2",".jpeg2000"].includes(ext))) {
        kind="image";setTargets(targetsFor(file,kind));await renderImage(file,kind);
      } else if([".tif",".tiff",".cog",".geotiff"].includes(ext)) {
        kind="tiff";setTargets(targetsFor(file,kind));await renderGeoTiff(file);
      } else if([".fits",".fit",".fts"].includes(ext)) {
        kind="fits";setTargets(targetsFor(file,kind));await renderFits(file);
      } else if([".csv",".tsv",".tab"].includes(ext)) {
        kind="table";setTargets(targetsFor(file,kind));await renderCsv(file,ext===".tsv"||ext===".tab"?"\t":"");
      } else if([".xlsx",".xlsm",".xlsb",".xls",".ods"].includes(ext)) {
        kind="workbook";setTargets(targetsFor(file,kind));await renderWorkbook(file);
      } else if([".json",".geojson"].includes(ext)) {
        kind="json";setTargets(targetsFor(file,kind));await renderJson(file);
      } else if([".yaml",".yml"].includes(ext)) {
        kind="yaml";setTargets(targetsFor(file,kind));await renderYaml(file);
      } else if([".xml",".gml",".kml",".gpx",".lbl.xml",".votable.xml",".pvl"].includes(ext)) {
        kind="xml";setTargets(targetsFor(file,kind));await renderXml(file);
      } else if([".zip",".kmz"].includes(ext) || ext===".gz" || /\.gz$/i.test(file.name)) {
        kind=ext===".gz"?"gzip":"zip";await renderArchive(file);
      } else if([".mp3",".wav",".ogg",".flac",".m4a",".aac"].includes(ext) || (file.type&&file.type.startsWith("audio/"))) {
        kind="audio";addHeading("Audio player","Playback depends on the codecs supported by this browser.");
        const audio=document.createElement("audio");audio.controls=true;audio.src=newObjectUrl(file);audio.className="viewer-media";stage().append(audio);
        metaStrip([["FILE",file.name],["SIZE",formatBytes(file.size)],["PLAYBACK","Native browser audio"]]);setTargets([{value:"zip",label:"Create ZIP archive"}]);
      } else if([".mp4",".mov",".webm",".mkv",".avi",".m4v"].includes(ext) || (file.type&&file.type.startsWith("video/"))) {
        kind="video";addHeading("Video player","Only codecs supported by this browser can play. The file is not transcoded in-place.");
        const video=document.createElement("video");video.controls=true;video.preload="metadata";video.src=newObjectUrl(file);video.className="viewer-media";stage().append(video);
        metaStrip([["FILE",file.name],["SIZE",formatBytes(file.size)],["PLAYBACK","Native browser video"]]);setTargets([{value:"zip",label:"Create ZIP archive"}]);
      } else if([".glb",".gltf"].includes(ext)) {
        kind="model";await renderModel(file);setTargets([{value:"zip",label:"Create ZIP archive"}]);
      } else if(supportedTextExt(ext)) {
        kind="text";const text=await file.slice(0,MAX_TEXT_BYTES).text();
        addHeading("Text / source viewer","Shown as text, never executed as HTML or script.");
        addPre(text,"TEXT SOURCE"+(file.size>MAX_TEXT_BYTES?" · FIRST 32 MB ONLY":""));
        if(file.size>MAX_TEXT_BYTES)addNotice("Text preview truncated at 32 MB. Large scientific text products are better inspected with a local streaming tool.","warn");
        currentPreview={type:"text",text:text};$("#viewerCopy").disabled=false;
        setTargets([{value:"text",label:"Save as UTF-8 text"}].concat([{value:"zip",label:"Create ZIP archive"}]));
      } else {
        kind="binary";addHeading("Binary / scientific-format viewer","No generic parser can safely interpret every mission-specific binary layout. This view shows the signature and a byte-level window; the format atlas links the official reader / validator.");
        const bytes=await readHead(file,512);
        const readable=likelyText(bytes);
        metaStrip([["EXTENSION",extLabel(file)],["SIZE",formatBytes(file.size)],["VIEWER","Signature + hex"]]);
        renderBinary(bytes,file.name);
        if(readable) addNotice("These initial bytes appear text-like. Use the format-specific documentation to interpret records and units.");
        addNotice("Scientific binary families such as CDF, HDF5, GRIB, PDS, CCSDS telemetry and SPICE kernels need specialist parsers for full fidelity.","warn");
        currentPreview={type:"binary",bytes:bytes};
        setTargets([{value:"zip",label:"Create ZIP archive"}]);
      }
      noteFile(file,(currentPreview.type||kind).toUpperCase()+" VIEW");
      status("Loaded "+file.name+". Preview and supported conversions run in this browser session.","success");
    } catch(err) {
      addHeading("Viewer could not fully decode this file","The file remains local; try the matching official reader from the Format Atlas.");
      const bytes=await readHead(file,256).catch(()=>new Uint8Array());
      renderBinary(bytes,file.name);
      addNotice((err && err.message) || String(err),"warn");
      currentPreview={type:"binary",bytes:bytes};
      noteFile(file,"BASIC BYTE VIEW");
      setTargets([{value:"zip",label:"Create ZIP archive"}]);
      status("Specialized reader unavailable; showing a safe byte preview instead.","error");
    }
  }
  async function parseTableFile(file) {
    if(file.size>MAX_CONVERT_BYTES) throw new Error("Conversion is limited to 100 MB in this browser. Use a local streaming tool for large files.");
    await loadScript(LIB.papa,()=>!!window.Papa);
    return new Promise((resolve,reject)=>{
      window.Papa.parse(file,{header:true,skipEmptyLines:true,worker:true,complete:(r)=>{
        if(r.errors&&r.errors.length>20) reject(new Error("Too many CSV parsing errors. Inspect delimiters, quoting and line endings first."));
        else resolve({rows:r.data,fields:r.meta.fields||[],delimiter:r.meta.delimiter||","});
      },error:reject});
    });
  }
  async function parseFileValue(file) {
    const ext=extOf(file);
    if(file.size>MAX_CONVERT_BYTES) throw new Error("Conversion exceeds the 100 MB browser safety limit.");
    if([".json",".geojson"].includes(ext)) return JSON.parse(await file.text());
    if([".yaml",".yml"].includes(ext)) {
      await loadScript(LIB.yaml,()=>!!window.jsyaml);
      return window.jsyaml.load(await file.text(),{json:true});
    }
    if([".csv",".tsv",".tab"].includes(ext)) return parseTableFile(file);
    if([".xml",".gml",".kml",".gpx",".pvl"].includes(ext)) return xmlToObject(new DOMParser().parseFromString(await file.text(),"application/xml").documentElement);
    if([".xlsx",".xlsm",".xlsb",".xls",".ods"].includes(ext)) {
      await loadScript(LIB.sheet,()=>!!window.XLSX);
      const wb=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      const sheet=$("#viewerSheet").value||wb.SheetNames[0];
      return window.XLSX.utils.sheet_to_json(wb.Sheets[sheet],{raw:false,defval:""});
    }
    throw new Error("This format has no safe generic structured-data converter.");
  }
  function xmlToObject(node) {
    if(!node) return null;
    const obj={};
    if(node.attributes) Array.from(node.attributes).forEach((a)=>{obj["@"+a.name]=a.value;});
    const elements=Array.from(node.children||[]);
    if(!elements.length) return Object.keys(obj).length ? Object.assign(obj,{"#text":node.textContent.trim()}) : node.textContent.trim();
    elements.forEach((child)=>{
      const value=xmlToObject(child);
      if(Object.prototype.hasOwnProperty.call(obj,child.nodeName)) {
        if(!Array.isArray(obj[child.nodeName])) obj[child.nodeName]=[obj[child.nodeName]];
        obj[child.nodeName].push(value);
      } else obj[child.nodeName]=value;
    });
    const ownText=Array.from(node.childNodes||[]).filter((n)=>n.nodeType===Node.TEXT_NODE).map((n)=>n.textContent.trim()).join("").trim();
    if(ownText) obj["#text"]=ownText;
    return obj;
  }
  function objectToXml(value, tag) {
    const validTag=String(tag||"item").replace(/[^a-zA-Z0-9_.-]/g,"_").replace(/^[^a-zA-Z_]+/,"item")||"item";
    const xmlEsc=(v)=>safeText(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
    if(value===null || value===undefined) return "<"+validTag+"/>";
    if(Array.isArray(value)) return value.map((v)=>objectToXml(v,validTag.slice(0,-1)||"item")).join("");
    if(typeof value==="object") return "<"+validTag+">"+Object.keys(value).filter((k)=>!k.startsWith("@")&&k!=="#text").map((k)=>objectToXml(value[k],k)).join("")+"</"+validTag+">";
    return "<"+validTag+">"+xmlEsc(value)+"</"+validTag+">";
  }
  function asRecords(value) {
    if(value && !Array.isArray(value) && Array.isArray(value.data)) value=value.data;
    if(!Array.isArray(value)) throw new Error("CSV export needs a JSON array of records. Scalar/object metadata cannot be flattened without choosing fields.");
    if(value.some((x)=>!x || typeof x!=="object" || Array.isArray(x))) throw new Error("CSV export needs an array of objects, such as [{\"time\":\"…\",\"value\":42}].");
    return value;
  }
  async function convertFile(target) {
    const file=activeFile;
    if(!file || !target) return;
    $("#viewerConvert").disabled=true; status("Preparing "+target+" locally…");
    try {
      let blob,name;
      if(target==="zip") {
        if(file.size>MAX_CONVERT_BYTES) throw new Error("ZIP packaging is limited to 100 MB in the browser.");
        await loadScript(LIB.fflate,()=>!!window.fflate);
        const bytes=new Uint8Array(await file.arrayBuffer());
        const cleanName=file.name.replace(/^[/\\]+/,"").replace(/\.\./g,"_")||"data.bin";
        const packed=window.fflate.zipSync({[cleanName]:bytes},{level:1});
        blob=new Blob([packed],{type:"application/zip"});name=file.name+".zip";
      } else if(target==="decompress") {
        if(!activeGzipBytes) throw new Error("Decompression payload is not available. Reload the .gz file first.");
        blob=new Blob([activeGzipBytes]);name=file.name.replace(/\.gz$/i,"")||"decompressed.bin";
      } else if(["png","jpeg","webp","pdf-png","pdf-jpeg"].includes(target)) {
        let canvas=currentPreview.canvas;
        if(!canvas && currentPreview.image) canvas=await imageToCanvas(file);
        if(!canvas && (currentPreview.type==="image" || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name))) canvas=await imageToCanvas(file);
        if(!canvas) throw new Error("A pixel canvas is not available for this input. Re-render the image / PDF / science raster first.");
        const mime=(target==="jpeg"||target==="pdf-jpeg")?"image/jpeg":target==="webp"?"image/webp":"image/png";
        const result=await new Promise((resolve)=>canvas.toBlob(resolve,mime,mime==="image/jpeg"?0.92:0.94));
        if(!result) throw new Error("This browser could not encode the selected image format.");
        blob=result;name=file.name.replace(/\.[^.]+$/,"")+(mime==="image/jpeg"?".jpg":mime==="image/webp"?".webp":".png");
        if(currentPreview.type==="pdf") name=file.name.replace(/\.pdf$/i,"")+"-page-"+currentPreview.page+(mime==="image/jpeg"?".jpg":".png");
        if(canvas.width>=8192||canvas.height>=8192) status("Image was encoded with an 8,192 px browser-memory limit. The original is unchanged.");
      } else if(["csv","tsv","json","yaml","xml","json-pretty","json-min","text"].includes(target)) {
        let output="",mime="text/plain;charset=utf-8",ext=target;
        const sourceExt=extOf(file);
        if(target==="text") { output=await file.text();ext="txt"; }
        else if(target==="json-pretty" || target==="json-min") {
          const val=JSON.parse(await file.text());output=JSON.stringify(val,null,target==="json-pretty"?2:0);mime="application/json;charset=utf-8";ext="json";
        } else if(target==="json" || target==="yaml" || target==="xml") {
          let value;
          if(sourceExt===".csv"||sourceExt===".tsv"||sourceExt===".tab") {
            const parsed=await parseTableFile(file);
            value=parsed.rows;
          } else if(sourceExt===".xlsx"||sourceExt===".xls"||sourceExt===".xlsm"||sourceExt===".xlsb"||sourceExt===".ods") {
            value=await parseFileValue(file);
          } else if(sourceExt===".xml"||sourceExt===".gml"||sourceExt===".kml"||sourceExt===".gpx"||sourceExt===".pvl") {
            const doc=new DOMParser().parseFromString(await file.text(),"application/xml");
            if(doc.querySelector("parsererror")) throw new Error("Input XML is malformed and cannot be converted.");
            value=xmlToObject(doc.documentElement);
          } else value=await parseFileValue(file);
          if(target==="json") {output=JSON.stringify(value,null,2);mime="application/json;charset=utf-8";ext="json";}
          else if(target==="yaml") {await loadScript(LIB.yaml,()=>!!window.jsyaml);output=window.jsyaml.dump(value,{noRefs:true,lineWidth:110});mime="text/yaml;charset=utf-8";ext="yaml";}
          else {output='<?xml version="1.0" encoding="UTF-8"?>\n'+objectToXml(value,"root");mime="application/xml;charset=utf-8";ext="xml";}
        } else {
          const parsed=await parseFileValue(file);
          let rows,fields;
          if(parsed && parsed.rows && parsed.fields) {rows=parsed.rows;fields=parsed.fields;}
          else {rows=asRecords(parsed);fields=Array.from(new Set(rows.flatMap((r)=>Object.keys(r))));}
          await loadScript(LIB.papa,()=>!!window.Papa);
          output=window.Papa.unparse({fields:fields,data:rows.map((row)=>fields.map((f)=>row[f]) )},{delimiter:target==="tsv"?"\t":",",newline:"\r\n"});
          mime=target==="tsv"?"text/tab-separated-values;charset=utf-8":"text/csv;charset=utf-8";ext=target;
        }
        blob=new Blob([output],{type:mime});name=file.name.replace(/\.[^.]+$/,"")+"."+ext;
      } else {
        throw new Error("This conversion is not implemented for this input type. The viewer keeps the original untouched.");
      }
      downloadBlob(blob,name);
      status("Created "+name+" ("+formatBytes(blob.size)+"). Original file was not changed.","success");
    } catch(err) {
      status((err && err.message) || String(err),"error");
    } finally {
      $("#viewerConvert").disabled=false;
    }
  }
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name||"space-output";a.rel="noopener";document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function copyPreview() {
    const value=currentPreview.text || (currentPreview.rows ? JSON.stringify(currentPreview.rows,null,2) : "");
    if(!value){status("This viewer does not expose text to copy.","warn");return;}
    try { await navigator.clipboard.writeText(value); status("Preview text copied to clipboard.","success"); }
    catch (_) { status("Clipboard access is blocked by this browser. Select and copy the visible text instead.","warn"); }
  }
  function resetViewer() {
    clearStage();activeFile=null;$("#viewerFile").value="";$("#viewerFileName").textContent="No file selected";
    $("#viewerFileMeta").textContent="Files stay in this browser tab";$("#viewerDetected").textContent="Ready for a file";
    $("#viewerTarget").replaceChildren(new Option("Choose a conversion…",""));$("#viewerConvert").disabled=true;
    $("#viewerOriginal").disabled=true;$("#viewerCopy").disabled=true;$("#viewerSheet").classList.add("hidden");
    stage().innerHTML='<div class="viewer-empty"><span>✳</span><h3>Ready for your data</h3><p>Choose a file above. SPACE will select an appropriate viewer and list only conversions that make sense for the detected format.</p></div>';
    status("Ready. Select or drop a local file.");
  }
  function wireViewer() {
    $("#viewerFile").addEventListener("change",(e)=>{const file=e.target.files && e.target.files[0];if(file)renderFile(file).catch((err)=>status(err.message,"error"));});
    const drop=$("#viewerDrop");
    drop.addEventListener("dragover",(e)=>{e.preventDefault();drop.classList.add("drag-over");});
    drop.addEventListener("dragleave",()=>drop.classList.remove("drag-over"));
    drop.addEventListener("drop",(e)=>{e.preventDefault();drop.classList.remove("drag-over");const file=e.dataTransfer.files && e.dataTransfer.files[0];if(file)renderFile(file).catch((err)=>status(err.message,"error"));});
    $("#viewerConvert").addEventListener("click",()=>convertFile($("#viewerTarget").value));
    $("#viewerReset").addEventListener("click",resetViewer);
    $("#viewerCopy").addEventListener("click",copyPreview);
    $("#viewerOriginal").addEventListener("click",()=>{if(activeFile)downloadBlob(activeFile,activeFile.name);});
  }
  function downloadFromRegistry(format) {
    $("#viewerExtensionHint").textContent=format ? "Suggested type: "+format+" — choose a matching local file to open it." : "Choose a local file to open.";
    $("#viewer").scrollIntoView({behavior:"smooth",block:"start"});
    $("#viewerFile").click();
  }
  function init() {
    wireViewer();
    resetViewer();
    window.SpaceViewer={open:downloadFromRegistry,loadFile:renderFile};
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();