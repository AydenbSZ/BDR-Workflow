import type { Persona } from "@/generated/prisma/enums";

const PERSONA_PATTERNS: Array<{ persona: Persona; patterns: RegExp[] }> = [
  {
    persona: "DIRECTOR_OF_FRANCHISE_DEVELOPMENT",
    patterns: [
      /director.*franchise/i,
      /franchise.*development/i,
      /vp.*franchise/i,
      /head.*franchise/i,
      /franchise.*director/i,
      /franchise.*growth/i,
    ],
  },
  {
    persona: "DIRECTOR_OF_REAL_ESTATE",
    patterns: [
      /director.*real\s*estate/i,
      /vp.*real\s*estate/i,
      /head.*real\s*estate/i,
      /real\s*estate.*director/i,
      /real\s*estate.*manager/i,
      /svp.*real\s*estate/i,
      /site\s*selection/i,
    ],
  },
  {
    persona: "CHIEF_DEVELOPMENT_OFFICER",
    patterns: [
      /chief\s*development/i,
      /\bcdo\b/i,
      /vp.*(?<!franchise\s)development/i,
      /svp.*(?<!franchise\s)development/i,
      /head.*(?<!franchise\s)development/i,
      /chief.*growth/i,
    ],
  },
];

export function classifyPersona(title: string | null | undefined): Persona {
  if (!title) return "OTHER";

  for (const { persona, patterns } of PERSONA_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(title)) return persona;
    }
  }

  return "OTHER";
}

export const PERSONA_DISPLAY_NAMES: Record<Persona, string> = {
  CHIEF_DEVELOPMENT_OFFICER: "Chief Development Officer",
  DIRECTOR_OF_REAL_ESTATE: "Director of Real Estate",
  DIRECTOR_OF_FRANCHISE_DEVELOPMENT: "Director of Franchise Development",
  OTHER: "Other / Unknown",
};

export const PERSONA_OPTIONS = [
  "CHIEF_DEVELOPMENT_OFFICER",
  "DIRECTOR_OF_REAL_ESTATE",
  "DIRECTOR_OF_FRANCHISE_DEVELOPMENT",
] as const;
