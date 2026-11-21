import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Script } from "node:vm";
import { crc32 } from "node:zlib";
import { build } from "esbuild";

const MANIFEST_MAX_BYTES = 128 * 1024;
const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;
const STYLE_MAX_BYTES = 256 * 1024;
const ZIP_MAX_BYTES = 64 * 1024 * 1024;

const root = path.resolve(import.meta.dirname, "..");

async function writeAtomic(destination, bytes) {
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Deterministic STORE ZIP writer compatible with codexhost's strict archive reader
 * (STORE method, regular file mode, UTF-8 names, no ZIP64 or extra fields).
 */
function createStoreZip(entries) {
  // Fixed DOS timestamp: 2026-01-01 00:00:00 UTC
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, bytes } of [...entries].sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const nameBytes = Buffer.from(name, "utf8");
    const checksum = crc32(bytes) >>> 0;
    const size = bytes.byteLength;

    const localHeader = Buffer.alloc(30 + nameBytes.byteLength);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(0, 8); // compression method: STORE
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBytes.byteLength, 26);
    localHeader.writeUInt16LE(0, 28); // extra length
    nameBytes.copy(localHeader, 30);

    localParts.push(localHeader, bytes);

    const centralHeader = Buffer.alloc(46 + nameBytes.byteLength);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // version made by: Unix, 2.0
    centralHeader.writeUInt16LE(20, 6); // version needed: 2.0
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(0, 10); // compression method: STORE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBytes.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attrs
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file external attrs
    centralHeader.writeUInt32LE(offset, 42);
    nameBytes.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.byteLength + size;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // start disk
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.byteLength, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function parseArgs(argv) {
  let packPath;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--pack") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        packPath = path.resolve(root, next);
        index += 1;
      } else {
        packPath = path.resolve(
          root,
          "..",
          "codexhost-sidebar-delegation-badges-dist",
          "sidebar-delegation-badges.zip",
        );
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { packPath };
}

const { packPath } = parseArgs(process.argv.slice(2));

const manifestBytes = await readFile(path.join(root, "manifest.json"));
if (manifestBytes.byteLength > MANIFEST_MAX_BYTES) {
  throw new Error(`manifest.json exceeds ${MANIFEST_MAX_BYTES} bytes`);
}
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (
  manifest.manifestVersion !== 1 ||
  manifest.desktopApi !== 1 ||
  manifest.desktop?.script !== "desktop.js" ||
  (manifest.desktop?.style && manifest.desktop.style !== "desktop.css")
) {
  throw new Error("manifest.json must declare manifestVersion 1, desktopApi 1, and desktop.js");
}

const { outputFiles } = await build({
  entryPoints: [path.join(root, "src", "index.ts")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: "es2022",
  legalComments: "inline",
  banner: {
    js: "/*! codexhost-sidebar-delegation-badges | Copyright (c) 2026 lpmasser & BytePioneer-AI/codex-host contributors | LGPL-3.0-only */",
  },
});

const [script] = outputFiles;
if (!script || outputFiles.length !== 1) {
  throw new Error("Expected a single bundled script from esbuild");
}
if (script.contents.byteLength > SCRIPT_MAX_BYTES) {
  throw new Error(`desktop.js exceeds ${SCRIPT_MAX_BYTES} bytes`);
}
// Validate syntax under the exact wrapper used by the codexhost registry validator.
new Script(`(function(define) { "use strict";\n${script.text}\n})`);

const styleBytes = manifest.desktop.style
  ? await readFile(path.join(root, "src", "desktop.css"))
  : undefined;
if (styleBytes && styleBytes.byteLength > STYLE_MAX_BYTES) {
  throw new Error(`desktop.css exceeds ${STYLE_MAX_BYTES} bytes`);
}

await writeAtomic(path.join(root, "desktop.js"), script.contents);
if (styleBytes) {
  await writeAtomic(path.join(root, "desktop.css"), styleBytes);
}
console.log(
  `Built desktop.js (${script.contents.byteLength} B)${styleBytes ? ` and desktop.css (${styleBytes.byteLength} B)` : ""}`,
);

if (packPath) {
  const entries = [
    { name: "manifest.json", bytes: manifestBytes },
    { name: "desktop.js", bytes: Buffer.from(script.contents) },
    ...(styleBytes ? [{ name: "desktop.css", bytes: styleBytes }] : []),
  ];
  const extraImages = new Set(Array.isArray(manifest.screenshots) ? manifest.screenshots : []);
  if (typeof manifest.icon === "string") extraImages.add(manifest.icon);
  for (const resource of extraImages) {
    entries.push({ name: resource, bytes: await readFile(path.join(root, resource)) });
  }
  const zipBytes = createStoreZip(entries);
  if (zipBytes.byteLength > ZIP_MAX_BYTES) {
    throw new Error(`Archive exceeds ${ZIP_MAX_BYTES} bytes`);
  }
  await mkdir(path.dirname(packPath), { recursive: true });
  await writeAtomic(packPath, zipBytes);
  const sha256 = createHash("sha256").update(zipBytes).digest("hex");
  console.log(`Packed ${packPath} (${zipBytes.byteLength} B) sha256=${sha256}`);
}
