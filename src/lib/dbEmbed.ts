import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listPetsWithSkill, type PetSkillHolder } from './pets';
import { CRAFT_SKILL_HREF } from './craftSkills';

export interface DbHtml {
  style: string;
  body: string;
  /**
   * 從 body 抽出的 inline script 內容。
   * 注意：Astro set:html 插入的 <script> 不會執行，必須由 DbEmbed 另行注入。
   */
  scripts: string[];
}

/**
 * 生產技能「專屬詳情」改連站內配方表；
 * 技能詳情頁頂部補一條「查看配方」捷徑。
 */
function rewriteCraftSkillLinks(body: string, relPath: string): string {
  let next = body;
  // 長名優先，避免「伐木」吃掉「伐木體驗」的路徑前綴
  const skills = Object.entries(CRAFT_SKILL_HREF).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [skill, href] of skills) {
    // 總覽卡：僅精確匹配 /技能總覽/{技能名}" 
    next = next.replace(
      new RegExp(`href="/技能總覽/${escapeRegExp(skill)}"`, 'g'),
      `href="${href}"`,
    );
    // 文案：專屬詳情 → 配方一覽
    next = next.replace(
      new RegExp(
        `(href="${escapeRegExp(href)}"[^>]*class="skill-detail-link"[^>]*>)\\s*專屬詳情\\s*(</a>)`,
        'g',
      ),
      '$1配方一覽$2',
    );
    next = next.replace(
      new RegExp(
        `(class="skill-detail-link"[^>]*href="${escapeRegExp(href)}"[^>]*>)\\s*專屬詳情\\s*(</a>)`,
        'g',
      ),
      '$1配方一覽$2',
    );
  }

  // 詳情頁 skills/造槍.html → 頁首捷徑
  const skillPage = relPath.match(/^skills\/(.+)\.html$/);
  if (skillPage) {
    const skill = skillPage[1];
    const href = CRAFT_SKILL_HREF[skill];
    if (href && !next.includes('data-craft-recipe-link')) {
      const banner =
        `<div data-craft-recipe-link class="craft-recipe-banner" style="margin:0 0 12px;padding:10px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;font-size:14px;">` +
        `此技能的站內配方表：` +
        `<a href="${href}" style="font-weight:700;color:#2e7d32;">${href.replace(/^\//, '')}</a>` +
        `</div>`;
      // 插在第一個內容容器前
      if (/<div[^>]*id="wrapper"/i.test(next)) {
        next = next.replace(/(<div[^>]*id="wrapper"[^>]*>)/i, `$1${banner}`);
      } else {
        next = banner + next;
      }
    }
  }
  return next;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 修正技能／道具 HTML 內錯誤的相對圖路徑 */
function fixAssetPaths(html: string): string {
  return (
    html
      // ../cg-originmood-dc.github.io/public/img/... → /img/...
      .replace(
        /(?:\.\.\/)*(?:cg-originmood-dc\.github\.io\/)?public\/img\//g,
        '/img/',
      )
      // 偶發：./public/img 或 /public/img
      .replace(/(?:^|["'(=\s])\.?\/public\/img\//g, (m) =>
        m.replace(/\.?\/public\/img\//, '/img/'),
      )
      // 壞掉的 onerror 會對不存在圖狂刷 404，改成隱藏破圖
      .replace(
        /\s*onerror="this\.src='[^']*'"/gi,
        ' onerror="this.style.visibility=\'hidden\'"',
      )
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPetChip(p: PetSkillHolder, showLevel = false): string {
  const href = `/寵物資料/${encodeURIComponent(p.name)}`;
  const src = p.image.startsWith('/') ? p.image : `/${p.image}`;
  const title = p.skillLabel || p.name;
  const lvTag =
    showLevel && p.level != null
      ? `<span class="pet-skill-lv">LV${p.level}</span>`
      : '';
  return (
    `<a href="${href}" class="pet-skill-chip" title="${escapeHtml(title)}">` +
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'" />` +
    `<span>${escapeHtml(p.name)}</span>` +
    lvTag +
    `</a>`
  );
}

function groupPetsByLevel(
  holders: PetSkillHolder[],
): Map<number | 'unknown', PetSkillHolder[]> {
  const map = new Map<number | 'unknown', PetSkillHolder[]>();
  for (const h of holders) {
    const key: number | 'unknown' = h.level ?? 'unknown';
    const arr = map.get(key) ?? [];
    arr.push(h);
    map.set(key, arr);
  }
  return map;
}

/**
 * 在等級效果表每一列寫入「持有寵物」。
 * - 若表頭尚無此欄則新增
 * - 若資料列最後一欄已是寵物欄則覆寫（避免與靜態 HTML 重複）
 * - 不改動既有效果文字
 */
function injectPetsIntoLevelTable(
  tableHtml: string,
  byLevel: Map<number | 'unknown', PetSkillHolder[]>,
): string {
  let html = tableHtml;
  const headerHasPets = /持有寵物/.test(html);

  // thead 補「持有寵物」欄
  if (!headerHasPets) {
    html = html.replace(
      /(<thead[\s\S]*?<tr[^>]*>)([\s\S]*?)(<\/tr>\s*<\/thead>)/i,
      (_m, open, cells, close) => `${open}${cells}<th>持有寵物</th>${close}`,
    );
  }

  // 每一資料列：辨識 LV n，寫入／覆寫寵物 cell
  html = html.replace(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi, (full, attrs, inner) => {
    if (/<th[\s>]/i.test(inner)) return full; // 表頭列
    const lvMatch =
      inner.match(/>\s*LV\s*(\d+)\s*</i) ||
      inner.match(/\bLV\s*(\d+)\b/i) ||
      inner.match(/\bLv\s*(\d+)\b/);
    if (!lvMatch) return full;
    const lv = Number(lvMatch[1]);
    const pets = byLevel.get(lv) ?? [];
    const petCell =
      pets.length > 0
        ? `<td class="level-pets"><div class="pet-chip-wrapper pet-chip-wrapper--compact">${pets
            .map((p) => renderPetChip(p, false))
            .join('')}</div></td>`
        : `<td class="level-pets level-pets--empty">—</td>`;

    // 已有 level-pets → 只替換該格
    if (/class="level-pets"/i.test(inner)) {
      return `<tr${attrs}>${inner.replace(
        /<td class="level-pets"[\s\S]*?<\/td>/i,
        petCell,
      )}</tr>`;
    }

    // 表頭本來就有「持有寵物」→ 覆寫最後一欄（靜態 HTML 舊資料）
    if (headerHasPets) {
      const tds = [...inner.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
      if (tds.length > 0) {
        const last = tds[tds.length - 1];
        const idx = last.index ?? 0;
        const newInner =
          inner.slice(0, idx) + petCell + inner.slice(idx + last[0].length);
        return `<tr${attrs}>${newInner}</tr>`;
      }
    }

    // 否則追加新欄
    return `<tr${attrs}>${inner}${petCell}</tr>`;
  });

  return html;
}

/** 底部：按等級分組列出（無等級表時的主要展示；有表時只列未標等級） */
function buildGroupedPetSection(
  holders: PetSkillHolder[],
  byLevel: Map<number | 'unknown', PetSkillHolder[]>,
  opts: { onlyUnknown?: boolean; title?: string },
): string {
  const onlyUnknown = opts.onlyUnknown ?? false;
  const keys = [...byLevel.keys()].sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a - b;
  });

  const blocks: string[] = [];
  for (const key of keys) {
    if (onlyUnknown && key !== 'unknown') continue;
    const pets = byLevel.get(key) ?? [];
    if (!pets.length) continue;
    const label = key === 'unknown' ? '等級未標註' : `LV ${key}`;
    blocks.push(
      `<div class="pet-level-group">` +
        `<div class="pet-level-group__title">${label}` +
        `<span class="pet-level-group__count">（${pets.length}）</span></div>` +
        `<div class="pet-chip-wrapper">${pets
          .map((p) => renderPetChip(p, false))
          .join('')}</div>` +
        `</div>`,
    );
  }

  if (blocks.length === 0) {
    if (onlyUnknown) return ''; // 全部已掛在等級表上
    blocks.push(
      '<span style="color:#666;">（專屬寵物資料中尚無登錄持有此技能的寵物）</span>',
    );
  }

  const title =
    opts.title ??
    (onlyUnknown
      ? `持有此技能但未標等級的寵物（${byLevel.get('unknown')?.length ?? 0}）`
      : `已知持有此技能的寵物（${holders.length}）`);

  return `
  <table class="info-table skill-pet-holders">
    <tr class="head"><td>${title}</td></tr>
    <tr>
      <td>
${blocks.join('\n')}
      </td>
    </tr>
  </table>`;
}

/**
 * 用專屬寵物 CSV 重寫持有寵物：
 * - 有等級表 → 寵物掛在對應 LV 列
 * - 底部改為分組列表（有等級表時只補「未標等級」）
 */
function injectSkillPetHolders(body: string, skillPageName: string): string {
  const holders = listPetsWithSkill(skillPageName);
  const byLevel = groupPetsByLevel(holders);

  let next = body;
  const hasLevelTable = /class="level-table"/i.test(next);

  if (hasLevelTable) {
    next = next.replace(
      /<table class="level-table"[\s\S]*?<\/table>/i,
      (table) => injectPetsIntoLevelTable(table, byLevel),
    );
  }

  const section = buildGroupedPetSection(holders, byLevel, {
    onlyUnknown: hasLevelTable,
    title: hasLevelTable
      ? undefined
      : `已知持有此技能的寵物（${holders.length}）`,
  });

  // 相容「寵物」「寵物範例」等多種標題與換行
  const holderRe =
    /<table class="info-table"[^>]*>\s*<tr class="head">\s*<td[^>]*>\s*已知持有此技能的寵物[^<]*<\/td>\s*<\/tr>[\s\S]*?<\/table>/i;

  if (holderRe.test(next)) {
    if (section) {
      next = next.replace(holderRe, section.trim());
    } else {
      // 全部已進等級表 → 拿掉底部空區塊
      next = next.replace(holderRe, '');
    }
  } else if (section) {
    if (/<\/div>\s*$/.test(next.trim())) {
      next = next.replace(/<\/div>\s*$/, `${section}\n</div>`);
    } else {
      next += section;
    }
  }

  return next;
}

/** 總覽用迷你寵物 chip（對齊 skills.html 既有 class） */
function renderMiniChip(p: PetSkillHolder): string {
  const href = `/寵物資料/${encodeURIComponent(p.name)}`;
  const src = p.image.startsWith('/') ? p.image : `/${p.image}`;
  return (
    `<a href="${href}" class="pet-mini-chip" title="${escapeHtml(p.skillLabel || p.name)}">` +
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'" />` +
    `<span>${escapeHtml(p.name)}</span></a>`
  );
}

/** 總覽寵物欄：超過 5 隻先顯示 5 隻，其餘折疊 */
const OVERVIEW_PET_PREVIEW = 5;

function renderOverviewPetCell(pets: PetSkillHolder[]): string {
  if (pets.length === 0) {
    return `<span style="color:#9e9e9e;">—</span>`;
  }
  if (pets.length <= OVERVIEW_PET_PREVIEW) {
    return `<div class="pet-mini-wrapper">${pets.map(renderMiniChip).join('')}</div>`;
  }
  const head = pets.slice(0, OVERVIEW_PET_PREVIEW);
  const rest = pets.slice(OVERVIEW_PET_PREVIEW);
  const more = rest.length;
  return (
    `<div class="pet-mini-wrapper pet-mini-wrapper--collapsible">` +
    head.map(renderMiniChip).join('') +
    `<details class="pet-more">` +
    `<summary class="pet-more__toggle"><span class="pet-more__label">還有 ${more} 隻</span></summary>` +
    `<div class="pet-more__body">${rest.map(renderMiniChip).join('')}</div>` +
    `</details>` +
    `</div>`
  );
}

/**
 * 連擊改版：僅 LV11 確認為 4 下 57%；其餘等級效果清空。
 * 只改效果／耗魔欄，不動寵物欄。
 */
function applyLianjiOverviewEffects(tableHtml: string): string {
  return tableHtml.replace(
    /<tr([^>]*)>([\s\S]*?)<\/tr>/gi,
    (full, attrs: string, inner: string) => {
      if (/<th[\s>]/i.test(inner)) return full;
      const lvM = inner.match(/>\s*LV\s*(\d+)\s*</i);
      if (!lvM) return full;
      const lv = Number(lvM[1]);
      const tds = [...inner.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
      // 欄位：等級 | 魔力 | 效果 | (學習?) | 持有寵物
      if (tds.length < 3) return full;

      const mpInner =
        lv === 11
          ? '—'
          : '—';
      const effectInner =
        lv === 11
          ? '4 下攻擊，單次 57%（合計 228%）'
          : '<span style="color:#9e9e9e;">—（改版後待確認）</span>';

      let rebuilt = '';
      let cursor = 0;
      tds.forEach((m, i) => {
        const idx = m.index ?? 0;
        rebuilt += inner.slice(cursor, idx);
        const a = m[1];
        if (i === 1) {
          rebuilt += `<td${a} style="color: #e65100; font-weight: bold;">${mpInner}</td>`;
        } else if (i === 2) {
          rebuilt += `<td${a} style="text-align: left;">${effectInner}</td>`;
        } else {
          rebuilt += m[0];
        }
        cursor = idx + m[0].length;
      });
      rebuilt += inner.slice(cursor);
      return `<tr${attrs}>${rebuilt}</tr>`;
    },
  );
}

/**
 * 技能總覽 skills.html：每個 skill-card 的等級列填入 CSV 持有寵物。
 * 有 CSV 資料才覆寫寵物欄；沒有則保留原 HTML。
 */
function injectSkillsOverview(body: string): string {
  const chunks = body.split(/(?=<div class="skill-card-block\b)/);
  return chunks
    .map((chunk) => {
      if (!chunk.startsWith('<div class="skill-card-block"')) return chunk;

      const nameM = chunk.match(/class="skill-main-name">\s*([^<]+?)\s*</);
      if (!nameM) return chunk;
      const skillName = nameM[1].trim();

      const holders = listPetsWithSkill(skillName);
      const byLevel = groupPetsByLevel(holders);
      const hasCsvPets = holders.length > 0;
      const isLianji = skillName === '連擊';

      if (!hasCsvPets && !isLianji) return chunk;

      return chunk.replace(
        /<table class="level-subtable"[\s\S]*?<\/table>/i,
        (table) => {
          let next = table;
          if (isLianji) next = applyLianjiOverviewEffects(next);
          if (!hasCsvPets) return next;

          return next.replace(
            /<tr([^>]*)>([\s\S]*?)<\/tr>/gi,
            (full, attrs: string, inner: string) => {
              if (/<th[\s>]/i.test(inner)) return full;
              const lvM = inner.match(/>\s*LV\s*(\d+)\s*</i);
              if (!lvM) return full;
              const lv = Number(lvM[1]);
              const pets = byLevel.get(lv) ?? [];
              const cellHtml = renderOverviewPetCell(pets);

              const tds = [...inner.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
              if (!tds.length) return full;
              const last = tds[tds.length - 1];
              const lastIdx = last.index ?? 0;
              const newInner =
                inner.slice(0, lastIdx) +
                `<td class="level-pets" style="text-align:left;">${cellHtml}</td>` +
                inner.slice(lastIdx + last[0].length);
              return `<tr${attrs}>${newInner}</tr>`;
            },
          );
        },
      );
    })
    .join('');
}

/**
 * 讀取 public/資料庫 下的靜態 HTML，抽出 style + body，
 * 並把內部連結改成站內路由（右側內嵌、不跳離站台版面）。
 */
export function loadDbHtml(relPath: string): DbHtml {
  const file = join(process.cwd(), 'public', '資料庫', relPath);
  if (!existsSync(file)) {
    return {
      style: '',
      body: `<p style="padding:1rem;color:#c00;">找不到資料檔：資料庫/${relPath}</p>`,
      scripts: [],
    };
  }

  const raw = readFileSync(file, 'utf8');
  let style = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
  let body = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? raw;

  // 抽出 script：set:html 不會執行，交由 DbEmbed 以 is:inline 重掛
  const scripts: string[] = [];
  body = body.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    (_full, code: string) => {
      const trimmed = String(code ?? '').trim();
      if (trimmed) scripts.push(trimmed);
      return '';
    },
  );

  // 將 body 全域樣式限制在內嵌容器，避免蓋掉站台外殼
  style = style
    .replace(/(^|})\s*body\s*\{/g, '$1 .db-embed {')
    .replace(/(^|})\s*body\s*,/g, '$1 .db-embed,')
    .replace(/html\s*,\s*\.db-embed/g, '.db-embed');

  // 站內已有側欄，拿掉「回首頁」捷徑（避免重複）
  body = body.replace(/<a[^>]*href="\/"[^>]*>\s*🏠[\s\S]*?<\/a>/g, '');
  body = body.replace(
    /<div[^>]*style="margin-bottom:12px;"[^>]*>\s*<\/div>/g,
    '',
  );

  // 連結改走站內路由 → 仍留在右側內容區
  body = body
    .replaceAll('href="/資料庫/skills.html"', 'href="/技能總覽"')
    .replaceAll('href="/資料庫/items.html"', 'href="/道具總覽"')
    .replaceAll('href="/資料庫/quests/index.html"', 'href="/任務攻略"')
    .replace(/href="\/資料庫\/skills\/([^"]+?)\.html"/g, 'href="/技能總覽/$1"')
    .replace(/href="\/資料庫\/pet\/([^"]+?)\.html"/g, 'href="/寵物資料/$1"')
    .replace(/href="\/資料庫\/items\/([^"]+?)\.html"/g, 'href="/道具總覽/$1"')
    .replace(/href="\/資料庫\/quests\/([^"]+?)"/g, 'href="/任務攻略"')
    // 相容舊路徑
    .replaceAll('href="/技能總庫"', 'href="/技能總覽"')
    .replaceAll('href="/道具總庫"', 'href="/道具總覽"')
    .replaceAll('href="/任務總庫"', 'href="/任務攻略"')
    .replace(/href="\/技能總庫\/([^"]+)"/g, 'href="/技能總覽/$1"')
    .replace(/href="\/道具總庫\/([^"]+)"/g, 'href="/道具總覽/$1"');

  body = body.replace(
    /href="\.\.\/skill_list_template\.html"/g,
    'href="/技能總覽"',
  );
  body = body.replace(
    /href="\.\.\/item_list_template\.html"/g,
    'href="/道具總覽"',
  );
  body = body.replace(
    /href="skills\/([^"]+?)\.html"/g,
    'href="/技能總覽/$1"',
  );
  body = body.replace(
    /href="items\/([^"]+?)\.html"/g,
    'href="/道具總覽/$1"',
  );
  body = body.replace(
    /href="(?:\.\.\/)?pet\/([^"]+?)\.html"/g,
    'href="/寵物資料/$1"',
  );
  // 舊模板連結
  body = body.replace(
    /href="\.\.\/pet_page_template\.html"/g,
    'href="/專屬寵物"',
  );

  // 生產製作／採集技能 → 左側配方頁（技能總覽卡與詳情內連結）
  body = rewriteCraftSkillLinks(body, relPath);

  // 圖片路徑：靜態 HTML 曾寫成相對路徑 ../cg-originmood.../public/img → 404
  body = fixAssetPaths(body);
  style = fixAssetPaths(style);

  // 技能總覽：整表 skills.html 依 CSV 補齊各 LV 持有寵物 + 連擊改版效果
  if (relPath === 'skills.html' || relPath.endsWith('/skills.html')) {
    body = injectSkillsOverview(body);
    if (!style.includes('.level-pets')) {
      style += `
    .level-subtable .level-pets { text-align: left !important; vertical-align: middle; max-width: 360px; }
    .level-subtable .pet-mini-wrapper { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .level-subtable .pet-mini-chip {
      display: inline-flex; align-items: center; gap: 3px;
      background: #fff8e1; border: 1px solid #ffe082; border-radius: 3px;
      padding: 2px 6px; text-decoration: none; color: #e65100;
      font-size: 11px; font-weight: 700;
    }
    .level-subtable .pet-mini-chip img {
      width: 20px; height: 20px; object-fit: contain; image-rendering: pixelated;
    }
    .level-subtable .pet-mini-chip:hover { background: #1155cc; color: #fff; border-color: #1155cc; }
    .level-subtable .pet-more { display: contents; }
    .level-subtable .pet-more__toggle {
      display: inline-flex; align-items: center; gap: 2px;
      list-style: none; cursor: pointer; user-select: none;
      margin: 0; padding: 2px 8px;
      font-size: 11px; font-weight: 700;
      color: #1565c0; background: #e3f2fd;
      border: 1px solid #90caf9; border-radius: 3px;
    }
    .level-subtable .pet-more__toggle::-webkit-details-marker { display: none; }
    .level-subtable .pet-more__toggle::marker { content: ''; }
    .level-subtable .pet-more__toggle::after { content: ' ▾'; font-size: 10px; }
    .level-subtable .pet-more[open] > .pet-more__toggle {
      background: #1565c0; color: #fff; border-color: #1565c0;
    }
    .level-subtable .pet-more[open] > .pet-more__toggle::after { content: ' ▴'; }
    .level-subtable .pet-more__body {
      display: flex; flex-wrap: wrap; gap: 4px;
      flex-basis: 100%; width: 100%; margin-top: 4px;
    }
`;
    }
  }

  // 技能詳情：寵物掛到對應等級（不改既有效果文字，連擊詳情頁另有靜態更新）
  const skillMatch = relPath.match(/^skills\/(.+)\.html$/);
  if (skillMatch) {
    const skillName = skillMatch[1];
    body = injectSkillPetHolders(body, skillName);
    if (!style.includes('.pet-level-group')) {
      style += `
    .pet-chip-wrapper { display: flex; flex-wrap: wrap; gap: 8px; }
    .pet-chip-wrapper--compact { gap: 6px; justify-content: flex-start; }
    .pet-skill-chip img { width: 28px; height: 28px; object-fit: contain; margin-right: 6px; image-rendering: pixelated; }
    .pet-skill-lv { margin-left: 4px; font-size: 10px; font-weight: 600; color: #5f6368; }
    .level-pets { text-align: left !important; min-width: 140px; max-width: 420px; vertical-align: middle; }
    .level-pets--empty { color: #9e9e9e; text-align: center !important; }
    .pet-level-group { margin-bottom: 12px; }
    .pet-level-group:last-child { margin-bottom: 0; }
    .pet-level-group__title {
      font-weight: 700; font-size: 13px; color: #1565c0;
      margin-bottom: 6px; padding-bottom: 4px;
      border-bottom: 1px solid #e3f2fd;
    }
    .pet-level-group__count { font-weight: 600; color: #5f6368; margin-left: 4px; }
    .level-table .pet-skill-chip { font-size: 11px; padding: 3px 8px; }
    .level-table .pet-skill-chip img { width: 22px; height: 22px; }
`;
    }
  }

  return { style, body, scripts };
}

export function dbFileExists(relPath: string): boolean {
  return existsSync(join(process.cwd(), 'public', '資料庫', relPath));
}
