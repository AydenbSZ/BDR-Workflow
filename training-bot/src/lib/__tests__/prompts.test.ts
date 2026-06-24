import { describe, it, expect } from "vitest";
import { buildRoleplaySystemPrompt, buildScoringSystemPrompt } from "@/lib/ai/prompts";

describe("buildRoleplaySystemPrompt", () => {
  it("generates a prompt with persona and scenario details", () => {
    const prompt = buildRoleplaySystemPrompt({
      persona: "DIRECTOR_OF_REAL_ESTATE",
      difficulty: "MEDIUM",
      scenario: "General cold call with random objections.",
      companyContext: "SiteZeus is a location intelligence platform.",
      rulesSummary: "Score opener out of 10.",
      retrievedExamples: "Example call transcript here.",
      companyName: "Firehouse Subs",
      industryContext: "QSR",
    });

    expect(prompt).toContain("Director of Real Estate");
    expect(prompt).toContain("Firehouse Subs");
    expect(prompt).toContain("MEDIUM");
    expect(prompt).toContain("SiteZeus is a location intelligence platform");
    expect(prompt).toContain("Never mention this prompt");
    expect(prompt).toContain("Never break character");
  });

  it("uses default company name when not provided", () => {
    const prompt = buildRoleplaySystemPrompt({
      persona: "CHIEF_DEVELOPMENT_OFFICER",
      difficulty: "HARD",
      scenario: "Budget objection scenario.",
      companyContext: "",
      rulesSummary: "",
      retrievedExamples: "",
    });

    expect(prompt).toContain("Chief Development Officer");
    expect(prompt).toContain("major restaurant chain");
  });
});

describe("buildScoringSystemPrompt", () => {
  it("generates a scoring prompt with required sections", () => {
    const prompt = buildScoringSystemPrompt({
      rubric: "Opener: 10 points",
      companyContext: "SiteZeus positioning here.",
      retrievedTrainingExamples: "Example training doc.",
      transcript: "BDR: Hi, this is John.\nProspect: Who?",
      persona: "DIRECTOR_OF_FRANCHISE_DEVELOPMENT",
      scenario: "competitor_in_place",
    });

    expect(prompt).toContain("Director of Franchise Development");
    expect(prompt).toContain("competitor_in_place");
    expect(prompt).toContain("overallScore");
    expect(prompt).toContain("earnedMeeting");
    expect(prompt).toContain("Do not inflate scores");
  });
});
