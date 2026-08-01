/**
 * 生產製作／採集技能 → 左側導覽對應頁
 * 技能總覽「專屬詳情」改連配方表，而不是空的技能等級頁。
 */
export const CRAFT_SKILL_HREF: Record<string, string> = {
  鑄劍: '/生產製造/武器/劍',
  造槍: '/生產製造/武器/槍',
  造斧: '/生產製造/武器/斧',
  造杖: '/生產製造/武器/杖',
  造弓: '/生產製造/武器/弓',
  造小刀: '/生產製造/武器/小刀',
  造投擲武器: '/生產製造/武器/投擲武器',
  造頭盔: '/生產製造/防具/頭盔',
  造帽子: '/生產製造/防具/帽子',
  造鎧甲: '/生產製造/防具/鎧甲',
  製衣服: '/生產製造/防具/衣服',
  造長袍: '/生產製造/防具/長袍',
  造靴子: '/生產製造/防具/靴子',
  造鞋子: '/生產製造/防具/鞋子',
  造盾: '/生產製造/防具/盾牌',
  料理: '/生產製造/料理',
  製藥: '/生產製造/藥水',
  伐木: '/採集/伐木',
  狩獵: '/採集/狩獵',
  挖掘: '/採集/挖掘',
};

export function craftSkillHref(skillName: string): string | null {
  return CRAFT_SKILL_HREF[skillName.trim()] ?? null;
}

/** 是否為有站內配方頁的生產／採集技能 */
export function isMappedCraftSkill(skillName: string): boolean {
  return skillName.trim() in CRAFT_SKILL_HREF;
}
