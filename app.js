(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const safeText = (value) => String(value ?? "");
  const escapeHTML = (value) => safeText(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return "Unknown";
    if (bytes < 1024) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
    return size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2) + " " + units[unit];
  };
  const niceDate = (value) => {
    if (!value) return "Date not supplied";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? safeText(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const externalLink = (url, label, css = "") => {
    if (!/^https:\/\//i.test(safeText(url))) return "";
    return '<a class="' + css + '" href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(label) + ' ↗</a>';
  };
  const safeHttpURL = (raw) => {
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error("Enter a complete, valid HTTPS URL."); }
    if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are accepted for direct downloads.");
    if (url.username || url.password) throw new Error("URLs containing embedded credentials are blocked.");
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new Error("Local or internal hosts are blocked.");
    }
    if (host.includes(":") && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) {
      throw new Error("Private or link-local IPv6 addresses are blocked.");
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const p = host.split(".").map(Number);
      if (p.some(n => n < 0 || n > 255) || p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
          (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
          (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)) {
        throw new Error("Private, link-local, loopback and reserved IPv4 addresses are blocked.");
      }
    }
    return url;
  };

  let formats = [], sources = [], toolItems = [], visibleFormats = 18, selectedProvider = null;
  const SOURCE_MAP = {};
  const API_LIMIT = 20;
  const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
  const MAX_TEXT_INSPECT_BYTES = 2 * 1024 * 1024;
  const MAX_HASH_BYTES = 40 * 1024 * 1024;

  const officialSources = [
    {id:"nasa",name:"NASA Earthdata / CMR",country:"United States",mark:"NASA",type:"Live API",status:"API live",desc:"Search Earth-observation collections and granules; selected assets may require Earthdata Login.",portal:"https://search.earthdata.nasa.gov/search",api:"https://cmr.earthdata.nasa.gov/search/granules.json",docs:"https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html",formats:[".nc",".h5",".hdf",".tif",".fits",".grib",".zarr"],access:"Public catalogue metadata; many downloads are open, while restricted collections require sign-in."},
    {id:"pds",name:"NASA Planetary Data System",country:"United States",mark:"PDS",type:"Portal + tools",status:"Official portal",desc:"Search planetary mission archives and validate PDS3/PDS4 products with official tooling.",portal:"https://pds.nasa.gov/",api:"https://pds.nasa.gov/services/",docs:"https://pds.nasa.gov/tools/about/",formats:[".xml",".lbl",".img",".tab",".qub",".fits",".bsp"],access:"Archive products generally public; cite mission-specific terms and labels."},
    {id:"nssdc-us",name:"NASA Space Science Data Coordinated Archive",country:"United States",mark:"NSSDC",type:"Portal",status:"Official portal",desc:"NASA's permanent archive for space science mission data and mission records.",portal:"https://nssdc.gsfc.nasa.gov/",api:"",docs:"https://nssdc.gsfc.nasa.gov/",formats:[".fits",".cdf",".nc",".dat",".img"],access:"Product-specific availability and access instructions apply."},
    {id:"copernicus",name:"Copernicus Data Space Ecosystem",country:"European Union / ESA",mark:"ESA",type:"Live STAC API",status:"API live",desc:"Discover Sentinel Earth-observation collections through the public STAC catalogue; selected item assets may have product access constraints.",portal:"https://dataspace.copernicus.eu/",api:"https://stac.dataspace.copernicus.eu/v1/collections",docs:"https://documentation.dataspace.copernicus.eu/APIs/STAC.html",formats:[".safe",".jp2",".xml",".tif",".nc",".zarr"],access:"Catalogue discovery is public; product downloads, quotas and authentication depend on service."},
    {id:"eumetsat",name:"EUMETSAT Data Store",country:"Europe",mark:"EUM",type:"Live browse API",status:"API live",desc:"Search the public collection browse API for meteorological satellite datasets; product downloads may need an account/client.",portal:"https://data.eumetsat.int/",api:"https://api.eumetsat.int/data/browse/1.0.0/collections?format=json",docs:"https://user.eumetsat.int/resources/user-guides",formats:[".nc",".grib",".h5","HRIT","LRIT"],access:"Collection browse is public; access and authentication vary by product and download method."},
    {id:"isro",name:"ISRO / NRSC Bhoonidhi",country:"India",mark:"ISRO",type:"Login / API",status:"Credentials required",desc:"Satellite data search and download for Indian and selected international Earth-observation missions.",portal:"https://bhoonidhi.nrsc.gov.in/bhoonidhi/home.html",api:"https://bhoonidhi-api.nrsc.gov.in/data/search",docs:"https://bhoonidhi.nrsc.gov.in/bhoonidhi-api/",formats:[".tif",".jp2",".xml",".h5",".nc",".zip"],access:"The official API requires registered credentials; this public website will never collect or store them."},
    {id:"isro-bhuvan",name:"ISRO / NRSC Bhuvan",country:"India",mark:"BHU",type:"Portal",status:"Official portal",desc:"Indian geospatial visualisation and thematic mapping services.",portal:"https://bhuvan.nrsc.gov.in/",api:"",docs:"https://www.isro.gov.in/SpaceBasedEarthObservationServices.html",formats:[".tif",".shp",".geojson",".kml",".kmz"],access:"Service-specific terms, layers and access options vary."},
    {id:"isro-mosdac",name:"ISRO MOSDAC",country:"India",mark:"MOS",type:"Portal",status:"Official portal",desc:"Meteorological and oceanographic satellite data and products.",portal:"https://mosdac.gov.in/",api:"",docs:"https://mosdac.gov.in/",formats:[".h5",".nc",".grib",".tif",".csv"],access:"Some services require user registration."},
    {id:"jaxa",name:"JAXA DARTS",country:"Japan",mark:"JAXA",type:"Portal + direct archive",status:"Official portal",desc:"Science archives spanning astronomy, solar-terrestrial physics and planetary exploration; provides format-specific guidance.",portal:"https://darts.isas.jaxa.jp/en/",api:"",docs:"https://darts.isas.jaxa.jp/en/faq",formats:[".fits",".cdf",".nc",".bsp",".lbl",".img"],access:"Many datasets offer public downloads; follow individual mission instructions."},
    {id:"china-nssdc",name:"Chinese National Space Science Data Center (NSSDC)",country:"China",mark:"CN NSSDC",type:"National data portal",status:"Official national centre",desc:"Space physics, space astronomy, lunar and planetary science resources including Chang'e, Tianwen and science mission datasets.",portal:"https://www.nssdc.ac.cn/nssdc_en/html/index.html",api:"",docs:"https://www.nssdc.ac.cn/nssdc_en/html/index.html",formats:[".cdf",".fits",".xml",".img",".dat",".csv"],access:"Dataset permissions and download methods vary; some data require researcher authorization."},
    {id:"china-dataaccess",name:"China NSSDC Data Access",country:"China",mark:"CN DATA",type:"Portal",status:"Official data access",desc:"National Space Science Data Center resources, scientific archives and dataset access interfaces.",portal:"https://dataaccess.nssdc.ac.cn/",api:"",docs:"https://dataaccess.nssdc.ac.cn/",formats:[".cdf",".fits",".dat",".xml",".csv"],access:"Some research datasets are access-controlled or require principal-investigator permission."},
    {id:"cnsa",name:"China National Space Administration — Resources",country:"China",mark:"CNSA",type:"Portal directory",status:"Official portal",desc:"CNSA resource services linking lunar exploration data, national remote-sensing data and satellite query services.",portal:"https://www.cnsa.gov.cn/n6758826/index.html",api:"",docs:"https://www.cnsa.gov.cn/n6758826/index.html",formats:["Mission-specific packages","GeoTIFF","XML","Binary"],access:"The linked services define their own access and reuse rules."},
    {id:"china-lunar",name:"Chinese Lunar Exploration Data Release System",country:"China",mark:"CLEP",type:"Mission archive",status:"Mission archive",desc:"Lunar exploration data platform linked from Chinese space resources; check current access and product standards.",portal:"https://moon.bao.ac.cn/",api:"",docs:"https://www.cnsa.gov.cn/n6758826/index.html",formats:["Mission-specific imagery","DEM/raster","XML","Binary"],access:"Verify current endpoint, licensing and product specification before bulk fetching."},
    {id:"roscosmos",name:"Roscosmos",country:"Russia",mark:"ROSCOSMOS",type:"Agency portal",status:"Mission-dependent",desc:"Official Russian state space corporation portal. This registry does not assert an open, general-purpose public data API.",portal:"https://www.roscosmos.ru/",api:"",docs:"https://www.roscosmos.ru/",formats:["Mission-specific telemetry","Binary","Raster imagery","XML/CSV where provided"],access:"Public download APIs and reuse terms depend on the individual mission or archive."},
    {id:"russia-earth",name:"Russian Earth-observation data access",country:"Russia",mark:"EO RU",type:"Provider directory",status:"Provider-specific",desc:"Start at official agency/mission sources. No universal Roscosmos browser API is claimed here; avoid relabelling a third-party portal as an agency API.",portal:"https://www.roscosmos.ru/",api:"",docs:"https://www.roscosmos.ru/",formats:["GeoTIFF","TIFF","JPEG 2000","Metadata XML","Mission-specific binary"],access:"Check source legitimacy, terms and applicable export-control restrictions."},
    {id:"canada-eodms",name:"Natural Resources Canada EODMS",country:"Canada",mark:"EODMS",type:"Portal",status:"Official data portal",desc:"Earth observation data discovery for Canadian and international satellite collections.",portal:"https://eodms-sgdot.nrcan-rncan.gc.ca/",api:"",docs:"https://eodms-sgdot.nrcan-rncan.gc.ca/",formats:[".tif",".jp2",".xml",".shp",".nc"],access:"Accounts and provider-specific permissions may be required."},
    {id:"noaa-class",name:"NOAA CLASS",country:"United States",mark:"NOAA",type:"Portal",status:"Official archive",desc:"Comprehensive Large Array-data Stewardship System for NOAA environmental satellite data.",portal:"https://www.class.noaa.gov/",api:"",docs:"https://www.class.noaa.gov/",formats:[".nc",".h5",".grib","HRIT","LRIT"],access:"Dataset and account conditions vary."},
    {id:"noaa-ncei",name:"NOAA National Centers for Environmental Information",country:"United States",mark:"NCEI",type:"Portal + APIs",status:"Official archive",desc:"Environmental and satellite datasets, metadata services and API guidance.",portal:"https://www.ncei.noaa.gov/",api:"",docs:"https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation",formats:[".nc",".grib",".csv",".tif",".json"],access:"Public datasets subject to dataset-specific terms."},
    {id:"kari",name:"Korea Aerospace Administration / KARI ecosystem",country:"South Korea",mark:"KARI",type:"Agency directory",status:"Mission-dependent",desc:"Official Korean space programme entry points and mission information; satellite data access depends on mission and distribution service.",portal:"https://www.kasa.go.kr/eng/",api:"",docs:"https://www.kasa.go.kr/eng/",formats:["GeoTIFF","JPEG 2000","XML","Mission-specific payload"],access:"Use the official mission or imagery distribution portal where provided."},
    {id:"uk",name:"UK space-science and Earth-observation archives",country:"United Kingdom",mark:"UK",type:"Portal directory",status:"Research archives",desc:"UK research groups and services contribute to mission science; there is no single universal UKSA file API implied here.",portal:"https://www.gov.uk/government/organisations/uk-space-agency",api:"",docs:"https://www.gov.uk/government/organisations/uk-space-agency",formats:[".fits",".cdf",".nc",".tif",".xml"],access:"Choose the archive responsible for the instrument or mission."},
    {id:"esa-psa",name:"ESA Planetary Science Archive",country:"Europe",mark:"PSA",type:"Official archive",status:"Official archive",desc:"ESA repository for planetary mission science products, with PDS-based and mission-specific products.",portal:"https://archives.esac.esa.int/psa/",api:"",docs:"https://www.cosmos.esa.int/web/psa",formats:["PDS3/PDS4",".xml",".lbl",".img",".fits",".bsp"],access:"Follow product-specific labels, ancillary files and archive instructions."},
    {id:"esa-archives",name:"ESA Science Archives",country:"Europe",mark:"ESAC",type:"Official archive",status:"Official archive",desc:"Astronomy and science mission archive access for ESA missions.",portal:"https://www.cosmos.esa.int/web/esdc",api:"",docs:"https://www.cosmos.esa.int/",formats:[".fits",".vot",".xml",".csv",".bsp"],access:"Individual archives document account requirements and downloads."},
    {id:"international",name:"International standards & shared archives",country:"International",mark:"CCSDS",type:"Standards hub",status:"Interoperability",desc:"Cross-country space packet standards and shared data exchange models.",portal:"https://ccsds.org/",api:"",docs:"https://ccsds.org/",formats:["CCSDS TM/TC/AOS/CFDP","XFDU","PDS","FITS","SPASE"],access:"Standards documentation and implementation-code licenses are separate."}
  ];

  const fallbackTools = [
    {name:"FITSverify",category:"Astronomy",summary:"Official FITS conformance checker for FITS Standard 3.0. A signature sniff is not a substitute for this validator.",source:"https://heasarc.gsfc.nasa.gov/docs/software/ftools/fitsverify/",repository:"https://heasarc.gsfc.nasa.gov/docs/software/ftools/fitsverify/",license:"Review terms in the official package and CFITSIO dependencies.",run:"fitsverify filename.fits"},
    {name:"CFITSIO",category:"Astronomy",summary:"C library for FITS I/O and science software.",source:"https://heasarc.gsfc.nasa.gov/docs/software/fitsio/",repository:"https://heasarc.gsfc.nasa.gov/docs/software/fitsio/",license:"Review the current release license.",run:"FITS readers, writers and validators use this library."},
    {name:"NASA PDS Validate",category:"Planetary science",summary:"Official validator for PDS4 products and PDS3 volumes; public source repository includes licensing.",source:"https://pds.nasa.gov/tools/about/",repository:"https://github.com/NASA-PDS/validate",license:"Apache-2.0 listed in current repo; verify dependencies.",run:"validate --help"},
    {name:"NAIF SPICE Toolkit",category:"Navigation",summary:"Official toolkit for SPICE ephemeris, attitude, frame and instrument kernels.",source:"https://naif.jpl.nasa.gov/naif/toolkit.html",repository:"https://naif.jpl.nasa.gov/naif/toolkit.html",license:"Read NAIF Toolkit license and support rules.",run:"Use toolkit utilities/bindings to query SPK, CK, PCK, FK, IK, LSK, SCLK, DSK and EK."},
    {name:"NASA CDF",category:"Space physics",summary:"Official software for Common Data Format files.",source:"https://cdf.gsfc.nasa.gov/",repository:"https://cdf.gsfc.nasa.gov/",license:"Review the license supplied with the current package.",run:"Use CDF tools to inspect variable, attribute and record structure."},
    {name:"NetCDF utilities",category:"Earth science",summary:"Libraries and command-line utilities for labelled scientific array data.",source:"https://www.unidata.ucar.edu/software/netcdf/",repository:"https://github.com/Unidata/netcdf-c",license:"Check source repository license and dependencies.",run:"ncdump -h product.nc"},
    {name:"HDFView / HDF5 utilities",category:"Earth science",summary:"Inspect HDF5 groups, arrays and metadata; HDF4 needs separate support.",source:"https://www.hdfgroup.org/downloads/",repository:"https://github.com/HDFGroup/hdf5",license:"Review each current package's license and dependencies.",run:"h5dump -H product.h5"},
    {name:"GDAL / OGR",category:"Geospatial",summary:"Geospatial toolkit for GeoTIFF, COG, VRT, GeoPackage, Shapefile and many raster/vector formats.",source:"https://gdal.org/",repository:"https://github.com/OSGeo/gdal",license:"MIT-style/X license; verify version and third-party driver dependencies.",run:"gdalinfo scene.tif"},
    {name:"ecCodes",category:"Meteorology",summary:"ECMWF tools to decode and inspect GRIB messages.",source:"https://confluence.ecmwf.int/display/ECC",repository:"https://github.com/ecmwf/eccodes",license:"Check current source license and third-party notices.",run:"grib_ls forecast.grib2"},
    {name:"Apache Arrow / Parquet",category:"Science data engineering",summary:"Columnar data formats and libraries for derived science tables and analysis pipelines.",source:"https://arrow.apache.org/",repository:"https://github.com/apache/arrow",license:"Apache-2.0; verify notices for bundled components.",run:"Inspect schema and metadata with PyArrow or DuckDB."},
    {name:"Zarr",category:"Cloud science",summary:"Specification and libraries for chunked N-dimensional arrays in object storage.",source:"https://zarr.dev/",repository:"https://github.com/zarr-developers/zarr-python",license:"Check repository license and supported spec version.",run:"Validate metadata and expected chunk references."},
    {name:"QGIS",category:"Geospatial",summary:"Desktop GIS for examining spatial rasters, vector layers, coordinate systems and geometry.",source:"https://qgis.org/",repository:"https://github.com/qgis/QGIS",license:"GPL; satisfy the applicable license before incorporating code.",run:"Inspect raster CRS and geometry validity."},
    {name:"USGS ISIS",category:"Planetary science",summary:"Planetary image processing for supported mission image cubes.",source:"https://isis.astrogeology.usgs.gov/",repository:"https://github.com/DOI-USGS/ISIS3",license:"Review current license and bundled dependencies.",run:"Use ISIS cube/label inspection tools."},
    {name:"EUMDAC",category:"Meteorology",summary:"EUMETSAT's data-access client for supported product search and downloads.",source:"https://user.eumetsat.int/resources/user-guides/eumdac",repository:"https://github.com/EUMETSAT/eumdac",license:"Review the current repository license.",run:"Install/configure according to official docs; do not publish credentials."},
    {name:"Copernicus Data Space APIs",category:"Earth observation",summary:"Documented APIs for CDSE including STAC, OData and download services.",source:"https://documentation.dataspace.copernicus.eu/APIs.html",repository:"https://github.com/ESA",license:"Client-library licenses vary; review each specific repository.",run:"Use STAC discovery or the provider's documented download endpoint."},
    {name:"NASA Earthdata CMR",category:"Discovery",summary:"Public API for collection/granule discovery; selected data links may require Earthdata Login.",source:"https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html",repository:"https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html",license:"API service, not a client library; client code has its own license.",run:"GET /search/granules.json?keyword=...&page_size=10"}
  ];

  const showStatus = (id, text, type = "") => {
    const node = $("#" + id);
    if (!node) return;
    node.textContent = text;
    node.className = "status" + (type ? " " + type : "");
    node.classList.remove("hidden");
  };
  const clearStatus = (id) => { const node = $("#" + id); if (node) node.classList.add("hidden"); };
  const normalize = (value) => safeText(value).toLowerCase();

  function renderFormatCard(format) {
    const extensions = (format.extensions || []).join(" · ");
    const agencies = (format.agencies || []).slice(0, 4).join(", ");
    return '<article class="format-card">' +
      '<div class="format-top"><div class="ext-list">' + escapeHTML(extensions) + '</div><span class="tag">' + escapeHTML(format.kind || "file") + '</span></div>' +
      '<h3>' + escapeHTML(format.name) + '</h3><p>' + escapeHTML(format.uses) + '</p>' +
      '<div class="format-meta"><div><strong>Domain:</strong> ' + escapeHTML(format.group) + '</div><div><strong>Ecosystem:</strong> ' + escapeHTML(agencies) + '</div><div><strong>Validation:</strong> ' + escapeHTML(format.validation) + '</div></div>' +
      '<div class="format-actions">' + externalLink(format.tool, "Official tool") + externalLink(format.docs, "Specification") +
      '<button type="button" data-extension="' + escapeHTML((format.extensions || [])[0] || "") + '">Inspect this type →</button></div></article>';
  }
  function currentFormatList() {
    const query = normalize($("#formatSearch")?.value || "");
    const category = $("#formatCategory")?.value || "";
    const agency = $("#formatAgency")?.value || "";
    return formats.filter(f => {
      const haystack = normalize([f.name, f.group, f.kind, f.uses, f.validation, ...(f.extensions || []), ...(f.agencies || [])].join(" "));
      return (!query || haystack.includes(query)) && (!category || f.group === category) &&
        (!agency || (f.agencies || []).includes(agency));
    });
  }
  function renderFormats(reset = false) {
    if (reset) visibleFormats = 18;
    const filtered = currentFormatList();
    $("#formatResultCount").textContent = filtered.length + " matching entries";
    $("#formatCountLabel").textContent = filtered.length + " formats";
    $("#formatGrid").innerHTML = filtered.length
      ? filtered.slice(0, visibleFormats).map(renderFormatCard).join("")
      : '<div class="empty" style="grid-column:1/-1">No matching format. Try an extension such as .fits, .cdf, .jp2, .bsp, .evt or CCSDS.</div>';
    const more = $("#loadMoreFormats");
    if (more) {
      more.classList.toggle("hidden", filtered.length <= visibleFormats);
      more.textContent = "Load " + Math.min(18, Math.max(0, filtered.length - visibleFormats)) + " more ↓";
    }
  }

  function renderSources() {
    $("#sourceGrid").innerHTML = sources.map(s => '<article class="source-card"><div class="source-top"><span class="agency-mark">' +
      escapeHTML(s.mark) + '</span><span class="tag ' + (/live/i.test(s.status) ? "live" : "") + '">' + escapeHTML(s.status) + '</span></div><h3>' +
      escapeHTML(s.name) + '</h3><p>' + escapeHTML(s.desc) + '</p><div class="source-links">' +
      externalLink(s.portal, "Portal") + (s.api ? externalLink(s.api, "API") : "") + (s.docs ? externalLink(s.docs, "Docs") : "") +
      '</div><p class="download-note" style="margin-top:12px">' + escapeHTML(s.country) + ' · ' + escapeHTML(s.access) + '</p></article>').join("");
  }
  function renderTools() {
    $("#toolGrid").innerHTML = toolItems.map(t => '<article class="tool-card"><div class="tool-kind">' + escapeHTML(t.category) +
      '</div><h3>' + escapeHTML(t.name) + '</h3><p>' + escapeHTML(t.summary) + '</p><p><b>Reuse:</b> ' +
      escapeHTML(t.license || "Review upstream terms") + '</p><p><b>Example:</b> <code>' + escapeHTML(t.run || "See official documentation") +
      '</code></p><div class="source-links">' + externalLink(t.source, "Official site") + externalLink(t.repository, "Source / docs") + '</div></article>').join("");
  }

  function populateFilters() {
    const group = $("#formatCategory");
    const agency = $("#formatAgency");
    const oldGroup = group.value;
    const oldAgency = agency.value;
    [...new Set(formats.map(f => f.group).filter(Boolean))].sort().forEach(value => {
      const option = document.createElement("option"); option.value = value; option.textContent = value; group.append(option);
    });
    [...new Set(formats.flatMap(f => f.agencies || []))].sort().forEach(value => {
      const option = document.createElement("option"); option.value = value; option.textContent = value; agency.append(option);
    });
    group.value = oldGroup; agency.value = oldAgency;
    $("#formatCount").textContent = formats.length + " / " + new Set(formats.flatMap(f => f.extensions || [])).size;
    renderFormats(true);
  }

  function findFormatByExtension(name) {
    const lower = safeText(name).toLowerCase();
    // Prefer compound suffixes such as .fits.fz and .tar.gz.
    return formats.find(f => (f.extensions || []).some(ext => {
      const e = ext.toLowerCase();
      return e.startsWith(".") && lower.endsWith(e);
    })) || formats.find(f => (f.extensions || []).some(ext => ext.startsWith(".") && lower.endsWith(ext.toLowerCase())));
  }
  function extensionFor(name) {
    const lower = safeText(name).toLowerCase();
    const known = formats.flatMap(f => f.extensions || []).filter(e => e.startsWith(".")).sort((a,b)=>b.length-a.length);
    return known.find(e => lower.endsWith(e.toLowerCase())) || (lower.includes(".") ? "." + lower.split(".").pop() : "(no extension)");
  }
  function ascii(bytes, start = 0, end = bytes.length) {
    let out = "";
    for (let i = start; i < Math.min(end, bytes.length); i++) out += bytes[i] >= 32 && bytes[i] <= 126 ? String.fromCharCode(bytes[i]) : " ";
    return out;
  }
  function starts(bytes, sequence, offset = 0) {
    return sequence.every((value, index) => bytes[offset + index] === value);
  }
  function detectSignature(bytes, fileName) {
    const ext = extensionFor(fileName).toLowerCase();
    const text = ascii(bytes.slice(0, Math.min(bytes.length, 4096))).trim();
    let detected = "Unknown / mission-specific binary";
    let checks = [];
    const has = (ok, good, bad) => checks.push({ok, text: ok ? good : bad});
    if (text.startsWith("SIMPLE  =") || text.startsWith("SIMPLE  ")) detected = "FITS-like primary header";
    else if (starts(bytes, [0x89,0x48,0x44,0x46,0x0d,0x0a,0x1a,0x0a])) detected = "HDF5 signature";
    else if (starts(bytes,[0x50,0x4b,0x03,0x04]) || starts(bytes,[0x50,0x4b,0x05,0x06]) || starts(bytes,[0x50,0x4b,0x07,0x08])) detected = "ZIP container";
    else if ((starts(bytes,[0x49,0x49,0x2a,0x00]) || starts(bytes,[0x4d,0x4d,0x00,0x2a]) || starts(bytes,[0x49,0x49,0x2b,0x00]) || starts(bytes,[0x4d,0x4d,0x00,0x2b]))) detected = "TIFF-like header";
    else if (starts(bytes,[0xff,0x4f,0xff,0x51])) detected = "JPEG 2000 codestream";
    else if (starts(bytes,[0x00,0x00,0x00,0x0c,0x6a,0x50,0x20,0x20,0x0d,0x0a,0x87,0x0a])) detected = "JPEG 2000 JP2 container";
    else if (text.startsWith("CDF") || starts(bytes,[0x43,0x44,0x46,0x01]) || starts(bytes,[0x43,0x44,0x46,0x02]) || starts(bytes,[0xcd,0xf2,0x00,0x01])) detected = "Common Data Format / CDF-like signature";
    else if (text.startsWith("GRIB") || text.slice(0,4) === "GRIB") detected = "GRIB meteorological message";
    else if (starts(bytes,[0x1f,0x8b])) detected = "GZIP compressed stream";
    else if (starts(bytes,[0x50,0x41,0x52,0x31])) detected = "Parquet signature";
    else if (text.startsWith("DAF/SPK") || text.startsWith("DAF/CK") || text.startsWith("DAF/PCK") || text.startsWith("KPL/")) detected = "SPICE kernel text/binary identifier";
    else if (text.startsWith("PDS_VERSION_ID") || text.includes("PDS4") || (text.startsWith("<?xml") && text.toLowerCase().includes("pds"))) detected = "PDS label clue";
    else if (text.startsWith("<?xml") || text.startsWith("<")) detected = "XML-like text";
    else if (text.startsWith("{") || text.startsWith("[")) detected = "JSON-like text";
    else if (text.startsWith("SQLite format 3")) detected = "SQLite / GeoPackage container";
    else if (text.startsWith("ARROW1")) detected = "Arrow IPC file";
    else if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0x01) detected = "Possible Shapefile geometry header";
    else if (text.startsWith("ISO-10303-21")) detected = "STEP CAD exchange file";
    else if (text.startsWith("ply")) detected = "PLY mesh";
    else if (text.startsWith("CDF")) detected = "CDF signature clue";
    else if (text.startsWith("netCDF")) detected = "NetCDF signature clue";
    else if (text.startsWith("SIMPLE")) detected = "FITS-like text header";

    const isFITS = /\.(fits|fit|fts)(\.fz)?$/i.test(fileName);
    if (isFITS) {
      const prefixOk = text.startsWith("SIMPLE  =") || text.startsWith("SIMPLE  ");
      const headerWindow = bytes.slice(0, Math.min(bytes.length, 65536));
      let endCardAt = -1;
      for (let i = 0; i + 80 <= headerWindow.length; i += 80) {
        if (ascii(headerWindow, i, i + 8).trim() === "END") { endCardAt = i; break; }
      }
      has(prefixOk, "FITS primary header starts with SIMPLE.", "FITS primary-header signature SIMPLE was not found at byte 0.");
      has(endCardAt >= 0, "An END card was found at an 80-byte card boundary in the inspected header window.", "No END card found in the first 64 KiB; header may be longer, malformed or not FITS.");
      has(true, "FITS filename noted; the compressed/uncompressed variant needs format-aware parsing.", "File variant unknown.");
      // Do not fail total-size checks for truncated sampling; whole size should be a multiple of 2880 in a completed standard FITS file.
      has(true, "Header check only: HDU/data padding and complete file length require full FITSverify.", "Full-file validation not performed.");
    } else if (ext === ".h5" || ext === ".hdf5" || ext === ".hdf") {
      has(detected === "HDF5 signature" || ext === ".hdf", "HDF5 magic detected, or HDF4 needs separate parser checks.", "HDF signature not recognized in inspected prefix.");
    } else if (ext === ".nc" || ext === ".nc4") {
      const ncMagic = starts(bytes,[0x43,0x44,0x46,0x01]) || starts(bytes,[0x43,0x44,0x46,0x02]) || detected === "HDF5 signature";
      has(ncMagic, "NetCDF classic or HDF5-based NetCDF-4 signature clue detected.", "No recognized NetCDF classic/HDF5 signature; use a NetCDF-aware reader.");
    } else if (ext === ".tif" || ext === ".tiff") {
      has(detected === "TIFF-like header", "TIFF byte-order and magic detected; GeoTIFF coordinate tags still need checking.", "TIFF signature not detected.");
    } else if (ext === ".jp2" || ext === ".j2k" || ext === ".j2c") {
      has(detected.includes("JPEG 2000"), "JPEG 2000 signature detected.", "JPEG 2000 signature not detected.");
    } else if (ext === ".zip" || ext === ".kmz" || ext === ".docx") {
      has(detected === "ZIP container", "ZIP container signature detected; member integrity has not been checked.", "ZIP signature not detected.");
    } else if (ext === ".grib" || ext === ".grb" || ext === ".grb2") {
      has(detected === "GRIB meteorological message", "GRIB marker detected; message count and product definitions need ecCodes.", "GRIB marker not detected.");
    } else if (ext === ".parquet") {
      has(detected === "Parquet signature", "PAR1 signature detected at the start; footer metadata and row groups not checked.", "PAR1 signature not found.");
    } else if (ext === ".xml" || ext === ".lbl" || ext === ".vrt") {
      has(detected.includes("XML") || detected.includes("PDS") || detected.includes("STEP"), "XML/text label clue detected; schema and referenced payload not validated.", "Expected XML/label clue not recognized.");
    } else if (ext === ".json" || ext === ".geojson" || ext === ".ndjson" || ext === ".jsonl") {
      has(detected === "JSON-like text" || ext === ".ndjson" || ext === ".jsonl", "JSON-like content detected; full syntax and schema checks follow where practical.", "JSON signature clue not recognized.");
    } else if (ext === ".bsp" || ext === ".bc" || ext === ".bpc" || ext === ".dsk" || ext === ".ek" || ext === ".tf" || ext === ".ti" || ext === ".tls" || ext === ".tm" || ext === ".tsc") {
      has(detected.includes("SPICE"), "SPICE identifier clue detected; use NAIF toolkit for semantic checks.", "SPICE marker is not visible in the inspected prefix; binary kernels may need a SPICE-aware inspector.");
    } else if (ext === ".gpkg") {
      has(detected === "SQLite / GeoPackage container", "SQLite header detected; required GeoPackage metadata tables not checked.", "SQLite container header not detected.");
    } else if (ext === ".arrow" || ext === ".feather") {
      has(detected === "Arrow IPC file", "Arrow IPC signature detected; file footer/schema not checked.", "Arrow IPC signature not detected.");
    } else if (ext === ".step" || ext === ".stp") {
      has(detected === "STEP CAD exchange file", "STEP header detected; geometry and full record structure not validated.", "STEP header not detected.");
    } else if ([".csv",".tsv",".txt",".dat",".tab",".ict",".yaml",".yml",".md"].includes(ext)) {
      has(bytes.length > 0, "Non-empty data/text file. Encoding, delimiter, row count and scientific schema are not certified.", "File appears empty.");
    } else {
      checks.push({ok: true, text: "No dedicated browser parser is configured for this format. Use the official tool in the format registry."});
    }
    return {detected, checks};
  }

  async function inspectLocalFile(file) {
    if (!file) return;
    const filename = $("#inspectionFilename");
    const badge = $("#inspectionBadge");
    const host = $("#inspectionResult");
    filename.textContent = file.name;
    badge.textContent = "INSPECTING";
    host.innerHTML = '<div class="status">Reading local file header…</div>';
    const header = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const result = detectSignature(header, file.name);
    const ext = extensionFor(file.name);
    const matchingFormat = findFormatByExtension(file.name);
    const checks = result.checks.map(check => '<div class="check-row ' + (check.ok ? "" : "warn") + '"><span class="dot">' + (check.ok ? "✓" : "△") + '</span><span>' + escapeHTML(check.text) + '</span></div>').join("");
    let jsonCheck = "";
    if (file.size <= MAX_TEXT_INSPECT_BYTES && /\.(json|geojson)$/i.test(file.name)) {
      try {
        const parsed = JSON.parse(await file.text());
        if (/\.geojson$/i.test(file.name)) {
          const validType = ["Feature","FeatureCollection","Point","MultiPoint","LineString","MultiLineString","Polygon","MultiPolygon","GeometryCollection"].includes(parsed.type);
          jsonCheck = '<div class="check-row ' + (validType ? "" : "warn") + '"><span class="dot">' + (validType ? "✓" : "△") + '</span><span>' + (validType ? "GeoJSON-like type field recognized." : "JSON syntax is valid but the GeoJSON type field is not recognized.") + '</span></div>';
        } else jsonCheck = '<div class="check-row"><span class="dot">✓</span><span>JSON syntax parsed successfully; product schema not validated.</span></div>';
      } catch (_) {
        jsonCheck = '<div class="check-row fail"><span class="dot">!</span><span>JSON parse failed. Encoding or syntax may be invalid.</span></div>';
      }
    } else if (file.size <= MAX_TEXT_INSPECT_BYTES && /\.(xml|lbl|vrt)$/i.test(file.name)) {
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const error = xml.querySelector("parsererror");
        jsonCheck = '<div class="check-row ' + (error ? "fail" : "") + '"><span class="dot">' + (error ? "!" : "✓") + '</span><span>' + (error ? "XML syntax check failed." : "XML parses as a document; PDS/GML/VRT schema and product rules not validated.") + '</span></div>';
      } catch (_) {}
    } else if (file.size > MAX_TEXT_INSPECT_BYTES && /\.(json|geojson|xml|lbl|vrt)$/i.test(file.name)) {
      jsonCheck = '<div class="check-row warn"><span class="dot">△</span><span>Text syntax check skipped because file exceeds the ' + formatBytes(MAX_TEXT_INSPECT_BYTES) + ' in-browser text-check ceiling.</span></div>';
    }
    let checksum = '<div class="metric-mini"><div><small>SHA-256</small><strong>Not computed</strong></div></div>';
    if (file.size <= MAX_HASH_BYTES && crypto?.subtle) {
      try {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        const hash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2,"0")).join("");
        checksum = '<div class="status">SHA-256: ' + hash + '</div>';
      } catch (_) {
        checksum = '<div class="status">SHA-256 not available in this browser context.</div>';
      }
    } else if (file.size > MAX_HASH_BYTES) {
      checksum = '<div class="status">SHA-256 skipped: file is larger than ' + formatBytes(MAX_HASH_BYTES) + '. Use a local checksum tool for large files.</div>';
    }
    const links = matchingFormat ? externalLink(matchingFormat.tool, "Open official validator") + externalLink(matchingFormat.docs, "Read format spec") : "";
    host.innerHTML = '<div class="metric-mini"><div><small>SIZE</small><strong>' + escapeHTML(formatBytes(file.size)) + '</strong></div><div><small>EXTENSION</small><strong>' + escapeHTML(ext) + '</strong></div><div><small>FILE TYPE CLUE</small><strong style="font-size:11px">' + escapeHTML(result.detected) + '</strong></div></div><div class="panel-sub">Initial checks (not certification)</div><div class="check-list">' + checks + jsonCheck + '</div>' + checksum + (matchingFormat ? '<div class="status">Catalogue match: ' + escapeHTML(matchingFormat.name) + ' · ' + escapeHTML(matchingFormat.group) + '</div>' : '<div class="status">No exact registry entry matched this suffix. Search the Format Atlas for a related product.</div>') + '<div class="controls">' + links + '<button type="button" class="btn small" id="clearInspection">Clear report</button></div><div class="callout">This report is a lightweight, local inspection. It does not certify standards compliance, data integrity, scientific validity, calibration or mission-specific semantics. Raw input files are not uploaded by the inspector.</div>';
    badge.textContent = result.checks.some(c => !c.ok) ? "REVIEW" : "INSPECTED";
    $("#clearInspection").addEventListener("click", () => {
      $("#inspectionFilename").textContent = "Awaiting file selection";
      $("#inspectionBadge").textContent = "READY";
      $("#inspectionResult").innerHTML = '<div class="empty">Your file report was cleared. No file was uploaded.</div>';
    });
  }

  function setBusy(button, busy, label = "Searching…") {
    if (!button) return;
    if (busy) { button.dataset.oldText = button.textContent; button.disabled = true; button.textContent = label; }
    else { button.disabled = false; button.textContent = button.dataset.oldText || button.textContent; }
  }
  function sourcePortal() { return SOURCE_MAP[$("#sourceSelect").value] || sources[0]; }
  function timeRange() {
    const a = $("#dateStart").value, b = $("#dateEnd").value;
    if (a && b && a > b) throw new Error("The start date must not be after the end date.");
    if (!a && !b) return "";
    return (a ? a + "T00:00:00Z" : "..") + "/" + (b ? b + "T23:59:59Z" : "..");
  }
  function buildSearchResult(item) {
    const title = item.title || item.name || item.id || "Untitled data product";
    const date = item.updated || item.datetime || item.time_start || item.start_datetime || item.date || "";
    const summary = item.summary || item.description || item.collection || item.properties?.description || item.platform || "";
    let links = [];
    if (item.portalUrl) links.push(externalLink(item.portalUrl, "Product page"));
    if (item.assetUrl) links.push(externalLink(item.assetUrl, "Data / asset"));
    if (item.docUrl && item.docUrl !== item.portalUrl) links.push(externalLink(item.docUrl, "Metadata"));
    return '<article class="result-item"><div class="source-top"><h4>' + escapeHTML(title) + '</h4><span class="tag">' + escapeHTML(date ? niceDate(date) : "Catalogue record") + '</span></div>' +
      (summary ? '<p>' + escapeHTML(summary.slice(0,500)) + '</p>' : '') +
      '<div class="result-foot"><span class="tag">' + escapeHTML(item.collection || item.short_name || item.id || "DATASET") + '</span><span class="source-links">' + links.join("") + '</span></div></article>';
  }
  async function fetchJSON(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {...init, signal: controller.signal, headers: {...(init.headers || {}), Accept: "application/json"}});
      if (!response.ok) throw new Error("Provider returned HTTP " + response.status + ".");
      return await response.json();
    } catch (err) {
      if (err.name === "AbortError") throw new Error("The provider did not respond within 20 seconds. Use the official portal link.");
      if (err instanceof TypeError) throw new Error("The provider API may block this browser origin (CORS), or the service may be temporarily unavailable. Use the official portal link.");
      throw err;
    } finally { clearTimeout(timer); }
  }
  async function searchNasa(query, limit, temporal) {
    const params = new URLSearchParams({keyword:query,page_size:String(limit),sort_key:"-start_date"});
    if (temporal) params.set("temporal", temporal);
    const data = await fetchJSON("https://cmr.earthdata.nasa.gov/search/granules.json?" + params.toString());
    const entries = data.feed?.entry || [];
    return entries.map(item => {
      const links = item.links || [];
      const dataLink = links.find(link => /\/data#/.test(link.rel || "") && link.href && !link.inherited);
      const pageLink = links.find(link => /browse|metadata|http:\/\/esipfed\.org\/ns\/fedsearch\/1\.1\/metadata#/.test(link.rel || "") && link.href);
      const useful = links.find(link => link.href && !/inherited|browse#|metadata#/.test(link.rel || "") && !/opendap/i.test(link.href));
      return {title:item.title, id:item.id, collection:item.collection_concept_id || item.collection_reference?.[0]?.name,
        time_start:item.time_start, summary:item.orbit_number ? "Orbit " + item.orbit_number : item.day_night_flag || "",
        portalUrl:pageLink?.href || ("https://search.earthdata.nasa.gov/search?q=" + encodeURIComponent(query)),
        assetUrl:dataLink?.href || useful?.href, docUrl:"https://cmr.earthdata.nasa.gov/search/concepts/" + encodeURIComponent(item.id)};
    });
  }
  async function searchCopernicus(query, limit, temporal) {
    const base = "https://stac.dataspace.copernicus.eu/v1";
    const all = await fetchJSON(base + "/collections?limit=200");
    const collections = all.collections || [];
    const q = normalize(query).split(/\s+/).filter(w => w.length > 2);
    const ranked = collections.map(c => {
      const text = normalize([c.id,c.title,c.description].join(" "));
      const score = q.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
      return {collection:c, score, text};
    }).filter(x => x.score > 0).sort((a,b)=>b.score-a.score).slice(0,8);
    if (!ranked.length) return collections.slice(0,limit).map(c=>({title:c.title || c.id,id:c.id,summary:c.description,collection:c.id,portalUrl:c.links?.find(l=>l.rel==="self")?.href || base+"/collections/"+encodeURIComponent(c.id),docUrl:"https://documentation.dataspace.copernicus.eu/APIs/STAC.html"}));
    const body = {collections:ranked.slice(0,5).map(x=>x.collection.id),limit};
    if (temporal) body.datetime = temporal;
    let data;
    try { data = await fetchJSON(base + "/search", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); }
    catch (_) { // A collection-level fallback still gives useful live data if item search is unavailable.
      return ranked.slice(0,limit).map(x=>({title:x.collection.title || x.collection.id,id:x.collection.id,collection:x.collection.id,summary:x.collection.description,
        portalUrl:base+"/collections/"+encodeURIComponent(x.collection.id),docUrl:"https://documentation.dataspace.copernicus.eu/APIs/STAC.html"}));
    }
    const features = data.features || [];
    return features.map(item=>{
      const assets=Object.values(item.assets || {});
      const asset=assets.find(a=>a.href && !/thumbnail|overview|preview/i.test(a.title || a.roles?.join(" ") || ""));
      const link=item.links?.find(l=>l.rel==="self")?.href || item.links?.find(l=>l.rel==="alternate")?.href;
      return {title:item.properties?.title || item.id,id:item.id,collection:item.collection,
        datetime:item.properties?.datetime || item.properties?.start_datetime,summary:item.properties?.platform || item.properties?.instruments?.join(", ") || "",
        portalUrl:link || base+"/collections/"+encodeURIComponent(item.collection),assetUrl:asset?.href,docUrl:"https://documentation.dataspace.copernicus.eu/APIs/STAC.html"};
    });
  }
  async function searchEumetsat(query, limit) {
    const data = await fetchJSON("https://api.eumetsat.int/data/browse/1.0.0/collections?format=json");
    const q = normalize(query).split(/\s+/).filter(w=>w.length>2);
    const list = (data.links || []).filter(link => link.rel === "collection/details" || link.datasetTitle).map(link => ({
      title:link.datasetTitle || link.title, id:link.title, summary:"Products in collection: " + (link.numberOfProducts ?? "not provided"),
      collection:link.title, portalUrl:link.href, docUrl:"https://user.eumetsat.int/resources/user-guides"
    }));
    const ranked=list.map(x=>({x,score:q.reduce((n,w)=>n+(normalize(x.title+" "+x.id).includes(w)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    return (ranked.length ? ranked.map(x=>x.x) : list).slice(0,limit);
  }
  function renderSearchResults(results) {
    $("#searchResults").innerHTML = results.length ? results.map(buildSearchResult).join("") : '<div class="empty">No matching records were found. Try different words, remove the date limit, or open the provider portal.</div>';
  }
  async function runCatalogueSearch() {
    const button=$("#runSearch");
    const provider=sourcePortal();
    const query=$("#queryInput").value.trim() || "Earth observation";
    const limit=Math.min(API_LIMIT,Math.max(1,Number($("#resultLimit").value)||10));
    try {
      const temporal=timeRange();
      setBusy(button,true,"Querying provider…");
      clearStatus("searchStatus");
      $("#searchResults").innerHTML='<div class="empty">Waiting for ' + escapeHTML(provider.name) + '…</div>';
      let results;
      if(provider.id==="nasa") results=await searchNasa(query,limit,temporal);
      else if(provider.id==="copernicus") results=await searchCopernicus(query,limit,temporal);
      else if(provider.id==="eumetsat") results=await searchEumetsat(query,limit);
      else throw new Error("This source currently has an official portal link but no anonymous live browser API integration. " + (provider.access || "Follow its access instructions."));
      renderSearchResults(results);
      showStatus("searchStatus","Search completed against "+provider.name+". "+results.length+" catalogue result(s) returned. A listed result or API record does not guarantee that the actual product download is anonymous or CORS-enabled.","success");
    } catch (err) {
      showStatus("searchStatus",(err.message || String(err))+" Open the official portal to continue.", "error");
      $("#searchResults").innerHTML='<div class="empty">The live browser search could not complete. This can happen when a provider is down or has a browser-origin restriction. No access control was bypassed.</div>';
    } finally { setBusy(button,false); }
  }

  function downloadBlob(blob, name) {
    const href=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=href; a.download=name || "space-data-download";
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),30000);
  }
  async function fetchDirectFile() {
    const raw=$("#fileUrl").value.trim();
    const button=$("#fetchUrl");
    let url;
    try {
      url=safeHttpURL(raw);
      if (!url.hostname.includes(".")) throw new Error("Use a fully qualified public host name.");
      setBusy(button,true,"Fetching file…"); clearStatus("fetchStatus");
      showStatus("fetchStatus","Connecting to "+url.hostname+"…");
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),30000);
      let response;
      try { response=await fetch(url.href,{mode:"cors",credentials:"omit",redirect:"follow",signal:controller.signal}); }
      finally { clearTimeout(timer); }
      if(!response.ok) throw new Error("The source returned HTTP "+response.status+".");
      const length=Number(response.headers.get("content-length") || 0);
      if(length>MAX_DOWNLOAD_BYTES) throw new Error("The server reports "+formatBytes(length)+", above the browser fetch ceiling of "+formatBytes(MAX_DOWNLOAD_BYTES)+". Use the provider's native downloader for large datasets.");
      const blob=await response.blob();
      if(blob.size>MAX_DOWNLOAD_BYTES) throw new Error("The downloaded file exceeded "+formatBytes(MAX_DOWNLOAD_BYTES)+". Use the provider's native downloader.");
      let name=decodeURIComponent(url.pathname.split("/").pop() || "space-data");
      const disposition=response.headers.get("content-disposition") || "";
      const match=disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      if(match) name=decodeURIComponent(match[1].replace(/"/g,"").trim());
      downloadBlob(blob,name);
      showStatus("fetchStatus","Saved "+name+" ("+formatBytes(blob.size)+"). The response was fetched through your browser from "+url.hostname+". A downloaded response is not automatically verified or trusted.","success");
    } catch(err) {
      const message=err.name==="AbortError" ? "The file request timed out. Use the provider's native download client." : (err.message || String(err));
      showStatus("fetchStatus",message+" If the source is reputable, open its official download page and use its instructions; the browser cannot bypass CORS or login.", "error");
    } finally {setBusy(button,false);}
  }

  function portalForSource() { const s=sourcePortal(); if(s?.portal) window.open(s.portal,"_blank","noopener,noreferrer"); }
  function wireEvents() {
    $("#formatSearch").addEventListener("input",()=>renderFormats(true));
    $("#formatCategory").addEventListener("change",()=>renderFormats(true));
    $("#formatAgency").addEventListener("change",()=>renderFormats(true));
    $("#loadMoreFormats").addEventListener("click",()=>{visibleFormats+=18;renderFormats();});
    $("#formatGrid").addEventListener("click",(event)=>{
      const button=event.target.closest("[data-extension]");
      if(!button)return;
      const ext=button.dataset.extension||"";
      $("#localFile").click();
      $("#inspectionFilename").textContent="Choose a file matching "+ext;
    });
    $("#runSearch").addEventListener("click",runCatalogueSearch);
    $("#openPortal").addEventListener("click",portalForSource);
    $("#sourceSelect").addEventListener("change",()=>{
      const s=sourcePortal(); selectedProvider=s;
      $("#openPortal").textContent="Open "+s.mark+" portal ↗";
      const button=$("#runSearch");
      button.disabled=!["nasa","copernicus","eumetsat"].includes(s.id);
      button.title=button.disabled?"No anonymous live browser search is configured for this portal.":"Run a public catalogue search.";
      $("#searchResults").innerHTML='<div class="empty">Selected '+escapeHTML(s.name)+'. '+escapeHTML(s.access)+' </div>';
    });
    $("#queryInput").addEventListener("keydown",e=>{if(e.key==="Enter")runCatalogueSearch();});
    $("#fetchUrl").addEventListener("click",fetchDirectFile);
    $("#openUrl").addEventListener("click",()=>{
      try{const url=safeHttpURL($("#fileUrl").value.trim());window.open(url.href,"_blank","noopener,noreferrer");}
      catch(err){showStatus("fetchStatus",err.message,"error");}
    });
    $("#localFile").addEventListener("change",async(event)=>{
      const file=event.target.files?.[0];
      if(file){try{await inspectLocalFile(file);}catch(err){showStatus("inspectionResult","Inspection failed: "+(err.message||String(err)),"error");}}
      event.target.value="";
    });
    const drop=$("#fileDrop");
    drop.addEventListener("dragover",e=>{e.preventDefault();drop.style.borderColor="var(--cyan)";});
    drop.addEventListener("dragleave",()=>{drop.style.borderColor="";});
    drop.addEventListener("drop",async e=>{e.preventDefault();drop.style.borderColor="";const file=e.dataTransfer.files?.[0];if(file){try{await inspectLocalFile(file);}catch(err){showStatus("inspectionResult","Inspection failed: "+(err.message||String(err)),"error");}}});
    $("#menuToggle").addEventListener("click",()=>$("#mainNav").classList.toggle("open"));
    $$("#mainNav a").forEach(a=>a.addEventListener("click",()=>$("#mainNav").classList.remove("open")));
    $$("[data-scroll]").forEach(button=>button.addEventListener("click",()=>$(button.dataset.scroll)?.scrollIntoView({behavior:"smooth"})));
  }

  async function init() {
    sources.forEach(s=>SOURCE_MAP[s.id]=s);
    try {
      const [formatResponse, sourceResponse, toolResponse]=await Promise.all([
        fetch("./data/formats.json",{cache:"no-cache"}),
        fetch("./data/sources.json",{cache:"no-cache"}),
        fetch("./data/tools.json",{cache:"no-cache"})
      ]);
      if(!formatResponse.ok)throw new Error("Format registry could not be loaded.");
      formats=await formatResponse.json();
      if(sourceResponse.ok) {
        const registry=await sourceResponse.json();
        registry.forEach(official=>{ if(SOURCE_MAP[official.id]) Object.assign(SOURCE_MAP[official.id],official); });
        // Add registry-only country portals not already included in fallback order.
        sources.splice(0,sources.length,...registry);
      }
      if(toolResponse.ok)toolItems=await toolResponse.json(); else toolItems=fallbackTools;
    } catch(err) {
      console.error("Registry load error:",err);
      $("#formatGrid").innerHTML='<div class="empty">Could not load data/formats.json. Make sure the site is opened through GitHub Pages or a local HTTP server, not a restrictive file:// origin.</div>';
      formats=[];
      toolItems=fallbackTools;
    }
    if(!toolItems.length)toolItems=fallbackTools;
    sources.forEach(s=>SOURCE_MAP[s.id]=s);
    populateFilters();
    renderSources();
    renderTools();
    wireEvents();
    selectedProvider=sourcePortal();
    $("#formatCount").textContent=formats.length+" / "+new Set(formats.flatMap(f=>f.extensions||[])).size;
  }
  init();
})();