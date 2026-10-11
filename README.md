# SPACE — Mission Data Observatory

**SPACE** is an independent, browser-first space-science data discovery and file-inspection website. It is designed as a distinct orbital console—not part of ReData.

## Features

- **Format Atlas:** 59 grouped format records and 143 distinct extension / protocol / national-standard labels across astronomy, planetary science, Earth observation, telemetry, SPICE, geospatial science, scientific computing and aerospace engineering.
- **Universal File Viewer:** routes files to native image/audio/video previews, a PDF.js page viewer, CSV/TSV tables, JSON/XML/YAML viewers, SheetJS workbook preview, GeoTIFF raster rendering, FITS primary-image/header preview, NetCDF classic metadata and samples, HDF5/NetCDF-4/NeXus dataset-tree inspection, Parquet/GeoParquet schema and bounded row sampling, Arrow IPC/Feather, SQLite tables with read-only SELECT queries, GeoJSON, KML, GPX and KMZ feature/coordinate preview, GLB/glTF model viewing, interactive STL/OBJ/PLY/3MF/DAE/3DS/VRML mesh viewing, STEP/IGES/BREP triangulated CAD previews, Shapefile-in-ZIP to GeoJSON, ZIP/KMZ/GZIP/TAR/TAR.GZ browsing and entry extraction and a generic hex/signature viewer for specialist science binaries.
- **Browser Converter:** image re-encoding (PNG/JPEG/WebP), PDF page-to-image export, CSV/TSV/JSON table transforms, JSON formatting/minification, YAML ↔ JSON, simple XML ↔ JSON, selected spreadsheet-sheet exports, Parquet sample export, GeoJSON feature-property CSV export, STL ↔ OBJ mesh export, STEP/IGES/BREP triangulated viewing and mesh export, KML/GPX/KMZ → GeoJSON/CSV, Shapefile ZIP → GeoJSON/CSV, SQLite SELECT result exports to CSV/TSV/JSON/XLSX, Arrow/Parquet sample exports, GZIP decompression and ZIP packaging. Export options are specific to the detected file type.
- **Local File Inspector:** basic signature clues, limited JSON/XML checks and SHA-256 checksums for reasonably sized files. Files are not uploaded by this inspector.
- **Mission Data Finder:** live browser-based searches against the documented public NASA Common Metadata Repository (CMR), Copernicus Data Space STAC catalogue and EUMETSAT collection browse API.
- **Direct File Fetch:** download a URL supplied by the user through the browser if the HTTPS source allows CORS. The browser cannot bypass account requirements or cross-origin restrictions.
- **Agency Directory:** official entry points for NASA, ESA/Copernicus, ISRO, JAXA, China NSSDC/CNSA, Roscosmos, Canada, NOAA, EUMETSAT and other international archives.
- **Tool Locker:** links to official validators and open-source readers, with licensing reminders.

## Deploy on GitHub Pages

1. Open the repository Settings.
2. Choose **Pages**.
3. Under build and deployment, select **Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`.
5. Save, wait for the GitHub Pages deployment, and open the site URL shown by GitHub.

This is a static website. The root `index.html` loads `app.js`, `viewer.js` and the JSON registries in `data/`; the favicon is `assets/space.svg`. The design uses a soft light mist-blue/sage theme rather than a dark dashboard.

## Live APIs and access boundaries

| Provider | Integration | Access caveat |
| --- | --- | --- |
| NASA CMR | Live granule metadata search | Some data links need Earthdata Login or have product-specific restrictions. |
| Copernicus Data Space STAC | Live collection discovery and item search | Asset download rules, availability and request limits are provider-controlled. |
| EUMETSAT browse API | Live collection browse/search | Product download may need user registration or EUMDAC. |
| ISRO Bhoonidhi | Official portal and API reference | Official API requires registered credentials. Credentials are deliberately not collected or embedded here. |
| JAXA DARTS | Official archive link | Use each mission's data and software instructions. |
| China NSSDC / CNSA | Official national portals and data access services | Some datasets may require approval or principal-investigator permission. |
| Roscosmos | Official agency entry point | No universal anonymous Roscosmos data API is claimed by this site; availability is mission-specific. |
| Canada EODMS, NOAA, ESA PSA and others | Official portals and documentation | Account, order, license and delivery rules vary by service. |

## Validation model

The inspector is **not** a general-purpose certified validator. It checks selected signatures and can parse some small XML/JSON files. Full validation should use the versioned official software for the target standard: for example, FITSverify for FITS, NASA PDS Validate for PDS products, SPICE Toolkit for SPICE kernels, CDF tools for CDF, NetCDF tools for NetCDF, HDF tools for HDF and ecCodes for GRIB.

A detected extension or magic signature is not proof of file integrity, standards compliance, calibration or scientific correctness.

## Viewer and conversion boundaries

The viewer offers a format-aware route for every entry in the format registry. That does **not** mean every proprietary, mission-specific or scientific binary has a universal in-browser decoder. When a full reader is not integrated, SPACE shows a safe signature/hex window, explains the limitation and points to the dedicated upstream reader or validator. Current scientific previews are deliberately scoped: FITS rendering handles an uncompressed primary 2-D image plane; GeoTIFF uses a downsampled contrast-stretched display; PDF export rasterizes the current page; workbook exports use selected-sheet display values and do not preserve workbook styling, macros or formula fidelity. These previews must not be substituted for scientific analysis, validated data conversion or official compliance checks.

The browser viewer and converter process the chosen file locally. The page fetches third-party JavaScript libraries from their published CDNs as needed; the selected file is not sent to those CDNs by the SPACE code. NetCDF classic support uses `netcdfjs`; HDF5 / NetCDF-4 / NeXus inspection uses `h5wasm`; Parquet uses `hyparquet`; and 3D mesh viewing uses Three.js loaders and exporters. CAD STEP/IGES/BREP previews use `occt-import-js` / OpenCascade WebAssembly, which triangulates CAD geometry for display and is not an exact parametric export; shapefile ZIPs use `shpjs` to load features locally. The Tool Locker records upstream repositories and licenses for these tools. The browser may still make ordinary requests to the website/CDN, and provider APIs are contacted only when the matching catalogue search is initiated. Keep the site online and use a modern browser for dynamic library loading. Files larger than the documented safety limits should be processed with specialist desktop tools instead of being forced into browser memory.

## Reusing tools and data

SPACE integrates documented browser libraries from their published CDN builds rather than copying proprietary implementations: Mozilla PDF.js (Apache-2.0), Papa Parse (MIT), SheetJS Community Edition (Apache-2.0), GeoTIFF.js (MIT), js-yaml (MIT), fflate (MIT), Google model-viewer (Apache-2.0), netcdfjs (MIT), h5wasm (NIST-developed software with its own notice), hyparquet (MIT), Three.js and loaders (MIT), and the astrojs/fitsjs project (MIT). Their official repositories and license notes are listed in the Tool Locker and `data/tools.json`. Libraries are loaded on demand for selected file types. UMD scripts with stable published assets use subresource-integrity hashes; dynamic ESM imports and WebAssembly payloads cannot all be verified with the page's simple script-integrity attribute. Review each upstream license and deployment policy before self-hosting or bundling them; pinned CDN URLs reduce unexpected major-version changes but do not remove supply-chain risk. Data licenses and software licenses are separate; follow provider terms, rate limits, login requirements and attribution conditions.

## Local development

Because the site loads JSON registries using `fetch()`, run it through a local HTTP server rather than opening `index.html` using a `file://` URL. For example:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## References

- NASA CMR API: https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
- Copernicus STAC API: https://documentation.dataspace.copernicus.eu/APIs/STAC.html
- EUMETSAT browse API: https://api.eumetsat.int/data/browse/
- FITSverify: https://heasarc.gsfc.nasa.gov/docs/software/ftools/fitsverify/
- NASA PDS tools: https://pds.nasa.gov/tools/about/
- NAIF SPICE Toolkit: https://naif.jpl.nasa.gov/naif/toolkit.html
- ISRO Bhoonidhi API: https://bhoonidhi.nrsc.gov.in/bhoonidhi-api/
- JAXA DARTS format FAQ: https://darts.isas.jaxa.jp/en/faq
- China NSSDC: https://www.nssdc.ac.cn/nssdc_en/html/index.html
