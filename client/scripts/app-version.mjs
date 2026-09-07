// Setzt Versionsnummer und Build-Nummer in beiden nativen Projekten aus client/package.json.
//   npm run version -- 1.2.0        -> Version 1.2.0, Build-Nummer +1
//   npm run version -- 1.2.0 42     -> Version 1.2.0, Build-Nummer 42
// Die Build-Nummer muss bei jedem Store-Upload steigen (Android versionCode, iOS CFBundleVersion).
import { readFileSync, writeFileSync } from 'node:fs';

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = process.argv[2] || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`Ungültige Version: ${version} (erwartet z. B. 1.2.0)`); process.exit(1); }

const gradlePath = new URL('../android/app/build.gradle', import.meta.url);
let gradle = readFileSync(gradlePath, 'utf8');
const current = Number((gradle.match(/versionCode (\d+)/) || [0, 0])[1]);
const build = process.argv[3] ? Number(process.argv[3]) : current + 1;
if (!Number.isInteger(build) || build <= 0) { console.error(`Ungültige Build-Nummer: ${process.argv[3]}`); process.exit(1); }

gradle = gradle.replace(/versionCode \d+/, `versionCode ${build}`).replace(/versionName "[^"]*"/, `versionName "${version}"`);
writeFileSync(gradlePath, gradle);

const pbxPath = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
let pbx = readFileSync(pbxPath, 'utf8');
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(pbxPath, pbx);

pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version ${version}, Build ${build} -> android/app/build.gradle, ios/App/App.xcodeproj, package.json`);
