export type EmojiGroup = {
  id: string;
  label: string;
  glyphs: string[];
};

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "mind",
    label: "Mind",
    glyphs: ["🧠", "💭", "💡", "🔮", "🎯", "🧩", "🪞", "🌀", "⚡", "✨", "🌟", "🪐", "🪄", "🧿", "🧘", "🕯️"],
  },
  {
    id: "people",
    label: "People",
    glyphs: ["😀", "🙂", "😎", "🤔", "😴", "🤩", "😇", "🧑", "👩", "👨", "🧒", "👶", "🧓", "🤝", "🫂", "💬", "🗣️", "👀"],
  },
  {
    id: "work",
    label: "Work",
    glyphs: ["💼", "💻", "📊", "📈", "📉", "📁", "🗂️", "📌", "📎", "📝", "📅", "🗓️", "☎️", "📧", "🏢", "🏦", "🏗️", "🧑‍💼"],
  },
  {
    id: "money",
    label: "Money",
    glyphs: ["💰", "💵", "💴", "💶", "💷", "💳", "🏦", "💎", "🪙", "📉", "📈", "🧾", "🏠", "🔑", "📜"],
  },
  {
    id: "health",
    label: "Health",
    glyphs: ["❤️", "💪", "🧘", "🏃", "🚴", "🥗", "🍎", "💊", "🩺", "🧬", "🦷", "🧠", "😴", "🧊", "☀️"],
  },
  {
    id: "sport",
    label: "Sport",
    glyphs: ["⛳", "🏌️", "⚽️", "🏀", "🏈", "⚾️", "🎾", "🏐", "🏉", "🥏", "🎳", "🥊", "🥋", "🏊", "🏄", "⛷️", "🏂", "🏆"],
  },
  {
    id: "travel",
    label: "Travel",
    glyphs: ["✈️", "🌍", "🌎", "🌏", "🗺️", "🧳", "🧭", "🏔️", "🏖️", "🏝️", "🏕️", "🗼", "🗽", "🚗", "🚆", "🚢", "🚁"],
  },
  {
    id: "home",
    label: "Home",
    glyphs: ["🏠", "🏡", "👨‍👩‍👧", "🐕", "🐈", "🪴", "🍳", "🛋️", "🛏️", "🧹", "🛠️", "🔧", "🪵", "🚪", "🔑"],
  },
  {
    id: "nature",
    label: "Nature",
    glyphs: ["🌿", "🌳", "🌲", "🌸", "🌺", "🌻", "🍀", "🌊", "🔥", "❄️", "🌈", "🌙", "⭐", "☀️", "☁️", "🌧️"],
  },
  {
    id: "food",
    label: "Food",
    glyphs: ["☕️", "🍵", "🥐", "🍞", "🧀", "🍕", "🍔", "🍣", "🥗", "🍎", "🫐", "🍫", "🍯", "🍷", "🍺"],
  },
  {
    id: "learn",
    label: "Learn",
    glyphs: ["📚", "📖", "✏️", "🎓", "🔬", "🔭", "🧪", "🧮", "🎨", "🎬", "🎵", "🎹", "🎧", "📰", "🖋️"],
  },
  {
    id: "symbols",
    label: "Marks",
    glyphs: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "✅", "❌", "⚠️", "❓", "❗", "➡️", "⭐", "🔥", "💎", "🛡️"],
  },
  {
    id: "time",
    label: "Time",
    glyphs: ["⏰", "📅", "⏳", "⌛", "🕒", "🌙", "☀️", "🌅", "🌇", "🌌", "🔁", "📌", "🎉", "🎂"],
  },
  {
    id: "life",
    label: "Life",
    glyphs: ["🐶", "🐱", "🦁", "🐯", "🦊", "🐼", "🐨", "🐸", "🦋", "🐝", "🐢", "🐬", "🐳", "🦅", "🌸"],
  },
];

export const ALL_EMOJI = EMOJI_GROUPS.flatMap((g) => g.glyphs);

const KEYWORDS: Record<string, string[]> = {
  golf: ["⛳", "🏌️"],
  house: ["🏠", "🏡"],
  home: ["🏠", "🏡", "🔑"],
  money: ["💰", "💵", "💳"],
  work: ["💼", "💻", "📊"],
  family: ["👨‍👩‍👧", "🫂", "🏠"],
  health: ["❤️", "💪", "🧘"],
  idea: ["💡", "✨", "🧠"],
  travel: ["✈️", "🧳", "🗺️"],
  love: ["❤️", "💛", "🫂"],
};

export function searchEmoji(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_EMOJI;
  const hits = new Set<string>();
  for (const [word, glyphs] of Object.entries(KEYWORDS)) {
    if (word.includes(q) || q.includes(word)) {
      for (const g of glyphs) hits.add(g);
    }
  }
  for (const group of EMOJI_GROUPS) {
    if (group.label.toLowerCase().includes(q) || group.id.includes(q)) {
      for (const g of group.glyphs) hits.add(g);
    }
  }
  return hits.size ? [...hits] : ALL_EMOJI;
}
