/**
 * SVG → PNG 変換スクリプト
 * マスター SVG (public/icons/icon.svg) から 16x16, 48x48, 128x128 の PNG を生成する。
 * @resvg/resvg-js を使用して SVG を正確にラスタライズする。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const ICONS_DIR = resolve(PROJECT_ROOT, "public/icons");
const SVG_PATH = resolve(ICONS_DIR, "icon.svg");
const SIZES = [16, 48, 128];

async function generateWithResvg() {
	const { Resvg } = await import("@resvg/resvg-js");
	const svgData = readFileSync(SVG_PATH, "utf-8");

	for (const size of SIZES) {
		const resvg = new Resvg(svgData, {
			fitTo: { mode: "width", value: size },
		});
		const rendered = resvg.render();
		const pngBuffer = rendered.asPng();
		const outPath = resolve(ICONS_DIR, `icon-${size}.png`);
		writeFileSync(outPath, pngBuffer);
		console.log(`Generated: icon-${size}.png (${pngBuffer.length} bytes)`);
	}
}

async function generateWithSharp() {
	const sharp = (await import("sharp")).default;
	const svgData = readFileSync(SVG_PATH);

	for (const size of SIZES) {
		const pngBuffer = await sharp(svgData).resize(size, size).png().toBuffer();
		const outPath = resolve(ICONS_DIR, `icon-${size}.png`);
		writeFileSync(outPath, pngBuffer);
		console.log(`Generated: icon-${size}.png (${pngBuffer.length} bytes)`);
	}
}

async function main() {
	console.log(`Source SVG: ${SVG_PATH}`);
	console.log(`Output dir: ${ICONS_DIR}`);
	console.log("");

	// Try @resvg/resvg-js first, then sharp as fallback
	try {
		await generateWithResvg();
		console.log("\nAll icons generated successfully with @resvg/resvg-js!");
		return;
	} catch (e) {
		console.log(`@resvg/resvg-js not available: ${e.message}`);
	}

	try {
		await generateWithSharp();
		console.log("\nAll icons generated successfully with sharp!");
		return;
	} catch (e) {
		console.log(`sharp not available: ${e.message}`);
	}

	console.error("\nERROR: No SVG-to-PNG conversion library available.");
	console.error("Install one of: @resvg/resvg-js, sharp");
	process.exit(1);
}

main();
