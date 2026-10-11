# SPACE — Mission Data Observatory

**SPACE** is an independent, browser-first space-science data discovery and file-inspection website. It is designed as a distinct orbital console—not part of ReData.

## Features

- **Format Atlas:** 59 grouped format records and 143 distinct extension / protocol / national-standard labels across astronomy, planetary science, Earth observation, telemetry, SPICE, geospatial science, scientific computing and aerospace engineering.
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

This is a static website. The root `index.html` loads `app.js` and the JSON registries in `data/`; the favicon is `assets/space.svg`.

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

## Reusing tools and data

The website links to upstream programs, APIs and documentation rather than copying closed implementations. Before incorporating upstream code into SPACE, review its current LICENSE file, dependencies, attribution and redistribution conditions. Data licenses and software licenses are separate; follow the selected provider's data-use terms, rate limits, login requirements and attribution conditions.

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
