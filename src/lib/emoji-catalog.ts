import { parseEmojiRows, type EmojiEntry } from "./emoji-search";

/** Hand-picked starter sets (the original picker), shown together as the "Quick" tab. */
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

/** Every curated glyph once, in curated order: the picker's default "Quick" tab. */
export const QUICK_PICKS: string[] = [...new Set(EMOJI_GROUPS.flatMap((g) => g.glyphs))];

let library: Promise<EmojiEntry[]> | null = null;

/**
 * The full Unicode library (~1,900 emoji, ~18 KB gzipped) lives in its own
 * chunk and loads the first time a picker opens.
 */
export function loadEmojiLibrary(): Promise<EmojiEntry[]> {
  library ??= import("./emoji-data").then((m) => parseEmojiRows(m.EMOJI_ROWS)).catch((err) => {
    library = null;
    throw err;
  });
  return library;
}
