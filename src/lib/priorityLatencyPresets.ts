// Post-TLS HTTP response budgets for access from mainland China, not ICMP RTTs.
// US West was checked against local history; other regions remain provisional.
// Design evidence: docs/LATENCY-PRESETS-2026-10-20.zh-CN.md in the desktop repo.
// Match explicit region/city labels only; unknown or mixed regions stay opt-in.
export const PRIORITY_LATENCY_PRESETS = [
  { id: "cn", label: "Mainland China", ceilingMs: 200 },
  { id: "hk", label: "Hong Kong / Macau", ceilingMs: 200 },
  { id: "tw", label: "Taiwan", ceilingMs: 250 },
  { id: "jp", label: "Japan / South Korea", ceilingMs: 300 },
  { id: "sg", label: "Singapore", ceilingMs: 300 },
  { id: "sea", label: "Southeast Asia", ceilingMs: 350 },
  { id: "in", label: "South Asia", ceilingMs: 450 },
  { id: "us-west", label: "US West", ceilingMs: 450 },
  { id: "us-central", label: "US Central", ceilingMs: 550 },
  { id: "us-east", label: "US East", ceilingMs: 550 },
  { id: "ca", label: "Canada", ceilingMs: 600 },
  { id: "eu", label: "Europe", ceilingMs: 600 },
  { id: "me", label: "Middle East", ceilingMs: 650 },
  { id: "au", label: "Australia / New Zealand", ceilingMs: 500 },
  { id: "sa", label: "Latin America", ceilingMs: 800 },
  { id: "af", label: "Africa", ceilingMs: 700 },
  { id: "us", label: "US (unspecified coast)", ceilingMs: 600 },
] as const;

type PresetId = typeof PRIORITY_LATENCY_PRESETS[number]["id"];
const terms: Record<Exclude<PresetId, "us">, RegExp> = {
  cn: /\b(?:CN|CHINA|BEIJING|SHANGHAI|GUANGZHOU|SHENZHEN)\b|中国大陆|大陆|北京|上海|广州|深圳/u,
  hk: /\b(?:HK|HKG|HONG[ -]?KONG|MO|MACAU|MACAO)\b|香港|澳门/u,
  tw: /\b(?:TW|TWN|TPE|TAIWAN|TAIPEI)\b|台湾|台北/u,
  jp: /\b(?:JP|JPN|JAPAN|TOKYO|OSAKA|NRT|HND|KIX|KR|KOR|KOREA|SEOUL|ICN)\b|日本|东京|大阪|韩国|首尔/u,
  sg: /\b(?:SG|SGP|SIN|SINGAPORE)\b|新加坡|狮城/u,
  sea: /\b(?:SOUTHEAST[ -]?ASIA|MY|MALAYSIA|TH|THAILAND|VN|VIETNAM|PH|PHILIPPINES|ID|INDONESIA)\b|东南亚|马来西亚|泰国|越南|菲律宾|印度尼西亚/u,
  in: /\b(?:SOUTH[ -]?ASIA|INDIA|MUMBAI|DELHI|BANGLADESH|PAKISTAN)\b|南亚|印度|孟买|新德里|孟加拉|巴基斯坦/u,
  "us-west": /\b(?:US[ -]?WEST|USA[ -]?WEST|USW|LAX|SFO|SJC|LOS[ -]?ANGELES|SAN[ -]?FRANCISCO|SAN[ -]?JOSE|SEATTLE)\b|美西|美国西部|洛杉矶|旧金山|圣何塞|西雅图/u,
  "us-central": /\b(?:US[ -]?CENTRAL|USA[ -]?CENTRAL|USC|DALLAS|CHICAGO|DFW|ORD)\b|美中|美国中部|达拉斯|芝加哥/u,
  "us-east": /\b(?:US[ -]?EAST|USA[ -]?EAST|USE|NEW[ -]?YORK|ASHBURN|MIAMI|NYC|IAD)\b|美东|美国东部|纽约|阿什本|迈阿密/u,
  ca: /\b(?:CANADA|CAN|TORONTO|VANCOUVER|MONTREAL|YYZ|YVR)\b|加拿大|多伦多|温哥华|蒙特利尔/u,
  eu: /\b(?:EU|EUROPE|EUROPEAN|UK|GB|GBR|LONDON|DE|GERMANY|FRANKFURT|FRA|FR|FRANCE|PARIS|NL|NETHERLANDS|AMSTERDAM|SWEDEN|FINLAND|SWITZERLAND|ITALY|SPAIN|POLAND)\b|欧洲|英国|伦敦|德国|法兰克福|法国|巴黎|荷兰|阿姆斯特丹|瑞典|芬兰|瑞士|意大利|西班牙|波兰/u,
  me: /\b(?:MIDDLE[ -]?EAST|UAE|DUBAI|ISRAEL|SAUDI|TURKEY|ISTANBUL)\b|中东|阿联酋|迪拜|以色列|沙特|土耳其|伊斯坦布尔/u,
  au: /\b(?:AU|AUS|AUSTRALIA|SYDNEY|MELBOURNE|NZ|NZL|NEW[ -]?ZEALAND|AUCKLAND)\b|澳大利亚|澳洲|悉尼|墨尔本|新西兰|奥克兰/u,
  sa: /\b(?:LATIN[ -]?AMERICA|SOUTH[ -]?AMERICA|BRAZIL|BR|SAO[ -]?PAULO|CHILE|ARGENTINA|MEXICO|MX)\b|拉美|南美|巴西|圣保罗|智利|阿根廷|墨西哥/u,
  af: /\b(?:AFRICA|AFRICAN|SOUTH[ -]?AFRICA|ZA|JOHANNESBURG|EGYPT|NIGERIA|KENYA)\b|非洲|南非|约翰内斯堡|埃及|尼日利亚|肯尼亚/u,
};

export function priorityLatencyPreset(group: string) {
  // Underscores are common separators in selector names, not word characters.
  const name = group.toUpperCase().replaceAll("_", " ");
  const matches = PRIORITY_LATENCY_PRESETS.filter(preset => preset.id !== "us" && terms[preset.id].test(name));
  const us = /\b(?:US|USA|UNITED[ -]?STATES)\b|美国/u.test(name);
  if (matches.length > 1 || us && matches.length === 1 && !matches[0].id.startsWith("us-")) return null;
  return matches[0] ?? (us ? PRIORITY_LATENCY_PRESETS.find(preset => preset.id === "us")! : null);
}

export function priorityLatencyCeiling(group: string, overrides: Record<string, number>): number | undefined {
  const value = Object.hasOwn(overrides, group) ? overrides[group] : priorityLatencyPreset(group)?.ceilingMs;
  return value && Number.isFinite(value) && value >= 100 ? value : undefined;
}

/** Complete proxy + TLS + HTTP budget, distinct from the response-phase limit. */
export function priorityTotalLatencyCeiling(responseCeiling: number): number {
  return Math.max(1_500, responseCeiling * 4);
}
