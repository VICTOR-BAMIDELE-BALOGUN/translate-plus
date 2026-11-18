export type Phrase = { it: string; en: string; say: string; formal?: boolean };
export type Topic = { id: string; title: string; note?: string; phrases: Phrase[] };
export type Sound = { it: string; say: string; example: string };
export type Note = { title: string; body: string };
export type Resource = { name: string; what: string; cost: string; url: string };

export type LearnPack = {
  lang: string;
  name: string;
  intro: string;
  sounds: Sound[];
  notes: Note[];
  topics: Topic[];
  resources: Resource[];
};
