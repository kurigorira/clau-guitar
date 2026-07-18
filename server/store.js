// シンプルなJSONファイルストア（1レコード=1ファイル）。
// 単一ユーザー・ローカル利用が前提なので、DBを立てずに人間が読める形で保存する。
// バックアップは data/ フォルダをコピーするだけでOK。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const dirFor = (collection) => path.join(DATA_DIR, collection);

export async function ensureDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(dirFor('scores'), { recursive: true });
  await fs.mkdir(dirFor('documents'), { recursive: true });
}

export function newId() {
  return crypto.randomUUID();
}

export async function list(collection) {
  const dir = dirFor(collection);
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const items = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      items.push(JSON.parse(raw));
    } catch {
      // 壊れたファイルはスキップ
    }
  }
  return items;
}

export async function get(collection, id) {
  try {
    const raw = await fs.readFile(path.join(dirFor(collection), `${id}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function put(collection, record) {
  await fs.mkdir(dirFor(collection), { recursive: true });
  const file = path.join(dirFor(collection), `${record.id}.json`);
  await fs.writeFile(file, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export async function remove(collection, id) {
  try {
    await fs.unlink(path.join(dirFor(collection), `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
