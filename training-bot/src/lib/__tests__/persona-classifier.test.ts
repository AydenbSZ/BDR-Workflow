import { describe, it, expect } from "vitest";
import { classifyPersona } from "@/lib/persona-classifier";

describe("classifyPersona", () => {
  it("classifies Chief Development Officer titles", () => {
    expect(classifyPersona("Chief Development Officer")).toBe("CHIEF_DEVELOPMENT_OFFICER");
    expect(classifyPersona("CDO")).toBe("CHIEF_DEVELOPMENT_OFFICER");
    expect(classifyPersona("VP of Development")).toBe("CHIEF_DEVELOPMENT_OFFICER");
    expect(classifyPersona("SVP, Development")).toBe("CHIEF_DEVELOPMENT_OFFICER");
    expect(classifyPersona("Head of Development")).toBe("CHIEF_DEVELOPMENT_OFFICER");
  });

  it("classifies Director of Real Estate titles", () => {
    expect(classifyPersona("Director of Real Estate")).toBe("DIRECTOR_OF_REAL_ESTATE");
    expect(classifyPersona("VP Real Estate")).toBe("DIRECTOR_OF_REAL_ESTATE");
    expect(classifyPersona("Head of Real Estate")).toBe("DIRECTOR_OF_REAL_ESTATE");
    expect(classifyPersona("Real Estate Director")).toBe("DIRECTOR_OF_REAL_ESTATE");
    expect(classifyPersona("Site Selection Manager")).toBe("DIRECTOR_OF_REAL_ESTATE");
  });

  it("classifies Director of Franchise Development titles", () => {
    expect(classifyPersona("Director of Franchise Development")).toBe("DIRECTOR_OF_FRANCHISE_DEVELOPMENT");
    expect(classifyPersona("VP Franchise Development")).toBe("DIRECTOR_OF_FRANCHISE_DEVELOPMENT");
    expect(classifyPersona("Head of Franchise")).toBe("DIRECTOR_OF_FRANCHISE_DEVELOPMENT");
    expect(classifyPersona("Franchise Growth Director")).toBe("DIRECTOR_OF_FRANCHISE_DEVELOPMENT");
  });

  it("returns OTHER for unrecognized titles", () => {
    expect(classifyPersona("CEO")).toBe("OTHER");
    expect(classifyPersona("Marketing Manager")).toBe("OTHER");
    expect(classifyPersona("Software Engineer")).toBe("OTHER");
    expect(classifyPersona(null)).toBe("OTHER");
    expect(classifyPersona(undefined)).toBe("OTHER");
    expect(classifyPersona("")).toBe("OTHER");
  });

  it("is case-insensitive", () => {
    expect(classifyPersona("director of real estate")).toBe("DIRECTOR_OF_REAL_ESTATE");
    expect(classifyPersona("CHIEF DEVELOPMENT OFFICER")).toBe("CHIEF_DEVELOPMENT_OFFICER");
  });
});
