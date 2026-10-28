# AutoTrader UK Image Downloader

A userscript that adds a **Download All Images** button to [AutoTrader UK](https://www.autotrader.co.uk/) car advert pages and saves the highest quality version of every photo in the gallery.

## Features

- One-click download of every photo in an advert, including ones that only load when the gallery is opened
- Picks the largest available version of each image automatically
- Sensible file names: `<car title>_<advert id>_01.jpg`, `..._02.jpg`, and so on
- Progress shown on the button while it works
- Works in Firefox and Chromium-based browsers (including Brave)

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (Firefox, Chrome, Brave, Edge, Safari)
   - [Violentmonkey](https://violentmonkey.github.io/) should also work
2. Install the script:
   - **Greasy Fork:** `https://greasyfork.org/scripts/602690`
   - **Or directly from GitHub:** [autotrader-download-all-images.user.js](https://raw.githubusercontent.com/firecul/autotrader-uk-image-downloader/main/autotrader-download-all-images.user.js)
3. Confirm the installation when your userscript manager prompts you.

## Usage

1. Open any car advert, for example `https://www.autotrader.co.uk/car-details/...`
2. Click **Download All Images**, which appears just above the photo gallery.
3. The script briefly opens and pages through the gallery to load every photo, then downloads them one by one.

The images are saved to your browser's normal downloads folder.

### Tips

- **Browser prompts:** Chromium browsers (Brave, Chrome) may ask once whether to allow multiple downloads. Choose *Allow*.
- **Permission prompt:** Tampermonkey may ask for permission to connect to `atcdn.co.uk` (AutoTrader's image host). Choose *Always allow*.
- **Shift-click:** Holding Shift while clicking also includes every AutoTrader image found in the page source. This is a fallback and may pick up photos of other cars (such as "similar cars"), so only use it if a normal click misses images.

## Troubleshooting

If images are missing or the button doesn't appear:

1. Open the script in your userscript manager and set `const DEBUG = false;` to `true`.
2. Reload the advert page, open the browser console (F12) and click the button.
3. Look for lines starting with `[AT-DL]`. They show how many images were found by each method.
4. [Open an issue](https://github.com/firecul/autotrader-uk-image-downloader/issues) and include those lines plus the advert URL.

AutoTrader may change its page layout or image hosting at any time, which can break the script. Issue reports are welcome.

## How it works

1. Finds the photos listed in the page's embedded data and in the gallery markup.
2. Opens the gallery viewer and steps through it so lazily loaded photos are discovered, then closes it.
3. For each photo, checks several size variants on AutoTrader's image CDN and keeps the one with the largest file size.
4. Downloads each file through the userscript manager's cross-origin request API and saves it with a clean file name.

## Disclaimer

This project is not affiliated with or endorsed by Auto Trader Limited. Photos on AutoTrader belong to the sellers or photographers who took them. Please use this tool for personal purposes, such as keeping a record of a car you're considering, and respect the copyright of the images and AutoTrader's terms of use.

## License

[MIT](LICENSE)