const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const lockJsonPath = path.join(root, "package-lock.json");
const preloadPath = path.join(root, "preload.js");
const rendererIndexPath = path.join(root, "renderer", "index.html");
const readmePath = path.join(root, "README.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function replaceInFile(filePath, matcher, replacer) {
  const before = fs.readFileSync(filePath, "utf8");
  const after = before.replace(matcher, replacer);
  if (before !== after) {
    fs.writeFileSync(filePath, after, "utf8");
    return true;
  }
  return false;
}

function sync() {
  const pkg = readJson(packageJsonPath);
  const version = pkg.version;

  if (!version) {
    throw new Error("package.json version is missing");
  }

  const lock = readJson(lockJsonPath);
  lock.version = version;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = version;
  }
  writeJson(lockJsonPath, lock);

  // Keep preload appVersion fallback aligned for any external usage.
  replaceInFile(
    preloadPath,
    /appVersion:\s*packageVersion,/g,
    "appVersion: packageVersion,",
  );

  // Update visible fallback version text in About page.
  replaceInFile(
    rendererIndexPath,
    /(<span id="about-version"[^>]*>\s*)[\d.]+(\s*<\/span\s*>)/m,
    `$1${version}$2`,
  );

  // README artifacts versions (common names)
  replaceInFile(
    readmePath,
    /SYNS(?: Man)? Setup\s+\d+\.\d+\.\d+\.exe/g,
    `SYNS Man Setup ${version}.exe`,
  );
  replaceInFile(
    readmePath,
    /SYNS(?: Man)?\s+\d+\.\d+\.\d+\.exe/g,
    `SYNS Man ${version}.exe`,
  );
  replaceInFile(
    readmePath,
    /syns_\d+\.\d+\.\d+_amd64\.deb/g,
    `syns_${version}_amd64.deb`,
  );
  replaceInFile(
    readmePath,
    /SYNS(?: Man)?-\d+\.\d+\.\d+\.AppImage/g,
    `SYNS Man-${version}.AppImage`,
  );

  console.log(`Version sync complete: ${version}`);
}

sync();
