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
  let activeFile = null, currentPreview = {}, activeUrl = "", activeArchive = null, activeGzipBytes = null, activeViewerCleanup = null, activeFormatRecord = null;
  let formatRegistryPromise = null;

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
      if (LIB_SRI[url]) { s.integrity = LIB_SRI[url]; s.crossOrigin = "anonymous"; }
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
    modelViewer: "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js",
    occtJs: "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js",
    shpJs: "https://unpkg.com/shpjs@4.0.4/dist/shp.js",
    sqlJs: "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js"
  };
  const MODULES = {
    netcdf: "https://cdn.jsdelivr.net/npm/netcdfjs@4.0.0/+esm",
    hdf5: "https://cdn.jsdelivr.net/npm/h5wasm@0.10.3/dist/esm/hdf5_hl.js",
    parquet: "https://cdn.jsdelivr.net/npm/hyparquet@1.31.3/src/index.min.js",
    arrow: "https://cdn.jsdelivr.net/npm/apache-arrow@21.2.0/+esm",
    three: "https://esm.sh/three@0.180.0",
    stlLoader: "https://esm.sh/three@0.180.0/examples/jsm/loaders/STLLoader.js",
    objLoader: "https://esm.sh/three@0.180.0/examples/jsm/loaders/OBJLoader.js",
    plyLoader: "https://esm.sh/three@0.180.0/examples/jsm/loaders/PLYLoader.js",
    orbitControls: "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js",
    stlExporter: "https://esm.sh/three@0.180.0/examples/jsm/exporters/STLExporter.js",
    objExporter: "https://esm.sh/three@0.180.0/examples/jsm/exporters/OBJExporter.js",
    occtJs: "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js",
    occtWasm: "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm",
    shpJs: "https://unpkg.com/shpjs@4.0.4/dist/shp.js",
    sqlJs: "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js",
    sqlWasm: "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.wasm"
  };
  const modulePromises = {};
  async function importModule(url) {
    if (!modulePromises[url]) modulePromises[url] = import(url);
    return modulePromises[url];
  }
  const LIB_SRI = {
    [LIB.papa]:"sha384-Jd2/X5FXVKahwaY2nivvw4LfSTg9idSj8yNXWtT4qef0fHSYr6M7M8bJAfbFYoMc",
    [LIB.sheet]:"sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT",
    [LIB.pdf]:"sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e",
    [LIB.yaml]:"sha384-+pxiN6T7yvpryuJmE1gM9PX7yQit15auDb+ZwwvJOd/4be2Cie5/IuVXgQb/S9du",
    [LIB.fflate]:"sha384-DT0Ls0mO7JmjTnT+oBuMhEJzYJO1zUqzuuMXNdnOmOQRIpN2BgSjvBV/j50NngIT",
    [LIB.geotiff]:"sha384-m5adk5PRgt3JjiYbYoG8oXxc3EgRFKc1aCBgKzyxqxnbYpdiAMlHkR0gVDp03Q/H",
    [LIB.modelViewer]:"sha384-sr9b4Ux0WhAUGclJ0ym0FSY2zSOMmNSn0bP/SA0e6bNCrpn/5W3QL8mm+LdlQMKw",
    [LIB.occtJs]:"sha384-Z8pO9JEhFZF+mvDKxMuLvPT85VP7nly8CqYjBatl0bMeW9OsaKCes4gEUPL4nihc",
    [LIB.shpJs]:"sha384-SvGz+Dog2fS8fxYIE3uf8dViVamrK+czJkTku+kw1+N5jqZULpRyEpT1JqF0PaWh",
    [LIB.sqlJs]:"sha384-DJiKBv+LC78e5InEB+MvFIAH079ynMK/ERTtFUCpDzXhH1Bht7aVfpg3yOVsuYl9"
  };
  function clearStage() {
    if (typeof activeViewerCleanup === "function") { try { activeViewerCleanup(); } catch (_) {} activeViewerCleanup = null; }
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
    const common = [{value:"report-json",label:"Export file report → JSON"}, {value:"zip",label:"Create ZIP archive"}];
    if (kind === "image") return [{value:"png",label:"Image → PNG"}, {value:"jpeg",label:"Image → JPEG"}, {value:"webp",label:"Image → WebP"}].concat(common);
    if (kind === "tiff" || kind === "fits") return [{value:"png",label:"Rendered preview → PNG"}, {value:"jpeg",label:"Rendered preview → JPEG"}].concat(common);
    if (kind === "pdf") return [{value:"pdf-png",label:"Current PDF page → PNG"}, {value:"pdf-jpeg",label:"Current PDF page → JPEG"}, {value:"pdf-text",label:"Extract PDF text → TXT"}].concat(common);
    if (kind === "table" || ext===".csv" || ext===".tsv" || ext===".tab") return [{value:"csv",label:"Export as CSV"}, {value:"tsv",label:"Export as TSV"}, {value:"json",label:"Table → JSON"}, {value:"xlsx",label:"Table → XLSX workbook"}].concat(common);
    if (kind === "json") return [{value:"json-pretty",label:"Pretty-print JSON"}, {value:"json-min",label:"Minify JSON"}, {value:"csv",label:"JSON records → CSV"}, {value:"tsv",label:"JSON records → TSV"}, {value:"xlsx",label:"JSON records → XLSX"}, {value:"yaml",label:"JSON → YAML"}, {value:"xml",label:"JSON → XML"}].concat(common);
    if (kind === "yaml") return [{value:"json",label:"YAML → JSON"}, {value:"yaml",label:"Normalize YAML"}].concat(common);
    if (kind === "xml") return [{value:"json",label:"XML → JSON (simple documents)"}, {value:"xml",label:"Normalize XML"}].concat(common);
    if (kind === "workbook") return [{value:"csv",label:"Selected sheet → CSV"}, {value:"tsv",label:"Selected sheet → TSV"}, {value:"json",label:"Selected sheet → JSON"}].concat(common);
    if (kind === "parquet" || kind === "arrow") return [{value:"csv",label:"Preview rows → CSV"}, {value:"tsv",label:"Preview rows → TSV"}, {value:"json",label:"Preview rows → JSON"}, {value:"xlsx",label:"Preview rows → XLSX"}].concat(common);
    if (kind === "sqlite") return [{value:"sql-csv",label:"Query results → CSV"}, {value:"sql-tsv",label:"Query results → TSV"}, {value:"sql-json",label:"Query results → JSON"}, {value:"sql-xlsx",label:"Query results → XLSX"}].concat(common);
    if (kind === "geojson") return [{value:"shape-geojson",label:"Export features → GeoJSON"}, {value:"json-pretty",label:"Pretty-print GeoJSON"}, {value:"json-min",label:"Minify GeoJSON"}, {value:"geojson-csv",label:"Feature properties + geometry → CSV"}].concat(common);
    if (kind === "mesh3d") return [{value:"mesh-stl",label:"3D model → STL mesh"}, {value:"mesh-obj",label:"3D model → OBJ mesh"}].concat(common);
    if (kind === "zip") return common;
    if (kind === "gzip") return [{value:"decompress",label:"Decompress GZIP"}].concat(common);
    return common;
  }
  async function findFormatRecord(file) {
    if(!formatRegistryPromise) formatRegistryPromise=fetch("./data/formats.json",{cache:"no-cache"}).then((r)=>r.ok?r.json():[]).catch(()=>[]);
    const registry=await formatRegistryPromise;
    const name=(file && file.name || "").toLowerCase();
    const extension=extOf(file).toLowerCase();
    const matches=registry.filter((record)=>(record.extensions||[]).some((value)=>{
      const token=String(value||"").toLowerCase().trim();
      return token.startsWith(".") && (extension===token || name.endsWith(token));
    }));
    if(!matches.length)return null;
    const preferred={
      ".json":(n)=>n.includes("xml / json / yaml"),
      ".geojson":(n)=>n.includes("geojson"),
      ".csv":(n)=>n.includes("csv / tsv / plain text"),
      ".tsv":(n)=>n.includes("csv / tsv / plain text"),
      ".txt":(n)=>n.includes("csv / tsv / plain text"),
      ".nc":(n)=>n.includes("netcdf / netcdf-4"),
      ".nc4":(n)=>n.includes("netcdf / netcdf-4"),
      ".hdf":(n)=>n.startsWith("hdf4 / hdf5"),
      ".h5":(n)=>n.startsWith("hdf4 / hdf5"),
      ".hdf5":(n)=>n.startsWith("hdf4 / hdf5"),
      ".xml":(n)=>n.includes("xml / json / yaml"),
      ".fits":(n)=>n.includes("fits"),
      ".fit":(n)=>n.includes("fits"),
      ".fts":(n)=>n.includes("fits"),
      ".pdf":(n)=>n.includes("documentation, reports")
    };
    const prefer=preferred[extension];
    return (prefer && matches.find((record)=>prefer(safeText(record.name).toLowerCase()))) || matches.find((record)=>(record.extensions||[]).some((e)=>String(e).toLowerCase()===extension)) || matches[0];
  }
  function renderRegistryContext(record) {
    if(!record)return;
    const details=document.createElement("details");details.className="viewer-format-context";
    const summary=document.createElement("summary");summary.textContent="Format registry match · "+safeText(record.name);details.append(summary);
    const p=document.createElement("p");p.textContent=safeText(record.uses||"Registered file format.")+" Domain: "+safeText(record.group||"Unclassified")+". Validation guidance: "+safeText(record.validation||"Use the format-specific validator.");details.append(p);
    const links=document.createElement("div");links.className="viewer-context-links";
    [[record.tool,"Official tool / validator"],[record.docs,"Specification / documentation"]].forEach(([url,label])=>{
      try {
        const u=new URL(url);if(!["https:","http:"].includes(u.protocol))return;
        const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";a.textContent=label+" ↗";links.append(a);
      } catch (_) {}
    });
    if(links.childNodes.length)details.append(links);
    const caveat=document.createElement("small");caveat.textContent="A registry match describes the file suffix; it does not prove file integrity or format compliance.";details.append(caveat);
    stage().append(details);
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
  async function isHDF5File(file) {
    const bytes=await readHead(file,4096);
    const sig=[0x89,0x48,0x44,0x46,0x0d,0x0a,0x1a,0x0a];
    for(let offset=0;offset+8<=bytes.length;offset=(offset===0?512:offset*2)){
      let ok=true;for(let i=0;i<8;i++)if(bytes[offset+i]!==sig[i]){ok=false;break;}
      if(ok)return true;
    }
    return false;
  }
  async function renderNetCDF(file) {
    if (file.size > MAX_CONVERT_BYTES) throw new Error("NetCDF preview is limited to 100 MB in the browser.");
    const module = await importModule(MODULES.netcdf);
    if (typeof module.NetCDFReader !== "function") throw new Error("NetCDF JavaScript reader API was not available.");
    const reader = new module.NetCDFReader(new Uint8Array(await file.arrayBuffer()));
    const dimensions = (reader.dimensions || []).map((d) => [d.name, d.size]);
    const variables = (reader.variables || []).map((v) => [v.name, (v.dimensions || []).map((d) => typeof d === "string" ? d : d.name || d).join(" × "), v.type || "", v.size == null ? "" : String(v.size), JSON.stringify(v.attributes || [])]);
    addHeading("NetCDF classic / 64-bit offset viewer", "Reads NetCDF classic formats through netcdfjs. NetCDF-4/HDF5 containers use the HDF5 viewer instead; this is a metadata/sample preview, not a replacement for calibrated scientific analysis.");
    metaStrip([["VERSION",reader.version || "NetCDF"],["DIMENSIONS",String(dimensions.length)],["VARIABLES",String(variables.length)]]);
    addTable(variables,["Variable","Dimensions","Type","Elements","Attributes"],"Variable metadata. The selected data shown below is sampled only when the variable is small.");
    if (dimensions.length) addTable(dimensions,["Dimension","Length"],"Named dimensions.");
    const first = (reader.variables || []).find((v) => Number(v.size) > 0 && Number(v.size) <= 2000);
    if (first) {
      try {
        const values = reader.getDataVariable(first.name || first);
        const array = Array.from(values || []).slice(0,2000).map((v) => [v]);
        addTable(array,["Value"],"Sample values for " + first.name + "; values are shown in the source's numeric representation.");
      } catch (err) { addNotice("Variable values could not be decoded: " + err.message,"warn"); }
    } else if (variables.length) addNotice("No variable with at most 2,000 elements was auto-read. Metadata is available; use a specialist scientific workflow for large arrays.","warn");
    const attrs = (reader.globalAttributes || []).map((a) => [a.name, a.type || "", typeof a.value === "object" ? JSON.stringify(a.value) : safeText(a.value)]);
    if (attrs.length) addTable(attrs,["Global attribute","Type","Value"],"Global attributes.");
    currentPreview = {type:"netcdf", text: JSON.stringify({dimensions:dimensions,variables:variables},null,2)};
    $("#viewerCopy").disabled = false;
  }
  async function renderHDF5(file) {
    if (file.size > MAX_CONVERT_BYTES) throw new Error("HDF5/Nexus preview is limited to 100 MB in the browser. Use a native HDF5 tool for larger files.");
    const module = await importModule(MODULES.hdf5);
    const h5 = module.default || module.h5wasm || module;
    if (!h5 || !h5.ready) throw new Error("HDF5 WebAssembly reader did not initialize.");
    const loaded = await h5.ready;
    const FS = (loaded && loaded.FS) || h5.FS;
    if (!FS || typeof h5.File !== "function") throw new Error("HDF5 reader API is unavailable in this browser.");
    const safeName = "/space-" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9_.-]/g,"_").slice(-90);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let handle = null, datasets = [];
    try {
      FS.writeFile(safeName, bytes);
      handle = new h5.File(safeName,"r");
      const visit = (node,path,depth) => {
        if (!node || datasets.length >= 500 || depth > 6) return;
        let keys = [];
        try { keys = typeof node.keys === "function" ? node.keys() : []; } catch (_) {}
        if (keys && keys.length) {
          keys.slice(0,100).forEach((key) => {
            const childPath = (path === "/" ? "" : path) + "/" + key;
            let child = null;
            try { child = handle.get(childPath); } catch (_) { try { child = node.get(key); } catch (__) {} }
            if (!child) return;
            let subkeys = [];
            try { subkeys = typeof child.keys === "function" ? child.keys() : []; } catch (_) {}
            if (subkeys && subkeys.length) {
              datasets.push([childPath,"Group","",String(subkeys.length),""]);
              visit(child,childPath,depth+1);
            } else {
              const shape = Array.from(child.shape || child.metadata && child.metadata.shape || []);
              const dtype = child.dtype || child.metadata && child.metadata.dtype || "";
              const count = shape.length ? shape.reduce((a,b) => a * Number(b || 0),1) : Number(child.metadata && child.metadata.total_size || 0);
              datasets.push([childPath,"Dataset",shape.join(" × "),String(count),String(dtype)]);
              if (shape.length && count > 0 && count <= 2000) {
                try {
                  const values = typeof child.to_array === "function" ? child.to_array() : child.value;
                  const flat = [];
                  const flatten = (v) => { if(Array.isArray(v) || ArrayBuffer.isView(v)){for(const x of v)flatten(x);} else if(flat.length<2000) flat.push(v); };
                  flatten(values);
                  if (flat.length) child.__spaceSample = flat.slice(0,2000);
                } catch (_) {}
              }
            }
          });
        }
      };
      visit(handle,"/",0);
      addHeading("HDF5 / NetCDF-4 / NeXus viewer","Lists groups, dataset shapes and datatypes using h5wasm (WebAssembly HDF5). Small datasets may show a sample; compression filters and some exotic datatypes require additional plugins.");
      metaStrip([["CONTAINER","HDF5"],["OBJECTS",String(datasets.length)],["FILE SIZE",formatBytes(file.size)]]);
      addTable(datasets,["Path","Kind","Shape","Elements / children","Datatype"],"Object tree limited to 500 entries and depth 6.");
      const sample = [];
      const find = (node,path,depth) => {
        if(!node || sample.length || depth>6) return;
        let keys=[];try{keys=typeof node.keys==="function"?node.keys():[];}catch(_){}
        for(const key of keys||[]) {
          let child=null;const childPath=(path==="/"?"":path)+"/"+key;
          try{child=handle.get(childPath);}catch(_){}
          if(!child)continue;
          let subkeys=[];try{subkeys=typeof child.keys==="function"?child.keys():[];}catch(_){}
          if(subkeys&&subkeys.length){find(child,childPath,depth+1);continue;}
          const shape=Array.from(child.shape||child.metadata&&child.metadata.shape||[]);
          const count=shape.length?shape.reduce((a,b)=>a*Number(b||0),1):Infinity;
          if(count>0&&count<=2000) {
            try {
              const values=typeof child.to_array==="function"?child.to_array():child.value;
              const flat=[];const flatten=(v)=>{if(Array.isArray(v)||ArrayBuffer.isView(v)){for(const x of v)flatten(x);}else if(flat.length<2000)flat.push(v);};flatten(values);
              if(flat.length) sample.push({path:childPath,values:flat.slice(0,2000)});
            } catch (_) {}
          }
          if(sample.length)break;
        }
      };
      find(handle,"/",0);
      if(sample.length) addTable(sample[0].values.map((v,i)=>[i,v]),["Index","Value"],"Sample from " + sample[0].path + "; source file remains unchanged.");
      else addNotice("Metadata listing loaded, but no small dataset could be auto-sampled. Use the HDF5-aware official application for full inspection.","warn");
      currentPreview={type:"hdf5",text:JSON.stringify(datasets,null,2)};
      $("#viewerCopy").disabled=false;
    } finally {
      try { if(handle && typeof handle.close==="function") handle.close(); } catch (_) {}
      try { FS.unlink(safeName); } catch (_) {}
    }
  }
  async function parseParquetFile(file) {
    if (file.size > MAX_CONVERT_BYTES) throw new Error("Parquet preview is limited to 100 MB in the browser. Use a row-group/columnar query engine for larger files.");
    const module=await importModule(MODULES.parquet);
    if(typeof module.parquetMetadataAsync!=="function" || typeof module.parquetReadObjects!=="function") throw new Error("Parquet parser exports are unavailable.");
    const buffer=await file.arrayBuffer();
    const asyncBuffer={byteLength:buffer.byteLength,slice:(start,end)=>buffer.slice(start,end)};
    const metadata=await module.parquetMetadataAsync(asyncBuffer);
    const schema=module.parquetSchema(metadata);
    const columns=(schema.children||[]).map((child)=>child.element && child.element.name).filter(Boolean).slice(0,40);
    const totalRows=Number(metadata.num_rows || 0);
    const rows=await module.parquetReadObjects({file:asyncBuffer,columns:columns.length?columns:undefined,rowStart:0,rowEnd:Math.min(MAX_TABLE_ROWS,totalRows || MAX_TABLE_ROWS)});
    return {rows:rows,fields:columns.length?columns:Array.from(new Set(rows.flatMap((row)=>Object.keys(row)))),metadata:metadata,schema:schema};
  }
  async function parseArrowFile(file) {
    if(file.size>MAX_CONVERT_BYTES)throw new Error("Arrow / Feather preview is limited to 100 MB in the browser.");
    const module=await importModule(MODULES.arrow);
    if(typeof module.tableFromIPC!=="function")throw new Error("Apache Arrow IPC reader did not expose tableFromIPC.");
    const table=module.tableFromIPC(new Uint8Array(await file.arrayBuffer()));
    const fields=(table.schema.fields||[]).map((field)=>field.name).slice(0,40);
    const n=Math.min(MAX_TABLE_ROWS,Number(table.numRows||0));
    const rows=[];
    for(let i=0;i<n;i++){
      const row={};
      fields.forEach((field)=>{let value;try{value=table.getChild(field)?.get(i);}catch(_){value="";}row[field]=value===undefined?null:value;});
      rows.push(row);
    }
    return {rows:rows,fields:fields,totalRows:Number(table.numRows||0),schema:table.schema};
  }
  async function renderArrow(file) {
    addHeading("Apache Arrow / Feather viewer","Reads Arrow IPC files and Feather v2/IPC data through apache-arrow. The preview is bounded to 250 rows and 40 columns; this is not a full analytical query engine.");
    const parsed=await parseArrowFile(file);
    metaStrip([["TOTAL ROWS",Number(parsed.totalRows).toLocaleString()],["COLUMNS",String(parsed.fields.length)],["SAMPLE ROWS",String(parsed.rows.length)]]);
    addTable(parsed.rows.map((row)=>parsed.fields.map((field)=>row[field])),parsed.fields,"Bounded row sample. Nested Arrow values are displayed as values, not flattened.");
    addPre(JSON.stringify(parsed.schema,null,2),"ARROW SCHEMA");
    currentPreview={type:"arrow",rows:parsed.rows,headers:parsed.fields,text:JSON.stringify(parsed.schema,null,2)};
    $("#viewerCopy").disabled=false;
  }
  async function renderParquet(file) {
    addHeading("Apache Parquet / GeoParquet viewer","Reads a bounded row sample in-browser using hyparquet. This supports inspection and small exports, not full-size analytical queries; some uncommon codecs may require an extra codec package.");
    status("Reading Parquet footer and selected rows…");
    const parsed=await parseParquetFile(file);
    const meta=parsed.metadata;
    const total=Number(meta.num_rows||0);
    metaStrip([["ROWS",Number.isFinite(total)?total.toLocaleString():"unknown"],["COLUMNS",String(parsed.fields.length)],["SAMPLE ROWS",String(parsed.rows.length)]]);
    addTable(parsed.rows.map((r)=>parsed.fields.map((f)=>r[f])),parsed.fields,"Row sample only. Full record count may be much larger; no rows beyond the preview limit are loaded.");
    addPre(JSON.stringify(parsed.schema,null,2),"PARQUET SCHEMA");
    currentPreview={type:"parquet",rows:parsed.rows,headers:parsed.fields,text:JSON.stringify(parsed.schema,null,2)};
    $("#viewerCopy").disabled=false;
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
    if(!Number.isSafeInteger(pixelCount) || pixelCount>4000000 || dataOffset+pixelCount*bytesPerPixel>file.size) {
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
    metaStrip([["PIXEL SCALE",String(min)+" → "+String(max)],["PREVIEW",outW+" × "+outH],["RENDER","Grayscale stretch"]]);
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
      currentPreview={type:"gzip",bytes:output};setTargets([{value:"decompress",label:"Download decompressed payload"},{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Wrap original in ZIP"}]);
      const btn=document.createElement("button");btn.className="btn small";btn.textContent="Download decompressed file";btn.onclick=()=>downloadBlob(new Blob([output]),file.name.replace(/\.gz$/i,"")||"decompressed.bin");stage().append(btn);
      return;
    }
    entries=window.fflate.unzipSync(bytes);activeArchive=entries;
    const names=Object.keys(entries);
    if(names.some((name)=>/\.shp$/i.test(name))) {
      await loadScript(LIB.shpJs,()=>typeof window.shp==="function");
      addHeading("Shapefile / ZIP geospatial viewer","Reading a local ZIP that contains one or more .shp layers with shpjs. CRS files are preserved in the input package; coordinates are displayed as delivered and are not reprojected.");
      const decoded=await window.shp(bytes.buffer);
      const layers=(Array.isArray(decoded)?decoded:[decoded]).filter(Boolean);
      const features=[];
      layers.forEach((layer)=>{
        if(layer.type==="FeatureCollection")features.push(...(layer.features||[]).map((feature)=>Object.assign({},feature,{properties:Object.assign({__layer:layer.fileName||"layer"},feature.properties||{})})));
        else if(layer.type==="Feature")features.push(Object.assign({},layer,{properties:layer.properties||{}}));
      });
      if(!features.length)throw new Error("SHP entries were present but no features could be decoded from this ZIP.");
      const geo={type:"FeatureCollection",features:features};
      const geoFile=new File([JSON.stringify(geo)],file.name.replace(/\.zip$/i,"")+".geojson",{type:"application/geo+json"});
      activeFormatRecord=await findFormatRecord(geoFile);
      await renderGeoJSON(geoFile);
      addNotice("Shapefile archive parsed locally: "+layers.length+" layer(s), "+features.length+" feature(s). Attribute schemas, CRS/projection and topology should still be checked in a GIS.","success");
      currentPreview={type:"geojson",value:geo,text:JSON.stringify(geo,null,2)};
      setTargets([{value:"shape-geojson",label:"Export features → GeoJSON"},{value:"geojson-csv",label:"Feature properties + geometry → CSV"},{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
      return;
    }
    addHeading("ZIP archive browser","Archive entries are listed locally. Extraction uses the original entry bytes; no server upload is performed.");
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
    setTargets([{value:"report-json",label:"Export archive inventory → JSON"},{value:"zip",label:"Create ZIP of original archive (nested)"}]);
  }
  async function renderGeoJSON(file) {
    const text=await file.slice(0,MAX_TEXT_BYTES).text();
    if(file.size>MAX_TEXT_BYTES) throw new Error("GeoJSON preview is limited to 32 MB in this browser.");
    const data=JSON.parse(text);
    const features=data.type==="FeatureCollection" ? (data.features||[]) : data.type==="Feature" ? [data] : [];
    const pairs=[];
    const collect=(c)=>{if(Array.isArray(c)&&c.length>=2&&typeof c[0]==="number"&&typeof c[1]==="number"){if(pairs.length<25000)pairs.push([c[0],c[1]]);return;}if(Array.isArray(c))c.forEach(collect);};
    features.forEach((feature)=>collect(feature.geometry&&feature.geometry.coordinates));
    addHeading("GeoJSON feature viewer","Local longitude/latitude extent sketch for inspection. Not a map projection, geodesic rendering or GIS topology validator.");
    const geometryCounts={};
    features.forEach((f)=>{const type=f.geometry&&f.geometry.type||"No geometry";geometryCounts[type]=(geometryCounts[type]||0)+1;});
    metaStrip([["FEATURES",String(features.length)],["COORDINATES",String(pairs.length)],["GEOMETRIES",Object.keys(geometryCounts).length ? Object.keys(geometryCounts).join(", ") : "none"]]);
    if(pairs.length){
      const minX=pairs.reduce((m,p)=>Math.min(m,p[0]),Infinity),maxX=pairs.reduce((m,p)=>Math.max(m,p[0]),-Infinity),minY=pairs.reduce((m,p)=>Math.min(m,p[1]),Infinity),maxY=pairs.reduce((m,p)=>Math.max(m,p[1]),-Infinity),dx=maxX-minX||1,dy=maxY-minY||1;
      const svgNS="http://www.w3.org/2000/svg";
      const svg=document.createElementNS(svgNS,"svg");svg.setAttribute("viewBox","0 0 800 420");svg.setAttribute("role","img");svg.setAttribute("aria-label","GeoJSON coordinate extent preview");svg.classList.add("viewer-geojson-map");
      const bg=document.createElementNS(svgNS,"rect");bg.setAttribute("x","0");bg.setAttribute("y","0");bg.setAttribute("width","800");bg.setAttribute("height","420");bg.setAttribute("rx","12");bg.setAttribute("fill","#f0f7f8");svg.append(bg);
      for(let x=60;x<800;x+=70){const line=document.createElementNS(svgNS,"path");line.setAttribute("d","M"+x+" 0 V420");line.setAttribute("stroke","#dce7ea");line.setAttribute("stroke-width","1");svg.append(line);}
      for(let y=50;y<420;y+=60){const line=document.createElementNS(svgNS,"path");line.setAttribute("d","M0 "+y+" H800");line.setAttribute("stroke","#dce7ea");line.setAttribute("stroke-width","1");svg.append(line);}
      const xy=(point)=>[24+(point[0]-minX)/dx*752,396-(point[1]-minY)/dy*372];
      const pointsFrom=(coords)=>{const out=[];const walk=(c)=>{if(out.length>=25000)return;if(Array.isArray(c)&&c.length>=2&&typeof c[0]==="number"&&typeof c[1]==="number"){out.push(c);return;}if(Array.isArray(c))c.forEach(walk);};walk(coords);return out;};
      const pathD=(coords,close)=>{const p=pointsFrom(coords);if(!p.length)return "";return p.map((point,i)=>{const q=xy(point);return (i?"L":"M")+q[0].toFixed(2)+" "+q[1].toFixed(2);}).join(" ")+(close?" Z":"");};
      const addPath=(d,fill,stroke)=>{if(!d)return;const el=document.createElementNS(svgNS,"path");el.setAttribute("d",d);el.setAttribute("fill",fill||"none");el.setAttribute("stroke",stroke||"#087f9d");el.setAttribute("stroke-width","1.7");el.setAttribute("stroke-linejoin","round");el.setAttribute("stroke-linecap","round");el.setAttribute("fill-rule","evenodd");svg.append(el);};
      const renderGeom=(geom)=>{
        if(!geom)return;
        const c=geom.coordinates;
        if(geom.type==="Point"){const q=xy(c);const el=document.createElementNS(svgNS,"circle");el.setAttribute("cx",q[0]);el.setAttribute("cy",q[1]);el.setAttribute("r","4");el.setAttribute("fill","#087f9d");el.setAttribute("stroke","#ffffff");el.setAttribute("stroke-width","1.5");svg.append(el);}
        else if(geom.type==="MultiPoint") pointsFrom(c).forEach((pt)=>{const q=xy(pt),el=document.createElementNS(svgNS,"circle");el.setAttribute("cx",q[0]);el.setAttribute("cy",q[1]);el.setAttribute("r","3.3");el.setAttribute("fill","#087f9d");svg.append(el);});
        else if(geom.type==="LineString")addPath(pathD(c,false),"none","#187fa4");
        else if(geom.type==="MultiLineString")c.forEach((line)=>addPath(pathD(line,false),"none","#187fa4"));
        else if(geom.type==="Polygon")c.forEach((ring,i)=>addPath(pathD(ring,true),i===0?"rgba(25,143,155,.19)":"none","#187f82"));
        else if(geom.type==="MultiPolygon")c.forEach((poly)=>{poly.forEach((ring,i)=>addPath(pathD(ring,true),i===0?"rgba(25,143,155,.19)":"none","#187f82"));});
        else if(geom.type==="GeometryCollection")(geom.geometries||[]).forEach(renderGeom);
      };
      features.slice(0,250).forEach((feature)=>renderGeom(feature.geometry));
      const frame=document.createElement("div");frame.className="viewer-image-frame";frame.append(svg);stage().append(frame);
      metaStrip([["LONGITUDE",minX.toFixed(5)+" … "+maxX.toFixed(5)],["LATITUDE",minY.toFixed(5)+" … "+maxY.toFixed(5)],["DRAWN FEATURES",String(Math.min(features.length,250))]]);
    } else addNotice("No coordinate pairs were found. Displaying the document structure below.","warn");
    if(pairs.length>=25000)addNotice("Spatial display is sampled to the first 25,000 coordinate pairs and first 250 features for responsiveness. The original GeoJSON is unchanged.","warn");
    const propertyRows=features.slice(0,100).map((f,i)=>[i+1,f.geometry&&f.geometry.type||"",JSON.stringify(f.properties||{})]);
    if(propertyRows.length)addTable(propertyRows,["#","Geometry","Properties"],"First 100 features.");
    addPre(JSON.stringify(data,null,2).slice(0,200000),"GEOJSON STRUCTURE");
    currentPreview={type:"geojson",value:data,text:JSON.stringify(data,null,2)};
    $("#viewerCopy").disabled=false;
  }
  async function renderMesh3D(file, extension) {
    if(file.size>MAX_CONVERT_BYTES)throw new Error("3D mesh preview is limited to 100 MB in the browser.");
    const isCad=[".step",".stp",".iges",".igs",".brep",".brp"].includes(extension);
    const [THREE,ControlsModule,LoaderModule]=await Promise.all([
      importModule(MODULES.three),
      importModule(MODULES.orbitControls),
      isCad ? Promise.resolve(null) : importModule(extension===".stl"?MODULES.stlLoader:extension===".ply"?MODULES.plyLoader:MODULES.objLoader)
    ]);
    const controlsClass=ControlsModule.OrbitControls;
    const loader=extension===".stl"?new LoaderModule.STLLoader():extension===".ply"?new LoaderModule.PLYLoader():new LoaderModule.OBJLoader();
    addHeading("Interactive 3D model viewer",isCad?"OpenCascade WebAssembly triangulation for STEP/IGES/BREP (millimetre output). The tessellated preview is not an authoritative CAD model; features, constraints, PMI and exact surfaces are not preserved in mesh exports.":"Drag to orbit, scroll or pinch to zoom. This is a geometry preview; engineering dimensions and topology should be checked in a dedicated CAD/mesh tool.");
    const wrap=document.createElement("div");wrap.className="viewer-3d-wrap";
    const canvas=document.createElement("canvas");canvas.className="viewer-3d-canvas";wrap.append(canvas);stage().append(wrap);
    const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0xf0f7f8,1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xf0f7f8);
    const camera=new THREE.PerspectiveCamera(45,1,0.01,100000);
    scene.add(new THREE.HemisphereLight(0xffffff,0x9bb5c1,2));
    const keyLight=new THREE.DirectionalLight(0xffffff,2.2);keyLight.position.set(4,6,8);scene.add(keyLight);
    const fillLight=new THREE.DirectionalLight(0x82bfd0,1.2);fillLight.position.set(-5,-2,-4);scene.add(fillLight);
    let object;
    if(isCad) {
      await loadScript(LIB.occtJs,()=>typeof window.occtimportjs==="function");
      const occt=await window.occtimportjs({locateFile:(path)=>path.endsWith(".wasm")?LIB.occtWasm:path});
      const bytes=new Uint8Array(await file.arrayBuffer());
      const options={linearUnit:"millimeter",linearDeflectionType:"bounding_box_ratio",linearDeflection:0.001,angularDeflection:0.5};
      let imported;
      if(extension===".step"||extension===".stp")imported=occt.ReadStepFile(bytes,options);
      else if(extension===".iges"||extension===".igs")imported=occt.ReadIgesFile(bytes,options);
      else imported=occt.ReadBrepFile(bytes,options);
      if(!imported || !imported.success || !Array.isArray(imported.meshes) || !imported.meshes.length)throw new Error("OpenCascade could not triangulate this CAD file. Check source validity, units and supported entities.");
      object=new THREE.Group();
      imported.meshes.forEach((source)=>{
        const attr=source.attributes||{},position=attr.position&&attr.position.array,normal=attr.normal&&attr.normal.array,index=source.index&&source.index.array;
        if(!position || !position.length)return;
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(position,3));
        if(normal&&normal.length)geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normal,3));else geometry.computeVertexNormals();
        if(index&&index.length)geometry.setIndex(index);
        const c=source.color;
        const color=Array.isArray(c)&&c.length>=3?new THREE.Color(Number(c[0]),Number(c[1]),Number(c[2])):new THREE.Color(0x238ca5);
        object.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:color,metalness:.1,roughness:.5,side:THREE.DoubleSide})));
      });
      if(!object.children.length)throw new Error("CAD import returned no renderable mesh surfaces.");
    } else if(extension===".obj") object=loader.parse(await file.text());
    else {
      const geometry=loader.parse(await file.arrayBuffer());
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      const hasColor=!!geometry.attributes.color;
      const material=new THREE.MeshStandardMaterial({color:hasColor?0xffffff:0x238ca5,vertexColors:hasColor,metalness:.13,roughness:.48,side:THREE.DoubleSide});
      object=new THREE.Mesh(geometry,material);
    }
    object.traverse((child)=>{
      if(child.isMesh){
        if(child.geometry && !child.geometry.attributes.normal)child.geometry.computeVertexNormals();
        if(extension===".obj")child.material=new THREE.MeshStandardMaterial({color:0x238ca5,metalness:.12,roughness:.5,side:THREE.DoubleSide});
      }
    });
    const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    object.position.sub(center);scene.add(object);
    const maxEdge=Math.max(size.x,size.y,size.z)||1;
    camera.near=Math.max(maxEdge/10000,.0001);camera.far=Math.max(maxEdge*100,100);camera.position.set(maxEdge*1.6,maxEdge*1.25,maxEdge*2.2);camera.updateProjectionMatrix();
    const controls=new controlsClass(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,0,0);
    const render=()=>{const w=Math.max(1,wrap.clientWidth-2),h=Math.max(240,Math.min(560,window.innerWidth<600?330:470));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);};
    controls.addEventListener("change",()=>renderer.render(scene,camera));
    const resizeObserver=typeof ResizeObserver!=="undefined"?new ResizeObserver(render):null;if(resizeObserver)resizeObserver.observe(wrap);
    render();
    metaStrip([["MODEL TYPE",extension.toUpperCase()],["BOUNDING SIZE",[size.x,size.y,size.z].map((n)=>Number(n.toPrecision(5))).join(" × ")],["VIEWER",isCad?"OpenCascade WASM":"WebGL · orbit controls"]]);
    currentPreview={type:"mesh3d",object:object,THREE:THREE};
    $("#viewerCopy").disabled=false;
    activeViewerCleanup=()=>{if(resizeObserver)resizeObserver.disconnect();controls.dispose();renderer.dispose();renderer.forceContextLoss();scene.traverse((o)=>{if(o.geometry)o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach((m)=>m.dispose());else if(o.material)o.material.dispose();});};
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
  async function renderSQLite(file) {
    if(file.size>MAX_CONVERT_BYTES)throw new Error("SQLite preview is limited to 100 MB in the browser.");
    await loadScript(LIB.sqlJs,()=>typeof window.initSqlJs==="function");
    const SQL=await window.initSqlJs({mainScriptUrlOrBlob:LIB.sqlJs,locateFile:(name)=>!name||name.endsWith(".wasm")?LIB.sqlWasm:name});
    const db=new SQL.Database(new Uint8Array(await file.arrayBuffer()));
    const tables=db.exec("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name")[0];
    const items=tables?tables.values.map((r)=>({name:String(r[0]),type:String(r[1]),sql:String(r[2]||"")})):[];
    addHeading("SQLite database & query viewer","The database is opened read-only in memory from the original bytes. Queries are restricted to a single read-only SELECT / WITH statement; the original database file is never modified.");
    metaStrip([["OBJECTS",String(items.length)],["DATABASE SIZE",formatBytes(file.size)],["QUERY MODE","SELECT only"]]);
    if(items.length)addTable(items.map((item)=>[item.name,item.type,item.sql]),["Object","Type","Definition"],"Tables and views detected in this database.");
    const area=document.createElement("textarea");area.className="viewer-sql-input";area.id="viewerSqlQuery";area.rows=4;area.spellcheck=false;
    const defaultTable=items.find((item)=>item.type==="table");
    area.value=defaultTable?'SELECT * FROM "'+defaultTable.name.replace(/"/g,'""')+'" LIMIT 250;':"SELECT name, type FROM sqlite_master LIMIT 250;";
    area.setAttribute("aria-label","Read-only SQLite query");
    const run=document.createElement("button");run.type="button";run.className="btn primary small";run.textContent="Run read-only query";
    const queryStatus=document.createElement("div");queryStatus.className="viewer-query-status";queryStatus.setAttribute("role","status");
    const out=document.createElement("div");out.className="viewer-query-output";
    const wrap=document.createElement("div");wrap.className="viewer-query-box";
    const label=document.createElement("label");label.textContent="SQL query (SELECT only)";
    wrap.append(label,area,run,queryStatus,out);stage().append(wrap);
    const queryState={rows:[],fields:[],sql:area.value};
    const execute=()=>{
      const query=area.value.trim().replace(/;+\s*$/,"");
      if(!/^SELECT\b/i.test(query)||query.includes(";")) {
        queryStatus.textContent="Only one read-only SELECT query is allowed. WITH, mutating statements and multiple statements are rejected.";
        queryStatus.className="viewer-query-status error";return;
      }
      try {
        const result=db.exec(query);
        const first=result[0];
        queryState.fields=first?first.columns:[];
        queryState.rows=first?first.values.map((values)=>Object.fromEntries(queryState.fields.map((field,i)=>[field,values[i]]))):[];
        queryState.sql=query;
        out.replaceChildren();
        if(first)addTable(queryState.rows.map((row)=>queryState.fields.map((field)=>row[field])),queryState.fields,"Query returned "+queryState.rows.length+" row(s). Results are capped only for display; SQL query itself executes in memory.");
        else {const note=document.createElement("p");note.className="viewer-caption";note.textContent="The statement returned no row set.";out.append(note);}
        queryStatus.textContent="Query completed: "+queryState.rows.length+" row(s), "+queryState.fields.length+" column(s).";
        queryStatus.className="viewer-query-status success";
        currentPreview={type:"sqlite",db:db,rows:queryState.rows,headers:queryState.fields,sql:queryState.sql,tables:items};
        setTargets(targetsFor(file,"sqlite"));
        $("#viewerCopy").disabled=!queryState.rows.length;
      } catch(err) {queryStatus.textContent="SQLite error: "+err.message;queryStatus.className="viewer-query-status error";}
    };
    run.addEventListener("click",execute);
    currentPreview={type:"sqlite",db:db,rows:[],headers:[],sql:area.value,tables:items};
    setTargets(targetsFor(file,"sqlite"));
    if(items.length)execute();
    $("#viewerCopy").disabled=true;
    activeViewerCleanup=()=>{try{db.close();}catch(_){}};
  }
  async function renderFile(file) {
    if(!file) return;
    clearStage();activeFile=file;activeFormatRecord=null;
    activeFormatRecord=await findFormatRecord(file);
    noteFile(file,activeFormatRecord ? activeFormatRecord.name : "Detecting format…");
    setTargets([{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
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
      } else if([".nc",".nc3",".netcdf"].includes(ext)) {
        if(await isHDF5File(file)){kind="hdf5";setTargets(targetsFor(file,kind));await renderHDF5(file);}
        else {kind="netcdf";setTargets(targetsFor(file,kind));await renderNetCDF(file);}
      } else if([".h5",".hdf5",".nc4",".he5"].includes(ext) || (ext===".hdf" && await isHDF5File(file))) {
        kind="hdf5";setTargets(targetsFor(file,kind));await renderHDF5(file);
      } else if(ext===".parquet") {
        kind="parquet";setTargets(targetsFor(file,kind));await renderParquet(file);
      } else if([".arrow",".feather",".arrows"].includes(ext)) {
        kind="arrow";setTargets(targetsFor(file,kind));await renderArrow(file);
      } else if([".sqlite",".sqlite3",".db"].includes(ext)) {
        kind="sqlite";await renderSQLite(file);
      } else if([".csv",".tsv",".tab"].includes(ext)) {
        kind="table";setTargets(targetsFor(file,kind));await renderCsv(file,ext===".tsv"||ext===".tab"?"\t":"");
      } else if([".xlsx",".xlsm",".xlsb",".xls",".ods"].includes(ext)) {
        kind="workbook";setTargets(targetsFor(file,kind));await renderWorkbook(file);
      } else if(ext===".geojson") {
        kind="geojson";setTargets(targetsFor(file,kind));await renderGeoJSON(file);
      } else if(ext===".json") {
        kind="json";setTargets(targetsFor(file,kind));await renderJson(file);
      } else if([".yaml",".yml"].includes(ext)) {
        kind="yaml";setTargets(targetsFor(file,kind));await renderYaml(file);
      } else if([".xml",".gml",".kml",".gpx",".lbl.xml",".votable.xml",".pvl"].includes(ext)) {
        kind="xml";setTargets(targetsFor(file,kind));await renderXml(file);
      } else if([".zip",".kmz"].includes(ext) || ext===".gz" || /\.gz$/i.test(file.name)) {
        kind=ext===".gz"?"gzip":"zip";await renderArchive(file);
      } else if([".mp3",".wav",".ogg",".flac",".m4a",".aac"].includes(ext) || (file.type&&file.type.startsWith("audio/"))) {
        kind="audio";addHeading("Audio player","Playback depends on the codecs supported by this browser.");
        const audio=document.createElement("audio");audio.controls=true;audio.src=newObjectUrl(file);audio.className="viewer-media";stage().append(audio);currentPreview={type:"audio"};
        metaStrip([["FILE",file.name],["SIZE",formatBytes(file.size)],["PLAYBACK","Native browser audio"]]);setTargets([{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
      } else if([".mp4",".mov",".webm",".mkv",".avi",".m4v"].includes(ext) || (file.type&&file.type.startsWith("video/"))) {
        kind="video";addHeading("Video player","Only codecs supported by this browser can play. The file is not transcoded in-place.");
        const video=document.createElement("video");video.controls=true;video.preload="metadata";video.src=newObjectUrl(file);video.className="viewer-media";stage().append(video);currentPreview={type:"video"};
        metaStrip([["FILE",file.name],["SIZE",formatBytes(file.size)],["PLAYBACK","Native browser video"]]);setTargets([{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
      } else if([".stl",".obj",".ply"].includes(ext)) {
        kind="mesh3d";setTargets(targetsFor(file,kind));await renderMesh3D(file,ext);
      } else if([".glb",".gltf"].includes(ext)) {
        kind="model";await renderModel(file);setTargets([{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
      } else if(supportedTextExt(ext)) {
        kind="text";const text=await file.slice(0,MAX_TEXT_BYTES).text();
        addHeading("Text / source viewer","Shown as text, never executed as HTML or script.");
        addPre(text,"TEXT SOURCE"+(file.size>MAX_TEXT_BYTES?" · FIRST 32 MB ONLY":""));
        if(file.size>MAX_TEXT_BYTES)addNotice("Text preview truncated at 32 MB. Large scientific text products are better inspected with a local streaming tool.","warn");
        currentPreview={type:"text",text:text};$("#viewerCopy").disabled=false;
        setTargets([{value:"text",label:"Save as UTF-8 text"},{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
      } else {
        kind="binary";addHeading("Binary / scientific-format viewer","No generic parser can safely interpret every mission-specific binary layout. This view shows the signature and a byte-level window; the format atlas links the official reader / validator.");
        const bytes=await readHead(file,512);
        const readable=likelyText(bytes);
        metaStrip([["EXTENSION",extLabel(file)],["SIZE",formatBytes(file.size)],["VIEWER","Signature + hex"]]);
        renderBinary(bytes,file.name);
        if(readable) addNotice("These initial bytes appear text-like. Use the format-specific documentation to interpret records and units.");
        addNotice("Scientific binary families such as CDF, HDF5, GRIB, PDS, CCSDS telemetry and SPICE kernels need specialist parsers for full fidelity.","warn");
        currentPreview={type:"binary",bytes:bytes};
        setTargets([{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
      }
      renderRegistryContext(activeFormatRecord);
      noteFile(file,(currentPreview.type||kind).toUpperCase()+" VIEW"+(activeFormatRecord ? " · "+activeFormatRecord.name : ""));
      status("Loaded "+file.name+". Preview and supported conversions run in this browser session.","success");
    } catch(err) {
      addHeading("Viewer could not fully decode this file","The file remains local; try the matching official reader from the Format Atlas.");
      const bytes=await readHead(file,256).catch(()=>new Uint8Array());
      renderBinary(bytes,file.name);
      addNotice((err && err.message) || String(err),"warn");
      currentPreview={type:"binary",bytes:bytes};
      renderRegistryContext(activeFormatRecord);
      noteFile(file,"BASIC BYTE VIEW"+(activeFormatRecord ? " · "+activeFormatRecord.name : ""));
      setTargets([{value:"report-json",label:"Export file report → JSON"},{value:"zip",label:"Create ZIP archive"}]);
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
    if(ext===".parquet") return parseParquetFile(file);
    if([".arrow",".feather",".arrows"].includes(ext)) return parseArrowFile(file);
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
      } else if(target==="report-json") {
        const signature=await readHead(file,64);
        const report={
          generatedAt:new Date().toISOString(),
          source:{name:file.name,extension:extOf(file)||null,mimeType:file.type||null,sizeBytes:file.size,lastModified:file.lastModified?new Date(file.lastModified).toISOString():null},
          viewer:{mode:currentPreview.type||"unknown",previewText:currentPreview.text?safeText(currentPreview.text).slice(0,12000):null,tableColumns:currentPreview.headers||null,previewRows:currentPreview.rows?currentPreview.rows.slice(0,100):null,archiveEntryPaths:currentPreview.entries?Object.keys(currentPreview.entries).slice(0,1000):null},
          formatRegistry:activeFormatRecord?{name:activeFormatRecord.name,group:activeFormatRecord.group,uses:activeFormatRecord.uses,validation:activeFormatRecord.validation,docs:activeFormatRecord.docs,tool:activeFormatRecord.tool}:null,
          signature:{firstBytesHex:Array.from(signature).map((v)=>v.toString(16).padStart(2,"0")).join(" "),firstBytesAscii:Array.from(signature).map((v)=>v>=32&&v<127?String.fromCharCode(v):".").join("")},
          note:"Identification report only. A matching extension or signature is not proof of standards compliance, data integrity, scientific calibration or provenance."
        };
        blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json;charset=utf-8"});
        name=file.name+".space-report.json";
      } else if(target==="pdf-text") {
        if(!currentPreview.pdf) throw new Error("Open the PDF in the viewer before extracting text.");
        const pdf=currentPreview.pdf;
        const pageLimit=Math.min(pdf.numPages,500);
        const chunks=[];
        for(let p=1;p<=pageLimit;p++){
          const page=await pdf.getPage(p);
          const content=await page.getTextContent();
          chunks.push("----- PAGE "+p+" -----\n"+content.items.map((item)=>item.str||"").join(" "));
        }
        if(pdf.numPages>pageLimit)chunks.push("\n[TRUNCATED: only first 500 pages were extracted by the browser safety limit]");
        blob=new Blob([chunks.join("\n\n")],{type:"text/plain;charset=utf-8"});
        name=file.name.replace(/\.pdf$/i,"")+".txt";
      } else if (target === "mesh-stl" || target === "mesh-obj") {
        if(currentPreview.type!=="mesh3d" || !currentPreview.object) throw new Error("Load an STL, OBJ or PLY mesh before exporting another mesh format.");
        const exporterUrl=target==="mesh-stl"?MODULES.stlExporter:MODULES.objExporter;
        const exporterModule=await importModule(exporterUrl);
        const exporter=target==="mesh-stl"?new exporterModule.STLExporter():new exporterModule.OBJExporter();
        const exported=target==="mesh-stl"?exporter.parse(currentPreview.object,{binary:true}):exporter.parse(currentPreview.object);
        blob=new Blob([exported],{type:target==="mesh-stl"?"model/stl":"text/plain;charset=utf-8"});
        name=file.name.replace(/\.[^.]+$/,"")+(target==="mesh-stl"?".stl":".obj");
      } else if(["sql-csv","sql-tsv","sql-json","sql-xlsx"].includes(target)) {
        const rows=currentPreview.type==="sqlite"?currentPreview.rows:[],fields=currentPreview.type==="sqlite"?currentPreview.headers:[];
        if(!rows.length||!fields.length)throw new Error("Run a SELECT query that returns rows before exporting the SQLite query result.");
        if(target==="sql-json") {
          blob=new Blob([JSON.stringify(rows,null,2)],{type:"application/json;charset=utf-8"});
          name=file.name.replace(/\.[^.]+$/,"")+"-query.json";
        } else if(target==="sql-xlsx") {
          await loadScript(LIB.sheet,()=>!!window.XLSX);
          const wb=window.XLSX.utils.book_new(),sheet=window.XLSX.utils.json_to_sheet(rows,{header:fields});
          window.XLSX.utils.book_append_sheet(wb,sheet,"Query");
          blob=new Blob([window.XLSX.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
          name=file.name.replace(/\.[^.]+$/,"")+"-query.xlsx";
        } else {
          await loadScript(LIB.papa,()=>!!window.Papa);
          const delimiter=target==="sql-tsv"?"\t":",";
          const text=window.Papa.unparse({fields:fields,data:rows.map((row)=>fields.map((field)=>row[field]))},{delimiter:delimiter,newline:"\r\n"});
          blob=new Blob([text],{type:target==="sql-tsv"?"text/tab-separated-values;charset=utf-8":"text/csv;charset=utf-8"});
          name=file.name.replace(/\.[^.]+$/,"")+(target==="sql-tsv"?"-query.tsv":"-query.csv");
        }
      } else if(target==="shape-geojson") {
        const data=currentPreview.value;
        if(!data || !["FeatureCollection","Feature"].includes(data.type))throw new Error("Load a GeoJSON file or a ZIP containing a shapefile first.");
        blob=new Blob([JSON.stringify(data,null,2)],{type:"application/geo+json;charset=utf-8"});
        name=file.name.replace(/\.zip$/i,"").replace(/\.[^.]+$/,"")+".geojson";
      } else if(target==="geojson-csv") {
        const parsed=currentPreview.type==="geojson" && currentPreview.value ? currentPreview.value : JSON.parse(await file.text());
        const features=parsed.type==="FeatureCollection"?(parsed.features||[]):parsed.type==="Feature"?[parsed]:[];
        const rows=features.map((feature)=>Object.assign({geometry:JSON.stringify(feature.geometry||null)},feature.properties||{}));
        if(!rows.length)throw new Error("No GeoJSON features were available to export.");
        await loadScript(LIB.papa,()=>!!window.Papa);
        const fields=Array.from(new Set(rows.flatMap((row)=>Object.keys(row))));
        blob=new Blob([window.Papa.unparse({fields:fields,data:rows.map((row)=>fields.map((key)=>row[key]))})],{type:"text/csv;charset=utf-8"});
        name=file.name.replace(/\.[^.]+$/,"")+".csv";
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
      } else if(["csv","tsv","json","xlsx","yaml","xml","json-pretty","json-min","text"].includes(target)) {
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
          if(value && !Array.isArray(value) && Array.isArray(value.rows) && Array.isArray(value.fields)) value=value.rows;
          if(target==="json") {output=JSON.stringify(value,null,2);mime="application/json;charset=utf-8";ext="json";}
          else if(target==="yaml") {await loadScript(LIB.yaml,()=>!!window.jsyaml);output=window.jsyaml.dump(value,{noRefs:true,lineWidth:110});mime="text/yaml;charset=utf-8";ext="yaml";}
          else {output='<?xml version="1.0" encoding="UTF-8"?>\n'+objectToXml(value,"root");mime="application/xml;charset=utf-8";ext="xml";}
        } else {
          const parsed=await parseFileValue(file);
          let rows,fields;
          if(parsed && parsed.rows && parsed.fields) {rows=parsed.rows;fields=parsed.fields;}
          else {rows=asRecords(parsed);fields=Array.from(new Set(rows.flatMap((r)=>Object.keys(r))));}
          if(target==="xlsx") {
            await loadScript(LIB.sheet,()=>!!window.XLSX);
            const workbook=window.XLSX.utils.book_new();
            const sheet=window.XLSX.utils.json_to_sheet(rows,{header:fields});
            window.XLSX.utils.book_append_sheet(workbook,sheet,"Export");
            const data=window.XLSX.write(workbook,{bookType:"xlsx",type:"array"});
            blob=new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
            name=file.name.replace(/\.[^.]+$/,"")+".xlsx";
          } else {
            await loadScript(LIB.papa,()=>!!window.Papa);
            output=window.Papa.unparse({fields:fields,data:rows.map((row)=>fields.map((f)=>row[f]) )},{delimiter:target==="tsv"?"\t":",",newline:"\r\n"});
            mime=target==="tsv"?"text/tab-separated-values;charset=utf-8":"text/csv;charset=utf-8";ext=target;
          }
        }
        if(target!=="xlsx") { blob=new Blob([output],{type:mime});name=file.name.replace(/\.[^.]+$/,"")+"."+ext; }
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