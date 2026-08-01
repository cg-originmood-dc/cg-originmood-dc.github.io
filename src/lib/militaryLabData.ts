/**
 * 軍方研究所配方（由 content/pages/任務攻略/常態活動/軍方研究所.md 一次解析寫入）
 * 勿在 runtime 重讀 MD；若攻略更新請再跑一次解析覆寫本檔。
 *
 * product / basePet 請盡量用專屬寵物正式名；異名寫在 MILITARY_PRODUCT_ALIASES。
 */
export interface MilitaryLabRecipe {
  /** 1 = 洛伊克一改；2 = 拉拉克二改 */
  tier: 1 | 2;
  product: string;
  basePet: string;
  materials: Array<{ name: string; qty: number }>;
  npc: string;
}

/** 站內攻略路徑（BASE_URL 之後） */
export const MILITARY_LAB_PAGE = '/任務攻略/常態活動/軍方研究所';

/**
 * 攻略／舊稱 → 專屬寵物.csv 正式名。
 * 解析 MD 或手寫樹用到異名時一律經此表對齊，避免合成樹對不到寵物頁。
 */
export const MILITARY_PRODUCT_ALIASES: Record<string, string> = {
  赤焰黃蜂: '赤炎黃蜂',
};

export const MILITARY_LAB_RECIPES: MilitaryLabRecipe[] = [
  {
    "tier": 1,
    "product": "變異龍祖",
    "basePet": "大地翼龍",
    "materials": [
      {
        "name": "惡龍顱骨",
        "qty": 1
      },
      {
        "name": "惡龍巨翼",
        "qty": 1
      },
      {
        "name": "惡龍之尾",
        "qty": 1
      },
      {
        "name": "暗黑基因",
        "qty": 1
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "粉紅炸彈",
    "basePet": "大炸彈",
    "materials": [
      {
        "name": "粉紅之心",
        "qty": 1
      },
      {
        "name": "粉紅礦石",
        "qty": 1
      },
      {
        "name": "粉紅火藥",
        "qty": 1
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "雷獸",
    "basePet": "地獄妖犬",
    "materials": [
      {
        "name": "雷霆之力",
        "qty": 5
      },
      {
        "name": "雷獸獨角",
        "qty": 20
      },
      {
        "name": "雷獸犬牙",
        "qty": 50
      },
      {
        "name": "雷獸力爪",
        "qty": 75
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "劇毒螃蟹",
    "basePet": "黃金螃蟹",
    "materials": [
      {
        "name": "劇毒心臟",
        "qty": 3
      },
      {
        "name": "劇毒之魂",
        "qty": 25
      },
      {
        "name": "劇毒精華",
        "qty": 50
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "懷舊樹精",
    "basePet": "樹精",
    "materials": [
      {
        "name": "懷舊樹精的種子",
        "qty": 3
      },
      {
        "name": "變異木樁",
        "qty": 10
      },
      {
        "name": "變異土壤",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    // 攻略原文寫「赤焰黃蜂」，專屬寵物表正式名為「赤炎黃蜂」
    "product": "赤炎黃蜂",
    "basePet": "黃蜂",
    "materials": [
      {
        "name": "赤炎內丹",
        "qty": 3
      },
      {
        "name": "變異蜂蜜",
        "qty": 10
      },
      {
        "name": "黃蜂尾針",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "純白液態史萊姆",
    "basePet": "液態史萊姆",
    "materials": [
      {
        "name": "液態史萊姆之魂",
        "qty": 3
      },
      {
        "name": "液態史萊姆組織",
        "qty": 10
      },
      {
        "name": "史萊姆漂白劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "櫻花螳螂",
    "basePet": "螳螂",
    "materials": [
      {
        "name": "螳螂卵",
        "qty": 3
      },
      {
        "name": "變異營養液",
        "qty": 10
      },
      {
        "name": "櫻花枝",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "黃金鼠王",
    "basePet": "鼠王",
    "materials": [
      {
        "name": "鼠王金像",
        "qty": 3
      },
      {
        "name": "鼠王琥珀",
        "qty": 10
      },
      {
        "name": "鼠王化石",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "小白龍",
    "basePet": "迷你龍",
    "materials": [
      {
        "name": "變異龍珠",
        "qty": 3
      },
      {
        "name": "迷你龍娃娃",
        "qty": 10
      },
      {
        "name": "純白藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "祥雲寶寶",
    "basePet": "煙羅",
    "materials": [
      {
        "name": "祥雲之淚",
        "qty": 3
      },
      {
        "name": "雲霧收集瓶",
        "qty": 10
      },
      {
        "name": "祥雲塊",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "萬年龜",
    "basePet": "海底龜",
    "materials": [
      {
        "name": "紫甲基因",
        "qty": 3
      },
      {
        "name": "萬年龜角",
        "qty": 10
      },
      {
        "name": "變異的海底龜龜殼",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "金甲蟲",
    "basePet": "堀地蟲",
    "materials": [
      {
        "name": "金甲基因",
        "qty": 3
      },
      {
        "name": "黃金之角",
        "qty": 5
      },
      {
        "name": "變異的堀地蟲甲殼",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "暗黑水龍蜥",
    "basePet": "水龍蜥",
    "materials": [
      {
        "name": "蜥蜴封印卡",
        "qty": 3
      },
      {
        "name": "變異催化劑",
        "qty": 10
      },
      {
        "name": "暗黑龍鱗",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "紫翎",
    "basePet": "天馬",
    "materials": [
      {
        "name": "紫魄",
        "qty": 3
      },
      {
        "name": "潔白之花",
        "qty": 10
      },
      {
        "name": "天馬羽毛",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "屠龍鬥士",
    "basePet": "大型半獸人",
    "materials": [
      {
        "name": "龍血",
        "qty": 3
      },
      {
        "name": "屠龍殘刀",
        "qty": 10
      },
      {
        "name": "黑化基因",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "斧頭幫千軍",
    "basePet": "紅帽哥布林",
    "materials": [
      {
        "name": "勇氣之斧",
        "qty": 3
      },
      {
        "name": "勇氣之帽",
        "qty": 10
      },
      {
        "name": "勇氣之酒",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "斧頭幫萬馬",
    "basePet": "海盜",
    "materials": [
      {
        "name": "義氣之斧",
        "qty": 3
      },
      {
        "name": "義氣之帽",
        "qty": 10
      },
      {
        "name": "義氣枷鎖",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "幽紫妖靈",
    "basePet": "幽靈",
    "materials": [
      {
        "name": "紅色幽靈鏡",
        "qty": 3
      },
      {
        "name": "幽靈之心",
        "qty": 10
      },
      {
        "name": "幽靈香",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "血腥魔刃",
    "basePet": "血腥之刃",
    "materials": [
      {
        "name": "魔劍碎片",
        "qty": 3
      },
      {
        "name": "魔劍能量石",
        "qty": 10
      },
      {
        "name": "魔劍魂水",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "魔化佛利波羅",
    "basePet": "佛利波羅",
    "materials": [
      {
        "name": "佛利波羅的野心",
        "qty": 3
      },
      {
        "name": "逆神之志",
        "qty": 10
      },
      {
        "name": "變異能量精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "狂魔阿卡斯",
    "basePet": "阿卡斯",
    "materials": [
      {
        "name": "阿卡斯的狂妄",
        "qty": 3
      },
      {
        "name": "逆神之志",
        "qty": 10
      },
      {
        "name": "變異能量精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "邪神巴洛斯",
    "basePet": "巴洛斯",
    "materials": [
      {
        "name": "巴洛斯的邪惡",
        "qty": 3
      },
      {
        "name": "逆神之志",
        "qty": 10
      },
      {
        "name": "變異能量精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "軍王李貝留斯",
    "basePet": "李貝留斯",
    "materials": [
      {
        "name": "李貝留斯的誓願",
        "qty": 3
      },
      {
        "name": "逆神之志",
        "qty": 10
      },
      {
        "name": "變異能量精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "兔耳精靈箱",
    "basePet": "兔耳嚇人箱",
    "materials": [
      {
        "name": "兔耳精靈結晶",
        "qty": 3
      },
      {
        "name": "嚇人箱碎片",
        "qty": 10
      },
      {
        "name": "精靈箱藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "嚇人精靈箱",
    "basePet": "嚇人箱",
    "materials": [
      {
        "name": "嚇人精靈結晶",
        "qty": 3
      },
      {
        "name": "嚇人箱碎片",
        "qty": 10
      },
      {
        "name": "精靈箱藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "綠蛙精靈箱",
    "basePet": "綠蛙嚇人箱",
    "materials": [
      {
        "name": "綠蛙精靈結晶",
        "qty": 3
      },
      {
        "name": "嚇人箱碎片",
        "qty": 10
      },
      {
        "name": "精靈箱藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "純白精靈箱",
    "basePet": "純白嚇人箱",
    "materials": [
      {
        "name": "純白精靈結晶",
        "qty": 3
      },
      {
        "name": "嚇人箱碎片",
        "qty": 10
      },
      {
        "name": "精靈箱藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "藍魔精靈箱",
    "basePet": "藍魔嚇人箱",
    "materials": [
      {
        "name": "藍魔精靈結晶",
        "qty": 3
      },
      {
        "name": "嚇人箱碎片",
        "qty": 10
      },
      {
        "name": "精靈箱藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "紅魔精靈箱",
    "basePet": "紅魔嚇人箱",
    "materials": [
      {
        "name": "紅魔精靈結晶",
        "qty": 3
      },
      {
        "name": "嚇人箱碎片",
        "qty": 10
      },
      {
        "name": "精靈箱藥劑",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "暗影鳥人",
    "basePet": "黑暗鳥人",
    "materials": [
      {
        "name": "暗影枷鎖",
        "qty": 3
      },
      {
        "name": "暗影魔晶",
        "qty": 10
      },
      {
        "name": "暗影血液",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "光精靈",
    "basePet": "風精",
    "materials": [
      {
        "name": "風精之心",
        "qty": 3
      },
      {
        "name": "元素石",
        "qty": 10
      },
      {
        "name": "元素精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "冰精靈",
    "basePet": "水精",
    "materials": [
      {
        "name": "水精之心",
        "qty": 3
      },
      {
        "name": "元素石",
        "qty": 10
      },
      {
        "name": "元素精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "炎精靈",
    "basePet": "火精",
    "materials": [
      {
        "name": "火精之心",
        "qty": 3
      },
      {
        "name": "元素石",
        "qty": 10
      },
      {
        "name": "元素精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 1,
    "product": "木精靈",
    "basePet": "地精",
    "materials": [
      {
        "name": "地精之心",
        "qty": 3
      },
      {
        "name": "元素石",
        "qty": 10
      },
      {
        "name": "元素精華",
        "qty": 30
      }
    ],
    "npc": "洛伊克博士 (6.6)"
  },
  {
    "tier": 2,
    "product": "暗裔龍祖",
    "basePet": "變異龍祖",
    "materials": [
      {
        "name": "龍祖的鱗片",
        "qty": 3
      },
      {
        "name": "龍祖的血",
        "qty": 10
      },
      {
        "name": "龍祖的祈福",
        "qty": 30
      }
    ],
    "npc": "拉拉克博士 (8.4)"
  },
  {
    "tier": 2,
    "product": "甜心炸彈",
    "basePet": "粉紅炸彈",
    "materials": [
      {
        "name": "炸彈基因",
        "qty": 3
      },
      {
        "name": "甜心元素",
        "qty": 10
      },
      {
        "name": "炸彈魔核",
        "qty": 30
      }
    ],
    "npc": "拉拉克博士 (8.4)"
  },
  {
    "tier": 2,
    "product": "雷霆幻獸",
    "basePet": "雷獸",
    "materials": [
      {
        "name": "雷霆之花",
        "qty": 3
      },
      {
        "name": "雷霆魔石",
        "qty": 10
      },
      {
        "name": "雷霆藥劑",
        "qty": 30
      }
    ],
    "npc": "拉拉克博士 (8.4)"
  },
  {
    "tier": 2,
    "product": "蟲毒魔蟹",
    "basePet": "劇毒螃蟹",
    "materials": [
      {
        "name": "致死魔毒",
        "qty": 3
      },
      {
        "name": "絕命花",
        "qty": 10
      },
      {
        "name": "龍毒香",
        "qty": 30
      }
    ],
    "npc": "拉拉克博士 (8.4)"
  }
];
