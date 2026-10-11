/**
 * One-off helper: move ClubboxApp method bodies into app/*Ctl.ts modules.
 * Run: node scripts/split-main.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mainPath = path.join(root, 'src', 'main.ts');
const appDir = path.join(root, 'src', 'app');
fs.mkdirSync(appDir, { recursive: true });

const src = fs.readFileSync(mainPath, 'utf8');
const classMatch = src.match(/class ClubboxApp \{[\s\S]*\n\}\n\n\/\/ Instantiate/);
if (!classMatch) {
  console.error('ClubboxApp class not found');
  process.exit(1);
}

const bootstrap = `import './style.css';
import { ClubboxApp } from './app/clubboxApp';

new ClubboxApp();
`;

const header = src.slice(0, src.indexOf('class ClubboxApp'));
const classBody = classMatch[0].replace(/\n\}\n\n\/\/ Instantiate.*/, '\n}\n');

const clubboxAppTs = `${header.replace(/\.\/api\//g, '../api/').replace(/\.\/audio\//g, '../audio/').replace(/\.\/shortcuts/g, '../shortcuts').replace(/\.\/i18n/g, '../i18n').replace(/\.\/ui\//g, '../ui/')}
import { wireAppControllers } from './app/wireControllers.ts';

export ${classBody.replace('class ClubboxApp', 'class ClubboxApp')}

wireAppControllers(ClubboxApp);
`;

fs.writeFileSync(path.join(appDir, 'clubboxApp.ts'), clubboxAppTs);
fs.writeFileSync(mainPath, bootstrap);

console.log('Wrote src/app/clubboxApp.ts and slim src/main.ts');
